/**
 * Display.gs
 * Backend untuk Digital Signage: pengaturan display, playlist slide, mode darurat,
 * heartbeat/monitoring, dan endpoint gabungan (bundle) yang dipakai DisplayEngine di client.
 *
 * Catatan arsitektur (lihat butir 81): TIDAK ada WebSocket/realtime. Client melakukan
 * polling berkala + jam lokal yang disinkronkan lewat server time offset (butir 82).
 */

var DISPLAY_SETTING_DEFAULTS = {
  slide_duration_seconds: '10',
  countdown_trigger_minutes: '15',
  prayer_mode_duration_minutes: '5',
  announcement_duration_seconds: '15',
  event_duration_seconds: '15',
  ticker_speed: 'normal',
  show_hijri: 'true',
  show_weather: 'false',
  show_donation: 'true',
  show_agenda: 'true',
  show_announcement: 'true',
  show_financial_summary: 'false',
  theme: 'emerald',
  auto_refresh_seconds: '30',
  emergency_active: 'false',
  emergency_message: ''
};

function ensureDisplaySettingDefaults_() {
  var current = getAllDisplaySettings();
  Object.keys(DISPLAY_SETTING_DEFAULTS).forEach(function (k) {
    if (current[k] === undefined) setDisplaySetting(k, DISPLAY_SETTING_DEFAULTS[k]);
  });
}

function apiGetDisplaySettings(token) {
  requirePermission_(token, 'display');
  ensureDisplaySettingDefaults_();
  return getAllDisplaySettings();
}

function apiGetPublicDisplaySettings() {
  ensureDisplaySettingDefaults_();
  return getAllDisplaySettings();
}

function apiUpdateDisplaySettings(data, token) {
  var ctx = requirePermission_(token, 'display');
  Object.keys(data).forEach(function (key) {
    if (DISPLAY_SETTING_DEFAULTS.hasOwnProperty(key) || key.indexOf('emergency') === 0) {
      setDisplaySetting(key, data[key]);
    }
  });
  logAudit(ctx.user_id, 'display_change', 'display_settings', '', 'Mengubah pengaturan display');
  return getAllDisplaySettings();
}

function apiSetEmergency(data, token) {
  var ctx = requirePermission_(token, 'display');
  var active = (data.active === true || data.active === 'true');
  setDisplaySetting('emergency_active', active ? 'true' : 'false');
  setDisplaySetting('emergency_message', active ? sanitizeString_(data.message || '') : '');
  logAudit(ctx.user_id, 'display_change', 'display_settings', '', active ? 'Mengaktifkan mode darurat' : 'Menonaktifkan mode darurat');
  return { emergency_active: active, emergency_message: active ? data.message : '' };
}

// ================== PLAYLIST (display_schedules) ==================
function apiGetPlaylist(params, token) {
  requirePermission_(token, 'display');
  var rows = getAll(SHEETS.DISPLAY_SCHEDULES).map(function (r) { delete r.__row; return r; });
  rows.sort(function (a, b) { return (Number(a.order_index) || 0) - (Number(b.order_index) || 0); });
  return rows;
}

function apiGetActivePlaylist() {
  var rows = getAll(SHEETS.DISPLAY_SCHEDULES).filter(function (r) { return r.is_active === true; })
    .map(function (r) { delete r.__row; return r; });
  rows.sort(function (a, b) { return (Number(a.order_index) || 0) - (Number(b.order_index) || 0); });
  return rows;
}

function apiCreatePlaylistItem(data, token) {
  var ctx = requirePermission_(token, 'display');
  requireFields_(data, ['name', 'slide_type']);
  var record = insert(SHEETS.DISPLAY_SCHEDULES, {
    name: sanitizeString_(data.name),
    slide_type: data.slide_type,
    order_index: data.order_index !== undefined ? Number(data.order_index) : 99,
    duration_seconds: data.duration_seconds !== undefined ? Number(data.duration_seconds) : 10,
    is_active: data.is_active !== false,
    config_json: data.config_json || '{}'
  });
  logAudit(ctx.user_id, 'create', 'display_schedules', record.id, 'Menambah slide playlist: ' + record.name);
  return record;
}

function apiUpdatePlaylistItem(id, data, token) {
  var ctx = requirePermission_(token, 'display');
  var patch = {};
  ['name', 'slide_type', 'config_json'].forEach(function (f) { if (data[f] !== undefined) patch[f] = data[f]; });
  if (data.order_index !== undefined) patch.order_index = Number(data.order_index);
  if (data.duration_seconds !== undefined) patch.duration_seconds = Number(data.duration_seconds);
  if (data.is_active !== undefined) patch.is_active = (data.is_active === true || data.is_active === 'true');
  var updated = update(SHEETS.DISPLAY_SCHEDULES, id, patch);
  if (!updated) throw new AppError('Slide tidak ditemukan.');
  logAudit(ctx.user_id, 'update', 'display_schedules', id, 'Mengubah slide playlist');
  return updated;
}

function apiDeletePlaylistItem(id, token) {
  var ctx = requirePermission_(token, 'display');
  if (!remove(SHEETS.DISPLAY_SCHEDULES, id)) throw new AppError('Slide tidak ditemukan.');
  logAudit(ctx.user_id, 'delete', 'display_schedules', id, 'Menghapus slide playlist');
  return true;
}

// ================== HEARTBEAT / MONITORING ==================
/**
 * Dipanggil oleh Display.html secara berkala (mis. setiap 30 detik) tanpa perlu login,
 * agar admin dashboard tahu status TV: ONLINE/OFFLINE, state saat ini, next prayer.
 */
function apiDisplayHeartbeat(data) {
  var payload = {
    last_ping: nowIso_(),
    current_state: data.state || 'NORMAL',
    current_prayer: data.current_prayer || '',
    next_prayer: data.next_prayer || '',
    next_prayer_time: data.next_prayer_time || '',
    display_id: data.display_id || 'main'
  };
  setDisplaySetting('_hb_last_ping', payload.last_ping);
  setDisplaySetting('_hb_current_state', payload.current_state);
  setDisplaySetting('_hb_current_prayer', payload.current_prayer);
  setDisplaySetting('_hb_next_prayer', payload.next_prayer);
  setDisplaySetting('_hb_next_prayer_time', payload.next_prayer_time);
  return { ok: true };
}

function apiGetDisplayStatus(token) {
  requirePermission_(token, 'display');
  var lastPing = getDisplaySetting('_hb_last_ping', null);
  var isOnline = false;
  if (lastPing) {
    isOnline = (Date.now() - new Date(lastPing).getTime()) < HEARTBEAT_OFFLINE_THRESHOLD_MS;
  }
  return {
    online: isOnline,
    last_ping: lastPing,
    current_state: getDisplaySetting('_hb_current_state', 'NORMAL'),
    current_prayer: getDisplaySetting('_hb_current_prayer', ''),
    next_prayer: getDisplaySetting('_hb_next_prayer', ''),
    next_prayer_time: getDisplaySetting('_hb_next_prayer_time', '')
  };
}

// ================== DISPLAY BUNDLE (payload utama untuk client DisplayEngine) ==================
/**
 * Mengumpulkan seluruh data yang dibutuhkan DisplayEngine dalam SATU request,
 * supaya client cukup polling endpoint ini secara berkala (lihat butir 80).
 * Prioritas mode ditentukan di client (DisplayEngine.getCurrentState), backend
 * hanya menyediakan data mentah agar countdown tetap presisi per detik secara lokal.
 */
function apiGetDisplayBundle() {
  ensureDisplaySettingDefaults_();
  var tz = getSetting('timezone', DEFAULT_TIMEZONE);
  var now = new Date();
  var today = formatDateYmd_(now, tz);

  var schedule = getDailyPrayerTimes(today);
  var nextPrayer = getNextPrayer_(schedule, now);
  var fridaySchedule = (now.getDay() === 5) ? getTodayFridaySchedule_() : null;
  var ongoingEvent = getOngoingEvent_();
  var upcomingEvents = getUpcomingEvents_(5);

  var announcements = getActiveAnnouncements_();
  var urgentAnnouncement = announcements.filter(function (a) { return a.priority === 'high' || a.priority === 'urgent'; })[0] || null;

  var settings = getAllSettings();
  var displaySettings = getAllDisplaySettings();
  var playlist = apiGetActivePlaylist();
  var campaigns = getAll(SHEETS.CAMPAIGNS).filter(function (c) { return c.is_public === true && c.status === 'active'; })
    .map(function (c) { delete c.__row; return c; });

  return {
    serverTime: now.toISOString(),
    timezone: tz,
    hijri: getHijriDateString_(now),
    mosque: {
      name: settings.mosque_name || 'Masjid',
      address: settings.mosque_address || '',
      logo_url: settings.logo_url || ''
    },
    prayerSchedule: schedule,
    nextPrayer: nextPrayer,
    fridaySchedule: fridaySchedule,
    ongoingEvent: ongoingEvent,
    upcomingEvents: upcomingEvents,
    announcements: announcements.slice(0, 10),
    urgentAnnouncement: urgentAnnouncement,
    campaigns: campaigns,
    displaySettings: displaySettings,
    playlist: playlist,
    emergency: {
      active: displaySettings.emergency_active === 'true' || displaySettings.emergency_active === true,
      message: displaySettings.emergency_message || ''
    }
  };
}
