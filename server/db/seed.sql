-- FarmDelve — 첫 슬라이스(장비 강화)를 돌려보기 위한 씨앗 데이터.
-- schema.sql 직후에 실행된다. 넣는 순서는 외래 키가 강제한다 —
-- 참조당하는 쪽이 먼저 있어야 그 id를 가리킬 수 있다.
--
-- id를 숫자로 직접 쓰지 않고 이름으로 조회하는 이유: DB가 매긴 번호는 여기서
-- 알 수 없고, 위쪽 INSERT 순서가 바뀌면 번호도 바뀐다. 번호를 박아두면 그때
-- 에러가 나는 것이 아니라 조용히 다른 물건을 가리키게 된다.


-- 1. 플레이어. 로그인이 미뤄져 있어 개발 중에는 이 한 행으로 논다.
--    두 컬럼 다 DEFAULT가 있어서 값을 하나도 안 써도 된다.
INSERT INTO player DEFAULT VALUES;


-- 2. 쌓이는 물건 5종. stack_template_id는 GENERATED ALWAYS라 목록에서 뺀다.
INSERT INTO stack_template (name, icon, max_stack)
VALUES
  ('Seed Crest',       '🌱', 99),
  ('Sprout Crest',     '🌿', 99),
  ('Harvest Crest',    '🌾', 99),
  ('Refined Ironroot', '⚙️', 99),
  ('Ironroot',         '🪵', 99);


-- 3. 시작 낫의 정의. 스탯은 임시값이다 — 몬스터 체력이 정해져야 "40초에
--    무엇이 죽는가"로 역산할 수 있고, 그 전 숫자는 근거가 없다.
--    base_health / base_armor / base_crit은 DEFAULT 0이라 목록에서 뺐다.
INSERT INTO gear_template (name, slot, base_item_level, rarity, base_attack_power)
VALUES ('Solid Sickle', 'weapon', 1, 'common', 10);


-- 4. 그 낫을 실제로 한 자루 만들어 플레이어에게 준다.
--    upgrade_level은 DEFAULT 0이라 생략한다 — 갓 얻은 상태다.
INSERT INTO gear_instance (gear_template_id, player_id)
VALUES (
  (SELECT gear_template_id FROM gear_template WHERE name = 'Solid Sickle'),
  (SELECT player_id FROM player)
);


-- 5. 장비 칸 5개. 칸은 항상 존재하고 내용물만 바뀌므로, 비어 있는 칸도
--    행으로 넣는다. 시작 장비는 무기뿐이라 나머지 넷은 NULL이다.
--
--    weapon 칸의 서브쿼리에 WHERE가 없는 것은, 이 시점의 gear_instance에
--    행이 하나뿐이라는 사실에 기대고 있다. 씨앗 데이터라서 성립하는 요령이고,
--    장비가 둘 이상 들어오면 조건을 붙여야 한다.
INSERT INTO player_gear_slot (player_id, slot, gear_instance_id)
VALUES
  ((SELECT player_id FROM player), 'head',   NULL),
  ((SELECT player_id FROM player), 'chest',  NULL),
  ((SELECT player_id FROM player), 'legs',   NULL),
  ((SELECT player_id FROM player), 'feet',   NULL),
  ((SELECT player_id FROM player), 'weapon', (SELECT gear_instance_id FROM gear_instance));


-- 6. 강화 비용표 10행. 한 행이 "n-1에서 n으로 올리는 비용"이라 1부터 시작한다.
--
--    맨 아래 FROM (VALUES ...) AS v(...) 가 이름 없는 임시 표를 만들고,
--    SELECT가 그 표를 한 행씩 읽어 INSERT한다. 이렇게 하면 서브쿼리를 열 번이
--    아니라 두 번만 쓴다.
--
--    두 서브쿼리의 모양이 다른 이유: crest는 단계마다 달라지므로 임시 표의
--    컬럼(v.crest_name)을 읽고, 정제 재료는 열 단계가 전부 같아서 이름을
--    직접 적었다.
INSERT INTO upgrade (
  upgrade_level, success_rate,
  crest_stack_template_id, crest_amount,
  material_stack_template_id, material_amount
)
SELECT
  v.level,
  v.rate,
  (SELECT stack_template_id FROM stack_template WHERE name = v.crest_name),
  v.crest_amount,
  (SELECT stack_template_id FROM stack_template WHERE name = 'Refined Ironroot'),
  1
FROM (VALUES
  ( 1, 100, 'Seed Crest',    1),
  ( 2, 100, 'Seed Crest',    2),
  ( 3, 100, 'Seed Crest',    3),
  ( 4, 100, 'Seed Crest',    4),
  ( 5,  70, 'Sprout Crest',  1),
  ( 6,  70, 'Sprout Crest',  2),
  ( 7,  70, 'Sprout Crest',  3),
  ( 8,  70, 'Sprout Crest',  4),
  ( 9,  40, 'Harvest Crest', 1),
  (10,  40, 'Harvest Crest', 2)
) AS v(level, rate, crest_name, crest_amount);


-- 7. 강화 재료를 쥐여준다. 농사도 던전도 아직 없어서 재료가 들어올 통로가
--    하나도 없으므로, 이게 없으면 강화 API는 재료 부족만 돌려준다.
--
--    수량은 백로그의 +10 기댓값(T1 10, T2 약 14, T3 약 8, 정제 재료 약 15)보다
--    넉넉하게 잡았다. 세 확률 구간(100% / 70% / 40%)을 한 번에 통과해보려는
--    것이고, 재료 부족 응답은 다 쓰고 나면 어차피 만나게 된다.
--
--    Ironroot(원재료)는 넣지 않는다. 정제 기능이 없어서 Refined Ironroot로
--    바꿀 방법이 아직 없고, 그러면 가방에 쓸모없이 쌓이기만 한다.
--
--    재료를 얻는 경로가 생기면 이 블록은 지운다.
INSERT INTO player_stack (player_id, stack_template_id, amount)
SELECT
  (SELECT player_id FROM player),
  (SELECT stack_template_id FROM stack_template WHERE name = v.name),
  v.amount
FROM (VALUES
  ('Seed Crest',       20),
  ('Sprout Crest',     20),
  ('Harvest Crest',    20),
  ('Refined Ironroot', 40)
) AS v(name, amount);
