// 모든 테스트 파일 앞에서 한 번씩 실행되는 안전장치.
//
// 테스트는 재료와 장비를 마음대로 고쳐 쓴다. 이게 개발 DB에서 돌면 진행 상황이
// 날아가므로, "지금 연결된 DB가 정말 테스트용인가"를 시작 전에 확인하고 아니면
// 모든 테스트를 멈춘다.
import { beforeAll, afterAll } from 'vitest';
import pool from '../db/pool.js';

beforeAll(async () => {
  // 주소 문자열을 파싱하지 않고 서버에게 직접 묻는다. 주소에 DB 이름이 빠져 있으면
  // pg가 OS 사용자 이름의 DB로 접속하는데, 그 경우 문자열 검사는 속지만 서버가
  // 말해 주는 이름은 거짓말을 못 한다.
  const result = await pool.query('SELECT current_database() AS name');
  const name = result.rows[0].name;

  if (!name.endsWith('_test')) {
    throw new Error(
      `테스트가 "${name}" DB에 연결됐다. 이름이 _test로 끝나는 DB에서만 돌린다.`,
    );
  }
});

// 풀을 닫지 않으면 열린 연결 때문에 테스트 프로세스가 끝나지 못하고 매달릴 수 있다.
afterAll(async () => {
  await pool.end();
});
