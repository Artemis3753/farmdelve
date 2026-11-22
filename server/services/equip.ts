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
import { serviceError } from './errors.js';

// 반환 타입은 적지 않고 TS의 추론에 맡긴다(2026-11-22 결정). 아래 return 문이
// 곧 약속이라 같은 내용을 함수 머리에 한 번 더 적을 이유가 없다.
export async function equipGear(playerId: number, gearInstanceId: number) {
  // 이 장비가 존재하는지, 이 플레이어의 것인지, 그리고 어느 칸에 들어가는지를
  // 한 번에 확인한다. slot이 gear_template에만 있어서 JOIN으로 붙여 온다.
  //
  // <{ slot: string }>는 "이 쿼리는 slot 열 하나짜리 행을 돌려준다"는 약속이다.
  // pg는 DB가 무엇을 줄지 알 수 없어서 기본값으로 any를 주는데, any면 TS가 그
  // 값에 대한 검사를 전부 포기한다. 약속을 적어 두면 받은 뒤의 오타·잘못된
  // 사용은 tsc가 잡는다. 실행 중에 확인되는 건 아니라서 SELECT 열과 이 모양은
  // 사람이 맞춰야 한다 — 실행 중 검증(zod 등)은 이 크기엔 과해서 뺐다(2026-11-22).
  //
  // slot을 'head' | 'chest' 같은 목록 타입이 아니라 string으로 둔 이유: 이
  // 함수는 받은 값을 그대로 UPDATE에 넘기고 돌려줄 뿐 종류별로 갈라 쓰지 않는다.
  // 허용 값 검사는 schema.sql의 CHECK 제약이 이미 하고 있다.
  const found = await pool.query<{ slot: string }>(
    `SELECT t.slot
       FROM gear_instance i
       JOIN gear_template t ON i.gear_template_id = t.gear_template_id
      WHERE i.gear_instance_id = $1 AND i.player_id = $2`,
    [gearInstanceId, playerId],
  );

  // 없는 장비와 남의 장비를 같은 404로 합친다. 강화 쪽과 같은 이유로,
  // 구분해서 알려주면 "이 번호는 존재한다"가 새어 나간다.
  if (found.rowCount === 0) {
    throw serviceError(404, 'gear_not_found');
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
