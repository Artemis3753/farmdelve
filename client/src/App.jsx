import { useEffect, useState } from 'react'
import './game.css'
import MainScreen from './screens/MainScreen.jsx'
import Smithy from './screens/Smithy.jsx'
import Shelter from './screens/Shelter.jsx'
import Greenhouse from './screens/Greenhouse.jsx'
import Dungeon from './screens/Dungeon.jsx'

// 내 플레이어 상태를 받는다. 처음 온 방문자이거나 쿠키가 만료됐으면(서버가 30일
// 안 온 게스트를 지운 경우) 서버가 401 guest_not_found로 답한다. 그때 게스트를 하나
// 만들고 한 번만 다시 묻는다(2026-11-23).
//
// 쿠키를 코드에서 다루는 줄이 없다. 서버가 POST 응답에 Set-Cookie를 실으면 브라우저가
// 저장하고, 같은 사이트로 가는 다음 fetch부터 알아서 붙인다. httpOnly라 여기서 읽을
// 수도 없다 — 읽을 수 없어야 안전하다는 게 그 쿠키를 고른 이유다.
//
// res.ok를 보는 이유: 예전에는 바로 res.json()을 해서, 서버가 500을 보내면 에러 객체
// { reason }이 플레이어 상태인 척 화면으로 들어갔다. 이제 실패는 화면의 error로 간다.
async function fetchPlayer() {
  let res = await fetch('/api/player')

  if (res.status === 401) {
    const created = await fetch('/api/guest', { method: 'POST' })

    // 429는 같은 네트워크(같은 공인 IP)에서 한 시간에 게스트를 5명 넘게 만든 경우다.
    if (created.status === 429) {
      throw new Error('too many new players from this network, try again later')
    }
    if (!created.ok) throw new Error(`could not create a player (${created.status})`)

    res = await fetch('/api/player')

    // 방금 만든 게스트로도 401이면 쿠키가 저장되지 않은 것이다 — 브라우저가 쿠키를
    // 막아 둔 경우. 여기서 다시 만들러 가지 않는다. 서버는 차단을 모른 채 매번 게스트를
    // 만들므로, 반복하면 주인 없는 게스트만 쌓이다 속도 제한에 걸린다.
    if (res.status === 401) {
      throw new Error('cookies seem to be blocked — enable them for this site to play')
    }
  }

  if (!res.ok) throw new Error(`could not load the player (${res.status})`)
  return res.json()
}

function App() {
  // 정적 정의(이름·아이콘·비용표)와 내 상태(장비·재료)를 따로 들고 있는다.
  // 서버에서 두 엔드포인트로 나눠 받은 경계를 화면에서도 그대로 유지한다.
  const [templates, setTemplates] = useState(null)
  const [player, setPlayer] = useState(null)
  const [error, setError] = useState(null)

  // 지금 어느 화면인가. 라우터를 쓰지 않는 이유는 주소로 공유할 화면도 아니고
  // 브라우저 뒤로가기가 오히려 어색해서다 — 필요한 건 이름 하나뿐이다.
  //
  // 'main'은 문 넷의 id('greenhouse' / 'dungeon' / 'smithy' / 'shelter')와
  // 겹치지 않는 다섯 번째 이름이다. 앱을 열면 여기서 시작한다.
  const [screen, setScreen] = useState('main')

  // 개발 모드(vite)에서는 main.jsx의 StrictMode가 이 effect를 일부러 두 번 실행한다.
  // 쿠키 없이 처음 열면 fetchPlayer 두 개가 동시에 401을 받고 게스트를 둘 만든다 —
  // 서버는 동시 요청을 구분하지 못한다. 쿠키는 나중 것이 남고, 앞 게스트는 주인 없이
  // 30일 정리를 기다린다. 배포 빌드는 한 번만 실행하므로 생기지 않는다. 개발에서만
  // 생기는 고아 하나를 막으려고 구조를 바꾸지 않기로 했다(2026-11-23).
  useEffect(() => {
    Promise.all([
      fetch('/api/templates').then((res) => res.json()),
      fetchPlayer(),
    ])
      .then(([templateData, playerData]) => {
        setTemplates(templateData)
        setPlayer(playerData)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <div className="screen"><p>Could not load: {error}</p></div>
  if (!templates || !player) return <div className="screen"><p>Loading...</p></div>

  const goHome = () => setScreen('main')

  if (screen === 'smithy') {
    return (
      <Smithy
        templates={templates}
        player={player}
        // setPlayer를 그대로 넘긴다. 대장간은 "player가 이렇게 바뀐다"만 말하고,
        // 그 상태를 어디에 보관하는지는 계속 App의 일로 남는다.
        onPlayerChange={setPlayer}
        onLeave={goHome}
      />
    )
  }

  if (screen === 'shelter') {
    return (
      <Shelter
        templates={templates}
        player={player}
        onPlayerChange={setPlayer}
        onLeave={goHome}
      />
    )
  }

  if (screen === 'greenhouse') {
    return (
      <Greenhouse
        templates={templates}
        player={player}
        onPlayerChange={setPlayer}
        onLeave={goHome}
      />
    )
  }

  // 던전은 몬스터 정의와 팩 구성(templates)만 읽고, 플레이어 상태를 바꾸는
  // 기능은 아직 없다. 그래서 onPlayerChange를 넘기지 않는다.
  // 나중에 던전에서 장비를 잃거나 재료를 얻는 기능이 생기면 그때 추가하면 된다.
  if (screen === 'dungeon') return <Dungeon templates={templates} onLeave={goHome} />


  // MainScreen은 눌린 문의 id를 그대로 넘겨준다. 그 id가 곧 화면 이름이라
  // setScreen을 따로 감싸지 않고 바로 건넨다.
  return <MainScreen onEnter={setScreen} />
}

export default App
