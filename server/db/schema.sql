-- FarmDelve — 지금까지 지은 10개 테이블. 강화·장착 슬라이스가 일곱을 세웠고,
-- 농장 슬라이스가 셋을 더했다(2026-09-03).
-- 남은 일곱(던전 다섯, 특성, 세트 보너스)은 각자의 슬라이스에서 짓는다.
-- 자세한 근거는 docs/data-model.md.
--
-- npm run db:reset 으로 실행한다. 개발 중에는 스키마가 자주 바뀌므로 매번 통째로
-- 다시 만드는 편이 빠르다. 실 데이터가 생기기 전까지만 유효한 방식이다.

-- 다시 만들기 전에 지운다. 참조하는 쪽을 먼저 지워야 외래 키가 걸리지 않는다.
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


-- 플레이어. 로그인은 미뤄져 있어서 개발 중에는 이 테이블에 행이 하나뿐이다.
CREATE TABLE player (
  player_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

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
CREATE TABLE stack_template (
  stack_template_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,

  -- 한 칸에 몇 개까지 쌓이는지. 가방 칸 수 계산에만 쓰이고 소지 상한은 아니다.
  max_stack INTEGER NOT NULL CHECK (max_stack > 0)
);


-- 플레이어가 실제로 가진 장비 한 점. 같은 템플릿에서 나온 두 자루가 서로 다른
-- 강화 단계를 가질 수 있어서 인스턴스가 따로 필요하다.
CREATE TABLE gear_instance (
  gear_instance_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gear_template_id INTEGER NOT NULL REFERENCES gear_template,
  player_id INTEGER NOT NULL REFERENCES player,

  -- upgrade 테이블의 같은 이름 컬럼과 외래 키 관계가 아니다. 여기 0은 갓 얻은
  -- 상태이고, upgrade 쪽은 "한 단계 올리는 비용"이라 1부터 시작한다.
  upgrade_level INTEGER NOT NULL DEFAULT 0 CHECK (upgrade_level BETWEEN 0 AND 10)
);


-- 플레이어가 가진 스택 아이템의 개수. 한 종류당 한 행이므로 두 컬럼이 함께 PK다.
CREATE TABLE player_stack (
  player_id INTEGER NOT NULL REFERENCES player,
  stack_template_id INTEGER NOT NULL REFERENCES stack_template,

  -- 0이 되면 행을 지운다. 0개를 들고 있다는 행이 남으면 가방 칸 계산이 어긋난다.
  amount INTEGER NOT NULL CHECK (amount > 0),

  PRIMARY KEY (player_id, stack_template_id)
);


-- 어느 칸에 무엇이 장착돼 있는지. 칸 자체가 행이고, 내용물은 바뀐다.
CREATE TABLE player_gear_slot (
  player_id INTEGER NOT NULL REFERENCES player,
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
  player_id INTEGER NOT NULL REFERENCES player,

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
