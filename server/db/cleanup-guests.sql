-- 30일 동안 안 온 게스트를 지운다. EC2의 cron이 한 달에 한 번 psql로 실행한다
-- (2026-11-23 결정: 서버 안의 타이머가 아니라 cron — 앱이 꺼져 있어도 돌고, 새
-- 라이브러리가 필요 없고, psql이 "DELETE 3"처럼 지운 수를 찍어 cron 로그에 남는다).
--
-- 자식 행(장비·슬롯·재료·밭·던전 기록)은 따로 지우지 않는다. 다섯 테이블 모두 player를
-- ON DELETE CASCADE로 가리켜서 이 한 문장에 딸려 지워진다(schema.sql).
--
-- last_seen_at은 쿠키가 필요한 요청마다 now()로 당겨진다(services/guest.ts의
-- touchGuest). 그러니 30일 넘게 그 값이 안 바뀐 게스트는 30일 넘게 게임을 안 연
-- 것이다. 한 번도 다시 안 온 게스트도 걸린다 — 열의 기본값이 NULL이 아니라 생성
-- 시각이라서다(NULL은 어떤 비교에도 참이 되지 않아 영원히 남는다).
--
-- seed가 만든 개발용 플레이어 1도 같은 규칙을 따른다. 배포 DB에서 그 쿠키를 가진
-- 사람은 없으므로, 30일 뒤 지워지는 게 맞다.
DELETE FROM player
 WHERE last_seen_at < now() - interval '30 days';
