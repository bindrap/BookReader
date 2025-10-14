// Form switching
document.getElementById('show-register').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  clearErrors();
});

document.getElementById('show-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  clearErrors();
});

// Clear error messages
function clearErrors() {
  document.getElementById('login-error').classList.remove('show');
  document.getElementById('register-error').classList.remove('show');
}

function showError(elementId, message) {
  const errorEl = document.getElementById(elementId);
  errorEl.textContent = message;
  errorEl.classList.add('show');
}

// Login form submission
document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    showError('login-error', 'Please fill in all fields');
    return;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Store token and redirect
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      window.location.href = '/';
    } else {
      showError('login-error', data.error || 'Login failed');
    }
  } catch (error) {
    showError('login-error', 'Network error. Please try again.');
  }
});

// Registration form submission
document.getElementById('register').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const passwordConfirm = document.getElementById('register-password-confirm').value;

  if (!username || !password || !passwordConfirm) {
    showError('register-error', 'Please fill in all fields');
    return;
  }

  if (username.length < 3) {
    showError('register-error', 'Username must be at least 3 characters');
    return;
  }

  if (password.length < 6) {
    showError('register-error', 'Password must be at least 6 characters');
    return;
  }

  if (password !== passwordConfirm) {
    showError('register-error', 'Passwords do not match');
    return;
  }

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Store token and redirect
      localStorage.setItem('token', data.token);
      localStorage.setItem('username', data.username);
      window.location.href = '/';
    } else {
      showError('register-error', data.error || 'Registration failed');
    }
  } catch (error) {
    showError('register-error', 'Network error. Please try again.');
  }
});
