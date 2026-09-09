/**
 * Database.gs
 * Abstraksi akses Google Spreadsheet sebagai "database".
 * Semua modul WAJIB mengakses sheet lewat helper di sini agar performa terjaga
 * (batch read/write, bukan getRange() berulang) dan agar ID konsisten.
 */

var SHEET_HEADERS = {
  settings: ['key', 'value', 'description', 'updated_at'],
  users: ['id', 'name', 'username', 'password_hash', 'role_id', 'phone', 'email', 'status', 'last_login', 'created_at', 'updated_at'],
  roles: ['id', 'name', 'description', 'created_at'],
  announcements: ['id', 'title', 'content', 'category', 'start_date', 'end_date', 'priority', 'status', 'is_display', 'is_pinned', 'created_by', 'created_at', 'updated_at'],
  events: ['id', 'title', 'category', 'date', 'start_time', 'end_time', 'location', 'speaker', 'description', 'status', 'is_display', 'created_at', 'updated_at'],
  prayer_schedules: ['id', 'date', 'imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'maghrib', 'isya', 'source', 'correction_minutes', 'created_at', 'updated_at'],
  imam_schedules: ['id', 'date', 'prayer_type', 'imam', 'khatib', 'muadzin', 'topic', 'notes', 'created_at', 'updated_at'],
  income: ['id', 'transaction_number', 'date', 'category_id', 'fund_source_id', 'amount', 'payment_method', 'payer', 'description', 'status', 'is_public', 'created_by', 'created_at', 'updated_at'],
  expenses: ['id', 'transaction_number', 'date', 'category_id', 'fund_source_id', 'amount', 'payment_method', 'recipient', 'description', 'status', 'is_public', 'created_by', 'created_at', 'updated_at'],
  fund_sources: ['id', 'name', 'description', 'status', 'created_at', 'updated_at'],
  finance_categories: ['id', 'name', 'type', 'description', 'status', 'created_at'],
  donations: ['id', 'campaign_id', 'donor_name', 'amount', 'payment_method', 'is_anonymous', 'note', 'status', 'created_at'],
  campaigns: ['id', 'title', 'description', 'target_amount', 'current_amount', 'start_date', 'end_date', 'status', 'is_public', 'cover_url', 'created_at', 'updated_at'],
  inventory: ['id', 'asset_code', 'name', 'category', 'quantity', 'condition', 'location', 'purchase_date', 'purchase_price', 'fund_source', 'status', 'notes', 'created_at', 'updated_at'],
  jamaah: ['id', 'name', 'gender', 'phone', 'address', 'status', 'registered_at', 'notes'],
  social_programs: ['id', 'name', 'date', 'recipient_count', 'fund_source_id', 'amount', 'person_in_charge', 'description', 'created_at', 'updated_at'],
  documents: ['id', 'file_id', 'file_url', 'file_name', 'file_type', 'related_module', 'related_id', 'uploaded_by', 'uploaded_at'],
  display_settings: ['key', 'value', 'updated_at'],
  display_schedules: ['id', 'name', 'slide_type', 'order_index', 'duration_seconds', 'is_active', 'config_json', 'created_at', 'updated_at'],
  audit_logs: ['id', 'user_id', 'action', 'module', 'record_id', 'description', 'timestamp'],
  sessions: ['token', 'user_id', 'username', 'role_id', 'created_at', 'expires_at']
};

/**
 * Kolom-kolom berisi tanggal (format string 'yyyy-MM-dd') yang WAJIB dipaksa bertipe
 * Plain Text di Spreadsheet. Tanpa ini, Google Sheets otomatis mengonversi string
 * seperti "2026-09-09" menjadi objek Date saat ditulis lewat appendRow/setValues,
 * yang akan merusak perbandingan string persis (mis. `r.date === today`) dan
 * penggabungan string (`r.date + 'T' + r.start_time`) di berbagai modul.
 * Lihat ensureDateColumnsFormatted_(), dipanggil oleh setupDatabase().
 */
var DATE_ONLY_COLUMNS = {
  events: ['date', 'start_time', 'end_time'],
  prayer_schedules: ['date', 'imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'maghrib', 'isya'],
  imam_schedules: ['date'],
  income: ['date'],
  expenses: ['date'],
  inventory: ['purchase_date'],
  announcements: ['start_date', 'end_date'],
  campaigns: ['start_date', 'end_date'],
  social_programs: ['date']
};

function ensureDateColumnsFormatted_() {
  Object.keys(DATE_ONLY_COLUMNS).forEach(function (sheetName) {
    var sheet = getSheet(sheetName);
    var headers = SHEET_HEADERS[sheetName];
    DATE_ONLY_COLUMNS[sheetName].forEach(function (colName) {
      var colIndex = headers.indexOf(colName) + 1;
      if (colIndex <= 0) return;
      sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
}

var SHEET_ORDER = [
  'settings', 'roles', 'users', 'announcements', 'events', 'prayer_schedules', 'imam_schedules',
  'fund_sources', 'finance_categories', 'income', 'expenses', 'campaigns', 'donations',
  'inventory', 'jamaah', 'social_programs', 'documents', 'display_settings', 'display_schedules',
  'audit_logs', 'sessions'
];

var _ssCache = null;

/**
 * Resolusi Spreadsheet database dengan dua mode:
 * 1. Bound script (Extensions > Apps Script dari dalam Spreadsheet) -> pakai getActiveSpreadsheet().
 * 2. Standalone script -> pakai SPREADSHEET_ID dari Script Properties.
 * Ini membuat instalasi fleksibel tanpa mengorbankan keamanan (ID tidak perlu di-hardcode di frontend).
 */
function getSpreadsheet_() {
  if (_ssCache) return _ssCache;
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    _ssCache = active;
    return _ssCache;
  }
  var props = getScriptProps_();
  if (!props.SPREADSHEET_ID) {
    throw new AppError('SPREADSHEET_ID belum dikonfigurasi di Script Properties.');
  }
  _ssCache = SpreadsheetApp.openById(props.SPREADSHEET_ID);
  return _ssCache;
}

function getSheet(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    var headers = SHEET_HEADERS[sheetName];
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

/**
 * Baca seluruh sheet sekaligus (satu getDataRange) dan konversi ke array of object
 * berdasarkan header baris pertama. Menghindari getRange() berulang (lihat butir 57).
 */
function getAll(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    // lewati baris benar-benar kosong
    if (row.join('') === '') continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    obj.__row = i + 1; // simpan nomor baris fisik untuk update/delete internal, bukan sebagai ID
    rows.push(obj);
  }
  return rows;
}

function findById(sheetName, id) {
  var rows = getAll(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}

function findBy(sheetName, predicateFn) {
  return getAll(sheetName).filter(predicateFn);
}

function generateId(sheetName) {
  var prefix = ID_PREFIX[sheetName];
  if (!prefix) throw new AppError('Prefix ID tidak ditemukan untuk sheet ' + sheetName);
  var rows = getAll(sheetName);
  var maxNum = 0;
  rows.forEach(function (r) {
    if (r.id && r.id.indexOf(prefix + '-') === 0) {
      var num = parseInt(r.id.split('-')[1], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return prefix + '-' + pad5_(maxNum + 1);
}

/**
 * Insert satu baris baru. data harus berupa object dengan key sesuai header.
 * Menghasilkan id otomatis jika sheet memiliki kolom 'id' dan data.id kosong.
 */
function insert(sheetName, data) {
  var sheet = getSheet(sheetName);
  var headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new AppError('Header tidak dikenal untuk sheet ' + sheetName);

  var record = {};
  headers.forEach(function (h) { record[h] = (data[h] !== undefined) ? data[h] : ''; });

  if (headers.indexOf('id') !== -1 && isBlank_(record.id)) {
    record.id = generateId(sheetName);
  }
  if (headers.indexOf('created_at') !== -1 && isBlank_(record.created_at)) {
    record.created_at = nowIso_();
  }
  if (headers.indexOf('updated_at') !== -1) {
    record.updated_at = nowIso_();
  }

  var rowValues = headers.map(function (h) { return record[h]; });
  sheet.appendRow(rowValues);
  return record;
}

/**
 * Update baris berdasarkan id (kolom 'id' harus ada di sheet).
 * Hanya field yang dikirim di `data` yang diubah (partial update).
 */
function update(sheetName, id, data) {
  var sheet = getSheet(sheetName);
  var headers = SHEET_HEADERS[sheetName];
  if (!headers) throw new AppError('Header tidak dikenal untuk sheet ' + sheetName);
  var idCol = headers.indexOf('id');
  if (idCol === -1) throw new AppError('Sheet ' + sheetName + ' tidak memiliki kolom id.');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var range = sheet.getRange(2, 1, lastRow - 1, headers.length);
  var values = range.getValues();

  for (var i = 0; i < values.length; i++) {
    if (values[i][idCol] === id) {
      headers.forEach(function (h, c) {
        if (data[h] !== undefined && h !== 'id') {
          values[i][c] = data[h];
        }
      });
      if (headers.indexOf('updated_at') !== -1) {
        values[i][headers.indexOf('updated_at')] = nowIso_();
      }
      range.setValues(values);
      var updated = {};
      headers.forEach(function (h, c) { updated[h] = values[i][c]; });
      return updated;
    }
  }
  return null;
}

/**
 * Hapus baris berdasarkan id.
 */
function remove(sheetName, id) {
  var sheet = getSheet(sheetName);
  var headers = SHEET_HEADERS[sheetName];
  var idCol = headers.indexOf('id');
  if (idCol === -1) throw new AppError('Sheet ' + sheetName + ' tidak memiliki kolom id.');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][idCol] === id) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

// ================== SETTINGS (key/value sheets) ==================
function getSetting(key, defaultValue) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'setting_' + key;
  var cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  var rows = getAll(SHEETS.SETTINGS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) {
      cache.put(cacheKey, String(rows[i].value), CACHE_TTL_SETTINGS);
      return rows[i].value;
    }
  }
  return defaultValue !== undefined ? defaultValue : null;
}

/**
 * getAllSettings/getAllDisplaySettings dipanggil di HAMPIR SETIAP halaman (nama masjid,
 * logo, dsb), jadi hasilnya di-cache utuh sebagai satu object (bukan per-key) agar tidak
 * membaca ulang sheet settings di setiap request. Cache diinvalidasi otomatis begitu ada
 * perubahan lewat setSetting()/setDisplaySetting().
 */
function getAllSettings() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('all_settings');
  if (cached !== null) return JSON.parse(cached);

  var rows = getAll(SHEETS.SETTINGS);
  var out = {};
  rows.forEach(function (r) { out[r.key] = r.value; });
  cache.put('all_settings', JSON.stringify(out), CACHE_TTL_SETTINGS);
  return out;
}

function setSetting(key, value, description) {
  var sheet = getSheet(SHEETS.SETTINGS);
  var rows = getAll(SHEETS.SETTINGS);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) { found = rows[i]; break; }
  }
  if (found) {
    sheet.getRange(found.__row, 2, 1, 3).setValues([[value, description || '', nowIso_()]]);
  } else {
    sheet.appendRow([key, value, description || '', nowIso_()]);
  }
  var cache = CacheService.getScriptCache();
  cache.remove('setting_' + key);
  cache.remove('all_settings');
  return { key: key, value: value };
}

// display_settings uses same key/value pattern
function getDisplaySetting(key, defaultValue) {
  var all = getAllDisplaySettings();
  return all[key] !== undefined ? all[key] : (defaultValue !== undefined ? defaultValue : null);
}

function getAllDisplaySettings() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('all_display_settings');
  if (cached !== null) return JSON.parse(cached);

  var rows = getAll(SHEETS.DISPLAY_SETTINGS);
  var out = {};
  rows.forEach(function (r) { out[r.key] = r.value; });
  cache.put('all_display_settings', JSON.stringify(out), CACHE_TTL_SETTINGS);
  return out;
}

function setDisplaySetting(key, value) {
  var sheet = getSheet(SHEETS.DISPLAY_SETTINGS);
  var rows = getAll(SHEETS.DISPLAY_SETTINGS);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) { found = rows[i]; break; }
  }
  if (found) {
    sheet.getRange(found.__row, 2, 1, 2).setValues([[value, nowIso_()]]);
  } else {
    sheet.appendRow([key, value, nowIso_()]);
  }
  CacheService.getScriptCache().remove('all_display_settings');
  return { key: key, value: value };
}
