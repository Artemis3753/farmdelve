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
        // 출혈은 아직 걸리지 않았다.
        bleed: null,
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
    // 체력은 백로그의 시작 체력 2000(잠정)이고, 아직 죽지 않았다.
    expect(state.playerHp).toBe(2000)
    expect(state.playerMaxHp).toBe(2000)
    expect(state.defeated).toBe(false)
    // 대상은 아직 없고, 플레이어의 첫 공격 시각 0은 "처음부터 칠 수 있다"는 뜻이다.
    expect(state.targetId).toBeNull()
    expect(state.nextPlayerAttackTick).toBe(0)
    // 분노는 비어 있고, GCD는 돌고 있지 않으며, 기억해 둔 스킬 입력은 없다.
    expect(state.rage).toBe(0)
    expect(state.gcdReadyTick).toBe(0)
    expect(state.queuedSkill).toBeNull()
    // 채널 중인 스킬도 없다.
    expect(state.channel).toBeNull()
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
    // 출혈 경로: 분노 2c로 Whirling Slash를 거는 경로(applying), 이미 걸린 출혈을 갱신하는 경로
    // (refreshing, 틱 19에서 한 틱 흐르면 20이라 출혈 틱도 나간다), 출혈 틱으로 죽는 경로(bleedKilling).
    const applying = deepFreeze({ ...hunting, rage: 20 })
    const refreshing = deepFreeze({
      ...applying,
      tick: 19,
      monsters: applying.monsters.map((m) => ({ ...m, bleed: { endTick: 100, nextTickTick: 20 } })),
    })
    const bleedKilling = deepFreeze({
      ...refreshing,
      monsters: refreshing.monsters.map((m) => ({ ...m, hp: 10 })),
    })
    const actions = [
      { type: 'useSkill', skill: 'furiousThrust' },
      { type: 'useSkill', skill: 'whirlingSlash' },
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
      queuing, queuedCast, applying, refreshing, bleedKilling,
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

    expect(runTicks(state, 19).playerHp).toBe(2000)
    expect(runTicks(state, 20).playerHp).toBe(1990)
  })

  test('D2: after the first hit it hits again every 20 ticks', () => {
    // 이미 붙어 있는 배치: 몬스터 (10, 4), 플레이어 (9, 4).
    const state = packOneWithPlayerAt(1, 9, 4)

    expect(runTicks(state, 1).playerHp).toBe(1990)
    expect(runTicks(state, 20).playerHp).toBe(1990)
    expect(runTicks(state, 21).playerHp).toBe(1980)
    expect(runTicks(state, 41).playerHp).toBe(1970)
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

    expect(runTicks(state, 1).playerHp).toBe(1970)
  })

  test('D4: arriving does not reset the swing timer — a monster that just swung waits out its interval', () => {
    // 몬스터가 거리 2에서 출발하고, 마지막 공격 뒤 다음 공격 시각이 30틱이다.
    // 5틱에 곁에 와도 30틱이 되기 전에는 때리지 않는다.
    const base = packOneWithPlayerAt(1, 5, 4)
    const state = {
      ...base,
      monsters: [{ ...base.monsters[0], x: 7, y: 4, aggro: true, nextAttackTick: 30 }],
    }

    expect(runTicks(state, 29).playerHp).toBe(2000)
    expect(runTicks(state, 30).playerHp).toBe(1990)
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

// specs의 몬스터를 놓고 플레이어는 (5, 4)에서 facing을 본다. 대상은 targetId(기본 없음).
// 몬스터 공격과 플레이어 자동공격은 멀리(1000) 미뤄 둔다. 몬스터는 모두 어그로 상태, hp 1000.
function swingWith(specs, { facing = 'right', targetId = null } = {}) {
  // 한 팩은 최대 4마리라서 4마리씩 팩을 나눠 만든다. 팩 번호는 어그로를 직접 켜 두므로 상관없고,
  // id는 specs 순서(0부터)다.
  const packs = []
  for (let i = 0; i < specs.length; i += 4) {
    packs.push({
      packNumber: i / 4 + 1,
      monsterTemplateId: 1,
      amount: Math.min(4, specs.length - i),
    })
  }
  const base = createInitialState(MONSTERS, packs)
  return {
    ...base,
    player: { x: 5, y: 4, facing },
    targetId,
    nextPlayerAttackTick: 1000,
    monsters: base.monsters.map((m, i) => ({
      ...m,
      hp: 1000,
      aggro: true,
      nextAttackTick: 1000,
      ...specs[i],
    })),
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

  // Overhead Slam(2026-11-17 합의). 단일 대상 스펜더: 가진 분노를 정수 포인트만큼 전부 쓰고
  // 피해는 200 × n^0.6(n = 쓴 포인트, 반올림)이다. 곡선이 오목해서 사이클당 GCD 하나의 평균
  // 피해는 3c 부근이 가장 높다. 사거리 1칸과 GCD·큐 규칙은 Furious Thrust와 같다.
  //
  // 기댓값은 공식이 아니라 손으로 뽑은 표(1c 200, 2c 303, 3c 387, 4c 459, 5c 525)에서 가져온다.
  const castSlam = (state) => combatReducer(state, { type: 'useSkill', skill: 'overheadSlam' })
  const withRage = (state, rage) => ({ ...state, rage })

  test('F11: Overhead Slam spends all whole points; damage is 200, 303, 387, 459, 525 for 1c to 5c', () => {
    // 표의 값: 200 × n^0.6 = 200, 303.15, 386.9, 459.4, 525.3 → 반올림.
    const table = [
      { rage: 10, damage: 200 },
      { rage: 20, damage: 303 },
      { rage: 30, damage: 387 }, // 386.9 — 내림이면 386
      { rage: 40, damage: 459 }, // 459.4 — 올림이면 460
      { rage: 50, damage: 525 }, // 525.3 — 올림이면 526
    ]

    for (const { rage, damage } of table) {
      const after = castSlam(withRage(skillReady(), rage))
      expect(after.monsters[0].hp).toBe(1000 - damage)
      expect(after.rage).toBe(0)
    }

    // GCD도 쓴다: 바로 Furious Thrust를 눌러도(10틱 남음, 큐 창 밖) 버려지고, 10틱 뒤에야 나간다.
    const slammed = castSlam(withRage(skillReady(), 50))
    const early = castFurious(slammed)
    expect(early.monsters[0].hp).toBe(475)
    expect(castFurious(runTicks(slammed, 10)).monsters[0].hp).toBe(395)
  })

  test('F12: half a point is left behind — 2.5c spends 2c and keeps 0.5c', () => {
    const after = castSlam(withRage(skillReady(), 25))

    expect(after.monsters[0].hp).toBe(1000 - 303)
    expect(after.rage).toBe(5)
  })

  test('F13: with less than 1c nothing happens and the GCD is not spent', () => {
    const empty = withRage(skillReady(), 0)
    expect(castSlam(empty)).toEqual(empty)

    const half = withRage(skillReady(), 5)
    expect(castSlam(half)).toEqual(half)

    // GCD를 안 썼으므로 바로 Furious Thrust가 나간다.
    expect(castFurious(castSlam(half)).monsters[0].hp).toBe(920)
  })

  test('F14: with no target, or a target out of range, nothing happens and the Rage is kept', () => {
    const noTarget = withRage({ ...skillReady(), targetId: null }, 50)
    expect(castSlam(noTarget)).toEqual(noTarget)

    const farAway = withRage(skillReady(1000, 5, 4), 50)
    expect(castSlam(farAway)).toEqual(farAway)
  })

  test('F15: armor cuts the damage and it is rounded — 3c vs 250 gives 310, 1c vs 100 gives 182, 2c vs 300 gives 233', () => {
    const damageTakenBy = (templateId, rage) => {
      const base = createInitialState(MONSTERS, [
        { packNumber: 1, monsterTemplateId: templateId, amount: 1 },
      ])
      const state = {
        ...base,
        player: { x: 9, y: 4, facing: 'right' },
        monsters: [{ ...base.monsters[0], hp: 1000, aggro: true, nextAttackTick: 1000 }],
        targetId: 0,
        nextPlayerAttackTick: 1000,
        rage,
      }
      return 1000 - castSlam(state).monsters[0].hp
    }

    // 곡선 값 × (1 − armor / (armor + 1000))를 손으로 계산한 값이다.
    expect(damageTakenBy(2, 30)).toBe(310) // 387 × 0.8 = 309.6 → 반올림 310 (내림이면 309)
    expect(damageTakenBy(3, 10)).toBe(182) // 200 × 1000/1100 = 181.82 → 182 (내림이면 181)
    expect(damageTakenBy(4, 20)).toBe(233) // 303 × 1000/1300 = 233.08 → 233 (올림이면 234)
  })

  test('F16: the key is remembered in the last 3 ticks of the GCD and spends the Rage held when it fires', () => {
    // Furious Thrust로 분노가 40에서 50이 되고 GCD는 틱 10까지다.
    const first = castFurious(withRage(skillReady(), 40))
    expect(first.rage).toBe(50)

    // 틱 7에 눌러 기억하면 틱 10에 나간다. 틱 9까지는 안 나간다.
    const queued = castSlam(runTicks(first, 7))
    expect(runTicks(queued, 2).monsters[0].hp).toBe(920)
    const fired = runTicks(queued, 3)
    expect(fired.monsters[0].hp).toBe(920 - 525)
    expect(fired.rage).toBe(0)

    // 기억해 둔 사이 분노가 줄었다면 누른 때가 아니라 나가는 때의 분노로 쓴다: 3c → 387.
    expect(runTicks({ ...queued, rage: 30 }, 3).monsters[0].hp).toBe(920 - 387)

    // 나갈 때 1c도 없으면 버려지고 분노는 그대로다.
    const dropped = runTicks({ ...queued, rage: 5 }, 3)
    expect(dropped.monsters[0].hp).toBe(920)
    expect(dropped.rage).toBe(5)

    // 4틱 이상 남았을 때 누른 입력은 버려진다.
    const tooEarly = castSlam(runTicks(first, 6))
    expect(runTicks(tooEarly, 4).monsters[0].hp).toBe(920)
  })

  test('F17: a kill by Overhead Slam removes the monster, spends the Rage and moves the target on', () => {
    const state = withRage(
      huntWith([
        { x: 6, y: 4, hp: 300, aggro: true },
        { x: 9, y: 4, hp: 100, aggro: true },
      ]),
      30,
    )

    const after = castSlam(state)

    expect(after.monsters).toHaveLength(1)
    expect(after.targetId).toBe(1)
    expect(after.rage).toBe(0)
  })

  test('F18: the auto-attack keeps swinging after Overhead Slam', () => {
    // 자동공격을 켠 상태(타이머 0). 5c 스펜더 525, 1틱 뒤 자동공격 40.
    const state = withRage({ ...skillReady(), nextPlayerAttackTick: 0 }, 50)
    const cast = castSlam(state)

    expect(runTicks(cast, 1).monsters[0].hp).toBe(1000 - 525 - 40)
    // 틱 21의 두 번째 자동공격까지: 스펜더 525 + 자동공격 40 × 2.
    expect(runTicks(cast, 21).monsters[0].hp).toBe(1000 - 525 - 80)
  })

  // Brutal Swing(2026-11-17 합의). 광역 빌더: 바라보는 방향으로 폭 3칸 × 앞 2줄(6칸)의 모든 적을
  // 최대 5명까지 때리고, 맞힌 한 명마다 분노 0.5c(5 단위)를 만든다. 한 명당 피해는 Furious Thrust의
  // 절반인 40(백로그: AoE 효율 0.5, 2명부터 이득)이고 방어력을 적용한다. 대상 선택은 필요 없고,
  // 범위가 비어도 발동해서 GCD를 쓴다(헛스윙). 6칸이 다 차 5명을 넘으면 선택한 대상(범위 안일 때)을
  // 먼저 넣고 나머지는 플레이어에게 가까운 순, 같으면 id가 낮은 순이다.
  //
  // 플레이어는 (5, 4)에 서서 오른쪽을 본다: 범위는 x 6~7, y 3~5의 여섯 칸이다.
  const castSwing = (state) => combatReducer(state, { type: 'useSkill', skill: 'brutalSwing' })

  const SWING_AREA = [
    [6, 3], [6, 4], [6, 5],
    [7, 3], [7, 4], [7, 5],
  ]

  test('F19: Brutal Swing hits the six tiles three wide and two rows ahead, and nothing else', () => {
    // 안쪽 3마리 + 바깥 5마리: 3칸 앞, 옆으로 2칸 두 곳, 바로 뒤, 플레이어 바로 옆(앞이 아니라 옆).
    const state = swingWith([
      { x: 6, y: 4 }, { x: 7, y: 3 }, { x: 7, y: 5 },
      { x: 8, y: 4 }, { x: 6, y: 2 }, { x: 6, y: 6 }, { x: 4, y: 4 }, { x: 5, y: 3 },
    ])

    const after = castSwing(state)

    expect(after.monsters.map((m) => m.hp)).toEqual([960, 960, 960, 1000, 1000, 1000, 1000, 1000])
    expect(after.rage).toBe(15)
  })

  test('F20: the area turns with the player — up, down and left each hit their own corner and miss the next tile', () => {
    // 각 방향마다 앞 2줄 × 폭 3의 구석 한 칸(맞음)과 그 바로 옆 바깥 한 칸(안 맞음)을 놓는다.
    const cases = [
      { facing: 'up', inside: { x: 6, y: 2 }, outside: { x: 7, y: 3 } }, // 옆 +1·앞 2 / 옆 +2
      { facing: 'down', inside: { x: 4, y: 6 }, outside: { x: 3, y: 5 } },
      { facing: 'left', inside: { x: 3, y: 3 }, outside: { x: 2, y: 4 } }, // 앞 2·옆 -1 / 앞 3
    ]

    for (const { facing, inside, outside } of cases) {
      const after = castSwing(swingWith([inside, outside], { facing }))
      expect(after.monsters.map((m) => m.hp)).toEqual([960, 1000])
    }
  })

  test('F21: each enemy hit makes 0.5c of Rage, and Rage stops at 5c', () => {
    const rageAfter = (hits, rage = 0) => {
      const specs = SWING_AREA.slice(0, hits).map(([x, y]) => ({ x, y }))
      return castSwing({ ...swingWith(specs), rage }).rage
    }

    expect(rageAfter(1)).toBe(5)
    expect(rageAfter(2)).toBe(10)
    expect(rageAfter(5)).toBe(25)
    expect(rageAfter(2, 45)).toBe(50) // 45 + 10 = 55 → 50
  })

  test('F22: armor cuts each hit and it is rounded — 250 gives 32, 100 gives 36, 300 gives 31', () => {
    const damageTakenBy = (templateId) => {
      const base = createInitialState(MONSTERS, [
        { packNumber: 1, monsterTemplateId: templateId, amount: 1 },
      ])
      // 템플릿에서 온 방어력만 가져온다. 나머지(위치, hp, 타이머)는 swingWith의 것이다.
      const state = swingWith([{ x: 6, y: 4, armor: base.monsters[0].armor }])
      return 1000 - castSwing(state).monsters[0].hp
    }

    // 40 × (1 − armor / (armor + 1000))를 손으로 계산한 값이다(E6과 같은 표).
    expect(damageTakenBy(1)).toBe(40) // 방어력 0
    expect(damageTakenBy(2)).toBe(32) // 250: 정확히 32
    expect(damageTakenBy(3)).toBe(36) // 100: 36.36 → 반올림 36 (올림이면 37)
    expect(damageTakenBy(4)).toBe(31) // 300: 30.77 → 반올림 31 (내림이면 30)
  })

  test('F23: a swing with nobody in the area still happens — no damage, no Rage, and the GCD is spent', () => {
    // 대상(바로 옆 (5, 3))은 범위 밖이다. 휘두르면 아무도 안 맞지만 GCD는 간다.
    const state = { ...swingWith([{ x: 5, y: 3 }], { targetId: 0 }), rage: 20 }

    const whiffed = castSwing(state)
    expect(whiffed.monsters[0].hp).toBe(1000)
    expect(whiffed.rage).toBe(20)

    // GCD를 썼으므로 바로 Furious Thrust를 눌러도(10틱 남음) 버려지고, 10틱 뒤에 나간다.
    expect(castFurious(whiffed).monsters[0].hp).toBe(1000)
    expect(castFurious(runTicks(whiffed, 10)).monsters[0].hp).toBe(920)

    // 대상도 몬스터도 없어도 발동한다.
    const empty = castSwing({ ...swingWith([]), targetId: null })
    expect(empty.gcdReadyTick).toBe(10)
  })

  test('F24: more than five in the area — the target comes first, then the nearest, then the lower id', () => {
    const hpsAfter = (specs, targetId) =>
      castSwing(swingWith(specs, { targetId })).monsters.map((m) => m.hp)

    // 뒷줄 (거리 2)이 id 0~2, 앞줄 (거리 1)이 id 3~5. 대상 없음: 앞줄 3명 + 뒷줄에서 id가 낮은 2명.
    // id 순이었다면 앞줄(3~5) 하나가 빠졌을 것이다.
    const rearLowIds = [
      { x: 7, y: 3 }, { x: 7, y: 4 }, { x: 7, y: 5 },
      { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 },
    ]
    expect(hpsAfter(rearLowIds, null)).toEqual([960, 960, 1000, 960, 960, 960])

    // 빠질 뻔한 id 2를 대상으로 잡으면 대상이 먼저 들어가고, 뒷줄의 남은 둘(0, 1) 중 id 1이 빠진다.
    expect(hpsAfter(rearLowIds, 2)).toEqual([960, 1000, 960, 960, 960, 960])

    // 모든 경우에 분노는 5명 몫이다.
    expect(castSwing(swingWith(rearLowIds)).rage).toBe(25)
  })

  test('F25: a press in the last 3 ticks of the GCD is remembered and hits whoever is in the area when it fires', () => {
    // 두 마리: 0번(대상, 바로 앞)과 1번(범위 안). Furious Thrust로 시작해서 GCD는 틱 10까지다.
    const first = castFurious(swingWith([{ x: 6, y: 4 }, { x: 7, y: 4 }], { targetId: 0 }))
    expect(first.monsters[0].hp).toBe(920)

    // 틱 7에 누르면 기억했다가 틱 10에 나간다. 틱 9까지는 안 나간다.
    const queued = castSwing(runTicks(first, 7))
    expect(runTicks(queued, 2).monsters[0].hp).toBe(920)

    // 기억해 둔 사이 1번이 멀리 가 버렸다면 나가는 때의 범위로 맞힌다: 0번만 맞는다.
    const moved = { ...queued, monsters: queued.monsters.map((m) => (m.id === 1 ? { ...m, x: 20 } : m)) }
    const fired = runTicks(moved, 3)
    expect(fired.monsters.map((m) => m.hp)).toEqual([880, 1000])
    expect(fired.rage).toBe(15) // Furious Thrust 1c + 0.5c

    // 4틱 이상 남았을 때 누른 입력은 버려진다.
    const tooEarly = castSwing(runTicks(first, 6))
    expect(runTicks(tooEarly, 4).monsters[0].hp).toBe(920)
  })

  test('F26: a kill by Brutal Swing removes every dead monster, counts them for Rage, and moves the target on', () => {
    // 0번(대상)과 1번이 범위 안에서 한 방에 죽는다. 2번은 범위 밖에서 쫓아오는 중이다.
    const state = swingWith(
      [
        { x: 6, y: 4, hp: 40 },
        { x: 7, y: 4, hp: 40 },
        { x: 9, y: 4 },
      ],
      { targetId: 0 },
    )

    const after = castSwing(state)

    expect(after.monsters.map((m) => m.id)).toEqual([2])
    expect(after.targetId).toBe(2)
    expect(after.rage).toBe(10)

    // 대상이 살아 있으면 다른 몬스터가 죽어도 대상은 그대로다. 0번은 죽고, 더 가까운 1번이
    // 살아 있어도 멀리 있는 2번(대상)이 유지된다.
    const targetSurvives = castSwing(
      swingWith(
        [
          { x: 6, y: 4, hp: 40 },
          { x: 7, y: 4 },
          { x: 12, y: 4 },
        ],
        { targetId: 2 },
      ),
    )
    expect(targetSurvives.monsters.map((m) => m.id)).toEqual([1, 2])
    expect(targetSurvives.targetId).toBe(2)

    // 대상 없이 휘둘러 죽여도 선택이 생기지는 않는다.
    const noTarget = castSwing(swingWith([{ x: 6, y: 4, hp: 40 }, { x: 12, y: 4 }]))
    expect(noTarget.monsters.map((m) => m.id)).toEqual([1])
    expect(noTarget.targetId).toBeNull()
  })
})


// Whirling Slash(2026-11-17 합의). 채널 스펜더: 가진 정수 포인트를 전부 쓰고, 포인트당 0.7초(7틱)
// 동안 돌면서 0.7초마다 한 번(포인트당 한 틱) 사거리 1칸 안의 모든 적에게 40(방어력 적용)을 준다.
// 틱마다 그 순간의 범위를 새로 확인해서, 걸어 나가면 그 틱은 헛되고 돌아오면 이어진다. 대상도
// 사거리 검사도 필요 없고 범위가 비어도 시작한다. 끝날 때 한 틱이라도 맞혔으면 체력 20을 회복한다.
// 채널은 끝날 때까지 GCD를 잡고(1c는 0.7초가 아니라 GCD 1초), 그동안 이동과 평타는 막지 않는다.
// 출혈은 이번 슬라이스가 아니다.
//
// 플레이어는 (5, 4). 바로 옆 칸(6, 4)의 적은 사거리 1 안이다.
const castSpin = (state) => combatReducer(state, { type: 'useSkill', skill: 'whirlingSlash' })
const spinWith = (specs, { rage = 50, ...options } = {}) => ({ ...swingWith(specs, options), rage })
const hpsOf = (state) => state.monsters.map((m) => m.hp)

describe('combatReducer — Whirling Slash channel (seam G)', () => {
  test('G1: 3c spends all the Rage, deals nothing at once, then 40 at ticks 7, 14 and 21 and stops', () => {
    const state = spinWith([{ x: 6, y: 4 }], { rage: 30 })

    const cast = castSpin(state)
    expect(cast.rage).toBe(0)
    expect(cast.monsters[0].hp).toBe(1000)

    expect(runTicks(cast, 6).monsters[0].hp).toBe(1000)
    expect(runTicks(cast, 7).monsters[0].hp).toBe(960)
    expect(runTicks(cast, 13).monsters[0].hp).toBe(960)
    expect(runTicks(cast, 14).monsters[0].hp).toBe(920)
    expect(runTicks(cast, 20).monsters[0].hp).toBe(920)
    expect(runTicks(cast, 21).monsters[0].hp).toBe(880)
    // 세 틱이 끝이다: 한참 뒤에도 더 깎이지 않는다.
    expect(runTicks(cast, 60).monsters[0].hp).toBe(880)
  })

  test('G2: one tick per point — 1c to 5c deal 40, 80, 120, 160, 200 and take 0.7 s per point', () => {
    for (let points = 1; points <= 5; points++) {
      const cast = castSpin(spinWith([{ x: 6, y: 4 }], { rage: points * 10 }))
      expect(runTicks(cast, 60).monsters[0].hp).toBe(1000 - 40 * points)
    }

    // 5c는 34틱에 네 번째 틱까지, 35틱에 마지막 틱이다.
    const five = castSpin(spinWith([{ x: 6, y: 4 }], { rage: 50 }))
    expect(runTicks(five, 34).monsters[0].hp).toBe(840)
    expect(runTicks(five, 35).monsters[0].hp).toBe(800)
  })

  test('G3: the range is checked on every tick — a tick spent out of range is lost, and coming back resumes', () => {
    const cast = castSpin(spinWith([{ x: 6, y: 4 }], { rage: 30 }))
    const first = runTicks(cast, 7)
    expect(first.monsters[0].hp).toBe(960)

    // 두 번째 틱 전에 멀리(30칸) 가 있다가, 세 번째 틱 전에 돌아온다.
    const away = { ...first, monsters: first.monsters.map((m) => ({ ...m, x: 30 })) }
    const second = runTicks(away, 7)
    expect(second.monsters[0].hp).toBe(960)

    const back = { ...second, monsters: second.monsters.map((m) => ({ ...m, x: 6, y: 4 })) }
    expect(runTicks(back, 7).monsters[0].hp).toBe(920) // 세 틱 중 두 틱만 맞았다
  })

  test('G4: every enemy within range 1 is hit, diagonals included, with no cap — and one at range 2 is not', () => {
    // 플레이어(5, 4)를 8칸이 둘러싸고, 바깥(7, 4)에 한 마리가 더 있다. 둘러싼 8칸이 꽉 차서 바깥
    // 적은 사거리 안으로 들어오지 못한다.
    const ring = [
      { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 },
      { x: 4, y: 4 },                 { x: 6, y: 4 },
      { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 },
    ]
    const state = spinWith([...ring, { x: 7, y: 4 }], { rage: 10 })

    const after = runTicks(castSpin(state), 7)

    expect(hpsOf(after)).toEqual([960, 960, 960, 960, 960, 960, 960, 960, 1000])
  })

  test('G5: armor cuts each tick and it is rounded — 250 gives 32, 100 gives 36, 300 gives 31', () => {
    const damageTakenBy = (templateId) => {
      const base = createInitialState(MONSTERS, [
        { packNumber: 1, monsterTemplateId: templateId, amount: 1 },
      ])
      const state = spinWith([{ x: 6, y: 4, armor: base.monsters[0].armor }], { rage: 10 })
      return 1000 - runTicks(castSpin(state), 7).monsters[0].hp
    }

    // 40 × (1 − armor / (armor + 1000))를 손으로 계산한 값이다(E6과 같은 표).
    expect(damageTakenBy(1)).toBe(40) // 방어력 0
    expect(damageTakenBy(2)).toBe(32) // 250: 정확히 32
    expect(damageTakenBy(3)).toBe(36) // 100: 36.36 → 반올림 36 (올림이면 37)
    expect(damageTakenBy(4)).toBe(31) // 300: 30.77 → 반올림 31 (내림이면 30)
  })

  test('G6: on completion it heals 20 if any tick connected, never past full health, and not before the end', () => {
    const hurt = (hp, specs = [{ x: 6, y: 4 }]) => ({ ...spinWith(specs, { rage: 20 }), playerHp: hp })

    // 2c는 틱 14에 끝난다. 중간(틱 7, 13)에는 회복이 없고, 끝나는 틱에 +20이다.
    const cast = castSpin(hurt(500))
    expect(runTicks(cast, 13).playerHp).toBe(500)
    expect(runTicks(cast, 14).playerHp).toBe(520)
    expect(runTicks(cast, 40).playerHp).toBe(520) // 한 번만

    // 최대 체력을 넘지 않는다.
    expect(runTicks(castSpin(hurt(1990)), 14).playerHp).toBe(2000)
    expect(runTicks(castSpin(hurt(2000)), 14).playerHp).toBe(2000)

    // 한 틱도 못 맞혔으면 회복이 없다(범위 안에 아무도 없다).
    expect(runTicks(castSpin(hurt(500, [])), 14).playerHp).toBe(500)

    // 첫 틱만 맞고 둘째 틱은 빗나가도(적이 멀리 감) 한 틱이 맞았으니 회복한다.
    const first = runTicks(castSpin(hurt(500)), 7)
    const away = { ...first, monsters: first.monsters.map((m) => ({ ...m, x: 30 })) }
    expect(runTicks(away, 7).playerHp).toBe(520)
  })

  test('G7: it starts even with nobody in range, needs 1c, and leaves a half point behind', () => {
    // 범위가 비어도 시작한다: 분노는 쓰고 GCD는 5c의 3.5초(35틱) 동안 잡힌다.
    const empty = castSpin(spinWith([], { rage: 50 }))
    expect(empty.rage).toBe(0)
    expect(empty.gcdReadyTick).toBe(35)

    // 1c가 안 되면(0, 0.5c) 아무 일도 없고 GCD도 안 쓴다.
    const none = spinWith([{ x: 6, y: 4 }], { rage: 0 })
    expect(castSpin(none)).toEqual(none)
    const half = spinWith([{ x: 6, y: 4 }], { rage: 5 })
    expect(castSpin(half)).toEqual(half)

    // 2.5c는 2c만 쓰고 0.5c가 남는다. 틱도 두 번이다.
    const leftover = castSpin(spinWith([{ x: 6, y: 4 }], { rage: 25 }))
    expect(leftover.rage).toBe(5)
    expect(runTicks(leftover, 40).monsters[0].hp).toBe(920)
  })

  test('G8: the channel holds the GCD until it ends; a press in the last 3 ticks is remembered', () => {
    const state = spinWith([{ x: 6, y: 4 }], { rage: 50, targetId: 0 })
    const cast = castSpin(state) // 5c: 틱 35까지

    // 5틱에 누른 Furious Thrust는 끝나려면 30틱이 남아 버려진다: 틱 피해(5 × 40 = 200)만 남는다.
    // (대상이 사거리 안이라 출혈도 걸린다: 45틱까지 출혈 틱 20·40의 100이 더 깎인다. 출혈은 H에서 본다.)
    const early = castFurious(runTicks(cast, 5))
    expect(runTicks(early, 40).monsters[0].hp).toBe(700)

    // 틱 32(3틱 남음)에 누르면 기억했다가 마지막 틱(35) 뒤에 나간다: 34틱까지는 160, 35틱에 200 + 80.
    // 여기에 출혈 틱 20의 50이 더 들어가 있다.
    const queued = castFurious(runTicks(cast, 32))
    expect(runTicks(queued, 2).monsters[0].hp).toBe(790)
    const fired = runTicks(queued, 3)
    expect(fired.monsters[0].hp).toBe(670)
    expect(fired.rage).toBe(10)

    // 1c는 0.7초(7틱)가 아니라 GCD 1초(10틱)다: 틱 7에 누른 입력은 틱 10에 나간다.
    const one = castSpin(spinWith([{ x: 6, y: 4 }], { rage: 10, targetId: 0 }))
    const queuedOne = castFurious(runTicks(one, 7))
    expect(runTicks(queuedOne, 2).monsters[0].hp).toBe(960)
    expect(runTicks(queuedOne, 3).monsters[0].hp).toBe(880)

    // 기억해 둔 것이 또 Whirling Slash여도 앞 채널의 마지막 틱이 먼저 끝난 뒤에 시작한다(마지막 틱이
    // 덮어써져 사라지면 안 된다). 틱 32에 분노를 2c로 채워 누르면: 틱 35에 앞 채널이 끝나며 800과
    // 회복 20, 곧바로 새 채널이 시작해 분노가 0이 되고, 틱 49에 둘째 채널(2틱)이 끝나 회복 20.
    // 체력은 출혈 틱 20·40의 100이 더 깎여 있다: 틱 35에 750, 틱 49에 620.
    const hurt = { ...state, playerHp: 500 }
    const refilled = castSpin({ ...runTicks(castSpin(hurt), 32), rage: 20 })
    const atEnd = runTicks(refilled, 3)
    expect(atEnd.monsters[0].hp).toBe(750)
    expect(atEnd.playerHp).toBe(520)
    expect(atEnd.rage).toBe(0)
    const secondDone = runTicks(refilled, 17)
    expect(secondDone.monsters[0].hp).toBe(620)
    expect(secondDone.playerHp).toBe(540)
  })

  test('G9: the player can walk while channeling, and the channel keeps running', () => {
    // 적은 (6, 4)에서 쫓아오고, 플레이어는 위로 걷는다. 3c = 틱 21까지.
    const state = spinWith([{ x: 6, y: 4 }], { rage: 30, targetId: 0 })
    const walking = combatReducer(castSpin(state), { type: 'moveStart', direction: 'up' })

    // 누르자마자 한 걸음(y 3), 틱 5에 두 걸음째(y 2). 첫 틱(7)은 걸으면서도 맞는다.
    const after7 = runTicks(walking, 7)
    expect(after7.player.y).toBe(2)
    expect(after7.monsters[0].hp).toBe(960)

    // 걷는 중에 누른 Furious Thrust(틱 10, 11틱 남음)는 버려진다: 끝까지 틱 피해 120만 들어가고, 걸어서
    // 멀어져도 출혈은 돌아 틱 20의 50이 더 깎인다.
    const pressed = castFurious(runTicks(walking, 10))
    expect(runTicks(pressed, 11).monsters[0].hp).toBe(830)
  })

  test('G10: an enemy killed by a tick is removed, and the target moves on only if the target died', () => {
    // 0번(대상)과 1번이 첫 틱에 죽고(hp 40), 2번만 남는다.
    const targetDies = castSpin(
      spinWith(
        [{ x: 6, y: 4, hp: 40 }, { x: 6, y: 3, hp: 40 }, { x: 6, y: 5 }],
        { rage: 10, targetId: 0 },
      ),
    )
    const killed = runTicks(targetDies, 7)
    expect(killed.monsters.map((m) => m.id)).toEqual([2])
    expect(killed.targetId).toBe(2)

    // 살아 있는 2번이 대상이면 0번이 죽어도 그대로다.
    const targetLives = castSpin(
      spinWith([{ x: 6, y: 4, hp: 40 }, { x: 6, y: 5 }], { rage: 10, targetId: 1 }),
    )
    expect(runTicks(targetLives, 7).targetId).toBe(1)

    // 대상이 없으면 죽여도 선택이 생기지 않는다.
    const noTarget = castSpin(spinWith([{ x: 6, y: 4, hp: 40 }, { x: 6, y: 5 }], { rage: 10 }))
    expect(runTicks(noTarget, 7).targetId).toBeNull()
  })

  test('G11: a player killed on a channel tick does not spin, and a dead player stops channeling', () => {
    // 몬스터가 틱 7에 때려 체력 10을 0으로 만든다. 몬스터 공격이 먼저라 같은 틱의 채널 틱은 안 나간다.
    const state = { ...spinWith([{ x: 6, y: 4, nextAttackTick: 7 }], { rage: 30 }), playerHp: 10 }
    const dead = runTicks(castSpin(state), 7)

    expect(dead.defeated).toBe(true)
    expect(dead.monsters[0].hp).toBe(1000)

    // 죽은 뒤에는 시간이 흘러도 아무 일도 없다.
    expect(runTicks(dead, 30).monsters[0].hp).toBe(1000)
  })

  test('G12: the auto-attack keeps swinging while the channel runs', () => {
    // 자동공격을 켠 상태(타이머 0). 틱 1에 평타 40, 틱 21에 다시 40, 채널 틱은 7·14·21에 40씩.
    const state = { ...spinWith([{ x: 6, y: 4 }], { rage: 50, targetId: 0 }), nextPlayerAttackTick: 0 }
    const cast = castSpin(state)

    expect(runTicks(cast, 1).monsters[0].hp).toBe(960)
    expect(runTicks(cast, 21).monsters[0].hp).toBe(1000 - 80 - 120 - 50) // 마지막 50은 출혈 틱 20

    // 같은 틱(7)에 채널 틱과 평타가 겹치면 채널 틱이 먼저다. 0번(대상, hp 40)이 채널 틱에 죽고
    // 대상이 1번으로 넘어가서, 평타는 1번을 때린다: 채널 40 + 평타 40 = 920. (평타가 먼저였다면
    // 0번을 죽이고, 채널 틱은 1번만 때려서 960이 된다.)
    const sameTick = {
      ...spinWith([{ x: 6, y: 4, hp: 40 }, { x: 6, y: 3 }], { rage: 10, targetId: 0 }),
      nextPlayerAttackTick: 7,
    }
    expect(runTicks(castSpin(sameTick), 7).monsters.map((m) => m.hp)).toEqual([920])
  })
})


// Whirling Slash의 출혈(2026-11-18 합의). 채널을 누르는 순간 선택한 대상이 사거리 1칸 안이면 그
// 대상 한 명에게 출혈을 건다. 지속시간은 4초 + 쓴 포인트당 2초, 2초(20틱)마다 한 번 50, 방어력을
// 무시한다. 이미 걸려 있으면 pandemic: 새 만료 = 지금 + 새 지속시간 + min(남은 시간, 새 지속시간의
// 30%), 다음 틱 시각은 그대로. 부분 틱은 없다(틱은 다음 틱 시각이 만료 이전일 때만 나간다). 사거리는
// 거는 순간에만 본다. 출혈은 몬스터 객체의 bleed 필드에 { endTick, nextTickTick }로 든다.
//
// 아래 1c 기준의 숫자는 누른 틱이 0이고, 1c 채널(틱 7에 40)이 끼어 있다: 출혈 틱은 20·40·60.
const castBleed = (specs, rage, options = {}) => castSpin(spinWith(specs, { rage, targetId: 0, ...options }))

describe('combatReducer — Whirling Slash bleed (seam H)', () => {
  test('H1: pressing with a target in range puts a bleed on it, timed from the tick of the press', () => {
    const cast = castBleed([{ x: 6, y: 4 }], 10)
    expect(cast.monsters[0].bleed).toEqual({ endTick: 60, nextTickTick: 20 })

    // 누른 틱이 0이 아니면 그 틱부터 센다.
    const later = castSpin({ ...runTicks(spinWith([{ x: 6, y: 4 }], { rage: 10, targetId: 0 }), 3) })
    expect(later.monsters[0].bleed).toEqual({ endTick: 63, nextTickTick: 23 })
  })

  test('H2: the duration is 4 s plus 2 s per point — 1c 6 s, 3c 10 s, 5c 14 s', () => {
    expect(castBleed([{ x: 6, y: 4 }], 10).monsters[0].bleed.endTick).toBe(60)
    expect(castBleed([{ x: 6, y: 4 }], 30).monsters[0].bleed.endTick).toBe(100)
    expect(castBleed([{ x: 6, y: 4 }], 50).monsters[0].bleed.endTick).toBe(140)
  })

  test('H3: it hits for 50 every 20 ticks, the last tick lands on the end, and then the bleed is gone', () => {
    const cast = castBleed([{ x: 6, y: 4 }], 10)

    // 채널 틱 40이 틱 7에 먼저 들어가 있다.
    expect(runTicks(cast, 19).monsters[0].hp).toBe(960)
    expect(runTicks(cast, 20).monsters[0].hp).toBe(910)
    expect(runTicks(cast, 39).monsters[0].hp).toBe(910)
    expect(runTicks(cast, 40).monsters[0].hp).toBe(860)
    expect(runTicks(cast, 59).monsters[0].hp).toBe(860)

    // 마지막 틱(60)이 만료 시각에 나가고, 그 뒤에는 출혈이 없다.
    const done = runTicks(cast, 60)
    expect(done.monsters[0].hp).toBe(810)
    expect(done.monsters[0].bleed).toBeNull()
    expect(runTicks(cast, 200).monsters[0].hp).toBe(810)

    // 5c: 채널 200 + 출혈 7틱 350.
    const five = castBleed([{ x: 6, y: 4 }], 50)
    expect(runTicks(five, 200).monsters[0].hp).toBe(450)
  })

  test('H4: the bleed ignores armor, while the channel tick next to it does not', () => {
    // 방어력 500: 채널 틱은 40 × (1 − 500/1500) = 26.67 → 27이고, 출혈은 방어력과 무관하게 50 × 3.
    const cast = castBleed([{ x: 6, y: 4, armor: 500 }], 10)

    expect(runTicks(cast, 60).monsters[0].hp).toBe(1000 - 27 - 150)
  })

  test('H5: only the selected target is bled, even if others stand in range', () => {
    const cast = castBleed([{ x: 6, y: 4 }, { x: 6, y: 3 }], 10)

    expect(cast.monsters[0].bleed).toEqual({ endTick: 60, nextTickTick: 20 })
    expect(cast.monsters[1].bleed).toBeNull()
    // 둘 다 채널 틱 40은 맞고, 출혈은 선택한 쪽만 맞는다.
    expect(hpsOf(runTicks(cast, 60))).toEqual([810, 960])
  })

  test('H6: with no target, or a target out of range, nothing is bled and the channel still runs', () => {
    // 대상이 없다.
    const noTarget = castBleed([{ x: 6, y: 4 }], 10, { targetId: null })
    expect(noTarget.monsters[0].bleed).toBeNull()
    expect(noTarget.rage).toBe(0)
    expect(runTicks(noTarget, 60).monsters[0].hp).toBe(960)

    // 대상이 사거리 밖이다: 거리 4, 그리고 사거리 바로 밖인 거리 2.
    const far = castBleed([{ x: 9, y: 4 }], 10)
    expect(far.monsters[0].bleed).toBeNull()
    expect(runTicks(far, 60).monsters[0].hp).toBe(1000)
    expect(castBleed([{ x: 7, y: 4 }], 10).monsters[0].bleed).toBeNull()

    // 사거리 안에 다른 적이 있어도 선택한 대상이 멀면 아무도 출혈이 아니다.
    const other = castBleed([{ x: 6, y: 4 }, { x: 9, y: 4 }], 10, { targetId: 1 })
    expect(other.monsters.map((m) => m.bleed)).toEqual([null, null])
    expect(hpsOf(runTicks(other, 60))).toEqual([960, 1000])
  })

  test('H7: once applied, the bleed keeps ticking after the target leaves the range', () => {
    const cast = castBleed([{ x: 6, y: 4 }], 10)
    const away = { ...cast, monsters: cast.monsters.map((m) => ({ ...m, x: 30 })) }

    // 채널 틱은 헛되고(40 없음), 출혈 3틱 150만 들어간다.
    expect(runTicks(away, 59).monsters[0].bleed).not.toBeNull()
    expect(runTicks(away, 60).monsters[0].hp).toBe(850)
  })

  test('H8: refreshing in the last 30% carries all the time left over and keeps the tick schedule', () => {
    const first = runTicks(castBleed([{ x: 6, y: 4 }], 10), 45) // 틱 20·40이 지났고 남은 시간은 15틱
    const refreshed = castSpin({ ...first, rage: 10 })

    // 새 만료 = 45 + 60 + 15. 다음 틱 시각은 첫 출혈의 60 그대로다(새로 45 + 20이 아니다).
    expect(refreshed.monsters[0].bleed).toEqual({ endTick: 120, nextTickTick: 60 })

    // 틱 60·80·100·120 네 번이 더 나간다: 채널 40 두 번과 출혈 6틱 300을 뺀 620.
    expect(runTicks(refreshed, 200).monsters[0].hp).toBe(620)
  })

  test('H9: refreshing earlier carries only 30% of the new duration, and there is no partial tick', () => {
    const first = runTicks(castBleed([{ x: 6, y: 4 }], 50), 40) // 틱 40까지 지났고 남은 시간은 100틱

    // 5c로 다시 걸면 14초의 30% = 42틱만 이어 붙는다: 40 + 140 + 42.
    expect(castSpin({ ...first, rage: 50 }).monsters[0].bleed).toEqual({ endTick: 222, nextTickTick: 60 })

    // 1c로 다시 걸면 6초의 30% = 18틱: 40 + 60 + 18 = 118. 다음 틱이 60·80·100이고 120은 만료(118)
    // 뒤라서 나가지 않는다: 채널 200 + 40, 출혈 5틱 250을 뺀 510. 부분 틱이 있다면 더 깎인다.
    const short = castSpin({ ...first, rage: 10 })
    expect(short.monsters[0].bleed).toEqual({ endTick: 118, nextTickTick: 60 })
    const done = runTicks(short, 200)
    expect(done.monsters[0].hp).toBe(510)
    expect(done.monsters[0].bleed).toBeNull()
  })

  test('H10: a monster killed by a bleed tick is removed, and the target moves on if it was the target', () => {
    // 0번(대상)은 채널 틱(7)에 hp 50이 되고, 출혈 틱(20)에 정확히 0이 되어 죽는다(0도 죽음이다).
    const cast = castBleed([{ x: 6, y: 4, hp: 90 }, { x: 6, y: 3 }], 10)

    expect(runTicks(cast, 19).monsters.map((m) => m.id)).toEqual([0, 1])
    const dead = runTicks(cast, 20)
    expect(dead.monsters.map((m) => m.id)).toEqual([1])
    expect(dead.targetId).toBe(1)
  })

  test('H11: on a tick where the channel and a bleed both land, the channel comes first', () => {
    // 틱 7에 채널과 출혈이 겹치고, hp 40인 적은 채널 틱(40)에 죽는다. 채널이 먼저면 한 틱이 맞았으니
    // 끝날 때 회복(20)이 나가고, 출혈이 먼저면 적이 먼저 죽어 채널이 아무도 못 맞혀 회복이 없다.
    const state = {
      ...spinWith([{ x: 6, y: 4, hp: 40, bleed: { endTick: 100, nextTickTick: 7 } }], { rage: 10 }),
      playerHp: 500,
    }
    const after = runTicks(castSpin(state), 7)

    expect(after.monsters).toEqual([])
    expect(after.playerHp).toBe(520)
  })

  test('H12: a press remembered in the GCD is applied when it fires, counted from that tick', () => {
    // Furious Thrust(틱 0, 분노 1c → 2c) 뒤 틱 8에 누른 Whirling Slash는 틱 10에 나간다. 2c라서
    // 지속시간은 8초: 10 + 80 = 90, 첫 틱은 10 + 20 = 30.
    const first = castFurious(spinWith([{ x: 6, y: 4 }], { rage: 10, targetId: 0 }))
    const queued = castSpin(runTicks(first, 8))
    expect(queued.monsters[0].bleed).toBeNull()

    expect(runTicks(queued, 2).monsters[0].bleed).toEqual({ endTick: 90, nextTickTick: 30 })
  })

  test('H13: a bleed tick that kills the target comes before a remembered skill, which then finds no target', () => {
    // 틱 10에 출혈 틱(50)이 hp 40인 대상을 죽이고, 같은 틱에 기억해 둔 Furious Thrust가 나갈 차례다.
    // 출혈이 먼저면 대상이 없어 스킬은 아무 일도 안 한다(분노 그대로). 스킬이 먼저였다면 대상을 때려
    // 죽이고 분노 1c를 얻는다.
    const state = {
      ...spinWith([{ x: 6, y: 4, hp: 40, bleed: { endTick: 100, nextTickTick: 10 } }], { rage: 0, targetId: 0 }),
      tick: 9,
      gcdReadyTick: 10,
      queuedSkill: 'furiousThrust',
    }
    const after = runTicks(state, 1)

    expect(after.monsters).toEqual([])
    expect(after.rage).toBe(0)
  })

  test('H14: a bleed tick that kills the target comes before the auto-attack, which then swings at the next target', () => {
    // 틱 20에 출혈이 0번(대상, hp 50)을 죽이고, 같은 틱에 자동공격이 나갈 차례다. 출혈이 먼저면 대상이
    // 1번으로 넘어가 자동공격은 1번을 40 때린다. 자동공격이 먼저였다면 0번을 때리고(50 → 10) 출혈이
    // 마저 죽여서 1번은 그대로 1000이다.
    const state = {
      ...spinWith(
        [{ x: 6, y: 4, hp: 50, bleed: { endTick: 100, nextTickTick: 20 } }, { x: 6, y: 3 }],
        { rage: 0, targetId: 0 },
      ),
      tick: 19,
      nextPlayerAttackTick: 20,
    }
    const after = runTicks(state, 1)

    expect(after.monsters.map((m) => m.id)).toEqual([1])
    expect(after.monsters[0].hp).toBe(960)
  })

  test('H15: a player killed on the tick of a bleed tick does not bleed the monster', () => {
    // 몬스터가 틱 7에 때려 체력 10을 0으로 만든다(몬스터 공격이 먼저). 같은 틱의 출혈 틱은 나가지 않고,
    // 죽은 뒤에는 시간이 흘러도 아무 일도 없다(G11과 같은 규칙).
    const state = {
      ...spinWith(
        [{ x: 6, y: 4, nextAttackTick: 7, bleed: { endTick: 100, nextTickTick: 7 } }],
        { rage: 0 },
      ),
      playerHp: 10,
    }
    const dead = runTicks(state, 7)

    expect(dead.defeated).toBe(true)
    expect(dead.monsters[0].hp).toBe(1000)
    expect(runTicks(dead, 30).monsters[0].hp).toBe(1000)
  })
})


// 시임 I: 전투 사건 기록(state.events). 화면이 "이번 틱에 누가 무엇으로 맞았나·죽었나"를 읽어 이펙트를
// 그리려는 것이다. 사건 모양은 WoW 전투 로그처럼 공통 칸(type, source, target, ability, amount)이고,
// 틱이 시작될 때만 비우며 seq는 전투 내내 올라간다(2026-11-26 J 결정).
//
// 대부분의 케이스는 seq를 떼고 비교한다(eventsOf). seq 규칙은 I2가 따로 본다.
const eventsOf = (state) =>
  state.events.map((event) => {
    const rest = { ...event }
    delete rest.seq
    return rest
  })
const castSwing = (state) => combatReducer(state, { type: 'useSkill', skill: 'brutalSwing' })

describe('combatReducer — combat events (seam I)', () => {
  test('I1: a new fight starts with no events and the sequence at 0', () => {
    const state = createInitialState(MONSTERS, [{ packNumber: 1, monsterTemplateId: 1, amount: 1 }])

    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(0)
  })

  test('I2: a tick clears the last events, while seq keeps counting up and never restarts', () => {
    // 자동공격이 틱 1에 나가고 다음은 틱 21이다(20틱 간격).
    const state = { ...swingWith([{ x: 6, y: 4 }], { targetId: 0 }), nextPlayerAttackTick: 1 }

    const first = runTicks(state, 1)
    expect(first.events.map((e) => e.seq)).toEqual([0])
    expect(first.nextEventSeq).toBe(1)

    // 다음 틱에는 아무 일도 없어서 목록이 비지만, 번호는 그대로다.
    const quiet = runTicks(state, 2)
    expect(quiet.events).toEqual([])
    expect(quiet.nextEventSeq).toBe(1)

    // 두 번째 자동공격은 0이 아니라 1번이다.
    expect(runTicks(state, 21).events.map((e) => e.seq)).toEqual([1])
  })

  test('I3: an auto-attack records the damage left after armor', () => {
    // 방어력 250: 40 × (1 − 250 / 1250) = 32.
    const state = { ...swingWith([{ x: 6, y: 4, armor: 250 }], { targetId: 0 }), nextPlayerAttackTick: 1 }

    expect(eventsOf(runTicks(state, 1))).toEqual([
      { type: 'damage', source: 'player', target: 0, ability: 'autoAttack', amount: 32 },
    ])
  })

  test('I4: two monsters hitting on the same tick record one event each, in id order', () => {
    // 체력에서는 합쳐서 20이 빠지지만, 사건은 누가 때렸는지 알 수 있게 한 마리씩 나눈다.
    const state = swingWith([
      { x: 6, y: 4, nextAttackTick: 1 },
      { x: 6, y: 3, nextAttackTick: 1 },
    ])
    const after = runTicks(state, 1)

    expect(after.playerHp).toBe(1980)
    expect(eventsOf(after)).toEqual([
      { type: 'damage', source: 0, target: 'player', ability: 'autoAttack', amount: 10 },
      { type: 'damage', source: 1, target: 'player', ability: 'autoAttack', amount: 10 },
    ])
  })

  test('I5: a skill pressed between ticks records cast then damage, which stay until the next tick', () => {
    const cast = castFurious(swingWith([{ x: 6, y: 4 }], { targetId: 0 }))

    expect(cast.events).toEqual([
      { seq: 0, type: 'cast', source: 'player', ability: 'furiousThrust' },
      { seq: 1, type: 'damage', source: 'player', target: 0, ability: 'furiousThrust', amount: 80 },
    ])

    // 틱이 아닌 다른 입력(걷기 시작)으로는 비지 않는다. 화면이 그리기 전에 지워지면 안 되기 때문이다.
    const walked = combatReducer(cast, { type: 'moveStart', direction: 'up' })
    expect(walked.events).toEqual(cast.events)

    expect(runTicks(cast, 1).events).toEqual([])
  })

  test('I6: a Brutal Swing that hits no one records only the cast, and a skill that cannot go records nothing', () => {
    expect(eventsOf(castSwing(swingWith([])))).toEqual([
      { type: 'cast', source: 'player', ability: 'brutalSwing' },
    ])

    // 대상 없음, 사거리 밖, 분노 부족: 상태가 그대로라 사건도 없다.
    const noTarget = swingWith([{ x: 6, y: 4 }])
    expect(castFurious(noTarget)).toEqual(noTarget)
    const farAway = swingWith([{ x: 9, y: 4 }], { targetId: 0 })
    expect(castFurious(farAway)).toEqual(farAway)
    const noRage = spinWith([{ x: 6, y: 4 }], { rage: 0 })
    expect(castSpin(noRage)).toEqual(noRage)
  })

  test('I7: Brutal Swing and each Whirling Slash tick record one damage event per enemy hit', () => {
    expect(eventsOf(castSwing(swingWith([{ x: 6, y: 4 }, { x: 6, y: 5 }])))).toEqual([
      { type: 'cast', source: 'player', ability: 'brutalSwing' },
      { type: 'damage', source: 'player', target: 0, ability: 'brutalSwing', amount: 40 },
      { type: 'damage', source: 'player', target: 1, ability: 'brutalSwing', amount: 40 },
    ])

    // 1c 채널: 누를 때는 cast만, 틱 7에 범위 안의 두 명이 한 번씩 맞는다. 체력이 꽉 차 있어서 회복
    // 사건은 없다(I10).
    const spin = castSpin(spinWith([{ x: 6, y: 4 }, { x: 4, y: 4 }], { rage: 10 }))
    expect(eventsOf(spin)).toEqual([{ type: 'cast', source: 'player', ability: 'whirlingSlash' }])
    expect(eventsOf(runTicks(spin, 7))).toEqual([
      { type: 'damage', source: 'player', target: 0, ability: 'whirlingSlash', amount: 40 },
      { type: 'damage', source: 'player', target: 1, ability: 'whirlingSlash', amount: 40 },
    ])
  })

  test('I8: a bleed tick records damage from the player with the ability bleed, ignoring armor', () => {
    // 방어력 250: 채널 틱(틱 7)은 32, 출혈 틱(틱 20)은 방어력을 무시해 50 그대로다.
    const cast = castBleed([{ x: 6, y: 4, armor: 250 }], 10)

    expect(eventsOf(runTicks(cast, 7))).toEqual([
      { type: 'damage', source: 'player', target: 0, ability: 'whirlingSlash', amount: 32 },
    ])
    expect(eventsOf(runTicks(cast, 20))).toEqual([
      { type: 'damage', source: 'player', target: 0, ability: 'bleed', amount: 50 },
    ])
  })

  test('I9: a kill records death right after the damage, whether by a hit or by a bleed', () => {
    // hp 50에 80이 들어가도 amount는 80이다(남은 hp를 넘는 초과 피해는 따로 적지 않는다).
    expect(eventsOf(castFurious(swingWith([{ x: 6, y: 4, hp: 50 }], { targetId: 0 })))).toEqual([
      { type: 'cast', source: 'player', ability: 'furiousThrust' },
      { type: 'damage', source: 'player', target: 0, ability: 'furiousThrust', amount: 80 },
      { type: 'death', target: 0 },
    ])

    // H10과 같은 배치: 채널 틱(7)에 hp 50이 되고 출혈 틱(20)에 죽는다.
    const bled = castBleed([{ x: 6, y: 4, hp: 90 }, { x: 6, y: 3 }], 10)
    expect(eventsOf(runTicks(bled, 20))).toEqual([
      { type: 'damage', source: 'player', target: 0, ability: 'bleed', amount: 50 },
      { type: 'death', target: 0 },
    ])
  })

  test('I10: the Whirling Slash heal records the amount actually restored, and nothing at full health', () => {
    const hurt = (hp) => castSpin({ ...spinWith([{ x: 6, y: 4 }], { rage: 10 }), playerHp: hp })
    const healOf = (state) => eventsOf(state).filter((e) => e.type === 'heal')

    // 1c 채널은 틱 7에 맞히고 바로 끝난다. 회복 사건은 그 틱의 피해 사건 뒤에 온다.
    expect(eventsOf(runTicks(hurt(500), 7))).toEqual([
      { type: 'damage', source: 'player', target: 0, ability: 'whirlingSlash', amount: 40 },
      { type: 'heal', source: 'player', target: 'player', ability: 'whirlingSlash', amount: 20 },
    ])
    // 1990에서는 최대 체력까지 10만 오른다.
    expect(healOf(runTicks(hurt(1990), 7))).toEqual([
      { type: 'heal', source: 'player', target: 'player', ability: 'whirlingSlash', amount: 10 },
    ])
    expect(healOf(runTicks(hurt(2000), 7))).toEqual([])
  })

  test('I11: a player killed by a monster records death after the damage', () => {
    const state = { ...swingWith([{ x: 6, y: 4, nextAttackTick: 1 }]), playerHp: 10 }
    const dead = runTicks(state, 1)

    expect(dead.defeated).toBe(true)
    expect(eventsOf(dead)).toEqual([
      { type: 'damage', source: 0, target: 'player', ability: 'autoAttack', amount: 10 },
      { type: 'death', target: 'player' },
    ])
  })

  test('I12: a skill remembered in the GCD records nothing when pressed, and cast and damage when it fires', () => {
    // Furious Thrust(틱 0, seq 0·1) 뒤 틱 8에 누른 두 번째는 GCD가 끝나는 틱 10에 나간다.
    const first = castFurious(swingWith([{ x: 6, y: 4 }], { targetId: 0 }))
    const queued = castFurious(runTicks(first, 8))
    expect(queued.events).toEqual([])

    expect(runTicks(queued, 2).events).toEqual([
      { seq: 2, type: 'cast', source: 'player', ability: 'furiousThrust' },
      { seq: 3, type: 'damage', source: 'player', target: 0, ability: 'furiousThrust', amount: 80 },
    ])
  })
})


// 던전 클리어. 규칙(2026-11-27 합의): 1단은 잡몹만 다 잡으면 클리어다(보스 없음). 마지막 몬스터가
// 죽는 순간 cleared가 켜지고, 그 뒤로는 defeated처럼 아무 일도 일어나지 않는다. 몬스터를 지우는
// 곳이 둘(damageMonster, bleedStep)이고 시점도 둘(틱, 키 입력)이라 경로마다 케이스를 하나씩 둔다.

describe('combatReducer — dungeon clear (seam J)', () => {
  test('J1: a new fight starts uncleared, even an empty corridor with no monsters', () => {
    const state = createInitialState(MONSTERS, [{ packNumber: 1, monsterTemplateId: 1, amount: 1 }])
    expect(state.cleared).toBe(false)

    // 몬스터가 0마리여도 클리어가 아니다 — 이동 테스트가 빈 복도에서 돈다.
    expect(emptyCorridor().cleared).toBe(false)
  })

  test('J2: an auto-attack that kills the last monster clears the run; killing one of two does not', () => {
    // hp 40은 평타 한 방(40)이다.
    const last = runTicks(huntingOne(40, 9, 4), 1)
    expect(last.monsters).toHaveLength(0)
    expect(last.cleared).toBe(true)

    // 대상(hp 10)만 죽고 멀리 있는 한 마리는 남는다.
    const oneLeft = runTicks(huntWith([
      { x: 6, y: 4, hp: 10, aggro: true },
      { x: 9, y: 4, hp: 100, aggro: true },
    ]), 1)
    expect(oneLeft.monsters).toHaveLength(1)
    expect(oneLeft.cleared).toBe(false)
  })

  test('J3: a bleed tick that kills the last monster clears the run; killing one of two does not', () => {
    // 출혈 틱(50)이 틱 1에 나가게 걸어 둔다. 대상이 없고 평타·몬스터 공격은 틱 1000으로 미뤄져서
    // 죽이는 것은 출혈뿐이다.
    const bleeding = { endTick: 60, nextTickTick: 1 }

    const last = runTicks(swingWith([{ x: 6, y: 4, hp: 50, bleed: bleeding }]), 1)
    expect(last.monsters).toHaveLength(0)
    expect(last.cleared).toBe(true)

    const oneLeft = runTicks(swingWith([
      { x: 6, y: 4, hp: 50, bleed: bleeding },
      { x: 6, y: 3 },
    ]), 1)
    expect(oneLeft.monsters).toHaveLength(1)
    expect(oneLeft.cleared).toBe(false)
  })

  test('J4: a skill key that kills the last monster clears the run at once, with no tick', () => {
    // Furious Thrust 80, 방어력 0. 틱을 흘리지 않고 키만 누른다.
    const after = castFurious(skillReady(80))

    expect(after.tick).toBe(0)
    expect(after.monsters).toHaveLength(0)
    expect(after.cleared).toBe(true)
  })

  test('J5: once cleared, a tick, moving, selecting and a skill all return the same object', () => {
    const cleared = castFurious(skillReady(80))

    // 같은 객체를 그대로 돌려받아야 한다(아무 일도 일어나지 않았다는 뜻, D6과 같은 모양).
    expect(combatReducer(cleared, { type: 'tick' })).toBe(cleared)
    expect(combatReducer(cleared, { type: 'moveStart', direction: 'left' })).toBe(cleared)
    expect(combatReducer(cleared, { type: 'moveStop', direction: 'left' })).toBe(cleared)
    expect(combatReducer(cleared, { type: 'selectTarget', monsterId: 0 })).toBe(cleared)
    expect(castFurious(cleared)).toBe(cleared)
  })
})
