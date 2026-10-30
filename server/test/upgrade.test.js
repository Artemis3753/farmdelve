// attemptUpgrade 테스트. 진짜 PostgreSQL(farmdelve_test)에 붙어서 돈다. pg를 가짜로
// 바꾸지 않은 이유: 이 함수가 지키는 약속(재료는 롤백되지 않고, 장비 행은 잠긴다)은
// DB가 지켜 주는 것이라, 가짜 DB로는 그 약속이 지켜지는지 확인할 수 없다.
//
// 올바른 DB에 붙었는지는 setup.js가 매 파일 시작 전에 확인한다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pool from '../db/pool.js';
import { attemptUpgrade } from '../services/upgrade.js';

describe('attemptUpgrade', () => {
  // beforeEach에서 채우고 it에서 읽는다. 서로 다른 함수라 바깥에 선언해야 같이 본다.
  let playerId;
  let createdGearIds;
  let stacksSnapshot;

  // 가방 전체를 "재료 번호 순"으로 읽는다. ORDER BY가 없으면 DB는 행 순서를 보장하지
  // 않아서, 내용이 같아도 순서만 달라 toEqual이 실패할 수 있다.
  async function readStacks() {
    const result = await pool.query(
      `SELECT stack_template_id, amount FROM player_stack
        WHERE player_id = $1
        ORDER BY stack_template_id`,
      [playerId],
    );
    return result.rows;
  }

  async function readUpgradeLevel(gearInstanceId) {
    const result = await pool.query(
      'SELECT upgrade_level FROM gear_instance WHERE gear_instance_id = $1',
      [gearInstanceId],
    );
    return result.rows[0].upgrade_level;
  }

  // 지정한 단계의 장비를 새로 만든다. 시드에는 +10이 없고(가장 높은 게 +3), 시드 행을
  // 고쳐 쓰면 다른 테스트가 그 변경을 물려받을 수 있어서다. gear_instance_id는 DB가
  // 붙여 주는 번호라 RETURNING으로 돌려받는다. 장착 칸에는 넣지 않으므로 이 행은
  // "가방에 있는 장비"이고, 지울 때 FK에 걸리지 않는다.
  //
  // VALUES를 쓴 이유: INSERT ... SELECT의 SELECT 목록에서는 $2 같은 자리표시자의
  // 타입을 DB가 열 타입으로 정해 주지 않아 오류가 날 수 있다.
  async function createGear(upgradeLevel) {
    const result = await pool.query(
      `INSERT INTO gear_instance (gear_template_id, player_id, upgrade_level)
       VALUES ((SELECT gear_template_id FROM gear_template WHERE name = $1), $2, $3)
       RETURNING gear_instance_id`,
      ['Solid Scythe', playerId, upgradeLevel],
    );
    const gearInstanceId = result.rows[0].gear_instance_id;
    createdGearIds.push(gearInstanceId);
    return gearInstanceId;
  }

  beforeEach(async () => {
    const player = await pool.query('SELECT player_id FROM player');
    playerId = player.rows[0].player_id;
    createdGearIds = [];

    // 어떤 테스트는 재료를 지우거나(롤백 테스트) 실제로 태운다(실패 롤 테스트).
    // 시작 상태를 찍어 두었다가 afterEach에서 그대로 되돌린다.
    stacksSnapshot = await readStacks();
  });

  // 테스트가 실패해도 실행된다. 이 테스트가 만든 것은 이 테스트가 치운다.
  afterEach(async () => {
    // vi.spyOn으로 바꿔 둔 Math.random을 원래대로 돌린다. 안 돌리면 다음 테스트도
    // 가짜 난수로 돌게 된다.
    vi.restoreAllMocks();

    await pool.query('DELETE FROM gear_instance WHERE gear_instance_id = ANY($1)', [
      createdGearIds,
    ]);

    // 가방은 통째로 지우고 스냅샷대로 다시 채운다. 테스트가 어떤 행을 지웠든
    // 바꿨든 같은 결과가 되는 가장 단순한 방법이다.
    await pool.query('DELETE FROM player_stack WHERE player_id = $1', [playerId]);
    for (const stack of stacksSnapshot) {
      await pool.query(
        `INSERT INTO player_stack (player_id, stack_template_id, amount)
         VALUES ($1, $2, $3)`,
        [playerId, stack.stack_template_id, stack.amount],
      );
    }
  });

  it('rejects with 409 already_max_level and consumes nothing when the gear is already +10', async () => {
    const maxedGearId = await createGear(10);
    const stacksBefore = await readStacks();

    // 에러를 던지는 비동기 함수는 await expect(...).rejects로 받는다. 이 줄이 빠지면
    // 던져진 에러가 테스트 밖으로 터져서 "단언 실패"가 아니라 "예상 못 한 에러"로 보인다.
    await expect(attemptUpgrade(playerId, maxedGearId)).rejects.toMatchObject({
      status: 409,
      reason: 'already_max_level',
    });

    // 거부만 확인하면 "에러를 던졌지만 재료는 이미 나갔다"는 버그를 놓친다.
    // 재료 소모는 upgrade.js의 만렙 검사보다 뒤에 있어야 하므로 그대로여야 한다.
    const stacksAfter = await readStacks();
    expect(stacksAfter).toEqual(stacksBefore);
  });

  it('rolls back the crest that was already spent when the refining material is missing', async () => {
    // +4 → +5는 crest 2번 1개와 정제 재료 4번 1개가 든다(upgrade 표의 5단계 행).
    // 강화는 crest를 먼저 태우고 정제 재료를 나중에 태운다. 4번만 지워 두면 crest가
    // 이미 소모된 뒤에 막히므로, "쓴 crest가 되돌아오는가"를 볼 수 있다.
    const gearId = await createGear(4);
    await pool.query(
      'DELETE FROM player_stack WHERE player_id = $1 AND stack_template_id = $2',
      [playerId, 4],
    );
    const stacksBefore = await readStacks();

    await expect(attemptUpgrade(playerId, gearId)).rejects.toMatchObject({
      status: 409,
      reason: 'insufficient_materials',
      details: { stackTemplateId: 4, need: 1, held: 0 },
    });

    // 롤백이 없다면 crest 2번이 1개 줄어 있을 것이다.
    const stacksAfter = await readStacks();
    expect(stacksAfter).toEqual(stacksBefore);
    expect(await readUpgradeLevel(gearId)).toBe(4);
  });

  it('burns the materials but keeps the level when the roll fails', async () => {
    // +4 → +5의 성공률은 70%다. Math.random() * 100 = 99는 70보다 크므로 실패한다.
    // 난수를 고정하지 않으면 이 테스트는 30%만 통과하는 도박이 된다.
    const gearId = await createGear(4);
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const stacksBefore = await readStacks();

    const result = await attemptUpgrade(playerId, gearId);

    expect(result.upgraded).toBe(false);
    expect(await readUpgradeLevel(gearId)).toBe(4);

    // "실패는 롤백이 아니다": crest 2번과 정제 재료 4번이 각각 1개씩 나가 있어야 한다.
    const expectedStacks = stacksBefore.map((stack) =>
      [2, 4].includes(stack.stack_template_id)
        ? { ...stack, amount: stack.amount - 1 }
        : stack,
    );
    expect(await readStacks()).toEqual(expectedStacks);
  });
});
