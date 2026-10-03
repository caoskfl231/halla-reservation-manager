# CSS 정리 메모 (2026-01-22)

이 문서는 `hallapa/css/style.css`에서 **정리(삭제/병합) 후보**를 안전도 기준으로 정리한 메모입니다.

## 1) 바로 정리해도 안전한 것(중복/동일 규칙)

- `#purchase-import-modal .modal-dialog { max-width: 1100px; }`
  - 아래쪽에 같은 규칙이 한 번 더 있었는데 이미 삭제됨.

## 2) “정리 가능성은 높지만” 삭제 전 확인이 필요한 것(의도적 override 가능)

- `#purchase-form .purchase-form-header-row`가 **2번 선언**됨
  - 첫 번째: `display: flex; ...` (기본 박스 스타일 포함)
  - 두 번째: `display: grid; grid-template-columns: ...`
  - 의도: 위에서 공통 박스 스타일(테두리/배경/패딩)을 잡고, 아래에서 레이아웃만 grid로 덮어쓰는 패턴일 수 있음.
  - 정리 아이디어(안전한 리팩터링):
    - “박스 스타일”과 “레이아웃 스타일”을 서로 다른 selector로 분리하거나,
    - 같은 블록 하나로 합치되 실제 화면에서 레이아웃이 동일하게 유지되는지 확인 후 적용.

- `#purchase-form .purchase-form-header-row .purchase-form-header`도 **2번 선언**됨
  - 첫 번째: `flex: 0 0 auto; ...`
  - 두 번째: `display: contents; ...`
  - 이것도 위와 동일하게 “단계적 override”일 가능성이 큼.

## 3) 레거시/주석 블록(삭제해도 되지만 기록 가치가 있을 수 있음)

- 주석 처리된 블록: `/* #purchase-modal .modal-dialog { ... } */`
  - 현재는 주석이라 동작에 영향 없음.
  - 팀/본인 기록이 필요 없으면 삭제 가능.

## 4) 모달 공통 규칙은 유지 권장

- `.modal-overlay`, `.modal-dialog`, `.modal-header`, `.modal-form`, `.modal-actions`
  - 현재 프로젝트의 “통일 모달 템플릿”이라 유지 권장.
  - 단, 반응형(@media)에서 `.modal-dialog { max-width: 95%; }` 같은 규칙은 정상적인 override라 중복으로 보이더라도 삭제 대상이 아님.

---

원하면 다음 단계로:

- `#purchase-form .purchase-form-header-row` 관련 2중 선언을 **한 블록으로 병합**
- 구매/매출/지출 화면에서 레이아웃 깨짐 여부만 빠르게 확인

까지 같이 정리해드릴 수 있습니다.
