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
  // ★ 빈칸 1 — 앱을 열면 어느 화면부터 보여야 하는가? MainScreen이 문 넷에
  //   붙여 보내는 id는 'greenhouse' / 'dungeon' / 'smithy' / 'shelter'이고,
  //   그 넷 중 어느 것도 아닌 이름이 하나 더 필요하다.
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
    return <Shelter templates={templates} player={player} onLeave={goHome} />
  }

  // 두 화면은 배치만 서 있다. 온실은 crop_template·player_plot을, 던전은
  // 몬스터 수치와 그리드 크기를 기다린다 — 그래서 데이터를 아직 안 넘긴다.
  if (screen === 'greenhouse') return <Greenhouse onLeave={goHome} />
  if (screen === 'dungeon') return <Dungeon onLeave={goHome} />


  // ★ 빈칸 2 — 문을 눌렀을 때 무엇이 일어나야 하는가? MainScreen은 눌린 문의
  //   id를 인자로 넘겨준다. 그 id를 받아서 화면 상태로 넣어주는 함수가 필요한데,
  //   위에서 이미 만들어 둔 것 중 하나가 그 일을 그대로 한다.
  return <MainScreen onEnter={setScreen} />
}

export default App
