// 게스트 플레이어의 HTTP 쪽 — 검문소(requirePlayerMiddleware), POST /api/guest,
// 쿠키 속성, 속도 제한. 서비스 함수만 불러서는 볼 수 없는 것들이라 진짜 HTTP 요청을
// 보낸다. supertest는 포트를 열지 않고 앱에 요청을 직접 꽂는다.
//
// 테스트마다 createApp()으로 새 앱을 만든다. 속도 제한이 생성 횟수를 서버 메모리에
// 두므로, 앱을 같이 쓰면 앞 테스트의 생성이 GH6의 "5번까지"를 미리 써 버린다.
//
// 케이스 번호 GH1~GH9는 2026-11-23에 J가 승인한 목록이다. GH10은 같은 날 코드 검토에서
// "secure 줄을 지워도 아무 테스트가 못 잡는다"가 드러나 추가했다.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import pool from '../db/pool.js';
import { createApp } from '../app.js';

// 응답의 Set-Cookie 헤더들 중 게스트 쿠키 한 줄. 없으면 undefined.
//
// 헤더를 unknown으로 받는 이유: supertest의 타입은 이 칸을 string으로 적어 두었지만
// Node는 Set-Cookie를 배열로 준다(쿠키마다 한 줄). 타입을 믿지 않고 직접 확인한다.
function guestCookieLine(res: request.Response): string | undefined {
  const header: unknown = res.headers['set-cookie'];
  const lines = Array.isArray(header) ? header.map(String) : [];
  return lines.find((line) => line.startsWith('farmdelve_guest='));
}

describe('guest HTTP', () => {
  let app: ReturnType<typeof createApp>;
  // 이 파일이 만든 게스트의 토큰. afterEach가 지운다(CASCADE로 자식 행까지).
  let createdTokens: string[];

  beforeEach(() => {
    app = createApp();
    createdTokens = [];
  });

  afterEach(async () => {
    // GH10이 바꾼 NODE_ENV를 되돌린다. 테스트가 중간에 실패해도 여기는 돈다.
    vi.unstubAllEnvs();
    await pool.query('DELETE FROM player WHERE guest_token = ANY($1::uuid[])', [createdTokens]);
  });

  // 게스트를 하나 만들고 다음 요청에 실을 Cookie 헤더 값("farmdelve_guest=...")을 돌려준다.
  async function newGuestCookie() {
    const res = await request(app).post('/api/guest');
    expect(res.status).toBe(201);
    const line = guestCookieLine(res);
    if (line === undefined) throw new Error('no guest cookie in the response');

    // "farmdelve_guest=<토큰>; Max-Age=...; ..." 에서 첫 조각만 Cookie 헤더로 쓴다.
    const cookie = line.split(';')[0];
    createdTokens.push(cookie.slice('farmdelve_guest='.length));
    return cookie;
  }

  async function playerIdOf(cookie: string) {
    const token = cookie.slice('farmdelve_guest='.length);
    const result = await pool.query<{ player_id: number }>(
      'SELECT player_id FROM player WHERE guest_token = $1',
      [token],
    );
    return result.rows[0].player_id;
  }

  // 게임 라우트 8개. body가 필요한 라우트는 body까지 맞게 보낸다 — 이 테스트가 재는
  // 건 검문소 하나뿐이어야 해서다. 지금은 검문소가 모든 라우트보다 앞이라 body가
  // 틀려도 401이 먼저 나온다. 하지만 어떤 라우트가 나중에 "body 검사 → 검문소" 순서로
  // 바뀌면, 틀린 body는 검문소가 멀쩡한데도 400을 받아 테스트를 실패시킨다(거짓 경보).
  const gameRoutes = [
    { method: 'post', path: '/api/gear/1/upgrade', body: undefined },
    { method: 'put', path: '/api/gear/1/equip', body: undefined },
    { method: 'post', path: '/api/plots/1/plant', body: { cropTemplateId: 1 } },
    { method: 'post', path: '/api/plots/1/harvest', body: undefined },
    { method: 'post', path: '/api/craft/1', body: undefined },
    { method: 'post', path: '/api/dungeon/enter', body: { tier: 1 } },
    { method: 'post', path: '/api/dungeon/1/complete', body: { cleared: true } },
    { method: 'get', path: '/api/player', body: undefined },
  ] as const;

  function send(route: (typeof gameRoutes)[number], cookie?: string) {
    let req = request(app)[route.method](route.path);
    if (cookie !== undefined) req = req.set('Cookie', cookie);
    return route.body === undefined ? req : req.send(route.body);
  }

  // it.each는 표의 행마다 테스트를 하나씩 만든다. 라우트가 하나 늘면 표에 한 줄만 더한다.
  it.each(gameRoutes)('GH1: $method $path without a cookie is 401 guest_not_found', async (route) => {
    const res = await send(route);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ reason: 'guest_not_found' });
  });

  it('GH2: a cookie that is not UUID-shaped is 401, not a 500 from the database', async () => {
    const res = await request(app).get('/api/player').set('Cookie', 'farmdelve_guest=abc');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ reason: 'guest_not_found' });
  });

  it('GH3: a well-formed token that nobody has is 401', async () => {
    const res = await request(app)
      .get('/api/player')
      .set('Cookie', `farmdelve_guest=${randomUUID()}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ reason: 'guest_not_found' });
  });

  it('GH4: POST /api/guest is 201 with an httpOnly, SameSite=Lax, one-year cookie and no token in the body', async () => {
    const res = await request(app).post('/api/guest');

    expect(res.status).toBe(201);
    const line = guestCookieLine(res);
    expect(line).toBeDefined();
    const token = line!.split(';')[0].slice('farmdelve_guest='.length);
    createdTokens.push(token);

    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(line).toContain('HttpOnly');
    expect(line).toContain('SameSite=Lax');
    expect(line).toContain('Max-Age=31536000');
    expect(line).toContain('Path=/');
    // vitest는 NODE_ENV를 'test'로 둔다. Secure는 production에서만 붙어야 한다.
    expect(line).not.toContain('Secure');

    // 토큰이 body에 새어 나가면 httpOnly로 숨긴 의미가 없다.
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('GH5: the cookie picks the guest, not player 1', async () => {
    const cookie = await newGuestCookie();

    // 시작 상태만으로는 seed 플레이어와 구분이 안 된다(둘 다 골드 0). 이 게스트의
    // 골드만 DB에서 바꿔 두고, 응답에 그 값이 나오는지 본다.
    await pool.query('UPDATE player SET gold = 777 WHERE player_id = $1', [await playerIdOf(cookie)]);

    const res = await request(app).get('/api/player').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.gold).toBe(777);
    expect(res.body.plots).toHaveLength(25);
  });

  it('GH6: the same IP can create 5 guests an hour; the 6th is 429', async () => {
    for (let i = 0; i < 5; i++) {
      await newGuestCookie();
    }

    const res = await request(app).post('/api/guest');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ reason: 'too_many_guests' });
    expect(guestCookieLine(res)).toBeUndefined();
  });

  it('GH7: /api/health and /api/templates stay open without a cookie', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/templates')).status).toBe(200);
  });

  it("GH8: one guest's planting does not show up in another guest's field", async () => {
    const cookieA = await newGuestCookie();
    const cookieB = await newGuestCookie();

    const wheat = await pool.query<{ crop_template_id: number }>(
      `SELECT c.crop_template_id FROM crop_template c
         JOIN stack_template s ON s.stack_template_id = c.seed_stack_template_id
        WHERE s.name = 'Wheat Seed'`,
    );
    const planted = await request(app)
      .post('/api/plots/1/plant')
      .set('Cookie', cookieA)
      .send({ cropTemplateId: wheat.rows[0].crop_template_id });
    expect(planted.status).toBe(200);

    const fieldA = await request(app).get('/api/player').set('Cookie', cookieA);
    const fieldB = await request(app).get('/api/player').set('Cookie', cookieB);
    expect(fieldA.body.plots[0].cropTemplateId).toBe(wheat.rows[0].crop_template_id);
    expect(fieldB.body.plots[0].cropTemplateId).toBeNull();
  });

  it('GH9: POST /api/guest with a valid cookie keeps that guest and creates nothing', async () => {
    const cookie = await newGuestCookie();
    const before = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM player');

    const res = await request(app).post('/api/guest').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: false });
    expect(guestCookieLine(res)).toBeUndefined();
    const after = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM player');
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  // GH4의 짝. GH4는 "개발에서는 Secure가 없다"만 봐서, secure 옵션 줄을 통째로 지워도
  // 통과한다 — 그러면 배포 쿠키가 HTTP 요청에도 실려 나간다. 이 테스트가 반대쪽을 본다.
  //
  // 테스트 도중에 NODE_ENV를 바꿔도 되는 이유: app.ts가 이 값을 서버 시작 때가 아니라
  // 발급 요청이 올 때마다 읽는다.
  it('GH10: in production the guest cookie is Secure', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const res = await request(app).post('/api/guest');

    expect(res.status).toBe(201);
    const line = guestCookieLine(res);
    expect(line).toBeDefined();
    createdTokens.push(line!.split(';')[0].slice('farmdelve_guest='.length));
    expect(line).toContain('Secure');
  });
});
