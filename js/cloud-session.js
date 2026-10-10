const BASE = 'https://xmsadsxzfoamgmghrkey.supabase.co';
const KEY = 'sb_publishable_03ezjt9WvjmI0d7qtt99Iw_JlHjy7i_';
const SESSION_KEY = 'hallapa_ledger_session_v1';
const EMAIL_KEY = 'hallapa_ledger_saved_email_v1';
let refreshing;
let sessionGeneration = 0;

export function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function sessionIdentity() {
  const value = session();
  if (value?.user?.id) return value.user.id;
  try { return JSON.parse(atob(value.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub || null; }
  catch { return null; }
}
export function autoLoginEnabled() { return !!localStorage.getItem(SESSION_KEY); }
export function savedEmail() { return localStorage.getItem(EMAIL_KEY) || ''; }
export function rememberEmail(email, enabled) {
  if (enabled) localStorage.setItem(EMAIL_KEY, String(email || '').trim());
  else localStorage.removeItem(EMAIL_KEY);
}
export function keepSession(value, persistent = !sessionStorage.getItem(SESSION_KEY) && autoLoginEnabled()) {
  const normalized = { ...value, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
  const target = persistent ? localStorage : sessionStorage;
  const other = persistent ? sessionStorage : localStorage;
  target.setItem(SESSION_KEY, JSON.stringify(normalized));
  other.removeItem(SESSION_KEY);
}
export function setAutoLogin(enabled) { const current = session(); if (current) keepSession(current, enabled); }
export function clearSession() { sessionGeneration++; sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }
export function nextPage() {
  const next = new URLSearchParams(location.search).get('next') || 'index.html';
  return /^[a-z-]+\.html$/.test(next) && next !== 'login.html' ? next : 'index.html';
}
export function loginRedirect() {
  const page = location.pathname.split('/').pop() || 'index.html';
  location.replace('login.html?next=' + encodeURIComponent(page));
}
export function friendlyError(error) {
  const text = error?.message || String(error);
  if (/LOGIN_REQUIRED/.test(text)) return '로그인이 필요합니다. 로그인 화면에서 다시 접속해 주세요.';
  if (/MFA_REQUIRED/.test(text)) return '2단계 인증이 필요합니다. 다시 로그인해 주세요.';
  if (/LEDGER_ACCESS_DENIED|OWNER_REQUIRED|permission denied/.test(text)) return '이 계정에는 장부 이용 권한이 없습니다. 관리자에게 요청해 주세요.';
  if (/Invalid login credentials/.test(text)) return '아이디 또는 비밀번호를 확인해 주세요.';
  if (/LEDGER_CONFLICT|ALREADY_INITIALIZED/.test(text)) return '다른 사람이 먼저 저장했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.';
  if (/LEDGER_RECORD_CONFLICT/.test(text)) return '같은 거래를 다른 기기에서 먼저 변경했습니다. 입력 내용을 메모한 뒤 최신 불러오기로 확인해 주세요.';
  if (/fetch|network|Failed|timeout|timed out|abort/i.test(text)) return '서버 응답을 확인하지 못했습니다. 인터넷 연결을 확인하고 최신 불러오기로 저장 결과를 확인해 주세요. 같은 저장을 바로 다시 누르지 마세요.';
  return text;
}
export function sessionRejected(error) {
  return [401,403].includes(error?.status) || /LOGIN_REQUIRED|MFA_REQUIRED|LEDGER_ACCESS_DENIED/.test(error?.message || '');
}
export function friendlyLoadError(error) {
  if (/fetch|network|Failed|timeout|timed out|abort/i.test(error?.message || ''))
    return '장부를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 불러오기를 눌러 주세요. 로그인 정보와 저장된 장부는 삭제되지 않았습니다.';
  return '장부를 불러오지 못했습니다. ' + friendlyError(error);
}
function loadingPanel() {
  const panel = document.createElement('section');
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#f3f5f8;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box';
  const card = document.createElement('div');
  card.style.cssText = 'width:100%;max-width:420px;padding:28px;box-sizing:border-box;border-radius:18px;background:white;color:#172231;font-family:system-ui,sans-serif;line-height:1.7;text-align:center';
  const title = document.createElement('h2'); title.textContent = '장부 불러오기';
  const message = document.createElement('p');
  const retry = document.createElement('button'); retry.textContent = '다시 불러오기'; retry.hidden = true;
  retry.style.cssText = 'min-height:48px;width:100%;border:0;border-radius:10px;background:#153a60;color:white;font:inherit;font-weight:700;cursor:pointer';
  card.append(title, message, retry); panel.append(card); document.body.append(panel);
  return { panel, message, retry };
}
export async function request(path, body, token, timeoutMs = 30000) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
  });
  const data = response.ok ? await response.json() : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error_description || data.error || '연결에 실패했습니다.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export async function accessToken() {
  const current = session();
  if (!current?.access_token) throw new Error('LOGIN_REQUIRED');
  if (current.expires_at * 1000 > Date.now() + 60000) return current.access_token;
  if (!refreshing) {
    const generation = sessionGeneration;
    const persistent = !sessionStorage.getItem(SESSION_KEY) && autoLoginEnabled();
    refreshing = request('/auth/v1/token?grant_type=refresh_token', { refresh_token: current.refresh_token })
      .then(value => {
        if (generation !== sessionGeneration || !session()) throw new Error('LOGIN_REQUIRED');
        keepSession(value, persistent); return value.access_token;
      })
      .catch(error => { if (generation === sessionGeneration && [400,401,403].includes(error.status)) { clearSession(); loginRedirect(); } throw error; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}
export async function rpc(name, body = {}) {
  return request('/rest/v1/rpc/' + name, body, await accessToken(), ['halla_ledger_save','halla_ledger_import_finish','halla_ledger_patch_compact','halla_ledger_read','halla_ledger_sync'].includes(name) ? 120000 : 30000);
}
export async function signOut() {
  const current = session();
  clearSession();
  try { await request('/auth/v1/logout?scope=local', {}, current?.access_token); } catch {}
  location.replace('login.html');
}
export async function requireLedgerSession(load = () => rpc('halla_ledger_read')) {
  if (!session()?.access_token) {
    loginRedirect();
    return new Promise(() => {});
  }
  const ui = loadingPanel();
  for (;;) {
    ui.message.textContent = '선택한 메뉴의 자료를 불러오는 중입니다. 자료가 많으면 시간이 걸릴 수 있습니다.';
    ui.retry.hidden = true; ui.retry.disabled = true;
    try {
      const state = await load();
      ui.panel.remove();
      return state;
    } catch (error) {
      if (sessionRejected(error)) {
        clearSession();
        sessionStorage.setItem('hallapa_ledger_login_error', friendlyError(error));
        loginRedirect();
        return new Promise(() => {});
      }
      ui.message.textContent = friendlyLoadError(error);
      ui.retry.hidden = false; ui.retry.disabled = false;
      await new Promise(resolve => ui.retry.onclick = () => {
        ui.retry.onclick = null; ui.retry.disabled = true; resolve();
      });
    }
  }
}
