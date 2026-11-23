// 게스트 플레이어 — 로그인 없이 방문자마다 플레이어 하나를 내주는 쪽(2026-11-23).
//
// 쿠키를 읽고 쓰는 일, 상태 코드를 정하는 일은 여기 없다. 그건 HTTP 번역이라
// app.ts의 requirePlayerMiddleware와 POST /api/guest가 맡는다. 여기는 DB만 만진다 —
// 다른 서비스들과 같은 경계다.

import pool from '../db/pool.js';

// 새 게스트를 만들고 그 토큰을 돌려준다. 시작 상태(장비·재료·밭·씨앗)는
// schema.sql의 create_player()가 넣는다 — seed가 개발용 플레이어를 만들 때와 같은
// 함수라, 게스트와 개발용 플레이어가 같은 상태로 시작한다.
//
// 쿼리가 둘인 이유: "SELECT guest_token FROM player WHERE player_id = create_player()"
// 처럼 한 문장으로 합치면 새 행이 안 보인다. 바깥 SELECT는 문장이 시작된 순간의
// 모습(스냅샷)을 읽는데, 함수가 INSERT한 행은 그 뒤에 생겼기 때문이다. 문장을
// 나누면 두 번째 문장은 새 스냅샷으로 읽어서 방금 만든 행이 보인다.
//
// 합치면 안 되는 이유가 하나 더 있다. WHERE 안의 함수는 행 하나를 비교할 때마다 다시
// 불린다 — 플레이어가 N명이면 create_player()가 N번 돌아 N명이 새로 생긴다
// (2026-11-23 실측: 3명이던 테이블에서 한 번 돌리자 6명, 결과는 0행). 둘 중 이쪽이
// 더 위험하다. 에러 없이 행만 불어난다.
//
// 트랜잭션으로 묶지 않는 이유: 만드는 쪽은 첫 문장 하나로 끝나고(함수 호출 한 번이
// 통째로 성공하거나 통째로 취소된다), 두 번째 문장은 읽기만 한다.
export async function createGuest() {
  const created = await pool.query<{ player_id: number }>(
    'SELECT create_player() AS player_id',
  );

  // UUID 열은 pg가 문자열로 준다. 쿠키 값도 문자열이라 그대로 실을 수 있다.
  const result = await pool.query<{ guest_token: string }>(
    'SELECT guest_token FROM player WHERE player_id = $1',
    [created.rows[0].player_id],
  );
  return result.rows[0].guest_token;
}

// 토큰으로 플레이어를 찾고, 찾았으면 last_seen_at을 지금으로 당긴다. 없으면 null.
//
// 이름이 find가 아니라 touch인 이유: 읽기만 하는 함수처럼 보이면 안 된다. Unix의
// touch 명령이 파일의 시각을 갱신하듯, 이 함수도 호출될 때마다 "이 게스트를
// 방금 봤다"고 기록한다. 월 1회 정리가 30일 지난 게스트를 지울 때 이 시각을 본다.
//
// UPDATE ... RETURNING 한 문장으로 찾기와 갱신을 같이 한다. SELECT 후 UPDATE로
// 나누면 요청마다 DB를 두 번 오가는데, 여기는 게임 요청마다 지나는 길목이다.
//
// 토큰이 UUID 모양인지는 여기서 검사하지 않는다. 'abc' 같은 값이 오면 pg가
// UUID로 바꾸다 22P02로 터지는데, 그건 미들웨어가 쿼리 전에 걸러 401로 돌려준다
// (2026-11-23 결정, 라우트의 Number.isInteger 가드와 같은 자리).
export async function touchGuest(guestToken: string) {
  const result = await pool.query<{ player_id: number }>(
    `UPDATE player
        SET last_seen_at = now()
      WHERE guest_token = $1
      RETURNING player_id`,
    [guestToken],
  );

  // 30일 정리로 지워진 게스트의 쿠키가 여기로 온다. 에러가 아니라 "그런 게스트는
  // 없다"는 정상적인 답이라 던지지 않고 null을 돌려준다. 401로 바꾸는 건 미들웨어다.
  if (result.rowCount === 0) {
    return null;
  }
  return result.rows[0].player_id;
}
