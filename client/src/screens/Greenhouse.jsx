import { useState, useEffect } from 'react'

// 온실. 심고 거두는 일이 전부 여기서 일어난다 — 메인 화면에 보이는 밭은
// 들어오는 문이고, 실제 작업대는 이 화면이다(백로그 2026-08-26에 갈라짐).
//
// 오늘은 심기까지다. 거두기는 다음 단계다.

function Greenhouse({ templates, player, onPlayerChange, onLeave }) {
  // 시간이 흐르는 것은 React 입장에서 아무 사건도 아니다. 아무도 알려주지 않으면
  // 다시 그릴 이유가 없어서 남은 시간이 멈춰 있다. 그래서 "지금"을 state에 담고
  // 1초마다 갈아끼운다 — 시간의 흐름을 React가 아는 사건으로 번역하는 것이다.
  //
  // 초기값을 Date.now()가 아니라 () => Date.now()로 넘긴다. 앞의 모양은 render
  // 중에 호출되어 순수성 규칙에 걸리지만, 화살표로 감싸면 React가 첫 렌더에 한 번
  // 불러 쓰고 만다. 린트로 둘을 직접 돌려서 확인한 결과다.
  const [now, setNow] = useState(() => Date.now())

  // 손에 든 씨앗. 객체가 아니라 id 하나만 담는다 — 작물 정보가 필요하면 cropOf로
  // 찾으면 되고, 그래야 같은 사실이 templates와 state 두 곳에 생기지 않는다.
  //
  // 심고 나서도 풀지 않는다. 밭이 25칸이라 같은 작물을 여러 칸에 잇달아 심는 것이
  // 기본 동작이기 때문이다.
  const [selectedCropId, setSelectedCropId] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    // setInterval이 돌려주는 id를 받아둬야 한다. 없으면 멈출 방법이 사라진다.
    const id = setInterval(() => setNow(Date.now()), 1000)

    // StrictMode가 개발 중에 이 effect를 일부러 두 번 돌린다 — 정리를 빠뜨린
    // 코드를 즉시 드러내려는 장치다. 정리하지 않으면 화면에 들어간 순간부터
    // 타이머가 2개고, Leave 후 다시 들어올 때마다 늘어난다. 사라진 화면을
    // 갱신하려는 호출이라 에러도 경고도 없이 조용히 쌓인다.
    return () => clearInterval(id)
  }, [])
  // ↑ 빈 배열이라 처음 한 번만 실행된다. 타이머는 한 번만 걸면 되기 때문이다.

  // crop_template에는 이름도 아이콘도 없다. 밭 한 칸을 그리려면 작물 정의를
  // 거쳐 수확물 아이템까지 한 번 더 건너가야 하는 이유가 그것이다 — 감자의
  // 이름과 그림을 stack_template 한 곳에만 두기로 한 대가다.
  const cropOf = (id) => templates.crops.find((c) => c.cropTemplateId === id)
  const stackOf = (id) => templates.stacks.find((s) => s.stackTemplateId === id)
  const heldOf = (id) =>
    player.stacks.find((s) => s.stackTemplateId === id)?.amount ?? 0

  // 남은 초를 "2:14" 모양으로 만든다. 초가 한 자리일 때 "2:4"가 되지 않도록
  // 두 자리를 0으로 채운다.
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // 빈 칸 하나에 손에 든 씨앗을 심는다.
  //
  // 어느 씨앗이 들어가는지는 보내지 않는다. crop_template이 정하는 값이라 서버가
  // 읽는다 — 장착에서 슬롯을 서버가 읽기로 한 것과 같은 이유다.
  async function handlePlant(plotNumber) {
    setMessage(null)

    try {
      const res = await fetch(`/api/plots/${plotNumber}/plant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cropTemplateId: selectedCropId }),
      })
      const data = await res.json()

      // 409나 404는 fetch 입장에서 실패가 아니다. 응답이 정상적으로 도착했으므로
      // catch로 가지 않는다 — 상태 코드는 res.ok로 직접 봐야 한다.
      if (!res.ok) {
        setMessage(`Rejected: ${data.reason}`)
        return
      }

      // 서버 DB가 바뀌었다고 화면이 아는 것은 아니다. 응답으로 받은 것을 내 손의
      // player에도 반영해야 새로고침 없이 밭에 나타난다.
      //
      // 응답에는 바뀐 것만 실려 온다 — 칸 하나(data.plot)와 줄어든 씨앗
      // 하나(data.seedStack). 나머지 24칸과 다른 재료들은 건드리지 않는다.
      onPlayerChange((prev) => ({
        ...prev,
        plots: prev.plots.map((p) =>
          p.plotNumber === data.plot.plotNumber ? data.plot : p,
        ),
        stacks: prev.stacks.map((s) =>
          s.stackTemplateId === data.seedStack.stackTemplateId ? data.seedStack : s,
        ),
      }))
    } catch (err) {
      setMessage(`Request failed: ${err.message}`)
    }
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Greenhouse</h1>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>

      <section>
        <h2>Field</h2>
        {/* 25칸은 서버가 항상 25행으로 보내준다. 빈 칸도 행으로 오기 때문에
            화면은 이 배열만 훑으면 격자가 다 채워진다. */}
        <div className="field">
          {player.plots.map((plot) => {
            // 빈 칸만 누를 수 있어서 여기만 button이 된다. 심어진 칸은 div로
            // 남는데, 거두기가 붙는 다음 단계에서 그쪽도 button이 될 자리다.
            if (plot.cropTemplateId === null) {
              return (
                <button
                  key={plot.plotNumber}
                  type="button"
                  className="plot"
                  // 씨앗을 안 고르면 심을 수 없다. 서버도 막지만 이쪽은 편의다 —
                  // 누를 수 있게 해놓고 거절하는 것보다 못 누르게 하는 편이 낫다.
                  disabled={selectedCropId === null}
                  onClick={() => handlePlant(plot.plotNumber)}
                />
              )
            }

            const icon = stackOf(cropOf(plot.cropTemplateId).cropStackTemplateId).icon
            const remaining = (new Date(plot.readyAt).getTime() - now) / 1000

            return (
              <div key={plot.plotNumber} className="plot">
                <span className="plot-icon">{icon}</span>
                <span className="plot-time">
                  {remaining > 0 ? formatTime(remaining) : 'Ready'}
                </span>
              </div>
            )
          })}
        </div>
        {message && <p className="hint">{message}</p>}
      </section>

      <section>
        <h2>Seeds</h2>
        <p className="hint">Pick a seed, then click an empty plot.</p>
        <ul className="slot-row">
          {templates.crops.map((crop) => {
            const seed = stackOf(crop.seedStackTemplateId)
            const held = heldOf(crop.seedStackTemplateId)
            const selected = crop.cropTemplateId === selectedCropId

            return (
              <li key={crop.cropTemplateId}>
                <button
                  type="button"
                  className={`slot seed-slot${selected ? ' seed-selected' : ''}`}
                  // 0개인 씨앗은 고를 수 없다. 서버가 409로 막는 것과 같은 규칙을
                  // 화면에서 한 번 더 세우는 것인데, 중복이 아니라 다른 일이다 —
                  // 서버는 규칙을 지키고 이쪽은 헛걸음을 줄인다.
                  disabled={held === 0}
                  onClick={() => setSelectedCropId(crop.cropTemplateId)}
                >
                  <span className="zone-icon">{seed.icon}</span>
                  <span className="slot-name">{seed.name}</span>
                  {held}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

export default Greenhouse
