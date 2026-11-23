// 서버 시작점. 앱의 내용(라우트·미들웨어)은 app.ts에 있고, 여기는 포트를 여는
// 일만 한다. 나눈 이유는 app.ts 맨 위 주석 — HTTP 테스트가 포트 없이 앱을 쓰기 위해서다.
//
// 파일 이름을 index.ts로 남긴 이유: package.json의 start와 Dockerfile의 CMD가
// dist/index.js를 가리킨다. 이름을 바꾸면 그 두 곳도 같이 고쳐야 한다.
import { createApp } from './app.js';

const port = process.env.PORT || 3001;

createApp().listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
