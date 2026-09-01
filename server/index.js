import express from 'express';
import pool from './db/pool.js';
import { attemptUpgrade } from './services/upgrade.js';
import { getTemplates } from './services/templates.js';
import { getPlayer } from './services/player.js';
import { equipGear } from './services/equip.js';

const app = express();
const port = process.env.PORT || 3001;

// 로그인이 아직 없다. design-backlog.md §4에서 Google OAuth로 미뤘고, 그때까지
// 모든 요청은 seed.sql이 넣어둔 한 명의 것이다. 인증이 들어오면 이 상수가
// 사라지고 요청마다 다른 값이 들어올 자리라, 세 라우트에 흩뿌리지 않고 모아둔다.
const PLAYER_ID = 1;

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

// 강화 시도. 주사위를 서버가 굴리므로 클라이언트가 말할 수 있는 건 "어느 장비"
// 하나뿐이고, 그것마저 URL에 담긴다 — 그래서 body가 비어 있다.
//
// 이 함수는 게임 규칙을 하나도 모른다. 확률도 재료도 트랜잭션도 서비스 쪽 일이고,
// 여기가 하는 일은 번역뿐이다: URL을 인자로, 결과를 상태 코드로.
//
// PATCH가 아니라 POST인 이유가 둘 있다. 하나는 멱등성 — PATCH는 같은 요청을
// 두 번 보내도 결과가 한 번과 같아야 하는데, 강화는 두 번 누르면 재료가 두 번
// 나가고 주사위도 두 번 굴러야 정상이다. 다른 하나가 더 결정적이다: PATCH는
// "이 값으로 바꿔라"라고 클라이언트가 결과를 지정하는 모양이라, 서버가 주사위를
// 쥔다는 이 기능의 전제와 정면으로 부딪친다. 경로 끝의 upgrade가 명사가 아니라
// 동사인 것이 그 신호다.
app.post('/api/gear/:gearInstanceId/upgrade', async (req, res) => {
  // URL 조각은 언제나 문자열이라 'abc' 같은 값이 그대로 내려가면 pg가 22P02로
  // 터지고, 그건 500으로 보고된다. 하지만 잘못된 요청이지 서버 고장이 아니므로
  // 여기서 걸러 없는 장비와 같은 404로 합친다.
  const gearInstanceId = Number(req.params.gearInstanceId);

  if (!Number.isInteger(gearInstanceId)) {
    return res.status(404).json({ reason: 'gear_not_found' });
  }

  try {
    const result = await attemptUpgrade(PLAYER_ID, gearInstanceId);

    // 주사위가 어떻게 나왔든 200이다. "강화에 실패했다"와 "요청이 처리되지
    // 않았다"는 다른 층위이고, 전자는 upgraded: false로 실려 나간다.
    res.status(200).json(result);
  } catch (err) {
    // status가 붙어 있으면 서비스가 의도해서 던진 것이다(404/409). 안 붙어
    // 있으면 pg가 던졌거나 코드 버그이므로 500으로 흘려보낸다.
    const status = err.status ?? 500;

    if (status === 500) {
      // health와 같은 규칙 — 원인은 로그에만 남긴다. DB 에러 메시지에는 테이블
      // 구조나 접속 정보가 섞여 나올 수 있다.
      console.error('upgrade failed:', err);
      res.status(500).json({ reason: 'internal_error' });
    } else {
      // 의도해서 던진 에러는 reason과 details를 그대로 내보낸다. "3개 필요한데
      // 1개 있음"까지 담겨 있어서 클라이언트가 추가 조회 없이 안내할 수 있다.
      res.status(status).json({ reason: err.reason, details: err.details });
    }
  }
});

// 장착. 강화가 POST인 것과 달리 여기는 PUT이다 — 같은 요청을 두 번 보내도
// 결과가 한 번과 같으므로 멱등하고, PUT은 바로 그런 요청을 위한 메서드다.
//
// body가 비어 있는 것도 같은 이유의 연장이다. 슬롯을 받지 않으니 클라이언트가
// 보낼 것이 URL의 장비 번호 하나뿐이다.
app.put('/api/gear/:gearInstanceId/equip', async (req, res) => {
  const gearInstanceId = Number(req.params.gearInstanceId);

  if (!Number.isInteger(gearInstanceId)) {
    return res.status(404).json({ reason: 'gear_not_found' });
  }

  try {
    res.json(await equipGear(PLAYER_ID, gearInstanceId));
  } catch (err) {
    const status = err.status ?? 500;

    if (status === 500) {
      console.error('equip failed:', err);
      res.status(500).json({ reason: 'internal_error' });
    } else {
      res.status(status).json({ reason: err.reason });
    }
  }
});

// 밸런스 패치 때만 바뀌는 정의들. 클라이언트가 앱을 열 때 한 번 받아 캐싱하는
// 것을 전제로 하므로, playerId도 받지 않고 누구에게나 같은 답을 돌려준다.
app.get('/api/templates', async (req, res) => {
  try {
    res.json(await getTemplates());
  } catch (err) {
    console.error('templates failed:', err);
    res.status(500).json({ reason: 'internal_error' });
  }
});

// 지금 이 플레이어의 상태 전부 — 골드, 가진 장비, 장착 칸, 재료.
app.get('/api/player', async (req, res) => {
  try {
    res.json(await getPlayer(PLAYER_ID));
  } catch (err) {
    // getPlayer가 붙여 보내는 404 말고는 전부 500이다. 세 라우트가 같은 모양을
    // 반복하는데, Express의 에러 미들웨어로 묶는 건 라우트가 더 늘어난 뒤에
    // 해도 늦지 않다.
    const status = err.status ?? 500;

    if (status === 500) {
      console.error('player fetch failed:', err);
      res.status(500).json({ reason: 'internal_error' });
    } else {
      res.status(status).json({ reason: err.reason });
    }
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
