// 서비스가 라우트에게 "이건 몇 번으로 응답해라"를 알리는 방법. 여기 있는 함수는
// HTTP를 모르는 쪽과 아는 쪽 사이의 약속이다 — 서비스는 상태 코드를 붙여서
// 던지기만 하고, 실제로 res.status()를 부르는 건 라우트다.
//
// upgrade.js와 equip.js가 각자 갖고 있던 같은 모양의 헬퍼를 하나로 합쳤다
// (2026-09-04). 세 번째 서비스가 생기면서 복사본이 셋이 될 자리였고, 이건
// "목적이 달라서 중복이 아닌" 경우가 아니라 목적까지 같은 진짜 중복이다.

// 그냥 Error에 칸을 덧붙이지 않고 클래스로 만든 이유: strict TS에서는 catch로
// 받은 err의 타입이 unknown(정체 모름)이라, 라우트가 status를 꺼내기 전에
// "이게 서비스가 의도해서 던진 에러인가"를 실행 중에 확인해야 한다.
// `err instanceof ServiceError` 한 줄이 그 확인이다. 타입만 선언하고 as로
// 우기는 방식은 실행 중에 구분할 방법이 없다. (2026-11-21, TS 변환 때 결정)
export class ServiceError extends Error {
  status: number;
  // 이름을 code가 아니라 reason으로 한 이유: pg의 에러 객체가 이미 code를 쓴다
  // (SQLSTATE, '23514' 같은 값). 같은 이름을 겹쳐 쓰면 어느 쪽 code인지 헷갈린다.
  reason: string;
  // details는 선택이다. 있으면 응답 본문에 그대로 실려서 클라이언트가 이유를
  // 화면에 띄울 수 있다 — "3개 필요한데 1개 있음" 같은 것. 모양이 에러마다
  // 달라서 unknown으로 둔다. 라우트는 꺼내 보지 않고 JSON에 그대로 싣기만 한다.
  details: unknown;

  constructor(status: number, reason: string, details?: unknown) {
    super(reason);
    this.status = reason;
    this.reason = reason;
    this.details = details;
  }
}

// 호출하는 쪽 17곳이 `throw serviceError(404, 'player_not_found')` 모양을 쓰고
// 있어서, 함수는 남겨 두고 안에서 클래스를 만들게 했다. 호출부는 손대지 않는다.
export function serviceError(status: number, reason: string, details?: unknown): ServiceError {
  return new ServiceError(status, reason, details);
}
