import { request, keepSession, clearSession, rpc, nextPage, friendlyError, friendlyLoadError, sessionRejected, accessToken, session, autoLoginEnabled, setAutoLogin, savedEmail, rememberEmail } from './cloud-session.js?v=app-20261010-17';
const errorEl = document.getElementById('error');
const form = document.getElementById('login-form');
const mfaForm = document.getElementById('mfa-form');
let factor;
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
  await rpc('halla_ledger_read');
  if (newLogin) {
    // Persist only after password, MFA and ledger authorization all succeeded.
    rememberEmail(pendingEmail, pendingSaveEmail);
    setAutoLogin(pendingAutoLogin);
  }
  location.replace(nextPage());
}
async function resumeLogin() {
  document.getElementById('login-button').disabled = true;
  resumeButton.hidden = true;
  errorEl.textContent = '저장된 로그인 확인 중…';
  try {
    // Only refresh the stored token here. The destination loads and authorizes
    // the ledger once, instead of downloading the entire ledger twice.
    await accessToken();
    location.replace(nextPage());
  } catch (error) {
    if (sessionRejected(error)) { clearSession(); errorEl.textContent = friendlyError(error); }
    else { errorEl.textContent = friendlyLoadError(error); resumeButton.hidden = false; }
  } finally { document.getElementById('login-button').disabled = false; }
}
resumeButton.addEventListener('click', resumeLogin);
if (session()?.access_token) resumeLogin();
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('login-button');
  button.disabled = true; errorEl.textContent = '';
  try {
    pendingEmail = emailInput.value.trim();
    pendingAutoLogin = autoLogin.checked;
    pendingSaveEmail = saveEmail.checked;
    clearSession();
    const value = await request('/auth/v1/token?grant_type=password', {
      email: pendingEmail, password: document.getElementById('password').value,
    });
    document.getElementById('password').value = '';
    keepSession(value, false);
    factor = value.user?.factors?.find(item => item.status === 'verified' && item.factor_type === 'totp');
    if (factor) {
      form.hidden = true; mfaForm.hidden = false; document.getElementById('mfa-code').focus();
    } else await openLedger(true);
  } catch (error) { clearSession(); errorEl.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});
mfaForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('mfa-button');
  button.disabled = true; errorEl.textContent = '';
  try {
    const { accessToken } = await import('./cloud-session.js?v=app-20261010-17');
    const token = await accessToken();
    const challenge = await request('/auth/v1/factors/' + factor.id + '/challenge', {}, token);
    const result = await request('/auth/v1/factors/' + factor.id + '/verify', {
      challenge_id: challenge.id, code: document.getElementById('mfa-code').value.trim(),
    }, token);
    keepSession(result);
    await openLedger(true);
  } catch (error) { errorEl.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});
