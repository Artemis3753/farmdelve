// 배포 준비(AWS 단계 ①, 2026-11-23) — trust proxy와 월 1회 게스트 정리.
//
// trust proxy 테스트는 CloudFront 없이 CloudFront를 흉내 낸다. CloudFront가 하는 일은
// X-Forwarded-For 헤더 끝에 방문자 IP를 덧붙이는 것뿐이라, 그 헤더를 직접 적어 보내면
// 된다. 주소는 문서용으로 비워 둔 203.0.113.0/24 대역(RFC 5737)이라 실제 누구도 아니다.
//
// trust proxy가 꺼진 채 X-Forwarded-For가 오는 테스트(DP2)는 express-rate-limit이
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR 경고를 한 번 찍는다. 그 상황을 일부러 만든
// 것이라 정상이다. vitest는 통과한 테스트의 로그를 숨겨서 평소엔 안 보이고,
// `npx vitest run --silent=false`로 돌리면 보인다(2026-11-23 확인).
import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import pool from '../db/pool.js';
import { createApp } from '../app.js';
import { createGuest } from '../services/guest.js';

// 이 파일이 만든 게스트의 토큰. afterEach가 지운다(CASCADE로 자식 행까지).
let createdTokens: string[];

beforeEach(() => {
  createdTokens = [];
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await pool.query('DELETE FROM player WHERE guest_token = ANY($1::uuid[])', [createdTokens]);
});

describe('trust proxy', () => {
  // X-Forwarded-For를 실어 게스트를 만들고, 만들어졌으면 토큰을 정리 목록에 넣는다.
  async function postGuest(app: ReturnType<typeof createApp>, forwardedFor: string) {
    const res = await request(app).post('/api/guest').set('X-Forwarded-For', forwardedFor);

    const header: unknown = res.headers['set-cookie'];
    const lines = Array.isArray(header) ? header.map(String) : [];
    const line = lines.find((l) => l.startsWith('farmdelve_guest='));
    if (line !== undefined) {
      createdTokens.push(line.split(';')[0].slice('farmdelve_guest='.length));
    }
    return res;
  }

  it('DP1: behind one proxy, six visitors from six IPs each get a guest', async () => {
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    const app = createApp();

    for (let i = 1; i <= 6; i++) {
      const res = await postGuest(app, `203.0.113.${i}`);
      expect(res.status).toBe(201);
    }
  });

  // DP1의 짝. 설정이 없으면 헤더를 아무리 바꿔도 한 사람(실제 접속 주소)으로 센다.
  // CloudFront 없이 IP로 열었을 때 방문자가 헤더를 지어내 제한을 피하지 못한다는 증명.
  it('DP2: with no setting, a made-up X-Forwarded-For is ignored and the 6th is 429', async () => {
    const app = createApp();

    for (let i = 1; i <= 5; i++) {
      expect((await postGuest(app, `203.0.113.${i}`)).status).toBe(201);
    }
    const res = await postGuest(app, '203.0.113.6');
    expect(res.status).toBe(429);
  });

  // CloudFront 뒤에서의 위조. 방문자가 헤더에 가짜 주소를 적어 보내면 CloudFront는
  // 그걸 지우지 않고 끝에 진짜 주소를 덧붙인다: "가짜, 진짜". 맨 끝 한 칸만 믿으니
  // 앞 칸을 매번 바꿔도 같은 사람으로 센다.
  it('DP3: behind one proxy, changing the first entry does not dodge the limit', async () => {
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    const app = createApp();

    for (let i = 1; i <= 5; i++) {
      expect((await postGuest(app, `198.51.100.${i}, 203.0.113.50`)).status).toBe(201);
    }
    const res = await postGuest(app, '198.51.100.6, 203.0.113.50');
    expect(res.status).toBe(429);
  });

  it('DP4: a value that is not a whole number stops the server from starting', () => {
    vi.stubEnv('TRUST_PROXY_HOPS', 'true');
    expect(() => createApp()).toThrow('TRUST_PROXY_HOPS');
  });
});

describe('guest cleanup', () => {
  // SQL 파일을 그대로 읽어 실행한다. cron이 psql로 돌릴 바로 그 파일이다.
  //
  // 한 트랜잭션 안에서 실행하고 끝에 ROLLBACK한다. 이 DELETE는 테이블 전체를 대상으로
  // 하므로, 그냥 돌리면 오래전에 seed한 로컬 테스트 DB에서는 플레이어 1까지 지워
  // upgrade.test.ts가 깨진다. 확인은 같은 연결(client) 안에서 하므로 지워진 모습이 보인다.
  it('DP5: removes a guest unseen for 31 days with its rows, and keeps one seen 29 days ago', async () => {
    const oldToken = await createGuest();
    const recentToken = await createGuest();
    createdTokens.push(oldToken, recentToken);

    await pool.query(
      `UPDATE player SET last_seen_at = now() - interval '31 days' WHERE guest_token = $1`,
      [oldToken],
    );
    await pool.query(
      `UPDATE player SET last_seen_at = now() - interval '29 days' WHERE guest_token = $1`,
      [recentToken],
    );
    const ids = await pool.query<{ player_id: number; guest_token: string }>(
      'SELECT player_id, guest_token FROM player WHERE guest_token = ANY($1::uuid[])',
      [[oldToken, recentToken]],
    );
    const oldId = ids.rows.find((r) => r.guest_token === oldToken)!.player_id;
    const recentId = ids.rows.find((r) => r.guest_token === recentToken)!.player_id;

    const sql = await readFile(new URL('../db/cleanup-guests.sql', import.meta.url), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);

      const players = await client.query<{ player_id: number }>(
        'SELECT player_id FROM player WHERE player_id = ANY($1::int[])',
        [[oldId, recentId]],
      );
      expect(players.rows.map((r) => r.player_id)).toEqual([recentId]);

      // CASCADE 확인 — 밭 25칸이 플레이어와 함께 사라졌는지, 남은 쪽은 그대로인지.
      const plots = await client.query<{ player_id: number; count: number }>(
        `SELECT player_id, count(*)::int AS count FROM player_plot
          WHERE player_id = ANY($1::int[]) GROUP BY player_id`,
        [[oldId, recentId]],
      );
      expect(plots.rows).toEqual([{ player_id: recentId, count: 25 }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
