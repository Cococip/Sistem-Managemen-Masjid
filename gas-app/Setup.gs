/**
 * Setup.gs
 * Fungsi instalasi: setupDatabase(), seedDemoData(), backupDatabase().
 * Jalankan manual sekali dari editor Apps Script (lihat README) setelah paste seluruh source code.
 */

/**
 * Membuat seluruh sheet (jika belum ada) beserta header, dan mengisi data referensi default
 * (roles, fund sources, kategori keuangan, settings, display settings) HANYA jika sheet terkait
 * masih kosong. Aman dijalankan berulang kali tanpa menghapus data yang sudah ada (lihat butir 74).
 */
function setupDatabase() {
  SHEET_ORDER.forEach(function (name) { getSheet(name); });
  ensureDateColumnsFormatted_();

  // Hapus sheet default "Sheet1" bawaan Google Spreadsheet jika masih kosong dan sheet lain sudah ada.
  var ss = getSpreadsheet_();
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  seedReferenceDataIfEmpty_();
  return { status: 'ok', message: 'Database siap.', spreadsheetUrl: ss.getUrl() };
}

function seedReferenceDataIfEmpty_() {
  // Roles
  if (getAll(SHEETS.ROLES).length === 0) {
    var sheet = getSheet(SHEETS.ROLES);
    sheet.appendRow([ROLES.SUPER_ADMIN, 'Super Admin', 'Akses penuh ke seluruh sistem', nowIso_()]);
    sheet.appendRow([ROLES.ADMIN, 'Admin', 'Mengelola pengumuman, agenda, jadwal, display, inventaris, jamaah', nowIso_()]);
    sheet.appendRow([ROLES.TREASURER, 'Bendahara', 'Mengelola pemasukan, pengeluaran, laporan keuangan', nowIso_()]);
    sheet.appendRow([ROLES.OPERATOR, 'Operator', 'Mengelola pengumuman, agenda, jadwal imam, display', nowIso_()]);
  }

  // Fund sources
  if (getAll(SHEETS.FUND_SOURCES).length === 0) {
    DEFAULT_FUND_SOURCES.forEach(function (name) {
      insert(SHEETS.FUND_SOURCES, { name: name, description: '', status: 'active' });
    });
  }

  // Finance categories
  if (getAll(SHEETS.FINANCE_CATEGORIES).length === 0) {
    DEFAULT_INCOME_CATEGORIES.forEach(function (name) {
      insert(SHEETS.FINANCE_CATEGORIES, { name: name, type: 'income', description: '', status: 'active' });
    });
    DEFAULT_EXPENSE_CATEGORIES.forEach(function (name) {
      insert(SHEETS.FINANCE_CATEGORIES, { name: name, type: 'expense', description: '', status: 'active' });
    });
  }

  // Settings
  if (getAll(SHEETS.SETTINGS).length === 0) {
    setSetting('mosque_name', 'Masjid Al-Ikhlas', 'Nama masjid');
    setSetting('mosque_address', 'Jl. Contoh No. 1, Jakarta', 'Alamat masjid');
    setSetting('mosque_phone', '021-1234567', 'Telepon masjid');
    setSetting('mosque_email', 'info@masjid.org', 'Email masjid');
    setSetting('mosque_description', "Menjadi pusat ibadah, ilmu, dan pelayanan umat.", 'Deskripsi masjid');
    setSetting('logo_url', '', 'URL logo masjid');
    setSetting('latitude', '-6.200000', 'Latitude lokasi masjid');
    setSetting('longitude', '106.816666', 'Longitude lokasi masjid');
    setSetting('timezone', DEFAULT_TIMEZONE, 'Timezone');
    setSetting('prayer_provider', 'equran', 'Provider jadwal shalat: equran (equran.id) atau aladhan');
    setSetting('prayer_provinsi', '', 'Nama provinsi untuk equran.id (isi via menu Settings)');
    setSetting('prayer_kabkota', '', 'Nama kabupaten/kota untuk equran.id (isi via menu Settings)');
    setSetting('prayer_method', '2', 'Metode perhitungan jadwal shalat (khusus provider Aladhan)');
    setSetting('prayer_correction_minutes', '0', 'Koreksi manual menit jadwal shalat');
    setSetting('qibla_direction', '295', 'Arah kiblat (derajat dari utara)');
    setSetting('footer_text', '© Masjid Management System', 'Teks footer website');
    setSetting('currency', 'IDR', 'Mata uang');
    setSetting('date_format', 'DD MMMM YYYY', 'Format tanggal frontend');
  }

  // Display settings
  ensureDisplaySettingDefaults_();

  // Default super admin user jika belum ada user sama sekali
  if (getAll(SHEETS.USERS).length === 0) {
    insert(SHEETS.USERS, {
      name: 'Super Admin',
      username: 'admin',
      password_hash: makePasswordHash_('admin123'),
      role_id: ROLES.SUPER_ADMIN,
      phone: '', email: 'admin@masjid.org',
      status: 'active', last_login: ''
    });
  }
}

/**
 * Mengisi data CONTOH (demo) agar dashboard tidak kosong setelah instalasi (butir 60).
 * Aman dipanggil berkali-kali: hanya menambah jika sheet terkait masih kosong data contohnya
 * (ditandai deskripsi/prefix DEMO) - namun untuk kesederhanaan, cukup dijalankan SEKALI setelah setupDatabase().
 */
function seedDemoData() {
  seedReferenceDataIfEmpty_();

  var fundSources = getAll(SHEETS.FUND_SOURCES);
  var kasUmum = fundSources.filter(function (f) { return f.name === 'Kas Umum'; })[0] || fundSources[0];
  var danaPembangunan = fundSources.filter(function (f) { return f.name === 'Dana Pembangunan'; })[0] || fundSources[0];

  var categories = getAll(SHEETS.FINANCE_CATEGORIES);
  var catByName = function (name, type) {
    return categories.filter(function (c) { return c.name === name && c.type === type; })[0];
  };

  // Bendahara demo user
  var bendahara = findBy(SHEETS.USERS, function (u) { return u.username === 'bendahara'; })[0];
  if (!bendahara) {
    bendahara = insert(SHEETS.USERS, {
      name: 'Siti Bendahara', username: 'bendahara',
      password_hash: makePasswordHash_('bendahara123'),
      role_id: ROLES.TREASURER, phone: '081234567890', email: 'bendahara@masjid.org',
      status: 'active', last_login: ''
    });
  }
  var admin = findBy(SHEETS.USERS, function (u) { return u.username === 'admin'; })[0];

  // Pemasukan & pengeluaran demo (30 hari terakhir)
  if (getAll(SHEETS.INCOME).length === 0) {
    var incomeCat = catByName('Kotak Amal', 'income') || categories[0];
    var infakCat = catByName('Infak', 'income') || categories[0];
    for (var i = 0; i < 10; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i * 3);
      apiCreateIncomeInternal_({
        date: formatDateYmd_(d), category_id: (i % 2 === 0 ? incomeCat : infakCat).id,
        fund_source_id: kasUmum.id, amount: 500000 + i * 25000, payment_method: 'cash',
        payer: 'Jamaah', description: 'Kotak amal Jumat', is_public: true, status: 'verified'
      }, bendahara.id);
    }
  }
  if (getAll(SHEETS.EXPENSES).length === 0) {
    var listrikCat = catByName('Listrik', 'expense') || categories[0];
    var honorCat = catByName('Honor Imam', 'expense') || categories[0];
    for (var j = 0; j < 8; j++) {
      var d2 = new Date();
      d2.setDate(d2.getDate() - j * 4);
      apiCreateExpenseInternal_({
        date: formatDateYmd_(d2), category_id: (j % 2 === 0 ? listrikCat : honorCat).id,
        fund_source_id: kasUmum.id, amount: 300000 + j * 15000, payment_method: 'transfer',
        recipient: j % 2 === 0 ? 'PLN' : 'Ust. Ahmad', description: 'Operasional rutin', is_public: true, status: 'verified'
      }, bendahara.id);
    }
  }

  // Pengumuman demo
  if (getAll(SHEETS.ANNOUNCEMENTS).length === 0) {
    insert(SHEETS.ANNOUNCEMENTS, {
      title: 'Kajian Rutin Ahad Pagi', content: 'Kajian rutin akan dilaksanakan setiap Ahad pagi pukul 07.00 WIB bersama Ust. Ahmad.',
      category: 'Kajian', start_date: formatDateYmd_(new Date()), end_date: '', priority: 'normal',
      status: 'published', is_display: true, is_pinned: true, created_by: admin ? admin.id : ''
    });
    insert(SHEETS.ANNOUNCEMENTS, {
      title: 'Penggalangan Dana Renovasi Tempat Wudhu', content: 'Mari berpartisipasi dalam renovasi tempat wudhu masjid.',
      category: 'Donasi', start_date: formatDateYmd_(new Date()), end_date: '', priority: 'high',
      status: 'published', is_display: true, is_pinned: false, created_by: admin ? admin.id : ''
    });
  }

  // Agenda demo
  if (getAll(SHEETS.EVENTS).length === 0) {
    var d3 = new Date(); d3.setDate(d3.getDate() + 3);
    insert(SHEETS.EVENTS, {
      title: 'Kajian Fiqih Kehidupan', category: 'Kajian', date: formatDateYmd_(d3),
      start_time: '19:30', end_time: '21:00', location: 'Aula Masjid', speaker: 'Ust. Ahmad',
      description: 'Kajian rutin membahas fiqih kehidupan sehari-hari.', status: 'scheduled', is_display: true
    });
    insert(SHEETS.EVENTS, {
      title: 'Rapat Pengurus Bulanan', category: 'Rapat', date: formatDateYmd_(new Date()),
      start_time: '20:00', end_time: '21:30', location: 'Sekretariat Masjid', speaker: '',
      description: 'Evaluasi program bulanan.', status: 'scheduled', is_display: false
    });
  }

  // Jadwal Imam & Khatib demo
  if (getAll(SHEETS.IMAM_SCHEDULES).length === 0) {
    var nextFriday = new Date();
    nextFriday.setDate(nextFriday.getDate() + ((5 - nextFriday.getDay() + 7) % 7 || 7));
    insert(SHEETS.IMAM_SCHEDULES, {
      date: formatDateYmd_(nextFriday), prayer_type: 'Jumat', imam: 'Ust. Budi', khatib: 'Ust. Ahmad',
      muadzin: 'Bpk. Karim', topic: 'Menjaga Ukhuwah Islamiyah', notes: ''
    });
    insert(SHEETS.IMAM_SCHEDULES, {
      date: formatDateYmd_(new Date()), prayer_type: 'Subuh', imam: 'Ust. Budi', khatib: '',
      muadzin: 'Bpk. Karim', topic: '', notes: ''
    });
  }

  // Inventaris demo
  if (getAll(SHEETS.INVENTORY).length === 0) {
    insert(SHEETS.INVENTORY, {
      asset_code: 'AST-00001', name: 'Karpet Sajadah', category: 'Perlengkapan Ibadah', quantity: 20,
      condition: 'Baik', location: 'Ruang Utama', purchase_date: formatDateYmd_(new Date()),
      purchase_price: 5000000, fund_source: kasUmum.name, status: 'active', notes: ''
    });
    insert(SHEETS.INVENTORY, {
      asset_code: 'AST-00002', name: 'Sound System', category: 'Elektronik', quantity: 1,
      condition: 'Baik', location: 'Ruang Utama', purchase_date: formatDateYmd_(new Date()),
      purchase_price: 15000000, fund_source: danaPembangunan.name, status: 'active', notes: ''
    });
  }

  // Jamaah demo
  if (getAll(SHEETS.JAMAAH).length === 0) {
    insert(SHEETS.JAMAAH, { name: 'Ahmad Fauzi', gender: 'L', phone: '081111111111', address: 'RT 01/02', status: 'active', registered_at: nowIso_(), notes: '' });
    insert(SHEETS.JAMAAH, { name: 'Siti Aminah', gender: 'P', phone: '082222222222', address: 'RT 02/03', status: 'active', registered_at: nowIso_(), notes: '' });
  }

  // Campaign donasi demo
  if (getAll(SHEETS.CAMPAIGNS).length === 0) {
    insert(SHEETS.CAMPAIGNS, {
      title: 'Renovasi Tempat Wudhu', description: 'Penggalangan dana renovasi tempat wudhu agar lebih nyaman.',
      target_amount: 50000000, current_amount: 0, start_date: formatDateYmd_(new Date()), end_date: '',
      status: 'active', is_public: true, cover_url: ''
    });
  }

  return { status: 'ok', message: 'Data contoh berhasil dibuat.' };
}

// Helper internal agar seed tidak melalui requirePermission_ (tidak ada token saat seeding awal)
function apiCreateIncomeInternal_(data, userId) {
  validateTransactionInput_(data);
  var dateObj = requireDate_(data.date, 'Tanggal');
  return insert(SHEETS.INCOME, {
    transaction_number: generateTransactionNumber_('income', dateObj),
    date: formatDateYmd_(dateObj), category_id: data.category_id, fund_source_id: data.fund_source_id,
    amount: requirePositiveAmount_(data.amount), payment_method: data.payment_method,
    payer: data.payer || '', description: data.description || '', status: data.status || 'verified',
    is_public: !!data.is_public, created_by: userId
  });
}

function apiCreateExpenseInternal_(data, userId) {
  validateTransactionInput_(data);
  var dateObj = requireDate_(data.date, 'Tanggal');
  return insert(SHEETS.EXPENSES, {
    transaction_number: generateTransactionNumber_('expense', dateObj),
    date: formatDateYmd_(dateObj), category_id: data.category_id, fund_source_id: data.fund_source_id,
    amount: requirePositiveAmount_(data.amount), payment_method: data.payment_method,
    recipient: data.recipient || '', description: data.description || '', status: data.status || 'verified',
    is_public: !!data.is_public, created_by: userId
  });
}

/**
 * Membuat salinan (copy) Spreadsheet database sebagai backup, disimpan di folder Drive yang sama.
 * Bisa dijadwalkan lewat Trigger (Time-driven) agar berjalan otomatis, mis. harian.
 */
function backupDatabase() {
  var ss = getSpreadsheet_();
  var name = 'Backup - ' + ss.getName() + ' - ' + Utilities.formatDate(new Date(), DEFAULT_TIMEZONE, 'yyyy-MM-dd HH:mm');
  var file = DriveApp.getFileById(ss.getId()).makeCopy(name);
  return { fileId: file.getId(), url: file.getUrl(), name: name };
}

/**
 * Panggil sekali dari editor Apps Script untuk mengatur Script Properties penting
 * (dipakai jika menjalankan sebagai standalone script, bukan bound script).
 */
function setupScriptProperties(spreadsheetId, secretKey) {
  var props = PropertiesService.getScriptProperties();
  if (spreadsheetId) props.setProperty('SPREADSHEET_ID', spreadsheetId);
  props.setProperty('SECRET_KEY', secretKey || Utilities.getUuid());
  return { status: 'ok' };
}
