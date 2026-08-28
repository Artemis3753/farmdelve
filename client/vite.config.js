import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 브라우저는 5173 한 곳하고만 대화하고, /api로 시작하는 요청은 dev server가
    // 3001로 대신 전달한다. 브라우저 입장에서 출처가 하나라 개발 중에는 CORS가 없다.
    //
    // 이 설정은 dev server의 기능이라 배포에는 딸려가지 않는다. 배포 후 프론트와 API를
    // 따로 올리면 브라우저가 API 서버와 직접 대화하게 되고, 그때 CORS 처리가 필요해진다.
    // 한 곳에 합쳐서 올리면(Express가 정적 파일도 서빙) 그때도 출처가 하나라 필요 없다.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
