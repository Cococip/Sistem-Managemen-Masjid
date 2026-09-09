/**
 * Config.gs
 * Konfigurasi konstanta global aplikasi Masjid Management System.
 * Kredensial sensitif (SPREADSHEET_ID, SECRET_KEY) TIDAK disimpan di sini,
 * melainkan di Script Properties (File > Project Properties > Script Properties
 * atau lewat fungsi setupScriptProperties() di Setup.gs).
 */

// ================== SHEET NAMES ==================
var SHEETS = {
  SETTINGS: 'settings',
  USERS: 'users',
  ROLES: 'roles',
  ANNOUNCEMENTS: 'announcements',
  EVENTS: 'events',
  PRAYER_SCHEDULES: 'prayer_schedules',
  IMAM_SCHEDULES: 'imam_schedules',
  INCOME: 'income',
  EXPENSES: 'expenses',
  FUND_SOURCES: 'fund_sources',
  FINANCE_CATEGORIES: 'finance_categories',
  DONATIONS: 'donations',
  CAMPAIGNS: 'campaigns',
  INVENTORY: 'inventory',
  JAMAAH: 'jamaah',
  SOCIAL_PROGRAMS: 'social_programs',
  DOCUMENTS: 'documents',
  DISPLAY_SETTINGS: 'display_settings',
  DISPLAY_SCHEDULES: 'display_schedules',
  AUDIT_LOGS: 'audit_logs',
  SESSIONS: 'sessions'
};

// ================== ID PREFIXES ==================
var ID_PREFIX = {
  users: 'USR',
  roles: 'ROL',
  announcements: 'ANN',
  events: 'EVT',
  prayer_schedules: 'PRY',
  imam_schedules: 'IMK',
  income: 'INC',
  expenses: 'EXP',
  fund_sources: 'FND',
  finance_categories: 'CAT',
  donations: 'DON',
  campaigns: 'CMP',
  inventory: 'INV',
  jamaah: 'JMH',
  social_programs: 'SOC',
  documents: 'DOC',
  display_schedules: 'DSP',
  audit_logs: 'LOG',
  sessions: 'SES'
};

// ================== ROLES & PERMISSIONS ==================
var ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  TREASURER: 'TREASURER',
  OPERATOR: 'OPERATOR'
};

// module -> list of roles allowed. SUPER_ADMIN always implicitly allowed everywhere.
var PERMISSION_MATRIX = {
  dashboard: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.TREASURER, ROLES.OPERATOR],
  finance: [ROLES.SUPER_ADMIN, ROLES.TREASURER],
  announcement: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPERATOR],
  event: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPERATOR],
  prayer: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPERATOR],
  imam: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPERATOR],
  inventory: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  jamaah: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  donation: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.TREASURER],
  social_program: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  documents: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  display: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPERATOR],
  users: [ROLES.SUPER_ADMIN],
  audit: [ROLES.SUPER_ADMIN],
  settings: [ROLES.SUPER_ADMIN, ROLES.ADMIN]
};

// ================== DEFAULT CATEGORY DATA ==================
var DEFAULT_INCOME_CATEGORIES = [
  'Kotak Amal', 'Infak', 'Sedekah', 'Donasi', 'Wakaf', 'Transfer', 'Sponsor', 'Kegiatan', 'Lainnya'
];

var DEFAULT_EXPENSE_CATEGORIES = [
  'Listrik', 'Air', 'Internet', 'Kebersihan', 'Keamanan', 'Honor Imam', 'Honor Ustadz',
  'Operasional', 'Pembangunan', 'Renovasi', 'Kegiatan', 'Konsumsi', 'ATK', 'Sosial', 'Lainnya'
];

var DEFAULT_FUND_SOURCES = [
  'Kas Umum', 'Dana Jumat', 'Dana Pembangunan', 'Dana Sosial', 'Dana Wakaf', 'Dana Yatim', 'Dana Ramadhan', 'Dana Qurban'
];

var PAYMENT_METHODS = ['cash', 'transfer', 'qris', 'bank', 'lainnya'];
var TRANSACTION_STATUS = ['pending', 'verified', 'rejected'];

var ANNOUNCEMENT_CATEGORIES = ['Umum', 'Kegiatan', 'Donasi', 'Kajian', 'Kematian', 'Kehilangan', 'Pemberitahuan', 'Lainnya'];
var EVENT_CATEGORIES = ['Kajian', 'Pengajian', 'Rapat', 'Kegiatan Sosial', 'Santunan', 'Buka Bersama', 'Ramadhan', 'Idul Fitri', 'Idul Adha', 'Lainnya'];
var PRAYER_TYPES = ['Subuh', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya', 'Jumat', 'Tarawih', 'Witir', 'Idul Fitri', 'Idul Adha'];
var INVENTORY_CONDITIONS = ['Baik', 'Rusak Ringan', 'Rusak Berat', 'Hilang'];

// ================== DISPLAY ENGINE ==================
var DISPLAY_STATES = {
  EMERGENCY: 'EMERGENCY',
  PRAYER: 'PRAYER',
  JUMAT: 'JUMAT',
  EVENT: 'EVENT',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  COUNTDOWN: 'COUNTDOWN',
  NORMAL: 'NORMAL'
};

var DISPLAY_STATE_PRIORITY = [
  DISPLAY_STATES.EMERGENCY,
  DISPLAY_STATES.PRAYER,
  DISPLAY_STATES.JUMAT,
  DISPLAY_STATES.EVENT,
  DISPLAY_STATES.ANNOUNCEMENT,
  DISPLAY_STATES.COUNTDOWN,
  DISPLAY_STATES.NORMAL
];

// ================== SYSTEM DEFAULTS ==================
var DEFAULT_TIMEZONE = 'Asia/Jakarta';
var SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 jam
var HEARTBEAT_OFFLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 menit dianggap offline
var CACHE_TTL_SETTINGS = 300; // detik
var CACHE_TTL_PRAYER = 3600; // detik

/**
 * Ambil Script Properties penting. Dipanggil oleh Database.gs saat membuka Spreadsheet.
 */
function getScriptProps_() {
  var props = PropertiesService.getScriptProperties();
  return {
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID'),
    SECRET_KEY: props.getProperty('SECRET_KEY') || 'CHANGE_ME_SECRET_KEY',
    PRAYER_API_BASE: props.getProperty('PRAYER_API_BASE') || 'https://api.aladhan.com/v1'
  };
}
