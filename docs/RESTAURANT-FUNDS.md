# 식당 자금관리와 매입 지불
자금관리: restaurant-funds.html?business=restaurant
매입 지불: restaurant-purchases.html?business=restaurant

- 계좌 시작일/시작잔액을 직접 등록한다. 카드 미결제금은 음수 잔액이다.
- 입금/출금은 자금 이동만 기록하며 비용을 다시 생성하지 않는다.
- transfer는 출금계좌 차감과 입금계좌 증액을 한 전표로 처리한다. 카드대금 납부도 transfer이다.
- purchase는 식당 fund_entries + fund_allocations, 정육점 transactions 수금 + ledger_tx 입금을 단일 PostgreSQL 트랜잭션으로 기록한다.
- purchase에는 원본 매입 ID 배열을 전달한다. 부분 지불은 배열 순서대로 미지급금에 배분한다.
- 정육점 기존 수금으로 잔여 미수금이 더 작으면 초과 지불을 차단한다. 기존 수금의 매입별 소급 배분은 수행하지 않는다.
- 취소는 식당 전표에 취소일을 기록하고 정육점 수금/입금 레코드를 tombstone 처리한다. 재등록으로 금액을 수정한다.
- 원본 매입 수정·삭제는 연결 지불을 먼저 취소해야 한다. 연결 수금은 정육점에서 직접 수정할 수 없다.
- 실제 은행 송금 기능이 아니다.
- 지출 등록과 자금 출금 자동 연결은 포함하지 않는다. 일반 출금과 지출 비용은 별도 기록이다.
- 기존 장부 JSON 백업에는 새 fund_* 테이블이 포함되지 않는다. 서버 DB 백업 대상이며, 별도 JSON 백업/복원 기능은 아직 없다.

보안: 비공개 스키마 + RLS + 직접 테이블 권한 회수. 공개 wrapper는 SECURITY INVOKER, 내부 함수는 기존 require_member/MFA 검증을 수행한다.
동시성: 정육점 state → 식당 state 순서의 행 잠금. UUID 요청 멱등성. 응답 유실 시 동일 요청을 재시도한다.
서버 마이그레이션: restaurant_funds_and_purchase_payments / restaurant_fund_guard_alias_fix / restaurant_fund_account_update_fix.
검증: tests/restaurant-funds-rollback.sql의 모든 거래는 롤백한다. 부분 지불, 이중 요청, 초과 지불, 잔액, 이체, 취소, 원본 보호, 계좌 수정, 카드 납부, 비회원 접근 차단.
브라우저 자동 검증은 실행 환경의 소켓 제한 때문에 수행하지 못했다. JavaScript 문법과 DOM ID 연결은 정적 검사했다.
