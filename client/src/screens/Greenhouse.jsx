import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'

// 온실. 심고 거두는 일이 전부 여기서 일어난다 — 메인 화면에 보이는 밭은
// 들어오는 문이고, 실제 작업대는 이 화면이다(백로그 2026-08-26에 갈라짐).

// 잭팟이 터진 칸에서 퍼지는 별들. 밭 칸 안에 놓이며, 칸이 position: relative라
// 여기의 절대 위치가 그 칸을 기준으로 잡힌다.
//
// at을 key로 받는 이유는 이 컴포넌트를 매번 새로 만들기 위해서다. 같은 요소에
// 같은 애니메이션을 다시 걸면 브라우저가 다시 돌리지 않는다.
function Stars({ count, at }) {
  return (
    // 별이 열둘이면 씨앗이 4개 나온 1%다. 크기와 거리를 CSS가 알아야 해서
    // 개수를 클래스로 한 번 더 옮긴다 — CSS는 count를 볼 수 없다.
    <span className={`stars${count >= 12 ? ' stars-big' : ''}`} key={at}>
      {Array.from({ length: count }, (_, i) => (
        // 별을 원 둘레에 고르게 나눠 세운다. CSS가 이 각도로 회전한 뒤 바깥으로
        // 밀어내므로, 별마다 x와 y를 따로 계산할 필요가 없다.
        <span
          key={i}
          className="star"
          style={{ '--angle': `${(360 / count) * i}deg` }}
        >
          ⭐
        </span>
      ))}
    </span>
  )
}

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

  // 문자열 하나가 아니라 객체다. 거두기가 성공하면 글자만이 아니라 별을 몇 개
  // 어떻게 그릴지도 함께 정해지는데, 그 둘은 항상 같이 바뀌므로 같이 둔다.
  // 따로 두면 "메시지는 지웠는데 별은 남은" 상태를 만들 수 있다.
  //
  // { text, seeds } — seeds는 거두기가 성공했을 때만 있다.
  const [message, setMessage] = useState(null)

  // 몇 번째 수확인가. 화면에 이 숫자를 그리지는 않는다 — 아래 메시지의 key로만
  // 쓴다. 같은 요소에 같은 애니메이션을 다시 걸면 브라우저가 다시 돌리지 않아서,
  // 잭팟이 연달아 터지면 두 번째가 조용해지는 것을 막으려는 것이다.
  //
  // Date.now()를 쓸 수도 있었지만 린터가 순수하지 않은 호출로 잡는다. 이벤트
  // 핸들러 안이라 실제로는 안전한데, 린터는 이 함수가 언제 불리는지 알 수 없어서
  // 보수적으로 막는다. 규칙이 틀렸다고 끄는 것보다, 애초에 순수한 값을 세는 쪽이
  // 낫다고 판단했다 (2026-09-07).
  const [harvestCount, setHarvestCount] = useState(0)

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

  // 서버가 돌려준 스택 하나를 내 손의 목록에 반영한다.
  //
  // map 하나로는 안 되는 자리다. map은 있는 줄을 갈아끼울 뿐 배열의 길이를 못
  // 바꾸는데, player_stack은 0개가 되면 행이 사라지는 설계라 처음 거두는 작물은
  // prev.stacks에 아예 없다. 그대로 두면 서버가 보낸 수확물이 에러도 경고도 없이
  // 사라진다.
  //
  // find가 아니라 some인 이유는, 여기서 필요한 것이 찾은 물건이 아니라 갈래를
  // 가르는 판정 하나뿐이기 때문이다. 아래에서 같은 비교를 한 번 더 하게 되지만
  // 스택 목록이 열 줄 남짓이라, 그 비용보다 읽기 쉬운 쪽을 골랐다.
  const mergeStack = (stacks, updated) => {
    const held = stacks.some((s) => s.stackTemplateId === updated.stackTemplateId)

    // 둘 다 새 배열을 만든다. push로 원본을 늘리면 배열이 "그 배열" 그대로라
    // React가 바뀐 것을 못 알아채고 화면을 다시 그리지 않는다.
    return held
      ? stacks.map((s) => (s.stackTemplateId === updated.stackTemplateId ? updated : s))
      : [...stacks, updated]
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
        setMessage({ text: `Rejected: ${data.reason}` })
        return
      }

      // 서버 DB가 바뀌었다고 화면이 아는 것은 아니다. 응답으로 받은 것을 내 손의
      // player에도 반영해야 새로고침 없이 밭에 나타난다.
      //
      // 응답에는 바뀐 것만 실려 온다 — 칸 하나(data.plot)와 줄어든 씨앗
      // 하나(data.seedStack). 나머지 24칸과 다른 재료들은 건드리지 않는다.
      //
      // 심을 씨앗은 반드시 갖고 있으므로 여기서 mergeStack은 갈아끼우는 갈래로만
      // 간다. 그래도 쓰는 이유는 같은 일을 두 모양으로 적어 두지 않으려는 것이다.
      onPlayerChange((prev) => ({
        ...prev,
        plots: prev.plots.map((p) =>
          p.plotNumber === data.plot.plotNumber ? data.plot : p,
        ),
        stacks: mergeStack(prev.stacks, data.seedStack),
      }))
    } catch (err) {
      setMessage({ text: `Request failed: ${err.message}` })
    }
  }

  // 다 자란 칸 하나를 거둔다.
  //
  // 심기와 달리 body가 없다. 어느 칸인지는 URL에 있고 나머지는 전부 서버가 아는
  // 값이라 보낼 것이 없다. 그래서 Content-Type 헤더도 필요 없다 — 헤더는 "지금
  // 보내는 몸통이 어떤 형식인가"를 알리는 것인데, 몸통이 없으니 알릴 것도 없다.
  async function handleHarvest(plotNumber) {
    setMessage(null)

    try {
      const res = await fetch(`/api/plots/${plotNumber}/harvest`, {
        method: 'POST',
      })
      const data = await res.json()

      // 안 자란 칸을 눌렀을 때 여기로 온다 — not_ready. 화면에서 안 막기로 했으니
      // 서버의 거절 경로가 실제로 도는 것을 눈으로 보게 된다.
      if (!res.ok) {
        setMessage({ text: `Rejected: ${data.reason}` })
        return
      }

      // 거두기는 셋을 한꺼번에 바꾼다 — 칸이 비고, 스택 둘이 늘고, 골드가 붙는다.
      //
      // 골드는 서버가 계산한 잔액을 그대로 받는다. 이쪽에서 더하면 harvest_gold가
      // 두 곳에 생기고, 요청이 겹쳤을 때 화면의 숫자가 DB와 어긋난다.
      //
      // 스택은 안쪽 mergeStack이 만든 새 배열을 바깥이 다시 받는다. 수확물은
      // 없던 줄이라 붙고 씨앗은 있던 줄이라 갈아끼워지는데, 어느 쪽인지 여기서
      // 가릴 필요가 없다 — mergeStack이 각각 알아서 고른다.
      onPlayerChange((prev) => ({
        ...prev,
        gold: data.gold,
        plots: prev.plots.map((p) =>
          p.plotNumber === data.plot.plotNumber ? data.plot : p,
        ),
        stacks: mergeStack(
          mergeStack(prev.stacks, data.stacks[0]),
          data.stacks[1],
        ),
      }))

      // 무엇이 들어왔는지 한 줄로 알린다. 이름과 아이콘은 응답에 없고 templates에
      // 있으므로 여기서 붙인다 — 서버가 같은 이름을 모든 응답에 싣지 않기로 한
      // 결정의 대가이자 목적이다.
      const cropStack = stackOf(data.stacks[0].stackTemplateId)
      const seedStack = stackOf(data.stacks[1].stackTemplateId)

      // 완성된 문장이 아니라 조각으로 담는다. <Icon>은 글자가 아니라 "무엇을
      // 그릴지 적은 객체"라서 문자열 안에 못 들어간다 — 넣으면 [object Object]가
      // 찍힌다. 조립은 아래 렌더가 한다.
      setMessage({
        crop: { name: cropStack.name, amount: data.gained.crop },
        gold: data.gained.gold,

        // 씨앗 상자에 개수를 안 넣는다. 아래 seeds가 이미 같은 값을 들고 있어서
        // 두 곳에 두면 한쪽만 고쳐지는 날이 오는데, 그 seeds를 여기로 옮길 수도
        // 없다 — 잭팟 판정이 세 곳에서 그 값을 본다. 상자 안은 "메시지에 그릴
        // 것"이고 seeds는 "이 수확이 대박인가"라서, 같은 숫자지만 다른 일을 한다.
        seed: { name: seedStack.name },

        seeds: data.gained.seeds,

        // 별이 터질 자리. 메시지 줄에서 터뜨렸더니 <p>가 가로 폭을 다 차지해서
        // 글자와 동떨어진 곳에서 터졌다. 어느 칸이 대박이었는지도 보이는 편이
        // 나아서 칸으로 옮겼다 (2026-09-07).
        plotNumber,
      })

      // 이 한 줄이 애니메이션을 다시 트리거한다. 값 자체는 아무 데도 안 보이고,
      // 달라진다는 사실만이 일을 한다.
      //
      // 앞의 값을 받아 더하는 모양을 쓴다. onPlayerChange가 prev를 받는 것과
      // 같은 이유다 — 지금 화면에 있는 숫자가 아니라 React가 들고 있는 최신 값에
      // 더해야 연달아 눌렀을 때 세다 만 숫자가 나오지 않는다.
      setHarvestCount((n) => n + 1)
    } catch (err) {
      setMessage({ text: `Request failed: ${err.message}` })
    }
  }

  // 별을 몇 개 그릴지. 4개는 두 주사위가 다 터진 1%라 12개, 3개는 6개.
  //
  // 잭팟이 아닌 경우가 0인 것은 방어다 — 아래에서 seeds >= 3일 때만 그리므로
  // 0이 실제로 쓰이지는 않지만, 무엇이 들어가든 상관없는 자리에 뜻이 없는 숫자를
  // 남기지 않는다.
  //
  // message는 null일 수 있다. ?. 로 꺼낸 undefined는 어느 비교에도 false라
  // 그대로 마지막 갈래로 떨어진다.
  const starCount = message?.seeds >= 4 ? 12 : message?.seeds === 3 ? 6 : 0

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Greenhouse</h1>
        {/* 골드는 재료가 아니라 player의 컬럼 하나다. 그래서 가방에 섞지 않고
            화면마다 같은 자리에 따로 세운다 — 재화가 드나드는 화면 어디서든
            눈이 같은 곳을 보게 된다. */}
        <span className="screen-gold">🪙 {player.gold}</span>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>

      <section>
        <h2>Field</h2>
        {/* 25칸은 서버가 항상 25행으로 보내준다. 빈 칸도 행으로 오기 때문에
            화면은 이 배열만 훑으면 격자가 다 채워진다. */}
        <div className="field">
          {player.plots.map((plot) => {
            // 이 칸에서 방금 잭팟이 터졌는가. 칸 번호까지 맞춰야 한다 — 빼먹으면
            // 25칸이 한꺼번에 터진다.
            const burst = message?.seeds >= 3 && message?.plotNumber === plot.plotNumber

            // 빈 칸은 심고, 찬 칸은 거둔다. 두 갈래가 다른 요청을 보내므로
            // button도 따로 그린다.
            //
            // 거둔 직후의 칸은 비어 있으므로 별도 이쪽에서 터진다. 심어진 칸에는
            // 별을 안 그린다 — 거두면 반드시 비기 때문이다.
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
                >
                  {burst && <Stars count={starCount} at={harvestCount} />}
                </button>
              )
            }

            const cropName = stackOf(cropOf(plot.cropTemplateId).cropStackTemplateId).name
            const remaining = (new Date(plot.readyAt).getTime() - now) / 1000
            const ready = remaining <= 0

            // 안 자란 칸도 누를 수 있게 둔다. 씨앗 0개를 disabled로 막은 것과
            // 반대 선택인데, 여기서는 서버의 not_ready 거절이 화면에서 확인되는
            // 값어치가 더 크다고 봤다 (2026-09-07).
            return (
              <button
                key={plot.plotNumber}
                type="button"
                // 다 큰 칸에만 초록을 얹는다. "Ready" 글자는 11px이라 25칸을
                // 훑어야 보이는데, 색은 훑지 않아도 눈에 들어온다.
                className={`plot${ready ? ' plot-ready' : ''}`}
                onClick={() => handleHarvest(plot.plotNumber)}
              >
                <Icon of={cropName} className="plot-icon" />
                <span className="plot-time">
                  {ready ? 'Ready' : formatTime(remaining)}
                </span>
              </button>
            )
          })}
        </div>
        {message && (
          // 3개 이상이면 잭팟이다. 확률은 4%(3개) + 1%(4개) = 5%라 밭 한 바퀴에
          // 평균 한 번쯤 나온다. 4개는 두 주사위가 다 터진 경우라 더 크게 알린다.
          //
          // key가 harvestCount라 거둘 때마다 새 요소가 되고, 그래서 잭팟이 연달아
          // 나와도 매번 처음부터 터진다. 밭 25칸의 key={plot.plotNumber}와 정확히
          // 반대 방향의 쓰임이다 — 거기서는 "같은 칸이니 재사용해"였고, 여기서는
          // "다른 것이니 새로 만들어"다.
          <p
            key={harvestCount}
            className={`hint${message.seeds >= 3 ? ' jackpot' : ''}${
              message.seeds >= 4 ? ' jackpot-big' : ''
            }`}
          >
            {/* 수확 성공에만 조각이 들어 있다. 거절과 요청 실패는 text 하나뿐이다.
                {' '}가 붙은 자리는 JSX가 줄바꿈에 걸린 공백을 지우기 때문이다 —
                눈에는 떨어져 보여도 그대로 두면 아이콘과 글자가 붙어서 나온다. */}
            {message.crop ? (
              <>
                <Icon of={message.crop.name} className="stack-icon" />{' '}
                {message.crop.name} ×{message.crop.amount}
                {' · '}+{message.gold} gold{' · '}
                <Icon of={message.seed.name} className="stack-icon" /> ×{message.seeds}
              </>
            ) : (
              message.text
            )}
          </p>
        )}
      </section>

      <section>
        <h2>Seeds</h2>
        <p className="hint">Pick a seed, then click an empty plot.</p>
        <ul className="slot-row">
          {templates.crops.map((crop) => {
            const seed = stackOf(crop.seedStackTemplateId)

            // 카드에 적는 이름은 씨앗이 아니라 작물이다. "Chili Pepper Seed"가
            // 72px 칸에서 세 줄로 접히면서 그 카드만 숫자가 아래로 밀렸는데,
            // 긴 이름의 절반인 "Seed"는 이미 세 곳이 말하고 있다 — 섹션 제목,
            // 바로 위 힌트 문장, 그리고 봉지 모양 아이콘.
            //
            // 문자열에서 잘라내지 않는다. 그러면 이름에 "Seed"가 들어있다는
            // 가정에 기대게 되고, 규칙이 바뀌는 날 조용히 깨진다. 아래 값은
            // 밭 칸이 작물 이름을 꺼낼 때 쓰는 것과 같은 필드다.
            const cropStack = stackOf(crop.cropStackTemplateId)

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
                  {/* 아이콘은 씨앗 쪽 그대로다. 봉지 배경이 "이건 심는 것"을
                      말하는 자리라, 글자에서 뺀 정보를 여기가 대신 든다. */}
                  <Icon of={seed.name} className="zone-icon" />
                  <span className="slot-name">{cropStack.name}</span>
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
