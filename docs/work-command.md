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

## 2차 개발: 입금 장부·중복 확인·최종 확인

collection-confirm.js가 실제 cashflow_items의 사용 중인 장부명을 선택하고, 기존 인증 읽기 RPC로 최신 거래를 조회한다. 같은 거래처·날짜·금액의 매출 수금은 통장과 관계없이 중복 후보로 차단한다. 선택 날짜까지의 기존 잔액과 수금 후 잔액을 표시하며 초과 수금은 경고한다.

collection-workflow.js는 확인 체크·재조회·중복 검사·단일 제출·불확실한 저장 결과 재시도 금지를 담당한다. collection-save-adapter.js는 기존 원자적 saveTransactionBatch 경로를 재사용하는 저장 어댑터다. 자동 테스트에서만 가짜 write를 주입해 저장 성공/실패/중복 클릭을 검증했다.

**실제 UI는 enabled:false 고정이며 저장 어댑터를 import하지 않는다.** 개발 미리보기는 최종 검증 완료까지만 수행한다. 실제 저장 활성화 전에는 서버 측 동시 수금 중복 방지/요청 멱등성을 구현해야 한다. 클라이언트 사전 조회만으로 다른 기기의 동시 입력을 방지할 수 없다. 현재 운영 저장은 미활성 상태다.

검증: node --experimental-vm-modules --test tests/*.test.cjs — 58개 통과.
