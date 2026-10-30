// 전투 규칙서. React를 모르는 순수 JS라서, 브라우저 없이 node로 바로 불러
// 시험해볼 수 있다 — 화면(Dungeon.jsx)과 떼어 둔 이유가 이것이다.
//
// 모든 변화는 combatReducer 한 곳에서만 일어난다. 키 입력도 "눌린 방향"을
// 적어둘 뿐이고, 실제로 움직이는 건 tick이다(2026-09-30). 그래서 같은 입력
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
      });
    }
  }

  return {
    tick: 0,
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


// 상태 + 일어난 일 → 새 상태. 받은 상태는 절대 고치지 않고 새 객체를 돌려준다.
// React는 "객체가 바뀌었나"를 === 로 보고 다시 그릴지 정하기 때문에, 원래 객체를
// 고쳐서 돌려주면 바뀐 것을 못 알아채고 화면이 그대로 남는다.
export function combatReducer(state, action) {
  switch (action.type) {
    case 'tick': {
      const tick = state.tick + 1;

      // 눌린 방향이 없거나, 지난 걸음에서 아직 5틱이 안 지났으면 시간만 흐른다.
      if (!state.heldDirection || tick < state.nextMoveTick) {
        return { ...state, tick };
      }

      const { dx, dy } = DIRECTIONS[state.heldDirection];
      const x = state.player.x + dx;
      const y = state.player.y + dy;

      // 막힌 칸이어도 몸은 그쪽으로 돌린다. 걸음은 쓰지 않았으므로 다음 틱에
      // 다시 시도한다 — 앞의 몬스터가 비키면 바로 움직일 수 있다.
      if (!isWalkable(state, x, y)) {
        return {
          ...state,
          tick,
          player: { ...state.player, facing: state.heldDirection },
        };
      }

      return {
        ...state,
        tick,
        player: { x, y, facing: state.heldDirection },
        nextMoveTick: tick + MOVE_TICKS,
      };
    }

    // 나중에 누른 방향이 이긴다. 오른쪽을 누른 채 위를 누르면 위로 간다.
    case 'moveStart':
      return { ...state, heldDirection: action.direction };

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
