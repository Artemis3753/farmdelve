// 은신처. 손그림에서는 창고·인벤토리·장비창을 한 화면에 합쳐뒀다 —
// 좌우에 장비 슬롯과 스탯, 가운데 캐릭터, 아래에 10×3 가방.
//
// 오늘은 배치만 세운다. 우클릭으로 장착하는 동작과 가방 내용물은 장착 API가
// 생긴 다음이다.
function Shelter({ templates, player, onLeave }) {
  const slots = ['head', 'chest', 'legs', 'feet', 'weapon']

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Shelter</h1>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>

      <section>
        <h2>Equipment</h2>
        <ul className="slot-row">
          {slots.map((slot) => {
            const id = player.equipped[slot]
            const gear = player.gear.find((g) => g.gearInstanceId === id)
            const template =
              gear && templates.gear.find((t) => t.gearTemplateId === gear.gearTemplateId)

            return (
              <li key={slot} className={`slot${gear ? '' : ' slot-empty'}`}>
                <span className="slot-name">{slot}</span>
                {template
                  ? `${template.name}${gear.upgradeLevel > 0 ? ` +${gear.upgradeLevel}` : ''}`
                  : '—'}
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2>Bag</h2>
        {/* 10×3 = 30칸. 지금은 빈 칸만 그린다 — 가방에 들어갈 물건을 서버가
            아직 구분해 주지 않는다. 재료는 stacks에 있지만 장비는 "장착 안 된
            것"이라는 개념이 없어서, 그 구분이 장착 API와 함께 정해진다. */}
        <div className="bag">
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} className="bag-cell" />
          ))}
        </div>
      </section>

      <section>
        <h2>Materials</h2>
        <ul>
          {templates.stacks.map((s) => {
            const held = player.stacks.find((x) => x.stackTemplateId === s.stackTemplateId)
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
