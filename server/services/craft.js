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
export async function craftItem(playerId, recipeId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 레시피는 정의 테이블이라 잠그지 않는다. 아무도 바꾸지 않는 값이고,
    // 잠그면 같은 레시피를 쓰는 요청들이 서로를 기다리게 될 뿐이다.
    const recipe = await client.query(
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
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
