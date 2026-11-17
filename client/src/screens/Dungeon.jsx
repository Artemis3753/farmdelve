// 던전. 위쪽 헤더에 단수·남은 시간·진행도, 가운데 복도, 아래 분노 바와 스킬창.
//
// 이 파일은 화면이다. 무엇이 어떻게 움직이는지는 combat/rules.js(규칙서)가
// 정하고, 여기는 그 상태를 받아 그리기만 한다. 규칙서는 화면이 몇 칸인지
// 모른다 — 그래서 "복도의 어느 구간을 보여줄까"(카메라)는 이쪽 일이다.
//
// 헤더와 스킬창의 숫자는 아직 자리를 채우는 값이다.

import { useEffect, useReducer, useState } from 'react'
import Icon from '../components/Icon.jsx'
import {
  combatReducer,
  createInitialState,
  CORRIDOR_HEIGHT,
  CORRIDOR_LENGTH,
  QUEUE_WINDOW_TICKS,
  TICKS_PER_SECOND,
} from '../combat/rules.js'

// 화면에 보이는 가로 칸 수. 플레이어가 가운데 서고 앞뒤로 8칸씩 보인다
// (백로그 Dungeon space). 홀수여야 "가운데 칸"이 생긴다.
const VIEW_WIDTH = 17

const SKILL_SLOTS = [1, 2, 3, 4, 5, 6, 7]

// 칸 번호 → 그 칸에 놓인 스킬. 지금은 1번 칸의 Furious Thrust 하나뿐이고 나머지는 비어 있다.
// 칸에 마우스를 올리면 이름이 보이게 title로 쓴다.
const SLOT_SKILLS = { 1: 'furiousThrust' }
const SKILL_LABELS = { furiousThrust: 'Furious Thrust' }

// 키 → 스킬 id. 방향 키와 같은 이유로 event.code(Digit1)를 쓴다. 키 재설정은 이 표를 바꾸는
// 방식으로 붙일 수 있다(칸 번호와 키를 하나로 묶지 않은 까닭이다).
const KEY_SKILLS = { Digit1: 'furiousThrust' }

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

// 한 번의 도전. 죽어서 다시 시작하면 이 컴포넌트를 통째로 새로 만든다(맨 아래 Dungeon).
function DungeonRun({ templates, onLeave, onRetry }) {
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

  // 틱 타이머. 던전 화면이 떠 있는 동안 0.1초마다 "틱이 지났다"고 규칙서에 알린다.
  // 규칙서는 시간을 스스로 재지 않는다 — 이 알람이 울려야만 시간이 흐른다.
  useEffect(() => {
    // setInterval의 간격은 밀리초다. 100을 직접 적지 않고 초당 틱 수에서 계산해서,
    // 틱 길이를 바꿀 때 이 줄이 따라오게 한다.
    const id = setInterval(() => {
      dispatch({ type: 'tick' })
    }, 1000 / TICKS_PER_SECOND)

    // 화면을 떠날 때(Abandon run) 알람을 끈다. StrictMode(main.jsx)가 개발 중에
    // "등록 → 정리 → 다시 등록"을 일부러 해서, 여기가 빠지면 알람이 두 개가 되어
    // 캐릭터가 두 배 빨리 걷는다.
    return () => clearInterval(id)
    // 빈 배열 = 화면이 뜰 때 한 번만 등록. dispatch는 React가 렌더마다 바뀌지 않게
    // 보장하는 함수라 목록에 넣을 필요가 없다.
  }, [])

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
      if (isPlayer) className += ' tile-player'

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
        </div>,
      )
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Dungeon</h1>
        <button type="button" onClick={onLeave}>Abandon run</button>
      </div>

      <section className="dungeon-header">
        <span>Tier 1</span>
        <span>10:00</span>
        <span>Pulls 0 / 5</span>
        <span>HP {state.playerHp} / {state.playerMaxHp}</span>
      </section>

      <section className="dungeon-header">
        <span>
          {target
            ? `Target: ${nameOf(target)} ${target.hp} / ${templateOf(target).hp}`
            : 'No target — click a monster'}
        </span>
      </section>

      {/* 백로그: 죽으면 "Try again"만 보여 주고 페널티는 없다. 나가기는 위의 Abandon run이다. */}
      {state.defeated && (
        <section className="defeat">
          <span>You were defeated.</span>
          <button type="button" onClick={onRetry}>Try again</button>
        </section>
      )}

      <section>
        {/* 가로 칸 수를 CSS에 적지 않고 여기서 넘긴다. 17이 두 파일에 적히면
            한쪽만 고쳤을 때 줄이 어긋난다. */}
        <div
          className="corridor"
          style={{ gridTemplateColumns: `repeat(${VIEW_WIDTH}, 1fr)` }}
        >
          {tiles}
        </div>
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
            let className = 'skill-key'
            if (skill) className += ' skill-key-bound'
            if (skill && state.gcdReadyTick - state.tick > QUEUE_WINDOW_TICKS) className += ' skill-key-gcd'

            return (
              <li key={n} className={className} title={skill ? SKILL_LABELS[skill] : undefined}>
                {n}
              </li>
            )
          })}
        </ul>

        <div className="placeholder">
          Skills, consumables, and key rebinding come with the combat slice.
        </div>
      </section>
    </div>
  )
}

function Dungeon({ templates, onLeave }) {
  // 몇 번째 도전인가. key가 바뀌면 React는 DungeonRun을 지우고 새로 만들어서, 상태(체력·
  // 몬스터·위치)와 타이머가 전부 처음으로 돌아간다. 상태를 되돌리는 reset 이벤트를
  // 따로 만들지 않아도 되는 가장 짧은 방법이다.
  const [attempt, setAttempt] = useState(0)

  return (
    <DungeonRun
      key={attempt}
      templates={templates}
      onLeave={onLeave}
      onRetry={() => setAttempt(attempt + 1)}
    />
  )
}

export default Dungeon
