/**
 * Relay Payment Recovery Intelligence - Dynamic Role-Based SPA & Local Session Auth
 */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);

const percent = (value) => `${Number(value || 0).toFixed(1)}%`;

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 3000);
}

// ----------------------------------------------------
// STATE
// ----------------------------------------------------
let currentUser = null;
let currentCustomer = null;
let currentFailureReason = '';
let currentFailedAmount = 0;
let currentStrategy = '';
let currentLikelihood = 80;
let auditLog = [];
let recoverySessionId = null;

function logAudit(eventText) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  auditLog.push({ time, event: eventText });
}

// ----------------------------------------------------
// API CLIENT (Session Based)
// ----------------------------------------------------
async function apiFetch(url, options = {}) {
  apiFetch.lastError = null;
  try {
    options.credentials = 'same-origin';
    const res = await fetch(url, options);

    if (res.status === 401) {
      showAuthOverlay(true);
      return null;
    }

    if (!res.ok) {
      const errText = await res.text();
      let message = errText;
      try {
        const parsed = JSON.parse(errText);
        message = parsed.detail || parsed.message || errText;
      } catch (_) {}
      apiFetch.lastError = message;
      throw new Error(message);
    }

    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    apiFetch.lastError = err.message || 'Request failed';
    toast(err.message || 'Request failed');
    return null;
  }
}

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------
function showAuthOverlay(show = true) {
  const overlay = $('#auth-overlay');
  const main = $('#app-main');
  if (show) {
    overlay.hidden = false;
    main.hidden = true;
  } else {
    overlay.hidden = true;
    main.hidden = false;
  }
}

function showAuthError(msg) {
  const errBox = $('#auth-error');
  if (msg) {
    errBox.textContent = msg;
    errBox.hidden = false;
  } else {
    errBox.hidden = true;
  }
}

async function handleLogin(username, password) {
  showAuthError('');
  const submitBtn = $('#btn-auth-submit');
  if (submitBtn) {
    submitBtn.textContent = 'Signing in...';
    submitBtn.disabled = true;
  }

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showAuthError(data.detail || 'Invalid username or password');
      return;
    }

    currentUser = data.user;
    toast(`Welcome, ${currentUser.name}!`);
    routeUserByRole(currentUser);
  } catch (e) {
    showAuthError('Connection error. Please ensure the server is running.');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
      submitBtn.disabled = false;
    }
  }
}

let authMode = 'login'; // 'login' or 'signup'

async function handleSignup(username, password, name, email) {
  showAuthError('');
  const submitBtn = $('#btn-auth-submit');
  if (submitBtn) {
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;
  }

  try {
    const payload = { username, password, role: 'user' };
    if (name) payload.name = name;
    if (email) payload.email = email;

    const res = await fetch('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      showAuthError(data.detail || 'Failed to create account.');
      return;
    }

    currentUser = data.user;
    toast(`Account created! Welcome, ${currentUser.name}!`);
    routeUserByRole(currentUser);
  } catch (e) {
    showAuthError('Connection error. Please ensure the server is running.');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = 'Create Account';
      submitBtn.disabled = false;
    }
  }
}

async function handleLogout() {
  await apiFetch('/auth/logout', { method: 'POST' });
  currentUser = null;
  showAuthOverlay(true);
  toast('Signed out successfully.');
}

async function checkSession() {
  try {
    const res = await fetch('/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data && data.user) {
        currentUser = data.user;
        routeUserByRole(currentUser);
        return;
      }
    }
  } catch (_) {}
  showAuthOverlay(true);
}

// ----------------------------------------------------
// ROLE ROUTING & UI SWITCHING
// ----------------------------------------------------
const NAV_CONFIG = {
  admin: [
    { id: 'view-admin-overview', label: 'Overview', icon: '◫' },
    { id: 'view-admin-merchants', label: 'Merchants', icon: '🏢' },
    { id: 'view-admin-users', label: 'Users & Roles', icon: '👥' },
    { id: 'view-admin-datasets', label: 'Datasets & Metrics', icon: '📊' },
  ],
  merchant: [
    { id: 'view-merchant-overview', label: 'Recovery Intelligence', icon: '◫' },
    { id: 'view-merchant-customers', label: 'Customers', icon: '◉' },
    { id: 'view-merchant-performance', label: 'Performance', icon: '↗' },
    { id: 'view-merchant-automations', label: 'Automations', icon: '⚡' },
  ],
  user: [
    { id: 'view-user-payments', label: 'Payment Status', icon: '💳' },
    { id: 'view-user-history', label: 'Transaction History', icon: '📜' },
    { id: 'view-user-instructions', label: 'Recovery Guides', icon: '💡' },
    { id: 'view-user-support', label: 'Support & Help', icon: '☎' },
  ],
};

function routeUserByRole(user) {
  showAuthOverlay(false);

  // Update topbar & sidebar identity
  $('#sidebar-username').textContent = user.name || user.username;
  $('#sidebar-role-badge').textContent = (user.role || '').toUpperCase();
  $('#sidebar-avatar').textContent = (user.username || 'U').slice(0, 2).toUpperCase();

  const topbarWelcome = $('#topbar-welcome');
  const topbarEyebrow = $('#topbar-eyebrow');
  const uploadBtn = $('#merchant-upload-btn');

  if (user.role === 'admin') {
    topbarWelcome.textContent = 'Welcome Admin';
    topbarEyebrow.textContent = 'ADMIN PLATFORM PORTAL';
    if (uploadBtn) uploadBtn.hidden = true;
  } else if (user.role === 'merchant') {
    topbarWelcome.textContent = 'Welcome Merchant';
    topbarEyebrow.textContent = 'MERCHANT RECOVERY PORTAL';
    if (uploadBtn) uploadBtn.hidden = false;
  } else {
    topbarWelcome.textContent = 'Welcome User';
    topbarEyebrow.textContent = 'CUSTOMER PAYMENT PORTAL';
    if (uploadBtn) uploadBtn.hidden = true;
  }

  // Hide all role containers
  $('#admin-views').hidden = true;
  $('#merchant-views').hidden = true;
  $('#user-views').hidden = true;

  // Build role sidebar navigation
  buildSidebarNav(user.role);

  // Show active role container and load initial view
  if (user.role === 'admin') {
    $('#admin-views').hidden = false;
    switchView('view-admin-overview');
    loadAdminOverview();
  } else if (user.role === 'merchant') {
    $('#merchant-views').hidden = false;
    switchView('view-merchant-overview');
    loadMerchantDashboard();
  } else {
    $('#user-views').hidden = false;
    switchView('view-user-payments');
    loadUserPayments();
  }
}

function buildSidebarNav(role) {
  const nav = $('#role-nav');
  nav.innerHTML = '';
  const items = NAV_CONFIG[role] || [];

  items.forEach((item, idx) => {
    const link = document.createElement('a');
    link.className = `nav-item ${idx === 0 ? 'active' : ''}`;
    link.href = `#${item.id}`;
    link.dataset.view = item.id;
    link.innerHTML = `<span class="nav-icon">${item.icon}</span> ${item.label}`;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(item.id);
    });
    nav.appendChild(link);
  });
}

function switchView(viewId) {
  // Update sidebar active link
  $$('#role-nav .nav-item').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === viewId);
  });

  // Hide all spa views in active container and show target
  $$('.spa-view').forEach((v) => {
    v.classList.remove('active-view');
    v.hidden = true;
  });

  const target = $(`#${viewId}`);
  if (target) {
    target.classList.add('active-view');
    target.hidden = false;
  }

  // Trigger specific data loads on navigation
  if (viewId === 'view-admin-merchants') loadAdminMerchants();
  if (viewId === 'view-admin-users') loadAdminUsers();
  if (viewId === 'view-admin-datasets') loadAdminDatasets();
  if (viewId === 'view-merchant-customers') loadMerchantCustomers();
  if (viewId === 'view-merchant-performance') loadMerchantPerformance();
  if (viewId === 'view-merchant-automations') loadAutomations();
  if (viewId === 'view-user-history') loadUserHistory();
  if (viewId === 'view-user-instructions') loadUserInstructions();
}

// ----------------------------------------------------
// ADMIN DATA LOADERS
// ----------------------------------------------------
async function loadAdminOverview() {
  const stats = await apiFetch('/admin/platform-stats');
  if (stats && stats.platform_overview) {
    const ov = stats.platform_overview;
    $('#adm-total-vol').textContent = money(ov.total_volume);
    $('#adm-total-rec').textContent = money(ov.total_recovered);
    $('#adm-global-rate').textContent = percent(ov.global_recovery_rate);
    $('#adm-active-merch').textContent = ov.active_merchants;

    const bd = stats.recovery_breakdown || {};
    $('#adm-upi-rate').textContent = percent(bd.upi_recovery_rate);
    $('#adm-card-rate').textContent = percent(bd.card_recovery_rate);
    $('#adm-wallet-rate').textContent = percent(bd.wallet_recovery_rate);
    $('#adm-nb-rate').textContent = percent(bd.netbanking_recovery_rate);
  }

  const merchData = await apiFetch('/admin/merchants');
  const tbody = $('#adm-merchants-summary-body');
  if (merchData && merchData.merchants && tbody) {
    tbody.innerHTML = merchData.merchants.map((m) => `
      <tr>
        <td><b>${m.id}</b></td>
        <td>${m.name}</td>
        <td><span class="badge badge-merchant">${m.plan}</span></td>
        <td>${m.total_volume}</td>
        <td><span class="success-text"><b>${m.recovery_rate}</b></span></td>
        <td><span class="badge ${m.status === 'Active' ? 'badge-success' : 'badge-pending'}">${m.status}</span></td>
      </tr>
    `).join('');
  }
}

async function loadAdminMerchants() {
  const merchData = await apiFetch('/admin/merchants');
  const tbody = $('#adm-merchants-full-body');
  if (merchData && merchData.merchants && tbody) {
    tbody.innerHTML = merchData.merchants.map((m) => `
      <tr>
        <td><b>${m.id}</b></td>
        <td>${m.name}</td>
        <td><code>${m.username}</code></td>
        <td><span class="badge badge-merchant">${m.plan}</span></td>
        <td>${m.datasets_count} files</td>
        <td>${m.total_volume}</td>
        <td><span class="success-text"><b>${m.recovery_rate}</b></span></td>
        <td><span class="badge ${m.status === 'Active' ? 'badge-success' : 'badge-pending'}">${m.status}</span></td>
      </tr>
    `).join('');
  }
}

async function loadAdminUsers() {
  const data = await apiFetch('/admin/users');
  const tbody = $('#adm-users-body');
  if (data && data.users && tbody) {
    tbody.innerHTML = data.users.map((u) => {
      let roleBadge = 'badge-user';
      if (u.role === 'admin') roleBadge = 'badge-admin';
      if (u.role === 'merchant') roleBadge = 'badge-merchant';

      return `
        <tr>
          <td><b>${u.name}</b></td>
          <td><code>${u.username}</code></td>
          <td><span class="badge ${roleBadge}">${u.role.toUpperCase()}</span></td>
          <td><span class="badge badge-success">${u.status}</span></td>
          <td>${u.last_login}</td>
        </tr>
      `;
    }).join('');
  }
}

async function loadAdminDatasets() {
  const data = await apiFetch('/admin/datasets');
  const tbody = $('#adm-datasets-body');
  if (data && data.datasets && tbody) {
    tbody.innerHTML = data.datasets.map((d) => `
      <tr>
        <td><b>${d.owner_id}</b></td>
        <td><code>${d.file_name}</code></td>
        <td>${d.total_rows.toLocaleString()}</td>
        <td>${money(d.total_amount)}</td>
        <td><span class="success-text">${money(d.recovered_amount)}</span></td>
        <td>${d.active_sessions}</td>
        <td>${new Date(d.uploaded_at).toLocaleString()}</td>
      </tr>
    `).join('');
  }
}

// ----------------------------------------------------
// MERCHANT DATA LOADERS & WORKFLOW
// ----------------------------------------------------
const sections = {
  step1: $('#step1-find'),
  step2: $('#step2-status'),
  step3: $('#step3-recommendation'),
  step4: $('#step4-review'),
  step5: $('#step5-started'),
  step6: $('#step6-customer-steps'),
  step7: $('#step7-outcome'),
};

const indicator = $('#progress-indicator');
const dots = [$('#dot-1'), $('#dot-2'), $('#dot-3'), $('#dot-4'), $('#dot-5'), $('#dot-6')];

function setStep(stepIndex) {
  Object.values(sections).forEach((sec) => {
    if (sec) sec.hidden = true;
  });
  if (indicator) indicator.hidden = stepIndex === 0;

  dots.forEach((dot, i) => {
    if (dot) dot.classList.toggle('active-dot', i === stepIndex - 1);
  });

  if (stepIndex === 0 || stepIndex === 1) sections.step1.hidden = false;
  else if (stepIndex === 2) sections.step2.hidden = false;
  else if (stepIndex === 3) sections.step3.hidden = false;
  else if (stepIndex === 4) sections.step4.hidden = false;
  else if (stepIndex === 5) sections.step5.hidden = false;
  else if (stepIndex === 6) sections.step6.hidden = false;
  else if (stepIndex === 7) sections.step7.hidden = false;
}

async function loadMerchantDashboard() {
  const data = await apiFetch('/dashboard');
  if (!data) return;

  const primary = data.primary_metrics || {};
  const recovery = data.recovery_metrics || {};

  if ($('#revenue-risk')) $('#revenue-risk').textContent = money(primary.total_revenue_at_risk);
  if ($('#recoverable-rev')) $('#recoverable-rev').textContent = money(primary.total_revenue_at_risk);
  if ($('#recovery-rate')) $('#recovery-rate').textContent = percent(primary.recovery_rate);
  if ($('#recovered-rev')) $('#recovered-rev').textContent = money(recovery.total_recovered);

  setStep(0);
}

async function loadMerchantCustomers() {
  const tbody = $('#merchant-customer-table-body');
  const data = await apiFetch('/data?limit=50');
  if (!data || !data.data || !data.data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center subtle">No dataset loaded. Upload a CSV to view customer database.</td></tr>`;
    return;
  }

  const map = new Map();
  data.data.forEach((row) => {
    if (!map.has(row.customer_id)) {
      map.set(row.customer_id, {
        id: row.customer_id,
        status: (row.status || row.payment_status || 'success').toLowerCase(),
        risk: 'Low',
        revAtRisk: 0,
        recRate: 100,
      });
    }
    const c = map.get(row.customer_id);
    if ((row.status || row.payment_status || '').toLowerCase() === 'failed') {
      c.status = 'failed';
      c.risk = 'High';
      c.revAtRisk += (row.amount || 0) - (row.recovery_amount || 0);
      c.recRate = 0;
    }
  });

  tbody.innerHTML = Array.from(map.values()).map((c) => `
    <tr onclick="switchView('view-merchant-overview'); document.getElementById('customer-id').value='${c.id}'; document.getElementById('customer-form').dispatchEvent(new Event('submit'));">
      <td><b>${c.id}</b></td>
      <td><span class="badge ${c.status === 'failed' ? 'badge-failed' : 'badge-success'}">${c.status.toUpperCase()}</span></td>
      <td>${c.risk}</td>
      <td>${money(c.revAtRisk)}</td>
      <td>${c.recRate}%</td>
    </tr>
  `).join('');
}

async function loadMerchantPerformance() {
  const tbody = $('#merchant-perf-table-body');
  const stats = await apiFetch('/stats/by-status');
  if (!stats) return;

  tbody.innerHTML = Object.entries(stats).map(([status, s]) => `
    <tr>
      <td style="text-transform: capitalize;"><b>${status}</b></td>
      <td>${s.count}</td>
      <td>${money(s.total_amount)}</td>
      <td><span class="success-text">${money(s.total_recovered)}</span></td>
      <td>${money(s.average_amount)}</td>
    </tr>
  `).join('');
}

// ----------------------------------------------------
// USER DATA LOADERS
// ----------------------------------------------------
async function loadUserPayments() {
  const data = await apiFetch('/user/payments');
  if (!data) return;

  const sum = data.summary || {};
  $('#usr-total-txns').textContent = sum.total_transactions;
  $('#usr-failed-txns').textContent = sum.failed_payments;
  $('#usr-failed-amount').textContent = money(sum.total_amount_failed);

  const tbody = $('#usr-failed-table-body');
  const failedTxns = (data.transactions || []).filter((t) => t.status === 'failed');
  if (tbody) {
    if (!failedTxns.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center success-text">All payments are healthy! No pending recovery.</td></tr>`;
    } else {
      tbody.innerHTML = failedTxns.map((t) => `
        <tr>
          <td><b>${t.id}</b></td>
          <td>${t.merchant}</td>
          <td><b>${money(t.amount)}</b></td>
          <td><span class="badge badge-failed">FAILED</span></td>
          <td class="danger-text">${t.reason}</td>
          <td>${t.date}</td>
          <td>
            <button class="primary-button btn-small" onclick="switchView('view-user-instructions')">
              ${t.recovery_strategy}
            </button>
          </td>
        </tr>
      `).join('');
    }
  }
}

async function loadUserHistory() {
  const data = await apiFetch('/user/payments');
  const tbody = $('#usr-full-history-body');
  if (data && data.transactions && tbody) {
    tbody.innerHTML = data.transactions.map((t) => `
      <tr>
        <td><b>${t.id}</b></td>
        <td>${t.merchant}</td>
        <td>${money(t.amount)}</td>
        <td><span class="badge ${t.status === 'success' ? 'badge-success' : 'badge-failed'}">${t.status.toUpperCase()}</span></td>
        <td>${t.reason}</td>
        <td>${t.date}</td>
      </tr>
    `).join('');
  }
}

async function loadUserInstructions() {
  const data = await apiFetch('/user/instructions');
  const list = $('#usr-instructions-list');
  if (data && data.instructions && list) {
    list.innerHTML = data.instructions.map((inst) => `
      <div class="user-instruction-card">
        <div>
          <h4>💡 ${inst.title}</h4>
          <p class="subtle">${inst.description}</p>
        </div>
        <button class="ghost-button btn-small" onclick="toast('Instruction triggered: ${inst.action}')">${inst.action}</button>
      </div>
    `).join('');
  }
}

// ----------------------------------------------------
// EVENT LISTENERS INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Auth Mode Toggle
  const toggleBtn = $('#btn-toggle-auth-mode');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      authMode = authMode === 'login' ? 'signup' : 'login';
      const isSignup = authMode === 'signup';
      $('#auth-title').textContent = isSignup ? 'Create Relay Account' : 'Sign In to Relay';
      $('#auth-subtitle').textContent = isSignup ? 'Register a new account' : 'Select a role or enter your credentials';
      $('#btn-auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
      toggleBtn.textContent = isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up';
      $('#group-name').style.display = isSignup ? 'block' : 'none';
      $('#group-email').style.display = isSignup ? 'block' : 'none';
      showAuthError('');
    });
  }

  // Auth Form Submission (Login / Signup)
  $('#auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('#auth-username').value.trim();
    const p = $('#auth-password').value.trim();
    const n = $('#auth-name') ? $('#auth-name').value.trim() : '';
    const em = $('#auth-email') ? $('#auth-email').value.trim() : '';
    if (!u || !p) return;

    if (authMode === 'signup') {
      handleSignup(u, p, n, em);
    } else {
      handleLogin(u, p);
    }
  });

  // Quick Login Demo Buttons
  $('#btn-quick-admin').addEventListener('click', () => {
    $('#auth-username').value = 'admin';
    $('#auth-password').value = 'admin123';
    handleLogin('admin', 'admin123');
  });

  $('#btn-quick-merchant').addEventListener('click', () => {
    $('#auth-username').value = 'merchant';
    $('#auth-password').value = 'merchant123';
    handleLogin('merchant', 'merchant123');
  });

  $('#btn-quick-user').addEventListener('click', () => {
    $('#auth-username').value = 'user';
    $('#auth-password').value = 'user123';
    handleLogin('user', 'user123');
  });

  // Sign out button
  $('#btn-signout').addEventListener('click', (e) => {
    e.preventDefault();
    handleLogout();
  });

  // CSV Upload Handler
  $('#csv-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);

    toast('Uploading payment data…');
    $('#upload-text').textContent = 'Uploading...';
    const btn = $('#merchant-upload-btn');
    if (btn) btn.style.pointerEvents = 'none';

    try {
      const data = await apiFetch('/upload', { method: 'POST', body: form });
      if (data) {
        toast('Dataset loaded successfully ✓');
        await loadMerchantDashboard();
      }
    } finally {
      $('#upload-text').textContent = 'Upload CSV';
      if (btn) btn.style.pointerEvents = 'auto';
      event.target.value = '';
    }
  });

  // Customer Search Form
  $('#customer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = $('#customer-id').value.trim();
    if (!id) return;

    toast('Searching customer profile...');
    const customer = await apiFetch(`/customer/${encodeURIComponent(id)}`);
    if (!customer) return;

    currentCustomer = customer;
    currentFailureReason = customer.last_failure_reason || 'Unknown';
    currentFailedAmount = customer.last_failed_amount || 0;
    auditLog = [];

    setStep(2);

    const hView = $('#status-healthy');
    const aView = $('#status-attention');
    const uView = $('#status-unrecoverable');
    hView.hidden = true;
    aView.hidden = true;
    uView.hidden = true;

    if (currentFailedAmount === 0 || customer.risk_score < 20) {
      hView.hidden = false;
      $('#h-txn-count').textContent = customer.total_transactions;
      $('#h-rec-rate').textContent = percent(customer.recovery_rate);
      $('#h-method').textContent = customer.preferred_payment_method || '—';
      $('#h-risk').textContent = customer.risk_score;
    } else if (
      currentFailureReason.toLowerCase().includes('fraud') ||
      currentFailureReason.toLowerCase().includes('permanent')
    ) {
      uView.hidden = false;
      $('#u-reason').textContent = 'This payment is a permanent failure and should not be retried.';
    } else {
      aView.hidden = false;
      $('#a-amount').textContent = money(currentFailedAmount);
      $('#a-reason').textContent = currentFailureReason;
      $('#a-risk').textContent = customer.risk_score > 70 ? 'High' : 'Medium';
      $('#a-potential').textContent = money(currentFailedAmount);
    }
  });

  // Recent searches quick buttons
  $$('.btn-recent').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#customer-id').value = btn.dataset.id;
      $('#customer-form').dispatchEvent(new Event('submit'));
    });
  });

  // Demo / Test Webhook Simulation Buttons
  const btnSimFailed = $('#btn-sim-webhook-failed');
  if (btnSimFailed) {
    btnSimFailed.addEventListener('click', async () => {
      toast('Simulating payment.failed webhook event...');
      const res = await apiFetch('/webhooks/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.failed',
          transaction_id: 'TXN0000001',
          customer_id: 'CUST000052',
          amount: 2400,
          reason: 'Card Declined',
          payment_method: 'Credit Card',
        }),
      });
      if (res) {
        toast(`Webhook processed: Recovery auto-started (${res.strategy})`);
        $('#customer-id').value = 'CUST000052';
        $('#customer-form').dispatchEvent(new Event('submit'));
      }
    });
  }

  const btnSimCaptured = $('#btn-sim-webhook-captured');
  if (btnSimCaptured) {
    btnSimCaptured.addEventListener('click', async () => {
      toast('Simulating payment.captured webhook event...');
      const res = await apiFetch('/webhooks/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.captured',
          transaction_id: 'TXN0000001',
          customer_id: 'CUST000052',
          amount: 2400,
        }),
      });
      if (res) {
        toast('Webhook processed: Payment marked captured & recovered ✓');
        await loadMerchantDashboard();
      }
    });
  }

  let currentDiagnosis = null;

  // Step 2 -> Step 3 (Recommendation)
  $('#btn-view-recommendation').addEventListener('click', async () => {
    setStep(3);
    $('#rec-strategy').textContent = 'Calculating Smart Retry...';
    $('#rec-why').textContent = '';

    // Reset strategy radios to default Smart Retry
    if ($('#strat-type-smart')) $('#strat-type-smart').checked = true;
    if ($('#smart-retry-panel')) $('#smart-retry-panel').hidden = false;
    if ($('#custom-schedule-panel')) $('#custom-schedule-panel').hidden = true;

    const rec = await apiFetch('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: currentCustomer.customer_id }),
    });

    if (rec) {
      currentStrategy = rec.recommended_strategy;
      currentLikelihood = rec.confidence;
      currentDiagnosis = rec.diagnosis || null;
      $('#rec-strategy').textContent = currentStrategy;
      $('#rec-why').textContent = rec.reason;
      $('#rec-amount').textContent = money(rec.expected_recovery || currentFailedAmount);
      $('#rec-confidence').textContent = currentLikelihood + '%';

      const timingEl = $('#rec-timing');
      if (timingEl) {
        timingEl.textContent = rec.display_retry_time || (rec.smart_retry && rec.smart_retry.display_retry_time) || 'Tomorrow · 10:30 AM';
      }

      const prepBtn = $('#btn-prep-recovery');
      if (prepBtn) {
        prepBtn.disabled = false;
        prepBtn.textContent = currentStrategy === 'Smart Retry' ? 'Use Smart Retry' : 'Start Recovery';
      }
    }
  });

  let customRetrySchedule = null;

  function renderCustomScheduleState() {
    const controls = $('#custom-schedule-controls');
    const restricted = $('#custom-schedule-restricted');
    const restrictedMsg = $('#custom-restricted-msg');
    const altBtn = $('#btn-custom-alt-method');
    const prepBtn = $('#btn-prep-recovery');
    const errEl = $('#custom-schedule-error');
    if (errEl) errEl.hidden = true;

    const cat = currentDiagnosis ? currentDiagnosis.failure_category : 'soft';
    const hasFailed = currentDiagnosis ? currentDiagnosis.has_failed_payment : (currentFailedAmount > 0);
    const isRec = currentDiagnosis ? currentDiagnosis.is_recoverable : true;

    if (!hasFailed || currentFailedAmount === 0) {
      if (controls) controls.hidden = true;
      if (restricted) restricted.hidden = false;
      if (restrictedMsg) restrictedMsg.textContent = 'Payment already completed. No recovery action is needed.';
      if (altBtn) altBtn.style.display = 'none';
      if (prepBtn) prepBtn.disabled = true;
      return;
    }

    if (!isRec || cat === 'permanent') {
      if (controls) controls.hidden = true;
      if (restricted) restricted.hidden = false;
      if (restrictedMsg) restrictedMsg.textContent = "This payment can't be retried because the failure is permanent.";
      if (altBtn) altBtn.style.display = 'none';
      if (prepBtn) prepBtn.disabled = true;
      return;
    }

    if (cat === 'hard') {
      if (controls) controls.hidden = true;
      if (restricted) restricted.hidden = false;
      if (restrictedMsg) restrictedMsg.textContent = "Custom retries aren't available for this payment because it requires customer action.";
      if (altBtn) altBtn.style.display = 'inline-flex';
      if (prepBtn) prepBtn.disabled = true;
      return;
    }

    // Soft/recoverable failure -> enable controls
    if (controls) controls.hidden = false;
    if (restricted) restricted.hidden = true;
    if (prepBtn) {
      prepBtn.disabled = false;
      prepBtn.textContent = 'Use Custom Schedule';
    }
  }

  function getCustomSchedule() {
    const errEl = $('#custom-schedule-error');
    if (errEl) errEl.hidden = true;

    const val1 = $('#custom-att-1') ? $('#custom-att-1').value : '0';
    const val2 = $('#custom-att-2') ? $('#custom-att-2').value : '24';
    const val3 = $('#custom-att-3') ? $('#custom-att-3').value : '72';

    const delays = [];
    if (val1 !== 'none') delays.push(parseFloat(val1));
    if (val2 !== 'none') delays.push(parseFloat(val2));
    if (val3 !== 'none') delays.push(parseFloat(val3));

    if (delays.length === 0) {
      if (errEl) {
        errEl.textContent = 'Please configure at least 1 retry attempt.';
        errEl.hidden = false;
      }
      return null;
    }

    if (new Set(delays).size !== delays.length) {
      if (errEl) {
        errEl.textContent = 'Duplicate retry times are not allowed. Choose distinct delay intervals.';
        errEl.hidden = false;
      }
      return null;
    }

    for (let i = 0; i < delays.length - 1; i++) {
      if (delays[i] >= delays[i + 1]) {
        if (errEl) {
          errEl.textContent = 'Retry attempts must be ordered chronologically (e.g. Immediately < 24h < 72h).';
          errEl.hidden = false;
        }
        return null;
      }
    }

    return delays;
  }

  // Strategy Type Selector Radios
  $('#strat-type-smart').addEventListener('change', () => {
    $('#smart-retry-panel').hidden = false;
    $('#custom-schedule-panel').hidden = true;
    currentStrategy = 'Smart Retry';
    const prepBtn = $('#btn-prep-recovery');
    if (prepBtn) {
      prepBtn.disabled = false;
      prepBtn.textContent = 'Use Smart Retry';
    }
  });

  $('#strat-type-custom').addEventListener('change', () => {
    $('#smart-retry-panel').hidden = true;
    $('#custom-schedule-panel').hidden = false;
    currentStrategy = 'Custom Schedule';
    renderCustomScheduleState();
  });

  // Action: Choose Alternative Payment from restricted notice
  const btnCustomAlt = $('#btn-custom-alt-method');
  if (btnCustomAlt) {
    btnCustomAlt.addEventListener('click', () => {
      $('#strat-type-smart').checked = true;
      $('#smart-retry-panel').hidden = false;
      $('#custom-schedule-panel').hidden = true;
      currentStrategy = 'Offer Alternative Payment Method';
      $('#rec-strategy').textContent = 'Offer Alternative Payment Method';
      $('#rec-why').textContent = 'Customer action required to update payment method or credentials.';
      const prepBtn = $('#btn-prep-recovery');
      if (prepBtn) {
        prepBtn.disabled = false;
        prepBtn.textContent = 'Start Recovery';
      }
      toast('Selected Alternative Payment Method strategy.');
    });
  }

  // Action: Go Back from restricted notice
  const btnCustomBack = $('#btn-custom-go-back');
  if (btnCustomBack) {
    btnCustomBack.addEventListener('click', () => {
      setStep(2);
    });
  }

  // Step 3 -> Step 4 (Review)
  $('#btn-prep-recovery').addEventListener('click', async () => {
    const isCustom = $('#strat-type-custom') && $('#strat-type-custom').checked;
    if (isCustom) {
      const cat = currentDiagnosis ? currentDiagnosis.failure_category : 'soft';
      const hasFailed = currentDiagnosis ? currentDiagnosis.has_failed_payment : (currentFailedAmount > 0);
      const isRec = currentDiagnosis ? currentDiagnosis.is_recoverable : true;
      const errEl = $('#custom-schedule-error');

      if (!hasFailed || currentFailedAmount === 0) {
        if (errEl) {
          errEl.textContent = 'Payment already completed. No recovery action is needed.';
          errEl.hidden = false;
        }
        return;
      }

      if (!isRec || cat === 'permanent') {
        if (errEl) {
          errEl.textContent = "This payment can't be retried because the failure is permanent.";
          errEl.hidden = false;
        }
        return;
      }

      if (cat === 'hard') {
        if (errEl) {
          errEl.textContent = "Custom retries aren't available for this payment because it requires customer action.";
          errEl.hidden = false;
        }
        return;
      }

      const schedule = getCustomSchedule();
      if (!schedule) return;

      const valRes = await apiFetch('/recover/validate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: currentCustomer.customer_id, retry_schedule: schedule }),
      });
      if (!valRes) {
        if (errEl) {
          errEl.textContent = apiFetch.lastError || 'Invalid schedule configuration. Please review retry intervals.';
          errEl.hidden = false;
        }
        return;
      }

      customRetrySchedule = schedule;
      currentStrategy = 'Custom Schedule';
      setStep(4);

      $('#rev-cust').textContent = currentCustomer.customer_id;
      $('#rev-amount').textContent = money(currentFailedAmount);
      $('#rev-method').textContent = 'Custom Retry';
      if ($('#rev-schedule')) {
        $('#rev-schedule').textContent = schedule.map((h, i) => `${i + 1}. ${h === 0 ? 'Immediately' : h + ' hours'}`).join(', ');
      }
      if ($('#rev-attempts')) $('#rev-attempts').textContent = schedule.length;
      $('#rev-expected').textContent = money(currentFailedAmount);
    } else {
      customRetrySchedule = null;
      setStep(4);
      $('#rev-cust').textContent = currentCustomer.customer_id;
      $('#rev-amount').textContent = money(currentFailedAmount);
      $('#rev-method').textContent = currentStrategy || 'Smart Retry';
      if ($('#rev-schedule')) {
        $('#rev-schedule').textContent = $('#rec-timing') ? $('#rec-timing').textContent : 'Tomorrow · 10:30 AM';
      }
      if ($('#rev-attempts')) $('#rev-attempts').textContent = '3';
      $('#rev-expected').textContent = money(currentFailedAmount);
    }
  });

  let recoveryPollTimer = null;
  let currentRecoverySession = null;

  function stopRecoveryPolling() {
    if (recoveryPollTimer) {
      clearInterval(recoveryPollTimer);
      recoveryPollTimer = null;
    }
  }

  async function updateRecoveryStatus(session) {
    if (!session) return;
    currentRecoverySession = session;

    if (session.audit_trail && session.audit_trail.length) {
      auditLog = session.audit_trail.map((a) => ({
        time: new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        event: `${a.event}: ${JSON.stringify(a.details || {})}`,
      }));
    }

    const st = session.status;
    const attemptText = `Attempt: ${session.attempt_count || 1} / ${session.max_attempts || 3}`;
    const startStatus = $('#start-status');
    const startAttempt = $('#start-attempt');
    const spinner = $('#step5-spinner');
    const actions = $('#step5-actions');

    if (startAttempt) startAttempt.textContent = attemptText;

    if (st === 'retry_scheduled') {
      if (startStatus) startStatus.textContent = 'Retry scheduled';
      if (spinner) spinner.hidden = false;
      if (actions) actions.hidden = false;
    } else if (st === 'awaiting_customer') {
      if (startStatus) startStatus.textContent = 'Waiting for customer';
      if (spinner) spinner.hidden = true;
      if (actions) actions.hidden = false;
    } else if (st === 'recovered' || st === 'completed') {
      if (startStatus) startStatus.textContent = `Payment recovered (${money(session.recovered_amount || session.amount)})`;
      if (startAttempt) startAttempt.textContent = `Attempts: ${session.attempt_count || 1}`;
      if (spinner) spinner.hidden = true;
      if (actions) actions.hidden = false;
      stopRecoveryPolling();

      // Automatically advance to Step 7 (Outcome)
      setStep(7);
      $('#out-amount').textContent = money(session.recovered_amount || session.amount);
      $('#out-cust').textContent = session.customer_id || currentCustomer.customer_id;
      $('#out-method').textContent = session.strategy || currentStrategy;
      $('#out-attempts').textContent = session.attempt_count || 1;
      logAudit(`Recovery session completed successfully for ${money(session.recovered_amount || session.amount)}`);
    } else if (st === 'exhausted') {
      if (startStatus) startStatus.textContent = 'Recovery stopped: Maximum recovery attempts reached';
      if (spinner) spinner.hidden = true;
      if (actions) actions.hidden = true;
      stopRecoveryPolling();
    } else if (st === 'stopped') {
      if (startStatus) startStatus.textContent = 'Recovery stopped: Non-recoverable failure';
      if (spinner) spinner.hidden = true;
      if (actions) actions.hidden = true;
      stopRecoveryPolling();
    } else {
      if (startStatus) startStatus.textContent = 'Waiting for customer';
    }
  }

  async function pollRecoverySession(sessionId) {
    stopRecoveryPolling();
    const data = await apiFetch(`/recover/${encodeURIComponent(sessionId)}`);
    if (data) updateRecoveryStatus(data);

    recoveryPollTimer = setInterval(async () => {
      const polled = await apiFetch(`/recover/${encodeURIComponent(sessionId)}`);
      if (polled) {
        updateRecoveryStatus(polled);
        if (['recovered', 'completed', 'exhausted', 'stopped'].includes(polled.status)) {
          stopRecoveryPolling();
        }
      }
    }, 1200);
  }

  // Step 4 -> Step 5 (Start Recovery)
  $('#btn-start-recovery').addEventListener('click', async () => {
    stopRecoveryPolling();
    const payload = {
      customer_id: currentCustomer.customer_id,
      strategy: currentStrategy,
      expected_recovered_revenue: currentFailedAmount,
    };
    if (currentStrategy === 'Custom Schedule' && customRetrySchedule) {
      payload.retry_schedule = customRetrySchedule;
    }

    const session = await apiFetch('/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!session) return;
    recoverySessionId = session.session_id;
    currentRecoverySession = session;
    setStep(5);

    $('#start-cust').textContent = currentCustomer.customer_id;
    $('#start-amount').textContent = money(currentFailedAmount);
    $('#start-method').textContent = session.strategy || currentStrategy;
    $('#start-status').textContent = 'Waiting for customer';
    $('#step5-spinner').hidden = false;
    $('#step5-actions').hidden = false;

    updateRecoveryStatus(session);
    pollRecoverySession(recoverySessionId);
  });

  // Step 5 Actions: Open Customer Payment & Copy Payment Link
  $('#btn-open-cust-ui').addEventListener('click', () => {
    if (!recoverySessionId) return;
    logAudit('Merchant opened customer payment page');
    window.open(`/pay/${encodeURIComponent(recoverySessionId)}`, '_blank');
  });

  const btnCopyLink = $('#btn-copy-payment-link');
  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      if (!recoverySessionId) return;
      const url = `${window.location.origin}/pay/${encodeURIComponent(recoverySessionId)}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          toast('Payment link copied.');
        }).catch(() => {
          prompt('Copy recovery payment link:', url);
        });
      } else {
        prompt('Copy recovery payment link:', url);
      }
    });
  }

  $('#btn-cust-cancel').addEventListener('click', () => {
    $('#cns-payment-container').hidden = false;
    $('#cns-confirm-container').hidden = true;
  });

  $('#btn-cust-process').addEventListener('click', async () => {
    $('#btn-cust-process').textContent = 'Processing...';
    $('#btn-cust-process').disabled = true;

    try {
      if (recoverySessionId) {
        const comp = await apiFetch(`/recover/${encodeURIComponent(recoverySessionId)}/complete`, { method: 'POST' });
        if (comp) currentRecoverySession = comp;
      }
      logAudit(`Payment recovered for ${money(currentFailedAmount)}`);
      $('#cns-confirm-container').hidden = true;
      $('#cns-success-container').hidden = false;
    } finally {
      $('#btn-cust-process').textContent = 'Confirm Payment';
      $('#btn-cust-process').disabled = false;
    }
  });

  // Step 6 -> Step 7 (Outcome)
  $('#btn-return-merchant').addEventListener('click', () => {
    setStep(7);
    const recAmt = currentRecoverySession && currentRecoverySession.recovered_amount ? currentRecoverySession.recovered_amount : currentFailedAmount;
    $('#out-amount').textContent = `${money(recAmt)} recovered`;
    $('#out-cust').textContent = currentCustomer.customer_id;
    $('#out-method').textContent = currentRecoverySession && currentRecoverySession.strategy ? currentRecoverySession.strategy : currentStrategy;
    if ($('#out-attempts')) {
      $('#out-attempts').textContent = currentRecoverySession ? currentRecoverySession.attempt_count : 1;
    }
  });

  // Navigation and drawers
  $$('.btn-back-home').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopRecoveryPolling();
      $('#customer-id').value = '';
      setStep(0);
    });
  });

  $('#btn-back-rec').addEventListener('click', () => {
    stopRecoveryPolling();
    setStep(3);
  });

  $('#btn-open-details').addEventListener('click', () => {
    $('#det-cust').textContent = currentCustomer.customer_id;
    $('#det-risk').textContent = currentCustomer.risk_score;
    $('#det-rate').textContent = percent(currentCustomer.recovery_rate);
    $('#det-history').textContent = currentCustomer.total_transactions;
    $('#det-failures').textContent = currentCustomer.failure_count;
    $('#det-reason').textContent = currentFailureReason;
    $('#det-method').textContent = currentCustomer.preferred_payment_method || '—';
    $('#drawer-details').hidden = false;
  });

  $('#btn-open-details-unrec').addEventListener('click', () => $('#btn-open-details').click());

  $('#btn-view-audit').addEventListener('click', () => {
    const container = $('#audit-log-container');
    const logs = (currentRecoverySession && currentRecoverySession.audit_trail && currentRecoverySession.audit_trail.length)
      ? currentRecoverySession.audit_trail.map((a) => ({
          time: new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          event: `${a.event} ${Object.keys(a.details || {}).length ? '— ' + JSON.stringify(a.details) : ''}`,
        }))
      : auditLog;

    container.innerHTML = logs
      .map(
        (log) => `
      <div class="audit-item">
        <small>${log.time}</small>
        <b>${log.event}</b>
      </div>
    `
      )
      .join('');
    $('#drawer-audit').hidden = false;
  });

  $('#btn-choose-method').addEventListener('click', () => {
    $('#modal-strategy').hidden = false;
  });

  $('#btn-save-strategy').addEventListener('click', async () => {
    const selected = document.querySelector('input[name="strat"]:checked');
    if (!selected) return;
    const newStrat = selected.value;

    const sim = await apiFetch('/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: currentCustomer.customer_id, strategy: newStrat }),
    });

    if (sim) {
      currentStrategy = newStrat;
      $('#rec-strategy').textContent = currentStrategy;
      $('#rec-likelihood').textContent = sim.success_probability + '%';
      $('#rec-confidence').textContent = sim.success_probability + '%';
      $('#rec-amount').textContent = money(sim.expected_recovered_revenue);
      toast(`Strategy updated to ${currentStrategy}`);
    }
    $('#modal-strategy').hidden = true;
  });

  $$('.btn-close-drawer').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#drawer-details').hidden = true;
      $('#drawer-audit').hidden = true;
    });
  });

  $$('.btn-close-modal').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#modal-strategy').hidden = true;
    });
  });

  // Check existing session on load
  checkSession();
});

// ==========================================================================
// AUTOMATION MANAGER (runs outside DOMContentLoaded so it can be loaded lazily)
// ==========================================================================

let automationsMeta = null;
let editingAutomationId = null;

const TRIGGER_LABELS = {
  payment_failed: 'Payment Failed',
  payment_failed_soft: 'Soft Decline Failed',
  payment_failed_hard: 'Hard Decline Failed',
};
const ACTION_LABELS = {
  smart_retry: 'Smart Retry',
  custom_retry_schedule: 'Custom Retry Schedule',
  offer_alternative_payment: 'Offer Alternative Payment',
  customer_recovery_instruction: 'Customer Recovery Instruction',
  stop_recovery: 'Stop Recovery',
  escalate: 'Escalate',
};
const FIELD_LABELS = {
  amount: 'Amount (₹)',
  failure_type: 'Failure Type',
  failure_reason: 'Failure Reason',
  payment_method: 'Payment Method',
  customer_risk: 'Customer Risk',
};
const OP_LABELS = {
  equals: 'equals',
  not_equals: 'not equals',
  greater_than: 'greater than',
  less_than: 'less than',
  contains: 'contains',
};
const STATUS_BADGE = {
  active: '<span class="badge badge-green">ACTIVE</span>',
  paused: '<span class="badge badge-grey">PAUSED</span>',
};

async function loadAutomations() {
  const view = $('#view-merchant-automations');
  if (!view) return;

  const data = await apiFetch('/automations');
  if (!data) return;
  automationsMeta = data.meta;

  const automations = data.automations;
  renderAutomationList(automations);
}

function renderAutomationList(automations) {
  const container = $('#automation-list-container');
  if (!container) return;

  const listEl = $('#automation-items-body');
  if (!listEl) return;

  $('#automation-builder-panel').hidden = true;
  $('#automation-list-panel').hidden = false;

  if (!automations || automations.length === 0) {
    listEl.innerHTML = `<tr><td colspan="6" class="text-center subtle" style="padding:2rem;">No automations yet. <a href="#" id="btn-first-automation">Create your first automation →</a></td></tr>`;
    const firstBtn = $('#btn-first-automation');
    if (firstBtn) firstBtn.addEventListener('click', (e) => { e.preventDefault(); openAutomationBuilder(null); });
    return;
  }

  listEl.innerHTML = automations.map(a => {
    const firstAction = a.actions && a.actions[0] ? ACTION_LABELS[a.actions[0].type] || a.actions[0].type : '—';
    const lastTriggered = a.last_triggered ? new Date(a.last_triggered).toLocaleDateString('en-IN') : 'Never';
    const pauseBtn = a.status === 'active'
      ? `<button class="ghost-button btn-sm btn-pause-auto" data-id="${a.id}">Pause</button>`
      : `<button class="ghost-button btn-sm btn-resume-auto" data-id="${a.id}">Resume</button>`;
    return `<tr>
      <td>${STATUS_BADGE[a.status] || a.status} <b>${escHtml(a.name)}</b></td>
      <td>${TRIGGER_LABELS[a.trigger] || a.trigger}</td>
      <td>${firstAction}</td>
      <td>${a.customers_affected || 0}</td>
      <td>${lastTriggered}</td>
      <td style="white-space:nowrap;">
        <button class="ghost-button btn-sm btn-edit-auto" data-id="${a.id}">Edit</button>
        ${pauseBtn}
        <button class="ghost-button btn-sm btn-dup-auto" data-id="${a.id}">Duplicate</button>
        <button class="ghost-button btn-sm btn-del-auto danger-text" data-id="${a.id}">Delete</button>
      </td>
    </tr>`;
  }).join('');

  // Bind row actions
  listEl.querySelectorAll('.btn-edit-auto').forEach(btn => btn.addEventListener('click', () => openAutomationBuilder(btn.dataset.id)));
  listEl.querySelectorAll('.btn-pause-auto').forEach(btn => btn.addEventListener('click', () => changeAutomationStatus(btn.dataset.id, 'pause')));
  listEl.querySelectorAll('.btn-resume-auto').forEach(btn => btn.addEventListener('click', () => changeAutomationStatus(btn.dataset.id, 'resume')));
  listEl.querySelectorAll('.btn-dup-auto').forEach(btn => btn.addEventListener('click', () => duplicateAutomationUI(btn.dataset.id)));
  listEl.querySelectorAll('.btn-del-auto').forEach(btn => btn.addEventListener('click', () => deleteAutomationUI(btn.dataset.id)));
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function changeAutomationStatus(id, action) {
  const res = await apiFetch(`/automations/${id}/${action}`, { method: 'POST' });
  if (res) { toast(`Automation ${action === 'pause' ? 'paused' : 'resumed'}.`); loadAutomations(); }
}

async function duplicateAutomationUI(id) {
  const res = await apiFetch(`/automations/${id}/duplicate`, { method: 'POST' });
  if (res) { toast('Automation duplicated.'); loadAutomations(); }
}

async function deleteAutomationUI(id) {
  if (!confirm('Are you sure you want to delete this automation? This cannot be undone.')) return;
  const res = await apiFetch(`/automations/${id}`, { method: 'DELETE' });
  if (res) { toast('Automation deleted.'); loadAutomations(); }
}

function openAutomationBuilder(automationId) {
  editingAutomationId = automationId;
  const builderPanel = $('#automation-builder-panel');
  const listPanel = $('#automation-list-panel');
  if (!builderPanel) return;

  listPanel.hidden = true;
  builderPanel.hidden = false;

  // Reset form
  resetAutomationBuilder();

  if (automationId) {
    // Load existing automation for editing
    apiFetch(`/automations/${automationId}`).then(a => {
      if (!a) return;
      $('#auto-name').value = a.name;
      $('#auto-trigger').value = a.trigger;

      // Rebuild conditions
      const condContainer = $('#auto-conditions-list');
      condContainer.innerHTML = '';
      (a.conditions || []).forEach(c => addConditionRow(c));

      // Rebuild actions
      const actContainer = $('#auto-actions-list');
      actContainer.innerHTML = '';
      (a.actions || []).forEach(act => addActionRow(act));

      // Stop rules
      (a.stop_rules || []).forEach(rule => {
        const el = $(`#stop-rule-${rule.replace(/_/g, '-')}`);
        if (el) el.checked = true;
      });

      $('#auto-builder-title').textContent = 'Edit Automation';
    });
  } else {
    $('#auto-builder-title').textContent = 'Create Automation';
    addConditionRow();
    addActionRow();
  }
}

function resetAutomationBuilder() {
  $('#auto-name').value = '';
  $('#auto-trigger').value = 'payment_failed';
  $('#auto-conditions-list').innerHTML = '';
  $('#auto-actions-list').innerHTML = '';
  $$('.auto-stop-rule').forEach(el => { el.checked = el.dataset.default === 'true'; });
  $('#auto-preview-steps').innerHTML = '';
  $('#auto-preview-box').hidden = true;
  $('#auto-builder-error').hidden = true;
}

function addConditionRow(cond = null) {
  const container = $('#auto-conditions-list');
  const row = document.createElement('div');
  row.className = 'condition-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
  row.innerHTML = `
    <select class="form-control cond-field" style="flex:2;padding:6px;border-radius:6px;">
      <option value="amount">Amount (₹)</option>
      <option value="failure_type">Failure Type</option>
      <option value="failure_reason">Failure Reason</option>
      <option value="payment_method">Payment Method</option>
      <option value="customer_risk">Customer Risk</option>
    </select>
    <select class="form-control cond-op" style="flex:1.5;padding:6px;border-radius:6px;">
      <option value="equals">equals</option>
      <option value="not_equals">not equals</option>
      <option value="greater_than">greater than</option>
      <option value="less_than">less than</option>
      <option value="contains">contains</option>
    </select>
    <input type="text" class="form-control cond-val" placeholder="Value" style="flex:2;padding:6px;border-radius:6px;">
    <button type="button" class="ghost-button btn-sm btn-remove-cond" style="flex-shrink:0;">✕</button>
  `;
  if (cond) {
    row.querySelector('.cond-field').value = cond.field || 'amount';
    row.querySelector('.cond-op').value = cond.operator || 'equals';
    row.querySelector('.cond-val').value = cond.value || '';
  }
  row.querySelector('.btn-remove-cond').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function addActionRow(act = null) {
  const container = $('#auto-actions-list');
  const row = document.createElement('div');
  row.className = 'action-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
  row.innerHTML = `
    <select class="form-control act-type" style="flex:3;padding:6px;border-radius:6px;">
      <option value="smart_retry">Smart Retry</option>
      <option value="custom_retry_schedule">Custom Retry Schedule</option>
      <option value="offer_alternative_payment">Offer Alternative Payment</option>
      <option value="customer_recovery_instruction">Customer Recovery Instruction</option>
      <option value="stop_recovery">Stop Recovery</option>
      <option value="escalate">Escalate</option>
    </select>
    <button type="button" class="ghost-button btn-sm btn-remove-act" style="flex-shrink:0;">✕</button>
  `;
  if (act) {
    row.querySelector('.act-type').value = act.type || 'smart_retry';
  }
  row.querySelector('.btn-remove-act').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function collectAutomationFormData() {
  const name = $('#auto-name').value.trim();
  const trigger = $('#auto-trigger').value;

  const conditions = [];
  $$('.condition-row').forEach(row => {
    conditions.push({
      field: row.querySelector('.cond-field').value,
      operator: row.querySelector('.cond-op').value,
      value: row.querySelector('.cond-val').value.trim(),
    });
  });

  const actions = [];
  $$('.action-row').forEach(row => {
    actions.push({ type: row.querySelector('.act-type').value });
  });

  const stop_rules = [];
  $$('.auto-stop-rule').forEach(el => { if (el.checked) stop_rules.push(el.value); });

  return { name, trigger, conditions, actions, stop_rules };
}

async function previewAutomation() {
  const data = collectAutomationFormData();
  const res = await apiFetch('/automations/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res && res.steps) {
    const ol = $('#auto-preview-steps');
    ol.innerHTML = res.steps.map((s, i) => `<li style="margin-bottom:6px;">${s}</li>`).join('');
    $('#auto-preview-box').hidden = false;
  }
}

async function saveAutomation() {
  const data = collectAutomationFormData();
  const errEl = $('#auto-builder-error');
  errEl.hidden = true;

  let res;
  if (editingAutomationId) {
    res = await apiFetch(`/automations/${editingAutomationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } else {
    res = await apiFetch('/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  if (res) {
    toast(editingAutomationId ? 'Automation updated.' : 'Automation created!');
    editingAutomationId = null;
    loadAutomations();
  }
}

// Wire up static automation builder buttons (they exist after DOM is ready)
document.addEventListener('DOMContentLoaded', () => {
  const btnCreateAuto = $('#btn-create-automation');
  if (btnCreateAuto) btnCreateAuto.addEventListener('click', () => openAutomationBuilder(null));

  const btnCancelBuilder = $('#btn-auto-cancel');
  if (btnCancelBuilder) btnCancelBuilder.addEventListener('click', () => loadAutomations());
  const btnCancelBuilder2 = $('#btn-auto-cancel-2');
  if (btnCancelBuilder2) btnCancelBuilder2.addEventListener('click', () => loadAutomations());

  const btnAddCond = $('#btn-add-condition');
  if (btnAddCond) btnAddCond.addEventListener('click', () => addConditionRow());

  const btnAddAct = $('#btn-add-action');
  if (btnAddAct) btnAddAct.addEventListener('click', () => addActionRow());

  const btnPreview = $('#btn-auto-preview');
  if (btnPreview) btnPreview.addEventListener('click', previewAutomation);

  const btnSave = $('#btn-auto-save');
  if (btnSave) btnSave.addEventListener('click', saveAutomation);
});

