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


-- 2. 쌓이는 물건 12종. stack_template_id는 GENERATED ALWAYS라 목록에서 뺀다.
--
--    crest 셋은 원래 성장 단계(🌱🌿🌾)로 그렸는데 메달로 바꿨다. 🌾가 밀을
--    나타내는 사실상 유일한 이모지라, 대체재가 없는 쪽에 양보한 것이다.
--    crest는 등급만 전달하면 되고 메달이 오히려 등급으로 더 잘 읽힌다.
--
--    씨앗은 봉지 + 작물 두 글자다. icon이 TEXT라 이모지를 이어 붙일 수 있고,
--    그러면 "씨앗이다"라는 분류와 "무슨 씨앗이다"가 한 칸에서 동시에 읽힌다.
--
--    이모지는 전부 자리 표시다. 이미지로 바꾸는 것은 별도 작업이고, icon이
--    TEXT라 그때도 스키마는 그대로 두고 값만 경로로 갈아끼우면 된다.
INSERT INTO stack_template (name, icon, max_stack)
VALUES
  ('Seed Crest',        '🥉',   99),
  ('Sprout Crest',      '🥈',   99),
  ('Harvest Crest',     '🥇',   99),
  ('Refined Ironroot',  '⚙️',   99),
  ('Ironroot',          '🪵',   99),

  ('Wheat Seed',        '🫘🌾', 99),
  ('Potato Seed',       '🫘🥔', 99),
  ('Chili Pepper Seed', '🫘🌶️', 99),
  ('Ironroot Seed',     '🫘🪵', 99),

  ('Wheat',             '🌾',   99),
  ('Potato',            '🥔',   99),
  ('Chili Pepper',      '🌶️',   99);


-- 3. 시작 장비 5종의 정의. 스탯은 전부 임시값이다 — 몬스터 체력이 정해져야
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
  ('Solid Sickle',  'weapon', 'common', 10,  0, 0),
  ('Straw Hat',     'head',   'common',  0, 10, 2),
  ('Work Shirt',    'chest',  'common',  0, 10, 2),
  ('Work Trousers', 'legs',   'common',  0, 10, 2),
  ('Muck Boots',    'feet',   'common',  0, 10, 2);


-- 4. 정의마다 실물을 하나씩 만들어 플레이어에게 준다. 다섯 종이라 다섯 행을
--    적는 대신, gear_template을 그대로 읽어 옮긴다 — 장비를 추가해도 이 블록은
--    손댈 필요가 없다.
--
--    upgrade_level은 DEFAULT 0이라 생략한다 — 갓 얻은 상태다.
INSERT INTO gear_instance (gear_template_id, player_id)
SELECT gear_template_id, (SELECT player_id FROM player)
  FROM gear_template;


-- 5. 장비 칸 5개를 만들면서 방금 만든 실물을 각자 자리에 끼워준다.
--
--    여기서 JOIN이 필요한 이유: gear_instance는 "누구의 몇 번 장비"만 알고
--    자기가 어느 칸에 들어가는지는 모른다. 그 정보(slot)는 gear_template에
--    있다. 어느 칸에 들어가는지는 "이 낫"의 성질이 아니라 "낫이라는 물건"의
--    성질이기 때문이다 — 템플릿과 인스턴스를 나눈 설계가 여기서 대가를 치른다.
--
--    ON의 양쪽은 이름이 같지만 뜻이 다르다. i 쪽은 "내가 따르는 정의의 번호",
--    t 쪽은 "이 정의 자신의 번호"다. schema.sql에 적어둔 REFERENCES 관계를
--    조회할 때 다시 말해주는 것이라, 앞으로 나올 JOIN도 대개 이 모양이 된다.
--
--    비어 있는 칸이 하나도 없는 것은 기본 방어구를 지급하기로 해서다
--    (2026-08-31). 해제가 없으므로 이 다섯 칸은 앞으로도 비지 않는다.
INSERT INTO player_gear_slot (player_id, slot, gear_instance_id)
SELECT i.player_id, t.slot, i.gear_instance_id
  FROM gear_instance i
  JOIN gear_template t ON i.gear_template_id = t.gear_template_id;


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


-- 8. 가방에 여분 장비 두 점. 5번에서 만든 다섯 점이 전부 장착돼 있어서, 이게
--    없으면 장착 화면에 우클릭할 대상이 하나도 없다.
--
--    upgrade_level을 3으로 주는 이유는 밸런스가 아니라 눈에 보이라고다. 같은
--    이름이 둘이면 어느 쪽이 끼워졌는지 구분이 안 되는데, "+3"이 붙으면
--    교체됐다는 것이 화면에서 바로 읽힌다.
--
--    장착 칸에 넣지 않는다 — 어느 칸에도 속하지 않은 gear_instance가 곧
--    가방에 있는 장비다.
--
--    드랍이 생기면 이 블록은 지운다.
INSERT INTO gear_instance (gear_template_id, player_id, upgrade_level)
SELECT gear_template_id, (SELECT player_id FROM player), 3
  FROM gear_template
 WHERE name IN ('Solid Sickle', 'Straw Hat');


-- 9. 작물 4종. 성장 시간은 백로그에서 확정된 값이고(2026-08-26), 나머지 둘은
--    임시값이다 — 골드 사용처가 아직 없어서 검증할 기준이 없다.
--
--    harvest_gold는 시간당으로 보면 Wheat이 두 배 유리하다. 백로그가 Wheat을
--    cash crop으로 지정해서다. Ironroot가 제일 낮은 것은 골드가 아니라 강화
--    재료라는 가치로 버는 작물이기 때문이다.
--
--    crop_amount는 넷 다 1이라 목록에 넣지 않고 직접 적는다. 6번 블록이
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


-- 10. 조합 레시피 한 줄. 물약 둘은 전투가 생긴 다음이다 — 지금 넣어도 마실
--     일이 없고, 마셔지지 않는 물약은 만들어봐야 확인이 안 된다.
--
--     한 행뿐이라 6번처럼 임시 표를 만들지 않고 VALUES에 바로 적는다.
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


-- 11. 밭 25칸을 빈 채로 만들어 둔다. 칸 자체가 행이라(player_gear_slot과 같은
--     모양) 심기 전에도 25행이 있어야 한다. 없으면 심을 때 INSERT가 되고,
--     그러면 FOR UPDATE가 잠글 행이 없어진다 — schema.sql에 적어둔 이유다.
--
--     generate_series(a, b)는 a부터 b까지 숫자를 한 행씩 내놓는 함수다. 표처럼
--     FROM에 쓸 수 있어서, 25줄을 적는 대신 이 한 줄이 25행을 만든다.
--
--     crop_template_id와 planted_at은 목록에 없다. 안 적으면 NULL이 들어가고,
--     그 둘이 함께 NULL인 것이 곧 빈 칸이다. 짝을 이뤄야 한다는 CHECK도
--     둘 다 NULL이므로 통과한다.
--
--     밭 확장이 보류라 25는 당분간 고정이다. 늘리는 날 이 숫자와 schema.sql의
--     CHECK를 함께 고쳐야 한다.
INSERT INTO player_plot (player_id, plot_number)
SELECT (SELECT player_id FROM player), n
  FROM generate_series(1, 25) AS n;


-- 12. 씨앗을 작물당 10개씩 쥐여준다. 밭이 25칸이라 40개로 다 채울 수는 있지만
--     한 종류로 도배할 수는 없어서, 무엇을 심을지가 실제로 선택이 된다.
--
--     7번 블록과 성격이 다르다. 저쪽은 재료가 들어올 통로가 없어서 놓은 임시
--     지급이고 통로가 생기면 지운다. 이쪽은 수확이 씨앗을 돌려주므로 통로가
--     이미 있고, 이 블록은 그 순환을 시작시키는 초기 자본이라 계속 남는다.
--
--     수확물(Wheat, Potato...)은 주지 않는다. 심어서 거두면 나오는 것이라,
--     주면 농사를 안 지어도 되는 상태가 된다.
INSERT INTO player_stack (player_id, stack_template_id, amount)
SELECT (SELECT player_id FROM player), stack_template_id, 10
  FROM stack_template
 WHERE name IN ('Wheat Seed', 'Potato Seed', 'Chili Pepper Seed', 'Ironroot Seed');
