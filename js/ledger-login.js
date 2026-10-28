import { request, keepSession, clearSession, rpc, nextPage, friendlyError, friendlyLoadError, sessionRejected, accessToken, session, autoLoginEnabled, setAutoLogin, savedEmail, rememberEmail } from './cloud-session.js?v=app-20261018-working-mobile-02';
const errorEl = document.getElementById('error');
const form = document.getElementById('login-form');
const mfaForm = document.getElementById('mfa-form');
function loginError(error) {
  if (/Invalid TOTP code entered/.test(error?.message || '')) return '인증번호가 맞지 않거나 유효 시간이 지났습니다. 인증 앱의 새 번호로 다시 시도해 주세요.';
  return friendlyError(error);
}
let factor;
let loginBusy = false;
let passwordAccepted = false;
const emailInput = document.getElementById('email');
const autoLogin = document.getElementById('auto-login');
const saveEmail = document.getElementById('save-email');
const resumeButton = document.getElementById('resume-button');
let pendingEmail = '', pendingAutoLogin = false, pendingSaveEmail = false;
emailInput.value = savedEmail();
saveEmail.checked = !!emailInput.value;
autoLogin.checked = autoLoginEnabled();
saveEmail.addEventListener('change', () => { if (!saveEmail.checked) rememberEmail('', false); });
errorEl.textContent = sessionStorage.getItem('hallapa_ledger_login_error') || '';
sessionStorage.removeItem('hallapa_ledger_login_error');
async function openLedger(newLogin = false) {
  errorEl.textContent = '로그인 확인 완료 · 장부 접근 권한을 확인하고 있습니다…';
  await rpc('halla_ledger_sync_v2', { p_cursor: null });
  if (newLogin) {
    // Persist only after password, MFA and ledger authorization all succeeded.
    rememberEmail(pendingEmail, pendingSaveEmail);
    setAutoLogin(pendingAutoLogin);
  }
  location.replace(nextPage());
}
async function resumeLogin() {
  if (loginBusy) return;
  loginBusy = true;
  document.getElementById('login-button').disabled = true;
  resumeButton.hidden = true;
  errorEl.textContent = '저장된 로그인 확인 중…';
  try {
    // Only refresh the stored token here. The destination loads and authorizes
    // the ledger once, instead of downloading the entire ledger twice.
    await accessToken();
    await openLedger();
  } catch (error) {
    if (sessionRejected(error)) { clearSession(); errorEl.textContent = loginError(error); }
    else { errorEl.textContent = friendlyLoadError(error); resumeButton.hidden = false; }
  } finally { loginBusy = false; document.getElementById('login-button').disabled = false; }
}
resumeButton.addEventListener('click', resumeLogin);
if (session()?.access_token) resumeLogin();
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (loginBusy) return;
  loginBusy = true;
  const button = document.getElementById('login-button');
  button.disabled = true; errorEl.textContent = '';
  try {
    pendingEmail = emailInput.value.trim();
    pendingAutoLogin = autoLogin.checked;
    pendingSaveEmail = saveEmail.checked;
    passwordAccepted = false;
    const value = await request('/auth/v1/token?grant_type=password', {
      email: pendingEmail, password: document.getElementById('password').value,
    });
    keepSession(value, false);
    passwordAccepted = true;
    document.getElementById('password').value = '';
    factor = value.user?.factors?.find(item => item.status === 'verified' && item.factor_type === 'totp');
    if (factor) {
      form.hidden = true; mfaForm.hidden = false; document.getElementById('mfa-code').focus();
    } else await openLedger(true);
  } catch (error) {
    if (passwordAccepted && !sessionRejected(error)) {
      errorEl.textContent = '로그인은 성공했지만 장부를 불러오지 못했습니다. 비밀번호를 다시 입력하지 말고 다시 불러오기를 눌러 주세요.';
      resumeButton.hidden = false;
    } else {
      if (passwordAccepted) clearSession();
      errorEl.textContent = loginError(error);
    }
  }
  finally { loginBusy = false; button.disabled = false; }
});
mfaForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (loginBusy) return;
  loginBusy = true;
  const button = document.getElementById('mfa-button');
  button.disabled = true; errorEl.textContent = '인증번호를 확인하고 있습니다…';
  try {
    const { accessToken } = await import('./cloud-session.js?v=app-20261018-working-mobile-02');
    const token = await accessToken();
    const challenge = await request('/auth/v1/factors/' + factor.id + '/challenge', {}, token);
    const result = await request('/auth/v1/factors/' + factor.id + '/verify', {
      challenge_id: challenge.id, code: document.getElementById('mfa-code').value.trim(),
    }, token);
    keepSession(result);
    await openLedger(true);
  } catch (error) { errorEl.textContent = loginError(error); }
  finally { loginBusy = false; button.disabled = false; }
});

