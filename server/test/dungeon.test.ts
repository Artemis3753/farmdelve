// completeDungeon의 클리어 보상 테스트. 진짜 PostgreSQL(farmdelve_test)에 붙어서 돈다 —
// upgrade.test.ts와 같은 이유로, 지키려는 약속(보상이 한 번만 들어간다, 실패하면 아무것도
// 안 바뀐다)이 DB 트랜잭션이 지켜 주는 것이라 가짜 DB로는 확인할 수 없다.
//
// 테스트마다 빈 플레이어를 새로 만든다. 시드 플레이어의 골드·가방을 고쳐 쓰면 스냅샷으로
// 되돌려야 하는데, 새 플레이어는 지우기만 하면 런과 가방이 ON DELETE CASCADE로 같이 사라진다.
//
// 런은 enterDungeon을 거치지 않고 직접 INSERT한다. 시작 시각을 과거로 돌려 "시간 초과"를
// 만들고, 입장 자격(highest + 2)에 막히지 않고 5티어 런을 만들기 위해서다.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pool from '../db/pool.js';
import { completeDungeon } from '../services/dungeon.js';

describe('completeDungeon rewards', () => {
  let createdPlayerIds: number[];

  // 문장 이름 → stack_template_id. 시드의 번호를 숫자로 박아 두면 시드 순서가 바뀔 때
  // 테스트가 엉뚱한 재료를 보게 된다.
  async function stackIdOf(name: string) {
    const result = await pool.query<{ stack_template_id: number }>(
      'SELECT stack_template_id FROM stack_template WHERE name = $1',
      [name],
    );
    return result.rows[0].stack_template_id;
  }

  // 골드 0, 가방 빈, 아무것도 못 깬 플레이어. player의 모든 컬럼에 기본값이 있다.
  async function createPlayer() {
    const result = await pool.query<{ player_id: number }>(
      'INSERT INTO player DEFAULT VALUES RETURNING player_id',
    );
    createdPlayerIds.push(result.rows[0].player_id);
    return result.rows[0].player_id;
  }

  // 진행 중인 런 하나. startedAgo는 PostgreSQL INTERVAL 문자열이다('1 minute'이면 1분 전 시작).
  async function createRun(playerId: number, { tier = 1, startedAgo = '1 minute' } = {}) {
    const result = await pool.query<{ dungeon_run_id: number }>(
      `INSERT INTO dungeon_run (player_id, dungeon_template_id, tier, status, start_time)
       VALUES ($1, (SELECT dungeon_template_id FROM dungeon_template LIMIT 1), $2, 'ongoing',
               now() - $3::interval)
       RETURNING dungeon_run_id`,
      [playerId, tier, startedAgo],
    );
    return result.rows[0].dungeon_run_id;
  }

  async function readGold(playerId: number) {
    const result = await pool.query<{ gold: number }>('SELECT gold FROM player WHERE player_id = $1', [
      playerId,
    ]);
    return result.rows[0].gold;
  }

  async function readStacks(playerId: number) {
    const result = await pool.query<{ stack_template_id: number; amount: number }>(
      `SELECT stack_template_id, amount FROM player_stack
        WHERE player_id = $1
        ORDER BY stack_template_id`,
      [playerId],
    );
    return result.rows;
  }

  beforeEach(() => {
    createdPlayerIds = [];
  });

  // 플레이어를 지우면 런과 가방은 CASCADE로 같이 지워진다.
  afterEach(async () => {
    await pool.query('DELETE FROM player WHERE player_id = ANY($1)', [createdPlayerIds]);
  });

  it('R1: an in-time clear pays 100 gold and 5 Seed Crests, creating the crest row', async () => {
    const playerId = await createPlayer();
    const runId = await createRun(playerId);
    const seedCrest = await stackIdOf('Seed Crest');

    const result = await completeDungeon(playerId, runId, true);

    expect(result).toEqual({
      status: 'cleared',
      overtime: false,
      highestTierCleared: 1,
      stacks: [{ stackTemplateId: seedCrest, amount: 5 }],
      gold: 100,
      gained: { gold: 100, crests: 5 },
    });
    expect(await readGold(playerId)).toBe(100);
    expect(await readStacks(playerId)).toEqual([{ stack_template_id: seedCrest, amount: 5 }]);
  });

  it('R2: the crests add to the ones already in the bag', async () => {
    const playerId = await createPlayer();
    const seedCrest = await stackIdOf('Seed Crest');
    await pool.query(
      'INSERT INTO player_stack (player_id, stack_template_id, amount) VALUES ($1, $2, 3)',
      [playerId, seedCrest],
    );
    const runId = await createRun(playerId);

    const result = await completeDungeon(playerId, runId, true);

    expect(result.stacks).toEqual([{ stackTemplateId: seedCrest, amount: 8 }]);
    expect(await readStacks(playerId)).toEqual([{ stack_template_id: seedCrest, amount: 8 }]);
  });

  it('R3: an overtime clear pays half the gold and no crests', async () => {
    // 1티어 제한은 5분이라 6분 전에 시작한 런은 시간 초과다.
    const playerId = await createPlayer();
    const runId = await createRun(playerId, { startedAgo: '6 minutes' });

    const result = await completeDungeon(playerId, runId, true);

    expect(result).toEqual({
      status: 'cleared',
      overtime: true,
      highestTierCleared: null,
      stacks: [],
      gold: 50,
      gained: { gold: 50, crests: 0 },
    });
    expect(await readGold(playerId)).toBe(50);
    expect(await readStacks(playerId)).toEqual([]);
  });

  it('R4: a failed run pays nothing', async () => {
    const playerId = await createPlayer();
    const runId = await createRun(playerId);

    const result = await completeDungeon(playerId, runId, false);

    expect(result).toEqual({
      status: 'failed',
      overtime: false,
      highestTierCleared: null,
      stacks: [],
      gold: 0,
      gained: { gold: 0, crests: 0 },
    });
    expect(await readGold(playerId)).toBe(0);
    expect(await readStacks(playerId)).toEqual([]);
  });

  it('R5: ending a run that already ended is refused, and the reward is not paid twice', async () => {
    const playerId = await createPlayer();
    const runId = await createRun(playerId);
    await completeDungeon(playerId, runId, true);
    const stacksBefore = await readStacks(playerId);

    await expect(completeDungeon(playerId, runId, true)).rejects.toMatchObject({
      status: 409,
      reason: 'run_already_ended',
    });

    expect(await readGold(playerId)).toBe(100);
    expect(await readStacks(playerId)).toEqual(stacksBefore);
  });

  it("R6: someone else's run is not found, and neither player gains anything", async () => {
    const ownerId = await createPlayer();
    const otherId = await createPlayer();
    const runId = await createRun(ownerId);

    await expect(completeDungeon(otherId, runId, true)).rejects.toMatchObject({
      status: 404,
      reason: 'run_not_found',
    });

    expect(await readGold(otherId)).toBe(0);
    expect(await readStacks(otherId)).toEqual([]);
    expect(await readGold(ownerId)).toBe(0);
    expect(await readStacks(ownerId)).toEqual([]);
  });

  // 5티어 행의 보상을 잠깐 바꿨다가 되돌린다. 시드는 모든 티어가 골드 100·문장 5라서, 코드에
  // 100과 5를 박아 둬도 테스트가 구분하지 못한다(변이 검사에서 살아남았다). 다른 값으로 바꿔야
  // "표에서 읽는다"가 증명된다. 45는 홀수라 시간 초과의 절반이 내림인지도 함께 가른다.
  //
  // 테스트 파일들이 한 DB를 차례로 쓰므로(fileParallelism: false) 이 테스트 동안 다른 파일이
  // 5티어 행을 읽을 일은 없다. 실패해도 finally가 되돌린다.
  async function withTier5Reward(gold: number, crests: number, body: () => Promise<void>) {
    const before = await pool.query<{ reward_gold: number; reward_crest_amount: number }>(
      'SELECT reward_gold, reward_crest_amount FROM dungeon_tier_template WHERE tier = 5',
    );
    await pool.query(
      'UPDATE dungeon_tier_template SET reward_gold = $1, reward_crest_amount = $2 WHERE tier = 5',
      [gold, crests],
    );
    try {
      await body();
    } finally {
      await pool.query(
        'UPDATE dungeon_tier_template SET reward_gold = $1, reward_crest_amount = $2 WHERE tier = 5',
        [before.rows[0].reward_gold, before.rows[0].reward_crest_amount],
      );
    }
  }

  it("R7: the reward comes from the run's tier row — tier 5 pays its own gold and Sprout Crests", async () => {
    // 5티어 제한은 10분이라 1분 전에 시작한 런은 시간 안이다.
    const playerId = await createPlayer();
    const runId = await createRun(playerId, { tier: 5 });
    const sproutCrest = await stackIdOf('Sprout Crest');

    await withTier5Reward(45, 2, async () => {
      const result = await completeDungeon(playerId, runId, true);

      expect(result.stacks).toEqual([{ stackTemplateId: sproutCrest, amount: 2 }]);
      expect(result.gained).toEqual({ gold: 45, crests: 2 });
      // 응답만 보면 "응답에는 Sprout라고 쓰고 가방에는 다른 문장을 넣는" 버그를 놓친다.
      expect(await readStacks(playerId)).toEqual([{ stack_template_id: sproutCrest, amount: 2 }]);
      expect(await readGold(playerId)).toBe(45);
    });
  });

  it('R8: half of an odd gold reward rounds down on an overtime clear', async () => {
    // 5티어 제한 10분을 넘긴 런. 45의 절반 22.5는 내림해서 22다(올림이면 23).
    const playerId = await createPlayer();
    const runId = await createRun(playerId, { tier: 5, startedAgo: '11 minutes' });

    await withTier5Reward(45, 2, async () => {
      const result = await completeDungeon(playerId, runId, true);

      expect(result.gained).toEqual({ gold: 22, crests: 0 });
      expect(await readGold(playerId)).toBe(22);
    });
  });
});
