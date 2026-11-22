// 정제. 재료 한 종류를 태워 결과물 한 종류를 만든다.
//
// 오늘 만든 부품 두 개를 조립하는 자리다 — 깎는 건 spendStack, 넣는 건
// gainStack. 강화와 뼈대가 같지만 주사위가 없어서 갈림길도 없다: 재료가
// 충분하면 반드시 만들어지고, 모자라면 아무것도 안 바뀐다.
//
// 레시피가 재료 한 종류만 받는 것은 schema.sql이 그렇게 정해서다. 두 종류를
// 받는 레시피가 생기는 날 recipe를 둘로 쪼개면 되고, 그 전에는 아니다.

import pool from '../db/pool.js';
import { serviceError } from './errors.js';
import { spendStack, gainStack } from './stack.js';

// 레시피 하나를 1회분 만든다. 다섯 번 만들려면 다섯 번 부른다 — 강화와 심기가
// 그랬듯 한 번의 요청이 한 번의 행위에 대응한다.
//
// player 행을 잠그지 않는 것에 주의. 잠금 순서는 player → 밭 칸/장비 → 스택으로
// 통일했는데, 정제는 골드를 건드리지 않아서 맨 앞 칸을 쓸 일이 없다. 순서를 지킨다는
// 것은 "항상 전부 잠근다"가 아니라 "잠그는 것들의 앞뒤를 뒤집지 않는다"는 뜻이다.
//
// 반환 타입은 equip과 같은 이유로 적지 않는다(2026-11-22 결정).
export async function craftItem(playerId: number, recipeId: number) {
  // client에 타입을 적지 않는 이유: pool.connect()가 PoolClient를 돌려준다고
  // @types/pg가 이미 알려 주므로 TS가 알아서 붙인다. 적어도 같은 말의 반복이다.
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 레시피는 정의 테이블이라 잠그지 않는다. 아무도 바꾸지 않는 값이고,
    // 잠그면 같은 레시피를 쓰는 요청들이 서로를 기다리게 될 뿐이다.
    //
    // 제네릭의 키가 snake_case인 이유: pg는 열 이름을 바꾸지 않고 그대로 행의
    // 키로 쓴다. 약속은 "DB가 실제로 주는 모양"이어야 하므로 SELECT와 똑같이
    // 적는다. camelCase로 바꾸는 건 아래 구조 분해의 몫이다.
    //
    // 넷 다 number인 이유: schema.sql에서 네 열이 모두 INTEGER이고, pg는
    // INTEGER를 JS 숫자로 바꿔 준다. BIGINT나 NUMERIC이었다면 JS 숫자로
    // 정확히 담을 수 없어서 문자열로 오므로 string이 맞았다.
    const recipe = await client.query<{
      ingredient_stack_template_id: number;
      ingredient_amount: number;
      crafted_stack_template_id: number;
      crafted_amount: number;
    }>(
      `SELECT ingredient_stack_template_id, ingredient_amount,
              crafted_stack_template_id, crafted_amount
         FROM recipe
        WHERE recipe_id = $1`,
      [recipeId],
    );

    // recipeId는 클라이언트가 보낸 값이라 신뢰 경계 바깥이다. 심기의
    // cropTemplateId와 같은 이유로 검사가 필요하다.
    if (recipe.rowCount === 0) {
      throw serviceError(404, 'recipe_not_found');
    }

    // SQL의 snake_case 컬럼명을 JS의 camelCase로 갈아끼우며 꺼낸다.
    const {
      ingredient_stack_template_id: ingredientId,
      ingredient_amount: ingredientNeed,
      crafted_stack_template_id: craftedId,
      crafted_amount: craftedAmount,
    } = recipe.rows[0];

    // 깎기가 먼저, 넣기가 나중이다. 결과는 어느 쪽이 먼저든 같지만, 강화에서
    // 세운 "차감이 먼저"라는 규칙과 읽히는 순서를 맞춘다.
    // 모자라면 spendStack이 409를 던지고 아래 catch가 전부 롤백한다.
    //
    // stack.js가 아직 JS라 두 반환값은 지금 any다. stack을 변환하면 이 파일을
    // 고치지 않아도 number로 바뀐다.
    const ingredientLeft = await spendStack(client, playerId, ingredientId, ingredientNeed);
    const craftedTotal = await gainStack(client, playerId, craftedId, craftedAmount);

    await client.query('COMMIT');

    // 바뀐 스택 둘만 싣는다. 강화·수확과 같은 모양이라 클라이언트가 같은 코드로
    // 가방 숫자를 갱신할 수 있다.
    return {
      stacks: [
        { stackTemplateId: ingredientId, amount: ingredientLeft },
        { stackTemplateId: craftedId, amount: craftedTotal },
      ],
    };
  } catch (err) {
    // strict에서 err의 타입은 unknown이다 — throw는 문자열이든 숫자든 무엇이든
    // 던질 수 있어서 TS가 모양을 장담하지 못한다. 여기선 꺼내 쓰지 않고 그대로
    // 다시 던지기만 하므로 좁힐 필요가 없다.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
