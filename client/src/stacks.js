// 가방(player.stacks)을 다루는 함수. 온실의 수확과 던전의 클리어 보상이 같이 쓴다 — 서버가 두
// 응답을 같은 모양(stacks = "이제 얼마인가")으로 보내서, 합치는 규칙도 한 곳에만 두었다. 두 화면에
// 따로 적으면 한쪽만 고쳐지는 날 가방 숫자가 화면마다 달라진다.

// 서버가 보낸 스택 한 줄(updated)을 가방에 반영한 새 배열을 돌려준다.
//
// map 하나로는 안 되는 자리다. map은 있는 줄을 갈아끼울 뿐 배열의 길이를 못
// 바꾸는데, player_stack은 0개가 되면 행이 사라지는 설계라 처음 얻는 재료는
// stacks에 아예 없다. 그대로 두면 서버가 보낸 재료가 에러도 경고도 없이
// 사라진다.
//
// find가 아니라 some인 이유는, 여기서 필요한 것이 찾은 물건이 아니라 갈래를
// 가르는 판정 하나뿐이기 때문이다. 아래에서 같은 비교를 한 번 더 하게 되지만
// 스택 목록이 열 줄 남짓이라, 그 비용보다 읽기 쉬운 쪽을 골랐다.
export function mergeStack(stacks, updated) {
  const held = stacks.some((s) => s.stackTemplateId === updated.stackTemplateId)

  // 둘 다 새 배열을 만든다. push로 원본을 늘리면 배열이 "그 배열" 그대로라
  // React가 바뀐 것을 못 알아채고 화면을 다시 그리지 않는다.
  return held
    ? stacks.map((s) => (s.stackTemplateId === updated.stackTemplateId ? updated : s))
    : [...stacks, updated]
}
