# 통합 결제(입출금관리) 화면 정리 계획

## 목표

- 모달/리스트/폼 로직을 모듈화하여 유지보수 비용을 줄입니다.

## 진행 단계

1. 페이지 전용 CSS 분리 (진행 중 - 결제 전용 레이아웃/폼/테이블/모달/필드/요약 테이블 스타일 추가 분리 완료)
2. 모달 제어 공통화 (완료)
3. 리스트/폼/액션 모듈 분리 (진행 중 - 메인 리스트/거래 인식 리스트/거래 입력 폼/거래 인식 저장/거래처 선택 모달/좌측 요약/상단 필터/입력 피커/폼 채움/장부 선택/장부 모달 렌더/입력 모달 분리 완료)
4. 문서화 및 유지보수 가이드 추가 (진행 예정)

## 현재 구조(요약)

- js/payment-manage.js: 화면 로직 대부분 포함 (점진적으로 모듈 분리)
- js/payment-manage/payment-main-table.js: 메인 내역 테이블 렌더
- js/payment-manage/payment-actions-manager.js: 상단 액션 버튼 바인딩
- js/payment-manage/payment-import-list.js: 거래 인식 리스트/선택 렌더
- js/payment-manage/payment-form-manager.js: 거래 입력 폼 저장/바인딩
- js/payment-manage/payment-import-manager.js: 거래 인식 이벤트/저장 처리/장부 선택
- js/payment-manage/payment-import-customer-manager.js: 거래처 선택 모달 바인딩
- js/payment-manage/payment-cashflow-summary.js: 좌측 요약 렌더/이벤트
- js/payment-manage/payment-filter-manager.js: 상단 탭/검색/날짜 필터/초기화
- js/payment-manage/payment-entry-picker-manager.js: 거래 입력/장부 선택 피커
- js/payment-manage/payment-entry-modal-manager.js: 거래 입력 모달 열기/닫기/초기화
- js/payment-manage/payment-form-filler.js: 거래 수정 폼 채움
- js/payment-manage/payment-ledger-picker-manager.js: 장부 선택/반영 로직
- js/payment-manage/payment-ledger-modal-render.js: 장부 모달 렌더
- js/payment-manage/payment-modal-helpers.js: 모달 열기/닫기 헬퍼
- js/payment-manage/payment-entry-ledger-helpers.js: 장부/거래처 선택 helper
- js/payment-manage/payment-utils.js: 금액/검색/잔액/요일 헬퍼

## cashflow 스키마 정리

- cashflow_types + cashflow_items: 계정(통장/카드/현금) 용도로 통일
- 입출금 항목(공과금/급여 등)은 cashflow_groups 로 분리
- DB 업그레이드 시 direction 기반 cashflow_items 는 cashflow_groups 로 이동
- 기본값 입력은 자동 실행하지 않고, 개발/관리자 기능에서만 수동 실행
- css/style.css: 결제 관련 스타일 포함 (점진적으로 pages/payment-manage.css로 이동)
