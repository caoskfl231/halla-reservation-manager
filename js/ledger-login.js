import { request, keepSession, clearSession, rpc, nextPage, friendlyError } from './cloud-session.js?v=ledger-records-20261010-1';
const errorEl = document.getElementById('error');
const form = document.getElementById('login-form');
const mfaForm = document.getElementById('mfa-form');
let factor;
errorEl.textContent = sessionStorage.getItem('hallapa_ledger_login_error') || '';
sessionStorage.removeItem('hallapa_ledger_login_error');
async function openLedger() {
  await rpc('halla_ledger_read');
  location.replace(nextPage());
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('login-button');
  button.disabled = true; errorEl.textContent = '';
  try {
    clearSession();
    const value = await request('/auth/v1/token?grant_type=password', {
      email: document.getElementById('email').value.trim(), password: document.getElementById('password').value,
    });
    document.getElementById('password').value = '';
    keepSession(value);
    factor = value.user?.factors?.find(item => item.status === 'verified' && item.factor_type === 'totp');
    if (factor) {
      form.hidden = true; mfaForm.hidden = false; document.getElementById('mfa-code').focus();
    } else await openLedger();
  } catch (error) { clearSession(); errorEl.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});
mfaForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('mfa-button');
  button.disabled = true; errorEl.textContent = '';
  try {
    const { accessToken } = await import('./cloud-session.js?v=ledger-records-20261010-1');
    const token = await accessToken();
    const challenge = await request('/auth/v1/factors/' + factor.id + '/challenge', {}, token);
    const result = await request('/auth/v1/factors/' + factor.id + '/verify', {
      challenge_id: challenge.id, code: document.getElementById('mfa-code').value.trim(),
    }, token);
    keepSession(result);
    await openLedger();
  } catch (error) { errorEl.textContent = friendlyError(error); }
  finally { button.disabled = false; }
});
