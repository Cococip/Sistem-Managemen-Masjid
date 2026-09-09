/**
 * Utils.gs
 * Helper umum: response builder, formatting, validasi, hashing, tanggal/waktu, UUID.
 */

// ================== API RESPONSE ==================
function successResponse_(data, message) {
  return {
    success: true,
    message: message || 'Berhasil',
    data: (data === undefined || data === null) ? {} : data
  };
}

function errorResponse_(message, code) {
  return {
    success: false,
    message: message || 'Terjadi kesalahan',
    code: code || 'ERROR'
  };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================== ERROR WRAPPER ==================
/**
 * Membungkus handler action agar error internal tidak bocor ke user (lihat butir 54).
 * Detail error tetap dicatat ke Stackdriver Logger.
 */
function safeExecute_(fn) {
  try {
    return fn();
  } catch (err) {
    Logger.log('ERROR: ' + (err && err.stack ? err.stack : err));
    var msg = (err && err.userMessage) ? err.userMessage : 'Terjadi masalah saat memproses data.';
    return errorResponse_(msg, 'INTERNAL_ERROR');
  }
}

/**
 * Error yang boleh menampilkan pesan spesifik ke user (mis. validasi).
 */
function AppError(message) {
  this.name = 'AppError';
  this.message = message;
  this.userMessage = message;
  this.stack = (new Error()).stack;
}
AppError.prototype = Object.create(Error.prototype);

// ================== HASHING ==================
function hashPassword_(password, salt) {
  var props = getScriptProps_();
  var raw = salt + ':' + password + ':' + props.SECRET_KEY;
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 16);
}

function makePasswordHash_(plainPassword) {
  var salt = generateSalt_();
  var hash = hashPassword_(plainPassword, salt);
  return salt + '$' + hash;
}

function verifyPassword_(plainPassword, storedHash) {
  if (!storedHash || storedHash.indexOf('$') === -1) return false;
  var parts = storedHash.split('$');
  var salt = parts[0];
  var hash = parts[1];
  return hashPassword_(plainPassword, salt) === hash;
}

function generateToken_() {
  return Utilities.getUuid() + '-' + Utilities.getUuid();
}

// ================== ID / UUID ==================
function pad5_(n) {
  var s = '' + n;
  while (s.length < 5) s = '0' + s;
  return s;
}

// ================== VALIDATION ==================
function isBlank_(v) {
  return v === undefined || v === null || ('' + v).trim() === '';
}

function requireFields_(obj, fields) {
  var missing = [];
  fields.forEach(function (f) {
    if (isBlank_(obj[f])) missing.push(f);
  });
  if (missing.length > 0) {
    throw new AppError('Data belum lengkap: ' + missing.join(', '));
  }
}

function requireNumber_(value, fieldName) {
  var n = Number(value);
  if (isNaN(n)) {
    throw new AppError(fieldName + ' harus berupa angka.');
  }
  return n;
}

function requirePositiveAmount_(value, fieldName) {
  var n = requireNumber_(value, fieldName || 'Nominal');
  if (n <= 0) {
    throw new AppError((fieldName || 'Nominal') + ' harus lebih besar dari 0.');
  }
  return n;
}

function requireEnum_(value, allowed, fieldName) {
  if (allowed.indexOf(value) === -1) {
    throw new AppError(fieldName + ' tidak valid. Pilihan: ' + allowed.join(', '));
  }
  return value;
}

function requireDate_(value, fieldName) {
  var d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new AppError(fieldName + ' harus berupa tanggal yang valid.');
  }
  return d;
}

/**
 * Sanitasi string sederhana untuk mencegah injeksi HTML pada tampilan.
 */
function sanitizeString_(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ================== FORMAT ==================
function formatRupiah_(amount) {
  var n = Number(amount) || 0;
  var neg = n < 0;
  n = Math.abs(Math.round(n));
  var s = n.toString();
  var out = '';
  var count = 0;
  for (var i = s.length - 1; i >= 0; i--) {
    out = s.charAt(i) + out;
    count++;
    if (count % 3 === 0 && i !== 0) out = '.' + out;
  }
  return (neg ? '-Rp ' : 'Rp ') + out;
}

var BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function formatDateId_(date, tz) {
  var d = (date instanceof Date) ? date : new Date(date);
  tz = tz || DEFAULT_TIMEZONE;
  var day = Number(Utilities.formatDate(d, tz, 'd'));
  var month = Number(Utilities.formatDate(d, tz, 'M')) - 1;
  var year = Utilities.formatDate(d, tz, 'yyyy');
  return day + ' ' + BULAN_ID[month] + ' ' + year;
}

function formatDateFullId_(date, tz) {
  var d = (date instanceof Date) ? date : new Date(date);
  tz = tz || DEFAULT_TIMEZONE;
  var dow = Number(Utilities.formatDate(d, tz, 'u')) % 7; // 1=Mon..7=Sun -> map
  var jsDay = d.getDay();
  return HARI_ID[jsDay] + ', ' + formatDateId_(d, tz);
}

function formatDateYmd_(date, tz) {
  var d = (date instanceof Date) ? date : new Date(date);
  tz = tz || DEFAULT_TIMEZONE;
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function formatTimeHm_(date, tz) {
  var d = (date instanceof Date) ? date : new Date(date);
  tz = tz || DEFAULT_TIMEZONE;
  return Utilities.formatDate(d, tz, 'HH:mm');
}

function nowIso_() {
  return new Date().toISOString();
}

// ================== PAGINATION / FILTER HELPERS ==================
function paginate_(array, page, pageSize) {
  page = Math.max(1, parseInt(page, 10) || 1);
  pageSize = Math.max(1, parseInt(pageSize, 10) || 20);
  var total = array.length;
  var totalPages = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, totalPages);
  var start = (page - 1) * pageSize;
  var items = array.slice(start, start + pageSize);
  return {
    items: items,
    pagination: {
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages
    }
  };
}

function matchesSearch_(record, searchTerm, fields) {
  if (isBlank_(searchTerm)) return true;
  var term = searchTerm.toString().toLowerCase();
  return fields.some(function (f) {
    var v = record[f];
    return v !== undefined && v !== null && v.toString().toLowerCase().indexOf(term) !== -1;
  });
}

function inDateRange_(dateValue, startStr, endStr) {
  if (isBlank_(startStr) && isBlank_(endStr)) return true;
  var d = new Date(dateValue).getTime();
  if (!isBlank_(startStr)) {
    var start = new Date(startStr).getTime();
    if (d < start) return false;
  }
  if (!isBlank_(endStr)) {
    var end = new Date(endStr);
    end.setHours(23, 59, 59, 999);
    if (d > end.getTime()) return false;
  }
  return true;
}
