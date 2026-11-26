-- FarmDelve — 지금까지 지은 15개 테이블. 강화·장착 슬라이스가 일곱을 세웠고,
-- 농장 슬라이스가 셋(2026-09-03), 던전 슬라이스가 다섯(2026-09-11에 둘,
-- 2026-09-14에 하나, 2026-09-15에 둘)을 더했다.
-- 남은 셋(던전 테이블 1개, 특성, 세트 보너스)은 각자의 슬라이스에서 짓는다.
-- 자세한 근거는 docs/data-model.md.
--
-- npm run db:reset 으로 실행한다. 개발 중에는 스키마가 자주 바뀌므로 매번 통째로
-- 다시 만드는 편이 빠르다. 실 데이터가 생기기 전까지만 유효한 방식이다.

-- 다시 만들기 전에 지운다. 참조하는 쪽을 먼저 지워야 외래 키가 걸리지 않는다.
-- 함수는 테이블을 막지 않지만(plpgsql 본문은 의존성으로 기록되지 않는다), 아래
-- CREATE FUNCTION이 같은 이름을 다시 만들 수 있게 먼저 지운다.
DROP FUNCTION IF EXISTS create_player();
DROP TABLE IF EXISTS dungeon_run;
DROP TABLE IF EXISTS monster_pack;
DROP TABLE IF EXISTS dungeon_tier_template;
DROP TABLE IF EXISTS monster_template;
DROP TABLE IF EXISTS dungeon_template;
DROP TABLE IF EXISTS player_gear_slot;
DROP TABLE IF EXISTS gear_instance;
DROP TABLE IF EXISTS player_stack;
DROP TABLE IF EXISTS player_plot;
DROP TABLE IF EXISTS upgrade;
DROP TABLE IF EXISTS recipe;
DROP TABLE IF EXISTS gear_template;
DROP TABLE IF EXISTS crop_template;
DROP TABLE IF EXISTS stack_template;
DROP TABLE IF EXISTS player;


-- 플레이어. 로그인은 미뤄져 있고, 대신 방문자마다 게스트 플레이어가 하나씩
-- 생긴다(2026-11-23). seed가 만드는 개발용 player 1도 같은 함수로 만든 게스트다.
CREATE TABLE player (
  player_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- 쿠키에 실려 오는 게스트 식별값. player_id를 그대로 쓰지 않는 이유는 숫자가
  -- 추측 가능해서다 — 쿠키 값을 7에서 8로 바꾸면 남의 세이브를 조작할 수 있다.
  -- 비밀번호가 없으니 인증이 아니라 "식별"이다. 이 값을 가진 사람이 곧 주인이다.
  --
  -- DEFAULT로 두면 INSERT하는 쪽이 토큰 생성을 잊을 수 없다. gen_random_uuid()는
  -- PostgreSQL 13부터 내장이라 확장을 설치하지 않아도 된다.
  guest_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  -- 서버가 이 게스트의 요청을 마지막으로 본 시각. 월 1회 정리가 30일 지난
  -- 게스트를 지울 때 이 값을 본다. 만든 시각으로 시작해야 한 번도 안 돌아온
  -- 게스트도 30일 뒤에 지워진다.
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 골드는 crest·물약과 달리 가방 칸을 먹지 않고 종류도 하나뿐이라
  -- player_stack의 한 행이 아니라 여기 컬럼으로 둔다.
  gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),

  -- 던전 입장 조건(최고 클리어 단수 + 2)의 기준값. 0은 아직 아무것도 못 깬 상태다.
  highest_tier_cleared INTEGER NOT NULL DEFAULT 0
    CHECK (highest_tier_cleared BETWEEN 0 AND 10)
);


-- 장비의 정의. 모든 플레이어가 공유하고 밸런스 패치 때만 바뀐다.
CREATE TABLE gear_template (
  gear_template_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,

  -- 5칸 고정이라 조회 테이블을 따로 두지 않고 CHECK로 막는다.
  slot TEXT NOT NULL CHECK (slot IN ('head', 'chest', 'legs', 'feet', 'weapon')),

  -- 등급은 기본 스탯의 크기를 결정한다. 강화 상한(+10)이나 붙는 스탯 종류는
  -- 등급과 무관하다 — 진행 축이 던전 단수와 강화로 이미 둘이라 셋째 축은 짧게 둔다.
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic')),

  -- 스탯 넷 다 정수다. 치명타도 확률이 아니라 등급값이고, 확률로 바꾸는 환산식은
  -- 코드에 둔다(아직 미정). 슬롯마다 안 쓰는 스탯이 있어서 기본값은 0이다.
  base_attack_power INTEGER NOT NULL DEFAULT 0 CHECK (base_attack_power >= 0),
  base_health       INTEGER NOT NULL DEFAULT 0 CHECK (base_health >= 0),
  base_armor        INTEGER NOT NULL DEFAULT 0 CHECK (base_armor >= 0),
  base_crit         INTEGER NOT NULL DEFAULT 0 CHECK (base_crit >= 0)
);


-- 쌓이는 물건의 정의 — crest, 강화 재료, 물약, 씨앗이 구분 없이 함께 있다.
-- 종류를 구분할 kind 컬럼은 아직 넣지 않는다. 그걸 넣으려면 종류 목록을 지금
-- 확정해야 하는데, 소비 아이템 키 바인딩이 생기기 전까지는 구분할 이유가 없다.
-- 아이콘은 여기 없다. 이모지를 쓰던 동안은 icon TEXT 컬럼이 있었고 그 값을
-- 나중에 이미지 경로로 갈아끼울 생각이었는데, 실제로 이미지를 넣어 보니 한 칸에
-- 담기는 값이 아니었다 — 그림 하나에 배경 모양·배경색·그림색이 딸려 오고, 그
-- 셋은 게임 규칙이 아니라 화면 사정이다. 그래서 client/src/components/Icon.jsx의
-- 표가 정본이 됐고 이 컬럼은 아무도 안 읽는 채로 남아 있다가 지워졌다.
CREATE TABLE stack_template (
  stack_template_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,

  -- 한 칸에 몇 개까지 쌓이는지. 가방 칸 수 계산에만 쓰이고 소지 상한은 아니다.
  max_stack INTEGER NOT NULL CHECK (max_stack > 0)
);


-- 플레이어가 실제로 가진 장비 한 점. 같은 템플릿에서 나온 두 자루가 서로 다른
-- 강화 단계를 가질 수 있어서 인스턴스가 따로 필요하다.
CREATE TABLE gear_instance (
  gear_instance_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gear_template_id INTEGER NOT NULL REFERENCES gear_template,

  -- ON DELETE CASCADE: 플레이어가 지워지면 그 장비도 따라 지워진다. 게스트 정리가
  -- player 한 행만 DELETE하면 끝나게 하려는 것이다. 이게 없으면 자식 행이 남아
  -- 외래 키 위반으로 DELETE 자체가 실패한다. player를 참조하는 다섯 곳 모두 같다.
  player_id INTEGER NOT NULL REFERENCES player ON DELETE CASCADE,

  -- upgrade 테이블의 같은 이름 컬럼과 외래 키 관계가 아니다. 여기 0은 갓 얻은
  -- 상태이고, upgrade 쪽은 "한 단계 올리는 비용"이라 1부터 시작한다.
  upgrade_level INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_level BETWEEN 0 AND 10)
);


-- 플레이어가 가진 스택 아이템의 개수. 한 종류당 한 행이므로 두 컬럼이 함께 PK다.
CREATE TABLE player_stack (
  player_id INTEGER NOT NULL REFERENCES player ON DELETE CASCADE,
  stack_template_id INTEGER NOT NULL REFERENCES stack_template,

  -- 0이 되면 행을 지운다. 0개를 들고 있다는 행이 남으면 가방 칸 계산이 어긋난다.
  amount INTEGER NOT NULL CHECK (amount > 0),

  PRIMARY KEY (player_id, stack_template_id)
);


-- 어느 칸에 무엇이 장착돼 있는지. 칸 자체가 행이고, 내용물은 바뀐다.
CREATE TABLE player_gear_slot (
  player_id INTEGER NOT NULL REFERENCES player ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('head', 'chest', 'legs', 'feet', 'weapon')),

  -- 시작 시점에 방어구 4칸은 비어 있으므로 NULL을 허용한다. UNIQUE를 함께 거는
  -- 이유는 같은 장비가 두 칸에 동시에 장착되는 것을 막기 위해서다. PostgreSQL은
  -- NULL의 중복을 허용하므로 빈 칸이 여럿인 것은 이 제약에 걸리지 않는다.
  gear_instance_id INTEGER UNIQUE REFERENCES gear_instance,

  PRIMARY KEY (player_id, slot)
);


-- 강화 비용표. 한 행이 "n-1에서 n으로 올리는 데 드는 것"이라 1부터 시작한다.
-- 확률과 비용이 밸런스 조정 대상이라 코드 상수가 아니라 표로 둔다.
CREATE TABLE upgrade (
  upgrade_level INTEGER PRIMARY KEY CHECK (upgrade_level BETWEEN 1 AND 10),

  -- 설계값이 100 / 70 / 40 셋뿐이라 정수 퍼센트로 충분하다. 소수로 두면
  -- 비교 연산에서 부동소수점 오차를 걱정해야 한다.
  success_rate INTEGER NOT NULL CHECK (success_rate BETWEEN 1 AND 100),

  crest_stack_template_id INTEGER NOT NULL REFERENCES stack_template,
  crest_amount INTEGER NOT NULL CHECK (crest_amount > 0),

  material_stack_template_id INTEGER NOT NULL REFERENCES stack_template,
  material_amount INTEGER NOT NULL CHECK (material_amount > 0)
);


-- ---------------------------------------------------------------------------
-- 농장 슬라이스 (2026-09-03)
-- ---------------------------------------------------------------------------

-- 작물의 정의. gear_template·stack_template과 같은 층이다 — 모두가 공유하고
-- 밸런스를 만질 때만 바뀐다. 밭에 실제로 무엇이 심겼는지는 player_plot이 갖는다.
--
-- 씨앗과 수확물이 둘 다 stack_template을 가리킨다. 백로그가 "씨앗은 수확물과
-- 별개 아이템"으로 정해서(2026-08-25) 감자씨와 감자가 서로 다른 행이기 때문이다.
-- 같은 테이블을 두 번 참조하는 모양은 upgrade가 crest와 material로 이미 쓰고 있다.
--
-- 수확이 씨앗을 몇 개 돌려주는지는 여기 없다. 고정 1개 + 확률로 최대 2개 추가가
-- 전 작물 공통이라, 컬럼으로 두면 네 행에 같은 값이 네 번 적힌다. 코드 상수로 둔다.
CREATE TABLE crop_template (
  crop_template_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  seed_stack_template_id INTEGER NOT NULL REFERENCES stack_template,
  crop_stack_template_id INTEGER NOT NULL REFERENCES stack_template,

  -- 시각이 아니라 기간이라 INTERVAL이다. "언제 심었나"는 player_plot이 갖고,
  -- 여기는 "얼마나 걸리나"만 안다. 둘을 더해야 수확 가능 시각이 나온다.
  --
  -- TIME_SCALE로 배속을 걸 때 growth_time / 4 처럼 나눗셈을 쓰는데, INTERVAL이
  -- 나눗셈과 비교를 둘 다 지원하는 것은 psql에서 확인했다(2026-09-03).
  growth_time INTERVAL NOT NULL CHECK (growth_time > INTERVAL '0 seconds'),

  -- 한 번 거둘 때 crop_stack_template_id가 몇 개 나오는지. 밸런싱 손잡이다.
  crop_amount INTEGER NOT NULL CHECK (crop_amount > 0),

  -- 수확할 때마다 주는 골드. 판매가가 아니다 — 상점은 기각됐고(백로그 §1),
  -- 백로그가 "모든 수확은 소량의 골드를 준다"고 정해서 0을 허용하지 않는다.
  -- player.gold가 >= 0인 것과 부호가 다른 이유가 이것이다. 저쪽은 잔액이라
  -- 0일 수 있지만, 이쪽은 규칙 자체를 제약으로 박은 자리다.
  harvest_gold INTEGER NOT NULL CHECK (harvest_gold > 0)
);


-- 밭 한 칸의 현재 상태. player_gear_slot과 같은 모양이다 — 칸 자체가 행이고
-- 내용물만 바뀐다. 25행이 처음부터 존재하고 심기·거두기는 전부 UPDATE다.
--
-- 행을 만들고 지우는 방식(player_stack이 amount 0에서 쓰는 방식)을 고르지 않은
-- 이유는 잠금이다. FOR UPDATE는 없는 행을 잠그지 못해서, 두 요청이 같은 빈 칸을
-- 동시에 노리면 둘 다 "비었다"고 읽고 둘 다 INSERT를 시도한다. 막아주는 것이
-- 기본 키 제약으로 바뀌고, 에러도 우리가 던진 것이 아니라 pg의 SQLSTATE로 온다.
-- 행이 항상 있으면 강화에서 쓴 잠금 패턴을 그대로 재사용할 수 있다.
--
-- 다 자랐는지는 저장하지 않는다. planted_at + crop_template.growth_time을
-- NOW()와 비교해서 읽을 때마다 계산한다 — 저장하면 매 순간 UPDATE를 돌려야 하고,
-- 그 사이 DB가 사실과 다른 상태를 들고 있게 된다.
CREATE TABLE player_plot (
  player_id INTEGER NOT NULL REFERENCES player ON DELETE CASCADE,

  -- 화면은 0부터 그리지만 여기는 1부터다. 변환은 클라이언트가 보낼 때 한 번만
  -- 하고(i + 1), 서버는 항상 1~25만 본다. 상한을 막지 않으면 화면에 없는
  -- 유령 칸이 API 버그로 생길 수 있다.
  plot_number INTEGER NOT NULL CHECK (plot_number BETWEEN 1 AND 25),

  -- NULL이 빈 칸이다. 밭 확장은 보류된 상태라 25가 당분간 고정값이다.
  crop_template_id INTEGER REFERENCES crop_template,

  -- 기간이 아니라 시각이라 TIMESTAMPTZ다. "얼마나 걸리나"는 crop_template이
  -- 갖고, 여기는 "언제 심었나"만 안다. 심은 시각은 영원히 변하지 않으므로
  -- 저장해도 되는 값이다.
  planted_at TIMESTAMPTZ,

  -- 심긴 작물과 심은 시각은 반드시 함께 있거나 함께 없어야 한다. 한쪽만 NULL인
  -- 상태는 "뭔가 심겼는데 언제인지 모른다"라서 성장 판정이 불가능해진다.
  -- 양쪽이 비었는지를 각각 참/거짓으로 만든 뒤 그 둘이 같은지 비교한다.
  CHECK ((crop_template_id IS NULL) = (planted_at IS NULL)),

  PRIMARY KEY (player_id, plot_number)
);


-- 조합 레시피. upgrade와 같은 층이다 — 밸런스를 만질 때만 바뀌는 표이고,
-- 코드 상수가 아니라 행으로 두는 이유도 같다.
--
-- 재료가 한 종류뿐이라 컬럼 한 쌍으로 담는다. 백로그의 레시피 셋이 전부 그렇다.
-- 두 종류가 필요한 레시피가 생기면 그때 재료를 별도 테이블로 쪼갠다 — 지금
-- 쪼개는 것은 아직 없는 요구를 위해 조인을 하나 만드는 일이다.
--
-- ingredient는 upgrade의 material과 다른 것을 가리킨다. 저쪽은 Refined Ironroot
-- (정제된 것)이고 이쪽은 Ironroot(정제 전)라, 같은 단어를 쓰면 정제의 앞뒤가
-- 한 이름이 된다.
--
-- 오늘은 정제 한 줄만 넣는다. 물약 둘은 전투가 생긴 다음이다.
CREATE TABLE recipe (
  recipe_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  ingredient_stack_template_id INTEGER NOT NULL REFERENCES stack_template,
  ingredient_amount INTEGER NOT NULL CHECK (ingredient_amount > 0),

  crafted_stack_template_id INTEGER NOT NULL REFERENCES stack_template,
  crafted_amount INTEGER NOT NULL CHECK (crafted_amount > 0)
);


-- 던전의 정의. DoD는 던전 하나뿐이라 행도 하나지만, 코드 상수가 아니라 표로 둔다.
-- dungeon_run이 처음부터 이쪽을 가리키고 있어서, 두 번째 던전이 생겨도 고칠 곳이
-- 행 하나 추가하는 것 말고는 없다.
--
-- 지금 담는 것은 이름뿐이다. 팩 구성은 이 표의 컬럼이 아니라 monster_pack이 이쪽을
-- 가리키는 행으로 둔다(2026-09-15) — 팩이 여덟이라 한 행에 담기지 않는다.
CREATE TABLE dungeon_template (
  dungeon_template_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL
);


-- 티어별로 고정된 값. 지금 담는 것은 제한 시간 하나뿐이다.
--
-- 8% 복리 배율(1.08^(tier-1))은 여기 컬럼으로 두지 않는다(2026-09-14). 배율은
-- 규칙 하나로 열 값이 다 나오는데, 표에 적으면 반올림된 값 열 개를 손으로
-- 맞춰야 하는 자리가 생긴다. 제한 시간은 반대다 — 5/10/15분은 계단이라 그런
-- 식이 없고, 계단의 위치 자체가 밸런싱 결정이라 데이터로 둘 값이다.
CREATE TABLE dungeon_tier_template (

  -- 티어 번호 자체가 키다. 대리키를 따로 두면 dungeon_run이 티어를 두 번
  -- 들고 있게 되고(그 표의 id와 tier), 둘이 어긋난 상태를 DB가 못 막는다.
  -- upgrade 표가 upgrade_level로 이미 쓰는 모양이라 새로 만드는 규칙도 아니다.
  tier  INTEGER  PRIMARY KEY CHECK (tier BETWEEN 1 AND 10),

  -- 시각이 아니라 기간이라 INTERVAL이다. crop_template.growth_time과 같은
  -- 이유이고, 덕분에 end_time - start_time 과 바로 비교할 수 있다.
  -- 밴드는 백로그 §1 Dungeon loop and rewards가 정했다 — 1~4는 5분, 5~8은
  -- 10분, 9~10은 15분.
  time_limit INTERVAL NOT NULL CHECK (time_limit > INTERVAL '0 seconds'),

  -- 시간 안에 클리어했을 때의 보상(2026-11-27). 시간 초과 클리어는 골드 절반·문장 없음이고,
  -- 그 규칙은 dungeon.ts가 이 값에서 계산한다 — 비율은 식이라 컬럼이 아니다.
  --
  -- 제한 시간과 같은 이유로 데이터다. 문장 등급이 계단(1~4 Seed, 5~8 Sprout, 9~10 Harvest)이고,
  -- 그 계단이 제한 시간의 계단과 정확히 겹친다. 문장을 이름이 아니라 FK로 가리키는 것은
  -- upgrade 표가 강화 재료를 가리키는 방식과 같다.
  reward_gold INTEGER NOT NULL CHECK (reward_gold >= 0),
  reward_crest_stack_template_id INTEGER NOT NULL REFERENCES stack_template,
  reward_crest_amount INTEGER NOT NULL CHECK (reward_crest_amount > 0)

);


-- 몬스터의 정의. 트래시 넷(스웜·엘리트 A·엘리트 B·원거리)과 보스가 한 행씩이다.
--
-- 담는 것은 티어1 기준값뿐이다. 더 깊은 티어의 값은 8% 복리 공식(1.08^(tier-1))을
-- 곱해서 얻으므로 행을 티어별로 늘리지 않는다 — dungeon_tier_template에 배율
-- 컬럼을 두지 않은 것과 같은 이유다.
--
-- 기믹(회전·장판·일제사격)의 간격과 데미지는 이 표에 없다(2026-09-15). "10초마다
-- 회전, 35%부터 6초"는 숫자와 동작이 붙어 있어서, 숫자만 표로 옮겨도 코드는 여전히
-- 몬스터마다 갈라진다. 플레이어 스킬을 코드 상수로 둔 것과 같은 판단이다.
-- 이동 속도와 어그로 반경도 모든 몬스터가 같은 값이라 코드 상수다.
--
-- 트래시 넷의 행은 seed.sql 15번 블록에 있다(2026-09-30, 잠정값). 보스 행은 기믹이
-- 정해진 뒤에 넣는다.
CREATE TABLE monster_template (
  monster_template_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,

  -- 체력. 티어 배율이 곱해진다. 0이면 태어나자마자 죽은 몬스터라 막는다 — 전투 중
  -- 줄어드는 현재 체력은 클라이언트에만 있고, 여기는 정의라 0이 입력 실수다.
  hp INTEGER NOT NULL CHECK (hp > 0),

  -- 방어. 피해 감소는 armor / (armor + 1000)이고, 0은 방어 없는 몬스터라 허용한다.
  --
  -- 티어 배율을 받지 않는다(2026-09-15). 8%는 "티어10이 정확히 2배 = +10 강화"라서
  -- 고른 숫자인데, 방어까지 오르면 피해 감소가 함께 커져 티어10 유효 체력이 2배가
  -- 아니라 약 2.33배가 된다.
  armor INTEGER NOT NULL CHECK (armor >= 0),

  -- 기본 공격 한 대의 데미지. 티어 배율이 곱해진다. 근접 몹은 붙어서, 원거리 몹은
  -- 멀리서 치지만 같은 칸이다 — 원거리의 일제사격은 기본 공격과 별개인 기믹이다.
  -- 범위가 아니라 한 값이다(2026-09-15). 백로그의 검산식 melee × monsters attached가
  -- 한 값을 전제로 한다.
  auto_attack INTEGER NOT NULL CHECK (auto_attack > 0),

  -- 기본 공격 간격. 기간이라 INTERVAL이지만, 위 time_limit과 달리 SQL에서 시각과
  -- 계산할 일은 없다 — 전투는 클라이언트에서 돈다. 그래도 "기간이면 INTERVAL"
  -- 규칙 하나로 두는 편을 골랐다. 읽을 때는 EXTRACT(EPOCH FROM ...)::float8로 바꾼다.
  auto_attack_interval INTERVAL NOT NULL
    CHECK (auto_attack_interval > INTERVAL '0 seconds')
);


-- 던전의 팩 구성 — 몇 번 팩에 어떤 몬스터가 몇 마리인가(2026-09-15).
-- monster_template이 "무엇인가"라면 이 표는 "어디에 몇 번 나오는가"다. WoW가
-- creature_template(정의)과 creature(스폰)를 나눈 것과 같은 구분이다. 스웜 하나가
-- 여러 팩에 나오므로 monster_template에 팩 컬럼을 둘 수 없다.
--
-- 한 행은 한 팩 안의 몬스터 한 종류와 그 마리 수다. player_stack의 "한 종류당 한 행
-- + 개수"와 같은 모양이다. 마리마다 행을 두면 같은 팩의 두 스웜이 똑같은 행이 되어
-- 구분할 순번이 따로 필요해진다.
--
-- 팩의 위치는 없다. 간격이 10칸 고정이라 팩 번호로 계산되고, 보스는 마지막 팩이
-- 죽은 자리에 나온다 — 둘 다 규칙이라 저장하지 않는다.
--
-- 행은 seed.sql 16번 블록에 있다(2026-09-30). 구성표의 원본은 백로그 Pack layout
-- and chain pulling이다(8팩 22마리, 14행).
CREATE TABLE monster_pack (

  -- 어느 던전의 팩인가. 두 번째 던전이 생기면 행만 늘어난다
  dungeon_template_id INTEGER NOT NULL REFERENCES dungeon_template,

  -- 몇 번째 팩인가. 백로그의 8팩 고정을 상한으로 막았다. 다만 백로그는 22마리가
  -- 5분에 들어가는지를 티어1 수치가 나올 때까지 잠정으로 두었으므로, 팩 수가
  -- 바뀌면 이 줄도 같이 고친다
  pack_number INTEGER NOT NULL CHECK (pack_number BETWEEN 1 AND 8),

  -- 어떤 몬스터인가
  monster_template_id INTEGER NOT NULL REFERENCES monster_template,

  -- 몇 마리인가. 0마리 행은 "이 팩에 이 몬스터가 없다"는 뜻인데, 그건 행이 없는
  -- 것으로 이미 표현된다 — player_stack.amount와 같은 판단이다
  amount INTEGER NOT NULL CHECK (amount > 0),

  -- 같은 팩에 같은 몬스터 행이 두 번 들어오면 마리 수가 두 곳에 나뉜다. 마리 수는
  -- 행의 내용이지 행을 가리키는 이름표가 아니라서 PK에 넣지 않는다 — 넣으면
  -- 마리 수만 다른 중복 행이 통과한다
  PRIMARY KEY (dungeon_template_id, pack_number, monster_template_id)
);


-- 던전 런 한 번. 클리어만이 아니라 실패한 런과 진행 중인 런까지 전부 여기 들어온다.
-- 리더보드를 따로 두지 않은 이유가 이것이다 — 리더보드는 저장 장소가 아니라
-- 이 표를 status로 거른 조회 결과다. 같은 사실을 두 곳에 적으면 둘이 어긋난다.
--
-- 서버는 런의 시작과 끝만 안다. 진행 중에는 아무것도 받지 않으므로 실시간 전투
-- 상태는 이 표에 없다. 대신 입장 자격 검사와 시간 측정이 서버 쪽에 남는다.
--
-- 소요 시간 컬럼은 두지 않는다. end_time - start_time으로 나오는 값이라 따로
-- 저장하면 손으로 맞춰야 하는 자리가 하나 늘어난다. 제한 시간을 넘겼는지도 같은
-- 이유로 저장하지 않고 dungeon_tier_template의 제한 시간과 비교해서 판정한다.
CREATE TABLE dungeon_run (
  dungeon_run_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  player_id  INTEGER NOT NULL REFERENCES player ON DELETE CASCADE,
  dungeon_template_id  INTEGER NOT NULL REFERENCES dungeon_template,

  -- 몇 티어짜리 런인가. dungeon_tier_template이 생기기 전에는 CHECK 하나뿐이었고,
  -- 그 표가 생기면서 FK를 걸 수 있게 됐다(2026-09-14).
  --
  -- 둘 다 남겼지만 FK만으로 충분한지는 아직 안 갈랐다. 티어 표에 열 행이 다
  -- 들어 있으면 CHECK가 더 막는 값이 없어 보이는데, 확인하지 않았다.
  -- 입장 API에서 티어 자격을 검사할 때 이 줄을 다시 볼 자리다.
  tier  INTEGER NOT NULL REFERENCES dungeon_tier_template(tier) CHECK (tier BETWEEN 1 AND 10),

  -- 서버가 입장 시각을 찍는다
  start_time  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 진행 중이면 NULL
  end_time  TIMESTAMPTZ,

  -- 진행중 / 클리어 / 실패
  status  TEXT NOT NULL CHECK (status IN ('ongoing', 'cleared', 'failed')),

  -- end_time과 status는 "런이 끝났는가"라는 같은 사실을 두 번 말한다. 한쪽만
  -- 바뀌면 DB가 모순된 상태를 갖게 되므로, 둘이 항상 같은 답을 내도록 묶는다.
  -- ongoing이 아닌 모든 상태(cleared·failed)는 자동으로 end_time을 요구받는다.
  CHECK ((end_time IS NULL) = (status = 'ongoing'))
);


-- 새 플레이어 한 명과 그 시작 상태(장비·재료·밭·씨앗)를 만들고 player_id를 돌려준다.
--
-- 함수로 DB 안에 두는 이유: 시작 상태를 쓰는 곳이 둘이다 — seed.sql이 개발용
-- player 1을 만들 때와, 서버가 방문자에게 게스트를 만들어 줄 때. seed는 SQL이고
-- 서버는 TS라 둘이 함께 읽을 수 있는 곳이 DB뿐이다. 한쪽에 복사해 두면 임시
-- 지급 블록을 지우는 날 한쪽만 고쳐져서 개발용 플레이어와 실제 게스트가 조용히
-- 달라진다(2026-11-23 결정).
--
-- LANGUAGE plpgsql인 이유: 방금 만든 player_id를 변수에 담아 아래 INSERT들이
-- 나눠 써야 한다. 순수 SQL 함수에는 변수가 없다.
--
-- 템플릿 표(stack_template, gear_template)를 읽으므로 seed가 템플릿을 다 넣은
-- 뒤에 불러야 한다. 템플릿이 비어 있으면 에러 없이 빈손의 플레이어가 생긴다.
--
-- 전체가 함수 호출 한 번이라 하나의 문장으로 실행된다 — 중간에 실패하면 반쯤
-- 만들어진 플레이어가 남지 않고 통째로 취소된다.
CREATE FUNCTION create_player() RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_player_id INTEGER;
BEGIN
  -- 1. 플레이어 행. guest_token·last_seen_at·gold·highest_tier_cleared 모두
  --    DEFAULT가 있어서 값을 하나도 안 써도 된다.
  INSERT INTO player DEFAULT VALUES
    RETURNING player_id INTO new_player_id;

  -- 2. 장비 정의마다 실물을 하나씩 준다. 정의를 그대로 읽어 옮기므로 장비 종류가
  --    늘어도 이 블록은 손댈 필요가 없다. upgrade_level은 DEFAULT 0, 갓 얻은 상태다.
  INSERT INTO gear_instance (gear_template_id, player_id)
  SELECT gear_template_id, new_player_id
    FROM gear_template;

  -- 3. 장비 칸 5개를 만들면서 방금 만든 실물을 각자 자리에 끼운다. 어느 칸에
  --    들어가는지(slot)는 "이 낫"이 아니라 "낫이라는 물건"의 성질이라 템플릿에
  --    있어서 JOIN이 필요하다. 해제가 없으므로 이 다섯 칸은 앞으로도 비지 않는다.
  --
  --    WHERE가 꼭 있어야 한다. seed에 있던 원래 블록은 플레이어가 한 명뿐이라
  --    모든 gear_instance를 읽어도 됐지만, 여기서 빼면 다른 플레이어의 장비까지
  --    새 플레이어의 칸에 끼우려다 PK·UNIQUE 위반이 난다.
  INSERT INTO player_gear_slot (player_id, slot, gear_instance_id)
  SELECT i.player_id, t.slot, i.gear_instance_id
    FROM gear_instance i
    JOIN gear_template t ON i.gear_template_id = t.gear_template_id
   WHERE i.player_id = new_player_id;

  -- 4. 강화 재료. 재료가 들어올 통로(드랍·정제 루프)가 아직 약해서 놓은 임시
  --    지급이다. 수량은 +10 기댓값보다 넉넉하게 — 세 확률 구간(100/70/40%)을 한 번에
  --    통과해 볼 수 있게. 재료를 얻는 경로가 생기면 이 블록은 지운다.
  INSERT INTO player_stack (player_id, stack_template_id, amount)
  SELECT
    new_player_id,
    (SELECT stack_template_id FROM stack_template WHERE name = v.name),
    v.amount
  FROM (VALUES
    ('Seed Crest',       20),
    ('Sprout Crest',     20),
    ('Harvest Crest',    20),
    ('Refined Ironroot', 40)
  ) AS v(name, amount);

  -- 5. 가방에 여분 장비 두 점. 2번의 다섯 점이 전부 장착돼 있어서 이게 없으면 장착
  --    화면에 바꿔 낄 대상이 없다. +3은 밸런스가 아니라 눈에 보이라고 — 같은 이름이
  --    둘이면 어느 쪽이 끼워졌는지 "+3"으로 구분된다. 칸에 넣지 않은 실물이 곧
  --    가방에 있는 장비다. 드랍이 생기면 이 블록은 지운다.
  INSERT INTO gear_instance (gear_template_id, player_id, upgrade_level)
  SELECT gear_template_id, new_player_id, 3
    FROM gear_template
   WHERE name IN ('Solid Scythe', 'Straw Hat');

  -- 6. 밭 25칸을 빈 채로. 칸 자체가 행이라 심기 전에도 있어야 FOR UPDATE가 잠글
  --    행이 생긴다. crop_template_id·planted_at이 함께 NULL인 것이 빈 칸이다.
  INSERT INTO player_plot (player_id, plot_number)
  SELECT new_player_id, n
    FROM generate_series(1, 25) AS n;

  -- 7. 씨앗을 작물당 10개씩. 40개로 25칸을 다 채울 수는 있지만 한 종류로 도배는
  --    못 해서 무엇을 심을지가 선택이 된다. 4번과 달리 수확이 씨앗을 돌려주는 통로가
  --    이미 있어서, 이건 순환을 시작시키는 초기 자본이라 계속 남는다.
  INSERT INTO player_stack (player_id, stack_template_id, amount)
  SELECT new_player_id, stack_template_id, 10
    FROM stack_template
   WHERE name IN ('Wheat Seed', 'Potato Seed', 'Chili Pepper Seed', 'Ironroot Seed');

  RETURN new_player_id;
END;
$$;
