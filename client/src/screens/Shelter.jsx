import { useState } from 'react'

const SLOTS = ['head', 'chest', 'legs', 'feet', 'weapon']

// 이미지가 생기기 전까지 쓰는 자리 표시. 슬롯 단위라서 같은 칸에 들어가는 장비는
// 전부 같은 그림이 되는데, 드랍으로 종류가 늘면 그때는 gear_template에 icon
// 컬럼이 필요해진다 — stack_template이 이미 그렇게 하고 있다.
const SLOT_ICONS = {
  head: '👒',
  chest: '👕',
  legs: '👖',
  feet: '🥾',
  // 낫 이모지는 없다. 🌾는 Harvest Crest가 이미 쓰고 있어서 재료와 헷갈린다.
  weapon: '⚔️',
}

// 은신처. 손그림에서는 창고·인벤토리·장비창을 한 화면에 합쳐뒀다 —
// 좌우에 장비 슬롯과 스탯, 가운데 캐릭터, 아래에 가방.
//
// 장착은 우클릭이다. 백로그는 끌어다 놓기로 정해뒀지만 2026-08-31에 뒤집었다.
// 그 규칙의 근거는 "두 화면에서 상호작용을 하나로 통일"이었는데, 우클릭도 그
// 성질을 그대로 만족하면서 구현이 훨씬 가볍다.
function Shelter({ templates, player, onPlayerChange, onLeave }) {
  const [message, setMessage] = useState(null)

  const templateOf = (gear) =>
    templates.gear.find((t) => t.gearTemplateId === gear.gearTemplateId)

  const label = (gear) => {
    const t = templateOf(gear)
    return `${t.name}${gear.upgradeLevel > 0 ? ` +${gear.upgradeLevel}` : ''}`
  }

  // 다섯 칸 어디에도 들어 있지 않은 장비가 곧 가방에 있는 것이다. 가방 테이블이
  // 따로 없는 설계가 화면에서는 이 한 줄로 나타난다.
  //
  // Set은 "있는지 없는지"만 빠르게 묻는 자료구조다. 배열로 두고 includes를
  // 써도 되지만, 장비가 늘어나면 매번 훑게 된다.
  const equippedIds = new Set(Object.values(player.equipped))
  const bagGear = player.gear.filter((g) => !equippedIds.has(g.gearInstanceId))

  async function handleEquip(gearInstanceId) {
    setMessage(null)

    try {
      const res = await fetch(`/api/gear/${gearInstanceId}/equip`, {
        method: 'PUT',
      })
      const data = await res.json()

      if (!res.ok) {
        setMessage(`Rejected: ${data.reason}`)
        return
      }

      // 서버는 바뀐 칸 하나만 알려준다 — { slot, gearInstanceId }.
      //
      // equipped의 그 칸만 갈아끼운다. 어느 칸인지는 data.slot이 말해주는데,
      // 그 값을 키로 쓰려면 점 표기법이 아니라 대괄호가 필요하다.
      //
      // 원래 그 칸에 있던 장비는 지울 필요가 없다. 덮이는 순간 equippedIds에서
      // 빠지고, 위의 filter가 그것을 가방으로 옮겨 그린다.
      onPlayerChange((prev) => ({
        ...prev,
        equipped: { ...prev.equipped, [data.slot]: data.gearInstanceId },
      }))
    } catch (err) {
      setMessage(`Request failed: ${err.message}`)
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Shelter</h1>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>

      <section>
        <h2>Equipment</h2>
        <ul className="slot-row">
          {SLOTS.map((slot) => {
            const gear = player.gear.find(
              (g) => g.gearInstanceId === player.equipped[slot],
            )

            return (
              <li key={slot} className={`slot${gear ? '' : ' slot-empty'}`}>
                <span className="slot-name">{slot}</span>
                {gear ? label(gear) : '—'}
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2>Bag</h2>
        <p className="hint">Right-click a piece to equip it.</p>

        {/* 10×3 = 30칸. 앞쪽부터 가방 속 장비로 채우고 나머지는 빈 칸이다.
            재료는 여기 안 들어간다 — 아래 목록으로 따로 센다. */}
        <div className="bag">
          {Array.from({ length: 30 }, (_, i) => {
            const gear = bagGear[i]

            if (!gear) return <div key={i} className="bag-cell" />

            return (
              <button
                key={i}
                type="button"
                className="bag-cell bag-item"
                // 브라우저 기본 우클릭 메뉴를 막지 않으면 그것이 대신 뜬다.
                onContextMenu={(e) => {
                  e.preventDefault()
                  handleEquip(gear.gearInstanceId)
                }}
                title={label(gear)}
              >
                {SLOT_ICONS[templateOf(gear).slot]}
              </button>
            )
          })}
        </div>

        {message && <p>{message}</p>}
      </section>

      <section>
        <h2>Materials</h2>
        <ul>
          {templates.stacks.map((s) => {
            const held = player.stacks.find(
              (x) => x.stackTemplateId === s.stackTemplateId,
            )
            return (
              <li key={s.stackTemplateId}>
                {s.icon} {s.name} — {held?.amount ?? 0}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

export default Shelter
