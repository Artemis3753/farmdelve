// 온실. 심고 거두는 일이 전부 여기서 일어난다 — 메인 화면에 보이는 밭은
// 들어오는 문이고, 실제 작업대는 이 화면이다(백로그 2026-08-26에 갈라짐).
//
// 오늘은 5×5 배치만 세운다. 칸을 누르면 무슨 일이 일어나는지는 crop_template과
// player_plot의 컬럼 이름이 정해진 다음이다 — 그 두 테이블은 아직 없다.

// 백로그에서 확정된 작물 넷. 아직 DB에 테이블이 없어서 화면에만 적어둔다.
// crop_template이 생기면 이 배열은 서버에서 내려온 것으로 교체된다.
const CROPS = [
  { name: 'Wheat', icon: '🌾', grow: '20 min' },
  { name: 'Potato', icon: '🥔', grow: '5 min' },
  { name: 'Chili Pepper', icon: '🌶️', grow: '5 min' },
  { name: 'Ironroot', icon: '🪵', grow: '1 hour' },
]

function Greenhouse({ onLeave }) {
  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Greenhouse</h1>
        <button type="button" onClick={onLeave}>Leave</button>
      </div>

      <section>
        <h2>Field</h2>
        {/* 5×5 = 25칸. player_plot 한 행이 이 칸 하나에 대응한다. */}
        <div className="field">
          {Array.from({ length: 25 }, (_, i) => (
            <div key={i} className="plot" />
          ))}
        </div>
      </section>

      <section>
        <h2>Seeds</h2>
        <ul className="slot-row">
          {CROPS.map((crop) => (
            <li key={crop.name} className="slot">
              <span className="zone-icon">{crop.icon}</span>
              <span className="slot-name">{crop.name}</span>
              {crop.grow}
            </li>
          ))}
        </ul>
        <div className="placeholder">
          Planting and harvesting wait on `crop_template` and `player_plot` —
          the two tables that carry growth time and what is planted where.
        </div>
      </section>
    </div>
  )
}

export default Greenhouse
