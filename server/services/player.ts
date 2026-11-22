// 강화할 때마다 바뀌는 쪽. templates.js가 "세상의 규칙"이라면 여기는
// "이 플레이어의 현재 상태"다.
//
// 장비와 재료는 id만 실어 보낸다. 이름·아이콘·기본 스탯은 클라이언트가 이미
// 템플릿으로 들고 있으므로, 여기서 또 보내면 같은 사실을 두 번 보내는 셈이다.

import pool from '../db/pool.js';
import { TIME_SCALE } from '../config.js';
import { serviceError } from './errors.js';

// 반환 타입은 equip과 같은 이유로 적지 않는다(2026-11-22 결정).
//
// 아래 제네릭의 키가 equip·craft와 달리 camelCase인 이유: SQL에서 AS로 이름을
// 이미 바꿔서 받기 때문이다. 약속은 "DB가 실제로 주는 모양"이라 AS 뒤의 이름을
// 적는다. 숫자 열은 전부 INTEGER라 number다.
//
// Promise.all에 쿼리 다섯 개를 배열로 넘겨도 TS는 칸마다 타입을 따로 기억한다.
// 그래서 왼쪽에서 [player, gear, ...]로 꺼낼 때 player는 player 쿼리의 모양,
// plots는 plots 쿼리의 모양이 된다.
export async function getPlayer(playerId: number) {
  const [player, gear, slots, stacks, plots] = await Promise.all([
    pool.query<{ gold: number; highestTierCleared: number }>(
      `SELECT gold, highest_tier_cleared AS "highestTierCleared"
         FROM player
        WHERE player_id = $1`,
      [playerId],
    ),

    pool.query<{ gearInstanceId: number; gearTemplateId: number; upgradeLevel: number }>(
      `SELECT gear_instance_id AS "gearInstanceId",
              gear_template_id AS "gearTemplateId",
              upgrade_level    AS "upgradeLevel"
         FROM gear_instance
        WHERE player_id = $1
        ORDER BY gear_instance_id`,
      [playerId],
    ),

    // gearInstanceId에 null이 붙는 이유: schema.sql에서 player_gear_slot의
    // gear_instance_id는 NULL을 허용한다(시작 때 방어구 칸이 비어 있다).
    // number만 적으면 빈 칸을 숫자인 척 다루는 코드를 TS가 통과시킨다.
    pool.query<{ slot: string; gearInstanceId: number | null }>(
      `SELECT slot, gear_instance_id AS "gearInstanceId"
         FROM player_gear_slot
        WHERE player_id = $1`,
      [playerId],
    ),

    // 0개가 된 재료는 행 자체가 사라지므로, 여기 안 나오는 재료는 0개다.
    // 클라이언트는 템플릿 목록을 기준으로 그리면서 없는 것을 0으로 채우면 된다.
    pool.query<{ stackTemplateId: number; amount: number }>(
      `SELECT stack_template_id AS "stackTemplateId", amount
         FROM player_stack
        WHERE player_id = $1
        ORDER BY stack_template_id`,
      [playerId],
    ),

    // 밭 25칸은 항상 25행이다. 빈 칸도 행으로 있으므로 화면은 이 배열만 훑으면
    // 격자를 다 그릴 수 있다.
    //
    // readyAt은 저장된 값이 아니라 여기서 계산한 것이다. planted_at은 DB에 있고
    // growth_time은 crop_template에 있어서, 둘을 아는 쪽이 서버뿐이다. 클라이언트에
    // 계산식을 옮기면 배속과 성장 규칙이 두 곳에 생긴다.
    //
    // 빈 칸은 crop_template_id가 NULL이라 LEFT JOIN이 짝을 못 찾고, 그 행의
    // planted_at도 readyAt도 NULL로 나간다. "비어 있다"가 그대로 표현된다.
    //
    // 시각 두 개가 Date인 이유: planted_at은 TIMESTAMPTZ이고, 시각 + 기간
    // (INTERVAL)도 시각이라 readyAt도 TIMESTAMPTZ다. pg는 TIMESTAMPTZ를 JS
    // Date 객체로 바꿔 준다. 클라이언트가 받는 건 Date가 아니라 문자열이다 —
    // res.json()이 Date를 "2026-11-22T02:00:00.000Z" 같은 ISO 문자열로 바꿔서
    // 보낸다. 이 타입은 서버 안에서의 모양이다.
    //
    // 세 열에 null이 붙는 이유는 위의 빈 칸 설명 그대로다.
    pool.query<{
      plotNumber: number;
      cropTemplateId: number | null;
      plantedAt: Date | null;
      readyAt: Date | null;
    }>(
      `SELECT p.plot_number      AS "plotNumber",
              p.crop_template_id AS "cropTemplateId",
              p.planted_at       AS "plantedAt",
              p.planted_at + c.growth_time / $2 AS "readyAt"
         FROM player_plot p
         LEFT JOIN crop_template c ON c.crop_template_id = p.crop_template_id
        WHERE p.player_id = $1
        ORDER BY p.plot_number`,
      [playerId, TIME_SCALE],
    ),
  ]);

  // 로그인이 붙기 전이라 이 경우는 사실상 일어나지 않지만, 없는 플레이어를
  // 조회했을 때 undefined가 응답에 섞여 나가는 것보다 404가 정직하다.
  //
  // 원래 여기만 serviceError를 쓰지 않고 Error에 status·reason을 직접 붙였다.
  // TS에서는 Error에 없는 칸이라 빌드가 실패하므로 다른 서비스들과 같은
  // serviceError로 바꿨다. 라우트가 받는 status와 reason은 그대로다.
  if (player.rowCount === 0) {
    throw serviceError(404, 'player_not_found');
  }

  // 장착 칸은 DB에서 다섯 행으로 온다. 화면에서는 "머리 칸에 뭐가 있나"를 바로
  // 집고 싶으므로, 배열을 훑는 대신 슬롯 이름을 키로 하는 객체 하나로 접는다.
  //
  //   [ { slot: 'head', gearInstanceId: null }, ... ]
  //     → { head: null, chest: null, ..., weapon: 1 }
  //
  // 타입을 적는 이유: {}만 쓰면 TS는 "칸이 하나도 없는 객체"로 보고, 아래에서
  // equipped['head']처럼 칸을 새로 만드는 줄을 에러로 막는다. Record<키, 값>은
  // "키가 이 타입이고 값이 저 타입인 칸을 얼마든지 가질 수 있는 객체"라는 뜻이다.
  // 키를 'head' | 'chest' ... 목록이 아니라 string으로 둔 건 equip의 slot과
  // 같은 이유다 — 허용 값은 schema.sql의 CHECK가 지킨다.
  const equipped: Record<string, number | null> = {};
  for (const row of slots.rows) {
    equipped[row.slot] = row.gearInstanceId;
  }

  return {
    ...player.rows[0],
    gear: gear.rows,
    equipped,
    stacks: stacks.rows,
    plots: plots.rows,
  };
}
