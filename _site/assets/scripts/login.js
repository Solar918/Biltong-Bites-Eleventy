/**
 * Biltong Bites - Login & Registration Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginAlert = document.getElementById('login-alert');
  const registerAlert = document.getElementById('register-alert');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const registerSubmitBtn = document.getElementById('register-submit-btn');

  // Check URL query param to pre-select register tab or redirect after login
  const urlParams = new URLSearchParams(window.location.search);
  const redirectTarget = urlParams.get('redirect') || '/account/';

  if (urlParams.get('action') === 'register') {
    switchTab('register');
  }

  function switchTab(tab) {
    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');
      panelLogin.style.display = 'block';
      panelRegister.style.display = 'none';
    } else {
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
      panelRegister.style.display = 'block';
      panelLogin.style.display = 'none';
    }
  }

  tabLogin?.addEventListener('click', () => switchTab('login'));
  tabRegister?.addEventListener('click', () => switchTab('register'));

  // Handle Login submission
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginAlert.style.display = 'none';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) return;

    try {
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'Signing in...';

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        loginAlert.textContent = data.error || 'Login failed. Please verify your credentials.';
        loginAlert.style.display = 'block';
        return;
      }

      // Success: redirect user
      window.location.href = redirectTarget;
    } catch (err) {
      loginAlert.textContent = 'Connection error: ' + err.message;
      loginAlert.style.display = 'block';
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Sign In';
    }
  });

  // Handle Register submission
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerAlert.style.display = 'none';

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const passwordConfirm = document.getElementById('reg-password-confirm').value;

    if (password !== passwordConfirm) {
      registerAlert.textContent = 'Passwords do not match.';
      registerAlert.style.display = 'block';
      return;
    }

    try {
      registerSubmitBtn.disabled = true;
      registerSubmitBtn.textContent = 'Creating account...';

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        registerAlert.textContent = data.error || 'Registration failed.';
        registerAlert.style.display = 'block';
        return;
      }

      // Success: redirect user
      window.location.href = redirectTarget;
    } catch (err) {
      registerAlert.textContent = 'Connection error: ' + err.message;
      registerAlert.style.display = 'block';
    } finally {
      registerSubmitBtn.disabled = false;
      registerSubmitBtn.textContent = 'Create Account';
    }
  });
});
