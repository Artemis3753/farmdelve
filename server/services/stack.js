// 가방(player_stack)을 깎고 늘리는 일. 강화가 crest와 정제 재료를 태우고,
// 심기가 씨앗을 태우고, 정제가 원재료를 태운다 — 세 곳이 똑같은 세 갈래
// (부족 / 딱 맞음 / 남음)를 밟으므로 upgrade.js에서 떼어냈다 (2026-09-04).
// 수확이 생기면서 반대 방향인 gainStack이 나란히 들어왔다.
//
// 트랜잭션을 여기서 열지 않는 것이 핵심이다. client를 인자로 받는 이유는
// 부르는 쪽의 트랜잭션 안에서 같이 커밋되거나 같이 롤백되어야 하기 때문이다.
// 여기서 pool.connect()를 하면 별개의 트랜잭션이 되어, 강화가 실패해 롤백해도
// 재료만 나간 채로 남는다.

import { serviceError } from './errors.js';

// 재료 한 종류를 잠그고, 확인하고, 소모한다.
//
// 소모하고 남은 개수를 돌려준다 — 응답에 실어야 클라이언트가 가방 숫자를
// 다시 조회하지 않아도 되기 때문이다.
export async function spendStack(client, playerId, stackTemplateId, need) {
  // FOR UPDATE가 이 행을 트랜잭션이 끝날 때까지 잠근다. 같은 행을 노리는 다른
  // 요청은 이 SELECT에서 멈춰 서서 기다리므로, 아래의 "확인하고 → 깎는" 사이로
  // 끼어들 수 없다. 버튼을 두 번 눌러 요청이 겹쳐도 같은 재료를 두 번 셈하지
  // 않는 이유가 이 한 줄이다. 재료가 두 번 나가는 것 자체는 막지 않는다 —
  // 정당한 두 번째 요청이므로 그건 클라이언트의 busy가 할 일이다.
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
    throw serviceError(409, 'insufficient_materials', {
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

// 재료 한 종류를 가방에 넣는다. spendStack의 반대 방향이고, 늘어난 뒤의 개수를
// 돌려준다.
//
// spendStack과 달리 FOR UPDATE가 없다. 저쪽은 "읽고 → 충분한지 판단하고 →
// 깎는" 세 걸음이라 그 사이에 끼어들 틈이 있었지만, 넣는 데는 판단할 것이
// 없어서 한 문장으로 끝난다. 그 한 문장이 원자적이라 잠글 필요가 없다.
export async function gainStack(client, playerId, stackTemplateId, gain) {
  // ON CONFLICT는 "이 INSERT가 제약에 걸리면 대신 이걸 해라"다. 여기서는
  // player_stack의 기본 키 (player_id, stack_template_id)가 겹칠 때,
  // 즉 이미 갖고 있는 재료일 때 걸린다.
  //
  // EXCLUDED는 "넣으려다 막힌 그 행"을 가리키는 이름이다. 그래서
  // EXCLUDED.amount는 위 VALUES의 $3, 곧 이번에 늘어날 개수를 뜻한다.
  //
  // DO UPDATE에 WHERE가 없는 것은 부딪친 그 행 하나만 고치도록 이미 정해져
  // 있기 때문이다. 가방 전체가 아니라 그 재료 행만 바뀐다.
  const row = await client.query(
    `INSERT INTO player_stack (player_id, stack_template_id, amount)
          VALUES ($1, $2, $3)
     ON CONFLICT (player_id, stack_template_id)
     DO UPDATE SET amount = player_stack.amount + EXCLUDED.amount
       RETURNING amount`,
    [playerId, stackTemplateId, gain],
  );

  // INSERT로 갔든 UPDATE로 갔든 RETURNING이 결과 행을 준다. 그래서 어느 쪽으로
  // 갈렸는지 코드가 알 필요가 없다.
  return row.rows[0].amount;
}
