import { describe, expect, test } from 'vitest'
import { combatReducer, createInitialState } from './rules.js'

// 케이스 목록과 각 케이스를 왜 두는지는 docs/test-plan.md에 있다(A1~A5, B1~B7).
// 이 파일은 그 목록에 승인된 케이스만 담는다.
//
// 정답은 코드의 상수를 가져다 계산하지 않고 백로그 규칙(세로 9칸, 초당 2칸,
// 팩 간격 10칸)에서 손으로 뽑은 숫자로 적는다. 코드와 같은 식으로 정답을 만들면
// 코드가 틀려도 테스트가 같이 틀려서 통과해 버린다.

// 서버 /api/templates가 주는 모양을 흉내 낸 입력. 필요한 필드만 넣었다.
const MONSTERS = [
  { monsterTemplateId: 1, hp: 30 },
  { monsterTemplateId: 2, hp: 80 },
]

// 몬스터가 없는 빈 복도. 이동 규칙만 볼 때 쓴다. 플레이어는 (0, 4)에서 시작한다.
function emptyCorridor() {
  return createInitialState([], [])
}

// 틱을 n번 연달아 흘려보낸 뒤의 상태.
function runTicks(state, n) {
  let next = state
  for (let i = 0; i < n; i++) {
    next = combatReducer(next, { type: 'tick' })
  }
  return next
}

// "x,y" 문자열 목록. 칸이 겹치는지 볼 때 쓴다.
function cellsOf(state) {
  return state.monsters.map((m) => `${m.x},${m.y}`)
}

// 객체를 깊게 얼린다. 얼린 객체를 고치려 하면 에러가 나므로, 리듀서가 받은
// 상태를 몰래 고치는지 확인할 수 있다.
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}


describe('createInitialState — initial layout (seam A)', () => {
  test('A1: one monster in pack 2 stands at x = 20, in the middle row, with its template hp', () => {
    const state = createInitialState(MONSTERS, [
      { packNumber: 2, monsterTemplateId: 1, amount: 1 },
    ])

    expect(state.monsters).toEqual([
      { id: 0, monsterTemplateId: 1, packNumber: 2, x: 20, y: 4, hp: 30 },
    ])
  })

  test('A2: a pack of four fills four different tiles inside the corridor', () => {
    const state = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 4 },
    ])

    expect(state.monsters).toHaveLength(4)
    // 대형의 정확한 모양은 백로그에 없는 코드 쪽 결정이라 위치 리터럴로 박지 않는다.
    // 대신 "겹치지 않고, 복도 안이며, 팩 자리 근처"라는 성질만 고정한다.
    expect(new Set(cellsOf(state)).size).toBe(4)
    for (const m of state.monsters) {
      expect(m.y).toBeGreaterThanOrEqual(0)
      expect(m.y).toBeLessThanOrEqual(8)
      expect(m.x).toBeGreaterThanOrEqual(10)
      expect(m.x).toBeLessThanOrEqual(13)
    }
  })

  test('A3: a second row in the same pack continues after the first row instead of overlapping it', () => {
    const state = createInitialState(MONSTERS, [
      { packNumber: 3, monsterTemplateId: 1, amount: 2 },
      { packNumber: 3, monsterTemplateId: 2, amount: 1 },
    ])

    expect(state.monsters).toHaveLength(3)
    // 둘째 행이 첫 자리부터 다시 채우면 같은 칸에 두 마리가 선다.
    expect(new Set(cellsOf(state)).size).toBe(3)
    // 둘째 행은 두 번째 템플릿(hp 80)이다.
    expect(state.monsters[2].monsterTemplateId).toBe(2)
    expect(state.monsters[2].hp).toBe(80)
  })

  test('A4: packs 1 and 2 each start at their own x, and every monster gets a unique id', () => {
    const state = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 2 },
      { packNumber: 2, monsterTemplateId: 2, amount: 1 },
    ])

    expect(state.monsters.map((m) => m.id)).toEqual([0, 1, 2])
    // 2번 팩의 첫 마리는 1번 팩이 몇 칸을 썼든 상관없이 자기 기준점에 선다.
    expect(state.monsters[2]).toMatchObject({ packNumber: 2, x: 20, y: 4 })
  })

  test('A5: the player starts at the left end of the corridor, in the middle row, facing right', () => {
    const state = createInitialState(MONSTERS, [])

    expect(state.player).toEqual({ x: 0, y: 4, facing: 'right' })
    expect(state.tick).toBe(0)
    expect(state.heldDirection).toBeNull()
  })
})


describe('combatReducer — movement (seam B)', () => {
  test('B1: holding a direction moves two tiles per second — x = 2 after 10 ticks, x = 4 after 20', () => {
    const held = combatReducer(emptyCorridor(), { type: 'moveStart', direction: 'right' })

    expect(runTicks(held, 10).player.x).toBe(2)
    expect(runTicks(held, 20).player.x).toBe(4)
  })

  test('B2: with no key held, time passes but the player stays put', () => {
    const state = runTicks(emptyCorridor(), 5)

    expect(state.tick).toBe(5)
    expect(state.player).toEqual({ x: 0, y: 4, facing: 'right' })
  })

  test('B3: the corridor edge blocks the player, who still turns toward it', () => {
    // 왼쪽 끝(x = 0)에서 왼쪽으로.
    const atLeftEnd = combatReducer(emptyCorridor(), { type: 'moveStart', direction: 'left' })
    expect(runTicks(atLeftEnd, 1).player).toEqual({ x: 0, y: 4, facing: 'left' })

    // 위쪽 끝(y = 0)에서 위로. 상태를 직접 만들어 끝자리에 세운다.
    const atTop = {
      ...emptyCorridor(),
      player: { x: 5, y: 0, facing: 'right' },
      heldDirection: 'up',
    }
    expect(runTicks(atTop, 1).player).toEqual({ x: 5, y: 0, facing: 'up' })

    // 오른쪽 끝(x = 89)에서 오른쪽으로.
    const atRightEnd = {
      ...emptyCorridor(),
      player: { x: 89, y: 4, facing: 'up' },
      heldDirection: 'right',
    }
    expect(runTicks(atRightEnd, 1).player).toEqual({ x: 89, y: 4, facing: 'right' })
  })

  test('B4: a monster blocks the tile, the player turns, and the step is not spent', () => {
    // 1번 팩의 첫 마리가 (10, 4)에 선다. 플레이어를 그 바로 위 (10, 3)에 놓고 아래로 민다.
    const base = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 1 },
    ])
    const pushing = {
      ...base,
      player: { x: 10, y: 3, facing: 'right' },
      heldDirection: 'down',
    }

    const after = runTicks(pushing, 1)

    expect(after.player).toEqual({ x: 10, y: 3, facing: 'down' })
    // 걸음을 쓰지 않았으니 다음 걸음 시각이 그대로여야 몬스터가 비키는 즉시 움직인다.
    expect(after.nextMoveTick).toBe(pushing.nextMoveTick)
  })

  test('B5: the direction pressed last wins', () => {
    let state = emptyCorridor()
    state = combatReducer(state, { type: 'moveStart', direction: 'right' })
    state = combatReducer(state, { type: 'moveStart', direction: 'up' })

    const after = runTicks(state, 1)

    expect(after.player).toEqual({ x: 0, y: 3, facing: 'up' })
  })

  test('B6: releasing the current direction stops the player, releasing another one does not', () => {
    // 오른쪽 → 위 순서로 누른 상태.
    let state = emptyCorridor()
    state = combatReducer(state, { type: 'moveStart', direction: 'right' })
    state = combatReducer(state, { type: 'moveStart', direction: 'up' })

    // 오른쪽을 먼저 떼도 아직 누르고 있는 위로는 계속 간다.
    const releasedOld = combatReducer(state, { type: 'moveStop', direction: 'right' })
    expect(runTicks(releasedOld, 1).player.y).toBe(3)

    // 지금 가는 방향(위)을 떼면 멈춘다.
    const releasedCurrent = combatReducer(state, { type: 'moveStop', direction: 'up' })
    expect(runTicks(releasedCurrent, 10).player).toEqual({ x: 0, y: 4, facing: 'right' })
  })

  test('B7: the reducer never modifies the state it receives', () => {
    const withMonster = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 1 },
    ])
    // 움직이는 경로와 막히는 경로를 둘 다 지나도록 두 상태를 얼린다.
    const walking = deepFreeze({ ...withMonster, heldDirection: 'right' })
    const blocked = deepFreeze({
      ...withMonster,
      player: { x: 10, y: 3, facing: 'right' },
      heldDirection: 'down',
    })
    const actions = [
      { type: 'tick' },
      { type: 'moveStart', direction: 'left' },
      { type: 'moveStop', direction: 'right' },
      { type: 'moveStop', direction: 'up' },
      { type: 'somethingUnknown' },
    ]

    for (const state of [walking, blocked]) {
      const snapshot = structuredClone(state)
      for (const action of actions) {
        // 얼린 객체를 고치면 TypeError가 나서 여기서 실패한다.
        expect(() => combatReducer(state, action)).not.toThrow()
      }
      expect(state).toEqual(snapshot)
    }
  })
})
