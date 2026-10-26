// Logica applicativa principale
(() => {
  const fmt = Charts.formatEUR;
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const currentMonth = () => new Date().toISOString().slice(0, 7);

  const ACCOUNT_TYPE_LABEL = { bank: 'Banca', cash: 'Contanti', card: 'Carta', other: 'Altro' };
  const ACCOUNT_TYPE_ICON = { bank: '🏦', cash: '💵', card: '💳', other: '📁' };

  // ---------- Navigazione ----------
  function switchView(viewName) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');
    renderView(viewName);
  }

  function renderView(viewName) {
    if (viewName === 'dashboard') renderDashboard();
    else if (viewName === 'transactions') renderTransactionsView();
    else if (viewName === 'accounts') renderAccountsView();
    else if (viewName === 'budget') renderBudgetView();
    else if (viewName === 'profession') renderProfessionView();
    else if (viewName === 'investments') renderInvestmentsView();
    else if (viewName === 'recurring') renderRecurringView();
    else if (viewName === 'bank') renderBankView();
    else if (viewName === 'sync') renderSyncView();
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.querySelectorAll('[data-view-link]').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.viewLink));
  });

  // ---------- Tema (chiaro/scuro) ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Tema chiaro' : '🌙 Tema scuro';
    try { localStorage.setItem('finanza.theme', theme); } catch (e) {}
  }

  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  // ---------- Toast ----------
  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const month = currentMonth();
    const label = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    document.getElementById('dashboard-month-label').textContent = label.charAt(0).toUpperCase() + label.slice(1);

    document.getElementById('stat-total-balance').textContent = fmt(DB.getTotalBalance());
    const summary = DB.getMonthSummary(month);
    document.getElementById('stat-month-income').textContent = fmt(summary.income);
    document.getElementById('stat-month-expense').textContent = fmt(summary.expense);
    document.getElementById('stat-month-net').textContent = fmt(summary.net);

    Charts.renderCategoryChart('chart-category', DB.getSpendingByCategory(month));

    const months = DB.getLastNMonths(6);
    const incomeData = months.map((m) => DB.getMonthSummary(m).income);
    const expenseData = months.map((m) => DB.getMonthSummary(m).expense);
    Charts.renderTrendChart('chart-trend', months, incomeData, expenseData);

    const budgets = DB.getBudgetsForMonth(month);
    const spending = DB.getSpendingByCategory(month);
    const categoriesWithBudget = Object.keys(budgets).filter((c) => budgets[c] > 0);
    Charts.renderBudgetChart(
      'chart-budget',
      categoriesWithBudget,
      categoriesWithBudget.map((c) => budgets[c]),
      categoriesWithBudget.map((c) => spending[c] || 0)
    );

    const recent = DB.getTransactions().slice(0, 6);
    renderTransactionList('recent-transactions-list', recent);
  }

  // ---------- Lista transazioni (componente riutilizzabile) ----------
  function renderTransactionList(containerId, transactions) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    transactions.forEach((t) => {
      const account = DB.getAccount(t.accountId);
      const row = document.createElement('div');
      row.className = 'tx-row';
      const scope = t.scope || 'personal';
      row.innerHTML = `
        <div class="tx-icon ${t.type}">${t.type === 'income' ? '↑' : '↓'}</div>
        <div class="tx-main">
          <span class="tx-category">${escapeHtml(t.category)}${scope === 'professional' ? ' <span class=\"tx-badge\">💼 Professionale</span>' : ''}${t.excludeContributions ? ' <span class=\"tx-badge recurring-paused-badge\">Senza contributi</span>' : ''}</span>
          <span class="tx-sub">${escapeHtml(account ? account.name : 'Conto eliminato')} · ${formatDate(t.date)}${t.note ? ' · ' + escapeHtml(t.note) : ''}</span>
        </div>
        <div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</div>
      `;
      row.addEventListener('click', () => openTransactionModal(t.id));
      container.appendChild(row);
    });
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Transactions View ----------
  function populateFilterSelects() {
    const accSel = document.getElementById('filter-account');
    accSel.innerHTML = '<option value="">Tutti i conti</option>' +
      DB.getAccounts().map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');

    const catSel = document.getElementById('filter-category');
    const allCats = [
      ...DB.CATEGORIES.personal.income, ...DB.CATEGORIES.personal.expense,
      ...DB.CATEGORIES.professional.income, ...DB.CATEGORIES.professional.expense,
    ];
    catSel.innerHTML = '<option value="">Tutte le categorie</option>' +
      allCats.map((c) => `<option value="${c}">${c}</option>`).join('');
  }

  function renderTransactionsView() {
    populateFilterSelects();
    applyFilters();
  }

  function applyFilters() {
    const accountId = document.getElementById('filter-account').value;
    const category = document.getElementById('filter-category').value;
    const type = document.getElementById('filter-type').value;
    const scope = document.getElementById('filter-scope').value;
    const month = document.getElementById('filter-month').value;

    let list = DB.getTransactions();
    if (accountId) list = list.filter((t) => t.accountId === accountId);
    if (category) list = list.filter((t) => t.category === category);
    if (type) list = list.filter((t) => t.type === type);
    if (scope) list = list.filter((t) => (t.scope || 'personal') === scope);
    if (month) list = list.filter((t) => DB.getMonthKey(t.date) === month);

    renderTransactionList('all-transactions-list', list);
    document.getElementById('transactions-empty').style.display = list.length === 0 ? 'block' : 'none';
  }

  ['filter-account', 'filter-category', 'filter-type', 'filter-scope', 'filter-month'].forEach((id) => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-account').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-scope').value = '';
    document.getElementById('filter-month').value = '';
    applyFilters();
  });

  // ---------- Transaction Modal ----------
  const txModal = document.getElementById('transaction-modal');
  const txForm = document.getElementById('transaction-form');
  let currentTxType = 'expense';
  let currentTxScope = 'personal';

  function populateAccountSelect(selectEl, selectedId) {
    selectEl.innerHTML = DB.getAccounts()
      .map((a) => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
      .join('');
  }

  function populateCategorySelect(selectEl, scope, type, selectedCategory) {
    const cats = DB.CATEGORIES[scope][type];
    selectEl.innerHTML = cats
      .map((c) => `<option value="${c}" ${c === selectedCategory ? 'selected' : ''}>${c}</option>`)
      .join('');
  }

  function updateExcludeContributionsVisibility() {
    const show = currentTxScope === 'professional' && currentTxType === 'income';
    document.getElementById('exclude-contributions-field').style.display = show ? 'flex' : 'none';
    document.getElementById('exclude-contributions-hint').style.display = show ? 'block' : 'none';
    if (!show) document.getElementById('transaction-exclude-contributions').checked = false;
  }

  function setTxType(type, selectedCategory) {
    currentTxType = type;
    document.querySelectorAll('.type-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    populateCategorySelect(document.getElementById('transaction-category'), currentTxScope, type, selectedCategory);
    updateExcludeContributionsVisibility();
  }

  function setTxScope(scope, selectedCategory) {
    currentTxScope = scope;
    document.querySelectorAll('.scope-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scope === scope);
    });
    populateCategorySelect(document.getElementById('transaction-category'), scope, currentTxType, selectedCategory);
    updateExcludeContributionsVisibility();
  }

  document.querySelectorAll('.type-option').forEach((btn) => {
    btn.addEventListener('click', () => setTxType(btn.dataset.type));
  });
  document.querySelectorAll('.scope-option').forEach((btn) => {
    btn.addEventListener('click', () => setTxScope(btn.dataset.scope));
  });

  function openTransactionModal(txId, presetScope) {
    txForm.reset();
    const accounts = DB.getAccounts();
    if (accounts.length === 0) {
      showToast('Crea prima almeno un conto.');
      return;
    }
    populateAccountSelect(document.getElementById('transaction-account'), accounts[0].id);

    if (txId) {
      const t = DB.getTransaction(txId);
      document.getElementById('transaction-modal-title').textContent = 'Modifica transazione';
      document.getElementById('transaction-id').value = t.id;
      document.getElementById('transaction-amount').value = t.amount;
      document.getElementById('transaction-date').value = t.date;
      document.getElementById('transaction-note').value = t.note;
      populateAccountSelect(document.getElementById('transaction-account'), t.accountId);
      setTxScope(t.scope || 'personal', t.category);
      setTxType(t.type, t.category);
      document.getElementById('transaction-exclude-contributions').checked = !!t.excludeContributions;
      document.getElementById('delete-transaction-btn').style.display = 'inline-block';
    } else {
      document.getElementById('transaction-modal-title').textContent = 'Nuova transazione';
      document.getElementById('transaction-id').value = '';
      document.getElementById('transaction-date').value = todayISO();
      setTxScope(presetScope || 'personal');
      setTxType('expense');
      document.getElementById('delete-transaction-btn').style.display = 'none';
    }
    txModal.classList.add('visible');
  }

  function closeTransactionModal() {
    txModal.classList.remove('visible');
  }

  document.getElementById('add-transaction-btn').addEventListener('click', () => openTransactionModal());
  txModal.querySelector('.close-modal').addEventListener('click', closeTransactionModal);
  txModal.addEventListener('click', (e) => { if (e.target === txModal) closeTransactionModal(); });

  txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('transaction-id').value;
    const payload = {
      accountId: document.getElementById('transaction-account').value,
      type: currentTxType,
      scope: currentTxScope,
      amount: document.getElementById('transaction-amount').value,
      category: document.getElementById('transaction-category').value,
      date: document.getElementById('transaction-date').value,
      note: document.getElementById('transaction-note').value,
      excludeContributions: document.getElementById('transaction-exclude-contributions').checked,
    };
    if (id) {
      DB.updateTransaction(id, payload);
      showToast('Transazione aggiornata.');
    } else {
      DB.addTransaction(payload);
      showToast('Transazione aggiunta.');
    }
    closeTransactionModal();
    refreshCurrentView();
  });

  document.getElementById('delete-transaction-btn').addEventListener('click', () => {
    const id = document.getElementById('transaction-id').value;
    if (id && confirm('Eliminare questa transazione?')) {
      DB.deleteTransaction(id);
      showToast('Transazione eliminata.');
      closeTransactionModal();
      refreshCurrentView();
    }
  });

  // ---------- Accounts View ----------
  function renderAccountsView() {
    const grid = document.getElementById('accounts-grid');
    grid.innerHTML = '';
    DB.getAccounts().forEach((a) => {
      const balance = DB.getAccountBalance(a.id);
      const card = document.createElement('div');
      card.className = 'card account-card';
      card.innerHTML = `
        <div class="account-card-header">
          <span class="account-icon">${ACCOUNT_TYPE_ICON[a.type] || '📁'}</span>
          <span class="account-name">${escapeHtml(a.name)}</span>
        </div>
        <span class="account-type-label">${ACCOUNT_TYPE_LABEL[a.type] || 'Altro'}</span>
        <span class="account-balance ${balance < 0 ? 'negative' : ''}">${fmt(balance)}</span>
        ${a.interestRate > 0 ? `<span class="account-interest-label">Tasso: ${a.interestRate}% annuo</span>` : ''}
        ${a.interestRate > 0 && a.interestFrequency && a.interestFrequency !== 'none'
          ? `<span class="account-interest-auto-label">Accredito automatico ${a.interestFrequency === 'daily' ? 'giornaliero' : 'annuale'} · prossimo: ${formatDate(a.nextInterestDate)}</span>`
          : ''}
      `;
      card.addEventListener('click', () => openAccountModal(a.id));

      if (a.interestRate > 0) {
        const interestBtn = document.createElement('button');
        interestBtn.type = 'button';
        interestBtn.className = 'ghost-btn account-interest-btn';
        interestBtn.textContent = '💰 Accredita interessi';
        interestBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openInterestModal(a.id);
        });
        card.appendChild(interestBtn);
      }

      grid.appendChild(card);
    });
    if (DB.getAccounts().length === 0) {
      grid.innerHTML = '<p class="empty-hint">Nessun conto. Creane uno per iniziare.</p>';
    }
  }

  // ---------- Account Modal ----------
  const accModal = document.getElementById('account-modal');
  const accForm = document.getElementById('account-form');

  function openAccountModal(accId) {
    accForm.reset();
    if (accId) {
      const a = DB.getAccount(accId);
      document.getElementById('account-modal-title').textContent = 'Modifica conto';
      document.getElementById('account-id').value = a.id;
      document.getElementById('account-name').value = a.name;
      document.getElementById('account-type').value = a.type;
      document.getElementById('account-balance').value = a.initialBalance;
      document.getElementById('account-interest-rate').value = a.interestRate || '';
      document.getElementById('account-interest-frequency').value = a.interestFrequency || 'none';
      document.getElementById('delete-account-btn').style.display = 'inline-block';
    } else {
      document.getElementById('account-modal-title').textContent = 'Nuovo conto';
      document.getElementById('account-id').value = '';
      document.getElementById('account-balance').value = 0;
      document.getElementById('account-interest-rate').value = '';
      document.getElementById('account-interest-frequency').value = 'none';
      document.getElementById('delete-account-btn').style.display = 'none';
    }
    accModal.classList.add('visible');
  }

  function closeAccountModal() {
    accModal.classList.remove('visible');
  }

  document.getElementById('add-account-btn').addEventListener('click', () => openAccountModal());
  accModal.querySelector('.close-modal').addEventListener('click', closeAccountModal);
  accModal.addEventListener('click', (e) => { if (e.target === accModal) closeAccountModal(); });

  accForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('account-id').value;
    const payload = {
      name: document.getElementById('account-name').value.trim(),
      type: document.getElementById('account-type').value,
      initialBalance: document.getElementById('account-balance').value,
      interestRate: document.getElementById('account-interest-rate').value,
      interestFrequency: document.getElementById('account-interest-frequency').value,
    };
    if (!payload.name) return;
    if (id) {
      DB.updateAccount(id, payload);
      showToast('Conto aggiornato.');
    } else {
      DB.addAccount(payload);
      showToast('Conto creato.');
    }
    closeAccountModal();
    refreshCurrentView();
  });

  document.getElementById('delete-account-btn').addEventListener('click', () => {
    const id = document.getElementById('account-id').value;
    if (id && confirm('Eliminare questo conto e tutte le sue transazioni?')) {
      DB.deleteAccount(id);
      showToast('Conto eliminato.');
      closeAccountModal();
      refreshCurrentView();
    }
  });

  // ---------- Interest Modal (accredito interessi conto deposito) ----------
  const interestModal = document.getElementById('interest-modal');
  const interestForm = document.getElementById('interest-form');
  let currentInterestPeriod = 'annual';

  function computeInterestAmount(accountId, period) {
    const account = DB.getAccount(accountId);
    const balance = DB.getAccountBalance(accountId);
    const rate = (account && account.interestRate) || 0;
    const annual = balance * (rate / 100);
    return period === 'daily' ? annual / 365 : annual;
  }

  function setInterestPeriod(period) {
    currentInterestPeriod = period;
    document.querySelectorAll('.interest-period-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.period === period);
    });
    const accountId = document.getElementById('interest-account-id').value;
    const amount = computeInterestAmount(accountId, period);
    document.getElementById('interest-amount').value = amount.toFixed(2);
  }

  document.querySelectorAll('.interest-period-option').forEach((btn) => {
    btn.addEventListener('click', () => setInterestPeriod(btn.dataset.period));
  });

  function openInterestModal(accountId) {
    interestForm.reset();
    const account = DB.getAccount(accountId);
    document.getElementById('interest-account-id').value = accountId;
    document.getElementById('interest-account-summary').textContent =
      `${account.name} · Saldo attuale: ${fmt(DB.getAccountBalance(accountId))} · Tasso: ${account.interestRate}% annuo`;
    document.getElementById('interest-date').value = todayISO();
    setInterestPeriod('annual');
    interestModal.classList.add('visible');
  }

  function closeInterestModal() {
    interestModal.classList.remove('visible');
  }

  interestModal.querySelector('.close-modal').addEventListener('click', closeInterestModal);
  interestModal.addEventListener('click', (e) => { if (e.target === interestModal) closeInterestModal(); });

  interestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const accountId = document.getElementById('interest-account-id').value;
    const amount = document.getElementById('interest-amount').value;
    const date = document.getElementById('interest-date').value;
    DB.addTransaction({
      accountId,
      type: 'income',
      scope: 'personal',
      amount,
      category: 'Interessi',
      date,
      note: currentInterestPeriod === 'daily' ? 'Interessi giornalieri accreditati' : 'Interessi annui accreditati',
    });
    showToast('Interessi accreditati.');
    closeInterestModal();
    refreshCurrentView();
  });

  // ---------- Budget View ----------
  function renderBudgetView() {
    const monthInput = document.getElementById('budget-month');
    if (!monthInput.value) monthInput.value = currentMonth();
    const month = monthInput.value;

    const spending = DB.getSpendingByCategory(month);
    const list = document.getElementById('budget-list');
    list.innerHTML = '';

    DB.CATEGORIES.personal.expense.forEach((cat) => {
      const limit = DB.getBudget(cat, month);
      const actual = spending[cat] || 0;
      const pct = limit > 0 ? Math.min(100, Math.round((actual / limit) * 100)) : 0;
      const over = limit > 0 && actual > limit;

      const row = document.createElement('div');
      row.className = 'budget-row';
      row.innerHTML = `
        <div class="budget-row-top">
          <span class="budget-category">${cat}</span>
          <span class="budget-numbers">${fmt(actual)} ${limit > 0 ? '/ ' + fmt(limit) : ''}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${over ? 'over' : ''}" style="width:${limit > 0 ? pct : 0}%"></div>
        </div>
        <input type="number" class="budget-input" min="0" step="1" placeholder="Imposta limite €" value="${limit > 0 ? limit : ''}" data-category="${cat}" />
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('.budget-input').forEach((input) => {
      input.addEventListener('change', () => {
        DB.setBudget(input.dataset.category, month, input.value);
        showToast('Budget aggiornato.');
        renderBudgetView();
      });
    });
  }

  document.getElementById('budget-month').addEventListener('change', renderBudgetView);

  // ---------- Profession View (gestione P.IVA) ----------
  let professionSelectedYear = null;

  function populateProfessionYearSelect() {
    const sel = document.getElementById('profession-year');
    const years = DB.getAvailableYears();
    if (!professionSelectedYear || !years.includes(professionSelectedYear)) {
      professionSelectedYear = years[0];
    }
    sel.innerHTML = years.map((y) => `<option value="${y}" ${y === professionSelectedYear ? 'selected' : ''}>${y}</option>`).join('');
  }

  function populateProfessionSettingsForm() {
    const settings = DB.getProfessionSettings();
    const coeffPreset = document.getElementById('profession-coefficient-preset');
    const coeffValue = document.getElementById('profession-coefficient-value');
    const presetMatch = Array.from(coeffPreset.options).some((o) => o.value !== 'custom' && Number(o.value) === settings.coefficient);
    coeffPreset.value = presetMatch ? String(settings.coefficient) : 'custom';
    coeffValue.value = settings.coefficient;

    document.getElementById('profession-tax-rate').value = String(settings.taxRate);

    const inpsPreset = document.getElementById('profession-inps-preset');
    const inpsValue = document.getElementById('profession-inps-value');
    const inpsPresetMatch = Array.from(inpsPreset.options).some((o) => o.value !== 'custom' && Number(o.value) === settings.inpsRate);
    inpsPreset.value = inpsPresetMatch ? String(settings.inpsRate) : 'custom';
    inpsValue.value = settings.inpsRate;
  }

  function saveProfessionSettings() {
    const coefficient = Number(document.getElementById('profession-coefficient-value').value) || 0;
    const taxRate = Number(document.getElementById('profession-tax-rate').value) || 5;
    const inpsRate = Number(document.getElementById('profession-inps-value').value) || 0;
    DB.setProfessionSettings({ coefficient, taxRate, inpsRate });
    renderProfessionStats();
  }

  document.getElementById('profession-coefficient-preset').addEventListener('change', (e) => {
    if (e.target.value !== 'custom') {
      document.getElementById('profession-coefficient-value').value = e.target.value;
    }
    saveProfessionSettings();
  });
  document.getElementById('profession-coefficient-value').addEventListener('change', saveProfessionSettings);
  document.getElementById('profession-tax-rate').addEventListener('change', saveProfessionSettings);
  document.getElementById('profession-inps-preset').addEventListener('change', (e) => {
    if (e.target.value !== 'custom') {
      document.getElementById('profession-inps-value').value = e.target.value;
    }
    saveProfessionSettings();
  });
  document.getElementById('profession-inps-value').addEventListener('change', saveProfessionSettings);

  document.getElementById('profession-year').addEventListener('change', (e) => {
    professionSelectedYear = e.target.value;
    renderProfessionStats();
  });

  function renderProfessionStats() {
    const year = professionSelectedYear;
    const estimate = DB.getProfessionTaxEstimate(year);

    document.getElementById('profession-revenue').textContent = fmt(estimate.revenue);
    const breakdownEl = document.getElementById('profession-revenue-breakdown');
    if (breakdownEl) {
      breakdownEl.textContent = estimate.exemptRevenue > 0
        ? `di cui ${fmt(estimate.exemptRevenue)} senza contributi (già versati da sostituto d'imposta)`
        : '';
    }
    document.getElementById('profession-expenses').textContent = fmt(estimate.expenses);
    document.getElementById('profession-taxable').textContent = fmt(estimate.taxableIncome);
    document.getElementById('profession-net').textContent = fmt(estimate.netEstimate);
    document.getElementById('profession-inps').textContent = fmt(estimate.inpsContributions);
    document.getElementById('profession-tax').textContent = fmt(estimate.substituteTax);
    document.getElementById('profession-total-due').textContent = fmt(estimate.totalDue);

    const fill = document.getElementById('profession-threshold-fill');
    fill.style.width = `${estimate.thresholdPct}%`;
    fill.classList.toggle('over', estimate.revenue > estimate.threshold);
    document.getElementById('profession-threshold-label').textContent =
      `${fmt(estimate.revenue)} / ${fmt(estimate.threshold)} (${estimate.thresholdPct}%)` +
      (estimate.revenue > estimate.threshold ? ' — soglia superata, verifica i requisiti del regime forfettario' : '');

    const txs = DB.getTransactionsForYear(year, 'professional').sort((a, b) => (a.date < b.date ? 1 : -1));
    renderTransactionList('profession-transactions-list', txs);
    document.getElementById('profession-transactions-empty').style.display = txs.length === 0 ? 'block' : 'none';
  }

  function renderProfessionView() {
    populateProfessionYearSelect();
    populateProfessionSettingsForm();
    renderProfessionStats();
  }

  document.getElementById('add-profession-transaction-btn').addEventListener('click', () => openTransactionModal(null, 'professional'));

  // ---------- Investments View ----------
  let priceCache = {}; // key: `${assetType}:${symbol}` -> { price, changePct, name }
  let lastPriceUpdate = null;
  let investmentsAutoFetched = false;

  function cacheKey(assetType, symbol) {
    return `${assetType}:${symbol}`;
  }

  function populateCryptoSelect() {
    const sel = document.getElementById('investment-crypto-select');
    sel.innerHTML = InvestAPI.COMMON_COINS.map((c) => `<option value="${c.id}">${c.label}</option>`).join('') +
      '<option value="custom">Personalizzato…</option>';
  }

  document.getElementById('investment-crypto-select').addEventListener('change', (e) => {
    const customField = document.getElementById('crypto-custom-field');
    customField.style.display = e.target.value === 'custom' ? 'block' : 'none';
    if (e.target.value !== 'custom') {
      const coin = InvestAPI.COMMON_COINS.find((c) => c.id === e.target.value);
      const nameField = document.getElementById('investment-name');
      if (coin && !nameField.dataset.userEdited) nameField.value = coin.label;
    }
  });

  document.getElementById('investment-name').addEventListener('input', (e) => {
    e.target.dataset.userEdited = 'true';
  });

  function setAssetType(type) {
    document.querySelectorAll('.asset-option').forEach((btn) => btn.classList.toggle('active', btn.dataset.assetType === type));
    document.getElementById('crypto-fields').style.display = type === 'crypto' ? 'block' : 'none';
    document.getElementById('stock-fields').style.display = type === 'stock' ? 'block' : 'none';
  }

  document.querySelectorAll('.asset-option').forEach((btn) => {
    btn.addEventListener('click', () => setAssetType(btn.dataset.assetType));
  });

  const investModal = document.getElementById('investment-modal');
  const investForm = document.getElementById('investment-form');

  function openInvestmentModal(id) {
    investForm.reset();
    populateCryptoSelect();
    document.getElementById('crypto-custom-field').style.display = 'none';
    document.getElementById('investment-name').dataset.userEdited = '';

    if (id) {
      const inv = DB.getInvestment(id);
      document.getElementById('investment-modal-title').textContent = 'Modifica titolo';
      document.getElementById('investment-id').value = inv.id;
      setAssetType(inv.assetType);
      if (inv.assetType === 'crypto') {
        const known = InvestAPI.COMMON_COINS.some((c) => c.id === inv.symbol);
        document.getElementById('investment-crypto-select').value = known ? inv.symbol : 'custom';
        if (!known) {
          document.getElementById('crypto-custom-field').style.display = 'block';
          document.getElementById('investment-crypto-custom').value = inv.symbol;
        }
      } else {
        document.getElementById('investment-stock-symbol').value = inv.symbol;
      }
      document.getElementById('investment-name').value = inv.name;
      document.getElementById('investment-name').dataset.userEdited = 'true';
      document.getElementById('investment-quantity').value = inv.quantity;
      document.getElementById('investment-avg-cost').value = inv.avgCost;
      document.getElementById('delete-investment-btn').style.display = 'inline-block';
    } else {
      document.getElementById('investment-modal-title').textContent = 'Nuovo titolo';
      document.getElementById('investment-id').value = '';
      setAssetType('crypto');
      document.getElementById('investment-name').value = InvestAPI.COMMON_COINS[0].label;
      document.getElementById('delete-investment-btn').style.display = 'none';
    }
    investModal.classList.add('visible');
  }

  function closeInvestmentModal() {
    investModal.classList.remove('visible');
  }

  document.getElementById('add-investment-btn').addEventListener('click', () => openInvestmentModal());
  investModal.querySelector('.close-modal').addEventListener('click', closeInvestmentModal);
  investModal.addEventListener('click', (e) => { if (e.target === investModal) closeInvestmentModal(); });

  investForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('investment-id').value;
    const assetType = document.querySelector('.asset-option.active').dataset.assetType;
    let symbol;
    if (assetType === 'crypto') {
      const sel = document.getElementById('investment-crypto-select').value;
      symbol = sel === 'custom' ? document.getElementById('investment-crypto-custom').value.trim().toLowerCase() : sel;
    } else {
      symbol = document.getElementById('investment-stock-symbol').value.trim().toUpperCase();
    }
    if (!symbol) {
      showToast('Inserisci un simbolo valido.');
      return;
    }
    const payload = {
      assetType,
      symbol,
      name: document.getElementById('investment-name').value.trim() || symbol,
      quantity: document.getElementById('investment-quantity').value,
      avgCost: document.getElementById('investment-avg-cost').value,
    };
    if (id) {
      DB.updateInvestment(id, payload);
      showToast('Titolo aggiornato.');
    } else {
      DB.addInvestment(payload);
      showToast('Titolo aggiunto.');
    }
    closeInvestmentModal();
    refreshCurrentView();
    refreshPrices();
  });

  document.getElementById('delete-investment-btn').addEventListener('click', () => {
    const id = document.getElementById('investment-id').value;
    if (id && confirm('Eliminare questo titolo dal portafoglio?')) {
      DB.deleteInvestment(id);
      showToast('Titolo eliminato.');
      closeInvestmentModal();
      refreshCurrentView();
    }
  });

  function formatQuantity(q) {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 8 }).format(q);
  }

  function renderInvestmentsTable() {
    const investments = DB.getInvestments();
    const container = document.getElementById('investments-table');
    const emptyHint = document.getElementById('investments-empty');

    if (investments.length === 0) {
      container.innerHTML = '';
      emptyHint.style.display = 'block';
      Charts.renderAllocationChart('chart-allocation', 'chart-allocation-empty', [], []);
      updateInvestmentSummary(0, 0);
      return;
    }
    emptyHint.style.display = 'none';

    let totalValue = 0;
    let totalCost = 0;
    const allocLabels = [];
    const allocData = [];

    const rows = investments.map((inv) => {
      const key = cacheKey(inv.assetType, inv.symbol);
      const live = priceCache[key];
      const costBasis = inv.quantity * inv.avgCost;
      totalCost += costBasis;

      let priceCell = '—';
      let changeCell = '—';
      let valueCell = '—';
      let gainCell = '—';

      if (live && typeof live.price === 'number' && !Number.isNaN(live.price)) {
        const marketValue = inv.quantity * live.price;
        const gain = marketValue - costBasis;
        const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
        totalValue += marketValue;
        allocLabels.push(inv.name);
        allocData.push(marketValue);

        priceCell = fmt(live.price);
        const changePct = live.changePct;
        changeCell = typeof changePct === 'number' && !Number.isNaN(changePct)
          ? `<span class="${changePct >= 0 ? 'positive' : 'negative'}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</span>`
          : '—';
        valueCell = fmt(marketValue);
        gainCell = `<span class="${gain >= 0 ? 'positive' : 'negative'}">${gain >= 0 ? '+' : ''}${fmt(gain)} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%)</span>`;
      } else {
        totalValue += costBasis;
      }

      return `
        <tr>
          <td>
            <span class="inv-asset-badge ${inv.assetType}">${inv.assetType === 'crypto' ? '🪙' : '📈'}</span>
            <strong>${escapeHtml(inv.name)}</strong>
            <span class="inv-symbol">${escapeHtml(inv.symbol)}</span>
          </td>
          <td>${formatQuantity(inv.quantity)}</td>
          <td>${fmt(inv.avgCost)}</td>
          <td>${priceCell}</td>
          <td>${changeCell}</td>
          <td>${valueCell}</td>
          <td>${gainCell}</td>
          <td class="inv-actions">
            <button type="button" class="icon-btn edit-investment" data-id="${inv.id}" title="Modifica">✏️</button>
            <button type="button" class="icon-btn delete-investment-row" data-id="${inv.id}" title="Elimina">🗑️</button>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
      <table class="inv-table">
        <thead>
          <tr>
            <th>Titolo</th><th>Quantità</th><th>Prezzo medio</th><th>Prezzo attuale</th>
            <th>Variazione</th><th>Valore</th><th>Guadagno/Perdita</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    container.querySelectorAll('.edit-investment').forEach((btn) => {
      btn.addEventListener('click', () => openInvestmentModal(btn.dataset.id));
    });
    container.querySelectorAll('.delete-investment-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Eliminare questo titolo dal portafoglio?')) {
          DB.deleteInvestment(btn.dataset.id);
          showToast('Titolo eliminato.');
          renderInvestmentsTable();
        }
      });
    });

    Charts.renderAllocationChart('chart-allocation', 'chart-allocation-empty', allocLabels, allocData);
    updateInvestmentSummary(totalValue, totalCost);
  }

  function updateInvestmentSummary(totalValue, totalCost) {
    document.getElementById('invest-total-value').textContent = fmt(totalValue);
    document.getElementById('invest-total-cost').textContent = fmt(totalCost);
    const gain = totalValue - totalCost;
    const gainPct = totalCost > 0 ? (gain / totalCost) * 100 : 0;
    const gainEl = document.getElementById('invest-total-gain');
    const gainPctEl = document.getElementById('invest-total-gain-pct');
    gainEl.textContent = `${gain >= 0 ? '+' : ''}${fmt(gain)}`;
    gainPctEl.textContent = `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%`;
    gainEl.parentElement.classList.toggle('income', gain >= 0);
    gainEl.parentElement.classList.toggle('expense', gain < 0);
    gainPctEl.parentElement.classList.toggle('income', gain >= 0);
    gainPctEl.parentElement.classList.toggle('expense', gain < 0);
  }

  async function refreshPrices() {
    const investments = DB.getInvestments();
    const cryptoIds = investments.filter((i) => i.assetType === 'crypto').map((i) => i.symbol);
    const stockSymbols = investments.filter((i) => i.assetType === 'stock').map((i) => i.symbol);
    const apiKey = DB.getApiSettings().twelveDataKey;

    const btn = document.getElementById('refresh-prices-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🔄 Aggiornamento…'; }

    const results = await Promise.allSettled([
      InvestAPI.fetchCryptoPrices(cryptoIds),
      InvestAPI.fetchStockQuotes(stockSymbols, apiKey),
    ]);

    const [cryptoResult, stockResult] = results;
    if (cryptoResult.status === 'fulfilled') {
      Object.entries(cryptoResult.value).forEach(([id, data]) => {
        priceCache[cacheKey('crypto', id)] = data;
      });
    } else if (cryptoIds.length > 0) {
      showToast('Errore nel recupero prezzi crypto.');
    }

    if (stockResult.status === 'fulfilled') {
      Object.entries(stockResult.value).forEach(([sym, data]) => {
        priceCache[cacheKey('stock', sym)] = data;
      });
    } else if (stockSymbols.length > 0) {
      showToast(stockResult.reason?.message || 'Errore nel recupero quotazioni azioni.');
    }

    lastPriceUpdate = new Date();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Aggiorna prezzi'; }
    updateLastUpdateLabel();
    renderInvestmentsTable();
  }

  function updateLastUpdateLabel() {
    const label = document.getElementById('investments-last-update');
    if (!label) return;
    label.textContent = lastPriceUpdate
      ? `Ultimo aggiornamento: ${lastPriceUpdate.toLocaleTimeString('it-IT')}`
      : '';
  }

  document.getElementById('refresh-prices-btn').addEventListener('click', () => refreshPrices());

  document.getElementById('twelvedata-key').addEventListener('change', (e) => {
    DB.setApiSettings({ twelveDataKey: e.target.value.trim() });
    showToast('Chiave API salvata.');
  });

  function renderInvestmentsView() {
    document.getElementById('twelvedata-key').value = DB.getApiSettings().twelveDataKey;
    updateLastUpdateLabel();
    renderInvestmentsTable();
    if (!investmentsAutoFetched && DB.getInvestments().length > 0) {
      investmentsAutoFetched = true;
      refreshPrices();
    }
  }

  // ---------- Recurring Transactions View ----------
  const recurringModal = document.getElementById('recurring-modal');
  const recurringForm = document.getElementById('recurring-form');
  let currentRecurringType = 'expense';
  let currentRecurringScope = 'personal';

  function setRecurringType(type, selectedCategory) {
    currentRecurringType = type;
    document.querySelectorAll('.recurring-type-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    populateCategorySelect(document.getElementById('recurring-category'), currentRecurringScope, type, selectedCategory);
  }

  function setRecurringScope(scope, selectedCategory) {
    currentRecurringScope = scope;
    document.querySelectorAll('.recurring-scope-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.scope === scope);
    });
    populateCategorySelect(document.getElementById('recurring-category'), scope, currentRecurringType, selectedCategory);
  }

  document.querySelectorAll('.recurring-type-option').forEach((btn) => {
    btn.addEventListener('click', () => setRecurringType(btn.dataset.type));
  });
  document.querySelectorAll('.recurring-scope-option').forEach((btn) => {
    btn.addEventListener('click', () => setRecurringScope(btn.dataset.scope));
  });

  function openRecurringModal(id) {
    recurringForm.reset();
    const accounts = DB.getAccounts();
    if (accounts.length === 0) {
      showToast('Crea prima almeno un conto.');
      return;
    }
    populateAccountSelect(document.getElementById('recurring-account'), accounts[0].id);

    if (id) {
      const r = DB.getRecurringTransaction(id);
      document.getElementById('recurring-modal-title').textContent = 'Modifica ricorrenza';
      document.getElementById('recurring-id').value = r.id;
      document.getElementById('recurring-name').value = r.name;
      populateAccountSelect(document.getElementById('recurring-account'), r.accountId);
      setRecurringScope(r.scope || 'personal', r.category);
      setRecurringType(r.type, r.category);
      document.getElementById('recurring-amount').value = r.amount;
      document.getElementById('recurring-frequency').value = r.frequency;
      document.getElementById('recurring-next-date').value = r.nextDueDate;
      document.getElementById('recurring-active').checked = r.active;
      document.getElementById('delete-recurring-btn').style.display = 'inline-block';
    } else {
      document.getElementById('recurring-modal-title').textContent = 'Nuova ricorrenza';
      document.getElementById('recurring-id').value = '';
      setRecurringScope('personal');
      setRecurringType('expense');
      document.getElementById('recurring-frequency').value = 'monthly';
      document.getElementById('recurring-next-date').value = todayISO();
      document.getElementById('recurring-active').checked = true;
      document.getElementById('delete-recurring-btn').style.display = 'none';
    }
    recurringModal.classList.add('visible');
  }

  function closeRecurringModal() {
    recurringModal.classList.remove('visible');
  }

  document.getElementById('add-recurring-btn').addEventListener('click', () => openRecurringModal());
  recurringModal.querySelector('.close-modal').addEventListener('click', closeRecurringModal);
  recurringModal.addEventListener('click', (e) => { if (e.target === recurringModal) closeRecurringModal(); });

  recurringForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('recurring-id').value;
    const payload = {
      name: document.getElementById('recurring-name').value.trim(),
      type: currentRecurringType,
      scope: currentRecurringScope,
      category: document.getElementById('recurring-category').value,
      amount: document.getElementById('recurring-amount').value,
      accountId: document.getElementById('recurring-account').value,
      frequency: document.getElementById('recurring-frequency').value,
      nextDueDate: document.getElementById('recurring-next-date').value,
      active: document.getElementById('recurring-active').checked,
    };
    if (!payload.name) return;
    if (id) {
      DB.updateRecurringTransaction(id, payload);
      showToast('Ricorrenza aggiornata.');
    } else {
      DB.addRecurringTransaction(payload);
      showToast('Ricorrenza creata.');
    }
    closeRecurringModal();
    const generated = DB.processDueRecurring();
    if (generated > 0) showToast(`${generated} transazione/i generata/e automaticamente.`);
    refreshCurrentView();
  });

  document.getElementById('delete-recurring-btn').addEventListener('click', () => {
    const id = document.getElementById('recurring-id').value;
    if (id && confirm('Eliminare questa ricorrenza? Le transazioni già generate non verranno rimosse.')) {
      DB.deleteRecurringTransaction(id);
      showToast('Ricorrenza eliminata.');
      closeRecurringModal();
      refreshCurrentView();
    }
  });

  const FREQUENCY_LABEL = { monthly: 'Mensile', yearly: 'Annuale' };

  function renderRecurringView() {
    const rules = DB.getRecurringTransactions();
    const container = document.getElementById('recurring-list');
    const emptyHint = document.getElementById('recurring-empty');
    container.innerHTML = '';

    if (rules.length === 0) {
      emptyHint.style.display = 'block';
      return;
    }
    emptyHint.style.display = 'none';

    rules.forEach((r) => {
      const account = DB.getAccount(r.accountId);
      const row = document.createElement('div');
      row.className = 'recurring-row' + (r.active ? '' : ' inactive');
      row.innerHTML = `
        <div class="tx-icon ${r.type}">${r.type === 'income' ? '↑' : '↓'}</div>
        <div class="tx-main">
          <span class="tx-category">${escapeHtml(r.name)} <span class="tx-badge recurring-freq-badge">${FREQUENCY_LABEL[r.frequency]}</span>${r.scope === 'professional' ? ' <span class="tx-badge">💼 Professionale</span>' : ''}${!r.active ? ' <span class="tx-badge recurring-paused-badge">In pausa</span>' : ''}</span>
          <span class="tx-sub">${escapeHtml(r.category)} · ${escapeHtml(account ? account.name : 'Conto eliminato')} · Prossima: ${formatDate(r.nextDueDate)}</span>
        </div>
        <div class="tx-amount ${r.type}">${r.type === 'income' ? '+' : '-'}${fmt(r.amount)}</div>
        <div class="recurring-actions">
          <button type="button" class="icon-btn toggle-recurring" data-id="${r.id}" title="${r.active ? 'Metti in pausa' : 'Riattiva'}">${r.active ? '⏸️' : '▶️'}</button>
          <button type="button" class="icon-btn edit-recurring" data-id="${r.id}" title="Modifica">✏️</button>
        </div>
      `;
      container.appendChild(row);
    });

    container.querySelectorAll('.edit-recurring').forEach((btn) => {
      btn.addEventListener('click', () => openRecurringModal(btn.dataset.id));
    });
    container.querySelectorAll('.toggle-recurring').forEach((btn) => {
      btn.addEventListener('click', () => {
        DB.toggleRecurringActive(btn.dataset.id);
        renderRecurringView();
      });
    });
  }

  // ---------- Bank (Open Banking) View ----------
  let bankInstitutionsCache = [];

  function getBankSyncUrl() {
    return (DB.getApiSettings().bankSyncUrl || 'http://localhost:5190').replace(/\/$/, '');
  }

  document.getElementById('bank-sync-url').addEventListener('change', (e) => {
    DB.setApiSettings({ bankSyncUrl: e.target.value.trim() || 'http://localhost:5190' });
    renderBankView();
  });

  async function checkBankStatus() {
    const statusLabel = document.getElementById('bank-status-label');
    const institutionsCard = document.getElementById('bank-institutions-card');
    const connectionsCard = document.getElementById('bank-connections-card');
    try {
      const res = await fetch(`${getBankSyncUrl()}/api/status`);
      if (!res.ok) throw new Error('Risposta non valida dal backend.');
      const data = await res.json();
      if (!data.configured) {
        statusLabel.textContent = `⚠️ Backend raggiunto ma non configurato. ${data.hint || ''}`;
        institutionsCard.style.display = 'none';
        connectionsCard.style.display = 'block';
        return false;
      }
      statusLabel.textContent = '✅ Backend connesso e configurato correttamente.';
      institutionsCard.style.display = 'block';
      connectionsCard.style.display = 'block';
      return true;
    } catch (err) {
      statusLabel.textContent = `❌ Impossibile raggiungere il backend su ${getBankSyncUrl()}. Avvia BankSync con "dotnet run" dalla cartella BankSync, poi riprova.`;
      institutionsCard.style.display = 'none';
      connectionsCard.style.display = 'none';
      return false;
    }
  }

  async function loadInstitutions() {
    try {
      const res = await fetch(`${getBankSyncUrl()}/api/institutions?country=IT`);
      if (!res.ok) throw new Error('Errore nel recupero elenco banche.');
      bankInstitutionsCache = await res.json();
      renderInstitutionsList('');
    } catch (err) {
      showToast('Errore nel recupero elenco banche.');
    }
  }

  function renderInstitutionsList(filterText) {
    const container = document.getElementById('bank-institutions-list');
    const filtered = bankInstitutionsCache
      .filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase()))
      .slice(0, 30);
    container.innerHTML = filtered.map((inst) => `
      <div class="tx-row">
        <div class="tx-main">
          <span class="tx-category">${escapeHtml(inst.name)}</span>
          <span class="tx-sub">${escapeHtml(inst.bic || '')}</span>
        </div>
        <button type="button" class="ghost-btn connect-institution-btn" data-id="${inst.id}" data-name="${escapeHtml(inst.name)}">Collega</button>
      </div>
    `).join('');
    container.querySelectorAll('.connect-institution-btn').forEach((btn) => {
      btn.addEventListener('click', () => connectInstitution(btn.dataset.id, btn.dataset.name));
    });
  }

  document.getElementById('bank-institution-search').addEventListener('input', (e) => {
    renderInstitutionsList(e.target.value);
  });

  async function connectInstitution(institutionId, institutionName) {
    try {
      const res = await fetch(`${getBankSyncUrl()}/api/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionId, institutionName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Errore nella creazione del collegamento.');
      }
      const data = await res.json();
      window.open(data.link, '_blank');
      showToast("Completa l'accesso nella nuova scheda, poi torna qui e aggiorna lo stato.");
      renderConnectionsList();
    } catch (err) {
      showToast(err.message || 'Errore nel collegamento.');
    }
  }

  function renderConnectionRow(c) {
    const statusLabel = c.status === 'linked' ? '✅ Collegato' : c.status === 'pending' ? '⏳ In attesa' : `⚠️ ${c.status}`;
    const accountsHtml = (c.accountIds || []).map((bankAccId) => {
      const localAccount = DB.getAccounts().find((a) => a.bankAccountId === bankAccId);
      if (localAccount) {
        return `
          <div class="recurring-row">
            <div class="tx-main">
              <span class="tx-category">${escapeHtml(localAccount.name)}</span>
              <span class="tx-sub">Collegato a ${escapeHtml(c.institutionName)}</span>
            </div>
            <div class="recurring-actions">
              <button type="button" class="ghost-btn sync-bank-account-btn" data-local-id="${localAccount.id}" data-bank-id="${bankAccId}">Sincronizza</button>
              <button type="button" class="icon-btn unlink-bank-account-btn" data-local-id="${localAccount.id}" title="Scollega">🗑️</button>
            </div>
          </div>`;
      }
      const options = DB.getAccounts().filter((a) => !a.bankAccountId)
        .map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
      return `
        <div class="recurring-row">
          <div class="tx-main">
            <span class="tx-category">Conto bancario non associato</span>
            <span class="tx-sub">ID: ${escapeHtml(bankAccId.slice(0, 10))}…</span>
          </div>
          <div class="recurring-actions">
            <select class="map-account-select" data-bank-id="${bankAccId}">
              <option value="">Associa a conto locale…</option>
              ${options}
            </select>
            <button type="button" class="ghost-btn map-account-btn" data-bank-id="${bankAccId}" data-institution="${escapeHtml(c.institutionName)}">Collega</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="section-header">
          <h3>${escapeHtml(c.institutionName)} <span class="tx-badge">${statusLabel}</span></h3>
          <button type="button" class="icon-btn remove-connection-btn" data-id="${c.requisitionId}" title="Rimuovi collegamento">🗑️</button>
        </div>
        ${accountsHtml || '<p class="empty-hint" style="display:block;">Nessun conto trovato per questo collegamento. Prova ad aggiornare lo stato.</p>'}
      </div>`;
  }

  function wireConnectionRowEvents() {
    document.querySelectorAll('.map-account-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const select = document.querySelector(`.map-account-select[data-bank-id="${btn.dataset.bankId}"]`);
        const localId = select ? select.value : '';
        if (!localId) { showToast('Seleziona un conto locale.'); return; }
        DB.linkAccountToBank(localId, btn.dataset.bankId, btn.dataset.institution);
        showToast('Conto collegato.');
        renderConnectionsList();
      });
    });
    document.querySelectorAll('.unlink-bank-account-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (confirm('Scollegare questo conto dalla banca? Le transazioni già importate restano.')) {
          DB.unlinkAccountFromBank(btn.dataset.localId);
          renderConnectionsList();
        }
      });
    });
    document.querySelectorAll('.sync-bank-account-btn').forEach((btn) => {
      btn.addEventListener('click', () => syncBankAccount(btn.dataset.localId, btn.dataset.bankId, btn));
    });
    document.querySelectorAll('.remove-connection-btn').forEach((btn) => {
      btn.addEventListener('click', () => removeConnection(btn.dataset.id));
    });
  }

  async function syncBankAccount(localAccountId, bankAccountId, btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = 'Sincronizzo…';
    try {
      const res = await fetch(`${getBankSyncUrl()}/api/accounts/${bankAccountId}/transactions`);
      if (!res.ok) throw new Error('Errore nel recupero movimenti.');
      const transactions = await res.json();
      const imported = DB.importBankTransactions(localAccountId, transactions);
      showToast(imported > 0 ? `${imported} nuove transazioni importate.` : 'Nessuna nuova transazione da importare.');
      refreshCurrentView();
    } catch (err) {
      showToast(err.message || 'Errore durante la sincronizzazione.');
    } finally {
      btnEl.disabled = false;
      btnEl.textContent = 'Sincronizza';
    }
  }

  async function removeConnection(id) {
    if (!confirm('Rimuovere questo collegamento bancario?')) return;
    try {
      await fetch(`${getBankSyncUrl()}/api/connections/${id}`, { method: 'DELETE' });
      showToast('Collegamento rimosso.');
      renderConnectionsList();
    } catch (err) {
      showToast('Errore nella rimozione.');
    }
  }

  async function renderConnectionsList() {
    const container = document.getElementById('bank-connections-list');
    const emptyHint = document.getElementById('bank-connections-empty');
    try {
      const res = await fetch(`${getBankSyncUrl()}/api/connections`);
      if (!res.ok) throw new Error();
      const connections = await res.json();
      if (connections.length === 0) {
        container.innerHTML = '';
        emptyHint.textContent = 'Nessuna banca collegata.';
        emptyHint.style.display = 'block';
        return;
      }
      emptyHint.style.display = 'none';
      container.innerHTML = connections.map((c) => renderConnectionRow(c)).join('');
      wireConnectionRowEvents();
    } catch (err) {
      container.innerHTML = '';
      emptyHint.textContent = 'Impossibile caricare i collegamenti dal backend.';
      emptyHint.style.display = 'block';
    }
  }

  document.getElementById('refresh-connections-btn').addEventListener('click', renderConnectionsList);

  async function renderBankView() {
    document.getElementById('bank-sync-url').value = DB.getApiSettings().bankSyncUrl || 'http://localhost:5190';
    const ok = await checkBankStatus();
    if (ok) {
      if (bankInstitutionsCache.length === 0) await loadInstitutions();
      else renderInstitutionsList(document.getElementById('bank-institution-search').value);
      renderConnectionsList();
    }
  }

  // ---------- CSV Statement Import ----------
  const csvImportModal = document.getElementById('csv-import-modal');
  let rawFileRows = [];
  let csvHeaders = [];
  let csvParsedRows = [];
  let csvMappedTransactions = [];

  const HEADER_KEYWORDS = [
    'data', 'date', 'descrizione', 'causale', 'dettagli', 'description',
    'importo', 'amount', 'valore', 'avere', 'entrata', 'entrate', 'credit', 'accredito',
    'dare', 'uscita', 'uscite', 'debit', 'addebito',
  ];

  function detectHeaderRowIndex(rows) {
    let bestIdx = 0;
    let bestScore = 0;
    const limit = Math.min(rows.length, 25);
    for (let i = 0; i < limit; i++) {
      const cells = rows[i].map((c) => String(c).toLowerCase().trim());
      const score = cells.filter((c) => c && HEADER_KEYWORDS.some((kw) => c.includes(kw))).length;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestScore >= 2 ? bestIdx : 0;
  }

  function applyHeaderRow(headerIdx) {
    const idx = Math.max(0, Math.min(headerIdx, rawFileRows.length - 1));
    document.getElementById('csv-header-row').value = idx + 1;
    csvHeaders = (rawFileRows[idx] || []).map((h) => String(h));
    csvParsedRows = rawFileRows.slice(idx + 1);
    setupColumnMapping();
  }

  document.getElementById('csv-header-row').addEventListener('change', (e) => {
    applyHeaderRow(Number(e.target.value) - 1 || 0);
  });

  function openCsvImportModal() {
    const accounts = DB.getAccounts();
    if (accounts.length === 0) {
      showToast('Crea prima almeno un conto.');
      return;
    }
    document.getElementById('csv-import-step1').style.display = 'block';
    document.getElementById('csv-import-step2').style.display = 'none';
    document.getElementById('csv-import-file').value = '';
    document.getElementById('csv-sheet-select-field').style.display = 'none';
    populateAccountSelect(document.getElementById('csv-import-account'), accounts[0].id);
    csvImportModal.classList.add('visible');
  }

  function closeCsvImportModal() {
    csvImportModal.classList.remove('visible');
  }

  document.getElementById('import-csv-btn').addEventListener('click', openCsvImportModal);
  csvImportModal.querySelector('.close-modal').addEventListener('click', closeCsvImportModal);
  csvImportModal.addEventListener('click', (e) => { if (e.target === csvImportModal) closeCsvImportModal(); });

  function detectDelimiter(text) {
    // Conta i delimitatori su più righe (non solo la prima, che in molti estratti
    // conto è un titolo senza separatori) per una rilevazione più affidabile.
    const lines = text.split('\n').slice(0, 30);
    let commaCount = 0, semiCount = 0, tabCount = 0;
    lines.forEach((line) => {
      commaCount += (line.match(/,/g) || []).length;
      semiCount += (line.match(/;/g) || []).length;
      tabCount += (line.match(/\t/g) || []).length;
    });
    if (tabCount >= commaCount && tabCount >= semiCount && tabCount > 0) return '\t';
    return semiCount > commaCount ? ';' : ',';
  }

  function parseCSVText(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else if (c === '\r') {
        // ignora
      } else {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  }

  function guessColumnIndex(headers, keywords) {
    const lower = headers.map((h) => h.toLowerCase());
    for (const kw of keywords) {
      const idx = lower.findIndex((h) => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function parseItalianAmount(str) {
    if (str === undefined || str === null) return NaN;
    let s = String(str).trim().replace(/[€\s]/g, '');
    if (s === '') return NaN;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    return parseFloat(s);
  }

  function parseFlexibleDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (!value) return null;
    const s = String(value).trim();
    let m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    m2 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
    if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    return null;
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return 'csv' + Math.abs(hash).toString(36);
  }

  let currentWorkbook = null;

  function showImportStep2() {
    document.getElementById('csv-import-step1').style.display = 'none';
    document.getElementById('csv-import-step2').style.display = 'block';
  }

  function loadSheetRows(sheetName) {
    const sheet = currentWorkbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
      .filter((row) => row.some((cell) => String(cell).trim() !== ''));
    if (rows.length < 2) { showToast('Il foglio selezionato è vuoto o non valido.'); return; }
    rawFileRows = rows;
    applyHeaderRow(detectHeaderRowIndex(rows));
  }

  function loadWorkbook(workbook) {
    currentWorkbook = workbook;
    const sheetNames = workbook.SheetNames;
    const sheetField = document.getElementById('csv-sheet-select-field');
    const sheetSelect = document.getElementById('csv-sheet-select');
    if (sheetNames.length > 1) {
      sheetSelect.innerHTML = sheetNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
      sheetField.style.display = 'block';
    } else {
      sheetField.style.display = 'none';
    }
    loadSheetRows(sheetNames[0]);
    showImportStep2();
  }

  document.getElementById('csv-sheet-select').addEventListener('change', (e) => loadSheetRows(e.target.value));

  document.getElementById('csv-import-analyze-btn').addEventListener('click', () => {
    const file = document.getElementById('csv-import-file').files[0];
    if (!file) { showToast('Seleziona un file.'); return; }
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const workbook = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          loadWorkbook(workbook);
        } catch (err) {
          showToast('Errore nella lettura del file Excel.');
        }
      };
      reader.onerror = () => showToast('Errore nella lettura del file.');
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const rows = parseCSVText(String(reader.result));
        if (rows.length < 2) { showToast('File vuoto o non valido.'); return; }
        rawFileRows = rows;
        applyHeaderRow(detectHeaderRowIndex(rows));
        showImportStep2();
      };
      reader.onerror = () => showToast('Errore nella lettura del file.');
      reader.readAsText(file, 'UTF-8');
    }
  });

  function toggleAmountColumns(useTwoColumns) {
    document.getElementById('csv-col-amount-field').style.display = useTwoColumns ? 'none' : 'block';
    document.getElementById('csv-col-credit-field').style.display = useTwoColumns ? 'block' : 'none';
    document.getElementById('csv-col-debit-field').style.display = useTwoColumns ? 'block' : 'none';
  }

  function setupColumnMapping() {
    const options = csvHeaders.map((h, i) => `<option value="${i}">${escapeHtml(h || `Colonna ${i + 1}`)}</option>`).join('');
    ['csv-col-date', 'csv-col-desc', 'csv-col-amount', 'csv-col-credit', 'csv-col-debit'].forEach((id) => {
      document.getElementById(id).innerHTML = options;
    });

    const dateIdx = guessColumnIndex(csvHeaders, ['data valuta', 'data contabile', 'data', 'date']);
    const descIdx = guessColumnIndex(csvHeaders, ['descrizione', 'causale', 'dettagli', 'description', 'note']);
    const amountIdx = guessColumnIndex(csvHeaders, ['importo', 'amount', 'valore']);
    const creditIdx = guessColumnIndex(csvHeaders, ['avere', 'entrata', 'entrate', 'credit', 'accredito']);
    const debitIdx = guessColumnIndex(csvHeaders, ['dare', 'uscita', 'uscite', 'debit', 'addebito']);

    if (dateIdx >= 0) document.getElementById('csv-col-date').value = dateIdx;
    if (descIdx >= 0) document.getElementById('csv-col-desc').value = descIdx;

    const useTwoColumns = amountIdx === -1 && creditIdx >= 0 && debitIdx >= 0;
    document.getElementById('csv-two-columns').checked = useTwoColumns;
    toggleAmountColumns(useTwoColumns);
    if (amountIdx >= 0) document.getElementById('csv-col-amount').value = amountIdx;
    if (creditIdx >= 0) document.getElementById('csv-col-credit').value = creditIdx;
    if (debitIdx >= 0) document.getElementById('csv-col-debit').value = debitIdx;

    updateCsvPreview();
  }

  document.getElementById('csv-two-columns').addEventListener('change', (e) => {
    toggleAmountColumns(e.target.checked);
    updateCsvPreview();
  });
  ['csv-col-date', 'csv-col-desc', 'csv-col-amount', 'csv-col-credit', 'csv-col-debit'].forEach((id) => {
    document.getElementById(id).addEventListener('change', updateCsvPreview);
  });

  function buildMappedTransactions() {
    const dateIdx = Number(document.getElementById('csv-col-date').value);
    const descIdx = Number(document.getElementById('csv-col-desc').value);
    const useTwoColumns = document.getElementById('csv-two-columns').checked;
    const amountIdx = Number(document.getElementById('csv-col-amount').value);
    const creditIdx = Number(document.getElementById('csv-col-credit').value);
    const debitIdx = Number(document.getElementById('csv-col-debit').value);

    return csvParsedRows.map((row, i) => {
      const date = parseFlexibleDate(row[dateIdx]);
      const description = String(row[descIdx] !== undefined ? row[descIdx] : '').trim();
      let amount;
      if (useTwoColumns) {
        const credit = parseItalianAmount(row[creditIdx]);
        const debit = parseItalianAmount(row[debitIdx]);
        amount = !Number.isNaN(credit) && credit !== 0 ? credit : -(Number.isNaN(debit) ? 0 : Math.abs(debit));
      } else {
        amount = parseItalianAmount(row[amountIdx]);
      }
      const externalId = simpleHash(`${date}|${amount}|${description}|${i}`);
      return {
        date, description, amount,
        type: amount >= 0 ? 'income' : 'expense',
        externalId,
        valid: !!date && !Number.isNaN(amount) && amount !== 0,
      };
    });
  }

  function updateCsvPreview() {
    csvMappedTransactions = buildMappedTransactions();
    const valid = csvMappedTransactions.filter((t) => t.valid);
    const invalid = csvMappedTransactions.length - valid.length;
    const preview = valid.slice(0, 8);

    const container = document.getElementById('csv-preview-table');
    container.innerHTML = `
      <table class="inv-table">
        <thead><tr><th>Data</th><th>Descrizione</th><th>Importo</th></tr></thead>
        <tbody>
          ${preview.map((t) => `
            <tr>
              <td>${formatDate(t.date)}</td>
              <td>${escapeHtml(t.description)}</td>
              <td class="${t.type === 'income' ? 'positive' : 'negative'}">${t.type === 'income' ? '+' : '-'}${fmt(Math.abs(t.amount))}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    document.getElementById('csv-preview-summary').textContent =
      `${valid.length} transazioni valide su ${csvMappedTransactions.length} righe` +
      (invalid > 0 ? ` (${invalid} ignorate: data o importo non riconosciuti)` : '') +
      (preview.length < valid.length ? ` — anteprima delle prime ${preview.length}.` : '.');
  }

  document.getElementById('csv-import-back-btn').addEventListener('click', () => {
    document.getElementById('csv-import-step1').style.display = 'block';
    document.getElementById('csv-import-step2').style.display = 'none';
  });

  document.getElementById('csv-import-confirm-btn').addEventListener('click', () => {
    const accountId = document.getElementById('csv-import-account').value;
    const valid = csvMappedTransactions.filter((t) => t.valid);
    if (valid.length === 0) { showToast('Nessuna transazione valida da importare.'); return; }

    const imported = DB.importBankTransactions(accountId, valid.map((t) => ({
      externalId: t.externalId,
      date: t.date,
      description: t.description,
      type: t.type,
      amount: Math.abs(t.amount),
    })));

    showToast(imported > 0
      ? `${imported} transazioni importate.`
      : 'Nessuna nuova transazione (sembra già importato in precedenza).');
    closeCsvImportModal();
    refreshCurrentView();
  });

  // ---------- Sync (multi-dispositivo, Firebase) ----------
  let syncHookRegistered = false;

  function getSyncConfig() {
    return DB.getApiSettings().firebaseConfig || null;
  }

  function parseFirebaseConfigInput(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Incolla l'intero oggetto firebaseConfig (comprese le parentesi graffe).");
    let obj;
    try {
      // eslint-disable-next-line no-new-func
      obj = new Function(`return (${match[0]})`)();
    } catch (e) {
      obj = null;
    }
    if (!obj || !obj.apiKey || !obj.projectId) {
      throw new Error('Configurazione non valida: controlla di aver incollato tutto il blocco firebaseConfig.');
    }
    return obj;
  }

  function translateAuthError(err) {
    const map = {
      'auth/email-already-in-use': 'Email già registrata. Prova ad accedere invece di registrarti.',
      'auth/invalid-email': 'Email non valida.',
      'auth/weak-password': 'Password troppo debole (minimo 6 caratteri).',
      'auth/wrong-password': 'Password errata.',
      'auth/user-not-found': 'Nessun account trovato con questa email.',
      'auth/invalid-credential': 'Email o password errate.',
    };
    return (err && map[err.code]) || (err && err.message) || 'Errore di autenticazione.';
  }

  function renderSyncView() {
    const config = getSyncConfig();
    const configCard = document.getElementById('sync-config-card');
    const loginCard = document.getElementById('sync-login-card');
    const statusCard = document.getElementById('sync-status-card');

    if (!config) {
      configCard.style.display = 'block';
      loginCard.style.display = 'none';
      statusCard.style.display = 'none';
      return;
    }

    const user = Sync.isInitialized() ? Sync.getCurrentUser() : null;
    configCard.style.display = 'none';
    if (user) {
      loginCard.style.display = 'none';
      statusCard.style.display = 'block';
      document.getElementById('sync-user-email').textContent = user.email;
      const updatedAt = DB.getStateSnapshot().updatedAt;
      document.getElementById('sync-last-update').textContent = updatedAt
        ? `Ultimo salvataggio locale: ${new Date(updatedAt).toLocaleString('it-IT')}`
        : 'Nessun dato locale salvato ancora.';
    } else {
      loginCard.style.display = 'block';
      statusCard.style.display = 'none';
    }
  }

  async function handleRemoteState(remoteState, { announce } = {}) {
    const localUpdatedAt = DB.getStateSnapshot().updatedAt || 0;
    if ((remoteState.updatedAt || 0) > localUpdatedAt) {
      DB.replaceState(remoteState, { skipNotify: true });
      refreshCurrentView();
      if (announce) showToast('Dati sincronizzati da un altro dispositivo.');
    }
  }

  function initializeSync() {
    const config = getSyncConfig();
    if (!config) { renderSyncView(); return; }
    if (!Sync.isAvailable()) { renderSyncView(); return; }
    if (!Sync.isInitialized()) {
      try {
        Sync.init(config);
      } catch (err) {
        showToast(err.message);
        return;
      }
      Sync.onAuthChange(async (user) => {
        renderSyncView();
        if (user) {
          try {
            const remote = await Sync.pullState();
            if (remote) await handleRemoteState(remote, { announce: true });
            else await Sync.pushState(DB.getStateSnapshot());
          } catch (err) {
            console.error('Errore sincronizzazione iniziale:', err);
          }
          Sync.stopListening();
          Sync.listen((remoteState) => handleRemoteState(remoteState, { announce: true }));
          renderSyncView();
        } else {
          Sync.stopListening();
        }
      });
      if (!syncHookRegistered) {
        DB.onStateSaved((state) => Sync.schedulePush(state));
        syncHookRegistered = true;
      }
    }
    renderSyncView();
  }

  document.getElementById('sync-save-config-btn').addEventListener('click', () => {
    try {
      const config = parseFirebaseConfigInput(document.getElementById('sync-config-input').value);
      DB.setApiSettings({ firebaseConfig: config });
      initializeSync();
      showToast('Configurazione salvata.');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('sync-change-config-btn').addEventListener('click', () => {
    Sync.stopListening();
    DB.setApiSettings({ firebaseConfig: null });
    document.getElementById('sync-config-input').value = '';
    renderSyncView();
  });

  document.getElementById('sync-signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('sync-email').value.trim();
    const password = document.getElementById('sync-password').value;
    const errorEl = document.getElementById('sync-auth-error');
    errorEl.style.display = 'none';
    try {
      await Sync.signUp(email, password);
      showToast('Account creato e connesso.');
    } catch (err) {
      errorEl.textContent = translateAuthError(err);
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('sync-signin-btn').addEventListener('click', async () => {
    const email = document.getElementById('sync-email').value.trim();
    const password = document.getElementById('sync-password').value;
    const errorEl = document.getElementById('sync-auth-error');
    errorEl.style.display = 'none';
    try {
      await Sync.signIn(email, password);
      showToast('Accesso effettuato.');
    } catch (err) {
      errorEl.textContent = translateAuthError(err);
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('sync-signout-btn').addEventListener('click', async () => {
    await Sync.signOutUser();
    showToast('Disconnesso.');
    renderSyncView();
  });

  document.getElementById('sync-now-btn').addEventListener('click', async () => {
    try {
      await Sync.pushState(DB.getStateSnapshot());
      showToast('Sincronizzato.');
      renderSyncView();
    } catch (err) {
      showToast('Errore nella sincronizzazione.');
    }
  });

  // ---------- Export / Import ----------
  document.getElementById('export-btn').addEventListener('click', () => {
    const data = DB.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanza-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup esportato.');
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        DB.importData(reader.result);
        showToast('Dati importati con successo.');
        refreshCurrentView();
      } catch (err) {
        showToast('Errore: file non valido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ---------- Util ----------
  function refreshCurrentView() {
    const activeView = document.querySelector('.view.active').id.replace('view-', '');
    renderView(activeView);
  }

  // ---------- Init ----------
  const generatedOnLoad = DB.processDueRecurring();
  const interestGeneratedOnLoad = DB.processAccountInterest();
  const totalAutoGenerated = generatedOnLoad + interestGeneratedOnLoad;
  if (totalAutoGenerated > 0) {
    const parts = [];
    if (generatedOnLoad > 0) parts.push(`${generatedOnLoad} transazione/i ricorrente/i`);
    if (interestGeneratedOnLoad > 0) parts.push(`${interestGeneratedOnLoad} accredito/i interessi`);
    showToast(`Generati automaticamente: ${parts.join(' e ')}.`);
  }
  renderDashboard();
  initializeSync();
})();
