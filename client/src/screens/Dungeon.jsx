// 던전. 위쪽 헤더에 단수·남은 시간·진행도, 가운데 복도, 아래 분노 바와 스킬창.
//
// 이 파일은 화면이다. 무엇이 어떻게 움직이는지는 combat/rules.js(규칙서)가
// 정하고, 여기는 그 상태를 받아 그리기만 한다. 규칙서는 화면이 몇 칸인지
// 모른다 — 그래서 "복도의 어느 구간을 보여줄까"(카메라)는 이쪽 일이다.
//
// 스킬창의 숫자는 아직 자리를 채우는 값이다.

import { useEffect, useReducer, useState } from 'react'
import Icon from '../components/Icon.jsx'
import EffectLayer from '../components/EffectLayer.jsx'
import { mergeStack } from '../stacks.js'
import {
  combatReducer,
  createInitialState,
  distanceBetween,
  inRift,
  inSwingArea,
  COOLDOWN_SKILLS,
  CORRIDOR_HEIGHT,
  CORRIDOR_LENGTH,
  MELEE_RANGE,
  QUEUE_WINDOW_TICKS,
  RAGE_PER_POINT,
  TICKS_PER_SECOND,
} from '../combat/rules.js'

// 화면에 보이는 가로 칸 수. 플레이어가 가운데 서고 앞뒤로 8칸씩 보인다
// (백로그 Dungeon space). 홀수여야 "가운데 칸"이 생긴다.
const VIEW_WIDTH = 17

// 칸 한 변(px)과 칸 사이 틈(px). 그림 팩이 16px이라 정수배(3배)인 48로 고정한다 — 1.5배처럼 정수가
// 아닌 배율은 픽셀마다 늘어나는 폭이 달라져 그림이 뭉개진다. 복도 격자와 이펙트 canvas가 둘 다 이
// 값을 쓴다. 한쪽(CSS)에만 적으면 그쪽만 고쳤을 때 이펙트가 칸에서 어긋나므로, 여기 한 곳에 둔다.
const TILE_SIZE = 48
const TILE_GAP = 2

const SKILL_SLOTS = [1, 2, 3, 4, 5, 6, 7]

// 칸 번호 → 그 칸에 놓인 스킬. 스펙의 스킬 번호를 그대로 쓴다.
// 칸에 마우스를 올리면 이름이 보이게 title로 쓴다.
const SLOT_SKILLS = {
  1: 'furiousThrust',
  2: 'brutalSwing',
  3: 'overheadSlam',
  4: 'whirlingSlash',
  5: 'marketPriceRage',
  6: 'tilling',
}
const SKILL_LABELS = {
  furiousThrust: 'Furious Thrust',
  brutalSwing: 'Brutal Swing',
  overheadSlam: 'Overhead Slam',
  whirlingSlash: 'Whirling Slash',
  marketPriceRage: 'Market Price Rage',
  tilling: 'Tilling',
}

// 스킬 id → 그림 팩(Ninja Adventure, CC0)의 아이콘 파일 이름. 확장자와 "Disabled"를 붙이지 않은
// 이름만 적는다 — 팩이 회색판을 "<이름>Disabled.png"로 같은 폴더에 두어서, 쓸 수 없을 때는 이름 뒤에
// 붙이기만 하면 된다. 파일은 client/public/art/에 원래 이름 그대로 복사해 두었고, Vite가 public/을
// 사이트 맨 위(/)에 그대로 내주므로 "/art/<이름>.png"로 부른다.
const SKILL_ICONS = {
  furiousThrust: 'AttackUpgrade',
  brutalSwing: 'Harvest',
  overheadSlam: 'Mine',
  whirlingSlash: 'Shuriken',
  // 쿨기 둘(2026-11-27). 농사 게임이라 농사 쪽 그림에서 골랐다. Market Price Rage는 "작물값이 뛰어서
  // 화가 난다"는 이름이라 금덩이(Money), Tilling은 "땅을 갈아엎어 균열을 낸다"라 땅이 솟는 그림(RockSpike)이다.
  // RockSpike의 흙색은 복도의 균열 칸(.tile-rift) 색과도 이어진다.
  marketPriceRage: 'Money',
  tilling: 'RockSpike',
}

// 지금 틱에서 untilTick까지 남은 초. 스킬창의 쿨·지속 숫자에 쓴다. 올림이라 "0"은 나오지 않는다 —
// 0.1초가 남아도 1로 보이고, 다 끝나는 틱에 숫자가 사라진다(WoW 액션바 숫자와 같은 방식).
function secondsLeft(tick, untilTick) {
  return Math.ceil((untilTick - tick) / TICKS_PER_SECOND)
}

// 체력 → 막대가 찰 비율(0~100%). 최대치는 부르는 쪽이 넘긴다 — 몬스터는 템플릿, 플레이어는 상태에
// 있어서 사는 곳이 다르다. 0과 100 사이로 자르는 것은 규칙이 바뀌어 체력이 잠깐 음수나 최대치를
// 넘더라도 막대가 틀 밖으로 삐져나가지 않게 하려는 안전장치다.
function hpPercent(hp, max) {
  return Math.min(100, Math.max(0, (hp / max) * 100))
}

// 칸 위쪽의 작은 체력 막대. 바탕(빈 막대)을 깔고 그 위에 빨간 막대를 비율만큼만 보이게 잘라 얹는다.
// 빨간 막대를 줄여 그리지 않고 "잘라서" 보이는 폭만 바꾸는 이유: 그림을 가로로 눌러 버리면 픽셀이
// 정수배가 아니게 되어 뭉개지고, 오른쪽 끝의 테두리 픽셀까지 같이 줄어든다. 잘라 내면 그림은 늘 같은
// 2배 크기 그대로이고 끝만 가려진다. 크기와 그림은 game.css가 맡고, 여기는 비율만 넘긴다.
function MiniHpBar({ hp, max, player = false }) {
  return (
    <div className={player ? 'mini-hp mini-hp-player' : 'mini-hp'}>
      <div className="mini-hp-fill" style={{ width: `${hpPercent(hp, max)}%` }} />
    </div>
  )
}

// 키 → 스킬 id. 방향 키와 같은 이유로 event.code(Digit1)를 쓴다. 키 재설정은 이 표를 바꾸는
// 방식으로 붙일 수 있다(칸 번호와 키를 하나로 묶지 않은 까닭이다).
// 분노를 쓰는 스킬. 1c도 없으면 눌러도 나가지 않아서 슬롯을 어둡게 한다.
const SPENDER_SKILLS = ['overheadSlam', 'whirlingSlash']

const KEY_SKILLS = {
  Digit1: 'furiousThrust',
  Digit2: 'brutalSwing',
  Digit3: 'overheadSlam',
  Digit4: 'whirlingSlash',
  Digit5: 'marketPriceRage',
  Digit6: 'tilling',
}

// 키 → 방향. 방향키와 WASD를 같이 받는다. event.key가 아니라 event.code("KeyW")를
// 쓰는 것은, 한글 입력 상태에서는 W를 눌러도 event.key가 'ㅈ'이 되기 때문이다.
// code는 키보드의 물리 위치라 입력 언어와 상관없다. 키 재설정은 전투 슬라이스에서
// 이 표를 바꾸는 방식으로 붙일 수 있다.
const KEY_DIRECTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

// 남은 초 → 헤더의 타이머 문구. 남아 있으면 "4:37", 제한 시간을 넘기면 넘긴 만큼 "+0:12".
//
// 남은 쪽은 올림, 넘긴 쪽은 내림이다. 그래야 시작 직후(299.9초 남음)가 "4:59"가 아니라 "5:00"이고,
// 0을 지나는 순간 "0:01" → "+0:00"으로 끊김 없이 이어진다. 온실의 formatTime(내림만)과 따로 둔 이유다.
function formatTimer(remainingSeconds) {
  const over = remainingSeconds < 0
  const seconds = over ? Math.floor(-remainingSeconds) : Math.ceil(remainingSeconds)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${over ? '+' : ''}${m}:${String(s).padStart(2, '0')}`
}

// 한 번의 도전. 죽어서 다시 시작하면 이 컴포넌트를 통째로 새로 만든다(맨 아래 Dungeon).
// run은 서버가 열어 준 런(App의 handleEnterDungeon)이고, 클리어를 알릴 때 runId를 쓴다.
function DungeonRun({ templates, run, onLeave, onRetry, onPlayerChange }) {
  // useReducer는 useState의 사촌이다. useState는 화면이 새 값을 직접 끼워 넣지만
  // (setNow(...)), useReducer는 "무슨 일이 일어났는지"만 알리고 다음 상태는
  // 규칙서 함수가 계산한다. 전투 상태는 한 틱에 여러 값이 같이 바뀌므로, 바꾸는
  // 곳을 규칙서 한 곳으로 모으려고 이쪽을 골랐다.
  //
  // 인자 셋: (규칙서 함수, 첫 상태를 만들 재료, 그 재료로 첫 상태를 만드는 함수).
  // 세 번째 함수는 첫 렌더에 한 번만 불린다. createInitialState(...)를 두 번째
  // 자리에 바로 적으면 렌더할 때마다 22마리를 다시 세우고 버리게 된다 —
  // Greenhouse의 useState(() => Date.now())와 같은 이유다.
  //
  // 돌려받는 배열의 둘째 칸 dispatch가 "무슨 일이 일어났다"를 규칙서에 알리는
  // 창구다. 아래 타이머가 이걸 부른다.
  const [state, dispatch] = useReducer(
    combatReducer,
    templates,
    (t) => createInitialState(t.monsters, t.packs),
  )

  // 헤더 타이머의 시계(2026-11-27). 틱 수(state.tick)가 아니라 벽시계(Date.now)로 잰다 —
  // 브라우저는 백그라운드 탭의 1초 미만 interval을 약 1초로 늘려서, 탭을 내리면 틱이 10배 느려진다.
  // 리더보드와 시간 초과 판정은 서버 시계라, 틱으로 재면 화면과 서버가 어긋난다.
  //
  // 시작 시각을 서버의 startTime이 아니라 이 화면이 뜬 순간으로 잡는 이유: 내 컴퓨터 시계와 서버
  // 시계는 몇 초씩 어긋날 수 있다. 이 화면은 enter 응답을 받자마자 뜨므로 차이는 응답이 오는 시간뿐이다.
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)

  // 틱 타이머. 던전 화면이 떠 있는 동안 0.1초마다 "틱이 지났다"고 규칙서에 알린다.
  // 규칙서는 시간을 스스로 재지 않는다 — 이 알람이 울려야만 시간이 흐른다.
  //
  // 클리어하거나 죽으면 알람을 끈다. 그러면 now도 더 이상 바뀌지 않아 헤더 타이머가 그 자리에
  // 멈춘다. 멈춘 시각을 따로 담는 state를 effect에서 고치는 방식은 렌더를 한 번 더 일으켜서
  // lint(react-hooks/set-state-in-effect)가 막는다. 규칙서도 그 뒤로는 상태를 얼리므로 틱이 없어도
  // 잃는 것은 없다. 스킬 키로 마지막 몬스터를 잡으면 시계는 직전 틱(최대 0.1초 전)에 멈춘다.
  useEffect(() => {
    if (state.cleared || state.defeated) return

    // setInterval의 간격은 밀리초다. 100을 직접 적지 않고 초당 틱 수에서 계산해서,
    // 틱 길이를 바꿀 때 이 줄이 따라오게 한다. 같은 콜백 안의 두 갱신은 React가 묶어서
    // 렌더는 한 번만 일어난다.
    const id = setInterval(() => {
      dispatch({ type: 'tick' })
      setNow(Date.now())
    }, 1000 / TICKS_PER_SECOND)

    // 화면을 떠날 때(Abandon run) 알람을 끈다. StrictMode(main.jsx)가 개발 중에
    // "등록 → 정리 → 다시 등록"을 일부러 해서, 여기가 빠지면 알람이 두 개가 되어
    // 캐릭터가 두 배 빨리 걷는다.
    return () => clearInterval(id)
    // 화면이 뜰 때 한 번 등록하고, 끝났을 때 한 번 더 돌아 정리만 하고 빠진다. dispatch와 setNow는
    // React가 렌더마다 바뀌지 않게 보장하는 함수라 목록에 넣을 필요가 없다.
  }, [state.cleared, state.defeated])

  // 키 입력. 키를 누르면 "그 방향으로 가기 시작"(moveStart), 떼면 "멈춤"(moveStop)을
  // 규칙서에 알리기만 한다. 실제로 걷는 것은 위의 틱이다.
  useEffect(() => {
    function handleKeyDown(event) {
      // 스킬 키. 누를 때마다 "이 스킬을 쓰려 한다"고 알린다. 쓸 수 있는지, GCD가 끝났는지, 끝나기
      // 직전이라 기억해 둘지는 규칙서가 정한다. 반복 입력은 걸러서, 키를 꾹 눌러도 한 번만 알린다.
      const skill = KEY_SKILLS[event.code]
      if (skill) {
        event.preventDefault()
        if (event.repeat) return
        dispatch({ type: 'useSkill', skill })
        return
      }

      const direction = KEY_DIRECTIONS[event.code]
      if (!direction) return

      // 방향키는 기본으로 페이지를 스크롤하므로 막는다. 매핑된 키만 막는다.
      event.preventDefault()

      // 키를 계속 누르고 있으면 브라우저가 keydown을 반복해서 보낸다. 시작은 한 번이면
      // 되고, 반복마다 알리면 화면만 쓸데없이 다시 그려진다.
      if (event.repeat) return

      dispatch({ type: 'moveStart', direction })
    }

    function handleKeyUp(event) {
      const direction = KEY_DIRECTIONS[event.code]
      if (!direction) return

      dispatch({ type: 'moveStop', direction })
    }

    // 키를 누른 채 다른 창으로 가면 keyup이 이 창에 오지 않아 캐릭터가 계속 걷는다.
    // 창이 포커스를 잃으면 네 방향을 모두 뗀 것으로 친다. moveStop은 지금 가는 방향과
    // 같을 때만 멈추므로, 안 누르던 방향을 같이 보내도 해가 없다.
    function handleBlur() {
      for (const direction of ['up', 'down', 'left', 'right']) {
        dispatch({ type: 'moveStop', direction })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    // 등록한 것은 같은 함수 참조로 뗀다. 안 떼면 화면을 나갔다 들어올 때마다 리스너가
    // 쌓여서 한 번 누르면 여러 번 알려진다.
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  // complete 요청이 실패한 이유. 보상은 서버가 주므로, 실패하면 받지 못했다는 걸 알려야 한다.
  const [completeError, setCompleteError] = useState(null)

  // complete 응답 그대로. 클리어 줄의 보상 숫자는 gained(이번에 늘어난 양)에서 읽는다 — 보상 규칙은
  // 서버에만 있으므로, 화면이 100이나 5를 따로 알면 규칙이 두 곳에 생긴다. null이면 아직 응답 전이다.
  const [clearResult, setClearResult] = useState(null)

  // 마지막 몬스터가 죽으면(state.cleared) 서버에 클리어를 알리고 보상을 받는다.
  //
  // 입장과 달리 effect에 두는 이유: 클리어는 클릭이 아니라 틱이 만든 상태 변화라서, "이 값이
  // 바뀌었기 때문에" 일어나는 일이다. StrictMode가 effect를 두 번 돌리는 건 화면이 처음 뜰 때뿐이고
  // 그때 cleared는 언제나 false라 요청은 나가지 않는다. 클리어 뒤에는 규칙서가 상태를 얼려서
  // cleared가 다시 바뀌지 않으므로, 요청은 런마다 한 번이다.
  //
  // 죽거나 포기한 런은 여기서 알리지 않는다. 다음 입장이 서버에서 failed로 닫는다(2026-11-27).
  useEffect(() => {
    if (!state.cleared) return

    async function reportClear() {
      try {
        const res = await fetch(`/api/dungeon/${run.runId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cleared: true }),
        })
        const data = await res.json()

        if (!res.ok) {
          setCompleteError(`Rejected: ${data.reason}`)
          return
        }

        // 수확과 같은 모양이라 같은 방식으로 반영한다. gold·stacks는 서버가 계산한 "이제 얼마인가"를
        // 그대로 받는다 — 여기서 100을 더하면 보상 규칙이 두 곳에 생긴다. stacks는 문장을 못 받는
        // 시간 초과 클리어면 빈 배열이라, 줄 수만큼 mergeStack을 차례로 적용한다.
        onPlayerChange((prev) => ({
          ...prev,
          gold: data.gold,
          highestTierCleared: data.highestTierCleared,
          stacks: data.stacks.reduce((stacks, updated) => mergeStack(stacks, updated), prev.stacks),
        }))
        setClearResult(data)
      } catch (err) {
        setCompleteError(`Request failed: ${err.message}`)
      }
    }

    reportClear()
    // runId와 onPlayerChange(App의 setPlayer)는 이 런 동안 바뀌지 않는다. 목록에 넣는 건 effect가
    // 읽는 값을 빠짐없이 적는 규칙 때문이고, 실제로 다시 돌게 만드는 건 cleared 하나다.
  }, [state.cleared, run.runId, onPlayerChange])

  // 헤더 숫자. 둘 다 이미 있는 값에서 계산하고 따로 담지 않는다 — 담으면 원래 값과 어긋날 수 있다.
  // 남은 초는 서버가 enter 때 준 제한 시간(1단 300초)에서 흐른 시간을 뺀 값이다.
  const remainingSeconds = run.timeLimitSeconds - (now - startedAt) / 1000
  // 전체 마릿수는 규칙서가 몬스터를 세운 재료(팩 구성)와 같은 곳에서 센다. 죽은 몬스터는 규칙서가
  // 배열에서 빼므로, 처치 수는 전체에서 남은 수를 뺀 것이다.
  const totalMonsters = templates.packs.reduce((sum, pack) => sum + pack.amount, 0)
  const killed = totalMonsters - state.monsters.length

  // 클리어는 했지만 서버가 아직 기록하지 않은 동안. 이때는 Run again과 헤더의 Leave를 둘 다 막는다 —
  // 서버는 새 런에 들어갈 때 열려 있는 런을 failed로 닫으므로, complete가 도착하기 전에 다시 들어가면
  // 클리어한 런이 실패로 닫혀 보상이 사라질 수 있다. 응답이 오거나(clearResult) 실패하면(completeError)
  // 더 기다릴 것이 없어서 풀어 준다. 따로 담지 않고 세 값에서 계산하는 건 헤더 숫자와 같은 이유다.
  const clearPending = state.cleared && !clearResult && !completeError

  // 클리어 줄의 문장 아이콘. gained.crests는 개수뿐이라, 어떤 문장인지는 같은 응답의 stacks(바뀐 가방
  // 줄)에서 찾는다. 문장을 못 받은 클리어(시간 초과)는 stacks가 비어 있으므로 crests > 0일 때만 찾는다.
  const crestName =
    clearResult && clearResult.gained.crests > 0
      ? templates.stacks.find((s) => s.stackTemplateId === clearResult.stacks[0].stackTemplateId).name
      : null

  const templateOf = (monster) =>
    templates.monsters.find((t) => t.monsterTemplateId === monster.monsterTemplateId)
  const nameOf = (monster) => templateOf(monster).name

  // 선택된 대상. 죽었거나 고른 적이 없으면 undefined다. 체력 최대치는 상태에 없고 템플릿에 있다
  // (상태의 hp는 지금 남은 값이다).
  const target = state.monsters.find((m) => m.id === state.targetId)

  // 카메라. 화면 맨 왼쪽 칸이 복도의 몇 번째 칸(x)인가.
  //
  // 플레이어가 가운데 칸(왼쪽에서 9번째, col 8)에 오도록 플레이어 x에서 반폭만
  // 뺀다. 플레이어가 x = 0이면 음수가 나오는 것이 정상이다 — 복도 밖이 보인다는 뜻.
  // 17 / 2 = 8.5라 내림이 필요하고, 숫자 8을 적지 않고 VIEW_WIDTH에서 계산하는
  // 것은 화면 폭을 바꿨을 때 이 줄이 따라오게 하려는 것이다.
  const viewLeft = state.player.x - Math.floor(VIEW_WIDTH / 2)

  // 17 × 9 = 153칸을 위에서 아래로, 왼쪽에서 오른쪽으로 만든다.
  // col은 화면에서의 칸 번호(0~16), x는 복도에서의 칸 번호다. 둘을 섞지 말 것.
  const tiles = []
  for (let y = 0; y < CORRIDOR_HEIGHT; y++) {
    for (let col = 0; col < VIEW_WIDTH; col++) {
      const x = viewLeft + col

      // 복도는 x = 0 ~ CORRIDOR_LENGTH - 1이다. y는 물을 필요가 없다 — 바깥 for가
      // 복도 높이만큼만 돌기 때문이다.
      const inside = x >= 0 && x < CORRIDOR_LENGTH

      // 복도 좌표(x, y)끼리 비교한다. col을 쓰면 카메라가 움직일 때 엉뚱한 칸에 그려진다.
      const monster = state.monsters.find((m) => m.x === x && m.y === y)

      const isPlayer = x === state.player.x && y === state.player.y

      let className = 'tile'
      if (!inside) className += ' tile-void'
      if (monster) className += ' tile-monster'
      if (monster && monster.id === state.targetId) className += ' tile-target'
      // 출혈은 틱마다 조용히 체력을 깎아서, 표시가 없으면 어느 몬스터에 걸려 있는지 알 길이 없다.
      if (monster && monster.bleed !== null) className += ' tile-bleed'
      if (isPlayer) className += ' tile-player'
      // Brutal Swing이 닿는 6칸을 연하게 보여 준다. 바라보는 방향이 왜 중요한지 눈으로 보이게 하려는 것이다.
      if (inside && inSwingArea(state.player, x, y)) className += ' tile-swing'
      // Whirling Slash를 도는 동안은 틱이 닿는 사거리 1칸(주변 8칸)을 칠한다.
      if (inside && state.channel && !isPlayer && distanceBetween({ x, y }, state.player) <= MELEE_RANGE) {
        className += ' tile-spin'
      }
      // Tilling의 균열(3×3). 피해가 10% 더 들어가는 자리라 "몬스터를 저 안으로 끌어와야 한다"가 한눈에
      // 보여야 한다. 진짜 그림이 오기 전까지는 CSS 무늬로 대신한다. 어느 칸인지는 규칙서의 inRift가
      // 정한다 — 피해 계산과 같은 함수라 칠해진 칸과 실제로 세지는 칸이 어긋나지 않는다. 복도 밖은 균열이
      // 걸쳐도 칠하지 않는다(그 칸에는 아무것도 설 수 없다).
      if (inside && inRift(state, x, y)) className += ' tile-rift'

      tiles.push(
        // key는 복도 좌표(x)가 아니라 화면 좌표(col)다. 걸으면 x는 전부 바뀌지만
        // 화면의 153칸은 그대로라, React가 같은 칸을 재사용하고 내용만 갈아끼운다.
        //
        // 몬스터 칸을 누르면 자동공격 대상으로 고른다(같은 칸을 다시 누르면 해제). 선택이
        // 일어나는 곳은 규칙서다 — 여기는 "이 몬스터를 골랐다"고 알리기만 한다.
        <div
          key={`${col},${y}`}
          className={className}
          onClick={monster ? () => dispatch({ type: 'selectTarget', monsterId: monster.id }) : undefined}
        >
          {isPlayer && <Icon of="head" className="tile-icon" />}
          {/* 몬스터 아이콘은 아직 없다. 이름 첫 글자(F·T·B·S)로 구분한다. */}
          {monster && <span title={nameOf(monster)}>{nameOf(monster)[0]}</span>}
          {/* 체력 막대는 대상으로 고른 몬스터만이 아니라 모두에게 단다 — 헤더의 Target 줄은 한 마리만
              보여 주므로, 범위 스킬로 여럿을 때릴 때 누가 먼저 쓰러질지는 막대로만 보인다. 최대치는
              상태에 없고 템플릿에 있다(상태의 hp는 지금 남은 값). */}
          {monster && <MiniHpBar hp={monster.hp} max={templateOf(monster).hp} />}
          {/* 내 막대는 연두색이다 — 몬스터와 같은 빨강이면 붙어 싸울 때 어느 쪽이 내 체력인지 한눈에 안 갈린다. */}
          {isPlayer && <MiniHpBar hp={state.playerHp} max={state.playerMaxHp} player />}
        </div>,
      )
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Dungeon</h1>
        {/* 클리어한 런은 버리는 게 아니라 끝난 것이라 이름만 바꾼다. 하는 일(onLeave)은 같다. */}
        <button type="button" onClick={onLeave} disabled={clearPending}>
          {state.cleared ? 'Leave' : 'Abandon run'}
        </button>
      </div>

      <section className="dungeon-header">
        <span>Tier {run.tier}</span>
        <span className={remainingSeconds < 0 ? 'overtime' : undefined}>{formatTimer(remainingSeconds)}</span>
        <span>Kills {killed} / {totalMonsters}</span>
        <span>HP {state.playerHp} / {state.playerMaxHp}</span>
      </section>

      <section className="dungeon-header">
        <span>
          {target
            ? `Target: ${nameOf(target)} ${target.hp} / ${templateOf(target).hp}`
            : 'No target'}
        </span>
      </section>

      {/* 클리어를 서버에 알리지 못했을 때만 보인다. 보상은 서버가 주므로 받지 못했다는 뜻이다. */}
      {completeError && <p className="hint">{completeError}</p>}

      {/* 백로그: 죽으면 "Try again"만 보여 주고 페널티는 없다. 나가기는 위의 Abandon run이다. */}
      {state.defeated && (
        <section className="defeat">
          <span>You were defeated.</span>
          <button type="button" onClick={onRetry}>Try again</button>
        </section>
      )}

      {/* 클리어 줄. 죽었을 때의 줄과 같은 자리·같은 모양이라, 런이 어떻게 끝났든 눈이 같은 곳으로 간다.
          보상은 응답이 온 뒤에만 그린다 — 응답 전이나 실패했을 때는 아직 받지 못한 보상이라서다
          (실패 이유는 위의 hint 줄이 보여 준다). */}
      {state.cleared && (
        <section className="cleared">
          <span>Cleared</span>
          {clearResult?.overtime && <span className="overtime">Overtime</span>}
          {clearResult && <span>🪙 +{clearResult.gained.gold}</span>}
          {crestName && (
            <span>
              <Icon of={crestName} className="stack-icon" /> +{clearResult.gained.crests}
            </span>
          )}
          <button type="button" onClick={onRetry} disabled={clearPending}>Run again</button>
        </section>
      )}

      <section className="corridor-frame">
        {/* 칸 수·칸 크기·틈을 CSS에 적지 않고 여기서 넘긴다. 이 숫자들이 두 파일에 적히면
            한쪽만 고쳤을 때 줄이 어긋난다. 줄 높이도 칸 크기로 정해서, 아래 canvas와 높이가 맞는다. */}
        <div
          className="corridor"
          style={{
            gridTemplateColumns: `repeat(${VIEW_WIDTH}, ${TILE_SIZE}px)`,
            gridAutoRows: `${TILE_SIZE}px`,
            gap: `${TILE_GAP}px`,
          }}
        >
          {tiles}
        </div>
        {/* 복도 위에 겹친 이펙트 층. 사건과, 사건이 가리키는 칸을 찾는 데 필요한 것만 넘긴다. */}
        <EffectLayer
          events={state.events}
          monsters={state.monsters}
          player={state.player}
          viewLeft={viewLeft}
          columns={VIEW_WIDTH}
          tile={TILE_SIZE}
          gap={TILE_GAP}
        />
      </section>

      <section>
        {/* 분노(Rage) 바. 다섯 칸으로 세는 자원이라 칸을 나눠 그린다. */}
        <div className="rage-bar">
          {/* 분노는 정수 단위(1c = 10)라, 칸 i가 차려면 (i + 1)c 이상이어야 한다. */}
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={state.rage >= (i + 1) * 10 ? 'rage-cell rage-cell-full' : 'rage-cell'}
            />
          ))}
        </div>

        <ul className="slot-row">
          {SKILL_SLOTS.map((n) => {
            // 스킬이 놓인 칸은 색을 입히고, 지금 눌러도 소용없는 동안은 어둡게 한다.
            //
            // GCD가 끝나기 QUEUE_WINDOW_TICKS 전부터는 눌러도 받아 주고(끝나는 틱에 나간다) 연타와
            // 같은 속도가 나오므로, 그 시점에 밝힌다. GCD가 완전히 끝난 뒤에야 밝히면 밝아진 걸 보고
            // 누르는 사람은 반응 시간만큼 늦어서, 연타가 더 빠른 구조가 된다(2026-11-17 직접 눌러 확인).
            const skill = SLOT_SKILLS[n]
            // 쿨기(5·6번)면 그 스킬의 { endTick, readyTick }, 아니면 null. 빈 칸(skill이 undefined)도 null이다.
            const cooldown = COOLDOWN_SKILLS[skill] ? state[skill] : null
            // 지속(15초)이 쿨(30·60초)보다 짧아서, 효과가 켜져 있는 동안은 언제나 쿨도 돌고 있다.
            const active = cooldown !== null && state.tick < cooldown.endTick
            const onCooldown = cooldown !== null && state.tick < cooldown.readyTick
            let className = 'skill-key'
            if (skill) className += ' skill-key-bound'
            // 쿨기는 GCD를 쓰지 않아 GCD 중에도 바로 나간다(규칙서 castCooldown). 같이 어두워지면 "지금은
            // 못 쓴다"로 읽혀서 누를 수 있는 순간을 놓치므로, GCD 표시에서 뺀다.
            if (skill && !cooldown && state.gcdReadyTick - state.tick > QUEUE_WINDOW_TICKS) {
              className += ' skill-key-gcd'
            }
            // 스펜더는 분노가 1c도 없으면 눌러도 나가지 않으므로, GCD와 상관없이 어둡게 한다.
            // 이때는 아이콘도 팩의 회색판으로 바꾼다. 어둡게 하는 것(opacity)은 GCD와 같은 표시라
            // "곧 밝아진다"로 읽히지만, 회색은 "분노가 모자라 지금은 못 쓴다"는 다른 이유를 보여 준다.
            const noRage = SPENDER_SKILLS.includes(skill) && state.rage < RAGE_PER_POINT
            if (noRage) className += ' skill-key-gcd'
            // 효과가 켜져 있으면 칸을 빛나게 한다. 버프와 균열은 눈에 보이는 몸체가 없어서(균열은 칸이
            // 칠해지지만 버프는 아무 데도 안 보인다) 스킬창이 "지금 켜져 있다"를 알려 줘야 한다.
            if (active) className += ' skill-key-active'

            // 칸 가운데 숫자는 하나만 둔다. 켜져 있는 동안은 효과가 꺼질 때까지, 꺼진 뒤에는 다시 쓸 수
            // 있을 때까지의 초다. 둘을 같이 띄우면 44px 칸에 숫자 두 개가 붙어 어느 쪽인지 헷갈린다. 어느
            // 숫자인지는 칸이 알려 준다 — 빛나는 원래 색 칸이면 효과, 회색 칸이면 쿨이다. 숫자 색으로 나누는
            // 것도 해 봤지만 금색 숫자가 금덩이·흙색 아이콘 위에서 묻혀서 흰색 하나로 두었다(2026-11-27 화면 확인).
            let timer = null
            if (active) timer = secondsLeft(state.tick, cooldown.endTick)
            else if (onCooldown) timer = secondsLeft(state.tick, cooldown.readyTick)
            // 회색판은 "지금 눌러도 안 나간다"는 뜻이다. 켜져 있는 동안도 쿨이라 못 누르지만, 그때 회색이면
            // 빛나는 테두리와 반대 뜻이 한 칸에 겹친다 — 켜진 동안은 원래 색을 두고, 꺼진 뒤 쿨만 남았을 때 회색으로 바꾼다.
            const greyIcon = noRage || (onCooldown && !active)

            return (
              <li key={n} className={className} title={skill ? SKILL_LABELS[skill] : undefined}>
                {/* alt는 비운다. 이름은 칸의 title이 이미 알려 주고, 그림이 안 뜰 때 이름이 칸 안에
                    글자로 튀어나오면 칸이 깨진다. */}
                {skill && (
                  <img
                    className="skill-icon"
                    src={`/art/${SKILL_ICONS[skill]}${greyIcon ? 'Disabled' : ''}.png`}
                    alt=""
                  />
                )}
                {timer !== null && (
                  <span className="skill-key-timer">{timer}</span>
                )}
                {/* 칸 번호 = 누를 키. 아이콘이 칸 가운데를 차지해서 구석에 작게 둔다. */}
                <span className="skill-key-number">{n}</span>
              </li>
            )
          })}
        </ul>

      </section>
    </div>
  )
}

function Dungeon({ templates, run, onLeave, onRetry, onPlayerChange }) {
  // key가 바뀌면 React는 DungeonRun을 지우고 새로 만들어서, 상태(체력·몬스터·위치)와 타이머가
  // 전부 처음으로 돌아간다. 상태를 되돌리는 reset 이벤트를 따로 만들지 않아도 되는 가장 짧은
  // 방법이다. Try again은 서버에 새 런을 열고 새 runId를 받으므로, 그 id를 key로 쓰면 도전 횟수를
  // 따로 세지 않아도 된다(2026-11-27, 예전에는 attempt 카운터였다).
  return (
    <DungeonRun
      key={run.runId}
      templates={templates}
      run={run}
      onLeave={onLeave}
      onRetry={onRetry}
      onPlayerChange={onPlayerChange}
    />
  )
}

export default Dungeon
