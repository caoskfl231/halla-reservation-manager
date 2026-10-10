# 할라 장부 관리

할라축산에서 사용하는 매입·매출·지출·결제 장부 웹앱입니다.
GitHub Pages는 화면과 프로그램 파일을 제공하고, Supabase는 로그인 및 공용 장부 자료를 보관합니다.

## 바로 접속하기

- [장부 홈 / 대시보드](https://caoskfl231.github.io/halla-reservation-manager/index.html)
- [로그인](https://caoskfl231.github.io/halla-reservation-manager/login.html)
- [공용 장부 설정·운영 안내](docs/ledger-cloud.md)

현재 이 저장소의 `index.html`은 **장부 대시보드**입니다.
저장소 이름이 `halla-reservation-manager`여도 이 주소를 손님 상품 주문페이지로 안내하지 마세요.

## 사용 순서

1. 장부 주소를 열고 장부 이용 권한이 있는 계정으로 로그인합니다.
2. 계정에 2단계 인증이 설정되어 있으면 인증을 완료합니다.
3. 사용할 메뉴에서 자료를 조회하고 입력·수정합니다. 서버의 저장 완료 확인을 기다립니다.
4. 다른 기기에서 변경했다는 안내가 나오면 `최신 불러오기`를 눌러 반영합니다.
5. 중요한 작업 뒤에는 홈의 `전체백업`으로 JSON 파일을 내려받아 보관합니다.

최초 자료 이전은 **아직 초기화되지 않은 공용 장부의 owner 계정**에만 표시됩니다.
`백업 파일 선택` 또는 `이 PC의 자료 옮기기`로 진행하며, 기존 PC 자료는 지우지 않습니다.
이미 공용 장부를 사용하는 계정은 로그인할 때마다 자료를 다시 옮길 필요가 없습니다.

## 화면별 파일

파일은 저장소 최상위에 있습니다. 경로 앞에 `hallapa/`를 붙이지 않습니다.

| 파일 | 화면 |
| --- | --- |
| [index.html](index.html) | 홈 / 대시보드 |
| [login.html](login.html) | 로그인 |
| [purchase-manage.html](purchase-manage.html) | 매입 전표 |
| [sales-manage.html](sales-manage.html) | 매출 전표 |
| [expense-manage.html](expense-manage.html) | 지출 전표 |
| [payment-manage.html](payment-manage.html) | 결제 관리 |
| [cashflow-manage.html](cashflow-manage.html) | 입출금 코드·분류·항목 관리 |
| [customer-manage.html](customer-manage.html) | 거래처 관리 |
| [item-manage.html](item-manage.html) | 품목 관리 |
| [transaction-report.html](transaction-report.html) | 거래 / 전표 조회·집계 |

## 폴더와 주요 모듈

| 경로 | 역할 |
| --- | --- |
| `common/nav.html` | 공통 메뉴 |
| `css/` | 공통·모바일·화면별 스타일 |
| `js/*-manage.js`, `js/main.js`, `js/transaction-report.js` | 각 화면의 동작 |
| `js/common/` | 공통 UI·날짜·검색·계산 도구 |
| `js/item-manage/`, `js/payment-manage/` | 품목·결제 화면의 기능별 모듈 |
| `js/db.js` | 공용 DB 진입점: 현재 `db-cloud.js`를 내보냄 |
| `js/db-cloud.js`, `js/db-cloud-cache.js` | 서버 저장·조회와 편집용 임시 저장소 |
| `js/db-local.js` | 이전 PC 장부자료 읽기·이전용 모듈 |
| `js/indexeddb-adapter.js` | PC 자료·공용 장부 캐시가 공유하는 IndexedDB 구현 |
| `js/cloud-session.js`, `js/ledger-login.js` | 로그인·권한 확인·로딩 화면 |
| `js/cloud-records.js`, `js/cloud-import.js` | 거래별 저장·분할 자료 가져오기 |
| `js/ledger-read-cache.js` | 사용자별 다운로드 캐시·변경분 동기화 |
| `js/home-pagination.js` | 홈 거래내역을 100건씩 표시 |
| `js/home-compute.js`, `js/home-worker.js`, `js/home-worker-client.js` | 홈 자료의 계산·정렬·필터 작업 |
| `js/ledger-backups.js`, `js/ledger-history.js` | 자동백업·수정 및 삭제 기록 화면 |
| `js/vendor/` | 외부 라이브러리와 라이선스 |
| `data/` | 기본 코드·마스터 JSON 및 장부 형식 정의 |
| `docs/` | 운영 안내·DB 설정 SQL·화면별 설명 |
| `tests/` | 동작 검증 스크립트·SQL |
| `asset-version.json` | CSS·JS 캐시 버전의 단일 관리 파일 |
| `tools/update-asset-version.mjs` | CSS·JS 주소의 버전을 일괄 갱신·검사 |

PC 자료와 공용 장부 임시 저장소는 `indexeddb-adapter.js`의 공통 구현을 사용하되,
저장소 이름·연결 수명·변경 이벤트·백업 오류 정책은 각각의 래퍼에서 설정합니다.
결제·매입·지출·입출금 화면의 원장 항목 보정은 `js/common/ledger-tx-cashflowitem-repair.js`를 사용합니다.

비슷한 이름의 파일도 서로 다른 역할을 할 수 있습니다.
특히 `db-local.js`는 이전 자료를 옮길 때 필요하므로 구버전이라는 이유만으로 삭제하지 않습니다.
`docs/`의 SQL은 설정·업그레이드용 파일이며, 폴더에 존재한다고 서버에 적용된 것은 아닙니다.
`data/`의 JSON을 현재 공용 장부 전체백업으로 취급하지 않습니다.

## 자료가 저장되는 곳

| 저장 위치 | 용도 |
| --- | --- |
| Supabase의 비공개 `halla_ledger_private` 스키마 | 공용 장부 원본 |
| 브라우저의 편집용 IndexedDB | 서버에서 받은 자료의 임시 계산·편집 |
| `hallapa_ledger_download_v1` IndexedDB | 메뉴 이동 시 재다운로드를 줄이는 사용자별 캐시 |
| 이전 `hallapa_db` IndexedDB | 기존 PC에서 사용하던 장부자료 |
| `localStorage` / `sessionStorage` | 로그인 상태·저장한 이메일·화면 설정 등 |

현재 공용 DB 연결은 [js/db.js](js/db.js), 이전 PC DB 구현은 [js/db-local.js](js/db-local.js)에 있습니다.
브라우저 캐시는 백업이 아닙니다. 브라우저 데이터 삭제는 Supabase 공용 장부 초기화 방법이 아니며,
아직 옮기지 않은 이전 PC 자료나 로그인 상태를 잃을 수 있습니다.

일반 저장은 변경된 기록과 버전을 서버에서 확인합니다.
같은 기록이 다른 기기에서 먼저 바뀌면 충돌을 안내합니다.
다른 기기의 변경 여부를 확인해도 작성 중인 화면을 자동으로 덮어쓰지 않습니다.
오프라인 편집·자동 병합은 제공하지 않습니다.

## 백업과 복구

- **전체백업**: 현재 장부의 JSON 파일을 내려받습니다. 파일을 따로 보관하세요.
- **전체복구**: owner 권한으로 백업 자료를 반영합니다. 먼저 현재 자료를 전체백업하고 복구 방식과 날짜를 확인하세요. 덮어쓰기 복구는 백업 이후 기록을 현재 장부에서 없앨 수 있습니다.
- **자동백업**: 관련 서버 설정 적용 시 한국 시간 매일 새벽 3시에 보관하며 최근 30일분을 확인할 수 있습니다.
- **수정·삭제 기록**: 관련 서버 설정 적용 후 변경 직전 내용을 확인하고 owner가 기록 하나를 복구할 수 있습니다. 기능 적용 전에 사라진 자료나 서버에 저장되지 않은 입력은 이 기능으로 복원할 수 없습니다.

자동백업과 변경 이력은 같은 데이터베이스 안에 보관되므로 내려받은 외부 백업도 유지하세요.
서버 응답이 끊겨 저장 결과가 불확실하면 같은 작업을 바로 반복하지 말고 `최신 불러오기`로 결과를 확인하세요.
설정·권한·운영 제한은 [공용 장부 안내](docs/ledger-cloud.md)를 참고하세요.

## 개발 및 점검

HTML + JavaScript ES 모듈 방식이며 파일을 직접 더블클릭하는 대신 HTTP 서버로 실행합니다.

1. VS Code에서 저장소 폴더를 엽니다.
2. Windows에서는 최상위의 `start-dev-server.cmd`를 실행하거나 Live Server로 `index.html`을 엽니다.
3. 로그인·서버 저장 기능은 인터넷 연결과 승인된 장부 계정이 필요합니다.

검증 코드는 `tests/`, 배포 전 버전 갱신 스크립트는 `tools/`에 있습니다.
예를 들어 Node.js에서 홈 성능 점검을 실행할 수 있습니다.

```sh
node --test tests/home-performance.test.cjs
```

### CSS·JS 캐시 버전 갱신

1. CSS 또는 JavaScript를 변경한 배포에서는 `asset-version.json`의 `version`을 새로운 값으로 바꿉니다.
2. 아래 명령으로 각 HTML의 CSS·JS, 모듈 import, 동적 import와 Worker 주소를 일괄 갱신합니다.
3. 변경된 파일들을 함께 커밋·배포합니다. GitHub Pages는 이 스크립트를 자동 실행하지 않습니다.

```sh
node tools/update-asset-version.mjs
node tools/update-asset-version.mjs --check
```

`--check`는 파일을 수정하지 않고 누락된 참조가 있으면 종료 코드 1로 알려줍니다.
버전이 없던 공통 CSS에도 버전을 붙입니다. 외부 URL·존재하지 않는 경로·다른 쿼리·해시·라이선스 및 vendor 원본은 변경하지 않습니다.
페이지의 `?v=`를 직접 고치지 말고 이 절차를 사용하세요. 데이터베이스나 로그인 정보를 초기화하지 않습니다.

휴대폰에서도 HTTPS 장부 주소로 접속하세요. 개인 브라우징이나 브라우저 데이터 정리는
로그인과 임시 자료 유지에 영향을 줄 수 있으므로 중요한 입력 뒤에는 서버 저장 완료를 확인하세요.

배포 ZIP에는 불필요한 로컬 변경 이력 폴더 `.history/`를 포함하지 않습니다.
