import express from 'express';
import pool from './db/pool.js';

const app = express();
const port = process.env.PORT || 3001;

// 서버만이 아니라 DB까지 살아 있는지 확인한다. 시각을 DB에서 직접 받아오는 이유는
// 하드코딩으로 만들 수 없는 값이기 때문이다 — 이 응답이 오면 Express와 PostgreSQL이
// 둘 다 살아 있고 그 사이 연결도 뚫렸다는 뜻이 된다.
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', now: result.rows[0].now });
  } catch (err) {
    // 원인은 서버 로그에만 남기고 응답에는 싣지 않는다. DB 에러 메시지에는 접속 정보나
    // 테이블 구조가 섞여 나올 수 있어서, 그대로 돌려주면 내부 사정을 공개하는 셈이 된다.
    console.error('health check failed:', err);
    res.status(500).json({ status: 'error' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
