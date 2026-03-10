(function () {
  const body = document.body;
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  const yearTarget = document.querySelector('[data-current-year]');
  const rootConfig = window.SOHO_CONFIG || {};

  function getSiteUrl() {
    if (rootConfig.siteUrl && /^https?:\/\//i.test(rootConfig.siteUrl)) {
      return rootConfig.siteUrl.replace(/\/$/, '');
    }
    return window.location.origin.replace(/\/$/, '');
  }

  function updateSeoUrls() {
    const siteUrl = getSiteUrl();
    const path = window.location.pathname || '/';
    const cleanPath = path.endsWith('index.html') ? '/index.html' : path;
    const absoluteUrl = siteUrl + cleanPath;
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (canonical) canonical.setAttribute('href', absoluteUrl);
    if (ogUrl) ogUrl.setAttribute('content', absoluteUrl);
    const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
    schemaScripts.forEach(function (script) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.url) data.url = absoluteUrl;
        if (data.organizer && data.organizer.url) data.organizer.url = siteUrl;
        if (data.organizer && data.organizer.name === '[Organizer Legal Name]' && rootConfig.organizerName) {
          data.organizer.name = rootConfig.organizerName;
        }
        script.textContent = JSON.stringify(data, null, 2);
      } catch (err) {}
    });
  }

  updateSeoUrls();

  if (yearTarget) yearTarget.textContent = new Date().getFullYear();

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      body.classList.toggle('menu-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  const cookieKey = 'soho-cookie-preferences-v1';
  const banner = document.querySelector('[data-cookie-banner]');
  const modal = document.querySelector('[data-cookie-modal]');
  const openSettingsButtons = document.querySelectorAll('[data-open-cookie-settings]');
  const closeSettingsButton = document.querySelector('[data-close-cookie-settings]');
  const savePrefsButton = document.querySelector('[data-save-cookie-settings]');
  const acceptAllButtons = document.querySelectorAll('[data-accept-all-cookies]');
  const rejectOptionalButtons = document.querySelectorAll('[data-reject-optional-cookies]');
  const statusToast = document.querySelector('[data-cookie-status]');
  const toggles = {
    functional: document.querySelector('[data-cookie-functional]'),
    analytics: document.querySelector('[data-cookie-analytics]'),
    media: document.querySelector('[data-cookie-media]'),
    ads: document.querySelector('[data-cookie-ads]')
  };

  function showToast(message) {
    if (!statusToast) return;
    statusToast.textContent = message;
    statusToast.classList.add('show');
    statusToast.classList.add('status-success');
    setTimeout(() => {
      statusToast.classList.remove('show');
    }, 2600);
  }

  function defaultPrefs() {
    return { necessary: true, functional: false, analytics: false, media: false, ads: false };
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(cookieKey);
      if (!raw) return null;
      return Object.assign(defaultPrefs(), JSON.parse(raw));
    } catch (err) {
      return null;
    }
  }

  function applyPrefs(prefs) {
    if (toggles.functional) toggles.functional.checked = !!prefs.functional;
    if (toggles.analytics) toggles.analytics.checked = !!prefs.analytics;
    if (toggles.media) toggles.media.checked = !!prefs.media;
    if (toggles.ads) toggles.ads.checked = !!prefs.ads;
    document.documentElement.dataset.cookieAnalytics = prefs.analytics ? 'on' : 'off';
    document.documentElement.dataset.cookieMedia = prefs.media ? 'on' : 'off';
  }

  function savePrefs(prefs, toastMessage) {
    localStorage.setItem(cookieKey, JSON.stringify(prefs));
    applyPrefs(prefs);
    if (banner) banner.classList.remove('show');
    if (modal) modal.classList.remove('show');
    if (toastMessage) showToast(toastMessage);
  }

  const existingPrefs = loadPrefs();
  if (existingPrefs) {
    applyPrefs(existingPrefs);
  } else if (banner) {
    banner.classList.add('show');
  }

  openSettingsButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (modal) modal.classList.add('show');
    });
  });

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener('click', function () {
      if (modal) modal.classList.remove('show');
    });
  }

  if (savePrefsButton) {
    savePrefsButton.addEventListener('click', function () {
      savePrefs({
        necessary: true,
        functional: !!(toggles.functional && toggles.functional.checked),
        analytics: !!(toggles.analytics && toggles.analytics.checked),
        media: !!(toggles.media && toggles.media.checked),
        ads: !!(toggles.ads && toggles.ads.checked)
      }, 'Cookie preferences saved.');
    });
  }

  acceptAllButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      savePrefs({ necessary: true, functional: true, analytics: true, media: true, ads: true }, 'Cookie preferences saved.');
    });
  });

  rejectOptionalButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      savePrefs(defaultPrefs(), 'Only essential cookies will be used unless you change your preferences.');
    });
  });

  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('show');
    });
  }

  const configTargets = document.querySelectorAll('[data-config-link]');
  configTargets.forEach(function (el) {
    const key = el.getAttribute('data-config-link');
    if (rootConfig[key]) {
      el.setAttribute('href', rootConfig[key]);
    } else if (el.tagName === 'A') {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        alert('Set "' + key + '" in assets/js/config.js before going live.');
      });
    }
  });

  const textTargets = document.querySelectorAll('[data-config-text]');
  textTargets.forEach(function (el) {
    const key = el.getAttribute('data-config-text');
    if (!rootConfig[key]) return;
    el.textContent = rootConfig[key];

    if (el.tagName === 'A') {
      if (key.toLowerCase().includes('email')) {
        el.setAttribute('href', 'mailto:' + rootConfig[key]);
      }
      if (key.toLowerCase().includes('phone')) {
        const phone = rootConfig[key].replace(/\s+/g, '');
        el.setAttribute('href', 'tel:' + phone);
      }
    }
  });

  function serializeForm(form) {
    const data = {};
    const formData = new FormData(form);
    formData.forEach(function (value, key) {
      if (data[key] !== undefined) {
        if (!Array.isArray(data[key])) data[key] = [data[key]];
        data[key].push(value);
      } else {
        data[key] = value;
      }
    });
    data.pageUrl = window.location.href;
    data.submittedAt = new Date().toISOString();
    return data;
  }

  function getStatusBox(form) {
    return form.querySelector('[data-form-status]')
      || (form.closest('.form-shell') && form.closest('.form-shell').querySelector('[data-form-status]'))
      || (form.parentElement && form.parentElement.querySelector('[data-form-status]'));
  }

  function setStatus(statusBox, message, kind) {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = 'status-box show ' + (kind === 'success' ? 'status-success' : 'status-error');
  }

  async function handleFormSubmit(form, endpoint, successMessage) {
    const statusBox = getStatusBox(form);
    const submitButton = form.querySelector('button[type="submit"]');
    const payload = serializeForm(form);

    if (!endpoint) {
      setStatus(statusBox, 'Form endpoint not configured yet. Update assets/js/config.js before launch.', 'error');
      return false;
    }

    if (submitButton) submitButton.disabled = true;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.message || 'Request failed');
      form.reset();
      setStatus(statusBox, result.message || successMessage || 'Your request has been sent successfully.', 'success');
      return true;
    } catch (err) {
      setStatus(statusBox, err.message || 'We could not send the form right now. Please retry or use the published contact email.', 'error');
      return false;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  function loadExternalScript(src) {
    return new Promise(function (resolve, reject) {
      if (!src) return reject(new Error('Missing script URL'));
      const existing = document.querySelector('script[data-external-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', function () { resolve(); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Could not load payment script.')); }, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.externalSrc = src;
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () { reject(new Error('Could not load payment script.')); };
      document.head.appendChild(script);
    });
  }

  const nominationForm = document.querySelector('[data-nomination-form="true"]');

  function initNominationPaymentFlow(form) {
    const draftKey = 'soho-nomination-draft-v3';
    const pendingCashfreeKey = 'soho-cashfree-pending-v1';
    const statusBox = getStatusBox(form);
    const providerSelect = form.querySelector('[data-payment-provider]');
    const paymentState = form.querySelector('[data-payment-state]');
    const startPaymentButton = form.querySelector('[data-start-payment]');
    const refreshPaymentButton = form.querySelector('[data-refresh-payment]');
    const submitButton = form.querySelector('[data-submit-nomination]');
    const endpointCreate = rootConfig.nominationPaymentCreateOrderEndpoint;
    const endpointVerify = rootConfig.nominationPaymentVerifyEndpoint;
    const configuredProviders = Array.isArray(rootConfig.nominationPaymentProviders) ? rootConfig.nominationPaymentProviders : [rootConfig.nominationPaymentProvider || 'razorpay'];
    const feeInr = Number(rootConfig.nominationFeeInr || 100);

    const hidden = {
      orderId: form.querySelector('[data-payment-order-id]'),
      paymentId: form.querySelector('[data-payment-id]'),
      status: form.querySelector('[data-payment-status]'),
      token: form.querySelector('[data-payment-verified-token]'),
      verifiedAt: form.querySelector('[data-payment-verified-at]'),
      amount: form.querySelector('[data-payment-amount]'),
      gatewayOrderId: form.querySelector('[data-payment-gateway-order-id]'),
      gatewayPaymentId: form.querySelector('[data-payment-gateway-payment-id]'),
      nominationReference: form.querySelector('[data-payment-nomination-reference]')
    };

    function setPaymentState(message, kind) {
      if (!paymentState) return;
      paymentState.textContent = message;
      paymentState.className = 'payment-state';
      if (kind === 'success') paymentState.classList.add('state-success');
      if (kind === 'error') paymentState.classList.add('state-error');
      if (kind === 'processing') paymentState.classList.add('state-processing');
    }

    function clearPaymentData() {
      Object.keys(hidden).forEach(function (key) {
        if (hidden[key]) hidden[key].value = '';
      });
      if (refreshPaymentButton) refreshPaymentButton.hidden = true;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Complete payment to unlock final submission';
      }
      setPaymentState('Awaiting payment', null);
    }

    function saveDraft(includePaymentState) {
      const payload = serializeForm(form);
      if (!includePaymentState) {
        delete payload.paymentVerifiedToken;
        delete payload.paymentStatus;
        delete payload.paymentId;
        delete payload.paymentOrderId;
        delete payload.paymentGatewayOrderId;
        delete payload.paymentGatewayPaymentId;
        delete payload.paymentVerifiedAt;
        delete payload.paymentAmountInr;
      }
      sessionStorage.setItem(draftKey, JSON.stringify(payload));
    }

    function restoreDraft() {
      try {
        const raw = sessionStorage.getItem(draftKey);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.keys(data).forEach(function (key) {
          const field = form.elements.namedItem(key);
          if (!field) return;
          if (field.type === 'checkbox') {
            field.checked = !!data[key];
          } else if (field.tagName === 'SELECT' || field.type === 'hidden' || !field.value) {
            field.value = data[key];
          }
        });
      } catch (err) {}
    }

    function clearDraft() {
      sessionStorage.removeItem(draftKey);
    }

    function setPendingCashfree(order) {
      sessionStorage.setItem(pendingCashfreeKey, JSON.stringify(order));
    }

    function getPendingCashfree() {
      try {
        const raw = sessionStorage.getItem(pendingCashfreeKey);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return null;
      }
    }

    function clearPendingCashfree() {
      sessionStorage.removeItem(pendingCashfreeKey);
    }

    function fillPaymentResult(verification) {
      const payment = verification.payment || {};
      if (hidden.orderId) hidden.orderId.value = payment.orderId || '';
      if (hidden.paymentId) hidden.paymentId.value = payment.paymentId || '';
      if (hidden.status) hidden.status.value = payment.paymentStatus || 'verified';
      if (hidden.token) hidden.token.value = verification.verifiedToken || '';
      if (hidden.verifiedAt) hidden.verifiedAt.value = payment.verifiedAt || '';
      if (hidden.amount) hidden.amount.value = String(payment.amountInr || feeInr);
      if (hidden.gatewayOrderId) hidden.gatewayOrderId.value = payment.gatewayOrderId || '';
      if (hidden.gatewayPaymentId) hidden.gatewayPaymentId.value = payment.gatewayPaymentId || '';
      if (hidden.nominationReference) hidden.nominationReference.value = payment.nominationReference || '';
      if (providerSelect) providerSelect.value = payment.provider || providerSelect.value;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Nomination';
      }
      if (refreshPaymentButton) refreshPaymentButton.hidden = true;
      setPaymentState('Payment verified: ' + (verification.paymentLabel || payment.paymentId || 'success'), 'success');
      saveDraft(true);
    }

    async function postJson(endpoint, payload) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.message || 'Request failed');
      return result;
    }

    function validatePaymentFields() {
      const required = [
        { name: 'awardCategory', label: 'Award Category' },
        { name: 'legalName', label: 'Legal Name' },
        { name: 'primaryContactName', label: 'Primary Contact Name' },
        { name: 'primaryContactPhone', label: 'Phone Number' },
        { name: 'primaryContactEmail', label: 'Email Address' }
      ];
      const missing = required.filter(function (item) {
        const field = form.elements.namedItem(item.name);
        return !field || !String(field.value || '').trim();
      });
      if (missing.length) {
        throw new Error('Complete these fields before payment: ' + missing.map(function (item) { return item.label; }).join(', '));
      }
    }

    async function verifyPayment(provider, payload) {
      if (!endpointVerify) throw new Error('Payment verification endpoint not configured.');
      setPaymentState('Verifying payment…', 'processing');
      const result = await postJson(endpointVerify, Object.assign({ provider: provider }, payload));
      fillPaymentResult(result);
      return result;
    }

    async function startRazorpay(order) {
      await loadExternalScript('https://checkout.razorpay.com/v1/checkout.js');
      if (!window.Razorpay) throw new Error('Razorpay checkout could not be loaded.');

      return new Promise(function (resolve, reject) {
        const razorpay = new window.Razorpay({
          key: order.publicKey,
          amount: order.amount,
          currency: order.currency,
          name: 'SOHO Awards 2026',
          description: order.description,
          order_id: order.orderId,
          prefill: order.prefill || {},
          notes: order.notes || {},
          theme: { color: '#0f4f43' },
          modal: {
            ondismiss: function () {
              setPaymentState('Payment window closed before verification.', 'error');
              reject(new Error('Payment window closed before verification.'));
            }
          },
          handler: async function (response) {
            try {
              const verification = await verifyPayment('razorpay', {
                orderId: order.orderId,
                gatewayOrderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                email: order.prefill && order.prefill.email,
                contact: order.prefill && order.prefill.contact,
                legalName: (order.notes && order.notes.applicant_name) || '',
                awardCategory: (order.notes && order.notes.award_category) || '',
                nominationReference: order.nominationReference
              });
              resolve(verification);
            } catch (err) {
              setStatus(statusBox, err.message || 'Razorpay payment verification failed.', 'error');
              reject(err);
            }
          }
        });
        razorpay.open();
      });
    }

    async function startCashfree(order) {
      await loadExternalScript('https://sdk.cashfree.com/js/v3/cashfree.js');
      if (!window.Cashfree) throw new Error('Cashfree checkout could not be loaded.');
      saveDraft(false);
      setPendingCashfree({
        orderId: order.orderId,
        nominationReference: order.nominationReference,
        provider: 'cashfree'
      });
      setPaymentState('Redirecting to Cashfree checkout…', 'processing');
      if (refreshPaymentButton) refreshPaymentButton.hidden = false;
      const cashfree = window.Cashfree({ mode: order.mode || (rootConfig.nominationPaymentMode === 'live' ? 'production' : 'sandbox') });
      const result = await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: '_self',
        returnUrl: order.returnUrl
      });
      if (result && result.error) {
        throw new Error(result.error.message || 'Cashfree checkout could not be opened.');
      }
    }

    async function initiatePayment() {
      clearPaymentData();
      validatePaymentFields();
      if (!endpointCreate) throw new Error('Payment create-order endpoint not configured.');
      saveDraft(false);
      const provider = providerSelect ? providerSelect.value : (rootConfig.nominationPaymentProvider || 'razorpay');
      setPaymentState('Creating payment order…', 'processing');
      const order = await postJson(endpointCreate, Object.assign(serializeForm(form), { provider: provider }));
      if (hidden.nominationReference) hidden.nominationReference.value = order.nominationReference || '';
      if (provider === 'razorpay') return startRazorpay(order);
      if (provider === 'cashfree') return startCashfree(order);
      throw new Error('Unsupported payment provider selected.');
    }

    async function refreshCashfreePaymentFromUrlOrSession() {
      const params = new URLSearchParams(window.location.search);
      const queryProvider = params.get('payment_provider');
      const queryOrderId = params.get('order_id');
      const pending = getPendingCashfree();
      const orderId = (queryProvider === 'cashfree' && queryOrderId) ? queryOrderId : (pending && pending.orderId);
      if (!orderId) return;

      restoreDraft();
      if (providerSelect) providerSelect.value = 'cashfree';
      if (refreshPaymentButton) refreshPaymentButton.hidden = false;
      try {
        await verifyPayment('cashfree', {
          orderId: orderId,
          nominationReference: pending && pending.nominationReference
        });
        clearPendingCashfree();
        if (window.history && window.history.replaceState) {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch (err) {
        setPaymentState(err.message || 'Cashfree payment is not complete yet.', 'error');
        setStatus(statusBox, err.message || 'Cashfree payment is not complete yet.', 'error');
      }
    }

    clearPaymentData();
    restoreDraft();
    if (hidden.token && hidden.token.value) {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Nomination';
      }
      setPaymentState('Previously verified payment restored for this draft.', 'success');
    }

    if (providerSelect) {
      Array.from(providerSelect.options).forEach(function (option) {
        option.hidden = configuredProviders.indexOf(option.value) === -1;
      });
      if (configuredProviders.indexOf(providerSelect.value) === -1) {
        providerSelect.value = configuredProviders[0] || 'razorpay';
      }
      providerSelect.addEventListener('change', function () {
        clearPaymentData();
      });
    }

    form.querySelectorAll('input, select, textarea').forEach(function (field) {
      if (field.name && field.name.indexOf('payment') !== 0) {
        field.addEventListener('change', function () {
          saveDraft(false);
        });
      }
    });

    if (startPaymentButton) {
      startPaymentButton.addEventListener('click', async function () {
        startPaymentButton.disabled = true;
        try {
          await initiatePayment();
        } catch (err) {
          setPaymentState(err.message || 'Payment could not be started.', 'error');
          setStatus(statusBox, err.message || 'Payment could not be started.', 'error');
        } finally {
          startPaymentButton.disabled = false;
        }
      });
    }

    if (refreshPaymentButton) {
      refreshPaymentButton.addEventListener('click', async function () {
        const pending = getPendingCashfree();
        const orderId = (hidden.orderId && hidden.orderId.value) || (pending && pending.orderId);
        if (!orderId) {
          setStatus(statusBox, 'There is no pending Cashfree order to refresh.', 'error');
          return;
        }
        refreshPaymentButton.disabled = true;
        try {
          await verifyPayment('cashfree', {
            orderId: orderId,
            nominationReference: pending && pending.nominationReference
          });
          clearPendingCashfree();
        } catch (err) {
          setPaymentState(err.message || 'Cashfree payment is not complete yet.', 'error');
          setStatus(statusBox, err.message || 'Cashfree payment is not complete yet.', 'error');
        } finally {
          refreshPaymentButton.disabled = false;
        }
      });
    }

    refreshCashfreePaymentFromUrlOrSession();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!hidden.token || !hidden.token.value) {
        setStatus(statusBox, 'Complete and verify the ₹' + feeInr + ' nomination fee before submitting the form.', 'error');
        setPaymentState('Payment verification required before submission.', 'error');
        return;
      }
      const success = await handleFormSubmit(form, rootConfig.nominationEndpoint, form.getAttribute('data-success-message') || '');
      if (success) {
        clearDraft();
        clearPendingCashfree();
        clearPaymentData();
      }
    });
  }

  document.querySelectorAll('[data-endpoint-key]').forEach(function (form) {
    if (form.getAttribute('data-nomination-form') === 'true') return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const key = form.getAttribute('data-endpoint-key');
      const successMessage = form.getAttribute('data-success-message') || '';
      handleFormSubmit(form, rootConfig[key], successMessage);
    });
  });

  if (nominationForm) initNominationPaymentFlow(nominationForm);
})();
