# ---- 1단계: client 빌드. vite가 만든 정적 파일만 실행 단계로 넘긴다 ----
FROM node:26-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- 2단계: 빌드. tsc와 devDependencies는 여기서만 쓰고 버린다 ----
FROM node:26-slim AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ---- 3단계: 실행. 빌드 결과와 실행에 필요한 패키지만 담는다 ----
FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./dist
COPY --from=client /app/client/dist /app/client/dist
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
