// 농장. 강화와 같은 자리에 있는 파일이다 — req도 res도 모르고, 상태 코드는
// 붙여서 던지기만 한다.
//
// 규칙의 근거는 docs/design-backlog.md의 "Farm" 절에 있다. 코드 모양을 정하는 것:
//   - 심기와 거두기는 둘 다 칸 단위이고 둘 다 멱등하지 않다. 찬 칸에 심는 것과
//     빈 칸을 거두는 것은 둘 다 거절이며, 강화가 쓰는 409와 같은 경계다.
//   - 자란 정도는 저장하지 않는다. player_plot이 "언제 심었나"를 갖고
//     crop_template이 "얼마나 걸리나"를 가지므로, 둘을 더하면 언제든 계산된다.

import pool from '../db/pool.js';
import { serviceError } from './errors.js';
import { spendStack, gainStack } from './stack.js';
import { TIME_SCALE } from '../config.js';

// 한 번 심을 때 씨앗 한 개를 쓴다. 표로 뺄 수도 있었지만 작물마다 다를 이유가
// 아직 없어서 코드 상수로 둔다 — 씨앗 반환 확률을 코드에 둔 것과 같은 기준이다.
const SEED_PER_PLANT = 1;

// 빈 칸 하나에 씨앗을 심는다. 칸이 차 있거나 씨앗이 모자라면 아무것도 바꾸지
// 않고 throw한다.
//
// seedStackTemplateId를 인자로 받지 않는 이유: 어느 씨앗이 들어가는지는
// crop_template이 정한다. 클라이언트가 보내게 하면 "감자 씨앗을 태워 밀을
// 심는" 요청이 만들어지고, 그건 장착에서 슬롯을 서버가 읽기로 한 것과 같은
// 이유로 막는다. 게다가 검증하려면 어차피 같은 행을 읽어야 해서 아끼는 것도 없다.
export async function plantSeed(playerId, plotNumber, cropTemplateId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 칸을 씨앗보다 먼저 잠근다. 강화가 "장비 → 재료" 순서인 것과 같은 규칙이다
    // — 코드 전체가 하나의 순서를 지켜야 두 요청이 서로를 마주 기다리지 않는다.
    //
    // player_plot은 25행이 미리 깔려 있어서 여기서 INSERT가 아니라 UPDATE를
    // 하게 된다. 없는 행은 FOR UPDATE로 잠글 수 없다는 것이 그 설계의 근거였다.
    const plot = await client.query(
      `SELECT crop_template_id FROM player_plot
        WHERE player_id = $1 AND plot_number = $2
        FOR UPDATE`,
      [playerId, plotNumber],
    );

    // 1~25 밖의 번호이거나 없는 플레이어면 행이 안 잡힌다. 강화가 없는 장비와
    // 남의 장비를 같은 404로 합친 것과 같은 처리다.
    if (plot.rowCount === 0) {
      throw serviceError(404, 'plot_not_found');
    }

    if (plot.rows[0].crop_template_id !== null) {
      throw serviceError(409, 'plot_occupied');
    }

    // 어느 씨앗을 태울지, 그리고 이 작물이 실재하는지를 여기서 읽는다.
    const crop = await client.query(
      `SELECT seed_stack_template_id FROM crop_template
        WHERE crop_template_id = $1`,
      [cropTemplateId],
    );

    // 비용표 조회와 다른 점이 여기다. 강화의 targetLevel은 서버가 만든 값이라
    // 행이 없을 수 없었지만, cropTemplateId는 클라이언트가 보낸 값이라 신뢰
    // 경계 바깥이다. 그래서 이쪽은 rowCount 검사가 필요하다.
    if (crop.rowCount === 0) {
      throw serviceError(404, 'crop_not_found');
    }

    const { seed_stack_template_id: seedId } = crop.rows[0];

    // 모자라면 여기서 409를 던지고 아래 catch가 전부 롤백한다.
    const seedLeft = await spendStack(client, playerId, seedId, SEED_PER_PLANT);

    const planted = await client.query(
      `UPDATE player_plot
          SET crop_template_id = $3, planted_at = NOW()
        WHERE player_id = $1 AND plot_number = $2
        RETURNING planted_at`,
      [playerId, plotNumber, cropTemplateId],
    );

    await client.query('COMMIT');

    // 바뀐 것만 싣는다 — 칸 하나와 줄어든 씨앗 하나. 밭 25칸을 통째로 돌려주는
    // 것은 화면을 처음 열 때 쓰는 GET의 일이고, 쓰기 API는 델타만 준다.
    return {
      plot: {
        plotNumber,
        cropTemplateId,
        plantedAt: planted.rows[0].planted_at,
      },
      seedStack: { stackTemplateId: seedId, amount: seedLeft },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// 다 자란 칸 하나를 거둔다. 수확물과 씨앗이 가방에 들어가고 골드가 늘고 칸이 빈다.
//
// 심기가 하나를 깎았다면 이쪽은 셋을 늘린다. 그래서 잠글 행도 늘어나는데,
// 순서는 넓은 것에서 좁은 것으로 통일한다 — player → 밭 칸 → 스택.
export async function harvestCrop(playerId, plotNumber) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 골드를 바꿀 것이므로 player 행을 먼저 잠근다. 아직 쓰지 않는 gold를 굳이
    // 여기서 읽는 이유는, 이 SELECT 자체가 잠금을 거는 수단이기 때문이다.
    const player = await client.query(
      `SELECT gold FROM player WHERE player_id = $1 FOR UPDATE`,
      [playerId],
    );

    if (player.rowCount === 0) {
      throw serviceError(404, 'player_not_found');
    }

    // 칸과 작물 정의를 한 번에 읽는다. LEFT JOIN인 이유가 중요하다 — 그냥 JOIN을
    // 쓰면 빈 칸(crop_template_id가 NULL)일 때 결과가 0행이 되어, "없는 칸"과
    // "빈 칸"이 한 덩어리로 뭉개진다. 둘은 404와 409로 갈라야 하는 다른 상황이다.
    //
    // FOR UPDATE OF p 는 "잠글 것은 player_plot 쪽 행뿐"이라는 뜻이다. 그냥
    // FOR UPDATE라고 쓰면 crop_template 행까지 잠그는데, 그건 아무도 바꾸지 않는
    // 정의 테이블이라 잠글 이유가 없다.
    //
    // 성장 판정을 SQL이 한다. 심은 시각도 성장 기간도 DB에 있으니 거기서 끝내는
    // 것이 자연스럽고, 서버 시계와 DB 시계가 어긋나는 경우가 아예 사라진다.
    const plot = await client.query(
      `SELECT p.crop_template_id,
              c.crop_stack_template_id, c.seed_stack_template_id,
              c.crop_amount, c.harvest_gold,
              p.planted_at + c.growth_time / $3 <= now() AS ready
         FROM player_plot p
         LEFT JOIN crop_template c ON c.crop_template_id = p.crop_template_id
        WHERE p.player_id = $1 AND p.plot_number = $2
        FOR UPDATE OF p`,
      [playerId, plotNumber, TIME_SCALE],
    );

    if (plot.rowCount === 0) {
      throw serviceError(404, 'plot_not_found');
    }

    const {
      crop_template_id: cropTemplateId,
      crop_stack_template_id: cropStackId,
      seed_stack_template_id: seedStackId,
      crop_amount: cropAmount,
      harvest_gold: harvestGold,
      ready,
    } = plot.rows[0];

    // 빈 칸을 거두는 것은 실패다. 심기가 찬 칸을 거절한 것과 짝이 되는 자리다.
    if (cropTemplateId === null) {
      throw serviceError(409, 'plot_empty');
    }

    if (!ready) {
      throw serviceError(409, 'not_ready');
    }

    // 씨앗 반환은 서버가 굴린다 — 강화의 주사위와 같은 자리다.
    //
    // 두 판정이 독립이라 둘 다 터질 수 있다. 그래서 분포는 1개 76% / 2개 19% /
    // 3개 4% / 4개 1%이고, 기댓값은 1.3이다. 배타 갈래로 짜도 기댓값은 같지만
    // 4개가 안 나온다 — 드문 대박을 남기려고 이쪽을 골랐다 (2026-09-04).
    const seedGain = 1 + (Math.random() < 0.2 ? 1 : 0) + (Math.random() < 0.05 ? 2 : 0);

    // 셋을 늘린다. 순서는 잠금 순서와 무관하다 — player 행은 이미 위에서 잡았고,
    // 스택 둘은 서로 다른 행이라 어느 쪽이 먼저든 상관없다.
    const cropLeft = await gainStack(client, playerId, cropStackId, cropAmount);
    const seedLeft = await gainStack(client, playerId, seedStackId, seedGain);

    const gold = await client.query(
      `UPDATE player SET gold = gold + $2
        WHERE player_id = $1
        RETURNING gold`,
      [playerId, harvestGold],
    );

    // 칸을 비운다. 둘을 함께 NULL로 만들어야 한다 — 짝을 이뤄야 한다는 CHECK가
    // 한쪽만 비우는 것을 거절한다.
    await client.query(
      `UPDATE player_plot
          SET crop_template_id = NULL, planted_at = NULL
        WHERE player_id = $1 AND plot_number = $2`,
      [playerId, plotNumber],
    );

    await client.query('COMMIT');

    return {
      // 거두고 나면 빈 칸이다. 심기 응답과 같은 모양을 유지해서 클라이언트가
      // 두 응답을 같은 코드로 처리할 수 있게 한다.
      plot: { plotNumber, cropTemplateId: null, plantedAt: null },
      stacks: [
        { stackTemplateId: cropStackId, amount: cropLeft },
        { stackTemplateId: seedStackId, amount: seedLeft },
      ],
      gold: gold.rows[0].gold,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
