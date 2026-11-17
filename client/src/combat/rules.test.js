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
//
// armor는 몬스터 방어력이다. 1번(쥐)은 0, 2번(엘리트)은 백로그의 250이다.
const MONSTERS = [
  { monsterTemplateId: 1, hp: 30, armor: 0, autoAttack: 10, autoAttackSeconds: 2 },
  { monsterTemplateId: 2, hp: 80, armor: 250, autoAttack: 20, autoAttackSeconds: 2 },
  // 3번과 4번은 방어력 감소가 정수로 딱 떨어지지 않는 경우(반올림 확인용)이다.
  { monsterTemplateId: 3, hp: 80, armor: 100, autoAttack: 20, autoAttackSeconds: 2 },
  { monsterTemplateId: 4, hp: 80, armor: 300, autoAttack: 20, autoAttackSeconds: 2 },
  // 5번은 스킬 피해의 반올림이 "내림과 올림 둘 다와 다른" 경우(53.33)이다.
  { monsterTemplateId: 5, hp: 80, armor: 500, autoAttack: 20, autoAttackSeconds: 2 },
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
        armor: 0,
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
    // 대상은 아직 없고, 플레이어의 첫 공격 시각 0은 "처음부터 칠 수 있다"는 뜻이다.
    expect(state.targetId).toBeNull()
    expect(state.nextPlayerAttackTick).toBe(0)
    // 분노는 비어 있고, GCD는 돌고 있지 않으며, 기억해 둔 스킬 입력은 없다.
    expect(state.rage).toBe(0)
    expect(state.gcdReadyTick).toBe(0)
    expect(state.queuedSkill).toBeNull()
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
    // 대상을 때리는 경로(hunting)와 처치하는 경로(killing)도 지나게 한다.
    // hunting은 hp가 높아 맞고도 살아남는 경로, killing은 한 방에 죽는 경로다. 몬스터의 다음
    // 공격 시각을 멀리(1000) 두어 이번 틱에는 몬스터가 안 때리게 한다 — 때리면 몬스터 객체가 먼저
    // 복사되어, 플레이어 공격이 얼린 원본을 고치는지 확인할 수 없다.
    const hunting = deepFreeze({
      ...attacking,
      targetId: 0,
      monsters: attacking.monsters.map((m) => ({ ...m, hp: 100, nextAttackTick: 1000 })),
    })
    const killing = deepFreeze({
      ...hunting,
      monsters: hunting.monsters.map((m) => ({ ...m, hp: 10 })),
    })
    // 스킬 경로: hunting에서 바로 쓰는 경로(GCD 안 돎), GCD가 2틱 남아 입력을 기억해 두는 경로
    // (queuing), 기억해 둔 스킬이 틱 5에 나가는 경로(queuedCast)도 지나게 한다.
    const queuing = deepFreeze({ ...hunting, gcdReadyTick: 6 })
    const queuedCast = deepFreeze({ ...hunting, gcdReadyTick: 5, queuedSkill: 'furiousThrust' })
    const actions = [
      { type: 'useSkill', skill: 'furiousThrust' },
      { type: 'tick' },
      { type: 'moveStart', direction: 'left' },
      // 누르는 즉시 걷는 경로(walking)와 막히는 경로(blocked)를 각각 지나게 한다.
      { type: 'moveStart', direction: 'right' },
      { type: 'moveStart', direction: 'down' },
      { type: 'moveStop', direction: 'right' },
      { type: 'moveStop', direction: 'up' },
      { type: 'selectTarget', monsterId: 0 },
      { type: 'selectTarget', monsterId: 99 },
      { type: 'somethingUnknown' },
    ]

    const states = [
      walking, blocked, pulling, chasing, attacking, dying, defeated, hunting, killing,
      queuing, queuedCast,
    ]
    for (const state of states) {
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


// 플레이어 자동공격, 대상 선택, 처치. 규칙(백로그·spec-note + 2026-11-17 합의): 주 대상 한
// 마리만 사거리 1칸 안에서 2초(20틱)마다 40 피해(방어력 적용, 반올림)를 준다. 첫 공격은
// 사거리에 닿는 즉시이고 타이머는 사거리 밖에서도 흐른다. 한 틱 안에서는 몬스터 공격이 먼저,
// 플레이어 공격이 나중이다. hp가 0 이하면 몬스터는 사라지고, 대상이었다면 어그로 붙은
// 몬스터 중 가장 가까운 것이 새 대상이 된다(동률은 id가 낮은 것, 없으면 대상 없음).
//
// 피해 40과 방어력 감소(250 → 20%)는 백로그 공식 armor / (armor + 1000)에서 손으로 뽑았다.

// 1번 팩 몬스터 한 마리(hp)를 대상으로 잡은 상태. 플레이어는 (x, y)에 선다.
function huntingOne(hp, x, y) {
  const base = packOneWithPlayerAt(1, x, y)
  return { ...base, monsters: [{ ...base.monsters[0], hp }], targetId: 0 }
}

// 플레이어를 (5, 4)에 세우고 몬스터를 specs대로 놓은 상태. 0번 몬스터가 대상이다.
// specs의 각 칸은 그 몬스터에 덮어쓸 값(x, y, hp, aggro, packNumber)이다.
function huntWith(specs) {
  const base = createInitialState(MONSTERS, [
    { packNumber: 1, monsterTemplateId: 1, amount: specs.length },
  ])
  return {
    ...base,
    player: { x: 5, y: 4, facing: 'right' },
    targetId: 0,
    monsters: base.monsters.map((m, i) => ({ ...m, ...specs[i] })),
  }
}

describe('combatReducer — player auto-attack, targeting and kills (seam E)', () => {
  test('E1: selecting a monster targets it, selecting it again clears it, unknown ids are ignored', () => {
    // 몬스터는 10칸 밖이다. 선택은 거리와 상관없이 된다(사거리는 때릴 때만 따진다).
    const state = packOneWithPlayerAt(1, 0, 4)

    const selected = combatReducer(state, { type: 'selectTarget', monsterId: 0 })
    expect(selected.targetId).toBe(0)

    expect(combatReducer(selected, { type: 'selectTarget', monsterId: 0 }).targetId).toBeNull()
    expect(combatReducer(state, { type: 'selectTarget', monsterId: 99 })).toBe(state)
  })

  test('E2: the target takes 40 on the first tick in range, then 40 every 20 ticks', () => {
    // 몬스터 hp 100, 방어력 0. 곁에 붙어 있다.
    const state = huntingOne(100, 9, 4)

    expect(runTicks(state, 1).monsters[0].hp).toBe(60)
    expect(runTicks(state, 20).monsters[0].hp).toBe(60)
    expect(runTicks(state, 21).monsters[0].hp).toBe(20)
  })

  test('E3: only the target is hit, not the monster standing next to it', () => {
    const state = huntWith([
      { x: 6, y: 4, hp: 100, aggro: true },
      { x: 6, y: 3, hp: 100, aggro: true },
    ])
    // 1번 몬스터를 대상으로 바꾼다.
    const aimed = { ...state, targetId: 1 }

    expect(runTicks(aimed, 1).monsters.map((m) => m.hp)).toEqual([100, 60])
  })

  test('E4: with no target nobody is hit, even when a monster stands right there', () => {
    const state = { ...huntingOne(100, 9, 4), targetId: null }

    expect(runTicks(state, 25).monsters[0].hp).toBe(100)
  })

  test('E5: a target is hit the tick it reaches range, and the swing timer runs while it walks', () => {
    // 몬스터가 (10, 4)에서 20틱에 곁에 온다(D1과 같은 배치).
    const state = huntingOne(100, 5, 4)
    expect(runTicks(state, 19).monsters[0].hp).toBe(100)
    expect(runTicks(state, 20).monsters[0].hp).toBe(60)

    // 마지막 공격 뒤 다음 공격 시각이 30틱이면, 곁에 와도 30틱이 되기 전에는 안 때린다.
    const recentlySwung = { ...state, nextPlayerAttackTick: 30 }
    expect(runTicks(recentlySwung, 29).monsters[0].hp).toBe(100)
    expect(runTicks(recentlySwung, 30).monsters[0].hp).toBe(60)
  })

  test('E6: armor cuts the damage and the result is rounded — 250 gives 32, 100 gives 36, 300 gives 31', () => {
    // 해당 템플릿의 몬스터(hp 100)를 곁에 세우고 대상으로 잡아 첫 틱에 입는 피해를 돌려준다.
    const damageTakenBy = (templateId) => {
      const base = createInitialState(MONSTERS, [
        { packNumber: 1, monsterTemplateId: templateId, amount: 1 },
      ])
      const state = {
        ...base,
        player: { x: 9, y: 4, facing: 'right' },
        monsters: [{ ...base.monsters[0], hp: 100 }],
        targetId: 0,
      }
      return 100 - runTicks(state, 1).monsters[0].hp
    }

    // 40 × (1 − armor / (armor + 1000))를 손으로 계산한 값이다.
    expect(damageTakenBy(1)).toBe(40) // 방어력 0
    expect(damageTakenBy(2)).toBe(32) // 방어력 250: 정확히 32
    expect(damageTakenBy(3)).toBe(36) // 방어력 100: 36.36 → 반올림 36 (올림이면 37)
    expect(damageTakenBy(4)).toBe(31) // 방어력 300: 30.77 → 반올림 31 (내림이면 30)
  })

  test('E7: a monster at 0 health or below is removed', () => {
    // 정확히 40(= 한 방)과 그보다 적은 hp(초과 피해) 둘 다 사라진다.
    expect(runTicks(huntingOne(40, 9, 4), 1).monsters).toHaveLength(0)
    expect(runTicks(huntingOne(10, 9, 4), 1).monsters).toHaveLength(0)
    // 41이면 한 방에는 안 죽는다.
    expect(runTicks(huntingOne(41, 9, 4), 1).monsters).toHaveLength(1)
  })

  test('E8: when the target dies, the nearest aggroed monster becomes the target', () => {
    // 대상(0번)은 hp 10이라 첫 틱에 죽는다. 남은 것 중 어그로 붙은 가장 가까운 것이 새 대상이다.
    // (a) 2번이 거리 2, 1번이 거리 4 → 2번.
    const nearest = huntWith([
      { x: 6, y: 4, hp: 10, aggro: true },
      { x: 9, y: 4, hp: 100, aggro: true },
      { x: 7, y: 4, hp: 100, aggro: true },
    ])
    expect(runTicks(nearest, 1).targetId).toBe(2)

    // (b) 둘 다 거리 2로 같으면 id가 낮은 1번.
    const tie = huntWith([
      { x: 6, y: 4, hp: 10, aggro: true },
      { x: 7, y: 3, hp: 100, aggro: true },
      { x: 7, y: 5, hp: 100, aggro: true },
    ])
    expect(runTicks(tie, 1).targetId).toBe(1)

    // (c) 어그로 없는 몬스터(2번 팩, 거리 7)가 더 가까워도 뽑지 않고, 멀리서 쫓아오는
    // 어그로 몬스터(거리 20)를 뽑는다.
    const ignoresIdle = huntWith([
      { x: 6, y: 4, hp: 10, aggro: true },
      { x: 25, y: 4, hp: 100, aggro: true },
      { x: 12, y: 4, hp: 100, aggro: false, packNumber: 2 },
    ])
    expect(runTicks(ignoresIdle, 1).targetId).toBe(1)

    // (d) 어그로 붙은 몬스터가 없으면 대상 없음.
    const none = huntWith([
      { x: 6, y: 4, hp: 10, aggro: true },
      { x: 12, y: 4, hp: 100, aggro: false, packNumber: 2 },
    ])
    expect(runTicks(none, 1).targetId).toBeNull()
  })

  test('E9: a defeated player cannot select targets or swing, even on the tick that kills them', () => {
    const dead = runTicks({ ...packOneWithPlayerAt(1, 9, 4), playerHp: 10 }, 1)
    expect(combatReducer(dead, { type: 'selectTarget', monsterId: 0 })).toBe(dead)

    // 몬스터의 공격으로 이번 틱에 죽으면, 같은 틱의 플레이어 공격은 나가지 않는다.
    const dying = { ...huntingOne(100, 9, 4), playerHp: 10 }
    expect(runTicks(dying, 1).monsters[0].hp).toBe(100)
  })
})


// 스킬, 분노, GCD. 규칙(spec-note + 백로그 + 2026-11-17 합의): Furious Thrust는 대상이 사거리
// 1칸 안일 때 80 피해(방어력 적용, 반올림)를 주고 분노 1c를 만든다. 분노는 정수 단위(1c = 10)이고
// 최대 5c(50)다. GCD는 10틱이고, 끝나기 3틱 안에 누른 입력은 기억했다가 끝나는 틱에 쓴다.
// 쓸 수 없으면(대상 없음·사거리 밖) 아무 일도 없고 GCD도 안 쓴다. 자동공격은 GCD와 무관하다.
//
// 피해 80과 방어력 감소는 백로그 공식(armor / (armor + 1000))에서 손으로 뽑은 값이다.

// 사거리 1칸 안의 몬스터(hp)를 대상으로 잡았고, 몬스터 공격과 플레이어 자동공격은 멀리(1000)
// 미뤄 둔 상태. 스킬만 따로 볼 수 있게 한다. 플레이어는 (x, y).
function skillReady(hp = 1000, x = 9, y = 4) {
  const base = huntingOne(hp, x, y)
  return {
    ...base,
    nextPlayerAttackTick: 1000,
    monsters: base.monsters.map((m) => ({ ...m, aggro: true, nextAttackTick: 1000 })),
  }
}

const castFurious = (state) => combatReducer(state, { type: 'useSkill', skill: 'furiousThrust' })

describe('combatReducer — skills, Rage and the GCD (seam F)', () => {
  test('F1: Furious Thrust hits the target at once for 80 and adds 1c of Rage', () => {
    const after = castFurious(skillReady())

    expect(after.monsters[0].hp).toBe(920)
    expect(after.rage).toBe(10)
  })

  test('F2: with no target, or a target out of range, nothing happens', () => {
    const noTarget = { ...skillReady(), targetId: null }
    expect(castFurious(noTarget)).toEqual(noTarget)

    // 몬스터는 (10, 4)인데 플레이어가 (5, 4)에 있다 — 5칸 밖.
    const farAway = skillReady(1000, 5, 4)
    expect(castFurious(farAway)).toEqual(farAway)
  })

  test('F3: during the GCD an early press does nothing; the cast works the tick the GCD ends', () => {
    const first = castFurious(skillReady()) // 틱 0에 쓴다. GCD는 틱 10까지.

    // 5틱 시점(5틱 남음)에 누르면 3틱 창 밖이라 버려진다 — 기억되었다면 틱 10에 나갔을 것이다.
    const early = castFurious(runTicks(first, 5))
    expect(runTicks(early, 5).monsters[0].hp).toBe(920)

    // 정확히 틱 10에는 바로 쓴다.
    expect(castFurious(runTicks(first, 10)).monsters[0].hp).toBe(840)
  })

  test('F4: a press in the last 3 ticks of the GCD is remembered; an earlier one is dropped', () => {
    const first = castFurious(skillReady()) // GCD는 틱 10까지.

    // 틱 7(3틱 남음)에 누르면 기억했다가 틱 10에 나간다. 틱 9까지는 안 나간다.
    const queued = castFurious(runTicks(first, 7))
    expect(runTicks(queued, 2).monsters[0].hp).toBe(920)
    expect(runTicks(queued, 3).monsters[0].hp).toBe(840)

    // 틱 6(4틱 남음)에 누르면 버려진다.
    const tooEarly = castFurious(runTicks(first, 6))
    expect(runTicks(tooEarly, 4).monsters[0].hp).toBe(920)

    // 같은 키를 여러 번 눌러도 한 번만 나가고, 그 GCD 안에서 또 나가지는 않는다.
    const mashed = castFurious(castFurious(castFurious(runTicks(first, 7))))
    expect(runTicks(mashed, 13).monsters[0].hp).toBe(840)
  })

  test('F5: a remembered skill is dropped if it cannot be used when the GCD ends, and the GCD is not spent', () => {
    const first = castFurious(skillReady())
    const queued = castFurious(runTicks(first, 7))

    // 기억해 둔 사이 대상이 사라졌다. 틱 10이 되어도 안 나가고 분노도 그대로다.
    const dropped = runTicks({ ...queued, targetId: null }, 3)
    expect(dropped.monsters[0].hp).toBe(920)
    expect(dropped.rage).toBe(10)

    // GCD를 쓰지 않았으므로 대상을 다시 잡고 바로 누르면 나간다(쓴 거였다면 틱 20까지 막힌다).
    const recast = castFurious({ ...dropped, targetId: 0 })
    expect(recast.monsters[0].hp).toBe(840)

    // 버려진 입력이 남아 있다가 틱 20에 또 나가면 안 된다.
    expect(runTicks(recast, 10).monsters[0].hp).toBe(840)
  })

  test('F6: armor cuts the damage and it is rounded — 250 gives 64, 100 gives 73, 500 gives 53', () => {
    const damageTakenBy = (templateId) => {
      const base = createInitialState(MONSTERS, [
        { packNumber: 1, monsterTemplateId: templateId, amount: 1 },
      ])
      const state = {
        ...base,
        player: { x: 9, y: 4, facing: 'right' },
        monsters: [{ ...base.monsters[0], hp: 1000, aggro: true, nextAttackTick: 1000 }],
        targetId: 0,
        nextPlayerAttackTick: 1000,
      }
      return 1000 - castFurious(state).monsters[0].hp
    }

    // 80 × (1 − armor / (armor + 1000))를 손으로 계산한 값이다.
    expect(damageTakenBy(1)).toBe(80) // 방어력 0
    expect(damageTakenBy(2)).toBe(64) // 250: 정확히 64
    expect(damageTakenBy(3)).toBe(73) // 100: 72.73 → 반올림 73 (내림이면 72)
    expect(damageTakenBy(5)).toBe(53) // 500: 53.33 → 반올림 53 (올림이면 54)
  })

  test('F7: Rage stops at 5c', () => {
    let state = skillReady()
    for (let i = 0; i < 6; i++) {
      state = runTicks(castFurious(state), 10) // 한 번 쓰고 GCD가 끝날 때까지 기다린다.
      if (i === 4) expect(state.rage).toBe(50)
    }

    expect(state.rage).toBe(50)
  })

  test('F8: a kill by skill removes the monster and moves the target on', () => {
    const state = huntWith([
      { x: 6, y: 4, hp: 80, aggro: true },
      { x: 9, y: 4, hp: 100, aggro: true },
    ])

    const after = castFurious(state)

    expect(after.monsters).toHaveLength(1)
    expect(after.targetId).toBe(1)
  })

  test('F9: a defeated player cannot use skills', () => {
    const dead = { ...skillReady(), defeated: true, playerHp: 0 }

    expect(castFurious(dead)).toBe(dead)

    // 기억해 둔 스킬이 나가는 틱에 몬스터에게 죽으면(몬스터가 먼저 때린다) 그 스킬도 안 나간다.
    const base = skillReady()
    const dying = {
      ...base,
      playerHp: 10,
      gcdReadyTick: 1,
      queuedSkill: 'furiousThrust',
      monsters: base.monsters.map((m) => ({ ...m, nextAttackTick: 0 })),
    }
    const after = runTicks(dying, 1)
    expect(after.defeated).toBe(true)
    expect(after.monsters[0].hp).toBe(1000)
  })

  test('F10: the auto-attack keeps swinging during the GCD', () => {
    // 자동공격을 켠 상태(타이머 0). 스킬을 쓰면 920, 1틱 뒤 자동공격이 40을 더 깎는다.
    const state = { ...skillReady(), nextPlayerAttackTick: 0 }
    const cast = castFurious(state)

    expect(runTicks(cast, 1).monsters[0].hp).toBe(880)
    // 틱 21의 두 번째 자동공격까지: 스킬 80 + 자동공격 40 × 2 = 160.
    expect(runTicks(cast, 21).monsters[0].hp).toBe(840)
  })
})
