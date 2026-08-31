// 메인 화면. 손그림의 18×10 격자에 5×5 구역 넷을 얹은 것이다.
//
// 좌상단 밭 / 좌하단 대장간 / 우상단 던전 / 우중단 은신처. 밭 구역이 곧
// 온실 입구다 — 심고 거두는 일은 온실 안에서 하기로 했으므로(백로그 2026-08-26),
// 여기 보이는 밭은 들어가는 문이지 작업대가 아니다.
//
// 배치는 인라인 style의 gridColumn / gridRow로 준다. CSS 파일에 네 구역의
// 좌표를 따로 적어두는 것보다, 어느 칸을 차지하는지가 여기서 바로 읽힌다.

const ZONES = [
  { id: 'greenhouse', icon: '🌾', label: 'Greenhouse', col: '2 / 7', row: '1 / 6' },
  { id: 'dungeon', icon: '🕳️', label: 'Dungeon', col: '13 / 18', row: '1 / 6' },
  { id: 'smithy', icon: '🔨', label: 'Smithy', col: '2 / 7', row: '6 / 11' },
  { id: 'shelter', icon: '🏠', label: 'Shelter', col: '13 / 18', row: '6 / 11' },
]

function MainScreen({ onEnter }) {
  return (
    <div className="screen">
      <div className="screen-header">
        <h1>FarmDelve</h1>
      </div>

      <div className="main-grid">
        {ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className="zone"
            style={{ gridColumn: zone.col, gridRow: zone.row }}
            // 어느 화면으로 갈지는 이 컴포넌트가 결정하지 않는다. 눌렸다는
            // 사실과 어느 문인지만 위로 올려보내고, 전환은 App이 한다.
            onClick={() => onEnter(zone.id)}
          >
            <span className="zone-icon">{zone.icon}</span>
            <span className="zone-label">{zone.label}</span>
          </button>
        ))}

        {/* 캐릭터. 격자 한가운데에 세워두고, 이동은 아직 없다. */}
        <div className="avatar" style={{ gridColumn: '9 / 11', gridRow: '5 / 7' }}>
          🧑‍🌾
        </div>
      </div>
    </div>
  )
}

export default MainScreen
