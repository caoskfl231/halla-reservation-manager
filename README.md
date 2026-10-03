# 할라 장부 관리

브라우저에서 실행되는 정적(빌드 없음) HTML + ES 모듈 기반 장부 관리 웹앱입니다.

## 폴더 구조

- `hallapa/index.html` : 홈/대시보드
- 관리 화면
  - `hallapa/purchase-manage.html` : 매입 전표
  - `hallapa/sales-manage.html` : 매출 전표
  - `hallapa/expense-manage.html` : 지출 전표
  - `hallapa/payment-manage.html` : 결제 관리
  - `hallapa/cashflow-manage.html` : 입출금 코드(구분/분류/항목)
  - `hallapa/customer-manage.html` : 거래처 마스터
  - `hallapa/item-manage.html` : 품목 마스터
- `hallapa/transaction-report.html` : 거래/전표 조회(집계)
- `hallapa/js/db.js` : 공통 DB 모듈(IndexedDB)
- `hallapa/js/*-manage.js` : 화면별 스크립트(ES module)
- `hallapa/js/common/` : 공용 UI/유틸 모듈
- `hallapa/css/style.css` : 기본 스타일

## 데이터 저장소

- 데이터는 브라우저 **IndexedDB**에 저장됩니다.
  - DB 이름: `hallapa_db`
  - 버전: `DB_VERSION` (코드는 [hallapa/js/db.js](hallapa/js/db.js) 참고)
- 결제/입출금 원장(ledger)은 같은 DB의 `ledger_tx` object store를 사용합니다.
  - 레거시 DB(`halla_ledger_db_v1`)는 더 이상 사용하지 않습니다.
- 일부 화면의 필터/입력값 같은 UI 상태는 `localStorage`를 사용할 수 있습니다.

## 실행 방법

1. VS Code에서 이 폴더를 열고
2. 가능한 한 **로컬 서버로 실행**하세요. (브라우저 정책에 따라 파일 더블클릭(file://)은 일부 기능이 제한될 수 있습니다)
   - `hallapa/start-dev-server.cmd` 실행 또는
   - Live Server 확장으로 `hallapa/index.html` 실행

## 점검 스크립트(tools)

`tools/` 폴더에 간단한 정적 점검 PowerShell 스크립트가 있습니다.

- 예: `Audit: DOM id mismatch` 태스크(HTML의 id와 JS의 getElementById 사용처 불일치 점검)

프로젝트가 확장되면서 도구/문서/구조가 어긋나지 않도록, 새 화면/공용 모듈을 추가한 경우 점검 스크립트 결과도 함께 확인하는 것을 권장합니다.

## 백업/복구/초기화(운영 필수)

현재 화면별로 일부 JSON 내보내기/가져오기 기능이 있습니다(예: 거래처/품목, 장부관리 등).
운영에서는 **정기 백업**을 권장합니다.

- 홈 화면에 `전체백업`(JSON 다운로드), `전체복구`(덮어쓰기/추가 복구 선택) 기능이 있습니다.

- 초기화(데이터 삭제)
  - Chrome/Edge DevTools → Application → IndexedDB → `hallapa_db` 삭제
  - 또는 사이트 데이터/저장공간에서 해당 사이트 데이터 삭제

## iPhone(iOS Safari) 운영 주의

IndexedDB는 iOS Safari 환경 영향을 받을 수 있습니다.

- 개인 브라우징(시크릿)에서는 데이터가 저장되지 않거나 쉽게 초기화될 수 있습니다.
- 저장공간 부족/웹사이트 데이터 정리로 데이터가 삭제될 수 있습니다.

운영 권장:

- 개인 브라우징 금지
- 정기 백업 필수
- 가능하면 HTTPS 환경에서 사용 (사설/로컬 환경에서도 Safari 정책이 더 안정적)

## 배포 ZIP 참고

배포/업로드용 ZIP에는 `.history/`를 포함하지 않는 것을 권장합니다.
이 저장소는 `.gitignore`에서 `.history/`를 제외하도록 설정되어 있습니다.
