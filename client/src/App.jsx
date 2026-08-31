import { useEffect, useState } from 'react'

function App() {
  // 정적 정의(이름·아이콘·비용표)와 내 상태(장비·재료)를 따로 들고 있는다.
  // 서버에서 두 엔드포인트로 나눠 받은 경계를 화면에서도 그대로 유지하는 것이다.
  const [templates, setTemplates] = useState(null)
  const [player, setPlayer] = useState(null)
  const [error, setError] = useState(null)

  // 요청이 날아가 있는 동안 버튼을 잠그는 데 쓴다. 이게 없으면 연타로 요청이
  // 겹치는데, 서버는 FOR UPDATE로 막아내지만 화면이 중간 상태를 덮어쓸 수 있다.
  const [busy, setBusy] = useState(false)

  // 마지막 강화의 결과. 성공/실패/거절을 한 줄로 보여주려고 따로 둔다.
  const [message, setMessage] = useState(null)

  useEffect(() => {
    // 서비스 쪽에서 쓴 Promise.all과 같은 도구다. 두 요청이 서로를 기다릴 이유가
    // 없으므로 동시에 띄우고 둘 다 도착했을 때 화면을 그린다.
    Promise.all([
      fetch('/api/templates').then((res) => res.json()),
      fetch('/api/player').then((res) => res.json()),
    ])
      .then(([templateData, playerData]) => {
        setTemplates(templateData)
        setPlayer(playerData)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <main><h1>FarmDelve</h1><p>Could not load: {error}</p></main>
  if (!templates || !player) return <main><h1>FarmDelve</h1><p>Loading...</p></main>

  // 장착한 무기를 찾는다. equipped를 객체로 접어둔 덕분에 여기가 한 줄이다.
  const weapon = player.gear.find((g) => g.gearInstanceId === player.equipped.weapon)
  const weaponTemplate = templates.gear.find(
    (t) => t.gearTemplateId === weapon.gearTemplateId,
  )

  // 비용표의 한 행은 "n-1에서 n으로 올리는 값"이라 지금 단계가 아니라 목표
  // 단계로 찾는다. upgrade.js의 targetLevel과 같은 계산이다.
  const nextLevel = weapon.upgradeLevel + 1

  // +10이면 비용표에 해당 행이 없어서 undefined가 된다. 그걸 만렙 판정에 쓴다.
  const cost = templates.upgrades.find((u) => u.upgradeLevel === nextLevel)

  // 재료 id로 정의와 보유량을 찾는 두 도우미.
  const stackOf = (id) => templates.stacks.find((s) => s.stackTemplateId === id)

  // 보유량이 0이 되면 player_stack의 행 자체가 사라진다. 그래서 목록에서 못
  // 찾았다는 것은 0개를 가졌다는 뜻이다.
  const heldOf = (id) => player.stacks.find((s) => s.stackTemplateId === id)?.amount ?? 0

  // 이번 강화에 드는 재료 두 종류를 한 배열로 묶는다. 화면에서 같은 모양으로
  // 그리고, 아래 부족 판정에서도 같이 훑는다.
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
      const res = await fetch(`/api/gear/${weapon.gearInstanceId}/upgrade`, {
        method: 'POST',
      })
      const data = await res.json()

      // 409나 404는 fetch 입장에서 실패가 아니다. 응답이 정상적으로 도착했으므로
      // catch로 가지 않는다 — 상태 코드는 res.ok로 직접 봐야 한다.
      if (!res.ok) {
        setMessage(`Rejected: ${data.reason}`)
        return
      }

      // 서버가 돌려준 것으로 로컬 상태를 고친다. 다시 GET 하지 않는 것이
      // 응답에 gear와 stacks를 함께 실은 이유다.
      setPlayer((prev) => ({
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

      setMessage(data.upgraded ? 'Upgrade succeeded' : 'Upgrade failed — materials were spent')
    } catch (err) {
      setMessage(`Request failed: ${err.message}`)
    } finally {
      // 성공하든 실패하든 버튼은 풀어준다. upgrade.js의 client.release()와 같은
      // 이유로 finally에 둔다 — 중간에 빠져나가도 반드시 실행된다.
      setBusy(false)
    }
  }

  return (
    <main>
      <h1>FarmDelve</h1>

      <section>
        <h2>
          {weaponTemplate.name}
          {weapon.upgradeLevel > 0 && ` +${weapon.upgradeLevel}`}
        </h2>
        <p>
          Attack power {weaponTemplate.baseAttackPower} · Item level{' '}
          {weaponTemplate.baseItemLevel + weapon.upgradeLevel * 5}
        </p>
      </section>

      <section>
        <h3>Upgrade</h3>
        {cost ? (
          <>
            <p>
              Attempt +{nextLevel} · {cost.successRate}% success
            </p>
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
        ) : (
          <p>Already at the maximum upgrade level.</p>
        )}

        {/* 요청 중이거나, 재료가 모자라거나, 더 올릴 단계가 없으면 잠근다. */}
        <button type="button" onClick={handleUpgrade} disabled={busy || short || !cost}>
          Upgrade
        </button>

        {message && <p>{message}</p>}
      </section>

      <section>
        <h3>Materials</h3>
        <ul>
          {templates.stacks.map((s) => (
            <li key={s.stackTemplateId}>
              {s.icon} {s.name} — {heldOf(s.stackTemplateId)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
