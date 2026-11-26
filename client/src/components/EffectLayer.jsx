// 전투 이펙트 층. 복도(DOM 칸) 위에 투명한 canvas 하나를 겹쳐 놓고, 규칙서가 남긴 사건(state.events)을
// 보고 짧은 그림을 그린다: 맞은 칸의 번쩍임, 떠오르는 숫자, 죽은 자리의 터짐.
//
// 칸 자체(클릭·대상 테두리·범위 표시)는 그대로 DOM이 맡는다. 이 층은 pointer-events: none이라
// 클릭이 아래 칸으로 그대로 내려간다 — 그림만 얹고 입력은 건드리지 않는다.
//
// 그림은 상태가 아니라 "사건"을 보고 고른다. 상태는 지금 모습만 담아서, 몬스터 hp가 줄었다는 것은
// 알아도 무엇에 얼마나 맞았는지는 모르기 때문이다.

import { useEffect, useRef } from 'react'
import { inSwingArea, CORRIDOR_HEIGHT, CORRIDOR_LENGTH } from '../combat/rules.js'

// 이펙트 길이(밀리초). 틱이 0.1초라, 0.6초짜리 숫자는 6틱 동안 떠 있다 — 연타 중에도 숫자가 읽힐 만큼
// 남고, 다음 숫자들이 쌓여 칸을 덮기 전에 사라지는 길이다.
const FLASH_MS = 150
const PLAYER_FLASH_MS = 200
const SWING_MS = 250
const BURST_MS = 400
const NUMBER_MS = 600
const PLAYER_DEATH_MS = 600

// 색. 몬스터 칸의 붉은색(#B4402F)·출혈 점(#E0162B)은 game.css와 같은 값을 쓴다 — 같은 뜻에 같은 색.
// canvas는 CSS 변수를 직접 못 읽어서 여기 숫자로 적는다.
const HIT_FLASH = '255, 255, 255'
const PLAYER_FLASH = '224, 22, 43'
// Brutal Swing 범위 점선(.tile-swing)과 같은 보라. "이 6칸이 그 범위"라는 뜻을 이어 준다.
const SWING_FLASH = '170, 59, 255'
const BURST_COLOR = '180, 64, 47'
const HIT_TEXT = '#FFFFFF'
const PLAYER_HIT_TEXT = '#FF6B5A'
// 출혈은 직접 맞힌 게 아니라 틱마다 새는 피해라, 흰 숫자보다 어두운 핏빛에 글자도 작게 해서 구분한다.
const BLEED_TEXT = '#E0162B'
const HEAL_TEXT = '#4ADE80'

// 사건 하나 → 그릴 이펙트 0개 이상. 이펙트는 복도 좌표(x, y)와 시작 시각만 들고 있고, 화면 위치는
// 매 프레임 그때의 viewLeft로 계산한다(아래 draw). 그래야 이펙트가 도는 중에 카메라가 움직여도 이펙트가
// 원래 칸에 붙어 있다.
function effectsFor(event, start, positionOf, player) {
  const at = (target) => (target === 'player' ? { x: player.x, y: player.y } : positionOf(target))

  if (event.type === 'damage') {
    const pos = at(event.target)
    if (!pos) return []
    // 같은 틱에 여러 마리가 한 칸을 때리면 숫자가 정확히 겹쳐 하나로 보인다. 일련번호로 좌우를 조금씩
    // 비켜서 겹친 숫자도 따로 읽히게 한다. 무작위가 아니라 번호로 정해서 같은 사건은 늘 같은 자리다.
    const offset = (event.seq % 3) - 1
    if (event.target === 'player') {
      return [
        { kind: 'flash', ...pos, start, duration: PLAYER_FLASH_MS, color: PLAYER_FLASH },
        { kind: 'number', ...pos, start, duration: NUMBER_MS, offset, text: String(event.amount), color: PLAYER_HIT_TEXT, size: 16 },
      ]
    }
    if (event.ability === 'bleed') {
      // 출혈 틱에는 번쩍임을 넣지 않는다. 번쩍임은 "방금 맞혔다"는 표시라, 저절로 새는 피해까지
      // 번쩍이면 직접 맞힌 것과 구별되지 않는다.
      return [{ kind: 'number', ...pos, start, duration: NUMBER_MS, offset, text: String(event.amount), color: BLEED_TEXT, size: 13 }]
    }
    return [
      { kind: 'flash', ...pos, start, duration: FLASH_MS, color: HIT_FLASH },
      { kind: 'number', ...pos, start, duration: NUMBER_MS, offset, text: String(event.amount), color: HIT_TEXT, size: 16 },
    ]
  }

  if (event.type === 'heal') {
    return [{ kind: 'number', x: player.x, y: player.y, start, duration: NUMBER_MS, offset: 0, text: `+${event.amount}`, color: HEAL_TEXT, size: 16 }]
  }

  if (event.type === 'death') {
    if (event.target === 'player') {
      return [{ kind: 'flash', x: player.x, y: player.y, start, duration: PLAYER_DEATH_MS, color: PLAYER_FLASH }]
    }
    const pos = positionOf(event.target)
    return pos ? [{ kind: 'burst', ...pos, start, duration: BURST_MS }] : []
  }

  // 시전 중에는 Brutal Swing만 그린다. 범위기라 "어디를 휘둘렀나"가 맞은 숫자만으로는 안 보이기
  // 때문이다. 다른 스킬은 맞은 칸의 숫자가 이미 그 역할을 한다.
  if (event.type === 'cast' && event.ability === 'brutalSwing') {
    const cells = []
    // 범위는 플레이어에게서 앞으로 2칸·옆으로 1칸까지라(rules.js SWING_ROWS·SWING_HALF_WIDTH) 주변
    // 5 × 5만 훑으면 충분하다. 어느 칸인지는 inSwingArea가 정한다 — 점선 범위 표시와 같은 함수라
    // 번쩍이는 칸과 실제로 맞는 칸이 어긋나지 않는다.
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = player.x + dx
        const y = player.y + dy
        const inside = x >= 0 && x < CORRIDOR_LENGTH && y >= 0 && y < CORRIDOR_HEIGHT
        if (inside && inSwingArea(player, x, y)) cells.push({ x, y })
      }
    }
    return cells.map((c) => ({ kind: 'flash', ...c, start, duration: SWING_MS, color: SWING_FLASH, alpha: 0.35 }))
  }

  return []
}

function EffectLayer({ events, monsters, player, viewLeft, columns, tile, gap }) {
  const canvasRef = useRef(null)
  // 지금 도는 이펙트 목록. 그리기는 React 렌더가 아니라 requestAnimationFrame이 하므로, 바뀌어도
  // 화면을 다시 렌더할 필요가 없는 ref에 둔다.
  const effectsRef = useRef([])
  // 마지막으로 이펙트를 만든 사건 번호. 키로 쓴 스킬의 사건은 다음 틱까지 state에 남아서, 그 사이
  // 다른 이유로 다시 렌더되면 같은 사건이 또 들어온다. 이 번호보다 큰 사건만 그려서 두 번 그리지 않는다.
  // "Try again"은 DungeonRun을 새로 만들어서 이 ref도 같이 -1로 돌아가고, 번호도 0부터 다시 센다.
  const lastSeqRef = useRef(-1)
  // 몬스터 id → 마지막으로 본 자리. 죽은 몬스터는 사건이 나온 바로 그 상태에서 이미 지워져 있어서,
  // 지금 상태로는 어디서 죽었는지 알 수 없다. 그래서 지난 렌더까지 본 자리를 기억해 둔다.
  const positionsRef = useRef(new Map())
  // 그리기 루프가 읽을 지금 카메라 위치. 루프는 한 번 만든 함수가 계속 도는 것이라 props를 직접 보면
  // 처음 값에 머문다 — ref로 최신 값을 건넨다.
  const viewLeftRef = useRef(viewLeft)

  const width = columns * tile + (columns - 1) * gap
  const height = CORRIDOR_HEIGHT * tile + (CORRIDOR_HEIGHT - 1) * gap

  useEffect(() => {
    viewLeftRef.current = viewLeft
  }, [viewLeft])

  // 새 사건 → 새 이펙트. ref를 고치는 일이라 렌더 중이 아니라 effect에서 한다(렌더는 몇 번이고 다시
  // 불릴 수 있어서, 렌더 중에 고치면 같은 일이 여러 번 일어날 수 있다).
  useEffect(() => {
    const now = performance.now()
    // 살아 있는 몬스터는 지금 자리를, 이번 상태에서 지워진 몬스터는 기억해 둔 자리를 쓴다.
    const positionOf = (id) => {
      const alive = monsters.find((m) => m.id === id)
      return alive ? { x: alive.x, y: alive.y } : positionsRef.current.get(id)
    }

    for (const event of events) {
      if (event.seq <= lastSeqRef.current) continue
      effectsRef.current.push(...effectsFor(event, now, positionOf, player))
      lastSeqRef.current = event.seq
    }

    // 자리 기억은 사건을 다 처리한 "뒤에" 새로 쓴다. 먼저 쓰면 이번 상태에서 죽어 사라진 몬스터가
    // 표에서도 빠져서, 바로 위에서 그 몬스터의 터짐을 그릴 자리를 못 찾는다. 죽은 몬스터의 자리는
    // 한 번 쓰고 나면 필요 없으므로, 지금 살아 있는 몬스터로 표를 통째로 다시 만든다.
    positionsRef.current = new Map(monsters.map((m) => [m.id, { x: m.x, y: m.y }]))
  }, [events, monsters, player])

  // canvas 크기와 그리기 루프.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // 화면 1px에 실제 화소가 2~3개인 디스플레이(레티나)에서는 canvas를 CSS 크기 그대로 만들면 늘려
    // 그려져 글자가 흐려진다. 속 크기를 배율만큼 키우고, 그릴 때는 CSS 픽셀 단위로 그리게 배율을 건다.
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    // 숫자 글꼴은 페이지의 --mono를 그대로 읽는다. 글꼴 목록을 여기 다시 적으면 index.css와 두 곳이
    // 되기 때문이다. canvas는 CSS 변수를 이해하지 못해서 값을 꺼내 문자열로 넘긴다.
    const mono = getComputedStyle(canvas).getPropertyValue('--mono').trim() || 'monospace'

    let frameId
    function draw(now) {
      // canvas 크기를 바꾸면 변환과 설정이 초기화되므로, 매 프레임 처음에 다시 건다.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // 나중에 16px 픽셀 아트를 3배로 그릴 때 뭉개지지 않게 한다. 지금 그리는 사각형·글자에는 영향이 없다.
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, width, height)

      const step = tile + gap
      const viewLeft = viewLeftRef.current
      effectsRef.current = effectsRef.current.filter((e) => now - e.start < e.duration)

      for (const e of effectsRef.current) {
        // 0 → 1로 가는 진행도. performance.now()로 기록한 시작 시각과 rAF가 주는 now는 같은 시계다.
        const t = Math.max(0, (now - e.start) / e.duration)
        const left = (e.x - viewLeft) * step
        const top = e.y * step

        if (e.kind === 'flash') {
          ctx.fillStyle = `rgba(${e.color}, ${(e.alpha ?? 0.8) * (1 - t)})`
          ctx.fillRect(left, top, tile, tile)
        } else if (e.kind === 'burst') {
          // 칸 크기에서 1.6배까지 커지며 옅어지는 사각 테두리.
          const size = tile * (1 + 0.6 * t)
          ctx.strokeStyle = `rgba(${BURST_COLOR}, ${1 - t})`
          ctx.lineWidth = 3
          ctx.strokeRect(left + (tile - size) / 2, top + (tile - size) / 2, size, size)
        } else if (e.kind === 'number') {
          ctx.font = `700 ${e.size}px ${mono}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.lineJoin = 'round'
          ctx.lineWidth = 3
          ctx.globalAlpha = 1 - t * t
          const cx = left + tile / 2 + e.offset * tile * 0.25
          // 칸 가운데에서 시작해 한 칸의 0.6만큼 떠오른다.
          const cy = top + tile / 2 - tile * 0.6 * t
          // 어두운 테두리를 먼저 그린다. 밝은 칸·어두운 칸·흰 번쩍임 어디 위에서도 숫자가 읽히게 하려는 것이다.
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
          ctx.strokeText(e.text, cx, cy)
          ctx.fillStyle = e.color
          ctx.fillText(e.text, cx, cy)
          ctx.globalAlpha = 1
        }
      }

      // 이펙트가 없어도 루프는 계속 돈다. 빈 canvas를 지우는 일은 싸고, 이펙트가 생길 때마다 루프를
      // 켜고 끄는 장부를 따로 두지 않아도 된다.
      frameId = requestAnimationFrame(draw)
    }
    frameId = requestAnimationFrame(draw)

    // 화면을 떠나면 루프를 끈다. 안 끄면 사라진 canvas에 계속 그리고, StrictMode의 "등록 → 정리 →
    // 다시 등록"에서 루프가 두 개가 된다.
    return () => cancelAnimationFrame(frameId)
  }, [width, height, tile, gap])

  return (
    <canvas
      ref={canvasRef}
      className="effect-layer"
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  )
}

export default EffectLayer
