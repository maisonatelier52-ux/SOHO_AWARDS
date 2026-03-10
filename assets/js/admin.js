(function () {
  const config = window.SOHO_CONFIG || {};
  const storageKey = 'soho-admin-session-v1';

  const endpoints = {
    dashboard: config.adminDashboardEndpoint || '/api/admin/dashboard',
    nominations: config.adminNominationsEndpoint || '/api/admin/nominations',
    payments: config.adminPaymentsEndpoint || '/api/admin/payments',
    privacy: config.adminPrivacyTicketsEndpoint || '/api/admin/privacy-tickets',
    partners: config.adminPartnerInquiriesEndpoint || '/api/admin/partner-inquiries'
  };

  const adminStatus = document.getElementById('adminStatus');
  const loginForm = document.getElementById('adminLoginForm');
  const logoutButton = document.getElementById('adminLogoutButton');
  const refreshDashboardButton = document.getElementById('refreshDashboardButton');
  const metricsGrid = document.getElementById('metricsGrid');
  const nominationsTableBody = document.getElementById('nominationsTableBody');
  const paymentsTableBody = document.getElementById('paymentsTableBody');
  const privacyTableBody = document.getElementById('privacyTableBody');
  const partnersTableBody = document.getElementById('partnersTableBody');
  const auditTableBody = document.getElementById('auditTableBody');

  const nominationFilterForm = document.getElementById('nominationFilterForm');
  const paymentFilterForm = document.getElementById('paymentFilterForm');
  const privacyFilterForm = document.getElementById('privacyFilterForm');
  const partnerFilterForm = document.getElementById('partnerFilterForm');

  function setStatus(message, kind) {
    if (!adminStatus) return;
    adminStatus.textContent = message || '';
    adminStatus.className = message ? ('status-box show ' + (kind === 'error' ? 'status-error' : 'status-success')) : 'status-box';
  }

  function escapeHtml(input) {
    return String(input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
    return date.toLocaleString();
  }

  function badge(label, tone) {
    return '<span class="badge ' + (tone || '') + '">' + escapeHtml(label || '—') + '</span>';
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveSession(data) {
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  }

  function clearSession() {
    sessionStorage.removeItem(storageKey);
  }

  function applySessionToForm() {
    const session = getSession();
    if (!session || !loginForm) return;
    loginForm.adminName.value = session.name || '';
    loginForm.adminEmail.value = session.email || '';
    loginForm.adminApiKey.value = session.apiKey || '';
  }

  function getHeaders() {
    const session = getSession();
    if (!session || !session.apiKey) throw new Error('Enter the admin API key to use the dashboard.');
    return {
      'Content-Type': 'application/json',
      'x-admin-api-key': session.apiKey,
      'x-admin-name': session.name || 'Admin User',
      'x-admin-email': session.email || ''
    };
  }

  async function apiRequest(url, options) {
    const response = await fetch(url, Object.assign({}, options || {}, {
      headers: Object.assign({}, options && options.headers ? options.headers : {}, getHeaders())
    }));
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  function renderMetrics(data) {
    const metrics = data.metrics || {};
    const nominationMetrics = metrics.nominations || {};
    const paymentMetrics = metrics.payments || {};
    const privacyMetrics = metrics.privacy || {};
    const partnerMetrics = metrics.partners || {};

    const cards = [
      { value: nominationMetrics.total_nominations || 0, label: 'Total nominations' },
      { value: nominationMetrics.ready_for_jury || 0, label: 'Ready for jury' },
      { value: paymentMetrics.verified_unlinked_payments || 0, label: 'Verified payments not yet submitted' },
      { value: privacyMetrics.open_privacy_requests || 0, label: 'Open privacy tickets' },
      { value: privacyMetrics.overdue_privacy_requests || 0, label: 'Overdue privacy tickets' },
      { value: nominationMetrics.verification_hold || 0, label: 'Verification holds' },
      { value: paymentMetrics.payment_exceptions || 0, label: 'Payment exceptions' },
      { value: partnerMetrics.new_partner_inquiries || 0, label: 'New partner inquiries' }
    ];

    metricsGrid.innerHTML = cards.map(function (card) {
      return '<div class="metric-card"><strong>' + escapeHtml(card.value) + '</strong><span>' + escapeHtml(card.label) + '</span></div>';
    }).join('');
  }

  function renderNominations(rows) {
    if (!rows || !rows.length) {
      nominationsTableBody.innerHTML = '<tr><td colspan="6">No nominations found for the current filters.</td></tr>';
      return;
    }
    nominationsTableBody.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.nomination_reference) + '</strong><span class="mono">' + escapeHtml(row.primary_contact_email || '') + '</span><span class="muted">' + formatDate(row.created_at) + '</span></div></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.legal_name) + '</strong><span>' + escapeHtml(row.primary_contact_name || '') + '</span><span class="muted">Owner: ' + escapeHtml(row.assigned_owner || 'Unassigned') + '</span></div></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.award_category) + '</strong><span class="badge">' + escapeHtml(row.payment_provider || '') + '</span></div></td>' +
        '<td><div class="mini-grid"><span>' + badge(row.payment_status || '—', (row.payment_status === 'captured' || row.payment_status === 'PAID') ? 'success' : '') + '</span><span>₹' + escapeHtml(row.payment_amount_inr || '100.00') + '</span></div></td>' +
        '<td><div class="mini-grid">' + badge(row.status || 'submitted', row.status === 'winner' ? 'success' : '') + badge(row.screening_status || 'payment_verified', row.screening_status === 'verification_hold' ? 'warn' : '') + '</div></td>' +
        '<td><div class="inline-actions">' +
          '<select class="admin-input" data-action-status><option value="">Status</option>' +
            ['submitted','shortlisted','finalist','winner','rejected','withdrawn'].map(function (value) { return '<option value="' + value + '"' + (row.status === value ? ' selected' : '') + '>' + value + '</option>'; }).join('') +
          '</select>' +
          '<select class="admin-input" data-action-screening><option value="">Screening</option>' +
            ['payment_verified','screening_pending','verification_hold','ready_for_jury','jury_review','closed'].map(function (value) { return '<option value="' + value + '"' + (row.screening_status === value ? ' selected' : '') + '>' + value + '</option>'; }).join('') +
          '</select>' +
          '<input class="admin-input" data-action-owner placeholder="Owner" value="' + escapeHtml(row.assigned_owner || '') + '">' +
          '<button class="btn btn-secondary" type="button" data-update-nomination data-id="' + escapeHtml(row.id) + '">Save</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function renderPayments(rows) {
    if (!rows || !rows.length) {
      paymentsTableBody.innerHTML = '<tr><td colspan="6">No payment rows found for the current filters.</td></tr>';
      return;
    }
    paymentsTableBody.innerHTML = rows.map(function (row) {
      const tone = row.verification_status === 'linked_to_nomination' ? 'success' : (row.verification_status === 'verified' ? 'warn' : '');
      return '<tr>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml((row.gateway_provider || '').toUpperCase()) + '</strong><span class="muted">' + formatDate(row.created_at) + '</span></div></td>' +
        '<td><div class="mini-grid"><span class="mono">' + escapeHtml(row.order_id || '') + '</span><span class="mono">' + escapeHtml(row.payment_id || 'No payment id yet') + '</span></div></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.legal_name || '') + '</strong><span>' + escapeHtml(row.award_category || '') + '</span><span class="muted">' + escapeHtml(row.customer_email || '') + '</span></div></td>' +
        '<td>₹' + escapeHtml(row.amount_inr || '100.00') + ' ' + escapeHtml(row.currency || 'INR') + '</td>' +
        '<td><div class="mini-grid">' + badge(row.verification_status || '—', tone) + badge(row.gateway_status || '—', row.gateway_status === 'captured' || row.gateway_status === 'PAID' ? 'success' : '') + '</div></td>' +
        '<td><div class="mini-grid"><span>Verified: ' + formatDate(row.verified_at) + '</span><span class="muted">Nom ref: ' + escapeHtml(row.nomination_reference || 'Pending') + '</span></div></td>' +
      '</tr>';
    }).join('');
  }

  function renderPrivacy(rows) {
    if (!rows || !rows.length) {
      privacyTableBody.innerHTML = '<tr><td colspan="6">No privacy tickets found for the current filters.</td></tr>';
      return;
    }
    privacyTableBody.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.request_reference) + '</strong><span class="muted">' + formatDate(row.created_at) + '</span></div></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.full_name) + '</strong><span>' + escapeHtml(row.email || '') + '</span><span class="muted">' + escapeHtml(row.relationship || '') + '</span></div></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.request_type) + '</strong><span>' + escapeHtml(row.description || '').slice(0, 120) + (row.description && row.description.length > 120 ? '…' : '') + '</span></div></td>' +
        '<td><div class="mini-grid">' + badge(row.priority || 'p3', row.priority === 'p1' ? 'danger' : row.priority === 'p2' ? 'warn' : '') + (row.public_content_flag ? badge('public', 'warn') : '') + (row.security_incident_flag ? badge('security', 'danger') : '') + '</div></td>' +
        '<td><div class="mini-grid">' + badge(row.status || 'new', row.status === 'resolved' || row.status === 'closed' ? 'success' : '') + '<span class="muted">Due: ' + formatDate(row.due_at) + '</span><span class="muted">Owner: ' + escapeHtml(row.owner_name || 'Unassigned') + '</span></div></td>' +
        '<td><div class="inline-actions">' +
          '<select class="admin-input" data-action-ticket-status><option value="">Status</option>' +
            ['new','acknowledged','awaiting_verification','in_review','awaiting_internal_action','awaiting_requester_response','resolved','closed','rejected'].map(function (value) { return '<option value="' + value + '"' + (row.status === value ? ' selected' : '') + '>' + value + '</option>'; }).join('') +
          '</select>' +
          '<select class="admin-input" data-action-ticket-priority><option value="">Priority</option>' +
            ['p1','p2','p3'].map(function (value) { return '<option value="' + value + '"' + (row.priority === value ? ' selected' : '') + '>' + value.toUpperCase() + '</option>'; }).join('') +
          '</select>' +
          '<input class="admin-input" data-action-ticket-owner placeholder="Owner" value="' + escapeHtml(row.owner_name || '') + '">' +
          '<button class="btn btn-secondary" type="button" data-update-ticket data-id="' + escapeHtml(row.id) + '">Save</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  function renderPartners(rows) {
    if (!rows || !rows.length) {
      partnersTableBody.innerHTML = '<tr><td colspan="6">No partner inquiries found for the current filters.</td></tr>';
      return;
    }
    partnersTableBody.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(row.inquiry_reference) + '</strong></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.company_name) + '</strong><span class="muted">' + escapeHtml(row.status || 'new') + '</span></div></td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.contact_name) + '</strong><span>' + escapeHtml(row.contact_email || '') + '</span><span class="muted">' + escapeHtml(row.contact_phone || '') + '</span></div></td>' +
        '<td>' + escapeHtml(row.interest_type || '') + '</td>' +
        '<td>' + escapeHtml(row.message || '').slice(0, 120) + (row.message && row.message.length > 120 ? '…' : '') + '</td>' +
        '<td>' + formatDate(row.created_at) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderAudit(rows) {
    if (!rows || !rows.length) {
      auditTableBody.innerHTML = '<tr><td colspan="5">No audit events found yet.</td></tr>';
      return;
    }
    auditTableBody.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td>' + formatDate(row.created_at) + '</td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.entity_type) + '</strong><span class="mono">' + escapeHtml(row.entity_id) + '</span></div></td>' +
        '<td>' + escapeHtml(row.action) + '</td>' +
        '<td><div class="mini-grid"><strong>' + escapeHtml(row.actor_name || 'System') + '</strong><span class="muted">' + escapeHtml(row.actor_identifier || '') + '</span></div></td>' +
        '<td><pre style="margin:0;white-space:pre-wrap;">' + escapeHtml(JSON.stringify(row.metadata || {}, null, 2)) + '</pre></td>' +
      '</tr>';
    }).join('');
  }

  async function loadDashboard() {
    const data = await apiRequest(endpoints.dashboard + '?limit=10');
    renderMetrics(data);
    renderNominations(data.nominations || []);
    renderPayments(data.payments || []);
    renderPrivacy(data.privacyTickets || []);
    renderPartners(data.partnerInquiries || []);
    renderAudit(data.audit || []);
  }

  function formQueryString(form) {
    const params = new URLSearchParams(new FormData(form));
    params.set('limit', '25');
    return params.toString();
  }

  async function loadNominations() {
    const qs = formQueryString(nominationFilterForm);
    const data = await apiRequest(endpoints.nominations + '?' + qs);
    renderNominations(data.rows || []);
  }

  async function loadPayments() {
    const qs = formQueryString(paymentFilterForm);
    const data = await apiRequest(endpoints.payments + '?' + qs);
    renderPayments(data.rows || []);
  }

  async function loadPrivacy() {
    const qs = formQueryString(privacyFilterForm);
    const data = await apiRequest(endpoints.privacy + '?' + qs);
    renderPrivacy(data.rows || []);
  }

  async function loadPartners() {
    const qs = formQueryString(partnerFilterForm);
    const data = await apiRequest(endpoints.partners + '?' + qs);
    renderPartners(data.rows || []);
  }

  async function refreshAll() {
    setStatus('Refreshing dashboard data…', 'success');
    await Promise.all([loadDashboard(), loadNominations(), loadPayments(), loadPrivacy(), loadPartners()]);
    setStatus('Dashboard refreshed successfully.', 'success');
  }

  async function updateNomination(button) {
    const row = button.closest('tr');
    const payload = {
      id: button.getAttribute('data-id'),
      status: row.querySelector('[data-action-status]').value,
      screeningStatus: row.querySelector('[data-action-screening]').value,
      assignedOwner: row.querySelector('[data-action-owner]').value
    };
    await apiRequest(endpoints.nominations, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setStatus('Nomination updated.', 'success');
    await loadNominations();
    await loadDashboard();
  }

  async function updatePrivacyTicket(button) {
    const row = button.closest('tr');
    const payload = {
      id: button.getAttribute('data-id'),
      status: row.querySelector('[data-action-ticket-status]').value,
      priority: row.querySelector('[data-action-ticket-priority]').value,
      ownerName: row.querySelector('[data-action-ticket-owner]').value
    };
    await apiRequest(endpoints.privacy, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setStatus('Privacy ticket updated.', 'success');
    await loadPrivacy();
    await loadDashboard();
  }

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const payload = {
      name: loginForm.adminName.value.trim(),
      email: loginForm.adminEmail.value.trim(),
      apiKey: loginForm.adminApiKey.value.trim()
    };
    saveSession(payload);
    try {
      await loadDashboard();
      setStatus('Dashboard connected successfully.', 'success');
      await Promise.all([loadNominations(), loadPayments(), loadPrivacy(), loadPartners()]);
    } catch (err) {
      clearSession();
      setStatus(err.message || 'Could not connect to the admin APIs.', 'error');
    }
  });

  logoutButton.addEventListener('click', function () {
    clearSession();
    if (loginForm) loginForm.reset();
    setStatus('Admin session cleared.', 'success');
  });

  refreshDashboardButton.addEventListener('click', function () {
    refreshAll().catch(function (err) {
      setStatus(err.message || 'Could not refresh the dashboard.', 'error');
    });
  });

  nominationFilterForm.addEventListener('submit', function (event) {
    event.preventDefault();
    loadNominations().catch(function (err) {
      setStatus(err.message || 'Could not load nominations.', 'error');
    });
  });
  paymentFilterForm.addEventListener('submit', function (event) {
    event.preventDefault();
    loadPayments().catch(function (err) {
      setStatus(err.message || 'Could not load payments.', 'error');
    });
  });
  privacyFilterForm.addEventListener('submit', function (event) {
    event.preventDefault();
    loadPrivacy().catch(function (err) {
      setStatus(err.message || 'Could not load privacy tickets.', 'error');
    });
  });
  partnerFilterForm.addEventListener('submit', function (event) {
    event.preventDefault();
    loadPartners().catch(function (err) {
      setStatus(err.message || 'Could not load partner inquiries.', 'error');
    });
  });

  document.addEventListener('click', function (event) {
    const nominationButton = event.target.closest('[data-update-nomination]');
    if (nominationButton) {
      updateNomination(nominationButton).catch(function (err) {
        setStatus(err.message || 'Could not update the nomination.', 'error');
      });
      return;
    }
    const ticketButton = event.target.closest('[data-update-ticket]');
    if (ticketButton) {
      updatePrivacyTicket(ticketButton).catch(function (err) {
        setStatus(err.message || 'Could not update the privacy ticket.', 'error');
      });
    }
  });

  applySessionToForm();
  if (getSession() && getSession().apiKey) {
    refreshAll().catch(function (err) {
      setStatus(err.message || 'Could not restore the admin session.', 'error');
    });
  }
})();
