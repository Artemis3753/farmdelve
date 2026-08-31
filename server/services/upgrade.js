// 장비 강화. HTTP를 모르는 쪽이다 — 여기 있는 함수는 req도 res도 받지 않고,
// 상태 코드도 고르지 않는다. 그 번역은 라우트가 한다.
//
// 규칙의 근거는 docs/design-backlog.md의 "Gear upgrading" 절에 있다. 그중
// 코드 모양을 좌우하는 두 줄만 옮겨 적으면:
//   - 실패는 롤백이 아니다. 재료를 태우고 강화 단계만 그대로 둔다. 되돌리면
//     성공할 때까지 무한히 재시도할 수 있게 된다.
//   - 주사위는 서버가 굴린다. 클라이언트는 "어느 장비"만 말할 수 있다.

import pool from '../db/pool.js';

// throw할 에러에 응답 코드를 미리 붙여 둔다. 라우트는 err.status를 그대로 쓰고,
// status가 없는 에러 — pg가 던진 것, 코드 버그 — 는 500으로 흘려보내면 된다.
//
// 이름을 code가 아니라 reason으로 한 이유: pg의 에러 객체가 이미 code를 쓴다
// (SQLSTATE, '23514' 같은 값). 같은 이름을 겹쳐 쓰면 어느 쪽 code인지 헷갈린다.
function upgradeError(status, reason, details) {
  const err = new Error(reason);
  err.status = status;
  err.reason = reason;
  err.details = details;
  return err;
}

// 재료 한 종류를 잠그고, 확인하고, 소모한다. crest와 정제 재료 둘에 대해
// 똑같은 일을 하므로 함수로 묶었다.
//
// 소모하고 남은 개수를 돌려준다 — 응답에 실어야 클라이언트가 가방 숫자를
// 다시 조회하지 않아도 되기 때문이다.
async function spendStack(client, playerId, stackTemplateId, need) {
  // FOR UPDATE가 이 행을 트랜잭션이 끝날 때까지 잠근다. 같은 행을 노리는 다른
  // 요청은 이 SELECT에서 멈춰 서서 기다리므로, 아래의 "확인하고 → 깎는" 사이로
  // 끼어들 수 없다. 버튼을 두 번 눌러 요청이 겹쳐도 재료가 두 번 나가지 않는
  // 이유가 이 한 줄이다.
  const held = await client.query(
    `SELECT amount FROM player_stack
      WHERE player_id = $1 AND stack_template_id = $2
      FOR UPDATE`,
    [playerId, stackTemplateId],
  );

  // 행이 아예 없으면 0개 가진 것이다. schema.sql이 CHECK (amount > 0)로 0을
  // 금지하고 있어서, 다 쓴 재료는 0인 행이 아니라 사라진 행으로 남는다.
  //
  // rows[0]?.amount 의 ?. 는 "앞이 없으면 거기서 멈추고 undefined",
  // ?? 0 은 "왼쪽이 undefined나 null이면 0을 쓴다"는 뜻이다.
  const amount = held.rows[0]?.amount ?? 0;

  // details에 need와 held를 싣는 건 FOR UPDATE로 이미 읽어둔 값이라 공짜이기
  // 때문이다. "3개 필요한데 1개 있음"이 그대로 409 응답에 담긴다.
  if (amount < need) {
    throw upgradeError(409, 'insufficient_materials', {
      stackTemplateId,
      need,
      held: amount,
    });
  }

  // 딱 맞게 다 쓰는 경우. UPDATE로 0을 만들면 CHECK (amount > 0)에 걸려 DB
  // 에러가 난다. 그래서 깎는 게 아니라 행을 지운다.
  if (amount === need) {
    await client.query(
      `DELETE FROM player_stack
        WHERE player_id = $1 AND stack_template_id = $2`,
      [playerId, stackTemplateId],
    );
    return 0;
  }

  // 여기까지 왔으면 쓰고도 남는 경우다.
  // client.query의 두 번째 인자는 $1 $2 $3 에 순서대로 들어갈 값의 배열이다.
  await client.query(
    `UPDATE player_stack SET amount = amount - $3
      WHERE player_id = $1 AND stack_template_id = $2`,
    [playerId, stackTemplateId, need],
  );

  return amount - need;
}

// 강화를 한 번 시도한다. 성공이든 실패든 재료는 나가고, 그 결과를 돌려준다.
// 재료가 모자라거나 이미 +10이면 아무것도 소모하지 않고 throw한다.
export async function attemptUpgrade(playerId, gearInstanceId) {
  // pool.query()가 아니라 pool.connect()인 이유: 트랜잭션은 "같은 연결"에서
  // 이어져야 한다. pool.query()는 매번 남는 연결을 아무거나 집어 쓰므로,
  // BEGIN과 COMMIT이 서로 다른 연결로 날아가 트랜잭션이 성립하지 않는다.
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 장비를 재료보다 먼저 잠근다. 잠그는 순서를 코드 전체에서 하나로 지키면
    // 두 요청이 서로가 쥔 잠금을 마주 기다리는 교착이 생기지 않는다.
    const gear = await client.query(
      `SELECT upgrade_level FROM gear_instance
        WHERE gear_instance_id = $1 AND player_id = $2
        FOR UPDATE`,
      [gearInstanceId, playerId],
    );

    // 없는 장비와 남의 장비가 같은 결과로 합쳐진다. 둘을 구분해서 알려주면
    // "이 번호는 존재하긴 한다"가 새어 나가므로 일부러 합친다.
    if (gear.rowCount === 0) {
      throw upgradeError(404, 'gear_not_found');
    }

    const currentLevel = gear.rows[0].upgrade_level;

    // 이미 만렙이면 더 올릴 수 없다. 상한 10은 schema.sql의
    // gear_instance.upgrade_level CHECK와 같은 숫자여야 한다.
    if (currentLevel >= 10) {
      throw upgradeError(409, 'already_max_level', { upgradeLevel: currentLevel });
    }

    // 비용표의 한 행은 "n-1에서 n으로 올리는 값"이라 지금 단계가 아니라 목표
    // 단계로 조회한다.
    //
    // 위에서 만렙을 걸렀으므로 이 값은 1~10이고, 그 열 행은 seed.sql이 전부
    // 넣어두므로 조회 결과가 비는 경우는 없다.
    const targetLevel = currentLevel + 1;

    const cost = await client.query(
      `SELECT success_rate,
              crest_stack_template_id, crest_amount,
              material_stack_template_id, material_amount
         FROM upgrade
        WHERE upgrade_level = $1`,
      [targetLevel],
    );

    // SQL의 snake_case 컬럼명을 JS의 camelCase로 갈아끼우며 꺼낸다.
    const {
      success_rate: successRate,
      crest_stack_template_id: crestId,
      crest_amount: crestNeed,
      material_stack_template_id: materialId,
      material_amount: materialNeed,
    } = cost.rows[0];

    // 재료를 주사위보다 먼저 소모한다. 순서를 뒤집으면 "실패했으니 차감을
    // 건너뛰자"는 유혹이 생기고, 그 순간 무한 재시도가 열린다.
    // 모자라면 spendStack이 여기서 throw하고, 아래 catch가 전부 롤백한다.
    const crestLeft = await spendStack(client, playerId, crestId, crestNeed);
    const materialLeft = await spendStack(client, playerId, materialId, materialNeed);

    // 주사위는 서버가 굴린다. Math.random()은 0 이상 1 미만의 소수를 주고
    // successRate는 100 / 70 / 40 같은 정수 퍼센트라, 같은 눈금으로 맞춘 뒤
    // 비교한다. Math.random()이 1에 닿지 않는 덕분에 100%가 정확히 100%가 된다.
    const upgraded = Math.random() * 100 < successRate;

    // 실패했을 때는 아무것도 하지 않는다. 재료는 이미 위에서 나갔고, 그 상태
    // 그대로 COMMIT되는 것이 "실패는 롤백이 아니다"의 실물이다.
    if (upgraded) {
      await client.query(
        `UPDATE gear_instance SET upgrade_level = upgrade_level + 1
          WHERE gear_instance_id = $1`,
        [gearInstanceId],
      );
    }

    await client.query('COMMIT');

    return {
      upgraded,
      gear: {
        gearInstanceId,
        // 실패는 재료만 태우고 단계는 그대로 두므로 currentLevel을 그대로 싣는다.
        upgradeLevel: upgraded ? targetLevel : currentLevel,
      },
      // 바뀐 재료만 싣는다. 가방 전체를 돌려주는 건 이 API의 일이 아니다.
      stacks: [
        { stackTemplateId: crestId, amount: crestLeft },
        { stackTemplateId: materialId, amount: materialLeft },
      ],
    };
  } catch (err) {
    // ROLLBACK 자체가 실패해도(연결이 이미 끊긴 경우 등) 그 에러로 원래 원인을
    // 덮지 않도록 삼킨다. 어느 쪽이든 아래에서 원래 에러를 다시 던진다.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    // 빌린 연결은 성공하든 실패하든 반드시 반납한다. 이걸 빠뜨리면 풀의 연결이
    // 하나씩 새다가, 어느 순간 모든 요청이 연결을 기다리며 멈춘다.
    client.release();
  }
}
