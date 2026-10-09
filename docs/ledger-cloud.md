# 로그인과 공용 장부

GitHub Pages는 화면을 제공하고 Supabase는 로그인 및 공용 장부를 보관한다.
장부 DB는 주문 DB와 별도인 비공개 halla_ledger_private 스키마에 있다.
기존 승인된 주문 관리자만 초기 owner가 되고, 일반 Auth 가입은 장부 접근 권한을 만들지 않는다.
TOTP가 설정된 계정은 서버에서 aal2를 요구한다.

## 사용자 추가

Supabase Authentication에서 새 계정을 만든 뒤 정확한 이메일로 권한을 부여한다.
회원가입만으로는 접근할 수 없다. 사용자 확인 후 아래 SQL을 실행한다.

```sql
insert into halla_ledger_private.members(user_id, role)
select id, 'editor' from auth.users
where lower(email) = lower('확인된 사용자 이메일')
  and email_confirmed_at is not null and is_anonymous is not true
on conflict (user_id) do update set role = 'editor';
```

## 기존 자료 이전

첫 owner 로그인 후 '백업 파일 선택' 또는 '이 PC의 자료 옮기기'를 사용한다.
이 PC의 자료는 IndexedDB hallapa_db에서 읽으며 기존 데이터는 지우지 않는다.
서버 revision=0일 때만 최초 자료 이전이 허용된다.
백업 JSON의 meta.dbName과 키를 검증하며 기본값으로 기존 자료를 덮어쓰지 않는다.

## 저장과 동시 작업

공용 장부 한 개를 JSON 스냅샷과 revision으로 저장한다. 서버는 행 잠금과
예상 revision 비교로 저장 충돌을 거절한다. 저장 응답을 받은 후에만 저장 완료를 표시한다.
저장 결과가 불확실하거나 충돌하면 재전송하지 않고 '최신 불러오기'로 확인하게 한다.
전체 복구 전 스냅샷은 restore_history에 남는다.

각 페이지는 독립적인 임시 IndexedDB에 로그인 후 받은 자료를 적재한다.
기존 장부 모듈의 계산과 정규화는 유지한다. 페이지를 닫으면 임시 DB를 정리한다.
다른 기기의 변경 여부를 15초마다 확인하며 작성 중인 화면을 자동으로 새로고침하지 않는다.
사용자가 '최신 불러오기'를 눌러 반영한다.

오프라인 편집·자동 병합은 제공하지 않는다. 전체 스냅샷은 최대 25MB로 제한된다.
기존 UI의 한 동작이 DB 함수를 여러 번 호출하면 각 호출이 개별 서버 저장이다.
이 구조는 대규모 사용·높은 동시 편집에 적합하지 않으며 행 단위 API로 확장이 필요하다.
로그인 토큰은 주문페이지와 다른 sessionStorage 키를 사용하며 비밀번호는 저장하지 않는다.
