/**
 * Prayer.gs
 * PrayerService: abstraksi penyedia jadwal shalat agar provider API dapat diganti
 * tanpa mengubah pemanggil (Display, Public site, dsb). Hasil harian disimpan ke
 * sheet prayer_schedules agar TV tidak selalu memanggil API eksternal (lihat butir 22).
 *
 * Juga berisi CRUD imam_schedules (jadwal imam/khatib/muadzin).
 */

var PRAYER_KEYS = ['imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'maghrib', 'isya'];

/**
 * Panggil API eksternal (Aladhan) untuk satu tanggal. Mengembalikan object waktu shalat
 * atau null jika gagal (network error / non-200) sehingga pemanggil bisa fallback ke cache.
 */
/**
 * Menyimpan pesan error terakhir dari pemanggilan API supaya bisa ditampilkan
 * langsung di UI (field `source`) tanpa perlu buka Execution log Apps Script.
 */
var _lastPrayerApiError = '';

function fetchPrayerTimesFromApi_(dateObj, lat, lng, method) {
  try {
    var props = getScriptProps_();
    var tz = getSetting('timezone', DEFAULT_TIMEZONE);
    var dateStr = Utilities.formatDate(dateObj, DEFAULT_TIMEZONE, 'dd-MM-yyyy');
    // timezonestring WAJIB disertakan: tanpa ini, Aladhan API mencoba auto-deteksi timezone
    // lewat layanan pihak ketiga yang kadang down ("Timezone lookup is temporarily unavailable"),
    // menyebabkan HTTP 503 walau lat/long-nya valid.
    var url = props.PRAYER_API_BASE + '/timings/' + dateStr +
      '?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lng) +
      '&method=' + encodeURIComponent(method || 2) +
      '&timezonestring=' + encodeURIComponent(tz);
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) {
      _lastPrayerApiError = 'HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 150);
      Logger.log('fetchPrayerTimesFromApi_ ' + _lastPrayerApiError);
      return null;
    }
    var json = JSON.parse(resp.getContentText());
    if (!json || !json.data || !json.data.timings) {
      _lastPrayerApiError = 'Response API tidak berisi data.timings: ' + resp.getContentText().substring(0, 150);
      return null;
    }
    var t = json.data.timings;
    var result = {
      imsak: (t.Imsak || '').substring(0, 5),
      subuh: (t.Fajr || '').substring(0, 5),
      terbit: (t.Sunrise || '').substring(0, 5),
      dzuhur: (t.Dhuhr || '').substring(0, 5),
      ashar: (t.Asr || '').substring(0, 5),
      maghrib: (t.Maghrib || '').substring(0, 5),
      isya: (t.Isha || '').substring(0, 5)
    };
    // Kadang server Aladhan tetap balas HTTP 200 tapi datanya "rusak" (semua jam sama),
    // biasanya kalau kena rate-limit karena request beruntun cepat (mis. saat generate 1 bulan).
    // Jangan percaya begitu saja - validasi urutannya masuk akal sebelum disimpan.
    if (!isSanePrayerTimes_(result)) {
      _lastPrayerApiError = 'Response API tidak masuk akal (kemungkinan rate-limit): ' + JSON.stringify(result);
      Logger.log('fetchPrayerTimesFromApi_ ' + _lastPrayerApiError);
      return null;
    }
    return result;
  } catch (e) {
    _lastPrayerApiError = String(e);
    Logger.log('fetchPrayerTimesFromApi_ error: ' + e);
    return null;
  }
}

/**
 * Validasi sederhana: waktu shalat sepanjang hari harus berurutan naik
 * (Subuh < [Terbit] < Dzuhur < Ashar < Maghrib < Isya). Kalau tidak, response API dianggap
 * tidak valid (mis. server rate-limit tapi tetap balas HTTP 200 dengan data seadanya).
 * `terbit` bersifat opsional karena tidak semua provider menyediakannya (bukan waktu shalat).
 */
function isSanePrayerTimes_(t) {
  var required = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];
  for (var i = 0; i < required.length; i++) {
    if (!t[required[i]] || t[required[i]].indexOf(':') === -1) return false;
  }
  var sequence = [t.subuh];
  if (t.terbit && t.terbit.indexOf(':') !== -1) sequence.push(t.terbit);
  sequence.push(t.dzuhur, t.ashar, t.maghrib, t.isya);
  for (var j = 1; j < sequence.length; j++) {
    if (sequence[j - 1] >= sequence[j]) return false;
  }
  return true;
}

// ================== PROVIDER: EQURAN.ID (default) ==================
/**
 * equran.id memakai Provinsi + Kabupaten/Kota (bukan lat/long) dan mengembalikan
 * jadwal SATU BULAN PENUH dalam satu request - jauh lebih hemat & tidak rawan
 * rate-limit dibanding memanggil API per-hari (lihat masalah Aladhan sebelumnya).
 */
function fetchMonthlyScheduleFromEquran_(year, month) {
  try {
    var provinsi = getSetting('prayer_provinsi', '');
    var kabkota = getSetting('prayer_kabkota', '');
    if (!provinsi || !kabkota) {
      _lastPrayerApiError = 'Provinsi/Kabupaten-Kota belum diisi di menu Settings > Jadwal Shalat.';
      return null;
    }
    var resp = UrlFetchApp.fetch('https://equran.id/api/v2/shalat', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ provinsi: provinsi, kabkota: kabkota, bulan: month, tahun: year }),
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      _lastPrayerApiError = 'HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 250);
      return null;
    }
    var json = JSON.parse(resp.getContentText());
    // Struktur asli: { code, message, data: { provinsi, kabkota, bulan, tahun, jadwal: [...] } }
    // - array harian ada di data.jadwal, BUKAN di data langsung.
    var list = json && json.data && (json.data.jadwal || json.data.data);
    if (!list) list = json && (json.data || json.result || json.results);
    if (!list || !Array.isArray(list) || list.length === 0) {
      _lastPrayerApiError = 'Response equran.id tidak berisi data array jadwal: ' + resp.getContentText().substring(0, 250);
      return null;
    }
    return list;
  } catch (e) {
    _lastPrayerApiError = String(e);
    return null;
  }
}

function findFieldCI_(obj, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    if (obj[candidates[i]] !== undefined && obj[candidates[i]] !== null && obj[candidates[i]] !== '') return String(obj[candidates[i]]);
  }
  var keys = Object.keys(obj);
  for (var j = 0; j < candidates.length; j++) {
    var lower = candidates[j].toLowerCase();
    var match = keys.filter(function (k) { return k.toLowerCase() === lower; })[0];
    if (match && obj[match]) return String(obj[match]);
  }
  return '';
}

function extractHm_(raw) {
  var m = String(raw || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (pad2_(Number(m[1])) + ':' + m[2]) : '';
}

function extractDayNumber_(entry) {
  var raw = findFieldCI_(entry, ['tanggal', 'date', 'hari']);
  var m = String(raw || '').match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

function mapEquranEntry_(entry) {
  return {
    imsak: extractHm_(findFieldCI_(entry, ['imsak'])),
    subuh: extractHm_(findFieldCI_(entry, ['subuh', 'shubuh'])),
    terbit: extractHm_(findFieldCI_(entry, ['terbit', 'syuruq', 'sunrise'])),
    dzuhur: extractHm_(findFieldCI_(entry, ['dzuhur', 'dhuhur', 'zuhur'])),
    ashar: extractHm_(findFieldCI_(entry, ['ashar', 'asar'])),
    maghrib: extractHm_(findFieldCI_(entry, ['maghrib'])),
    isya: extractHm_(findFieldCI_(entry, ['isya', 'isyak']))
  };
}

/**
 * Ambil 1 bulan penuh dari equran.id lalu simpan/perbarui tiap tanggal yang belum ada
 * di sheet. Dipanggil sekali saja per bulan (hemat kuota), bukan per-hari.
 */
function fetchAndStoreMonthFromEquran_(year, month, correction) {
  var list = fetchMonthlyScheduleFromEquran_(year, month);
  if (!list) return false;
  var savedAny = false;
  list.forEach(function (entry) {
    var day = extractDayNumber_(entry);
    if (!day) return;
    var entryYmd = year + '-' + pad2_(month) + '-' + pad2_(day);
    var already = findBy(SHEETS.PRAYER_SCHEDULES, function (r) { return r.date === entryYmd; })[0];
    if (already) return;
    var mapped = mapEquranEntry_(entry);
    if (!isSanePrayerTimes_(mapped)) return;
    var record = { date: entryYmd, source: 'equran', correction_minutes: correction };
    PRAYER_KEYS.forEach(function (k) { record[k] = applyCorrection_(mapped[k] || '', correction); });
    insert(SHEETS.PRAYER_SCHEDULES, record);
    savedAny = true;
  });
  if (!savedAny) _lastPrayerApiError = _lastPrayerApiError || 'Data dari equran.id tidak ada yang valid untuk bulan ini: ' + JSON.stringify(list[0] || {});
  return savedAny;
}

/**
 * Fungsi debug: jalankan manual dari editor Apps Script untuk melihat mentah response
 * equran.id (daftar provinsi, kabupaten/kota, dan jadwal bulanan) lewat Execution log,
 * supaya pemetaan field bisa dikoreksi kalau formatnya ternyata beda dari dugaan.
 */
function testEquranProvinsi() {
  var resp = UrlFetchApp.fetch('https://equran.id/api/v2/shalat/provinsi', { muteHttpExceptions: true });
  Logger.log('HTTP Status: ' + resp.getResponseCode());
  Logger.log('Body: ' + resp.getContentText().substring(0, 3000));
}

function testEquranKabkota(provinsiName) {
  var resp = UrlFetchApp.fetch('https://equran.id/api/v2/shalat/kabkota', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ provinsi: provinsiName }), muteHttpExceptions: true
  });
  Logger.log('HTTP Status: ' + resp.getResponseCode());
  Logger.log('Body: ' + resp.getContentText().substring(0, 3000));
}

function testEquranJadwal() {
  var provinsi = getSetting('prayer_provinsi', '');
  var kabkota = getSetting('prayer_kabkota', '');
  var now = new Date();
  Logger.log('provinsi=' + provinsi + ' kabkota=' + kabkota);
  var resp = UrlFetchApp.fetch('https://equran.id/api/v2/shalat', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ provinsi: provinsi, kabkota: kabkota, bulan: now.getMonth() + 1, tahun: now.getFullYear() }),
    muteHttpExceptions: true
  });
  Logger.log('HTTP Status: ' + resp.getResponseCode());
  Logger.log('Body: ' + resp.getContentText().substring(0, 3000));
}

/**
 * Normalisasi list dari equran.id (bisa berupa array string, atau array object dengan
 * field nama yang tidak pasti) jadi format {value,label} yang konsisten untuk dropdown.
 */
function normalizeNameList_(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (item) {
    if (typeof item === 'string') return { value: item, label: item };
    var name = item.nama || item.name || item.provinsi || item.kabkota || item.kabupaten || item.kota || JSON.stringify(item);
    return { value: name, label: name };
  }).filter(function (item) { return item.value; });
}

function apiGetEquranProvinsiList(params, token) {
  requirePermission_(token, 'settings');
  var cache = CacheService.getScriptCache();
  var cached = cache.get('equran_provinsi_list');
  if (cached !== null) return JSON.parse(cached);

  var resp = UrlFetchApp.fetch('https://equran.id/api/v2/shalat/provinsi', { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new AppError('Gagal mengambil daftar provinsi dari equran.id (HTTP ' + resp.getResponseCode() + ').');
  var json = JSON.parse(resp.getContentText());
  var list = normalizeNameList_(json && json.data);
  cache.put('equran_provinsi_list', JSON.stringify(list), 21600); // 6 jam, data ini jarang berubah
  return list;
}

function apiGetEquranKabkotaList(params, token) {
  requirePermission_(token, 'settings');
  requireFields_(params, ['provinsi']);
  var cache = CacheService.getScriptCache();
  var cacheKey = 'equran_kabkota_' + params.provinsi;
  var cached = cache.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);

  var resp = UrlFetchApp.fetch('https://equran.id/api/v2/shalat/kabkota', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ provinsi: params.provinsi }), muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new AppError('Gagal mengambil daftar kabupaten/kota dari equran.id (HTTP ' + resp.getResponseCode() + ').');
  var json = JSON.parse(resp.getContentText());
  var list = normalizeNameList_(json && json.data);
  cache.put(cacheKey, JSON.stringify(list), 21600);
  return list;
}

function applyCorrection_(hm, minutes) {
  if (!minutes) return hm;
  var parts = hm.split(':');
  var d = new Date(2000, 0, 1, Number(parts[0]), Number(parts[1]));
  d.setMinutes(d.getMinutes() + Number(minutes));
  return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
}

/**
 * Ambil jadwal shalat harian: dari cache sheet jika ada, kalau tidak fetch API lalu simpan.
 * Jika API gagal dan tidak ada cache untuk tanggal ini, gunakan jadwal cache terakhir yang tersedia (fallback).
 */
function getDailyPrayerTimes(dateStr) {
  var ymd = formatDateYmd_(requireDate_(dateStr, 'Tanggal'));
  var existing = findBy(SHEETS.PRAYER_SCHEDULES, function (r) { return r.date === ymd; })[0];
  if (existing) return existing;

  var provider = getSetting('prayer_provider', 'equran');
  var correction = Number(getSetting('prayer_correction_minutes', '0')) || 0;
  var dp = ymd.split('-');
  var year = Number(dp[0]), month = Number(dp[1]);

  if (provider === 'equran') {
    // Satu request mengisi SELURUH bulan sekaligus, jadi hemat & tidak kena rate-limit.
    if (fetchAndStoreMonthFromEquran_(year, month, correction)) {
      var justSaved = findBy(SHEETS.PRAYER_SCHEDULES, function (r) { return r.date === ymd; })[0];
      if (justSaved) return justSaved;
    }
  } else {
    var lat = getSetting('latitude', '-6.200000');
    var lng = getSetting('longitude', '106.816666');
    var method = getSetting('prayer_method', '2');
    // Server Aladhan kadang gangguan sesaat (503 / data tidak masuk akal). Coba ulang
    // beberapa kali dengan jeda sebelum benar-benar menyerah ke fallback/unavailable.
    var fetched = null;
    for (var attempt = 1; attempt <= 3 && !fetched; attempt++) {
      fetched = fetchPrayerTimesFromApi_(new Date(ymd), lat, lng, method);
      if (!fetched && attempt < 3) Utilities.sleep(800 * attempt);
    }
    if (fetched) {
      var record = { date: ymd, source: 'api', correction_minutes: correction };
      PRAYER_KEYS.forEach(function (k) { record[k] = applyCorrection_(fetched[k], correction); });
      return insert(SHEETS.PRAYER_SCHEDULES, record);
    }
  }

  // Fallback: gunakan jadwal tersimpan terakhir yang ada (mendekati tanggal ini)
  var all = getAll(SHEETS.PRAYER_SCHEDULES).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  if (all.length > 0) {
    var fallback = JSON.parse(JSON.stringify(all[0]));
    fallback.date = ymd;
    fallback.source = 'fallback:' + all[0].date;
    return fallback;
  }

  // API gagal diakses DAN belum ada cache sama sekali: jangan lempar error (akan membuat
  // seluruh halaman Jadwal Shalat/Display gagal total). Kembalikan template kosong agar
  // admin tetap bisa membuka menu Jadwal Shalat dan mengisinya secara manual. Pesan error asli
  // disertakan di `source` supaya admin bisa langsung lihat penyebabnya tanpa buka Execution log.
  return {
    date: ymd, imsak: '', subuh: '', terbit: '', dzuhur: '', ashar: '', maghrib: '', isya: '',
    source: 'unavailable: ' + (_lastPrayerApiError || 'tidak diketahui'), correction_minutes: correction
  };
}

function getMonthlyPrayerTimes(yearMonth) {
  var parts = yearMonth.split('-');
  var year = Number(parts[0]), month = Number(parts[1]);
  var daysInMonth = new Date(year, month, 0).getDate();
  var results = [];
  var isEquran = getSetting('prayer_provider', 'equran') === 'equran';
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = year + '-' + pad2_(month) + '-' + pad2_(d);
    results.push(getDailyPrayerTimes(dateStr));
    // Jeda hanya perlu untuk provider per-hari (Aladhan). equran.id sudah 1x request/bulan.
    if (!isEquran) Utilities.sleep(350);
  }
  return results;
}

function apiGetPrayerSchedule(params) {
  var dateStr = params.date || formatDateYmd_(new Date());
  return getDailyPrayerTimes(dateStr);
}

function apiGetMonthlyPrayerSchedule(params, token) {
  requirePermission_(token, 'prayer');
  return getMonthlyPrayerTimes(params.month || formatDateYmd_(new Date()).substring(0, 7));
}

function apiUpdatePrayerScheduleManual(data, token) {
  var ctx = requirePermission_(token, 'prayer');
  requireFields_(data, ['date']);
  var ymd = formatDateYmd_(requireDate_(data.date, 'Tanggal'));
  var existing = findBy(SHEETS.PRAYER_SCHEDULES, function (r) { return r.date === ymd; })[0];
  var patch = { source: 'manual' };
  PRAYER_KEYS.forEach(function (k) { if (data[k] !== undefined) patch[k] = data[k]; });

  var result;
  if (existing) {
    result = update(SHEETS.PRAYER_SCHEDULES, existing.id, patch);
  } else {
    patch.date = ymd;
    result = insert(SHEETS.PRAYER_SCHEDULES, patch);
  }
  logAudit(ctx.user_id, 'update', 'prayer', existing ? existing.id : result.id, 'Koreksi manual jadwal shalat ' + ymd);
  return result;
}

/**
 * Hitung shalat berikutnya dari sebuah jadwal harian + waktu sekarang (Date object).
 * Jika seluruh waktu hari ini sudah lewat, kembalikan Subuh dari jadwal besok (perlu dipanggil terpisah oleh client
 * atau backend akan otomatis fetch tanggal berikutnya).
 */
function getNextPrayer_(schedule, now) {
  var tz = getSetting('timezone', DEFAULT_TIMEZONE);
  var nowHm = formatTimeHm_(now, tz);
  var order = [
    { key: 'subuh', label: 'Subuh' },
    { key: 'dzuhur', label: 'Dzuhur' },
    { key: 'ashar', label: 'Ashar' },
    { key: 'maghrib', label: 'Maghrib' },
    { key: 'isya', label: 'Isya' }
  ];
  for (var i = 0; i < order.length; i++) {
    if (schedule[order[i].key] > nowHm) {
      return { name: order[i].label, time: schedule[order[i].key], date: schedule.date };
    }
  }
  // semua waktu hari ini sudah lewat -> subuh besok
  var tomorrow = new Date(new Date(schedule.date).getTime() + 24 * 60 * 60 * 1000);
  var tomorrowSchedule = getDailyPrayerTimes(formatDateYmd_(tomorrow));
  return { name: 'Subuh', time: tomorrowSchedule.subuh, date: tomorrowSchedule.date };
}

function apiGetNextPrayer(params) {
  var today = formatDateYmd_(new Date());
  var schedule = getDailyPrayerTimes(today);
  return getNextPrayer_(schedule, new Date());
}

// ================== IMAM / KHATIB SCHEDULES ==================
function apiGetImamSchedules(params, token) {
  requirePermission_(token, 'imam');
  var rows = getAll(SHEETS.IMAM_SCHEDULES).map(function (r) { delete r.__row; return r; });
  if (params.prayer_type) rows = rows.filter(function (r) { return r.prayer_type === params.prayer_type; });
  if (params.start_date || params.end_date) rows = rows.filter(function (r) { return inDateRange_(r.date, params.start_date, params.end_date); });
  rows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return paginate_(rows, params.page, params.pageSize);
}

function validateImamScheduleInput_(data) {
  requireFields_(data, ['date', 'prayer_type']);
  requireEnum_(data.prayer_type, PRAYER_TYPES, 'Jenis shalat');
  requireDate_(data.date, 'Tanggal');
}

function apiCreateImamSchedule(data, token) {
  var ctx = requirePermission_(token, 'imam');
  validateImamScheduleInput_(data);
  var record = insert(SHEETS.IMAM_SCHEDULES, {
    date: formatDateYmd_(requireDate_(data.date, 'Tanggal')),
    prayer_type: data.prayer_type,
    imam: sanitizeString_(data.imam || ''),
    khatib: sanitizeString_(data.khatib || ''),
    muadzin: sanitizeString_(data.muadzin || ''),
    topic: sanitizeString_(data.topic || ''),
    notes: sanitizeString_(data.notes || '')
  });
  logAudit(ctx.user_id, 'create', 'imam', record.id, 'Jadwal ' + record.prayer_type + ' ' + record.date);
  return record;
}

function apiUpdateImamSchedule(id, data, token) {
  var ctx = requirePermission_(token, 'imam');
  var existing = findById(SHEETS.IMAM_SCHEDULES, id);
  if (!existing) throw new AppError('Jadwal imam tidak ditemukan.');
  var patch = {};
  ['prayer_type', 'imam', 'khatib', 'muadzin', 'topic', 'notes'].forEach(function (f) {
    if (data[f] !== undefined) patch[f] = f === 'prayer_type' ? data[f] : sanitizeString_(data[f]);
  });
  if (data.date !== undefined) patch.date = formatDateYmd_(requireDate_(data.date, 'Tanggal'));
  var updated = update(SHEETS.IMAM_SCHEDULES, id, patch);
  logAudit(ctx.user_id, 'update', 'imam', id, 'Mengubah jadwal imam');
  return updated;
}

function apiDeleteImamSchedule(id, token) {
  var ctx = requirePermission_(token, 'imam');
  if (!remove(SHEETS.IMAM_SCHEDULES, id)) throw new AppError('Jadwal imam tidak ditemukan.');
  logAudit(ctx.user_id, 'delete', 'imam', id, 'Menghapus jadwal imam');
  return true;
}

/**
 * Jadwal Jumat untuk hari ini (dipakai Display JUMAT mode).
 */
function getTodayFridaySchedule_() {
  var today = formatDateYmd_(new Date());
  return findBy(SHEETS.IMAM_SCHEDULES, function (r) { return r.date === today && r.prayer_type === 'Jumat'; })[0] || null;
}

// ================== HIJRI DATE ==================
/**
 * HijriService sederhana: memakai algoritma konversi Umm al-Qura aproksimasi (Kuwaiti algorithm),
 * cukup akurat untuk tampilan display tanpa bergantung API eksternal (fallback selalu tersedia secara lokal).
 */
var HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Awal', 'Jumadil Akhir',
  'Rajab', "Sya'ban", 'Ramadhan', 'Syawal', "Dzulqa'dah", 'Dzulhijjah'];

function gregorianToHijri_(date) {
  var jd = Math.floor((date.getTime() / 86400000) + 2440587.5 + 0.5);
  var l = jd - 1948440 + 10632;
  var n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  var j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  var month = Math.floor((24 * l) / 709);
  var day = l - Math.floor((709 * month) / 24);
  var year = 30 * n + j - 30;
  return { day: day, month: month, year: year };
}

function getHijriDateString_(date) {
  try {
    var h = gregorianToHijri_(date || new Date());
    var monthName = HIJRI_MONTHS[(h.month - 1 + 12) % 12];
    return h.day + ' ' + monthName + ' ' + h.year + ' H';
  } catch (e) {
    return '';
  }
}

function apiGetHijriDate(params) {
  var date = params && params.date ? new Date(params.date) : new Date();
  return { hijri: getHijriDateString_(date) };
}
