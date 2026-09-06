import { useEffect, useState } from 'react'
import './game.css'
import MainScreen from './screens/MainScreen.jsx'
import Smithy from './screens/Smithy.jsx'
import Shelter from './screens/Shelter.jsx'
import Greenhouse from './screens/Greenhouse.jsx'
import Dungeon from './screens/Dungeon.jsx'

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

  useEffect(() => {
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

  // 던전은 아직 배치만 되어 있고, 플레이어 상태를 바꾸는 기능이 없다.
  // 그래서 onPlayerChange를 넘기지 않는다.
  // 나중에 던전에서 장비를 잃거나 재료를 얻는 기능이 생기면 그때 추가하면 된다.
  if (screen === 'dungeon') return <Dungeon onLeave={goHome} />


  // MainScreen은 눌린 문의 id를 그대로 넘겨준다. 그 id가 곧 화면 이름이라
  // setScreen을 따로 감싸지 않고 바로 건넨다.
  return <MainScreen onEnter={setScreen} />
}

export default App
