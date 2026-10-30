import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 테스트 전용 DB 주소를 여기에 박아 둔다. 셸의 DATABASE_URL이나 .env를 읽지
    // 않으므로 개발 DB 주소가 섞여 들어올 길이 없다. 접속은 OS 사용자 이름으로
    // 이뤄진다(비밀번호 없음).
    //
    // 이 값은 테스트 워커 안의 process.env에만 들어간다. db/pool.js가 import되는
    // 순간 읽으므로, 서비스를 import하는 테스트보다 먼저 정해져 있어야 한다.
    env: {
      DATABASE_URL: 'postgresql://localhost/farmdelve_test',
    },

    // 모든 테스트 파일이 시작되기 전에 먼저 실행된다. 연습 주방이 맞는지 점검하는 곳.
    setupFiles: ['./test/setup.js'],

    // 테스트 파일들이 한 DB를 같이 쓰므로 파일을 하나씩 차례로 돌린다. 병렬이면
    // 한 파일이 "재료 5개"로 맞춰 놓은 순간 다른 파일이 그 행을 바꿔 버린다.
    // (한 파일 안의 테스트들은 원래 차례대로 돈다.)
    fileParallelism: false,
  },
});
