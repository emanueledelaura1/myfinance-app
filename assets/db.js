// Livello dati: persistenza su localStorage
const DB = (() => {
  const STORAGE_KEY = 'finanza.personale.v1';

  const CATEGORIES = {
    personal: {
      income: ['Stipendio', 'Bonus', 'Regalo', 'Investimenti', 'Interessi', 'Importato da banca', 'Altra entrata'],
      expense: ['Alimentari', 'Trasporti', 'Casa', 'Bollette', 'Abbonamenti', 'Salute', 'Svago', 'Shopping', 'Istruzione', 'Viaggi', 'Importato da banca', 'Altra uscita'],
    },
    professional: {
      income: ['Fatturato', 'Altro reddito professionale'],
      expense: ['Spese professionali', 'Attrezzature e software', 'Formazione', 'Consulenze', 'Altre spese professionali'],
    },
  };

  const PROFESSION_REVENUE_THRESHOLD = 85000; // soglia regime forfettario (indicativa)

  const DEFAULT_PROFESSION_SETTINGS = { coefficient: 78, taxRate: 5, inpsRate: 26.07 };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      accounts: [
        { id: uid(), name: 'Conto corrente', type: 'bank', initialBalance: 0, interestRate: 0, interestFrequency: 'none', nextInterestDate: null },
        { id: uid(), name: 'Contanti', type: 'cash', initialBalance: 0, interestRate: 0, interestFrequency: 'none', nextInterestDate: null },
      ],
      transactions: [],
      budgets: {}, // key: "categoria|YYYY-MM" -> limite numerico
      professionSettings: { ...DEFAULT_PROFESSION_SETTINGS },
      investments: [],
      apiSettings: { twelveDataKey: '', bankSyncUrl: 'http://localhost:5190', firebaseConfig: null },
      recurringTransactions: [],
      updatedAt: 0,
    };
  }

  function ensureDefaults(parsed) {
    if (!parsed.professionSettings) parsed.professionSettings = { ...DEFAULT_PROFESSION_SETTINGS };
    if (!parsed.investments) parsed.investments = [];
    if (!parsed.apiSettings) parsed.apiSettings = { twelveDataKey: '' };
    if (!parsed.apiSettings.bankSyncUrl) parsed.apiSettings.bankSyncUrl = 'http://localhost:5190';
    if (parsed.apiSettings.firebaseConfig === undefined) parsed.apiSettings.firebaseConfig = null;
    if (!parsed.recurringTransactions) parsed.recurringTransactions = [];
    if (typeof parsed.updatedAt !== 'number') parsed.updatedAt = 0;
    parsed.accounts.forEach((a) => {
      if (typeof a.interestRate !== 'number') a.interestRate = 0;
      if (!a.interestFrequency) a.interestFrequency = 'none';
      if (a.nextInterestDate === undefined) a.nextInterestDate = null;
      if (a.bankAccountId === undefined) a.bankAccountId = null;
      if (a.bankInstitutionName === undefined) a.bankInstitutionName = null;
    });
    return parsed;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.accounts || !parsed.transactions || !parsed.budgets) return defaultState();
      return ensureDefaults(parsed);
    } catch (e) {
      console.error('Errore nel caricamento dati, uso stato predefinito.', e);
      return defaultState();
    }
  }

  let state = load();
  let saveListeners = [];

  function onStateSaved(cb) {
    saveListeners.push(cb);
  }

  function save() {
    state.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveListeners.forEach((cb) => { try { cb(state); } catch (e) { console.error(e); } });
  }

  function getStateSnapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function replaceState(newState, options) {
    const opts = options || {};
    if (!newState || !newState.accounts || !newState.transactions || !newState.budgets) return false;
    state = ensureDefaults(JSON.parse(JSON.stringify(newState)));
    if (!opts.skipPersist) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!opts.skipNotify) saveListeners.forEach((cb) => { try { cb(state); } catch (e) { console.error(e); } });
    return true;
  }

  // ---- Accounts ----
  function getAccounts() {
    return state.accounts.slice();
  }

  function getAccount(id) {
    return state.accounts.find((a) => a.id === id);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // Aritmetica sulle date eseguita in UTC per evitare errori di un giorno
  // dovuti al fuso orario locale quando si usa toISOString().
  function addDaysToDateStr(dateStr, days, months, years) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y + (years || 0), m - 1 + (months || 0), d + (days || 0)));
    return date.toISOString().slice(0, 10);
  }

  function addInterestInterval(dateStr, frequency) {
    return frequency === 'daily' ? addDaysToDateStr(dateStr, 1) : addDaysToDateStr(dateStr, 0, 0, 1);
  }

  function addAccount({ name, type, initialBalance, interestRate, interestFrequency }) {
    const freq = interestFrequency || 'none';
    const account = {
      id: uid(),
      name,
      type,
      initialBalance: Number(initialBalance) || 0,
      interestRate: Number(interestRate) || 0,
      interestFrequency: freq,
      nextInterestDate: freq !== 'none' ? addInterestInterval(todayISO(), freq) : null,
    };
    state.accounts.push(account);
    save();
    return account;
  }

  function updateAccount(id, { name, type, initialBalance, interestRate, interestFrequency }) {
    const account = getAccount(id);
    if (!account) return null;
    account.name = name;
    account.type = type;
    account.initialBalance = Number(initialBalance) || 0;
    account.interestRate = Number(interestRate) || 0;
    const newFreq = interestFrequency || 'none';
    if (newFreq !== account.interestFrequency) {
      account.interestFrequency = newFreq;
      account.nextInterestDate = newFreq !== 'none' ? addInterestInterval(todayISO(), newFreq) : null;
    }
    save();
    return account;
  }

  function processAccountInterest() {
    const today = todayISO();
    let generatedCount = 0;

    state.accounts.forEach((account) => {
      if (!account.interestRate || account.interestRate <= 0) return;
      if (!account.interestFrequency || account.interestFrequency === 'none') return;
      if (!account.nextInterestDate) return;

      let guard = 0;
      while (account.nextInterestDate <= today && guard < 730) {
        const balance = getAccountBalance(account.id);
        const amount = account.interestFrequency === 'daily'
          ? balance * (account.interestRate / 100) / 365
          : balance * (account.interestRate / 100);
        if (amount > 0) {
          state.transactions.push({
            id: uid(),
            accountId: account.id,
            type: 'income',
            amount: Math.round(amount * 100) / 100,
            category: 'Interessi',
            date: account.nextInterestDate,
            note: account.interestFrequency === 'daily'
              ? 'Interessi giornalieri accreditati automaticamente'
              : 'Interessi annui accreditati automaticamente',
            scope: 'personal',
            createdAt: Date.now(),
          });
          generatedCount++;
        }
        account.nextInterestDate = addInterestInterval(account.nextInterestDate, account.interestFrequency);
        guard++;
      }
    });

    if (generatedCount > 0) save();
    return generatedCount;
  }

  function deleteAccount(id) {
    state.accounts = state.accounts.filter((a) => a.id !== id);
    state.transactions = state.transactions.filter((t) => t.accountId !== id);
    save();
  }

  function getAccountBalance(id) {
    const account = getAccount(id);
    if (!account) return 0;
    const sum = state.transactions
      .filter((t) => t.accountId === id)
      .reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);
    return account.initialBalance + sum;
  }

  function getTotalBalance() {
    return state.accounts.reduce((acc, a) => acc + getAccountBalance(a.id), 0);
  }

  // ---- Collegamento bancario (Open Banking) ----
  function linkAccountToBank(accountId, bankAccountId, institutionName) {
    const account = getAccount(accountId);
    if (!account) return null;
    account.bankAccountId = bankAccountId;
    account.bankInstitutionName = institutionName;
    save();
    return account;
  }

  function unlinkAccountFromBank(accountId) {
    const account = getAccount(accountId);
    if (!account) return null;
    account.bankAccountId = null;
    account.bankInstitutionName = null;
    save();
    return account;
  }

  function importBankTransactions(accountId, normalizedTransactions) {
    const existingExternalIds = new Set(
      state.transactions.filter((t) => t.accountId === accountId && t.externalId).map((t) => t.externalId)
    );
    let imported = 0;
    normalizedTransactions.forEach((t) => {
      if (!t.externalId || existingExternalIds.has(t.externalId)) return;
      state.transactions.push({
        id: uid(),
        accountId,
        type: t.type === 'income' ? 'income' : 'expense',
        amount: Math.abs(Number(t.amount)) || 0,
        category: 'Importato da banca',
        date: t.date,
        note: t.description || '',
        scope: 'personal',
        excludeContributions: false,
        externalId: t.externalId,
        createdAt: Date.now(),
      });
      existingExternalIds.add(t.externalId);
      imported++;
    });
    if (imported > 0) save();
    return imported;
  }

  // ---- Transactions ----
  function getTransactions() {
    return state.transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function addTransaction({ accountId, type, amount, category, date, note, scope, excludeContributions, externalId }) {
    const tx = {
      id: uid(),
      accountId,
      type,
      amount: Number(amount),
      category,
      date,
      note: note || '',
      scope: scope || 'personal',
      excludeContributions: !!excludeContributions,
      externalId: externalId || null,
      createdAt: Date.now(),
    };
    state.transactions.push(tx);
    save();
    return tx;
  }

  function updateTransaction(id, { accountId, type, amount, category, date, note, scope, excludeContributions }) {
    const tx = state.transactions.find((t) => t.id === id);
    if (!tx) return null;
    tx.accountId = accountId;
    tx.type = type;
    tx.amount = Number(amount);
    tx.category = category;
    tx.date = date;
    tx.note = note || '';
    tx.scope = scope || 'personal';
    tx.excludeContributions = !!excludeContributions;
    save();
    return tx;
  }

  function deleteTransaction(id) {
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
  }

  function getTransaction(id) {
    return state.transactions.find((t) => t.id === id);
  }

  // ---- Transazioni ricorrenti (spese/entrate mensili o annuali) ----
  function getRecurringTransactions() {
    return state.recurringTransactions.slice();
  }

  function getRecurringTransaction(id) {
    return state.recurringTransactions.find((r) => r.id === id);
  }

  function addRecurringTransaction({ name, type, scope, category, amount, accountId, frequency, nextDueDate, active }) {
    const rule = {
      id: uid(),
      name,
      type,
      scope: scope || 'personal',
      category,
      amount: Number(amount),
      accountId,
      frequency, // 'monthly' | 'yearly'
      nextDueDate,
      active: active !== false,
      createdAt: Date.now(),
    };
    state.recurringTransactions.push(rule);
    save();
    return rule;
  }

  function updateRecurringTransaction(id, { name, type, scope, category, amount, accountId, frequency, nextDueDate, active }) {
    const rule = getRecurringTransaction(id);
    if (!rule) return null;
    rule.name = name;
    rule.type = type;
    rule.scope = scope || 'personal';
    rule.category = category;
    rule.amount = Number(amount);
    rule.accountId = accountId;
    rule.frequency = frequency;
    rule.nextDueDate = nextDueDate;
    rule.active = active !== false;
    save();
    return rule;
  }

  function deleteRecurringTransaction(id) {
    state.recurringTransactions = state.recurringTransactions.filter((r) => r.id !== id);
    save();
  }

  function toggleRecurringActive(id) {
    const rule = getRecurringTransaction(id);
    if (!rule) return null;
    rule.active = !rule.active;
    save();
    return rule;
  }

  function addInterval(dateStr, frequency) {
    return frequency === 'yearly' ? addDaysToDateStr(dateStr, 0, 0, 1) : addDaysToDateStr(dateStr, 0, 1, 0);
  }

  function processDueRecurring() {
    const today = new Date().toISOString().slice(0, 10);
    let generatedCount = 0;

    state.recurringTransactions.forEach((rule) => {
      if (!rule.active) return;
      let guard = 0;
      while (rule.nextDueDate <= today && guard < 60) {
        state.transactions.push({
          id: uid(),
          accountId: rule.accountId,
          type: rule.type,
          amount: rule.amount,
          category: rule.category,
          date: rule.nextDueDate,
          note: `Ricorrente: ${rule.name}`,
          scope: rule.scope || 'personal',
          recurringId: rule.id,
          createdAt: Date.now(),
        });
        rule.nextDueDate = addInterval(rule.nextDueDate, rule.frequency);
        generatedCount++;
        guard++;
      }
    });

    if (generatedCount > 0) save();
    return generatedCount;
  }

  // ---- Budgets ----
  function budgetKey(category, month) {
    return `${category}|${month}`;
  }

  function getBudget(category, month) {
    return state.budgets[budgetKey(category, month)] || 0;
  }

  function setBudget(category, month, limit) {
    const key = budgetKey(category, month);
    if (!limit || Number(limit) <= 0) {
      delete state.budgets[key];
    } else {
      state.budgets[key] = Number(limit);
    }
    save();
  }

  function getBudgetsForMonth(month) {
    const result = {};
    CATEGORIES.personal.expense.forEach((cat) => {
      result[cat] = getBudget(cat, month);
    });
    return result;
  }

  // ---- Aggregations ----
  function getMonthKey(dateStr) {
    return dateStr.slice(0, 7); // YYYY-MM
  }

  function getTransactionsForMonth(month) {
    return state.transactions.filter((t) => getMonthKey(t.date) === month);
  }

  function getSpendingByCategory(month, scope = 'personal') {
    const result = {};
    getTransactionsForMonth(month)
      .filter((t) => t.type === 'expense' && (t.scope || 'personal') === scope)
      .forEach((t) => {
        result[t.category] = (result[t.category] || 0) + t.amount;
      });
    return result;
  }

  function getMonthSummary(month, scope = 'personal') {
    const txs = getTransactionsForMonth(month).filter((t) => (t.scope || 'personal') === scope);
    const income = txs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    const expense = txs.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    return { income, expense, net: income - expense };
  }

  function getLastNMonths(n) {
    const months = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }

  // ---- Professione (gestione P.IVA) ----
  function getTransactionsForYear(year, scope) {
    return state.transactions.filter((t) => t.date.slice(0, 4) === String(year) && (t.scope || 'personal') === scope);
  }

  function getYearSummary(year, scope) {
    const txs = getTransactionsForYear(year, scope);
    const income = txs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    const expense = txs.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    return { income, expense, net: income - expense };
  }

  function getAvailableYears() {
    const years = new Set(state.transactions.map((t) => t.date.slice(0, 4)));
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }

  function getProfessionSettings() {
    return { ...DEFAULT_PROFESSION_SETTINGS, ...state.professionSettings };
  }

  function setProfessionSettings(partial) {
    state.professionSettings = { ...getProfessionSettings(), ...partial };
    save();
  }

  function getProfessionRevenueBreakdown(year) {
    const incomeTxs = getTransactionsForYear(year, 'professional').filter((t) => t.type === 'income');
    const total = incomeTxs.reduce((a, t) => a + t.amount, 0);
    const contributable = incomeTxs
      .filter((t) => !t.excludeContributions)
      .reduce((a, t) => a + t.amount, 0);
    return { total, contributable, exempt: total - contributable };
  }

  function getProfessionTaxEstimate(year) {
    const settings = getProfessionSettings();
    const summary = getYearSummary(year, 'professional');
    const revenueBreakdown = getProfessionRevenueBreakdown(year);
    const revenue = revenueBreakdown.total;
    const taxableIncome = revenue * (settings.coefficient / 100);
    const contributableTaxableIncome = revenueBreakdown.contributable * (settings.coefficient / 100);
    const inpsContributions = contributableTaxableIncome * (settings.inpsRate / 100);
    const substituteTaxBase = Math.max(0, taxableIncome - inpsContributions);
    const substituteTax = substituteTaxBase * (settings.taxRate / 100);
    const totalDue = inpsContributions + substituteTax;
    const netEstimate = revenue - totalDue;
    return {
      revenue,
      expenses: summary.expense,
      taxableIncome,
      inpsContributions,
      substituteTax,
      totalDue,
      netEstimate,
      exemptRevenue: revenueBreakdown.exempt,
      contributableRevenue: revenueBreakdown.contributable,
      threshold: PROFESSION_REVENUE_THRESHOLD,
      thresholdPct: revenue > 0 ? Math.min(100, Math.round((revenue / PROFESSION_REVENUE_THRESHOLD) * 100)) : 0,
    };
  }

  // ---- Investimenti (portafoglio) ----
  function getInvestments() {
    return state.investments.slice();
  }

  function getInvestment(id) {
    return state.investments.find((i) => i.id === id);
  }

  function addInvestment({ assetType, symbol, name, quantity, avgCost }) {
    const inv = {
      id: uid(),
      assetType,
      symbol,
      name,
      quantity: Number(quantity),
      avgCost: Number(avgCost),
      createdAt: Date.now(),
    };
    state.investments.push(inv);
    save();
    return inv;
  }

  function updateInvestment(id, { assetType, symbol, name, quantity, avgCost }) {
    const inv = getInvestment(id);
    if (!inv) return null;
    inv.assetType = assetType;
    inv.symbol = symbol;
    inv.name = name;
    inv.quantity = Number(quantity);
    inv.avgCost = Number(avgCost);
    save();
    return inv;
  }

  function deleteInvestment(id) {
    state.investments = state.investments.filter((i) => i.id !== id);
    save();
  }

  function getApiSettings() {
    return { twelveDataKey: '', ...state.apiSettings };
  }

  function setApiSettings(partial) {
    state.apiSettings = { ...getApiSettings(), ...partial };
    save();
  }

  // ---- Import / Export ----
  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.accounts || !parsed.transactions || !parsed.budgets) {
      throw new Error('Formato file non valido.');
    }
    state = parsed;
    save();
  }

  return {
    CATEGORIES,
    PROFESSION_REVENUE_THRESHOLD,
    getAccounts, getAccount, addAccount, updateAccount, deleteAccount, getAccountBalance, getTotalBalance,
    processAccountInterest,
    linkAccountToBank, unlinkAccountFromBank, importBankTransactions,
    getTransactions, getTransaction, addTransaction, updateTransaction, deleteTransaction,
    getRecurringTransactions, getRecurringTransaction, addRecurringTransaction, updateRecurringTransaction,
    deleteRecurringTransaction, toggleRecurringActive, processDueRecurring,
    getBudget, setBudget, getBudgetsForMonth,
    getMonthKey, getTransactionsForMonth, getSpendingByCategory, getMonthSummary, getLastNMonths,
    getTransactionsForYear, getYearSummary, getAvailableYears,
    getProfessionSettings, setProfessionSettings, getProfessionTaxEstimate, getProfessionRevenueBreakdown,
    getInvestments, getInvestment, addInvestment, updateInvestment, deleteInvestment,
    getApiSettings, setApiSettings,
    onStateSaved, getStateSnapshot, replaceState,
    exportData, importData,
  };
})();
