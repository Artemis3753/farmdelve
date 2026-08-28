import { useEffect, useState } from 'react'

function App() {
  // 연결 확인용 임시 화면이라 상태를 하나로 합쳤다. 성공이든 실패든 한 줄로 보여주면
  // 충분하고, 이 화면은 곧 실제 게임 화면으로 통째로 교체된다.
  const [status, setStatus] = useState('확인 중...')

  useEffect(() => {
    // 주소를 '/api/health'로 쓰는 것이 핵심이다. 'http://localhost:3001/api/health'로
    // 직접 부르면 브라우저가 다른 출처로 보고 막는다. 앞이 잘린 주소는 지금 보고 있는
    // 곳(5173)에 묻는다는 뜻이고, 그쪽을 vite.config.js의 proxy가 3001로 넘겨준다.
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(`DB 시각: ${data.now}`))
      .catch((err) => setStatus(`연결 실패: ${err.message}`))
    // 두 번째 인자인 빈 배열은 "다시 실행할 조건이 없다"는 뜻이다. 이것을 빼면 화면이
    // 다시 그려질 때마다 요청이 나가고, 그 응답이 또 화면을 그리는 무한 반복이 된다.
  }, [])

  return (
    <main>
      <h1>FarmDelve</h1>
      <p>{status}</p>
    </main>
  )
}

export default App
