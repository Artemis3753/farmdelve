// 밸런스 패치 때만 바뀌는 정적 데이터. 클라이언트가 앱을 열 때 한 번 받아
// 들고 있으면, 그 뒤로는 서버가 id만 보내도 이름과 아이콘을 스스로 붙일 수 있다.
//
// 강화 응답이 { stackTemplateId: 4, amount: 39 }로 끝나는 이유가 이것이다 —
// 같은 이름을 모든 응답에 반복해 싣지 않으려고 여기로 몰아뒀다.
//
// SQL의 snake_case를 JS의 camelCase로 바꾸는 일은 별칭이 한다. 행이 수십 개라
// upgrade.js처럼 구조 분해로 하나씩 갈아끼우는 방식이 통하지 않는다.

import pool from '../db/pool.js';
import { TIME_SCALE } from '../config.js';

export async function getTemplates() {
  // 다섯 쿼리는 서로의 결과를 쓰지 않으므로 기다릴 이유가 없다. Promise.all이
  // 전부 한꺼번에 띄우고 마지막 하나가 끝날 때 배열로 돌려준다.
  //
  // 읽기뿐이라 pool.connect()가 아니라 pool.query()를 쓴다. 세 쿼리가 서로 다른
  // 연결로 나가도 상관없다 — 트랜잭션이 아니기 때문이다. 강화 쪽이 연결을 직접
  // 빌렸던 건 BEGIN과 COMMIT이 같은 연결에 있어야 해서였다.
  const [stacks, gear, upgrades, crops, recipes] = await Promise.all([
    // 별칭에 큰따옴표가 없으면 PostgreSQL이 식별자를 소문자로 눕혀서
    // maxStack이 아니라 maxstack으로 나온다.
    pool.query(
      `SELECT stack_template_id AS "stackTemplateId", name, icon,
              max_stack AS "maxStack"
         FROM stack_template
        ORDER BY stack_template_id`,
    ),

    pool.query(
      `SELECT gear_template_id AS "gearTemplateId", name, slot, rarity,
              base_attack_power  AS "baseAttackPower",
              base_health        AS "baseHealth",
              base_armor         AS "baseArmor",
              base_crit          AS "baseCrit"
         FROM gear_template
        ORDER BY gear_template_id`,
    ),

    // 비용표 열 행을 통째로 보낸다. 클라이언트가 "다음 단계는 얼마"를 그릴 때
    // 서버에 다시 묻지 않게 하려는 것이고, 열 행이면 그래도 될 만큼 작다.
    pool.query(
      `SELECT upgrade_level              AS "upgradeLevel",
              success_rate               AS "successRate",
              crest_stack_template_id    AS "crestStackTemplateId",
              crest_amount               AS "crestAmount",
              material_stack_template_id AS "materialStackTemplateId",
              material_amount            AS "materialAmount"
         FROM upgrade
        ORDER BY upgrade_level`,
    ),

    // growth_time은 INTERVAL이라 그대로 실으면 { minutes: 5 } 같은 객체가 나간다.
    // 화면은 진행률을 계산해야 하므로 숫자가 낫고, EXTRACT(EPOCH FROM ...)이
    // INTERVAL을 초로 편다.
    //
    // TIME_SCALE로 나눈 뒤의 값을 보낸다. 클라이언트가 배속이라는 개념을 몰라도
    // 되고, 배속이 개발용 손잡이라는 사실이 서버 안에 남는다. 나눗셈이 두 곳에
    // 생기지 않는 것도 이유다 — 성장 판정도 서버가 나눠서 한다.
    pool.query(
      `SELECT crop_template_id       AS "cropTemplateId",
              seed_stack_template_id AS "seedStackTemplateId",
              crop_stack_template_id AS "cropStackTemplateId",
              crop_amount            AS "cropAmount",
              harvest_gold           AS "harvestGold",
              -- ::float8 이 없으면 numeric이 되고, pg 드라이버는 numeric을
              -- 정밀도 손실을 피하려고 문자열로 준다. 초 단위 몇백 자리 값에는
              -- 그 걱정이 없으므로 JS 숫자로 받는 편이 화면에서 쓰기 좋다.
              EXTRACT(EPOCH FROM growth_time / $1)::float8 AS "growthSeconds"
         FROM crop_template
        ORDER BY crop_template_id`,
      [TIME_SCALE],
    ),

    pool.query(
      `SELECT recipe_id                    AS "recipeId",
              ingredient_stack_template_id AS "ingredientStackTemplateId",
              ingredient_amount            AS "ingredientAmount",
              crafted_stack_template_id    AS "craftedStackTemplateId",
              crafted_amount               AS "craftedAmount"
         FROM recipe
        ORDER BY recipe_id`,
    ),
  ]);

  return {
    stacks: stacks.rows,
    gear: gear.rows,
    upgrades: upgrades.rows,
    crops: crops.rows,
    recipes: recipes.rows,
  };
}
