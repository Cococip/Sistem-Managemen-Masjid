/**
 * Finance.gs
 * Modul keuangan: pemasukan, pengeluaran, sumber dana, kategori, dashboard, laporan, transparansi.
 * Saldo SELALU dihitung dari transaksi (income - expenses), tidak pernah disimpan sebagai angka statis.
 */

// ================== FUND SOURCES ==================
function apiGetFundSources(params, token) {
  requireAuth_(token);
  var rows = getAll(SHEETS.FUND_SOURCES).map(function (r) { delete r.__row; return r; });
  if (params && params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  return rows;
}

function apiCreateFundSource(data, token) {
  var ctx = requirePermission_(token, 'finance');
  requireFields_(data, ['name']);
  var record = insert(SHEETS.FUND_SOURCES, { name: data.name, description: data.description || '', status: data.status || 'active' });
  logAudit(ctx.user_id, 'create', 'fund_sources', record.id, 'Membuat sumber dana ' + record.name);
  return record;
}

function apiUpdateFundSource(id, data, token) {
  var ctx = requirePermission_(token, 'finance');
  var updated = update(SHEETS.FUND_SOURCES, id, { name: data.name, description: data.description, status: data.status });
  if (!updated) throw new AppError('Sumber dana tidak ditemukan.');
  logAudit(ctx.user_id, 'update', 'fund_sources', id, 'Mengubah sumber dana');
  return updated;
}

function apiDeleteFundSource(id, token) {
  var ctx = requirePermission_(token, 'finance');
  if (!remove(SHEETS.FUND_SOURCES, id)) throw new AppError('Sumber dana tidak ditemukan.');
  logAudit(ctx.user_id, 'delete', 'fund_sources', id, 'Menghapus sumber dana');
  return true;
}

// ================== FINANCE CATEGORIES ==================
function apiGetFinanceCategories(params, token) {
  requireAuth_(token);
  var rows = getAll(SHEETS.FINANCE_CATEGORIES).map(function (r) { delete r.__row; return r; });
  if (params && params.type) rows = rows.filter(function (r) { return r.type === params.type; });
  if (params && params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  return rows;
}

function apiCreateFinanceCategory(data, token) {
  var ctx = requirePermission_(token, 'finance');
  requireFields_(data, ['name', 'type']);
  requireEnum_(data.type, ['income', 'expense'], 'Tipe kategori');
  var record = insert(SHEETS.FINANCE_CATEGORIES, {
    name: data.name, type: data.type, description: data.description || '', status: data.status || 'active'
  });
  logAudit(ctx.user_id, 'create', 'finance_categories', record.id, 'Membuat kategori ' + record.name);
  return record;
}

function apiUpdateFinanceCategory(id, data, token) {
  var ctx = requirePermission_(token, 'finance');
  var updated = update(SHEETS.FINANCE_CATEGORIES, id, { name: data.name, description: data.description, status: data.status });
  if (!updated) throw new AppError('Kategori tidak ditemukan.');
  logAudit(ctx.user_id, 'update', 'finance_categories', id, 'Mengubah kategori');
  return updated;
}

function apiDeleteFinanceCategory(id, token) {
  var ctx = requirePermission_(token, 'finance');
  if (!remove(SHEETS.FINANCE_CATEGORIES, id)) throw new AppError('Kategori tidak ditemukan.');
  logAudit(ctx.user_id, 'delete', 'finance_categories', id, 'Menghapus kategori');
  return true;
}

// ================== TRANSACTION NUMBER ==================
function generateTransactionNumber_(type, dateObj) {
  var sheetName = type === 'income' ? SHEETS.INCOME : SHEETS.EXPENSES;
  var code = type === 'income' ? 'IN' : 'EX';
  var ymd = formatDateYmd_(dateObj || new Date()).replace(/-/g, '');
  var rows = getAll(sheetName);
  var countToday = rows.filter(function (r) {
    return r.transaction_number && r.transaction_number.indexOf(code + '-' + ymd) === 0;
  }).length;
  return code + '-' + ymd + '-' + pad5_(countToday + 1);
}

// ================== INCOME ==================
function validateTransactionInput_(data) {
  requireFields_(data, ['date', 'category_id', 'fund_source_id', 'amount', 'payment_method']);
  requireDate_(data.date, 'Tanggal');
  requirePositiveAmount_(data.amount, 'Nominal');
  requireEnum_(data.payment_method, PAYMENT_METHODS, 'Metode pembayaran');
}

function apiCreateIncome(data, token) {
  var ctx = requirePermission_(token, 'finance');
  validateTransactionInput_(data);
  var dateObj = requireDate_(data.date, 'Tanggal');
  var record = insert(SHEETS.INCOME, {
    transaction_number: generateTransactionNumber_('income', dateObj),
    date: formatDateYmd_(dateObj),
    category_id: data.category_id,
    fund_source_id: data.fund_source_id,
    amount: requirePositiveAmount_(data.amount, 'Nominal'),
    payment_method: data.payment_method,
    payer: data.payer || '',
    description: data.description || '',
    status: data.status || 'verified',
    is_public: data.is_public === true || data.is_public === 'true',
    created_by: ctx.user_id
  });
  logAudit(ctx.user_id, 'create', 'income', record.id, 'Pemasukan ' + record.transaction_number + ' Rp' + record.amount);
  return record;
}

function apiUpdateIncome(id, data, token) {
  var ctx = requirePermission_(token, 'finance');
  var existing = findById(SHEETS.INCOME, id);
  if (!existing) throw new AppError('Data pemasukan tidak ditemukan.');
  var patch = {};
  ['category_id', 'fund_source_id', 'payment_method', 'payer', 'description', 'status'].forEach(function (f) {
    if (data[f] !== undefined) patch[f] = data[f];
  });
  if (data.date !== undefined) patch.date = formatDateYmd_(requireDate_(data.date, 'Tanggal'));
  if (data.amount !== undefined) patch.amount = requirePositiveAmount_(data.amount, 'Nominal');
  if (data.payment_method !== undefined) requireEnum_(data.payment_method, PAYMENT_METHODS, 'Metode pembayaran');
  if (data.is_public !== undefined) patch.is_public = (data.is_public === true || data.is_public === 'true');
  var updated = update(SHEETS.INCOME, id, patch);
  logAudit(ctx.user_id, 'update', 'income', id, 'Mengubah pemasukan ' + existing.transaction_number);
  return updated;
}

function apiDeleteIncome(id, token) {
  var ctx = requirePermission_(token, 'finance');
  var existing = findById(SHEETS.INCOME, id);
  if (!existing) throw new AppError('Data pemasukan tidak ditemukan.');
  remove(SHEETS.INCOME, id);
  logAudit(ctx.user_id, 'delete', 'income', id, 'Menghapus pemasukan ' + existing.transaction_number);
  return true;
}

// ================== EXPENSES ==================
function apiCreateExpense(data, token) {
  var ctx = requirePermission_(token, 'finance');
  validateTransactionInput_(data);
  var dateObj = requireDate_(data.date, 'Tanggal');
  var record = insert(SHEETS.EXPENSES, {
    transaction_number: generateTransactionNumber_('expense', dateObj),
    date: formatDateYmd_(dateObj),
    category_id: data.category_id,
    fund_source_id: data.fund_source_id,
    amount: requirePositiveAmount_(data.amount, 'Nominal'),
    payment_method: data.payment_method,
    recipient: data.recipient || '',
    description: data.description || '',
    status: data.status || 'verified',
    is_public: data.is_public === true || data.is_public === 'true',
    created_by: ctx.user_id
  });
  logAudit(ctx.user_id, 'create', 'expenses', record.id, 'Pengeluaran ' + record.transaction_number + ' Rp' + record.amount);
  return record;
}

function apiUpdateExpense(id, data, token) {
  var ctx = requirePermission_(token, 'finance');
  var existing = findById(SHEETS.EXPENSES, id);
  if (!existing) throw new AppError('Data pengeluaran tidak ditemukan.');
  var patch = {};
  ['category_id', 'fund_source_id', 'payment_method', 'recipient', 'description', 'status'].forEach(function (f) {
    if (data[f] !== undefined) patch[f] = data[f];
  });
  if (data.date !== undefined) patch.date = formatDateYmd_(requireDate_(data.date, 'Tanggal'));
  if (data.amount !== undefined) patch.amount = requirePositiveAmount_(data.amount, 'Nominal');
  if (data.payment_method !== undefined) requireEnum_(data.payment_method, PAYMENT_METHODS, 'Metode pembayaran');
  if (data.is_public !== undefined) patch.is_public = (data.is_public === true || data.is_public === 'true');
  var updated = update(SHEETS.EXPENSES, id, patch);
  logAudit(ctx.user_id, 'update', 'expenses', id, 'Mengubah pengeluaran ' + existing.transaction_number);
  return updated;
}

function apiDeleteExpense(id, token) {
  var ctx = requirePermission_(token, 'finance');
  var existing = findById(SHEETS.EXPENSES, id);
  if (!existing) throw new AppError('Data pengeluaran tidak ditemukan.');
  remove(SHEETS.EXPENSES, id);
  logAudit(ctx.user_id, 'delete', 'expenses', id, 'Menghapus pengeluaran ' + existing.transaction_number);
  return true;
}

// ================== COMBINED TRANSACTIONS ==================
function getCombinedTransactions_() {
  var income = getAll(SHEETS.INCOME).map(function (r) {
    return {
      id: r.id, transaction_number: r.transaction_number, type: 'income', date: r.date,
      category_id: r.category_id, fund_source_id: r.fund_source_id, amount: Number(r.amount) || 0,
      payment_method: r.payment_method, party: r.payer, description: r.description,
      status: r.status, is_public: r.is_public, created_by: r.created_by, created_at: r.created_at
    };
  });
  var expenses = getAll(SHEETS.EXPENSES).map(function (r) {
    return {
      id: r.id, transaction_number: r.transaction_number, type: 'expense', date: r.date,
      category_id: r.category_id, fund_source_id: r.fund_source_id, amount: Number(r.amount) || 0,
      payment_method: r.payment_method, party: r.recipient, description: r.description,
      status: r.status, is_public: r.is_public, created_by: r.created_by, created_at: r.created_at
    };
  });
  return income.concat(expenses);
}

function apiGetTransactions(params, token) {
  requirePermission_(token, 'finance');
  var rows = getCombinedTransactions_();

  if (params.type) rows = rows.filter(function (r) { return r.type === params.type; });
  if (params.category_id) rows = rows.filter(function (r) { return r.category_id === params.category_id; });
  if (params.fund_source_id) rows = rows.filter(function (r) { return r.fund_source_id === params.fund_source_id; });
  if (params.payment_method) rows = rows.filter(function (r) { return r.payment_method === params.payment_method; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.created_by) rows = rows.filter(function (r) { return r.created_by === params.created_by; });
  if (params.start_date || params.end_date) rows = rows.filter(function (r) { return inDateRange_(r.date, params.start_date, params.end_date); });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['transaction_number', 'party', 'description']); });

  var sortField = params.sortField || 'date';
  var sortDir = params.sortDir === 'asc' ? 1 : -1;
  rows.sort(function (a, b) {
    if (a[sortField] < b[sortField]) return -1 * sortDir;
    if (a[sortField] > b[sortField]) return 1 * sortDir;
    return 0;
  });

  return paginate_(rows, params.page, params.pageSize);
}

function apiGetTransactionDetail(id, token) {
  requirePermission_(token, 'finance');
  var all = getCombinedTransactions_();
  var found = all.filter(function (r) { return r.id === id; })[0];
  if (!found) throw new AppError('Transaksi tidak ditemukan.');
  var creator = findById(SHEETS.USERS, found.created_by);
  found.created_by_name = creator ? creator.name : found.created_by;
  var category = findById(SHEETS.FINANCE_CATEGORIES, found.category_id);
  found.category_name = category ? category.name : found.category_id;
  var fundSource = findById(SHEETS.FUND_SOURCES, found.fund_source_id);
  found.fund_source_name = fundSource ? fundSource.name : found.fund_source_id;
  return found;
}

// ================== DASHBOARD / SALDO ==================
function computeBalances_() {
  var income = getAll(SHEETS.INCOME).filter(function (r) { return r.status !== 'rejected'; });
  var expenses = getAll(SHEETS.EXPENSES).filter(function (r) { return r.status !== 'rejected'; });
  var totalIncome = income.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
  var totalExpense = expenses.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);

  var byFund = {};
  getAll(SHEETS.FUND_SOURCES).forEach(function (f) { byFund[f.id] = { id: f.id, name: f.name, income: 0, expense: 0, balance: 0 }; });
  income.forEach(function (r) {
    if (!byFund[r.fund_source_id]) byFund[r.fund_source_id] = { id: r.fund_source_id, name: r.fund_source_id, income: 0, expense: 0, balance: 0 };
    byFund[r.fund_source_id].income += Number(r.amount) || 0;
  });
  expenses.forEach(function (r) {
    if (!byFund[r.fund_source_id]) byFund[r.fund_source_id] = { id: r.fund_source_id, name: r.fund_source_id, income: 0, expense: 0, balance: 0 };
    byFund[r.fund_source_id].expense += Number(r.amount) || 0;
  });
  Object.keys(byFund).forEach(function (k) { byFund[k].balance = byFund[k].income - byFund[k].expense; });

  return {
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    balance: totalIncome - totalExpense,
    byFundSource: Object.keys(byFund).map(function (k) { return byFund[k]; })
  };
}

function sumInRange_(rows, startStr, endStr) {
  return rows.filter(function (r) { return r.status !== 'rejected' && inDateRange_(r.date, startStr, endStr); })
    .reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
}

function apiGetFinanceDashboard(params, token) {
  requirePermission_(token, 'finance');
  var tz = getSetting('timezone', DEFAULT_TIMEZONE);
  var today = formatDateYmd_(new Date(), tz);
  var now = new Date();
  var monthStart = formatDateYmd_(new Date(now.getFullYear(), now.getMonth(), 1), tz);
  var monthEnd = formatDateYmd_(new Date(now.getFullYear(), now.getMonth() + 1, 0), tz);
  var yearStart = formatDateYmd_(new Date(now.getFullYear(), 0, 1), tz);
  var yearEnd = formatDateYmd_(new Date(now.getFullYear(), 11, 31), tz);

  var income = getAll(SHEETS.INCOME);
  var expenses = getAll(SHEETS.EXPENSES);
  var balances = computeBalances_();

  var recentTx = getCombinedTransactions_()
    .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })
    .slice(0, 10);

  return {
    saldo: balances.balance,
    totalIncome: balances.totalIncome,
    totalExpense: balances.totalExpense,
    incomeToday: sumInRange_(income, today, today),
    expenseToday: sumInRange_(expenses, today, today),
    incomeThisMonth: sumInRange_(income, monthStart, monthEnd),
    expenseThisMonth: sumInRange_(expenses, monthStart, monthEnd),
    incomeThisYear: sumInRange_(income, yearStart, yearEnd),
    expenseThisYear: sumInRange_(expenses, yearStart, yearEnd),
    byFundSource: balances.byFundSource,
    recentTransactions: recentTx
  };
}

// ================== REPORTS ==================
function resolvePeriodRange_(period, customStart, customEnd) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (period) {
    case 'today': return { start: formatDateYmd_(now), end: formatDateYmd_(now) };
    case 'week': {
      var day = now.getDay();
      var diffToMonday = (day === 0 ? -6 : 1) - day;
      var monday = new Date(y, m, d + diffToMonday);
      var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return { start: formatDateYmd_(monday), end: formatDateYmd_(sunday) };
    }
    case 'month': return { start: formatDateYmd_(new Date(y, m, 1)), end: formatDateYmd_(new Date(y, m + 1, 0)) };
    case 'year': return { start: formatDateYmd_(new Date(y, 0, 1)), end: formatDateYmd_(new Date(y, 11, 31)) };
    case 'custom': return { start: customStart, end: customEnd };
    default: return { start: customStart || null, end: customEnd || null };
  }
}

function groupSum_(rows, keyField) {
  var map = {};
  rows.forEach(function (r) {
    var key = r[keyField] || '(kosong)';
    if (!map[key]) map[key] = 0;
    map[key] += Number(r.amount) || 0;
  });
  return Object.keys(map).map(function (k) { return { key: k, total: map[k] }; });
}

function apiGetFinanceReport(params, token) {
  requirePermission_(token, 'finance');
  var range = resolvePeriodRange_(params.period, params.start_date, params.end_date);
  var income = getAll(SHEETS.INCOME).filter(function (r) { return r.status !== 'rejected' && inDateRange_(r.date, range.start, range.end); });
  var expenses = getAll(SHEETS.EXPENSES).filter(function (r) { return r.status !== 'rejected' && inDateRange_(r.date, range.start, range.end); });

  var categories = getAll(SHEETS.FINANCE_CATEGORIES);
  var fundSources = getAll(SHEETS.FUND_SOURCES);
  var nameOf = function (list, id) { var f = list.filter(function (x) { return x.id === id; })[0]; return f ? f.name : id; };

  var incomeByCategory = groupSum_(income, 'category_id').map(function (x) { return { key: nameOf(categories, x.key), total: x.total }; });
  var expenseByCategory = groupSum_(expenses, 'category_id').map(function (x) { return { key: nameOf(categories, x.key), total: x.total }; });
  var incomeByFund = groupSum_(income, 'fund_source_id').map(function (x) { return { key: nameOf(fundSources, x.key), total: x.total }; });
  var expenseByFund = groupSum_(expenses, 'fund_source_id').map(function (x) { return { key: nameOf(fundSources, x.key), total: x.total }; });

  // arus kas per bulan (untuk grafik cashflow), berdasarkan seluruh histori (bukan hanya range) agar tren terlihat
  var allIncome = getAll(SHEETS.INCOME).filter(function (r) { return r.status !== 'rejected'; });
  var allExpense = getAll(SHEETS.EXPENSES).filter(function (r) { return r.status !== 'rejected'; });
  var monthlyMap = {};
  function bucketMonth_(list, sign) {
    list.forEach(function (r) {
      var d = new Date(r.date);
      var key = d.getFullYear() + '-' + pad2_(d.getMonth() + 1);
      if (!monthlyMap[key]) monthlyMap[key] = { period: key, income: 0, expense: 0 };
      if (sign === 1) monthlyMap[key].income += Number(r.amount) || 0;
      else monthlyMap[key].expense += Number(r.amount) || 0;
    });
  }
  bucketMonth_(allIncome, 1);
  bucketMonth_(allExpense, -1);
  var monthlyCashflow = Object.keys(monthlyMap).sort().map(function (k) { return monthlyMap[k]; });

  var totalIncome = income.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
  var totalExpense = expenses.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);

  return {
    range: range,
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    net: totalIncome - totalExpense,
    incomeByCategory: incomeByCategory,
    expenseByCategory: expenseByCategory,
    incomeByFundSource: incomeByFund,
    expenseByFundSource: expenseByFund,
    monthlyCashflow: monthlyCashflow,
    incomeList: income,
    expenseList: expenses
  };
}

function pad2_(n) { return n < 10 ? '0' + n : '' + n; }

function apiExportTransactionsCsv(params, token) {
  requirePermission_(token, 'finance');
  var range = resolvePeriodRange_(params.period, params.start_date, params.end_date);
  var rows = getCombinedTransactions_().filter(function (r) { return inDateRange_(r.date, range.start, range.end); });
  var categories = getAll(SHEETS.FINANCE_CATEGORIES);
  var fundSources = getAll(SHEETS.FUND_SOURCES);
  var nameOf = function (list, id) { var f = list.filter(function (x) { return x.id === id; })[0]; return f ? f.name : id; };

  var header = ['Tanggal', 'No Transaksi', 'Jenis', 'Kategori', 'Sumber Dana', 'Nominal', 'Metode', 'Pihak', 'Status', 'Keterangan'];
  var lines = [header.join(',')];
  rows.forEach(function (r) {
    var line = [
      r.date, r.transaction_number, r.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      nameOf(categories, r.category_id), nameOf(fundSources, r.fund_source_id), r.amount,
      r.payment_method, '"' + (r.party || '').replace(/"/g, '""') + '"', r.status,
      '"' + (r.description || '').replace(/"/g, '""') + '"'
    ];
    lines.push(line.join(','));
  });
  return { csv: lines.join('\n') };
}

// ================== PUBLIC TRANSPARENCY ==================
function apiGetPublicTransparency(params) {
  var income = getAll(SHEETS.INCOME).filter(function (r) { return r.is_public === true && r.status !== 'rejected'; });
  var expenses = getAll(SHEETS.EXPENSES).filter(function (r) { return r.is_public === true && r.status !== 'rejected'; });

  var now = new Date();
  var monthStart = formatDateYmd_(new Date(now.getFullYear(), now.getMonth(), 1));
  var monthEnd = formatDateYmd_(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  var allIncomeTotal = getAll(SHEETS.INCOME).filter(function (r) { return r.status !== 'rejected'; })
    .reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
  var allExpenseTotal = getAll(SHEETS.EXPENSES).filter(function (r) { return r.status !== 'rejected'; })
    .reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);

  var categories = getAll(SHEETS.FINANCE_CATEGORIES);
  var nameOf = function (id) { var f = categories.filter(function (x) { return x.id === id; })[0]; return f ? f.name : id; };

  var publicTx = income.map(function (r) {
    return { date: r.date, type: 'income', category: nameOf(r.category_id), amount: Number(r.amount) || 0, description: r.description, party: r.payer };
  }).concat(expenses.map(function (r) {
    return { date: r.date, type: 'expense', category: nameOf(r.category_id), amount: Number(r.amount) || 0, description: r.description, party: r.recipient };
  })).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

  return {
    saldo: allIncomeTotal - allExpenseTotal,
    incomeThisMonth: sumInRange_(income, monthStart, monthEnd),
    expenseThisMonth: sumInRange_(expenses, monthStart, monthEnd),
    surplus: sumInRange_(income, monthStart, monthEnd) - sumInRange_(expenses, monthStart, monthEnd),
    transactions: paginate_(publicTx, params.page, params.pageSize || 20)
  };
}
