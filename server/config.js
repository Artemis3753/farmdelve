// .env에서 읽는 값 중 여러 곳이 쓰는 것들. DATABASE_URL은 db/pool.js가 혼자
// 쓰므로 여기 없다 — 두 곳 이상이 필요해진 값만 올라온다.

// 성장 배속. 10이면 5분짜리 감자가 30초에 자란다. 작물별 성장 시간은 밸런스라
// DB에 있고, 이 값은 개발 편의라 환경마다 다를 수 있어서 .env에 둔다.
//
// 폴백을 두지 않고 없으면 즉시 죽는다. DATABASE_URL에 || 를 붙이지 않은 것과
// 같은 이유다 — 조용히 다른 속도로 도는 서버보다, 안 뜨는 서버가 낫다.
export const TIME_SCALE = Number(process.env.TIME_SCALE);

if (!Number.isFinite(TIME_SCALE) || TIME_SCALE <= 0) {
  throw new Error('TIME_SCALE must be a positive number (check server/.env)');
}
