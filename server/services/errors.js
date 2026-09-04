// 서비스가 라우트에게 "이건 몇 번으로 응답해라"를 알리는 방법. 여기 있는 함수는
// HTTP를 모르는 쪽과 아는 쪽 사이의 약속이다 — 서비스는 상태 코드를 붙여서
// 던지기만 하고, 실제로 res.status()를 부르는 건 라우트다.
//
// upgrade.js와 equip.js가 각자 갖고 있던 같은 모양의 헬퍼를 하나로 합쳤다
// (2026-09-04). 세 번째 서비스가 생기면서 복사본이 셋이 될 자리였고, 이건
// "목적이 달라서 중복이 아닌" 경우가 아니라 목적까지 같은 진짜 중복이다.

// details는 선택이다. 있으면 응답 본문에 그대로 실려서 클라이언트가 이유를
// 화면에 띄울 수 있다 — "3개 필요한데 1개 있음" 같은 것.
//
// 이름을 code가 아니라 reason으로 한 이유: pg의 에러 객체가 이미 code를 쓴다
// (SQLSTATE, '23514' 같은 값). 같은 이름을 겹쳐 쓰면 어느 쪽 code인지 헷갈린다.
export function serviceError(status, reason, details) {
  const err = new Error(reason);
  err.status = status;
  err.reason = reason;
  err.details = details;
  return err;
}
