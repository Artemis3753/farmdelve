// 던전. 손그림 세 번째 장의 배치를 그대로 세운다 — 위쪽 헤더에 이름·남은
// 시간·단수·나가기, 가운데 4방향 뷰, 아래 CP 바와 스킬창.
//
// 여기 있는 숫자는 전부 자리를 채우는 값이다. 진짜 값은 몬스터 수치와 던전
// 그리드 크기가 정해져야 나오고, 둘 다 백로그 §2에 미결로 남아 있다.
//
// 뷰 크기를 임시로 둘 수밖에 없는 이유가 그 미결 하나다: 그리드가 정해져야
// 석궁 사거리가 정해지고, 사거리가 화면 밖이면 안 보이는 곳에서 맞게 된다.

const SKILL_SLOTS = [1, 2, 3, 4, 5, 6, 7]

function Dungeon({ onLeave }) {
  return (
    <div className="screen">
      <div className="screen-header">
        <h1>Dungeon</h1>
        <button type="button" onClick={onLeave}>Abandon run</button>
      </div>

      {/* 헤더 — 손그림 우상단의 네 줄. 나가기는 위 버튼이 겸한다. */}
      <section className="dungeon-header">
        <span>Tier 1</span>
        <span>10:00</span>
        <span>Pulls 0 / 5</span>
      </section>

      <section>
        {/* 4방향 뷰. 캐릭터를 따라 움직이는 창이고, 진행 방향은 위쪽이다. */}
        <div className="dungeon-view">
          <span className="dungeon-direction">↑ progress</span>
          <div className="placeholder">
            Four-direction view follows the character. Size waits on the
            dungeon grid — the ranged spec's range is measured against it.
          </div>
        </div>
      </section>

      <section>
        {/* 분노(Rage) 바. 다섯 칸으로 세는 자원이라 칸을 나눠 그린다. */}
        <div className="rage-bar">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="rage-cell" />
          ))}
        </div>

        <ul className="slot-row">
          {SKILL_SLOTS.map((n) => (
            <li key={n} className="skill-key">{n}</li>
          ))}
        </ul>

        <div className="placeholder">
          Skills, consumables, and key rebinding come with the combat slice.
        </div>
      </section>
    </div>
  )
}

export default Dungeon
