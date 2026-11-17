import { describe, expect, test } from 'vitest'
import { combatReducer, createInitialState } from './rules.js'

// 케이스 목록과 각 케이스를 왜 두는지는 docs/test-plan.md에 있다(A1~A5, B1~B7).
// 이 파일은 그 목록에 승인된 케이스만 담는다.
//
// 정답은 코드의 상수를 가져다 계산하지 않고 백로그 규칙(세로 9칸, 초당 2칸,
// 팩 간격 10칸)에서 손으로 뽑은 숫자로 적는다. 코드와 같은 식으로 정답을 만들면
// 코드가 틀려도 테스트가 같이 틀려서 통과해 버린다.

// 서버 /api/templates가 주는 모양을 흉내 낸 입력. 필요한 필드만 넣었다.
//
// autoAttack은 한 번에 주는 피해, autoAttackSeconds는 공격 간격(초)이다. 숫자는 일부러
// 실제 시드와 다르게(10, 20) 두어 코드가 템플릿 값을 그대로 쓰는지 볼 수 있게 한다.
const MONSTERS = [
  { monsterTemplateId: 1, hp: 30, autoAttack: 10, autoAttackSeconds: 2 },
  { monsterTemplateId: 2, hp: 80, autoAttack: 20, autoAttackSeconds: 2 },
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

// 방향 키를 누르자마자(틱이 한 번도 흐르기 전에) 떼는 "톡 치기".
function tap(state, direction) {
  const pressed = combatReducer(state, { type: 'moveStart', direction })
  return combatReducer(pressed, { type: 'moveStop', direction })
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

    // 공격력은 템플릿의 autoAttack(10), 간격은 autoAttackSeconds(2초 = 20틱)이다.
    // 첫 공격 시각 0은 "처음부터 칠 수 있다"는 뜻이다.
    expect(state.monsters).toEqual([
      {
        id: 0,
        monsterTemplateId: 1,
        packNumber: 2,
        x: 20,
        y: 4,
        hp: 30,
        aggro: false,
        attackDamage: 10,
        attackTicks: 20,
        nextAttackTick: 0,
      },
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
    // 체력은 백로그의 시작 체력 1000(잠정)이고, 아직 죽지 않았다.
    expect(state.playerHp).toBe(1000)
    expect(state.playerMaxHp).toBe(1000)
    expect(state.defeated).toBe(false)
  })
})


describe('combatReducer — movement (seam B)', () => {
  test('B1: holding a direction steps at once, then once every 5 ticks (two tiles per second)', () => {
    const held = combatReducer(emptyCorridor(), { type: 'moveStart', direction: 'right' })

    // 누르는 순간 첫 걸음, 이후 5틱(0.5초)마다 한 칸. 백로그: 초당 2칸.
    expect(held.player.x).toBe(1)
    expect(runTicks(held, 4).player.x).toBe(1)
    expect(runTicks(held, 5).player.x).toBe(2)
    expect(runTicks(held, 10).player.x).toBe(3)
    expect(runTicks(held, 20).player.x).toBe(5)
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

    // 오른쪽 누름으로 이미 한 걸음(x = 1)을 갔고, 다음 걸음은 5틱 뒤다.
    // 그때 가는 방향이 나중에 누른 위여야 한다.
    const after = runTicks(state, 5)

    expect(after.player).toEqual({ x: 1, y: 3, facing: 'up' })
  })

  test('B6: releasing the current direction stops the player, releasing another one does not', () => {
    // 오른쪽 → 위 순서로 누른 상태.
    let state = emptyCorridor()
    state = combatReducer(state, { type: 'moveStart', direction: 'right' })
    state = combatReducer(state, { type: 'moveStart', direction: 'up' })

    // 오른쪽을 먼저 떼도 아직 누르고 있는 위로는 계속 간다.
    const releasedOld = combatReducer(state, { type: 'moveStop', direction: 'right' })
    // (다음 걸음은 5틱 뒤라서 5틱을 흘려보낸다.)
    expect(runTicks(releasedOld, 5).player.y).toBe(3)

    // 지금 가는 방향(위)을 떼면 멈춘다. 오른쪽 누름의 첫 걸음(x = 1) 뒤로는 안 간다.
    const releasedCurrent = combatReducer(state, { type: 'moveStop', direction: 'up' })
    expect(runTicks(releasedCurrent, 10).player).toEqual({ x: 1, y: 4, facing: 'right' })
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
    // 어그로를 붙이는 경로(pulling)와 추격하는 경로(chasing)도 지나게 한다.
    // 틱 4에서 한 번 더 흘리면 틱 5(= 추격 박자)가 된다.
    const pulling = deepFreeze({
      ...withMonster,
      player: { x: 5, y: 4, facing: 'right' },
      tick: 4,
    })
    const chasing = deepFreeze({
      ...pulling,
      monsters: withMonster.monsters.map((m) => ({ ...m, aggro: true })),
    })
    // 공격하는 경로(attacking), 체력이 0이 되는 경로(dying), 죽은 뒤(defeated)도 지나게 한다.
    const attacking = deepFreeze({ ...chasing, player: { x: 9, y: 4, facing: 'right' } })
    const dying = deepFreeze({ ...attacking, playerHp: 5 })
    const defeated = deepFreeze({ ...attacking, playerHp: 0, defeated: true })
    const actions = [
      { type: 'tick' },
      { type: 'moveStart', direction: 'left' },
      // 누르는 즉시 걷는 경로(walking)와 막히는 경로(blocked)를 각각 지나게 한다.
      { type: 'moveStart', direction: 'right' },
      { type: 'moveStart', direction: 'down' },
      { type: 'moveStop', direction: 'right' },
      { type: 'moveStop', direction: 'up' },
      { type: 'somethingUnknown' },
    ]

    for (const state of [walking, blocked, pulling, chasing, attacking, dying, defeated]) {
      const snapshot = structuredClone(state)
      for (const action of actions) {
        // 얼린 객체를 고치면 TypeError가 나서 여기서 실패한다.
        expect(() => combatReducer(state, action)).not.toThrow()
      }
      expect(state).toEqual(snapshot)
    }
  })

  test('B8: pressing a direction steps at once, even if the key is released before any tick', () => {
    const tapped = tap(emptyCorridor(), 'right')

    expect(tapped.player).toEqual({ x: 1, y: 4, facing: 'right' })
  })

  test('B9: tapping cannot beat the step interval — a tap 4 ticks later does nothing, one 5 ticks later steps', () => {
    const first = tap(emptyCorridor(), 'right') // x = 1

    expect(tap(runTicks(first, 4), 'right').player.x).toBe(1)
    expect(tap(runTicks(first, 5), 'right').player.x).toBe(2)
  })

  test('B10: pressing toward a monster turns the player and does not spend the step', () => {
    // B4와 같은 배치: 몬스터가 (10, 4), 플레이어가 그 바로 위 (10, 3).
    const base = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 1 },
    ])
    const beside = { ...base, player: { x: 10, y: 3, facing: 'right' } }

    const pressed = combatReducer(beside, { type: 'moveStart', direction: 'down' })

    expect(pressed.player).toEqual({ x: 10, y: 3, facing: 'down' })
    expect(pressed.nextMoveTick).toBe(beside.nextMoveTick)
  })
})


// 어그로와 추격. 규칙(백로그 + 2026-11-17 합의): 어그로 반경 5칸을 정사각형(칸 차이의
// 큰 쪽이 5 이하)으로 재고, 한 마리가 걸리면 같은 팩 전체가 붙는다. 붙은 몬스터는
// 플레이어와 같은 속도(5틱에 한 칸)로 쫓아오고, leash가 없어 끝까지 따라오며, 플레이어
// 곁(대각선 포함 1칸)에서 멈춘다.
//
// 1번 팩의 첫 마리는 (10, 4)에 선다(팩 번호 × 10, 세로 가운데). 플레이어를 상대 위치에
// 직접 세워서 거리를 정확히 맞춘다.

// 1번 팩 한 개를 세우고 플레이어를 (x, y)에 놓은 상태.
function packOneWithPlayerAt(amount, x, y) {
  const base = createInitialState(MONSTERS, [
    { packNumber: 1, monsterTemplateId: 1, amount },
  ])
  return { ...base, player: { x, y, facing: 'right' } }
}

// 칸 차이의 큰 쪽. 테스트 안에서 거리를 직접 확인할 때 쓴다.
function distance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

describe('combatReducer — aggro and chase (seam C)', () => {
  test('C1: a pack stays idle while the player is more than 5 tiles away', () => {
    // 몬스터 (10, 4), 플레이어 (4, 4): 거리 6.
    const after = runTicks(packOneWithPlayerAt(1, 4, 4), 20)

    expect(after.monsters[0]).toMatchObject({ x: 10, y: 4, aggro: false })
  })

  test('C2: one monster inside the radius pulls its whole pack, and only its pack', () => {
    const base = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 4 },
      { packNumber: 2, monsterTemplateId: 2, amount: 2 },
    ])
    const state = { ...base, player: { x: 5, y: 4, facing: 'right' } }

    // 준비 확인: 1번 팩에는 반경 밖에 선 몬스터가 있어야 "팩 단위"가 의미가 있다.
    const outOfOwnRange = state.monsters.filter(
      (m) => m.packNumber === 1 && distance(m, state.player) > 5,
    )
    expect(outOfOwnRange.length).toBeGreaterThan(0)

    const after = runTicks(state, 1)

    const pack1 = after.monsters.filter((m) => m.packNumber === 1)
    const pack2 = after.monsters.filter((m) => m.packNumber === 2)
    expect(pack1.every((m) => m.aggro)).toBe(true)
    expect(pack2.every((m) => !m.aggro)).toBe(true)
  })

  test('C3: the radius is a square — distance 5 is in, 6 is out, and the diagonal (5, 4) is in', () => {
    // 몬스터 (10, 4). 가로로 정확히 5칸.
    expect(runTicks(packOneWithPlayerAt(1, 5, 4), 1).monsters[0].aggro).toBe(true)
    // 가로로 6칸.
    expect(runTicks(packOneWithPlayerAt(1, 4, 4), 1).monsters[0].aggro).toBe(false)
    // 가로 5, 세로 4칸 차이. 직선거리는 약 6.4지만 정사각형 규칙에서는 5다.
    expect(runTicks(packOneWithPlayerAt(1, 5, 0), 1).monsters[0].aggro).toBe(true)
  })

  test('C4: an aggroed monster closes in one tile every 5 ticks', () => {
    const state = packOneWithPlayerAt(1, 5, 4) // 거리 5: 첫 틱에 어그로가 붙는다.

    expect(runTicks(state, 4).monsters[0].x).toBe(10)
    expect(runTicks(state, 5).monsters[0].x).toBe(9)
    expect(runTicks(state, 10).monsters[0].x).toBe(8)
  })

  test('C5: there is no leash — the monster keeps following however far the player walks', () => {
    // 8번 팩의 첫 마리는 (80, 4). 거리 5에서 어그로를 붙인 뒤 왼쪽으로 걸어 나간다.
    const base = createInitialState(MONSTERS, [
      { packNumber: 8, monsterTemplateId: 1, amount: 1 },
    ])
    const pulled = runTicks({ ...base, player: { x: 75, y: 4, facing: 'right' } }, 1)
    const walking = combatReducer(pulled, { type: 'moveStart', direction: 'left' })

    const after = runTicks(walking, 100)

    // 100틱이면 몬스터가 20칸을 걷는다. 스폰(80)에서 15칸 넘게 떨어져도 계속 쫓는다.
    expect(after.monsters[0].aggro).toBe(true)
    expect(after.monsters[0].x).toBeLessThanOrEqual(65)
  })

  test('C6: a chasing monster stops next to the player, diagonals included', () => {
    // 정면에서 다가와 바로 옆(1칸)에 선다.
    const approached = runTicks(packOneWithPlayerAt(1, 5, 4), 100)
    expect(distance(approached.monsters[0], approached.player)).toBe(1)

    // 이미 대각선으로 붙어 있으면(거리 1) 어그로는 붙어도 움직이지 않는다.
    const diagonal = runTicks(packOneWithPlayerAt(1, 9, 3), 50)
    expect(diagonal.monsters[0]).toMatchObject({ x: 10, y: 4, aggro: true })
  })

  test('C7: chasing monsters never share a tile with each other or with the player', () => {
    const chased = runTicks(packOneWithPlayerAt(4, 5, 4), 100)

    const cells = cellsOf(chased)
    expect(cells).toHaveLength(4)
    expect(new Set(cells).size).toBe(4)
    expect(cells).not.toContain(`${chased.player.x},${chased.player.y}`)

    // 두 몬스터가 같은 칸을 동시에 노리는 배치. 플레이어가 (0, 0)이면 (6, 5)는 가로로,
    // (5, 6)은 세로로 한 걸음 가서 둘 다 (5, 5)에 닿으려 한다. 먼저 간 쪽이 차지하고
    // 뒤따르는 쪽은 비켜서야 한다. 틱 4에서 한 번 더 흘리면 틱 5(추격 박자)다.
    const two = packOneWithPlayerAt(2, 0, 0)
    const converging = {
      ...two,
      tick: 4,
      monsters: [
        { ...two.monsters[0], x: 6, y: 5, aggro: true },
        { ...two.monsters[1], x: 5, y: 6, aggro: true },
      ],
    }

    const after = combatReducer(converging, { type: 'tick' })

    expect(new Set(cellsOf(after)).size).toBe(2)
  })
})


// 몬스터 공격과 죽음. 규칙(백로그 + 2026-11-17 합의): 어그로가 붙은 몬스터는 사거리 1칸
// (대각선 포함) 안에서 사거리에 닿는 즉시 한 대 때리고, 이후 자기 간격(20틱)마다 때린다.
// 스윙 타이머는 사거리 밖에서도 흐른다. 체력이 0이 되면 전투가 멈춘다.
//
// 피해는 템플릿 값 그대로다(플레이어 방어력은 아직 없다). 아래 숫자는 MONSTERS 입력의
// autoAttack에서 손으로 뽑은 값이다: 쥐 10, 엘리트 20, 시작 체력 1000.

describe('combatReducer — monster attacks and defeat (seam D)', () => {
  test('D1: a monster hits the moment it reaches range, and not before', () => {
    // 몬스터 (10, 4), 플레이어 (5, 4). 어그로가 첫 틱에 붙고, 5·10·15·20틱에 한 칸씩 와서
    // 20틱에 거리 1에 닿는다.
    const state = packOneWithPlayerAt(1, 5, 4)

    expect(runTicks(state, 19).playerHp).toBe(1000)
    expect(runTicks(state, 20).playerHp).toBe(990)
  })

  test('D2: after the first hit it hits again every 20 ticks', () => {
    // 이미 붙어 있는 배치: 몬스터 (10, 4), 플레이어 (9, 4).
    const state = packOneWithPlayerAt(1, 9, 4)

    expect(runTicks(state, 1).playerHp).toBe(990)
    expect(runTicks(state, 20).playerHp).toBe(990)
    expect(runTicks(state, 21).playerHp).toBe(980)
    expect(runTicks(state, 41).playerHp).toBe(970)
  })

  test('D3: each monster hits for its own damage', () => {
    // 쥐(10)와 엘리트(20)를 플레이어 곁에 직접 세운다.
    const base = createInitialState(MONSTERS, [
      { packNumber: 1, monsterTemplateId: 1, amount: 1 },
      { packNumber: 1, monsterTemplateId: 2, amount: 1 },
    ])
    const state = {
      ...base,
      player: { x: 5, y: 4, facing: 'right' },
      monsters: [
        { ...base.monsters[0], x: 6, y: 4, aggro: true },
        { ...base.monsters[1], x: 6, y: 3, aggro: true },
      ],
    }

    expect(runTicks(state, 1).playerHp).toBe(970)
  })

  test('D4: arriving does not reset the swing timer — a monster that just swung waits out its interval', () => {
    // 몬스터가 거리 2에서 출발하고, 마지막 공격 뒤 다음 공격 시각이 30틱이다.
    // 5틱에 곁에 와도 30틱이 되기 전에는 때리지 않는다.
    const base = packOneWithPlayerAt(1, 5, 4)
    const state = {
      ...base,
      monsters: [{ ...base.monsters[0], x: 7, y: 4, aggro: true, nextAttackTick: 30 }],
    }

    expect(runTicks(state, 29).playerHp).toBe(1000)
    expect(runTicks(state, 30).playerHp).toBe(990)
  })

  test('D5: health stops at 0 and the player is defeated', () => {
    const adjacent = packOneWithPlayerAt(1, 9, 4)

    // 체력 10에서 10을 맞으면 정확히 0.
    const exact = runTicks({ ...adjacent, playerHp: 10 }, 1)
    expect(exact.playerHp).toBe(0)
    expect(exact.defeated).toBe(true)

    // 체력 5에서 10을 맞아도 음수가 되지 않는다.
    const overkill = runTicks({ ...adjacent, playerHp: 5 }, 1)
    expect(overkill.playerHp).toBe(0)
    expect(overkill.defeated).toBe(true)

    // 살아 있는 동안은 defeated가 아니다.
    expect(runTicks(adjacent, 1).defeated).toBe(false)
  })

  test('D6: once defeated, nothing moves, attacks or ticks any more', () => {
    const adjacent = packOneWithPlayerAt(1, 9, 4)
    const dead = runTicks({ ...adjacent, playerHp: 10 }, 1)

    // 같은 객체를 그대로 돌려받아야 한다(아무 일도 일어나지 않았다는 뜻).
    expect(combatReducer(dead, { type: 'tick' })).toBe(dead)
    expect(combatReducer(dead, { type: 'moveStart', direction: 'left' })).toBe(dead)
    expect(combatReducer(dead, { type: 'moveStop', direction: 'left' })).toBe(dead)
    expect(runTicks(dead, 100)).toEqual(dead)
  })
})
