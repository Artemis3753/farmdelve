// 던전 런의 시작과 끝. upgrade.js와 같은 층이다 — HTTP를 모르고, 상태 코드도
// 고르지 않는다. 그 번역은 라우트가 한다.
//
// 규칙의 근거는 docs/design-backlog.md의 "Dungeon loop and rewards" 절과
// 2026-09-14 세션에 있다. 그중 코드 모양을 좌우하는 것만 옮겨 적으면:
//   - 서버는 런의 시작과 끝만 안다. 진행 중에는 아무것도 받지 않으므로,
//     "몇 마리 죽였나"는 여기 없다. 그래서 이어하기도 없다.
//   - 입장 자격은 highest_tier_cleared + 2까지다.
//   - 오버타임 클리어는 클리어로 치되 highest_tier_cleared를 올리지 않는다.
//     제한 시간이 보상만이 아니라 진행의 방벽이기도 하다는 뜻이다.
//   - 소요 시간과 오버타임 여부는 저장하지 않는다. end_time - start_time으로
//     나오는 값이라, 저장하면 손으로 맞출 자리가 하나 늘어난다.

import pool from '../db/pool.js';
import { serviceError } from './errors.js';

// 던전에 들어간다. 진행 중이던 런이 남아 있으면 그것을 실패로 닫고 시작한다.
export async function enterDungeon(playerId, tier) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // player를 맨 먼저 잠근다. 8/31에 정한 순서(player → 밭 칸/장비 → 스택)를
    // 그대로 따르는 것이고, dungeon_run은 그 줄의 맨 뒤에 붙는다.
    const player = await client.query(
      `SELECT highest_tier_cleared FROM player
        WHERE player_id = $1
        FOR UPDATE`,
      [playerId],
    );

    if (player.rowCount === 0) {
      throw serviceError(404, 'player_not_found');
    }

    const highest = player.rows[0].highest_tier_cleared;

    // 입장 자격. 백로그의 "highest cleared + 2"가 이 한 줄이다. 아직 아무것도
    // 못 깬 플레이어(0)가 1티어와 2티어까지 들어갈 수 있다는 뜻이라, 딱 맞는
    // 경우(highest + 2 == tier)는 통과해야 한다. 부등호가 <= 가 아닌 이유다.
    if (highest + 2 < tier) {
      throw serviceError(409, 'tier_too_high', { highestTierCleared: highest });
    }

    // 남아 있던 진행 중 런을 닫는다. 브라우저를 닫고 나간 런이 여기 걸린다 —
    // 완료 API가 불릴 기회가 없었으므로 ongoing인 채로 남아 있다.
    //
    // end_time에 LEAST를 쓰는 이유: 두 후보가 각각 다른 경우에 거짓말을 한다.
    // now()만 쓰면 사흘 뒤에 다시 들어왔을 때 사흘짜리 런이 되고, start_time +
    // time_limit만 쓰면 제한 시간 전에 다시 들어왔을 때 end_time이 미래가 된다.
    // 이른 쪽을 고르면 둘 다 안 생긴다.
    await client.query(
      `UPDATE dungeon_run r
          SET status = 'failed',
              end_time = LEAST(now(), r.start_time + t.time_limit)
         FROM dungeon_tier_template t
        WHERE t.tier = r.tier
          AND r.player_id = $1
          AND r.status = 'ongoing'`,
      [playerId],
    );

    // 새 런을 연다. dungeon_template_id를 클라이언트가 보내지 않는 이유는
    // 던전이 하나뿐이기 때문이다. 둘째 던전이 생기면 이 서브쿼리가 인자로 바뀐다.
    //
    // start_time은 컬럼 DEFAULT가 now()라 적지 않는다. 시간은 서버 시계에서
    // 온다는 백로그 Persistence 규칙이 여기서도 유지된다.
    //
    // status를 고른 것이 아니라 강제된 것이다. end_time을 적지 않아 NULL이 되고,
    // schema.sql의 짝 NULL CHECK가 그때 status를 ongoing으로 못 박는다.
    const run = await client.query(
      `INSERT INTO dungeon_run (player_id, dungeon_template_id, tier, status)
       VALUES ($1, (SELECT dungeon_template_id FROM dungeon_template LIMIT 1), $2, 'ongoing')
       RETURNING dungeon_run_id, start_time`,
      [playerId, tier],
    );

    // 제한 시간을 응답에 실어 보낸다. 클라이언트가 자기 표로 들고 있으면 규칙이
    // 두 곳에 생긴다 — 심기 응답에 readyAt을 실은 것과 같은 판단이다.
    //
    // INTERVAL을 그대로 보내면 pg 드라이버가 { minutes: 5 } 같은 객체로 준다.
    // 그러면 클라이언트가 그걸 초로 펴는 로직을 갖게 되고, templates.js가
    // growthSeconds로 이미 정해둔 규칙과도 갈린다. ::float8 이유는 그쪽 주석에
    // 적어둔 것과 같다 — 없으면 numeric이라 드라이버가 문자열로 준다.
    //
    // TIME_SCALE은 걸지 않는다. 농작물은 기다리는 시간이라 배속이 말이 되지만,
    // 던전은 실시간 전투라 5분이 30초가 되면 게임이 성립하지 않는다.
    const limit = await client.query(
      `SELECT EXTRACT(EPOCH FROM time_limit)::float8 AS "timeLimitSeconds"
         FROM dungeon_tier_template
        WHERE tier = $1`,
      [tier],
    );

    await client.query('COMMIT');

    return {
      runId: run.rows[0].dungeon_run_id,
      tier,
      startTime: run.rows[0].start_time,
      timeLimitSeconds: limit.rows[0].timeLimitSeconds,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// 런을 끝낸다. cleared는 클라이언트가 주장하는 값이다 — 서버는 전투를 보지
// 않으므로 확인할 방법이 없고, 백로그가 부정행위 방지를 범위 밖으로 이미
// 정해뒀다(2026-08-24).
export async function completeDungeon(playerId, runId, cleared) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 런과 그 티어의 제한 시간을 함께 읽는다. FOR UPDATE OF r 는 조인한 두 표
    // 중 dungeon_run만 잠근다는 뜻이다 — 티어 표는 읽기만 하므로 잠글 이유가 없다.
    //
    // overtime을 SQL에서 계산한다. 시각 비교를 JS로 가져오면 서버 시계와 DB
    // 시계가 어긋날 여지가 생긴다 — 농작물 성장 판정을 SQL에 둔 것과 같은 이유다.
    //
    // 비교식이 그대로 boolean 컬럼이 된다. CASE로 감싸 1/0을 만들면 응답에
    // 숫자가 실려 나가고, 읽는 쪽이 0을 "아님"과 "없음" 중 무엇으로 볼지
    // 한 번 더 생각해야 한다.
    const run = await client.query(
      `SELECT r.status, r.tier, now() > r.start_time + t.time_limit overtime
         FROM dungeon_run r
         JOIN dungeon_tier_template t ON t.tier = r.tier
        WHERE r.dungeon_run_id = $1 AND r.player_id = $2
        FOR UPDATE OF r`,
      [runId, playerId],
    );

    // 없는 런과 남의 런이 같은 404로 합쳐진다. 강화가 없는 장비와 남의 장비를
    // 합친 것과 같은 이유 — 구분해서 알려주면 "이 번호는 존재한다"가 새어 나간다.
    if (run.rowCount === 0) {
      throw serviceError(404, 'run_not_found');
    }

    // 이미 끝난 런은 다시 끝낼 수 없다. 짝 NULL CHECK 때문에 status가
    // ongoing이 아니면 end_time도 이미 차 있다.
    if (run.rows[0].status !== 'ongoing') {
      throw serviceError(409, 'run_already_ended', { status: run.rows[0].status });
    }

    const { tier, overtime } = run.rows[0];

    // 오버타임은 여기에 영향을 주지 않는다. 시간을 넘겨도 클리어는 클리어다 —
    // 백로그의 "Overtime clears still count"가 이 줄이다.
    const status = cleared ? 'cleared' : 'failed';

    await client.query(
      `UPDATE dungeon_run
          SET status = $1, end_time = now()
        WHERE dungeon_run_id = $2`,
      [status, runId],
    );

    // 최고 기록 갱신. 세 조건이 한꺼번에 걸린다 — 클리어했고, 시간 안에
    // 들어왔고, 이번 티어가 기존 기록보다 높을 때만 올라간다. 앞의 둘은 if가,
    // 나머지 하나는 GREATEST가 맡는다.
    //
    // 위 status와 여기가 갈리는 것이 이 기능의 핵심이다. 오버타임 클리어는
    // cleared로 남지만 기록은 안 올린다 — 시간 안에 한 번도 못 깨고 계속 위로
    // 올라갈 수 있으면 제한 시간이 보상만 깎을 뿐 방벽이 되지 못한다.
    // WoW의 키스톤이 시간을 놓치면 한 단계 내려가는 것과 같은 갈림이다.
    let highestTierCleared = null;

    if (cleared && !overtime) {
      const updated = await client.query(
        `UPDATE player
            SET highest_tier_cleared = GREATEST(highest_tier_cleared, $1)
          WHERE player_id = $2
        RETURNING highest_tier_cleared`,
        [tier, playerId],
      );

      highestTierCleared = updated.rows[0].highest_tier_cleared;
    }

    await client.query('COMMIT');

    return { status, overtime, highestTierCleared };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
