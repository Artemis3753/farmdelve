// 강화할 때마다 바뀌는 쪽. templates.js가 "세상의 규칙"이라면 여기는
// "이 플레이어의 현재 상태"다.
//
// 장비와 재료는 id만 실어 보낸다. 이름·아이콘·기본 스탯은 클라이언트가 이미
// 템플릿으로 들고 있으므로, 여기서 또 보내면 같은 사실을 두 번 보내는 셈이다.

import pool from '../db/pool.js';

export async function getPlayer(playerId) {
  const [player, gear, slots, stacks] = await Promise.all([
    pool.query(
      `SELECT gold, highest_tier_cleared AS "highestTierCleared"
         FROM player
        WHERE player_id = $1`,
      [playerId],
    ),

    pool.query(
      `SELECT gear_instance_id AS "gearInstanceId",
              gear_template_id AS "gearTemplateId",
              upgrade_level    AS "upgradeLevel"
         FROM gear_instance
        WHERE player_id = $1
        ORDER BY gear_instance_id`,
      [playerId],
    ),

    pool.query(
      `SELECT slot, gear_instance_id AS "gearInstanceId"
         FROM player_gear_slot
        WHERE player_id = $1`,
      [playerId],
    ),

    // 0개가 된 재료는 행 자체가 사라지므로, 여기 안 나오는 재료는 0개다.
    // 클라이언트는 템플릿 목록을 기준으로 그리면서 없는 것을 0으로 채우면 된다.
    pool.query(
      `SELECT stack_template_id AS "stackTemplateId", amount
         FROM player_stack
        WHERE player_id = $1
        ORDER BY stack_template_id`,
      [playerId],
    ),
  ]);

  // 로그인이 붙기 전이라 이 경우는 사실상 일어나지 않지만, 없는 플레이어를
  // 조회했을 때 undefined가 응답에 섞여 나가는 것보다 404가 정직하다.
  if (player.rowCount === 0) {
    const err = new Error('player_not_found');
    err.status = 404;
    err.reason = 'player_not_found';
    throw err;
  }

  // 장착 칸은 DB에서 다섯 행으로 온다. 화면에서는 "머리 칸에 뭐가 있나"를 바로
  // 집고 싶으므로, 배열을 훑는 대신 슬롯 이름을 키로 하는 객체 하나로 접는다.
  //
  //   [ { slot: 'head', gearInstanceId: null }, ... ]
  //     → { head: null, chest: null, ..., weapon: 1 }
  const equipped = {};
  for (const row of slots.rows) {
    // ★ 빈칸 2 — 무엇을 키로 삼고 무엇을 값으로 넣는가?
    //   위 그림의 화살표 오른쪽 모양이 나와야 한다. row에는 slot과
    //   gearInstanceId 둘이 들어 있다.
    equipped[row.slot] = row.gearInstanceId;
  }

  return {
    ...player.rows[0],
    gear: gear.rows,
    equipped,
    stacks: stacks.rows,
  };
}
