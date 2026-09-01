// 장비 장착. 강화와 나란히 두고 보면 대비가 분명하다 — 저쪽은 주사위를 굴리고
// 재료를 태우느라 트랜잭션이 필요했지만, 여기는 칸 하나의 내용물을 바꾸는 것이
// 전부다.
//
// 규칙 두 가지가 코드 모양을 정한다:
//   - 어느 칸에 들어갈지는 클라이언트가 정하지 않는다. 장비 번호만 받고 슬롯은
//     gear_template에서 읽는다. 슬롯을 받으면 "낫을 머리에"가 보낼 수 있는
//     요청이 되고, 그건 서버가 규칙을 쥔다는 전제를 깬다.
//   - 해제는 없다(2026-08-31). 기본 방어구를 지급하기로 해서 칸이 빌 일이
//     없고, "무기 없이 던전 입장" 같은 예외 상황도 생기지 않는다.

import pool from '../db/pool.js';

function equipError(status, reason) {
  const err = new Error(reason);
  err.status = status;
  err.reason = reason;
  return err;
}

export async function equipGear(playerId, gearInstanceId) {
  // 이 장비가 존재하는지, 이 플레이어의 것인지, 그리고 어느 칸에 들어가는지를
  // 한 번에 확인한다. slot이 gear_template에만 있어서 JOIN으로 붙여 온다.
  const found = await pool.query(
    `SELECT t.slot
       FROM gear_instance i
       JOIN gear_template t ON i.gear_template_id = t.gear_template_id
      WHERE i.gear_instance_id = $1 AND i.player_id = $2`,
    [gearInstanceId, playerId],
  );

  // 없는 장비와 남의 장비를 같은 404로 합친다. 강화 쪽과 같은 이유로,
  // 구분해서 알려주면 "이 번호는 존재한다"가 새어 나간다.
  if (found.rowCount === 0) {
    throw equipError(404, 'gear_not_found');
  }

  const { slot } = found.rows[0];

  // player_gear_slot의 PK가 (player_id, slot) 두 컬럼이라 둘을 다 맞춰야 칸
  // 하나가 집힌다. player_id만 쓰면 다섯 칸이 전부 같은 장비로 덮이고, 그때는
  // gear_instance_id의 UNIQUE 제약에 걸려 에러가 난다.
  //
  // 원래 그 칸에 있던 장비는 따로 빼낼 필요가 없다. 덮어쓰는 순간 어느 칸에도
  // 속하지 않게 되고, 그것이 곧 "가방에 있다"는 뜻이다 — 가방 테이블이 따로
  // 없는 이유이기도 하다.
  await pool.query(
    `UPDATE player_gear_slot
        SET gear_instance_id = $1
      WHERE player_id = $2 AND slot = $3`,
    [gearInstanceId, playerId, slot],
  );

  // 트랜잭션을 쓰지 않는 이유: 상태를 바꾸는 문장이 UPDATE 하나뿐이라 그 자체로
  // 원자적이다. 위의 SELECT는 읽기이고, 그 사이에 무언가 끼어들어도 최악의
  // 결과는 "방금 팔린 장비를 끼우려다 실패"인데 그런 경로가 아직 없다.
  //
  // 강화는 재료 차감과 강화 단계 올리기가 함께 성립해야 해서 사정이 달랐다.

  // 바뀐 칸만 돌려준다. 클라이언트는 equipped의 이 한 칸만 갈아끼우면 된다.
  return { slot, gearInstanceId };
}
