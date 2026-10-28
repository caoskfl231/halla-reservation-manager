# 규칙 기반 업무명령 1차

진입: 공통 메뉴의 AI 업무명령 → work-command.html. 외부 AI API와 추가 의존성 없음.

지원 문장:
- 오늘 연경 30만원 이체 수금
- 어제 연경 1.5만원 현금 수금
- 2026-10-28 연경 300,000원 카드 수금
- 거래처 연경 조회

날짜 생략은 Asia/Seoul 오늘. 만원 또는 원 단위를 인식하며 정수 원 금액만 허용.
거래처 코드/이름 완전 일치를 우선하고 없으면 이름 부분일치 후보 표시.
동명 후보를 보존하며 모든 수금 미리보기는 사용자가 거래처를 선택해야 표시.
비활성/상태 미확인 거래처는 조회할 수 있으나 수금 미리보기 불가.
선택 후 입력이 바뀌면 결과 즉시 제거. 늦게 도착한 조회 응답은 폐기.
금액·날짜 오류, 지원하지 않는 문장 및 복합 명령은 거절.

## 확인한 기존 저장 경로

- js/db.js → js/db-cloud.js → 인증 세션 + 서버 동기화 + IndexedDB 읽기 캐시.
- 거래처 읽기: getCustomers(). 기존 로그인/권한 경로를 사용하며 정적 샘플 데이터로 대체하지 않음.
- Supabase 프로젝트 xmsadsxzfoamgmghrkey에서 halla_ledger_private.records의 store_name / record_key / row_data / version / payload_bytes 구조를 읽기 전용 SQL로 확인.
- 활성 row_data 기준 customers 84건, transactions 18,761건, ledger_tx 6,391건을 확인(2026-10-28 조사 시점).
- 기존 수금 저장: js/common/cashflow-payment-record.js의 saveCashflowLedgerLinkedPaymentRecord → saveTransactionBatch. 거래내역과 입금 장부를 함께 저장.
- 이 기능은 위 저장 함수를 가져오거나 호출하지 않음. 새 테이블·마이그레이션·운영 데이터 변경 없음.

## 제한과 후속 단계

현재 결과는 저장 가능한 전표가 아닌 검토용 미리보기다. 결제수단과 실제 입금 계좌/장부 선택은 별개이며 계좌를 추정하지 않는다.
잔액 계산, 중복 수금 검사, 할인, 실제 저장은 범위 밖이다. 저장 기능 추가 시 계좌 선택·중복 검사·최신 잔액 검증과 기존 원자적 저장 경로가 필요하다.
실제 로그인 브라우저에서의 UI/권한 검증은 별도로 필요하다. 자동 검증은 운영 DB를 쓰지 않는 규칙 테스트와 기존 회귀 테스트로 수행한다.

검증: node --experimental-vm-modules --test tests/*.test.cjs (54 tests passed).
