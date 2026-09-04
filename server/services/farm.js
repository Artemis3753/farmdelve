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
import { spendStack } from './stack.js';

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
