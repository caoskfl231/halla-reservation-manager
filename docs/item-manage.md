# 품목 관리 모듈 구조

## 개요

품목 관리 화면은 모듈 단위로 역할을 분리해 유지보수를 쉽게 구성합니다.

## 파일 구성

- js/item-manage.js: 화면 초기화 및 모듈 연결
- js/item-manage/item-form-manager.js: 품목 입력 폼/검증/계산/저장
- js/item-manage/item-list-manager.js: 목록 렌더링/검색/정렬/키보드 이동
- js/item-manage/item-group-manager.js: 분류 목록/모달 CRUD
- js/item-manage/item-actions-manager.js: 상단 버튼(신규/수정/삭제/JSON) 이벤트
- js/common/modal-manager.js: 모달 열기/닫기 + 변경(dirty) 감지
- js/item-manage/item-utils.js: ID 생성, 정렬/이익 계산 유틸
- js/item-manage/price-utils.js: 가격/마진 계산 유틸
- js/item-manage/item-data-loader.js: JSON 불러오기
- css/pages/item-manage.css: 품목 관리 전용 스타일

## 주요 흐름

1. item-manage.js 에서 각 매니저를 생성
2. 목록 선택 시 `item-form-manager.loadToForm()` 호출
3. 폼 저장 시 `item-form-manager`가 DB 저장 + 목록 갱신
4. 분류 변경 시 `item-group-manager`가 리스트 및 콤보 갱신

## 유지보수 팁

- 폼 필드 추가 시 `item-form-manager`와 스냅샷(모달 dirty) 동기화
- 테이블 컬럼 변경 시 `item-list-manager` 렌더링 템플릿 수정
- 분류 정책 변경 시 `item-group-manager`만 수정
