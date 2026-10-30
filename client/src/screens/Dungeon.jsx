// 던전. 위쪽 헤더에 단수·남은 시간·진행도, 가운데 복도, 아래 분노 바와 스킬창.
//
// 이 파일은 화면이다. 무엇이 어떻게 움직이는지는 combat/rules.js(규칙서)가
// 정하고, 여기는 그 상태를 받아 그리기만 한다. 규칙서는 화면이 몇 칸인지
// 모른다 — 그래서 "복도의 어느 구간을 보여줄까"(카메라)는 이쪽 일이다.
//
// 헤더와 스킬창의 숫자는 아직 자리를 채우는 값이다.

import { useReducer } from 'react'
import Icon from '../components/Icon.jsx'
import {
  combatReducer,
  createInitialState,
  CORRIDOR_HEIGHT,
  CORRIDOR_LENGTH,
} from '../combat/rules.js'

// 화면에 보이는 가로 칸 수. 플레이어가 가운데 서고 앞뒤로 8칸씩 보인다
// (백로그 Dungeon space). 홀수여야 "가운데 칸"이 생긴다.
const VIEW_WIDTH = 17

const SKILL_SLOTS = [1, 2, 3, 4, 5, 6, 7]

function Dungeon({ templates, onLeave }) {
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
  // 돌려받는 배열의 둘째 칸(dispatch)은 아직 안 꺼낸다. 일을 알릴 곳이 생기는
  // 다음 조각(틱)에서 꺼낸다.
  //
  const [state] = useReducer(
    combatReducer,
    templates,
    (t) => createInitialState(t.monsters, t.packs),
  )

  const nameOf = (monster) =>
    templates.monsters.find((t) => t.monsterTemplateId === monster.monsterTemplateId).name

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
      if (isPlayer) className += ' tile-player'

      tiles.push(
        // key는 복도 좌표(x)가 아니라 화면 좌표(col)다. 걸으면 x는 전부 바뀌지만
        // 화면의 153칸은 그대로라, React가 같은 칸을 재사용하고 내용만 갈아끼운다.
        <div key={`${col},${y}`} className={className}>
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
      </section>

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
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rage-cell" />
          ))}
        </div>

        <ul className="slot-row">
          {SKILL_SLOTS.map((n) => (
            <li key={n} className="skill-key">{n}</li>
          ))}
        </ul>

        <div className="placeholder">
          Skills, consumables, and key rebinding come with the combat slice.
        </div>
      </section>
    </div>
  )
}

export default Dungeon
