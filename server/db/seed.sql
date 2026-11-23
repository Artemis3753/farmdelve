-- FarmDelve — 첫 슬라이스(장비 강화)를 돌려보기 위한 씨앗 데이터.
-- schema.sql 직후에 실행된다. 넣는 순서는 외래 키가 강제한다 —
-- 참조당하는 쪽이 먼저 있어야 그 id를 가리킬 수 있다.
--
-- id를 숫자로 직접 쓰지 않고 이름으로 조회하는 이유: DB가 매긴 번호는 여기서
-- 알 수 없고, 위쪽 INSERT 순서가 바뀌면 번호도 바뀐다. 번호를 박아두면 그때
-- 에러가 나는 것이 아니라 조용히 다른 물건을 가리키게 된다.


-- 1. 쌓이는 물건 12종. stack_template_id는 GENERATED ALWAYS라 목록에서 뺀다.
--
--    여기 있던 icon 열은 지웠다. 이름이 곧 아이콘 키라서 Icon.jsx의 표가 이
--    name으로 그림을 찾는다 — 그래서 이 목록의 이름을 고치면 화면에서 아이콘이
--    사라진다. 값이 두 곳에 있는 게 아니라 한쪽이 다른 쪽의 키다.
INSERT INTO stack_template (name, max_stack)
VALUES
  ('Seed Crest',        99),
  ('Sprout Crest',      99),
  ('Harvest Crest',     99),
  ('Refined Ironroot',  99),
  ('Ironroot',          99),

  ('Wheat Seed',        99),
  ('Potato Seed',       99),
  ('Chili Pepper Seed', 99),
  ('Ironroot Seed',     99),

  ('Wheat',             99),
  ('Potato',            99),
  ('Chili Pepper',      99);


-- 2. 시작 장비 5종의 정의. 스탯은 전부 임시값이다 — 몬스터 체력이 정해져야
--    "40초에 무엇이 죽는가"로 역산할 수 있고, 그 전 숫자는 근거가 없다.
--
--    방어구 넷은 같은 값을 쓴다. 가슴이 신발보다 튼튼한 식의 슬롯별 차등은
--    현실적이지만, 그 비율을 정할 근거가 지금 없다. 근거 없는 숫자를 넷으로
--    쪼개면 나중에 넷 다 다시 잡아야 한다.
--
--    슬롯이 안 쓰는 스탯은 0이다. 낫은 방어력이 없고, 방어구는 공격력이 없다.
--    base_crit은 DEFAULT 0이라 목록에서 뺐다.
INSERT INTO gear_template (name, slot, rarity, base_attack_power, base_health, base_armor)
VALUES
  ('Solid Scythe',  'weapon', 'common', 10,  0, 0),
  ('Straw Hat',     'head',   'common',  0, 10, 2),
  ('Work Shirt',    'chest',  'common',  0, 10, 2),
  ('Work Trousers', 'legs',   'common',  0, 10, 2),
  ('Muck Boots',    'feet',   'common',  0, 10, 2);


-- 3. 강화 비용표 10행. 한 행이 "n-1에서 n으로 올리는 비용"이라 1부터 시작한다.
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


-- 4. 작물 4종. 성장 시간은 백로그에서 확정된 값이고(2026-08-26), 나머지 둘은
--    임시값이다 — 골드 사용처가 아직 없어서 검증할 기준이 없다.
--
--    harvest_gold는 시간당으로 보면 Wheat이 두 배 유리하다. 백로그가 Wheat을
--    cash crop으로 지정해서다. Ironroot가 제일 낮은 것은 골드가 아니라 강화
--    재료라는 가치로 버는 작물이기 때문이다.
--
--    crop_amount는 넷 다 1이라 목록에 넣지 않고 직접 적는다. 3번 블록이
--    material_amount를 1로 적은 것과 같은 이유다.
--
--    수확이 씨앗을 몇 개 돌려주는지는 여기 없다 — 전 작물 공통이라 코드 상수다.
INSERT INTO crop_template (
  seed_stack_template_id, crop_stack_template_id,
  growth_time, crop_amount, harvest_gold
)
SELECT
  (SELECT stack_template_id FROM stack_template WHERE name = v.seed_name),
  (SELECT stack_template_id FROM stack_template WHERE name = v.crop_name),
  v.growth_time,
  1,
  v.gold
FROM (VALUES
  ('Wheat Seed',        'Wheat',        INTERVAL '20 minutes', 8),
  ('Potato Seed',       'Potato',       INTERVAL '5 minutes', 1),
  ('Chili Pepper Seed', 'Chili Pepper', INTERVAL '5 minutes', 1),
  ('Ironroot Seed',     'Ironroot',     INTERVAL '1 hour', 5)
) AS v(seed_name, crop_name, growth_time, gold);


-- 5. 조합 레시피 한 줄. 물약 둘은 전투가 생긴 다음이다 — 지금 넣어도 마실
--     일이 없고, 마셔지지 않는 물약은 만들어봐야 확인이 안 된다.
--
--     한 행뿐이라 3번처럼 임시 표를 만들지 않고 VALUES에 바로 적는다.
INSERT INTO recipe (
  ingredient_stack_template_id, ingredient_amount,
  crafted_stack_template_id, crafted_amount
)
VALUES (
  (SELECT stack_template_id FROM stack_template WHERE name = 'Ironroot'),
  5,
  (SELECT stack_template_id FROM stack_template WHERE name = 'Refined Ironroot'),
  1
);


-- 6. 던전 하나. DoD가 던전 한 곳이라 행도 하나지만, 코드 상수가 아니라 표로
--     둔 이유는 schema.sql의 dungeon_template 주석에 적어뒀다.
--
--     이름은 화면 헤더에 그대로 뜬다(백로그 §1 Gear and UI layout). 아이콘 키로
--     쓰이는 stack_template.name과 달리 코드와 엮이는 곳이 없어서, 나중에
--     바꾸더라도 깨지는 자리가 없다.
INSERT INTO dungeon_template (name)
VALUES ('The Fallow Deep');


-- 7. 티어 10단의 제한 시간. 백로그 §1 Dungeon loop and rewards가 밴드로
--     정해놨다 — 1~4는 5분, 5~8은 10분, 9~10은 15분.
--
--     오늘 아침에 "배율은 표에 안 넣는다"고 정했는데 제한 시간은 표에 넣는 것이
--     어긋나 보일 수 있다. 둘의 성격이 다르다 — 배율은 1.08^(tier-1)이라 규칙
--     하나로 열 값이 다 나오지만, 밴드는 계단이라 그런 식이 없다. 계단의 위치
--     자체가 밸런싱 결정이다.
--
--     열 줄을 그대로 적는 모양은 upgrade 블록(3번)과 같다. 저쪽도 100/70/40
--     세 구간이라 여기와 같은 계단이다.
--
--     한 줄에 한 밴드씩 묶어 적는다. 티어 순서대로 열 줄을 세우는 것보다
--     계단이 어디서 꺾이는지가 눈에 먼저 들어온다.
INSERT INTO dungeon_tier_template (tier, time_limit)
VALUES
  ( 1, INTERVAL '5 minutes'), ( 2, INTERVAL '5 minutes'), ( 3, INTERVAL '5 minutes'), ( 4, INTERVAL '5 minutes'),
  ( 5, INTERVAL '10 minutes'), ( 6, INTERVAL '10 minutes'), ( 7, INTERVAL '10 minutes'), ( 8, INTERVAL '10 minutes'),
  ( 9, INTERVAL '15 minutes'), (10, INTERVAL '15 minutes');


-- 8. 트래시 몬스터 넷의 티어1 값. 수치는 백로그 §1 Tier-1 numbers에서 왔고, 전투
--     코드가 없어 아직 한 번도 싸워보지 않은 값이라 전부 잠정이다.
--
--     체력은 플레이어 DPS 100에서 거꾸로 셌다 — 스웜은 광역 구간 20초에 녹고,
--     엘리트는 광역 뒤에 절반이 남아 단일 마무리를 만들고, 원거리는 걸어가서 벨
--     만한 값이다.
--
--     엘리트 둘만 방어가 있다. 체력 1600에 방어 250(피해 감소 20%)이면 유효 체력은
--     2000 그대로라 처치 시간은 안 바뀌고, 출혈(방어 무시)이 엘리트에게만 더 잘
--     드는 차이가 생긴다. 스웜·원거리까지 방어를 주면 출혈이 모든 대상에서 같은
--     이득이 되어 차이가 사라진다.
--
--     기본 공격은 스웜:엘리트:원거리 = 1:2:1이다. 네 마리 팩을 회복 없이 40초 맞으면
--     죽는다는 기준에서 역산했다. 10 아래로 내리지 않는 것은 8% 복리를 반올림할 때
--     두 티어가 같은 값이 되지 않게 하려는 것이다.
--
--     이름은 "농장 소재 몬스터"라는 백로그 방향에 맞춰 붙였다. 기믹이 이름에서 읽히게
--     골랐다 — 탈곡기(Thresher)는 돈다, 민달팽이(Slug)는 지나간 자리에 장판을 남긴다,
--     씨앗을 뱉는 것(Seedspitter)은 멀리서 쏜다. 코드와 엮이지 않아 바꿔도 깨지는
--     곳이 없다.
--
--     보스는 아직 없다. 기믹 둘이 보류라 넣을 수치가 없다.
INSERT INTO monster_template (name, hp, armor, auto_attack, auto_attack_interval)
VALUES
  ('Field Rat',   1000,   0, 10, INTERVAL '2 seconds'),  -- 스웜
  ('Thresher',    1600, 250, 20, INTERVAL '2 seconds'),  -- 엘리트 A, 회전
  ('Blight Slug', 1600, 250, 20, INTERVAL '2 seconds'),  -- 엘리트 B, 장판
  ('Seedspitter', 1500,   0, 10, INTERVAL '2 seconds');  -- 원거리, 일제사격


-- 9. The Fallow Deep의 팩 구성 — 8팩 22마리, 14행. 백로그 §1 Pack layout and
--     chain pulling의 표를 그대로 옮겼다.
--
--     id를 숫자로 적지 않고 이름으로 찾는다. id는 IDENTITY가 매기는 값이라
--     8번 블록의 행 순서가 바뀌면 같이 바뀐다 — 숫자로 적어두면 그때 틀린 몬스터를
--     조용히 가리킨다. schema.sql의 create_player()가 씨앗을 이름으로 찾는 것과 같은 이유다.
--
--     한 줄에 한 팩씩 적는다. 팩 번호를 따라 읽으면 백로그 표와 한 줄씩 맞춰볼 수 있다.
--
--     주의: 이름에 오타가 있으면 JOIN이 그 행을 에러 없이 빼버린다. 행이 14개보다
--     적게 들어갔다면 이름부터 볼 것.
INSERT INTO monster_pack (dungeon_template_id, pack_number, monster_template_id, amount)
SELECT d.dungeon_template_id, v.pack_number, m.monster_template_id, v.amount
  FROM (VALUES
    (1, 'Field Rat', 2),
    (2, 'Field Rat', 3),
    (3, 'Field Rat', 2), (3, 'Thresher', 1),
    (4, 'Field Rat', 1), (4, 'Blight Slug', 1),
    (5, 'Field Rat', 2), (5, 'Seedspitter', 1),
    (6, 'Field Rat', 2),
    (7, 'Field Rat', 2), (7, 'Thresher', 1), (7, 'Seedspitter', 1),
    (8, 'Field Rat', 2), (8, 'Blight Slug', 1)
  ) AS v (pack_number, monster_name, amount)
  JOIN monster_template m ON m.name = v.monster_name
  CROSS JOIN dungeon_template d
 WHERE d.name = 'The Fallow Deep';


-- 10. 개발용 플레이어 한 명. 시작 상태(장비·재료·밭·씨앗)를 넣는 일은
--     schema.sql의 create_player()가 맡는다 — 서버가 방문자에게 게스트를 만들어 줄
--     때도 같은 함수를 불러서, 개발용 플레이어와 실제 게스트가 같은 상태로 시작한다.
--
--     맨 마지막에 두는 이유: 함수가 stack_template과 gear_template을 읽는다. 위
--     블록들이 템플릿을 다 넣기 전에 부르면 재료 블록이 재료 id를 못 찾아(NULL)
--     NOT NULL 위반 에러가 나고, 플레이어는 한 행도 남지 않는다.
--
--     서버 테스트(upgrade.test.ts)가 이 플레이어를 찾아 쓴다.
SELECT create_player();
