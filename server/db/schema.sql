-- FarmDelve — 첫 슬라이스(장비 강화)에 필요한 7개 테이블.
-- 나머지 10개는 각자의 슬라이스에서 짓는다. 자세한 근거는 docs/data-model.md.
--
-- npm run db:reset 으로 실행한다. 개발 중에는 스키마가 자주 바뀌므로 매번 통째로
-- 다시 만드는 편이 빠르다. 실 데이터가 생기기 전까지만 유효한 방식이다.

-- 다시 만들기 전에 지운다. 참조하는 쪽을 먼저 지워야 외래 키가 걸리지 않는다.
DROP TABLE IF EXISTS player_gear_slot;
DROP TABLE IF EXISTS gear_instance;
DROP TABLE IF EXISTS player_stack;
DROP TABLE IF EXISTS upgrade;
DROP TABLE IF EXISTS gear_template;
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

  base_item_level INTEGER NOT NULL CHECK (base_item_level > 0),

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
