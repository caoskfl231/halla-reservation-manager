const BASE = 'https://xmsadsxzfoamgmghrkey.supabase.co';
const KEY = 'sb_publishable_03ezjt9WvjmI0d7qtt99Iw_JlHjy7i_';
const SESSION_KEY = 'hallapa_ledger_session_v1';
let refreshing;

export function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
export function keepSession(value) {
  const normalized = { ...value, expires_at: value.expires_at || Math.floor(Date.now() / 1000) + (value.expires_in || 3600) };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
}
export function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
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
  if (/MFA_REQUIRED/.test(text)) return '2단계 인증이 필요합니다. 다시 로그인해 주세요.';
  if (/LEDGER_ACCESS_DENIED|OWNER_REQUIRED|permission denied/.test(text)) return '이 계정에는 장부 이용 권한이 없습니다. 관리자에게 요청해 주세요.';
  if (/Invalid login credentials/.test(text)) return '아이디 또는 비밀번호를 확인해 주세요.';
  if (/LEDGER_CONFLICT|ALREADY_INITIALIZED/.test(text)) return '다른 사람이 먼저 저장했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.';
  if (/LEDGER_RECORD_CONFLICT/.test(text)) return '같은 거래를 다른 기기에서 먼저 변경했습니다. 입력 내용을 메모한 뒤 최신 불러오기로 확인해 주세요.';
  if (/fetch|network|Failed|timeout|timed out|abort/i.test(text)) return '서버 응답을 확인하지 못했습니다. 인터넷 연결을 확인하고 최신 불러오기로 저장 결과를 확인해 주세요. 같은 저장을 바로 다시 누르지 마세요.';
  return text;
}
export async function request(path, body, token, timeoutMs = 30000) {
  const headers = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs), cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
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
  if (!refreshing) refreshing = request('/auth/v1/token?grant_type=refresh_token', { refresh_token: current.refresh_token })
    .then(value => { keepSession(value); return value.access_token; })
    .catch(error => { clearSession(); loginRedirect(); throw error; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
export async function rpc(name, body = {}) {
  return request('/rest/v1/rpc/' + name, body, await accessToken(), ['halla_ledger_save','halla_ledger_import_finish','halla_ledger_patch_compact'].includes(name) ? 120000 : 30000);
}
export async function signOut() {
  const current = session();
  clearSession();
  try { await request('/auth/v1/logout?scope=local', {}, current?.access_token); } catch {}
  location.replace('login.html');
}
export async function requireLedgerSession() {
  if (!session()?.access_token) {
    loginRedirect();
    return new Promise(() => {});
  }
  try { return await rpc('halla_ledger_read'); }
  catch (error) {
    clearSession();
    sessionStorage.setItem('hallapa_ledger_login_error', friendlyError(error));
    loginRedirect();
    return new Promise(() => {});
  }
}
