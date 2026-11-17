// 전투 규칙서. React를 모르는 순수 JS라서, 브라우저 없이 node로 바로 불러
// 시험해볼 수 있다 — 화면(Dungeon.jsx)과 떼어 둔 이유가 이것이다.
//
// 모든 변화는 combatReducer 한 곳에서만 일어난다. 키 입력은 "눌린 방향"을
// 적어두고, 걸음은 tick마다 이어진다(2026-09-30). 단 키를 누르는 그 순간에도
// 한 걸음을 먼저 간다(2026-11-17) — 톡 쳐도 움직이게 하려는 것이다. 어느 쪽이든
// 걸음 사이 간격(MOVE_TICKS)은 지켜서 연타로 속도를 넘지 못한다. 같은 입력
// 순서를 넣으면 언제나 같은 결과가 나온다.
//
// 시간은 초가 아니라 정수 틱으로 센다. 0.1을 계속 더하면 소수 오차가 쌓여
// "2초가 지났나"가 한 틱씩 어긋난다. 20틱은 언제나 20틱이다.

// 한 틱 = 0.1초. 설계의 모든 시간(GCD 1초, 공격 2초, 채널 0.7초/CP, 장판 6·12초,
// 일제사격 8초)이 0.1의 배수라 틱으로 딱 떨어진다.
export const TICKS_PER_SECOND = 10;

// 복도 크기. 세로 9칸은 백로그 Dungeon space. 가로는 마지막 팩(80칸)과 그 대형
// 뒤로 여유를 둔 값이라 근거가 약하다 — 보스 자리가 정해지면 다시 본다.
export const CORRIDOR_HEIGHT = 9;
export const CORRIDOR_LENGTH = 90;

// 팩 간격 10칸(백로그 Dungeon space). n번 팩은 x = n × 10에 선다.
const PACK_SPACING = 10;

// 이동 속도 초당 2칸 = 5틱에 한 칸(백로그 Dungeon space, 잠정).
const MOVE_TICKS = 5;

// 어그로 반경 5칸(백로그 Dungeon space). 거리는 가로·세로 칸 차이 중 큰 쪽으로 잰다 —
// 사거리 표기(range N = 대각선 포함 정사각형)와 같은 자라서, 대각선으로 다가가도
// 가로로 다가가도 같은 5칸이다(2026-11-17).
const AGGRO_RADIUS = 5;

// 몬스터가 때릴 수 있는 거리. 근접 사거리 1칸(대각선 포함, 백로그 Grid movement).
// 추격하는 몬스터는 이 거리까지 다가오면 멈춘다.
const MELEE_RANGE = 1;

// 플레이어의 시작 체력(백로그 Tier-1 numbers, 잠정). 실제로는 장비의 base_health가
// 더해진 값이 되겠지만, 장비 연결 전이라 상수로 둔다.
const PLAYER_MAX_HP = 1000;

// 플레이어 자동공격(2026-11-17, 숫자는 전부 잠정이고 나중에 조정한다). 백로그는 "무기 종류의
// 고정 속도, medium"이라고만 하고 값을 정하지 않았다.
//
// 한 번에 주는 피해 = 공격력 × 계수. 공격력 10은 시작 낫의 자리표시 값(백로그 Still open)이다.
// 스킬이 붙기 전이라 자동공격만으로 쥐 한 마리(hp 1000)를 잡는 데 50초가 걸린다.
const PLAYER_ATTACK_POWER = 10;
const AUTO_ATTACK_COEFFICIENT = 4;
const PLAYER_ATTACK_TICKS = 2 * TICKS_PER_SECOND;

// 방어력 → 피해 감소율은 armor / (armor + ARMOR_K)(백로그 Stats). 나눗셈이라 100%에
// 닿지 않는다.
const ARMOR_K = 1000;

// 분노(Rage)는 정수 단위로 센다: 1c = 10 단위, 최대 5c = 50 단위(spec-note). 0.5c를 만드는
// 스킬(Brutal Swing)이 나중에 와도 소수가 필요 없게 하려는 것이다.
const RAGE_MAX = 50;

// 전체 쿨다운(GCD) 1초 고정(백로그 Tier-1 numbers). 자동공격과 소모품은 GCD를 쓰지 않는다.
const GCD_TICKS = TICKS_PER_SECOND;

// GCD가 끝나기 이 틱 수 안에 누른 스킬 키는 기억해 두었다가 끝나는 틱에 쓴다(2026-11-17).
// WoW의 스펠 큐 창(0~400ms, 커뮤니티 자료)과 같은 발상이다. 틱이 0.1초이고 브라우저 타이머도
// 조금 흔들려서, 아주 조금 일찍 누른 입력이 버려지면 1초 주기 로테이션의 조작감이 둔해진다.
const QUEUE_WINDOW_TICKS = 3;

// 스킬 표. 피해는 방어력 적용 전의 값이고, rageGain은 분노 단위다(10 = 1c). 숫자는 잠정이다:
// 1초에 한 번 쓰면 80 + 자동공격 20 = 백로그의 기준 DPS 100이 되도록 맞췄다.
const SKILLS = {
  furiousThrust: { damage: 80, rageGain: 10 },
};

// 방향은 문자열로 들고, 움직일 때만 이 표에서 칸 차이를 찾는다. 상태에 객체를
// 넣으면 { dx: 1, dy: 0 } === { dx: 1, dy: 0 }이 false라 "오른쪽을 보고 있나"를
// ===로 물을 수 없다. y는 아래로 갈수록 커진다 — 화면 좌표와 같은 방향이다.
const DIRECTIONS = {
  up:    { dx:  0, dy: -1 },
  down:  { dx:  0, dy:  1 },
  left:  { dx: -1, dy:  0 },
  right: { dx:  1, dy:  0 },
};

// 한 팩 안의 대형. 팩 기준점에서의 칸 차이이고, 행 순서대로 앞에서부터 채운다.
// 팩은 최대 4마리라 네 자리면 된다. templates가 몬스터 id 순서로 오므로 스웜이
// 앞자리, 엘리트·원거리가 뒷자리에 선다 — 광역에 먼저 녹을 것이 앞에 선다.
const FORMATION = [
  { dx: 0, dy:  0 },
  { dx: 1, dy: -1 },
  { dx: 1, dy:  1 },
  { dx: 2, dy:  0 },
];


// 서버가 주는 초 단위 값(autoAttackSeconds 등)을 틱으로 바꾼다.
export function secondsToTicks(seconds) {
  return Math.round(seconds * TICKS_PER_SECOND);
}


// templates의 monsters·packs로 복도에 22마리를 세운 첫 상태를 만든다.
// useReducer의 세 번째 인자(init)로 넘긴다.
//
// 체력은 아직 티어1 값 그대로다. 티어 배율은 싸움이 붙을 때 곱한다.
export function createInitialState(monsters, packs) {
  const placed = [];

  // 팩마다 몇 번째 자리까지 찼는지. 같은 팩의 행이 둘 이상(스웜 행 + 엘리트 행)
  // 이어도 대형의 다음 자리부터 이어서 채우려는 것이다.
  const filled = {};

  for (const row of packs) {
    const template = monsters.find((m) => m.monsterTemplateId === row.monsterTemplateId);

    // 행 하나는 "이 몬스터가 몇 마리"라서 amount만큼 개체로 편다.
    for (let i = 0; i < row.amount; i++) {
      const slot = filled[row.packNumber] ?? 0;
      filled[row.packNumber] = slot + 1;

      placed.push({
        // 개체 id. 같은 Field Rat 두 마리를 구분하는 번호라 배열 순서를 쓴다.
        id: placed.length,
        monsterTemplateId: row.monsterTemplateId,
        packNumber: row.packNumber,
        x: row.packNumber * PACK_SPACING + FORMATION[slot].dx,
        y: Math.floor(CORRIDOR_HEIGHT / 2) + FORMATION[slot].dy,
        hp: template.hp,
        armor: template.armor,
        // 어그로가 붙었는가. 한 번 붙으면 풀리지 않는다(leash 없음, 2026-11-17).
        aggro: false,
        // 템플릿의 자동공격 값을 개체에 복사해 둔다(hp와 같은 방식). 간격은 초를 틱으로
        // 바꿔 든다. nextAttackTick 0은 "처음부터 칠 수 있다"는 뜻이라 사거리에 닿는
        // 즉시 첫 공격이 나간다(2026-11-17).
        attackDamage: template.autoAttack,
        attackTicks: secondsToTicks(template.autoAttackSeconds),
        nextAttackTick: 0,
      });
    }
  }

  return {
    tick: 0,
    // 플레이어 체력. player 객체는 위치 전용으로 두었다.
    playerHp: PLAYER_MAX_HP,
    playerMaxHp: PLAYER_MAX_HP,
    // 체력이 0이 되면 true. 그 뒤로는 전투가 멈춘다(백로그: 죽으면 "try again"만).
    defeated: false,
    // 자동공격 대상(몬스터 id). 없으면 null. 플레이어가 클릭으로 고르고, 대상이 죽으면 규칙이
    // 다음 대상을 고른다.
    targetId: null,
    // 플레이어의 다음 공격 시각. 0은 "처음부터 칠 수 있다"는 뜻이다.
    nextPlayerAttackTick: 0,
    // 분노(정수 단위, 0~50), GCD가 끝나는 틱(0 = 돌고 있지 않음), GCD 중에 기억해 둔 스킬(없으면 null).
    rage: 0,
    gcdReadyTick: 0,
    queuedSkill: null,
    // 복도 왼쪽 끝, 세로 가운데에서 출발한다. 1번 팩(x = 10)까지 어그로 반경
    // 5칸을 빼면 다섯 칸을 걸어야 첫 싸움이 붙는다.
    player: { x: 0, y: Math.floor(CORRIDOR_HEIGHT / 2), facing: 'right' },
    monsters: placed,
    heldDirection: null,
    nextMoveTick: 0,
  };
}


// 이 칸에 설 수 있는가. 복도 밖과 몬스터가 선 칸은 안 된다.
function isWalkable(state, x, y) {
  const inside = x >= 0 && x < CORRIDOR_LENGTH && y >= 0 && y < CORRIDOR_HEIGHT;
  const occupied = state.monsters.some((m) => m.x === x && m.y === y);
  return inside && !occupied;
}


// 눌린 방향이 있고 걸음 간격이 지났으면 한 걸음 간다. tick과 moveStart가 같이 쓴다.
// 현재 시각은 state.tick이다.
function stepIfReady(state) {
  // 눌린 방향이 없거나, 지난 걸음에서 아직 5틱이 안 지났으면 그대로 둔다.
  if (!state.heldDirection || state.tick < state.nextMoveTick) {
    return state
  }

  const { dx, dy } = DIRECTIONS[state.heldDirection]
  const x = state.player.x + dx
  const y = state.player.y + dy

  // 막힌 칸이어도 몸은 그쪽으로 돌린다. 걸음은 쓰지 않았으므로 다음에 다시
  // 시도한다 — 앞의 몬스터가 비키면 바로 움직일 수 있다.
  if (!isWalkable(state, x, y)) {
    return {
      ...state,
      player: { ...state.player, facing: state.heldDirection },
    }
  }

  return {
    ...state,
    player: { x, y, facing: state.heldDirection },
    nextMoveTick: state.tick + MOVE_TICKS,
  }
}


// 두 칸의 거리: 가로·세로 칸 차이 중 큰 쪽(정사각형 거리).
function distanceBetween(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}


// 플레이어가 반경 안에 든 몬스터의 팩 전체에 어그로를 붙인다.
//
// 팩 단위인 이유: 던전이 놓는 단위가 팩이고 플레이어가 끌고 오는 단위가 pull이라,
// 한 마리만 끌려오면 "한 팩 = 한 번의 싸움"이라는 숫자(5타겟 상한 계산)가 흐려진다.
function pullPacks(state) {
  const pulled = new Set(
    state.monsters
      .filter((m) => !m.aggro && distanceBetween(m, state.player) <= AGGRO_RADIUS)
      .map((m) => m.packNumber),
  );
  if (pulled.size === 0) return state;

  return {
    ...state,
    monsters: state.monsters.map((m) =>
      pulled.has(m.packNumber) ? { ...m, aggro: true } : m,
    ),
  };
}


// 몬스터가 이 칸에 들어갈 수 있는가. 복도 밖과 다른 몬스터가 선 칸은 안 된다.
// 플레이어 칸은 따로 막지 않는다 — 몬스터는 플레이어와 거리 1 이하에서 멈추므로
// 거리 2 이상에서 한 걸음으로 플레이어 칸에 닿을 수 없다.
function isOpenForMonster(monsters, x, y) {
  const inside = x >= 0 && x < CORRIDOR_LENGTH && y >= 0 && y < CORRIDOR_HEIGHT;
  const taken = monsters.some((m) => m.x === x && m.y === y);
  return inside && !taken;
}


// 어그로가 붙은 몬스터들이 플레이어 쪽으로 한 칸씩 다가간다.
//
// 길찾기 없이 "지금 칸에서 플레이어에게 더 가까워지는 한 칸"만 본다. 복도에 벽이
// 없고 막는 것은 몬스터뿐이라 그걸로 충분하다. 먼 축(칸 차이가 큰 쪽)을 먼저
// 시도하고, 막혀 있으면 다른 축을 시도하고, 둘 다 막히면 이번 박자는 쉰다.
//
// 몬스터를 id 순서로 하나씩 처리하고, 앞 몬스터가 옮긴 자리를 뒤 몬스터가 본다.
// 그래서 같은 칸에 둘이 서는 일이 없다.
function chaseStep(state) {
  const { player } = state;
  let monsters = state.monsters;

  for (let i = 0; i < monsters.length; i++) {
    const monster = monsters[i];
    if (!monster.aggro || distanceBetween(monster, player) <= MELEE_RANGE) continue;

    const dx = player.x - monster.x;
    const dy = player.y - monster.y;
    const sideways = { x: monster.x + Math.sign(dx), y: monster.y };
    const forward = { x: monster.x, y: monster.y + Math.sign(dy) };
    const candidates = Math.abs(dx) >= Math.abs(dy) ? [sideways, forward] : [forward, sideways];

    // 칸 차이가 0인 축은 제자리를 가리키므로 건너뛴다.
    const target = candidates.find(
      (c) => (c.x !== monster.x || c.y !== monster.y) && isOpenForMonster(monsters, c.x, c.y),
    );
    if (!target) continue;

    monsters = monsters.map((m, j) => (j === i ? { ...m, x: target.x, y: target.y } : m));
  }

  return { ...state, monsters };
}


// 사거리 안에 있고 공격 시각이 된 몬스터가 플레이어를 때린다.
//
// 스윙 타이머(nextAttackTick)는 사거리와 상관없이 흐른다: 사거리 밖에 있으면 그냥
// 못 칠 뿐이고, 방금 친 몬스터가 쫓아와 다시 붙어도 간격이 지나기 전에는 못 친다.
// 한 틱에 여러 마리가 칠 수 있고, 피해는 합쳐서 한 번에 깎는다. 체력은 0 아래로
// 내려가지 않는다.
//
// 어그로를 따로 묻지 않는다 — 사거리 1 안의 몬스터는 어그로 반경 5 안에 있고, 같은 틱에
// 공격 직전에 어그로가 붙으므로 사거리 안이면 이미 어그로가 붙어 있다.
function attackStep(state) {
  const swinging = state.monsters.filter(
    (m) => distanceBetween(m, state.player) <= MELEE_RANGE && state.tick >= m.nextAttackTick,
  );
  if (swinging.length === 0) return state;

  const damage = swinging.reduce((sum, m) => sum + m.attackDamage, 0);
  const playerHp = Math.max(0, state.playerHp - damage);
  const swingingIds = new Set(swinging.map((m) => m.id));

  return {
    ...state,
    playerHp,
    defeated: playerHp === 0,
    monsters: state.monsters.map((m) =>
      swingingIds.has(m.id) ? { ...m, nextAttackTick: state.tick + m.attackTicks } : m,
    ),
  };
}


// 어그로가 붙은 몬스터 중 플레이어에게 가장 가까운 것의 id. 없으면 null.
// 거리가 같으면 id가 낮은 쪽이다 — 같은 입력이 언제나 같은 대상을 고르게 하려는 것이다.
// 어그로 없는 몬스터는 고르지 않는다. 아직 잠든 팩을 자동으로 깨우면 안 되기 때문이다.
function nearestAggroedId(monsters, player) {
  let best = null;
  for (const m of monsters) {
    if (!m.aggro) continue;
    const closer = best === null || distanceBetween(m, player) < distanceBetween(best, player);
    const tiedButEarlier =
      best !== null && distanceBetween(m, player) === distanceBetween(best, player) && m.id < best.id;
    if (closer || tiedButEarlier) best = m;
  }
  return best === null ? null : best.id;
}


// 대상에게 피해를 준다(자동공격과 스킬이 같이 쓴다). 방어력만큼 줄이고 정수로 반올림한다 —
// 백로그: 피해는 십 단위라 소수가 남으면 안 된다. hp가 0 이하면 몬스터를 지우고, 어그로 붙은
// 가장 가까운 몬스터를 새 대상으로 잡는다(없으면 대상 없음).
function hitTarget(state, target, rawDamage) {
  const damage = Math.round(rawDamage * (1 - target.armor / (target.armor + ARMOR_K)));
  const hp = target.hp - damage;

  if (hp > 0) {
    return {
      ...state,
      monsters: state.monsters.map((m) => (m.id === target.id ? { ...m, hp } : m)),
    };
  }

  const monsters = state.monsters.filter((m) => m.id !== target.id);
  return {
    ...state,
    monsters,
    targetId: nearestAggroedId(monsters, state.player),
  };
}


// 플레이어의 자동공격: 대상이 사거리 1칸 안이고 공격 시각이 되면 한 대 때린다.
//
// 타이머(nextPlayerAttackTick)는 몬스터와 같이 사거리와 상관없이 흐른다. 대상이 없거나
// 사거리 밖이면 칠 수 없을 뿐이고, 사거리에 들어오면 이어서 친다. GCD와는 상관이 없다 —
// 자동공격은 버튼도 GCD도 쓰지 않고 "그냥 돈다"(spec-note). 몬스터 공격이 먼저 처리된 뒤에
// 오므로(advanceCombat), 이번 틱에 몬스터에게 죽은 플레이어는 치지 못한다.
function playerAttackStep(state) {
  if (state.defeated) return state;

  const target = state.monsters.find((m) => m.id === state.targetId);
  if (!target) return state;
  if (distanceBetween(target, state.player) > MELEE_RANGE) return state;
  if (state.tick < state.nextPlayerAttackTick) return state;

  return {
    ...hitTarget(state, target, PLAYER_ATTACK_POWER * AUTO_ATTACK_COEFFICIENT),
    nextPlayerAttackTick: state.tick + PLAYER_ATTACK_TICKS,
  };
}


// 스킬을 쓴다. 대상이 있고 사거리 1칸 안일 때만 나가고, 못 나가면 상태를 그대로 돌려준다 —
// 피해도 분노도 GCD도 쓰지 않는다. 나가면 피해를 주고, 분노를 쌓고(최대 5c), GCD를 시작한다.
function castSkill(state, skillId) {
  const skill = SKILLS[skillId];
  const target = state.monsters.find((m) => m.id === state.targetId);
  if (!skill || !target) return state;
  if (distanceBetween(target, state.player) > MELEE_RANGE) return state;

  return {
    ...hitTarget(state, target, skill.damage),
    rage: Math.min(RAGE_MAX, state.rage + skill.rageGain),
    gcdReadyTick: state.tick + GCD_TICKS,
  };
}


// GCD 중에 기억해 둔 스킬을 GCD가 끝나는 틱에 쓴다. 그 순간 쓸 수 없으면(대상이 사라졌거나
// 사거리 밖) 조용히 버리고 GCD도 쓰지 않는다. 몬스터에게 죽은 플레이어는 쓰지 못한다.
function queuedSkillStep(state) {
  if (state.defeated || !state.queuedSkill || state.tick < state.gcdReadyTick) return state;
  return castSkill({ ...state, queuedSkill: null }, state.queuedSkill);
}


// 시간이 한 틱 흐른 뒤 전투 쪽에서 일어나는 일: 어그로를 붙이고, 5틱 박자에는 걷고,
// 몬스터가 때리고, 기억해 둔 스킬이 나가고, 마지막에 플레이어의 자동공격이 나간다(이 순서).
//
// 추격 몬스터는 전원이 틱 5의 배수에 함께 움직인다(2026-11-17). 몬스터마다 타이머를
// 두지 않아 상태 필드가 늘지 않는다. 대신 어그로가 붙은 뒤 첫 걸음까지 최대 0.5초가 걸린다.
// 공격은 걸음과 달리 각자 자기 타이머를 쓴다 — 팩이 한꺼번에 때리면 피해가 몰린다.
// 몬스터 공격이 플레이어 공격보다 먼저라서, 죽어 가는 몬스터도 마지막 한 대는 때리고 간다.
function advanceCombat(state) {
  const pulled = pullPacks(state);
  const chased = pulled.tick % MOVE_TICKS === 0 ? chaseStep(pulled) : pulled;
  return playerAttackStep(queuedSkillStep(attackStep(chased)));
}


// 상태 + 일어난 일 → 새 상태. 받은 상태는 절대 고치지 않고 새 객체를 돌려준다.
// React는 "객체가 바뀌었나"를 === 로 보고 다시 그릴지 정하기 때문에, 원래 객체를
// 고쳐서 돌려주면 바뀐 것을 못 알아채고 화면이 그대로 남는다.
export function combatReducer(state, action) {
  // 죽은 뒤에는 아무 일도 일어나지 않는다. 같은 객체를 돌려줘서 화면도 다시 안 그린다.
  if (state.defeated) return state;

  switch (action.type) {
    // 시간이 한 틱 흐르고, 플레이어는 걸음 간격이 지났으면 한 걸음 간다. 그 뒤에
    // 몬스터 쪽이 움직인다(플레이어가 먼저, 몬스터가 나중).
    case 'tick':
      return advanceCombat(stepIfReady({ ...state, tick: state.tick + 1 }));

    // 나중에 누른 방향이 이긴다. 오른쪽을 누른 채 위를 누르면 위로 간다.
    // 누른 순간 걸음 간격이 지나 있으면 틱을 기다리지 않고 바로 한 걸음 간다.
    case 'moveStart':
      return stepIfReady({ ...state, heldDirection: action.direction });

    // 몬스터를 자동공격 대상으로 고른다. 이미 대상인 몬스터를 다시 고르면 해제한다. 거리는
    // 따지지 않는다(멀리 있는 몬스터도 고를 수 있고, 사거리는 때릴 때만 본다). 없는 id는 무시한다.
    case 'selectTarget':
      if (!state.monsters.some((m) => m.id === action.monsterId)) return state;
      return { ...state, targetId: state.targetId === action.monsterId ? null : action.monsterId };

    // 스킬 키. GCD가 끝나 있으면 바로 쓰고, 끝나기 QUEUE_WINDOW_TICKS 안이면 기억해 두었다가
    // 끝나는 틱에 쓴다(마지막에 누른 것이 이긴다). 그보다 일찍 누른 입력은 버린다. 모르는 스킬 id는
    // castSkill이 걸러서 아무 일도 없다.
    case 'useSkill': {
      const ticksLeft = state.gcdReadyTick - state.tick;
      if (ticksLeft <= 0) return castSkill(state, action.skill);
      if (ticksLeft <= QUEUE_WINDOW_TICKS) return { ...state, queuedSkill: action.skill };
      return state;
    }

    // 뗀 키가 지금 가는 방향일 때만 멈춘다. 오른쪽 → 위를 누르고 오른쪽을 먼저
    // 떼는 경우, 무조건 null로 만들면 아직 누르고 있는 위까지 멈춰버린다.
    case 'moveStop':
      if (state.heldDirection === action.direction) {
        return { ...state, heldDirection: null };
      }
      return state;

    default:
      return state;
  }
}
