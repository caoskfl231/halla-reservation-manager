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
  panel.style.cssText = 'position:sticky;top:0;z-index:100000;background:#f3f5f8;border-bottom:1px solid #c7d2df;padding:8px 16px;box-sizing:border-box;box-shadow:0 2px 8px #0002;color:#172231;font:14px system-ui,sans-serif';
  const title = document.createElement('strong'); title.textContent = '장부 불러오기';
  const message = document.createElement('p'); message.style.cssText = 'margin:4px 0;font-size:13px';
  const skeleton = document.createElement('div');
  skeleton.style.cssText = 'position:relative;height:20px;background:#e2e8f0;border:1px solid #94a3b8;overflow:hidden';
  skeleton.setAttribute('role','progressbar');
  skeleton.setAttribute('aria-valuemin','0'); skeleton.setAttribute('aria-valuemax','100');
  const fill = document.createElement('div'); fill.style.cssText = 'height:100%;width:0%;background:#9bb9d9';
  const percent = document.createElement('span'); percent.textContent = '0%';
  percent.style.cssText = 'position:absolute;inset:0;text-align:center;font-weight:700;line-height:20px;color:#172231';
  skeleton.append(fill, percent);
  const setProgress = (completed, total, done = false) => {
    const n = total > 0 ? Math.floor(Math.max(0, completed) / total * 100) : 0;
    const value = done ? 100 : Math.min(99, n);
    fill.style.width = value + '%'; percent.textContent = value + '%';
    skeleton.setAttribute('aria-valuenow', String(value));
  };
  setProgress(0, 0);
  const progress = event => {
    const d=event.detail;
    setProgress(d.completed, d.total);
    message.textContent=`자료 불러오는 중 · ${d.completed.toLocaleString('ko-KR')} / ${d.total.toLocaleString('ko-KR')}건`;
  };
  globalThis.addEventListener?.('ledger:load-progress',progress);
  const retry = document.createElement('button'); retry.textContent = '다시 불러오기'; retry.hidden = true;
  retry.style.cssText = 'min-height:40px;border:0;border-radius:6px;padding:0 16px;background:#153a60;color:white;font:inherit;font-weight:700;cursor:pointer';
  panel.append(title, message, skeleton, retry); document.body.prepend(panel);
  return { panel, message, retry, skeleton, setProgress, cleanup(){globalThis.removeEventListener?.('ledger:load-progress',progress);} };
}
let cacheProgressUI;
globalThis.addEventListener?.('ledger:cache-progress', event => {
  const d = event.detail;
  if (!cacheProgressUI) cacheProgressUI = loadingPanel();
  cacheProgressUI.message.textContent = d.error ? '화면 준비에 실패했습니다. 최신 불러오기를 눌러 주세요.'
    : `화면 준비 중 · ${d.completed.toLocaleString('ko-KR')} / ${d.total.toLocaleString('ko-KR')}건`;
  cacheProgressUI.setProgress(d.completed, d.total, d.done);
  if (d.done || d.error) {
    cacheProgressUI.cleanup(); cacheProgressUI.panel.remove(); cacheProgressUI = null;
  }
});
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
    ui.message.textContent = '연결 확인 및 자료 불러오는 중…';
    ui.setProgress(0, 0);
    ui.retry.hidden = true; ui.retry.disabled = true;
    ui.skeleton.hidden = false;
    try {
      const state = await load();
      ui.setProgress(1, 1, true);
      ui.cleanup(); ui.panel.remove();
      return state;
    } catch (error) {
      if (sessionRejected(error)) {
        ui.cleanup();
        clearSession();
        sessionStorage.setItem('hallapa_ledger_login_error', friendlyError(error));
        loginRedirect();
        return new Promise(() => {});
      }
      ui.message.textContent = friendlyLoadError(error);
      ui.skeleton.hidden = true;
      ui.retry.hidden = false; ui.retry.disabled = false;
      await new Promise(resolve => ui.retry.onclick = () => {
        ui.retry.onclick = null; ui.retry.disabled = true; resolve();
      });
    }
  }
}
