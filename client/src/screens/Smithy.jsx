import { useState } from 'react'

const SLOTS = ['weapon', 'head', 'chest', 'legs', 'feet']

// 대장간. 손그림에서는 위쪽에 "지금 → 강화 후"를 나란히 놓고, 아래쪽 다섯 칸에서
// 강화할 장비를 고르는 구조였다. 오늘은 아래 다섯 칸과 강화 실행까지 만들고,
// before/after 미리보기 자리는 비워둔다.
//
// 데이터는 받아서 쓰기만 한다. 서버에 다녀오는 일은 여기서 하지만, 그 결과로
// 바뀐 player를 어떻게 보관할지는 App이 정한다 — onPlayerChange로 올려보낸다.
function Smithy({ templates, player, onPlayerChange, onLeave }) {
  // 어느 칸의 장비를 강화 중인지. 손그림의 "위로 올려둔 아이템"에 해당한다.
  const [selectedSlot, setSelectedSlot] = useState('weapon')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const instanceId = player.equipped[selectedSlot]
  const gear = player.gear.find((g) => g.gearInstanceId === instanceId)
  const gearTemplate = gear
    ? templates.gear.find((t) => t.gearTemplateId === gear.gearTemplateId)
    : null

  const nextLevel = gear ? gear.upgradeLevel + 1 : null
  const cost = templates.upgrades.find((u) => u.upgradeLevel === nextLevel)

  const stackOf = (id) => templates.stacks.find((s) => s.stackTemplateId === id)
  const heldOf = (id) => player.stacks.find((s) => s.stackTemplateId === id)?.amount ?? 0

  const needed = cost
    ? [
        { id: cost.crestStackTemplateId, need: cost.crestAmount },
        { id: cost.materialStackTemplateId, need: cost.materialAmount },
      ]
    : []

  const short = needed.some((m) => heldOf(m.id) < m.need)

  async function handleUpgrade() {
    setBusy(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/gear/${gear.gearInstanceId}/upgrade`, {
        method: 'POST',
      })
      const data = await res.json()

      // 409나 404는 fetch 입장에서 실패가 아니다. 응답이 정상적으로 도착했으므로
      // catch로 가지 않는다 — 상태 코드는 res.ok로 직접 봐야 한다.
      if (!res.ok) {
        setMessage(`Rejected: ${data.reason}`)
        return
      }

      onPlayerChange((prev) => ({
        ...prev,
        gear: prev.gear.map((g) =>
          g.gearInstanceId === data.gear.gearInstanceId
            ? { ...g, upgradeLevel: data.gear.upgradeLevel }
            : g,
        ),
        // 응답의 stacks에는 이번에 바뀐 재료만 들어 있다. 기존 목록을 훑으면서
        // 바뀐 것이 있으면 갈아끼우고, 없으면 원래 것을 그대로 둔다.
        stacks: prev.stacks.map((s) => {
          const changed = data.stacks.find(
            (c) => c.stackTemplateId === s.stackTemplateId,
          )
          return changed ?? s
        }),
      }))

      setMessage(
        data.upgraded ? 'Upgrade succeeded' : 'Upgrade failed — materials were spent',
      )
    } catch (err) {
      setMessage(`Request failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Smithy</h1>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>

      <section>
        <div className="placeholder">
          Before / after preview goes here — the stat gain is computed on the
          client, while the roll and the write stay on the server.
        </div>
      </section>

      <section>
        <h2>
          {gearTemplate
            ? `${gearTemplate.name}${gear.upgradeLevel > 0 ? ` +${gear.upgradeLevel}` : ''}`
            : 'Nothing equipped in this slot'}
        </h2>

        {gearTemplate && (
          <p>Attack power {gearTemplate.baseAttackPower}</p>
        )}

        {gear && cost && (
          <>
            <p>Attempt +{nextLevel} · {cost.successRate}% success</p>
            <ul>
              {needed.map((m) => {
                const stack = stackOf(m.id)
                const held = heldOf(m.id)
                return (
                  <li key={m.id}>
                    {stack.icon} {stack.name} — {m.need} needed / {held} held
                    {held < m.need && ' (short)'}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {gear && !cost && <p>Already at the maximum upgrade level.</p>}

        <button
          type="button"
          onClick={handleUpgrade}
          disabled={busy || short || !cost || !gear}
        >
          Upgrade
        </button>

        {message && <p>{message}</p>}
      </section>

      <section>
        <h2>Equipped</h2>
        {/* 손그림 아래쪽의 다섯 칸. 누르면 위쪽 강화 대상이 바뀐다. */}
        <ul className="slot-row">
          {SLOTS.map((slot) => {
            const id = player.equipped[slot]
            const g = player.gear.find((x) => x.gearInstanceId === id)
            const t = g && templates.gear.find((x) => x.gearTemplateId === g.gearTemplateId)

            return (
              <li key={slot}>
                <button
                  type="button"
                  className={`slot${g ? '' : ' slot-empty'}`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  <span className="slot-name">{slot}</span>
                  {t ? `${t.name}${g.upgradeLevel > 0 ? ` +${g.upgradeLevel}` : ''}` : '—'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

export default Smithy
