import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pool from './db/pool.js';
import { attemptUpgrade } from './services/upgrade.js';
import { getTemplates } from './services/templates.js';
import { getPlayer } from './services/player.js';
import { equipGear } from './services/equip.js';
import { plantSeed, harvestCrop } from './services/farm.js';
import { craftItem } from './services/craft.js';
import { enterDungeon, completeDungeon } from './services/dungeon.js';
import { ServiceError } from './services/errors.js';
import { createGuest, touchGuest } from './services/guest.js';

// 서버 앱의 정의. 실제로 포트를 여는 일(listen)은 index.ts가 한다.
//
// 둘을 나눈 이유: HTTP 테스트(supertest)는 포트를 열지 않고 앱에 직접 요청을
// 꽂는다. 앱 정의가 listen과 한 파일에 있으면 테스트가 import하는 순간 서버가
// 떠 버린다(2026-11-23, HTTP 테스트 도입과 함께).
//
// 앱을 변수 하나가 아니라 createApp() 함수로 내보내는 이유: 게스트 생성 속도
// 제한이 기록을 서버 메모리에 둔다. 테스트마다 새 앱을 만들어야 앞 테스트의
// 생성 횟수가 다음 테스트로 넘어가지 않는다. 실제 서버는 index.ts가 한 번만 부른다.

// res.locals는 Express가 요청마다 만들어 주는 빈 메모지다. 미들웨어가 적고 뒤의
// 라우트가 읽는다. Express 타입에서 이 메모지의 칸은 기본이 any라, 그대로 두면
// 라우트가 res.locals.playerId를 문자열로 잘못 써도 TS가 모른다. 아래 선언은
// Express가 열어 둔 Locals 인터페이스에 칸을 하나 더 적어 넣는 것이다(선언 병합).
//
// 한계: 이 선언은 모든 라우트에 적용된다. 검문소를 거치지 않는 health·templates
// 에서도 TS는 playerId가 있다고 믿는다. 그 두 라우트는 playerId를 안 읽으므로
// 지금은 문제가 없다.
declare global {
  namespace Express {
    interface Locals {
      playerId: number;
    }
  }
}

const GUEST_COOKIE = 'farmdelve_guest';

// 1년. 쿠키가 먼저 만료되면 DB에는 멀쩡한 세이브가 남아 있는데 주인이 열쇠를
// 잃는다. 실제 수명은 쿠키가 아니라 월 1회 정리(30일 미접속 삭제)가 정한다.
const GUEST_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

// UUID 모양(8-4-4-4-12자리 16진수)인지만 본다. 모양이 아니면 DB에 묻지 않고 바로
// 거절한다 — 'abc'를 그대로 보내면 pg가 UUID로 바꾸다 22P02로 터져 500이 된다.
// 라우트들이 Number.isInteger로 URL 조각을 거르는 것과 같은 자리의 가드다.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 요청의 쿠키로 게스트를 찾는다. 쿠키가 없거나, 모양이 틀렸거나, 그런 게스트가
// 없으면(30일 정리로 지워진 경우 포함) null. 검문소와 POST /api/guest 둘 다 쓴다.
//
// req.cookies를 unknown으로 받는 이유: cookie-parser가 채우는 값의 타입은 any라,
// 그대로 쓰면 typeof 검사를 지워도 TS가 통과시킨다. complete 라우트의 cleared와
// 같은 방식이다 — 검사가 타입의 근거가 된다.
async function playerIdFromCookie(req: express.Request) {
  const token: unknown = req.cookies?.[GUEST_COOKIE];

  if (typeof token !== 'string' || !UUID_PATTERN.test(token)) {
    return null;
  }
  return touchGuest(token);
}

// 검문소. 게임 라우트 8개 앞에서 "이 요청은 누구의 것인가"를 정해 res.locals에
// 적는다. 라우트들은 쿠키를 모른 채 res.locals.playerId만 읽는다.
//
// 쿠키가 없을 때와 무효일 때를 같은 401 guest_not_found로 합친다. 클라이언트가
// 할 일은 둘 다 같다 — POST /api/guest로 새 게스트를 받는 것.
//
// 401인 이유: "누구인지 모르겠다"는 뜻의 코드다. 404로 하면 요청한 경로(밭, 장비)가
// 없다는 말과 섞인다.
async function requirePlayerMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const playerId = await playerIdFromCookie(req);

    if (playerId === null) {
      return res.status(401).json({ reason: 'guest_not_found' });
    }

    res.locals.playerId = playerId;
    next();
  } catch (err) {
    // 라우트들의 catch와 같은 규칙 — 원인은 로그에만 남긴다.
    console.error('guest lookup failed:', err);
    res.status(500).json({ reason: 'internal_error' });
  }
}

export function createApp() {
  const app = express();

  // 요청 본문의 JSON을 파싱해 req.body에 꽂아준다. 라우트 등록보다 위에 있어야
  // 한다 — 미들웨어는 이 줄 아래에 등록된 라우트에만 걸린다.
  app.use(express.json());

  // 쿠키 헤더("farmdelve_guest=...; 다른쿠키=...")를 해석해 req.cookies 객체로 꽂아 준다.
  // Express 5는 쿠키를 스스로 읽지 않는다. express.json()과 같은 이유로 라우트보다 위.
  app.use(cookieParser());

  // 서버만이 아니라 DB까지 살아 있는지 확인한다. 시각을 DB에서 직접 받아오는 이유는
  // 하드코딩으로 만들 수 없는 값이기 때문이다 — 이 응답이 오면 Express와 PostgreSQL이
  // 둘 다 살아 있고 그 사이 연결도 뚫렸다는 뜻이 된다.
  app.get('/api/health', async (req, res) => {
    try {
      // NOW()는 TIMESTAMPTZ라 pg가 Date로 준다. 열 이름은 PostgreSQL이 함수 이름을
      // 소문자로 붙인 now다.
      const result = await pool.query<{ now: Date }>('SELECT NOW()');
      res.json({ status: 'ok', now: result.rows[0].now });
    } catch (err) {
      // 원인은 서버 로그에만 남기고 응답에는 싣지 않는다. DB 에러 메시지에는 접속 정보나
      // 테이블 구조가 섞여 나올 수 있어서, 그대로 돌려주면 내부 사정을 공개하는 셈이 된다.
      console.error('health check failed:', err);
      res.status(500).json({ status: 'error' });
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

  // 게스트 생성 속도 제한: IP 하나당 1시간에 5번. "IP당 1개"로 하지 않은 이유는
  // 집·회사·통신사가 공인 IP 하나를 여럿이 나눠 쓰기 때문이다 — 같은 집의 두 번째
  // 사람이 막히면 안 된다. 막으려는 건 스크립트가 게스트를 대량으로 만드는 것이다
  // (게스트 하나 = 행 46개). IP를 계속 바꾸는 공격자는 못 막는다 — 감수한 한계다.
  //
  // 기록은 서버 메모리에 둔다(라이브러리 기본값). 서버가 한 대라 충분하고, 재시작하면
  // 횟수가 0으로 돌아가는 것도 감수한다. createApp() 안에서 만드는 이유는 파일 맨 위 주석.
  //
  // 주의: 배포에서는 CloudFront를 거쳐 오므로, 그대로 두면 모든 방문자가 CloudFront의
  // IP 몇 개로 보인다. 진짜 방문자 IP를 읽도록 trust proxy를 설정하는 일은 AWS 단계에
  // 남아 있다.
  const guestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    // 응답에 RateLimit 헤더(남은 횟수·초기화까지 남은 시간)를 싣는다. draft-8은
    // IETF 표준 초안의 최신 모양이고, 옛 X-RateLimit-* 헤더는 끈다.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // 다른 실패 응답과 같은 { reason } 모양으로 맞춘다. 상태 코드는 기본값 429.
    message: { reason: 'too_many_guests' },
  });

  // 새 게스트 만들기. 무언가를 "만드는" 요청이라 POST다 — GET이면 링크 미리보기 봇이나
  // 브라우저의 미리 불러오기가 들를 때마다 게스트가 생긴다.
  //
  // 이미 유효한 쿠키가 있으면 새로 만들지 않고 200으로 그 게스트를 유지한다. 첫 응답의
  // 쿠키를 받은 뒤에 같은 요청이 한 번 더 와도 게스트가 불어나지 않게 하려는 것이다.
  // 막는 건 이 "차례로 두 번"뿐이다 — 쿠키 없는 요청 두 개가 동시에 오면 둘 다 아직
  // 쿠키가 없으니 둘 다 만든다. 남는 한 명은 쿠키를 잃은 채 30일 정리를 기다린다.
  // 속도 제한은 200으로 끝나는 경우도 한 번으로 센다 — 제한이 핸들러보다 앞에 있어서다.
  //
  // 토큰은 body에 싣지 않는다. httpOnly 쿠키로만 보내야 페이지의 자바스크립트가
  // 토큰을 읽을 수 없다(XSS로 새어 나가지 않는다). body에 실으면 그 의미가 사라진다.
  app.post('/api/guest', guestLimiter, async (req, res) => {
    try {
      if ((await playerIdFromCookie(req)) !== null) {
        return res.status(200).json({ created: false });
      }

      const token = await createGuest();

      // httpOnly: 자바스크립트가 못 읽는다. sameSite 'lax': 다른 사이트에서 시작된
      // POST에는 이 쿠키가 안 붙어서 CSRF를 막는다. secure: HTTPS로만 보낸다 — 개발은
      // http://localhost라 배포(NODE_ENV=production)에서만 켠다.
      res.cookie(GUEST_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: GUEST_COOKIE_MAX_AGE_MS,
        path: '/',
      });

      // 201은 "새 자원을 만들었다"는 응답이다. 기존 라우트들이 200인 것과 구분된다.
      res.status(201).json({ created: true });
    } catch (err) {
      console.error('guest create failed:', err);
      res.status(500).json({ reason: 'internal_error' });
    }
  });

  // 여기서부터 아래의 /api 라우트는 전부 검문소를 지난다. 라우트마다 붙이지 않고 한
  // 번에 거는 이유: 하나를 빠뜨리면 그 라우트는 검사 없이 열린다(2026-11-23 결정).
  // 대가로 순서가 규칙이 된다 — 쿠키 없이 열어야 하는 라우트(health, templates,
  // guest)는 반드시 이 줄보다 위에 등록해야 한다.
  //
  // 이 줄은 아래에 등록된 라우트만이 아니라 여기까지 내려온 모든 /api 요청에 걸린다.
  // 그래서 쿠키 없이 /api 오타를 치면 404가 아니라 401이 나온다.
  app.use('/api', requirePlayerMiddleware);

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
      const result = await attemptUpgrade(res.locals.playerId, gearInstanceId);

      // 주사위가 어떻게 나왔든 200이다. "강화에 실패했다"와 "요청이 처리되지
      // 않았다"는 다른 층위이고, 전자는 upgraded: false로 실려 나간다.
      res.status(200).json(result);
    } catch (err) {
      // ServiceError면 서비스가 의도해서 던진 것이다(404/409). 아니면 pg가
      // 던졌거나 코드 버그이므로 500으로 흘려보낸다.
      //
      // 예전에는 err.status가 있는지로 갈랐다. strict TS에서 err는 unknown이라
      // err.status를 읽는 줄 자체가 빌드 에러이고, instanceof가 실행 중에 정체를
      // 확인해 주는 방법이다 — 이 검사를 통과한 블록 안에서는 TS도 err를
      // ServiceError로 보고 status·reason·details를 읽게 해 준다. 아래 일곱
      // 라우트도 같은 모양이다(errors.ts 맨 위 주석, 2026-11-21 결정).
      //
      // 같은 catch가 라우트마다 반복되지만, Express의 에러 미들웨어로 묶는 건
      // 여기서도 미룬다 — 이번 변환은 타입만 바꾸고 구조는 건드리지 않는다.
      if (err instanceof ServiceError) {
        // 의도해서 던진 에러는 reason과 details를 그대로 내보낸다. "3개 필요한데
        // 1개 있음"까지 담겨 있어서 클라이언트가 추가 조회 없이 안내할 수 있다.
        res.status(err.status).json({ reason: err.reason, details: err.details });
      } else {
        // health와 같은 규칙 — 원인은 로그에만 남긴다. DB 에러 메시지에는 테이블
        // 구조나 접속 정보가 섞여 나올 수 있다.
        console.error('upgrade failed:', err);
        res.status(500).json({ reason: 'internal_error' });
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
      res.json(await equipGear(res.locals.playerId, gearInstanceId));
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.status).json({ reason: err.reason });
      } else {
        console.error('equip failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 심기. 강화와 같은 POST다 — 두 번 누르면 씨앗이 두 번 나가야 하므로 멱등하지
  // 않고, 찬 칸에 다시 심는 것은 성공이 아니라 거절이다.
  //
  // 강화와 달리 body가 있다. 클라이언트가 정할 것이 "어느 칸"과 "무슨 작물" 둘이고,
  // 앞은 대상이라 URL에, 뒤는 그 대상에 무엇을 할지라 body에 담긴다. 씨앗 종류는
  // 여기 없다 — crop_template이 정하는 값이라 서버가 읽는다.
  app.post('/api/plots/:plotNumber/plant', async (req, res) => {
    const plotNumber = Number(req.params.plotNumber);

    // 강화와 같은 가드다. 1~25 범위 검사는 하지 않는데, 그건 서비스가 행을 못
    // 찾는 것으로 이미 걸러지기 때문이다 — 여기서 막을 것은 pg가 22P02로 터질
    // 'abc' 같은 값뿐이다.
    if (!Number.isInteger(plotNumber)) {
      return res.status(404).json({ reason: 'plot_not_found' });
    }

    // body가 아예 없으면 express 5는 req.body를 undefined로 둔다. ?. 없이 읽으면
    // TypeError가 나고, try 바깥이라 아래 catch도 못 잡아 500으로 보고된다.
    //
    // 없는 작물 번호는 404지만 이쪽은 400이다. 필드가 빠졌거나 타입이 틀린 것은
    // 서버 상태와 충돌한 게 아니라 요청 자체가 규격을 어긴 경우다.
    const cropTemplateId = Number(req.body?.cropTemplateId);

    if (!Number.isInteger(cropTemplateId)) {
      return res.status(400).json({ reason: 'invalid_body' });
    }

    try {
      res.status(200).json(await plantSeed(res.locals.playerId, plotNumber, cropTemplateId));
    } catch (err) {
      if (err instanceof ServiceError) {
        // 씨앗이 모자랐을 때 spendStack이 실은 details가 여기로 나온다.
        res.status(err.status).json({ reason: err.reason, details: err.details });
      } else {
        console.error('plant failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 거두기. 심기와 짝이라 같은 POST이고, body는 없다 — 거둘 대상이 칸 하나뿐이라
  // URL에 다 담긴다. 무엇이 나올지는 서버가 정하므로 클라이언트가 보탤 말이 없다.
  app.post('/api/plots/:plotNumber/harvest', async (req, res) => {
    const plotNumber = Number(req.params.plotNumber);

    if (!Number.isInteger(plotNumber)) {
      return res.status(404).json({ reason: 'plot_not_found' });
    }

    try {
      res.status(200).json(await harvestCrop(res.locals.playerId, plotNumber));
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.status).json({ reason: err.reason, details: err.details });
      } else {
        console.error('harvest failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 정제. 강화·심기와 같은 POST이고 body는 없다 — 무엇이 들어가고 무엇이 나오는지는
  // recipe가 정하므로 클라이언트가 말할 것은 레시피 번호뿐이다.
  app.post('/api/craft/:recipeId', async (req, res) => {
    const recipeId = Number(req.params.recipeId);

    if (!Number.isInteger(recipeId)) {
      return res.status(404).json({ reason: 'recipe_not_found' });
    }

    try {
      res.status(200).json(await craftItem(res.locals.playerId, recipeId));
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.status).json({ reason: err.reason, details: err.details });
      } else {
        console.error('craft failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 던전 입장. 강화·심기와 같은 POST다 — 두 번 부르면 런이 두 개 시작돼야 하므로
  // 멱등하지 않다.
  //
  // 다른 라우트와 달리 URL에 대상이 없다. 아직 런이 존재하지 않는 시점이라
  // 가리킬 것이 없어서, 클라이언트가 말할 수 있는 tier 하나가 body로 온다.
  app.post('/api/dungeon/enter', async (req, res) => {
    // 심기의 cropTemplateId와 같은 가드다. 숫자가 아니면 요청 자체가 규격을
    // 어긴 것이라 404가 아니라 400이다.
    const tier = Number(req.body?.tier);

    if (!Number.isInteger(tier)) {
      return res.status(400).json({ reason: 'invalid_body' });
    }

    try {
      res.status(200).json(await enterDungeon(res.locals.playerId, tier));
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.status).json({ reason: err.reason, details: err.details });
      } else {
        console.error('dungeon enter failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 런 종료. cleared를 클라이언트가 보내는 것이 이 API의 성격을 그대로 드러낸다 —
  // 서버는 전투를 보지 않으므로 확인할 방법이 없다. 백로그가 부정행위 방지를
  // 범위 밖으로 정해둔 결정(2026-08-24)이 여기 한 줄로 남는다.
  app.post('/api/dungeon/:runId/complete', async (req, res) => {
    const runId = Number(req.params.runId);

    if (!Number.isInteger(runId)) {
      return res.status(404).json({ reason: 'run_not_found' });
    }

    // 다른 라우트들은 Number.isInteger로 걸렀지만 이 값은 숫자가 아니다.
    // 참/거짓 둘만 받는다고 못 박지 않으면 문자열 'false'가 그대로 참으로 읽혀서,
    // 실패한 런이 클리어로 기록된다.
    //
    // unknown으로 받는 이유: req.body는 Express 타입에서 any라, 그대로 두면 아래
    // 검사를 지워도 completeDungeon(boolean을 받는다)에 무엇이든 넘어간다.
    // unknown은 "정체를 확인하기 전엔 못 쓴다"는 뜻이라, 아래 if를 통과한 뒤에야
    // TS가 이 값을 true | false로 보고 넘기게 해 준다. 검사가 타입의 근거가 된다.
    const cleared: unknown = req.body?.cleared;

    if (cleared !== true && cleared !== false) {
      return res.status(400).json({ reason: 'invalid_body' });
    }

    try {
      res.status(200).json(await completeDungeon(res.locals.playerId, runId, cleared));
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.status).json({ reason: err.reason, details: err.details });
      } else {
        console.error('dungeon complete failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 지금 이 플레이어의 상태 전부 — 골드, 가진 장비, 장착 칸, 재료.
  app.get('/api/player', async (req, res) => {
    try {
      res.json(await getPlayer(res.locals.playerId));
    } catch (err) {
      // getPlayer가 붙여 보내는 404 말고는 전부 500이다. 세 라우트가 같은 모양을
      // 반복하는데, Express의 에러 미들웨어로 묶는 건 라우트가 더 늘어난 뒤에
      // 해도 늦지 않다.
      if (err instanceof ServiceError) {
        res.status(err.status).json({ reason: err.reason });
      } else {
        console.error('player fetch failed:', err);
        res.status(500).json({ reason: 'internal_error' });
      }
    }
  });

  // 클라이언트 빌드 결과(client/dist)를 같은 서버가 내준다(D3, 2026-11-20 결정).
  // 브라우저가 출처 하나하고만 대화하므로 배포에서도 CORS가 필요 없다 —
  // vite.config.js의 proxy 주석이 예고해 둔 그 길이다.
  //
  // 경로는 이 파일(dist/index.js) 위치에서 두 칸 올라간 곳이다. 로컬은
  // server/dist → client/dist, image는 /app/server/dist → /app/client/dist라
  // 두 곳의 폴더 배치를 같게 맞춰 두면 환경 변수 없이 둘 다 맞는다.
  //
  // API 라우트보다 아래에 둔다. 위에 두면 /api 요청마다 먼저 디스크를 뒤지고
  // 넘어가는데, 순서상 API가 정적 파일에 가려질 일도 아예 없게 하는 편이 낫다.
  //
  // 모르는 경로를 index.html로 돌려주는 폴백(/{*splat})은 두지 않는다. 클라이언트에
  // URL 라우팅이 없어 화면이 전부 / 하나라 필요가 없고, 두면 /api 오타까지 200 +
  // HTML로 나가 디버깅이 헷갈린다. 개발 중(vite가 5173에서 서빙)에는 client/dist가
  // 없을 수 있는데, 그러면 이 미들웨어가 그냥 다음으로 넘겨 404가 된다.
  app.use(express.static(path.join(import.meta.dirname, '../../client/dist')));

  return app;
}
