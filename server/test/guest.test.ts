// 게스트 플레이어 테스트 — DB 함수 create_player()와 services/guest.ts.
// upgrade.test.ts와 같은 이유로 진짜 PostgreSQL(farmdelve_test)에 붙는다. 여기서
// 지키는 약속(시작 상태, CASCADE, 토큰 조회)은 전부 DB가 지켜 주는 것이다.
//
// 케이스 번호 GP1~GP6은 2026-11-23에 J가 승인한 목록이다.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import pool from '../db/pool.js';
import { createGuest, touchGuest } from '../services/guest.js';

describe('guest players', () => {
  // 이 파일이 만든 플레이어. afterEach가 한 줄로 지운다 — CASCADE 덕분에 자식
  // 행(장비·재료·칸·밭·런)을 따로 지울 필요가 없다. upgrade.test.ts는
  // "SELECT player_id FROM player"로 seed 플레이어를 찾으므로, 여기서 만든
  // 플레이어가 남으면 그 테스트가 엉뚱한 플레이어를 집을 수 있다.
  let createdPlayerIds: number[];

  beforeEach(() => {
    createdPlayerIds = [];
  });

  afterEach(async () => {
    await pool.query('DELETE FROM player WHERE player_id = ANY($1)', [createdPlayerIds]);
  });

  async function createPlayer() {
    const result = await pool.query<{ player_id: number }>(
      'SELECT create_player() AS player_id',
    );
    const playerId = result.rows[0].player_id;
    createdPlayerIds.push(playerId);
    return playerId;
  }

  // 한 플레이어가 자식 테이블마다 몇 행을 가졌는지. GP2·GP6이 "다른 플레이어는
  // 그대로인가"를 같은 자로 재려고 묶었다.
  async function countRows(playerId: number) {
    const result = await pool.query<{
      gear: number;
      slots: number;
      stacks: number;
      plots: number;
      runs: number;
    }>(
      // count(*)는 bigint라 pg가 문자열로 준다. ::int로 바꿔 숫자로 받는다.
      `SELECT
         (SELECT count(*) FROM gear_instance    WHERE player_id = $1)::int AS gear,
         (SELECT count(*) FROM player_gear_slot WHERE player_id = $1)::int AS slots,
         (SELECT count(*) FROM player_stack     WHERE player_id = $1)::int AS stacks,
         (SELECT count(*) FROM player_plot      WHERE player_id = $1)::int AS plots,
         (SELECT count(*) FROM dungeon_run      WHERE player_id = $1)::int AS runs`,
      [playerId],
    );
    return result.rows[0];
  }

  it('GP1: create_player() gives the same starting state the seed used to give', async () => {
    const playerId = await createPlayer();

    const player = await pool.query<{
      gold: number;
      highest_tier_cleared: number;
      guest_token: string | null;
    }>(
      'SELECT gold, highest_tier_cleared, guest_token FROM player WHERE player_id = $1',
      [playerId],
    );
    expect(player.rows[0]).toMatchObject({ gold: 0, highest_tier_cleared: 0 });
    expect(player.rows[0].guest_token).toEqual(expect.any(String));

    // 장비는 이름과 단계로 비교한다. id는 DB가 매기는 번호라 테스트마다 달라진다.
    const gear = await pool.query<{ name: string; upgrade_level: number }>(
      `SELECT t.name, i.upgrade_level
         FROM gear_instance i
         JOIN gear_template t ON t.gear_template_id = i.gear_template_id
        WHERE i.player_id = $1
        ORDER BY t.name, i.upgrade_level`,
      [playerId],
    );
    expect(gear.rows).toEqual([
      { name: 'Muck Boots', upgrade_level: 0 },
      { name: 'Solid Scythe', upgrade_level: 0 },
      { name: 'Solid Scythe', upgrade_level: 3 },
      { name: 'Straw Hat', upgrade_level: 0 },
      { name: 'Straw Hat', upgrade_level: 3 },
      { name: 'Work Shirt', upgrade_level: 0 },
      { name: 'Work Trousers', upgrade_level: 0 },
    ]);

    // 다섯 칸 모두 찼고, 끼워진 것은 +0짜리(갓 받은 장비)다. +3 여분은 가방에 있어야 한다.
    const slots = await pool.query<{ slot: string; upgrade_level: number }>(
      `SELECT s.slot, i.upgrade_level
         FROM player_gear_slot s
         JOIN gear_instance i ON i.gear_instance_id = s.gear_instance_id
        WHERE s.player_id = $1
        ORDER BY s.slot`,
      [playerId],
    );
    expect(slots.rows).toEqual([
      { slot: 'chest', upgrade_level: 0 },
      { slot: 'feet', upgrade_level: 0 },
      { slot: 'head', upgrade_level: 0 },
      { slot: 'legs', upgrade_level: 0 },
      { slot: 'weapon', upgrade_level: 0 },
    ]);

    const stacks = await pool.query<{ name: string; amount: number }>(
      `SELECT t.name, s.amount
         FROM player_stack s
         JOIN stack_template t ON t.stack_template_id = s.stack_template_id
        WHERE s.player_id = $1
        ORDER BY t.name`,
      [playerId],
    );
    expect(stacks.rows).toEqual([
      { name: 'Chili Pepper Seed', amount: 10 },
      { name: 'Harvest Crest', amount: 20 },
      { name: 'Ironroot Seed', amount: 10 },
      { name: 'Potato Seed', amount: 10 },
      { name: 'Refined Ironroot', amount: 40 },
      { name: 'Seed Crest', amount: 20 },
      { name: 'Sprout Crest', amount: 20 },
      { name: 'Wheat Seed', amount: 10 },
    ]);

    // 밭은 1~25번이 전부 빈 칸이어야 한다.
    const plots = await pool.query<{ plot_number: number; crop_template_id: number | null }>(
      `SELECT plot_number, crop_template_id FROM player_plot
        WHERE player_id = $1 ORDER BY plot_number`,
      [playerId],
    );
    expect(plots.rows.map((p) => p.plot_number)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect(plots.rows.every((p) => p.crop_template_id === null)).toBe(true);
  });

  it('GP2: a second player gets their own token and gear, and the first player is untouched', async () => {
    const firstId = await createPlayer();
    const firstBefore = await countRows(firstId);
    const secondId = await createPlayer();

    const tokens = await pool.query<{ guest_token: string }>(
      'SELECT guest_token FROM player WHERE player_id = ANY($1)',
      [[firstId, secondId]],
    );
    expect(new Set(tokens.rows.map((r) => r.guest_token)).size).toBe(2);

    // 두 번째 플레이어의 다섯 칸이 전부 "자기 장비"를 가리켜야 한다. seed의 원래
    // 블록을 옮기면서 WHERE를 빠뜨리면 남의 장비를 끼우려다 여기서 터진다.
    const ownSlots = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM player_gear_slot s
         JOIN gear_instance i ON i.gear_instance_id = s.gear_instance_id
        WHERE s.player_id = $1 AND i.player_id = $1`,
      [secondId],
    );
    expect(ownSlots.rows[0].count).toBe(5);

    expect(await countRows(firstId)).toEqual(firstBefore);
  });

  it('GP3: createGuest() returns a token that belongs to a fully created player', async () => {
    const token = await createGuest();

    const result = await pool.query<{ player_id: number }>(
      'SELECT player_id FROM player WHERE guest_token = $1',
      [token],
    );
    expect(result.rowCount).toBe(1);
    const playerId = result.rows[0].player_id;
    createdPlayerIds.push(playerId);

    // 행 하나만 INSERT한 빈 플레이어가 아니라 create_player()를 거친 플레이어인지.
    expect(await countRows(playerId)).toMatchObject({ gear: 7, slots: 5, stacks: 8, plots: 25 });
  });

  it('GP4: touchGuest() returns the player id and moves last_seen_at forward', async () => {
    const playerId = await createPlayer();
    const player = await pool.query<{ guest_token: string }>(
      'SELECT guest_token FROM player WHERE player_id = $1',
      [playerId],
    );

    // 방금 만든 플레이어는 last_seen_at이 이미 지금이라, 갱신됐는지 구분이 안 된다.
    // 40일 전으로 돌려 두면 "정리 대상이던 게스트가 돌아왔다"는 장면이 된다.
    await pool.query(
      `UPDATE player SET last_seen_at = now() - INTERVAL '40 days' WHERE player_id = $1`,
      [playerId],
    );

    expect(await touchGuest(player.rows[0].guest_token)).toBe(playerId);

    const after = await pool.query<{ recent: boolean }>(
      `SELECT last_seen_at > now() - INTERVAL '1 minute' AS recent
         FROM player WHERE player_id = $1`,
      [playerId],
    );
    expect(after.rows[0].recent).toBe(true);
  });

  it('GP5: touchGuest() returns null for a well-formed token nobody has', async () => {
    // 30일 정리로 지워진 게스트의 쿠키가 이 모양이다. 형식은 맞으니 DB까지 간다.
    expect(await touchGuest(randomUUID())).toBeNull();
  });

  it('GP6: deleting a player removes their rows in all five child tables and nothing else', async () => {
    const goneId = await createPlayer();
    const keptId = await createPlayer();

    // 다섯 번째 자식(던전 런)은 시작 상태에 없어서 직접 하나 만든다.
    await pool.query(
      `INSERT INTO dungeon_run (player_id, dungeon_template_id, tier, status)
       VALUES ($1, (SELECT dungeon_template_id FROM dungeon_template LIMIT 1), 1, 'ongoing')`,
      [goneId],
    );
    expect((await countRows(goneId)).runs).toBe(1);
    const keptBefore = await countRows(keptId);

    await pool.query('DELETE FROM player WHERE player_id = $1', [goneId]);

    expect(await countRows(goneId)).toEqual({ gear: 0, slots: 0, stacks: 0, plots: 0, runs: 0 });
    expect(await countRows(keptId)).toEqual(keptBefore);
  });
});
