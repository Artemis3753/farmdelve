import { ICON_PATHS } from './iconPaths'

// 아이콘 21개의 생김새. docs/Icon-image.md가 정본이고 이 표는 그 사본이다.
//
// shape이 배경을 정한다 — 'packet'은 씨앗 봉지, 'disc'는 crest 원판, 'none'은
// 배경 없이 그림만. 이걸 서버가 말해주지 못하는 이유는 stack_template에 kind
// 컬럼이 없어서인데(schema.sql의 그 주석), 아이콘 모양은 화면 사정이지 게임
// 규칙이 아니라서 여기 두는 편이 맞다. kind가 생기더라도 그건 다른 질문이다.
//
// 씨앗이 "봉지 + 그 작물 그림"이라서 그림을 새로 찾을 필요가 없었다. 작물이
// 늘어도 여기 네 줄이 늘 뿐이다.
const ICONS = {
  // 씨앗 — 봉지 배경
  'Wheat Seed':        { slug: 'lorc/wheat',              shape: 'packet', bg: '#C79A3A', fg: '#FBF4E2' },
  'Potato Seed':       { slug: 'delapouite/potato',       shape: 'packet', bg: '#8A6A4B', fg: '#F7EEDF' },
  'Chili Pepper Seed': { slug: 'delapouite/chili-pepper', shape: 'packet', bg: '#B4402F', fg: '#FCEDE6' },
  'Ironroot Seed':     { slug: 'lorc/root-tip',           shape: 'packet', bg: '#4C6068', fg: '#E8F1F4' },

  // 강화 재료 — 원판 배경. 이름이 Seed/Sprout/Harvest라 성장 3단계이고, 등급은
  // 판 색(동·은·금)이 맡는다. 이모지 🥉🥈🥇는 "순위"를 말해서 이름과 어긋났다.
  'Seed Crest':        { slug: 'delapouite/plant-seed',   shape: 'disc', bg: '#A9704A', fg: '#F6E7DA' },
  'Sprout Crest':      { slug: 'lorc/sprout',             shape: 'disc', bg: '#96A0A6', fg: '#FAFCFD' },
  'Harvest Crest':     { slug: 'delapouite/grain-bundle', shape: 'disc', bg: '#C9A227', fg: '#FDF6DF' },

  // 작물과 재료 — 배경 없음
  'Wheat':             { slug: 'lorc/wheat',              shape: 'none', fg: '#B98C42' },
  'Potato':            { slug: 'delapouite/potato',       shape: 'none', fg: '#9A6E48' },
  'Chili Pepper':      { slug: 'delapouite/chili-pepper', shape: 'none', fg: '#B4402F' },

  // 원재료와 정제품이 같은 그림을 쓰고 색으로만 갈린다. 흙빛 → 금속빛인데,
  // 이름이 Iron+root라 금속색 뿌리가 문자 그대로 맞다. 이모지로는 못 하던 것.
  'Ironroot':          { slug: 'lorc/root-tip',           shape: 'none', fg: '#7A6A55' },
  'Refined Ironroot':  { slug: 'lorc/root-tip',           shape: 'none', fg: '#8FA6B2' },

  // 장비 슬롯 — 키는 SLOTS 배열과 같은 소문자다
  head:   { slug: 'delapouite/flower-hat',   shape: 'none', fg: '#3c4436' },
  chest:  { slug: 'lucasms/shirt',           shape: 'none', fg: '#4A5245' },
  legs:   { slug: 'irongamer/armored-pants', shape: 'none', fg: '#4A5245' },
  feet:   { slug: 'lorc/walking-boot',       shape: 'none', fg: '#4A5245' },
  weapon: { slug: 'lorc/scythe',             shape: 'none', fg: '#9e9994' },

  // 존 — 키는 ZONES의 id와 같다
  greenhouse: { slug: 'delapouite/greenhouse',  shape: 'none', fg: '#3F6B4F' },
  dungeon:    { slug: 'lorc/guarded-tower',     shape: 'none', fg: '#4A4A55' },
  smithy:     { slug: 'lorc/anvil-impact',      shape: 'none', fg: '#6B4A3F' },
  shelter:    { slug: 'delapouite/wood-cabin',  shape: 'none', fg: '#6B5A3F' },
}

// 배경에서 파생되는 색 — 봉지의 접힌 띠와 원판의 테두리. 표에 색을 두 개씩
// 적지 않고 계산으로 만드는 이유는, 그러면 배경색을 바꿀 때 짝이 어긋나서다.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (
    '#' +
    channels
      .map((v) => Math.max(0, Math.min(255, v + amount)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

// 원본 SVG의 좌표계. 그림은 이 사각형을 꽉 채우도록 그려져 있다.
const BOX = 512

/**
 * 아이콘 하나를 그린다.
 *
 * @param {string} of  ICONS의 키. stack은 DB name("Wheat Seed"), 슬롯·존은
 *                     소문자 id("head", "greenhouse").
 * @param {string} className  크기는 CSS가 정한다. SVG 속성으로 주면 클래스에
 *                            지고, 화면마다 크기가 달라서 CSS 쪽이 맞다.
 */
export default function Icon({ of, className }) {
  const spec = ICONS[of]

  // 표에 없는 이름은 조용히 사라지는 대신 눈에 띄게 둔다. 이모지를 걷어내는
  // 중이라 빠뜨린 자리가 있으면 화면에서 바로 보이는 편이 낫다.
  if (!spec) {
    console.warn(`Icon: "${of}" is not in the table`)
    return null
  }

  const d = ICON_PATHS[spec.slug]

  // 배경 위에 얹는 그림은 줄여야 배경 밖으로 안 나간다. scale()이 원점 기준이라
  // 줄이기만 하면 왼쪽 위로 쏠리므로, 남는 여백의 절반만큼 밀어 가운데를 맞춘다.
  //
  // 봉지가 더 작은 이유는 위쪽 띠가 y=106까지 내려와서다 — offset이 그보다
  // 커야 그림이 띠에 파묻히지 않는다. 원판에는 띠가 없어 그만큼 키울 수 있다.
  const scale = spec.shape === 'packet' ? 0.55 : 0.7
  const offset = (BOX * (1 - scale)) / 2
  const inset = `translate(${offset},${offset}) scale(${scale})`

  return (
    <svg className={className} viewBox={`0 0 ${BOX} ${BOX}`} role="img" aria-label={of}>
      {/* 씨앗 봉지 — 둥근 사각형 위에 접힌 띠를 얹는다. 띠는 그늘지는 자리라
          배경보다 어둡다. */}
      {spec.shape === 'packet' && (
        <>
          <rect x="40" y="16" width="432" height="480" rx="44" fill={spec.bg} />
          <path d="M40 60a44 44 0 0 1 44-44h344a44 44 0 0 1 44 44v46H40z" fill={shade(spec.bg, -30)} />
        </>
      )}

      {/* crest 원판 — 원 하나에 fill과 stroke를 함께 준다. 테두리는 봉지 띠와
          반대로 밝은 쪽이라, 판이 도드라져 보인다. */}
      {spec.shape === 'disc' && (
        <circle cx="256" cy="256" r="236" fill={spec.bg} stroke={shade(spec.bg, 30)} strokeWidth="18" />
      )}

      {/* 배경이 없으면 그림이 BOX를 꽉 채우고, 있으면 inset만큼 줄어든다 */}
      <g transform={spec.shape === 'none' ? undefined : inset}>
        <path d={d} fill={spec.fg} />
      </g>
    </svg>
  )
}
