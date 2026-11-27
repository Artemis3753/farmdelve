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
export const MELEE_RANGE = 1;

// 플레이어의 시작 체력(백로그 Tier-1 numbers, 잠정). 실제로는 장비의 base_health가
// 더해진 값이 되겠지만, 장비 연결 전이라 상수로 둔다.
// 2026-11-27 1000 → 2000(J): 첫 22마리 런에서 체력이 모자라 죽어서 일단 올렸다. 백로그 수치는 아직 1000이다.
const PLAYER_MAX_HP = 2000;

// 전투 밖 회복(2026-11-27, J): 어그로 붙은 몬스터가 하나도 살아 있지 않으면 초당 최대 체력의 5%가 찬다.
// 솔로라 힐러가 없고 포션도 아직 없어서, 회복 수단이 0이면 22마리 동안 받은 피해가 쌓이기만 했다.
// 규칙은 백로그(2026-09-30)에 초당 20%로 있었는데, 그 속도면 팩 사이 5초 걷기에 다 차서 쉴지 고민할 일이
// 없다. 그래서 5%로 낮췄다. 속도는 WoW Recuperate(전투 밖 30초에 150%)와 같다. 쉬는 동안에도 런 타이머는 흐르니 "쉴까, 그냥 갈까"가
// 기록과 안전의 맞교환이 된다. 기다리는 시간 없이 바로 차는 이유: 어그로는 죽을 때까지 풀리지 않아서
// 싸우는 도중에 회복을 끼워 넣을 틈이 원래 없다.
const REST_HEAL_PER_SECOND = 0.05;

// 플레이어 자동공격(2026-11-17, 숫자는 전부 잠정이고 나중에 조정한다). 백로그는 "무기 종류의
// 고정 속도, medium"이라고만 하고 값을 정하지 않았다.
//
// 한 번에 주는 피해 = 공격력 × 계수. 공격력 10은 시작 낫의 자리표시 값(백로그 Still open)이다.
// 자동공격만으로는 쥐 한 마리(hp 500, 2026-11-27 절반으로 내림)를 잡는 데 25초가 걸린다.
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
// 화면도 이 값을 쓴다: 슬롯이 "눌러도 받아 주는 시점"에 밝아지게 하려는 것이다.
export const QUEUE_WINDOW_TICKS = 3;

// 스킬 표. 피해는 방어력 적용 전의 값이고, rageGain은 분노 단위다(10 = 1c). 숫자는 잠정이다:
// 1초에 한 번 쓰면 80 + 자동공격 20 = 백로그의 기준 DPS 100이 되도록 맞췄다.
//
// 스펜더(spender)는 표에 피해를 적지 않는다. 가진 분노의 정수 포인트를 전부 쓰고, 피해는
// spenderDamage가 쓴 포인트 수로 계산한다.
//
// 광역 빌더(area)는 한 명당 피해와 분노(rageGain)를 적는다. 대상 수에 비례해 쌓이는 값이다.
const SKILLS = {
  furiousThrust: { damage: 80, rageGain: 10 },
  overheadSlam: { spender: true },
  brutalSwing: { area: true, damage: 40, rageGain: 5 },
  whirlingSlash: { channel: true },
};

// Brutal Swing의 범위(백로그 Skill shapes in tiles): 바라보는 방향으로 폭 3칸(좌우 1칸씩) × 앞 2줄.
// 여섯 칸이라서 5명 상한이 의미를 갖는다. 한 명당 피해 40은 Furious Thrust(80)의 절반이다:
// 백로그의 "AoE 효율 0.5"로, 2명을 맞히면 단일 빌더와 같아진다(분노 0.5c × 2 = 1c도 같은 지점).
const SWING_ROWS = 2;
const SWING_HALF_WIDTH = 1;
const SWING_MAX_TARGETS = 5;

// Whirling Slash(2026-11-17, 숫자는 잠정): 채널 스펜더. 포인트당 0.7초(스펙) 동안 돌고, 0.7초마다
// 한 번(포인트당 한 틱) 사거리 1칸 안의 모든 적에게 SPIN_TICK_DAMAGE를 준다. 틱 간격이 지속 시간과
// 같은 단위라서 n포인트는 정확히 n틱이다. 끝날 때 한 틱이라도 맞혔으면 체력을 SPIN_COMPLETION_HEAL
// 만큼 회복한다(백로그 표의 20, 포션 600보다 훨씬 작다). 틱 피해는 처음엔 Brutal Swing과 같은 40이었는데,
// 채널이 GCD를 3.5초나 잡는 값에 비해 약해서 2026-11-27 첫 클리어 뒤 90으로 올렸다: 적 4마리 기준으로
// "다른 걸 눌렀을 때보다 GCD당 더 버는 양"이 Overhead Slam(약 445)과 같아지는 값이 약 88이다.
// 대상이 하나면 여전히 Slam이 낫다(채널 약 149). 계산은 백로그 Whirling Slash 절.
const SPIN_TICK_INTERVAL = secondsToTicks(0.7);
const SPIN_TICK_DAMAGE = 90;
const SPIN_COMPLETION_HEAL = 20;

// Whirling Slash의 출혈(2026-11-18, 숫자는 잠정): 채널을 누르는 순간 선택한 대상(사거리 1칸 안)에게
// 건다. 지속시간은 4초 + 쓴 포인트당 2초라서 1c 6초, 5c 14초이고 틱 간격(2초)의 배수라 틱이 딱 떨어진다.
// 틱 피해 50은 방어력을 무시한다(백로그 Stats). 5c 한 번이면 대상 하나에 채널 450 + 출혈 350 = 800이지만,
// 그동안 GCD를 3.5초 잡으므로 단일 대상에서는 Overhead Slam(5c 525, GCD 1초)보다 손해다.
const BLEED_BASE_TICKS = secondsToTicks(4);
const BLEED_TICKS_PER_POINT = secondsToTicks(2);
const BLEED_TICK_INTERVAL = secondsToTicks(2);
const BLEED_TICK_DAMAGE = 50;

// pandemic(WoW, 2026-11-18): 이미 걸린 출혈을 다시 걸면 남은 시간을 새 지속시간에 이어 붙이되, 이어 붙이는
// 양은 새 지속시간의 30%까지다. 그래서 막판에 갱신하면 손해가 없고 일찍 갱신하면 초과분만 버려진다.
const BLEED_CARRY_RATIO = 0.3;

export const RAGE_PER_POINT = 10;

// 쿨기 둘(spec-note 5·6번, 2026-11-27 구현). 지속시간과 쿨은 spec-note 값 그대로다.
// 둘 다 GCD를 쓰지 않는다: WoW가 Shadowlands에서 순간 화력 쿨기를 GCD에서 뺀 이유와 같다 — 다음 버튼을
// 강화하는 것 말고 아무것도 안 하는 버튼이 GCD를 먹으면 로테이션이 끊긴다. 그래서 채널 중에도 켜진다.
// 상태는 스킬 id와 같은 이름의 객체 { endTick, readyTick }(Tilling은 균열 위치 x, y도)에 든다.
export const COOLDOWN_SKILLS = {
  marketPriceRage: { durationTicks: secondsToTicks(15), cooldownTicks: secondsToTicks(60) },
  tilling: { durationTicks: secondsToTicks(15), cooldownTicks: secondsToTicks(30) },
};

// Market Price Rage는 spec-note에 "공격력 +20%"라고 적혀 있지만, 지금 공격력을 쓰는 건 자동공격뿐이고
// 스킬은 고정 피해다. 문구대로면 평타만 세지므로 "플레이어가 주는 모든 피해 +20%"로 읽었다.
const MARKET_PRICE_RAGE_MULTIPLIER = 1.2;

// Tilling의 균열: 쓴 자리 주변 1칸(9칸)에 고정되고, 그 안의 적은 받는 피해가 10% 는다. 쓴 자리에 고정하는
// 이유는 spec-note의 "땅에 균열을 낸다"와 특성 4b("균열 안에 서 있을 때")가 둘 다 위치를 전제해서다.
const TILLING_MULTIPLIER = 1.1;
const RIFT_RADIUS = 1;

// Overhead Slam의 피해 곡선(2026-11-17 합의): 200 × n^0.6, n = 쓴 포인트, 반올림. 포인트를
// 하나 더 모을 때마다 늘어나는 양이 줄어드는 오목 곡선이다. 사이클 하나는 Furious Thrust n번과
// 스펜더 1번이라 GCD가 n + 1개 드는데, 그 GCD당 평균 피해가 3c(157)에서 가장 높고 5c(154)는
// 조금 낮다. 스펙의 "5c까지 모으는 것이 항상 정답이면 안 된다"를 맞추려는 모양이다. 숫자는
// 잠정이고, 5c 보상 탈렌트(티어 3a, 5a)가 이 차이를 뒤집을지는 아직 열려 있다.
const SPENDER_BASE_DAMAGE = 200;
const SPENDER_CURVE_EXPONENT = 0.6;

function spenderDamage(points) {
  return Math.round(SPENDER_BASE_DAMAGE * Math.pow(points, SPENDER_CURVE_EXPONENT));
}

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
        // 걸려 있는 출혈. 없으면 null, 있으면 { endTick, nextTickTick }: 만료 시각과 다음 틱 시각.
        bleed: null,
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
    // 마지막 몬스터가 죽으면 true. defeated와 같이 그 뒤로는 전투가 멈추고, 화면은 이걸 보고 서버에
    // 클리어를 알린다. 몬스터가 0마리인 빈 복도로 시작해도 false다 — 이동 테스트가 빈 복도를 쓴다.
    cleared: false,
    // 자동공격 대상(몬스터 id). 없으면 null. 플레이어가 클릭으로 고르고, 대상이 죽으면 규칙이
    // 다음 대상을 고른다.
    targetId: null,
    // 플레이어의 다음 공격 시각. 0은 "처음부터 칠 수 있다"는 뜻이다.
    nextPlayerAttackTick: 0,
    // 분노(정수 단위, 0~50), GCD가 끝나는 틱(0 = 돌고 있지 않음), GCD 중에 기억해 둔 스킬(없으면 null).
    rage: 0,
    gcdReadyTick: 0,
    queuedSkill: null,
    // 돌고 있는 채널(Whirling Slash). 없으면 null, 있으면 { ticksLeft, nextTickTick, connected }:
    // 남은 틱 수, 다음 틱이 나가는 시각, 지금까지 한 틱이라도 맞혔는가(끝날 때의 회복 조건).
    channel: null,
    // 쿨기 둘. endTick = 효과가 끝나는 틱(지금 틱이 이보다 작으면 켜져 있다), readyTick = 다시 쓸 수 있는 틱
    // (0이라 처음부터 쓸 수 있다). GCD의 gcdReadyTick과 같은 방식이다. 균열 위치는 쓴 순간의 플레이어 칸이다.
    marketPriceRage: { endTick: 0, readyTick: 0 },
    tilling: { endTick: 0, readyTick: 0, x: 0, y: 0 },
    // 복도 왼쪽 끝, 세로 가운데에서 출발한다. 1번 팩(x = 10)까지 어그로 반경
    // 5칸을 빼면 다섯 칸을 걸어야 첫 싸움이 붙는다.
    player: { x: 0, y: Math.floor(CORRIDOR_HEIGHT / 2), facing: 'right' },
    monsters: placed,
    heldDirection: null,
    nextMoveTick: 0,
    // 이번 틱에 일어난 전투 사건(누가 누구를 무엇으로 맞혔나·죽었나). state는 "지금 모습"만 담아서
    // 화면이 이펙트를 고를 수 없기 때문에 따로 적는다(WoW 전투 로그와 같은 생각). 틱이 시작될 때만
    // 비운다 — 키 입력으로 나간 스킬 사건이 화면이 그리기 전에 지워지지 않게 하려는 것이다.
    events: [],
    // 다음 사건에 붙일 일련번호. 비워도 0으로 돌아가지 않아서, 화면은 "마지막으로 그린 번호"보다
    // 큰 사건만 그리면 같은 사건을 두 번 그리지 않는다.
    nextEventSeq: 0,
  };
}


// 사건 하나를 이번 틱 목록 끝에 붙이고 번호를 하나 올린다. 받은 배열을 고치지 않고 새로 만든다.
function record(state, event) {
  return {
    ...state,
    events: [...state.events, { seq: state.nextEventSeq, ...event }],
    nextEventSeq: state.nextEventSeq + 1,
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
export function distanceBetween(a, b) {
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

  // 체력은 합쳐서 한 번에 깎지만, 사건은 누가 때렸는지 보이게 한 마리씩 남긴다.
  let next = state;
  for (const m of swinging) {
    next = record(next, {
      type: 'damage', source: m.id, target: 'player', ability: 'autoAttack', amount: m.attackDamage,
    });
  }
  if (playerHp === 0) next = record(next, { type: 'death', target: 'player' });

  return {
    ...next,
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
function hitTarget(state, target, rawDamage, ability) {
  return retargetIfLost(damageMonster(state, target, rawDamage, ability));
}

// 몬스터 하나에게 피해를 준다: 방어력만큼 줄여 반올림하고, hp가 0 이하면 지운다. 대상은 건드리지
// 않는다 — 여러 명을 맞히는 스킬은 다 맞힌 뒤에 한 번만 대상을 정리한다(retargetIfLost).
// ability는 사건에 적을 이름이다('autoAttack' 또는 SKILLS의 키). 사건의 amount는 방어력을 뺀 값이고,
// 남은 hp를 넘는 초과 피해는 따로 적지 않는다 — 읽을 곳이 없다.
function damageMonster(state, monster, rawDamage, ability) {
  // 쿨기 배율과 방어력을 같이 곱하고 반올림은 마지막에 한 번만 한다. 중간에 반올림하면 오차가 두 번 쌓인다.
  const damage = Math.round(
    rawDamage * damageMultiplier(state, monster) * (1 - monster.armor / (monster.armor + ARMOR_K)),
  );
  const hp = monster.hp - damage;

  const hit = record(state, { type: 'damage', source: 'player', target: monster.id, ability, amount: damage });
  if (hp > 0) {
    return { ...hit, monsters: state.monsters.map((m) => (m.id === monster.id ? { ...m, hp } : m)) };
  }
  // 몬스터를 지우는 곳이 여기와 bleedStep 둘이라 클리어 판정도 두 곳에 있다(defeated가 체력이 0이
  // 되는 자리에서 정해지는 것과 같은 방식). 키 입력으로 죽여도 틱을 기다리지 않고 바로 켜진다.
  const monsters = state.monsters.filter((m) => m.id !== monster.id);
  return {
    ...record(hit, { type: 'death', target: monster.id }),
    monsters,
    cleared: monsters.length === 0,
  };
}

// 지금 이 몬스터에게 들어가는 플레이어 피해 배율. 켜진 쿨기마다 곱한다(둘 다면 1.2 × 1.1 = 1.32).
// 더하지 않고 곱하는 이유: 출처가 다른 배율이라 "같은 종류끼리는 더한다" 같은 묶음 규칙이 필요 없다.
function damageMultiplier(state, monster) {
  let multiplier = 1;
  if (state.tick < state.marketPriceRage.endTick) multiplier *= MARKET_PRICE_RAGE_MULTIPLIER;
  if (inRift(state, monster.x, monster.y)) multiplier *= TILLING_MULTIPLIER;
  return multiplier;
}

// (x, y)가 지금 켜진 균열 안인가. 균열이 꺼져 있으면 언제나 false다. 화면도 이걸로 균열 칸을 칠한다.
export function inRift(state, x, y) {
  return state.tick < state.tilling.endTick && distanceBetween({ x, y }, state.tilling) <= RIFT_RADIUS;
}


// 대상이 죽어서 사라졌으면 어그로 붙은 가장 가까운 몬스터를 새 대상으로 잡는다(없으면 대상 없음).
// 대상이 원래 없었거나 살아 있으면 그대로 둔다: 대상 없이 휘두른 스킬이 누군가를 죽여도 선택이
// 생기지는 않는다.
function retargetIfLost(state) {
  if (state.targetId === null || state.monsters.some((m) => m.id === state.targetId)) return state;
  return { ...state, targetId: nearestAggroedId(state.monsters, state.player) };
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
    ...hitTarget(state, target, PLAYER_ATTACK_POWER * AUTO_ATTACK_COEFFICIENT, 'autoAttack'),
    nextPlayerAttackTick: state.tick + PLAYER_ATTACK_TICKS,
  };
}


// 스킬을 쓴다. 대상이 있고 사거리 1칸 안일 때만 나가고, 못 나가면 상태를 그대로 돌려준다 —
// 피해도 분노도 GCD도 쓰지 않는다. 나가면 피해를 주고, 분노를 쌓거나(빌더, 최대 5c) 쓰고
// (스펜더), GCD를 시작한다. 스펜더는 1c도 없으면 못 쓴다. 0.5c가 남아 있어도 정수 포인트만
// 쓰고 나머지는 남긴다(백로그: 남은 반 포인트는 다음 빌더가 채운다).
function castSkill(state, skillId) {
  const skill = SKILLS[skillId];
  if (!skill) return state;
  if (skill.area) return castAreaSkill(state, skill, skillId);
  if (skill.channel) return castChannelSkill(state, skillId);

  const target = state.monsters.find((m) => m.id === state.targetId);
  if (!target) return state;
  if (distanceBetween(target, state.player) > MELEE_RANGE) return state;

  const points = Math.floor(state.rage / RAGE_PER_POINT);
  if (skill.spender && points < 1) return state;

  const rawDamage = skill.spender ? spenderDamage(points) : skill.damage;
  const rage = skill.spender
    ? state.rage - points * RAGE_PER_POINT
    : Math.min(RAGE_MAX, state.rage + skill.rageGain);

  // 나가는 것이 확정된 뒤에만 cast를 적는다. 못 나간 스킬은 위에서 상태를 그대로 돌려줘서 사건이 없다.
  const cast = record(state, { type: 'cast', source: 'player', ability: skillId });

  return {
    ...hitTarget(cast, target, rawDamage, skillId),
    rage,
    gcdReadyTick: state.tick + GCD_TICKS,
  };
}


// 칸 (x, y)가 플레이어의 Brutal Swing 범위(바라보는 방향의 6칸) 안인가. 앞 방향 벡터(fwd)로 "앞으로
// 몇 칸"(depth)과 "옆으로 몇 칸"(side)을 구한다: 방향이 위·아래·좌·우 어느 쪽이든 같은 식이다.
// 화면이 범위를 칠할 때도 이 함수를 써서, 그려진 칸과 실제로 맞는 칸이 어긋나지 않게 한다.
export function inSwingArea(player, x, y) {
  const fwd = DIRECTIONS[player.facing];
  const rx = x - player.x;
  const ry = y - player.y;
  const depth = rx * fwd.dx + ry * fwd.dy;
  const side = Math.abs(rx * fwd.dy - ry * fwd.dx);
  return depth >= 1 && depth <= SWING_ROWS && side <= SWING_HALF_WIDTH;
}


// 범위 안에 있는 몬스터 중 맞힐 최대 5명. 5명을 넘으면 선택한
// 대상을 먼저(범위 안일 때), 다음은 플레이어에게 가까운 순이다. 거리가 같으면 id가 낮은 쪽이 먼저인데,
// 몬스터 배열이 항상 id 순이고 sort가 동률의 순서를 바꾸지 않아서 따로 id를 비교할 필요가 없다.
function swingTargets(state) {
  const inArea = state.monsters.filter((m) => inSwingArea(state.player, m.x, m.y));

  const isTarget = (m) => (m.id === state.targetId ? 0 : 1);
  inArea.sort(
    (a, b) =>
      isTarget(a) - isTarget(b) ||
      distanceBetween(a, state.player) - distanceBetween(b, state.player),
  );
  return inArea.slice(0, SWING_MAX_TARGETS);
}


// 광역 스킬을 쓴다. 대상 선택도 사거리 검사도 없다(범위가 곧 사거리): 아무도 못 맞혀도 발동하고
// GCD를 쓴다(헛스윙). 맞힌 한 명마다 분노를 쌓는다. 죽인 몬스터도 맞힌 수에 센다.
// 헛스윙도 cast는 남긴다 — 아무도 안 맞아도 휘두르는 이펙트는 그려야 하기 때문이다(WoW의 SPELL_CAST_SUCCESS).
function castAreaSkill(state, skill, skillId) {
  const hit = swingTargets(state);

  let next = record(state, { type: 'cast', source: 'player', ability: skillId });
  for (const monster of hit) next = damageMonster(next, monster, skill.damage, skillId);

  return {
    ...retargetIfLost(next),
    rage: Math.min(RAGE_MAX, state.rage + hit.length * skill.rageGain),
    gcdReadyTick: state.tick + GCD_TICKS,
  };
}


// 채널 스킬을 쓴다. 대상도 사거리 검사도 없다(범위가 곧 사거리): 범위가 비어도 시작한다. 가진
// 정수 포인트를 전부 쓰고(1c 미만이면 못 쓴다), GCD는 채널이 끝날 때까지 잡힌다 — 1c는 0.7초지만
// GCD가 1초라서 1초다. 채널 중에 다른 스킬을 못 누르는 것도 이 GCD에서 따라 나오고, 끝나기 3틱
// 안에 누른 입력은 기억했다가 마지막 틱 뒤에 나간다.
function castChannelSkill(state, skillId) {
  const points = Math.floor(state.rage / RAGE_PER_POINT);
  if (points < 1) return state;

  return {
    ...record(state, { type: 'cast', source: 'player', ability: skillId }),
    monsters: applyBleed(state, points),
    rage: state.rage - points * RAGE_PER_POINT,
    channel: {
      ticksLeft: points,
      nextTickTick: state.tick + SPIN_TICK_INTERVAL,
      connected: false,
    },
    gcdReadyTick: state.tick + Math.max(GCD_TICKS, points * SPIN_TICK_INTERVAL),
  };
}


// 선택한 대상이 사거리 1칸 안이면 그 한 명에게 출혈을 걸거나 갱신한 몬스터 목록을 돌려준다(아니면 그대로).
// 사거리는 거는 순간에만 본다. 이미 걸려 있으면 pandemic: 남은 시간을 새 지속시간의 30%까지 이어 붙이고,
// 다음 틱 시각은 건드리지 않아서 갱신해도 틱을 잃거나 덤으로 얻지 않는다.
function applyBleed(state, points) {
  const target = state.monsters.find((m) => m.id === state.targetId);
  if (!target || distanceBetween(target, state.player) > MELEE_RANGE) return state.monsters;

  const duration = BLEED_BASE_TICKS + points * BLEED_TICKS_PER_POINT;
  const bleed = target.bleed
    ? {
        endTick:
          state.tick +
          duration +
          Math.min(target.bleed.endTick - state.tick, Math.round(duration * BLEED_CARRY_RATIO)),
        nextTickTick: target.bleed.nextTickTick,
      }
    : { endTick: state.tick + duration, nextTickTick: state.tick + BLEED_TICK_INTERVAL };

  return state.monsters.map((m) => (m.id === target.id ? { ...m, bleed } : m));
}


// 출혈의 틱: 틱 시각이 되면 방어력과 상관없이 50을 준다. 만료 시각이 되면(마지막 틱이 만료 시각과 같은
// 틱에 나가고 그 뒤에) 출혈이 사라진다. 그래서 갱신으로 만료가 틱 사이에 걸려도 만료 뒤의 틱은 나가지
// 않는다 — 부분 틱은 없다(정수 틱 규칙, 따로 검사하는 줄은 필요 없다). 출혈로
// 죽은 몬스터는 지우고, 대상이었다면 다음 대상을 고른다. 사거리는 보지 않는다 — 한 번 걸리면 멀어져도 돈다.
function bleedStep(state) {
  if (state.defeated || !state.monsters.some((m) => m.bleed)) return state;

  // 출혈은 방어력을 무시해서 damageMonster를 쓰지 않는다. 그래서 사건도 여기서 직접 적는다.
  let next = state;
  const monsters = [];
  for (const m of state.monsters) {
    if (!m.bleed) {
      monsters.push(m);
      continue;
    }

    const { endTick, nextTickTick } = m.bleed;
    const ticks = state.tick >= nextTickTick;
    // 쿨기 배율은 거는 순간이 아니라 틱이 나가는 순간에 본다(현행 WoW처럼 스냅샷 없음). 출혈마다 배율을
    // 저장할 필요가 없고, 버프가 꺼지면 이미 걸린 출혈도 바로 약해진다.
    const amount = Math.round(BLEED_TICK_DAMAGE * damageMultiplier(state, m));
    const hp = ticks ? m.hp - amount : m.hp;
    if (ticks) {
      next = record(next, {
        type: 'damage', source: 'player', target: m.id, ability: 'bleed', amount,
      });
    }
    if (hp <= 0) {
      next = record(next, { type: 'death', target: m.id });
      continue;
    }

    const bleed =
      state.tick >= endTick
        ? null
        : { endTick, nextTickTick: ticks ? nextTickTick + BLEED_TICK_INTERVAL : nextTickTick };
    monsters.push({ ...m, hp, bleed });
  }

  // 출혈로 마지막 몬스터가 죽어도 클리어다. damageMonster를 거치지 않으니 여기서도 판정한다.
  return retargetIfLost({ ...next, monsters, cleared: monsters.length === 0 });
}


// 채널의 틱: 틱 시각이 되면 그 순간 사거리 1칸 안에 있는 모든 적을 때린다(상한 없음). 범위는 틱마다
// 새로 확인해서, 걸어 나가면 그 틱은 헛되고 돌아오면 이어진다. 마지막 틱 뒤에 한 틱이라도 맞혔으면
// 체력을 회복하고(최대 체력까지) 채널이 끝난다. 이동과 자동공격은 막지 않는다. 몬스터 공격이 먼저
// 처리되므로 이번 틱에 죽은 플레이어는 돌지 못한다.
function channelStep(state) {
  const channel = state.channel;
  if (state.defeated || !channel || state.tick < channel.nextTickTick) return state;

  const inRange = state.monsters.filter((m) => distanceBetween(m, state.player) <= MELEE_RANGE);
  let next = state;
  for (const monster of inRange) next = damageMonster(next, monster, SPIN_TICK_DAMAGE, 'whirlingSlash');
  next = retargetIfLost(next);

  const connected = channel.connected || inRange.length > 0;
  if (channel.ticksLeft > 1) {
    return {
      ...next,
      channel: {
        ticksLeft: channel.ticksLeft - 1,
        nextTickTick: channel.nextTickTick + SPIN_TICK_INTERVAL,
        connected,
      },
    };
  }

  // 회복 사건은 실제로 오른 양을 적고, 0이면(못 맞혔거나 체력이 꽉 참) 적지 않는다 — 화면에 "+0"을
  // 띄울 이유가 없다.
  const playerHp = connected
    ? Math.min(state.playerMaxHp, state.playerHp + SPIN_COMPLETION_HEAL)
    : state.playerHp;
  const healed = playerHp - state.playerHp;
  const done = { ...next, channel: null, playerHp };
  if (healed === 0) return done;
  return record(done, {
    type: 'heal', source: 'player', target: 'player', ability: 'whirlingSlash', amount: healed,
  });
}


// 쿨기를 켠다. 쿨 중이면 상태를 그대로 돌려준다(아무 일도 없음). GCD·채널·대상·사거리와 상관없이 켜지고
// GCD도 시작하지 않는다. 지속이 쿨보다 짧아서(15초 < 30초·60초) 켜진 채 다시 켜는 경우는 없다.
function castCooldown(state, skillId) {
  if (state.tick < state[skillId].readyTick) return state;

  const { durationTicks, cooldownTicks } = COOLDOWN_SKILLS[skillId];
  const timing = { endTick: state.tick + durationTicks, readyTick: state.tick + cooldownTicks };
  // 균열만 위치가 있다: 쓴 순간 플레이어가 선 칸.
  const effect = skillId === 'tilling' ? { ...timing, x: state.player.x, y: state.player.y } : timing;
  return { ...record(state, { type: 'cast', source: 'player', ability: skillId }), [skillId]: effect };
}


// 전투 밖이면 체력을 한 틱만큼 채운다(최대 체력까지). 어그로를 붙인 바로 다음에 불려서, 새 팩에 들어선
// 틱에는 차지 않는다. 몬스터를 죽이는 단계들보다 앞이라, 마지막 몬스터가 죽은 틱에도 차지 않고 다음 틱부터
// 찬다. 회복 사건은 남기지 않는다 — 매 틱 +10이 뜨면 화면이 지저분해서, HP바가 차오르는 것으로 충분하다.
function regenStep(state) {
  if (state.monsters.some((m) => m.aggro)) return state;
  const heal = Math.round((state.playerMaxHp * REST_HEAL_PER_SECOND) / TICKS_PER_SECOND);
  return { ...state, playerHp: Math.min(state.playerMaxHp, state.playerHp + heal) };
}


// GCD 중에 기억해 둔 스킬을 GCD가 끝나는 틱에 쓴다. 그 순간 쓸 수 없으면(대상이 사라졌거나
// 사거리 밖) 조용히 버리고 GCD도 쓰지 않는다. 몬스터에게 죽은 플레이어는 쓰지 못한다.
function queuedSkillStep(state) {
  if (state.defeated || !state.queuedSkill || state.tick < state.gcdReadyTick) return state;
  return castSkill({ ...state, queuedSkill: null }, state.queuedSkill);
}


// 시간이 한 틱 흐른 뒤 전투 쪽에서 일어나는 일: 어그로를 붙이고, 5틱 박자에는 걷고,
// 몬스터가 때리고, 채널이 한 틱 돌고, 출혈이 틱하고, 기억해 둔 스킬이 나가고, 마지막에 플레이어의
// 자동공격이 나간다(이 순서). 채널이 기억해 둔 스킬보다 먼저라서, 채널의 마지막 틱이 끝난 뒤에야 입력이
// 나간다. 출혈은 채널 뒤라서 같은 틱에 채널이 죽인 몬스터에게는 틱하지 않고, 출혈로 죽은 몬스터는 기억해
// 둔 스킬의 대상 계산에서 이미 빠져 있다.
//
// 추격 몬스터는 전원이 틱 5의 배수에 함께 움직인다(2026-11-17). 몬스터마다 타이머를
// 두지 않아 상태 필드가 늘지 않는다. 대신 어그로가 붙은 뒤 첫 걸음까지 최대 0.5초가 걸린다.
// 공격은 걸음과 달리 각자 자기 타이머를 쓴다 — 팩이 한꺼번에 때리면 피해가 몰린다.
// 몬스터 공격이 플레이어 공격보다 먼저라서, 죽어 가는 몬스터도 마지막 한 대는 때리고 간다.
function advanceCombat(state) {
  const pulled = regenStep(pullPacks(state));
  const chased = pulled.tick % MOVE_TICKS === 0 ? chaseStep(pulled) : pulled;
  return playerAttackStep(queuedSkillStep(bleedStep(channelStep(attackStep(chased)))));
}


// 상태 + 일어난 일 → 새 상태. 받은 상태는 절대 고치지 않고 새 객체를 돌려준다.
// React는 "객체가 바뀌었나"를 === 로 보고 다시 그릴지 정하기 때문에, 원래 객체를
// 고쳐서 돌려주면 바뀐 것을 못 알아채고 화면이 그대로 남는다.
export function combatReducer(state, action) {
  // 죽은 뒤나 클리어한 뒤에는 아무 일도 일어나지 않는다. 같은 객체를 돌려줘서 화면도 다시 안 그린다.
  if (state.defeated || state.cleared) return state;

  switch (action.type) {
    // 시간이 한 틱 흐르고, 플레이어는 걸음 간격이 지났으면 한 걸음 간다. 그 뒤에
    // 몬스터 쪽이 움직인다(플레이어가 먼저, 몬스터가 나중).
    // 지난 틱(과 그 뒤 키 입력)의 사건은 여기서 비운다. 틱 말고 다른 액션에서는 비우지 않는다.
    case 'tick':
      return advanceCombat(stepIfReady({ ...state, tick: state.tick + 1, events: [] }));

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
      // 쿨기는 GCD를 보기 전에 먼저 처리한다 — GCD 중에도 켜지고, 미리 눌러 두는 대기열도 쓰지 않는다.
      if (COOLDOWN_SKILLS[action.skill]) return castCooldown(state, action.skill);
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
