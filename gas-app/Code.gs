/**
 * Code.gs
 * Entry point Web App: doGet/doPost, routing action -> handler, dan helper include()
 * untuk menyusun halaman HTML dari beberapa partial (karena Apps Script HTML Service
 * tidak mendukung struktur folder seperti backend biasa, lihat butir 76).
 *
 * Kontrak API (lihat butir 51):
 *   GET  ?action=xxx&...params&token=...          -> { success, message, data }
 *   POST body JSON: { action, token, id, data }   -> { success, message, data }
 *
 * Catatan keamanan: Apps Script Web App tidak mengekspos header request kustom ke
 * doGet/doPost, sehingga token otorisasi dikirim sebagai parameter (query untuk GET,
 * body JSON untuk POST) alih-alih header Authorization. Selalu diakses lewat HTTPS
 * bawaan *.googleusercontent.com / script.google.com.
 */

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  try {
    e = e || {};
    var params = e.parameter || {};
    if (params.action) {
      var result = safeExecute_(function () {
        return successResponse_(routeGet_(params.action, params));
      });
      return jsonOutput_(result);
    }
    return renderPage_(params.page || 'public', params);
  } catch (err) {
    Logger.log('doGet fatal: ' + (err && err.stack ? err.stack : err));
    return jsonOutput_(errorResponse_('Terjadi masalah saat memproses permintaan.'));
  }
}

function doPost(e) {
  try {
    e = e || {};
    var body = {};
    if (e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (parseErr) { body = {}; }
    }
    var action = body.action || (e.parameter && e.parameter.action);
    var result = safeExecute_(function () {
      return successResponse_(routePost_(action, body));
    });
    return jsonOutput_(result);
  } catch (err) {
    Logger.log('doPost fatal: ' + (err && err.stack ? err.stack : err));
    return jsonOutput_(errorResponse_('Terjadi masalah saat memproses permintaan.'));
  }
}

function renderPage_(page, params) {
  var fileMap = {
    login: 'Login',
    admin: 'AdminApp',
    display: 'DisplayPage',
    public: 'Public',
    setup: 'SetupWizard'
  };
  var file = fileMap[page] || fileMap.public;
  var tmpl = HtmlService.createTemplateFromFile(file);
  tmpl.webAppUrl = ScriptApp.getService().getUrl() || '';
  tmpl.initialView = params.view || '';
  var output = tmpl.evaluate()
    .setTitle('Masjid Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
  if (page === 'display' || page === 'public') {
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return output;
}

// ================== GET ROUTER ==================
function routeGet_(action, p) {
  switch (action) {
    case 'checkSession': return apiCheckSession_(p.token);
    case 'me': return apiGetMe_(p.token);
    case 'getDashboardSummary': return apiGetDashboardSummary_(p.token);

    case 'getFinanceDashboard': return apiGetFinanceDashboard(p, p.token);
    case 'getFundSources': return apiGetFundSources(p, p.token);
    case 'getFinanceCategories': return apiGetFinanceCategories(p, p.token);
    case 'getTransactions': return apiGetTransactions(p, p.token);
    case 'getTransactionDetail': return apiGetTransactionDetail(p.id, p.token);
    case 'getFinanceReport': return apiGetFinanceReport(p, p.token);
    case 'exportTransactionsCsv': return apiExportTransactionsCsv(p, p.token);
    case 'getPublicTransparency': return apiGetPublicTransparency(p);

    case 'getAnnouncements': return apiGetAnnouncements(p, p.token);
    case 'getPublicAnnouncements': return apiGetPublicAnnouncements(p);

    case 'getEvents': return apiGetEvents(p, p.token);
    case 'getUpcomingEvents': return apiGetUpcomingEvents(p);
    case 'getPublicEvents': return apiGetPublicEvents(p);

    case 'getPrayerSchedule': return apiGetPrayerSchedule(p);
    case 'getMonthlyPrayerSchedule': return apiGetMonthlyPrayerSchedule(p, p.token);
    case 'getEquranProvinsiList': return apiGetEquranProvinsiList(p, p.token);
    case 'getEquranKabkotaList': return apiGetEquranKabkotaList(p, p.token);
    case 'getNextPrayer': return apiGetNextPrayer(p);
    case 'getHijriDate': return apiGetHijriDate(p);
    case 'getImamSchedules': return apiGetImamSchedules(p, p.token);

    case 'getInventory': return apiGetInventory(p, p.token);
    case 'getInventoryStats': return apiGetInventoryStats(p.token);

    case 'getJamaah': return apiGetJamaah(p, p.token);
    case 'getJamaahStats': return apiGetJamaahStats(p.token);

    case 'getCampaigns': return apiGetCampaigns(p, p.token);
    case 'getPublicCampaigns': return apiGetPublicCampaigns(p);
    case 'getDonationsByCampaign': return apiGetDonationsByCampaign(p.campaign_id, p, p.token);

    case 'getSocialPrograms': return apiGetSocialPrograms(p, p.token);
    case 'getDocuments': return apiGetDocuments(p, p.token);

    case 'getDisplaySettings': return apiGetDisplaySettings(p.token);
    case 'getPublicDisplaySettings': return apiGetPublicDisplaySettings();
    case 'getPlaylist': return apiGetPlaylist(p, p.token);
    case 'getActivePlaylist': return apiGetActivePlaylist();
    case 'getDisplayBundle': return apiGetDisplayBundle();
    case 'getDisplayStatus': return apiGetDisplayStatus(p.token);

    case 'getUsers': return apiGetUsers(p, p.token);
    case 'getRoles': return apiGetRoles(p, p.token);
    case 'getAuditLogs': return apiGetAuditLogs(p, p.token);

    case 'getSettings': return apiGetSettings_(p.token);
    case 'getPublicSettings': return apiGetPublicSettings_();

    default: throw new AppError('Aksi tidak dikenal: ' + action);
  }
}

// ================== POST ROUTER ==================
function routePost_(action, body) {
  var token = body.token;
  var d = body.data || {};
  var id = body.id;

  switch (action) {
    case 'login': return login(d.username, d.password);
    case 'logout': return logout(token);
    case 'changePassword': return changePassword(token, d.oldPassword, d.newPassword);

    case 'createUser': return apiCreateUser(d, token);
    case 'updateUser': return apiUpdateUser(id, d, token);
    case 'deleteUser': return apiDeleteUser(id, token);
    case 'createRole': return apiCreateRole(d, token);
    case 'updateRole': return apiUpdateRole(id, d, token);

    case 'createFundSource': return apiCreateFundSource(d, token);
    case 'updateFundSource': return apiUpdateFundSource(id, d, token);
    case 'deleteFundSource': return apiDeleteFundSource(id, token);

    case 'createFinanceCategory': return apiCreateFinanceCategory(d, token);
    case 'updateFinanceCategory': return apiUpdateFinanceCategory(id, d, token);
    case 'deleteFinanceCategory': return apiDeleteFinanceCategory(id, token);

    case 'createIncome': return apiCreateIncome(d, token);
    case 'updateIncome': return apiUpdateIncome(id, d, token);
    case 'deleteIncome': return apiDeleteIncome(id, token);

    case 'createExpense': return apiCreateExpense(d, token);
    case 'updateExpense': return apiUpdateExpense(id, d, token);
    case 'deleteExpense': return apiDeleteExpense(id, token);

    case 'createAnnouncement': return apiCreateAnnouncement(d, token);
    case 'updateAnnouncement': return apiUpdateAnnouncement(id, d, token);
    case 'deleteAnnouncement': return apiDeleteAnnouncement(id, token);
    case 'publishAnnouncement': return apiPublishAnnouncement(id, token);
    case 'unpublishAnnouncement': return apiUnpublishAnnouncement(id, token);

    case 'createEvent': return apiCreateEvent(d, token);
    case 'updateEvent': return apiUpdateEvent(id, d, token);
    case 'deleteEvent': return apiDeleteEvent(id, token);

    case 'updatePrayerScheduleManual': return apiUpdatePrayerScheduleManual(d, token);
    case 'createImamSchedule': return apiCreateImamSchedule(d, token);
    case 'updateImamSchedule': return apiUpdateImamSchedule(id, d, token);
    case 'deleteImamSchedule': return apiDeleteImamSchedule(id, token);

    case 'createInventory': return apiCreateInventory(d, token);
    case 'updateInventory': return apiUpdateInventory(id, d, token);
    case 'deleteInventory': return apiDeleteInventory(id, token);

    case 'createJamaah': return apiCreateJamaah(d, token);
    case 'updateJamaah': return apiUpdateJamaah(id, d, token);
    case 'deleteJamaah': return apiDeleteJamaah(id, token);

    case 'createCampaign': return apiCreateCampaign(d, token);
    case 'updateCampaign': return apiUpdateCampaign(id, d, token);
    case 'deleteCampaign': return apiDeleteCampaign(id, token);
    case 'createDonation': return apiCreateDonation(d, token);
    case 'updateDonationStatus': return apiUpdateDonationStatus(id, d.status, token);
    case 'deleteDonation': return apiDeleteDonation(id, token);

    case 'createSocialProgram': return apiCreateSocialProgram(d, token);
    case 'updateSocialProgram': return apiUpdateSocialProgram(id, d, token);
    case 'deleteSocialProgram': return apiDeleteSocialProgram(id, token);

    case 'uploadDocument': return apiUploadDocument(d, token);
    case 'deleteDocument': return apiDeleteDocument(id, token);

    case 'updateDisplaySettings': return apiUpdateDisplaySettings(d, token);
    case 'setEmergency': return apiSetEmergency(d, token);
    case 'createPlaylistItem': return apiCreatePlaylistItem(d, token);
    case 'updatePlaylistItem': return apiUpdatePlaylistItem(id, d, token);
    case 'deletePlaylistItem': return apiDeletePlaylistItem(id, token);
    case 'displayHeartbeat': return apiDisplayHeartbeat(d);

    case 'updateSettings': return apiUpdateSettings_(d, token);
    case 'completeSetupWizard': return apiCompleteSetupWizard_(d, token);

    default: throw new AppError('Aksi tidak dikenal: ' + action);
  }
}

// ================== THIN AGGREGATION / SETTINGS HELPERS ==================
function apiCheckSession_(token) {
  var ctx = verifySession(token);
  if (!ctx) throw new AppError('Sesi tidak valid atau sudah berakhir.');
  return apiGetMe_(token);
}

function apiGetMe_(token) {
  var ctx = requireAuth_(token);
  var user = findById(SHEETS.USERS, ctx.user_id);
  var role = findById(SHEETS.ROLES, ctx.role_id);
  return {
    id: user.id, name: user.name, username: user.username,
    role_id: ctx.role_id, role_name: role ? role.name : ctx.role_id,
    email: user.email, phone: user.phone
  };
}

/**
 * Ringkasan untuk Dashboard utama: kartu keuangan + kartu lain (pengumuman, agenda,
 * inventaris, jamaah) sesuai butir 10.
 */
function apiGetDashboardSummary_(token) {
  requirePermission_(token, 'dashboard');
  var balances = computeBalances_();
  var announcements = getActiveAnnouncements_();
  var upcoming = getUpcomingEvents_(5);
  return {
    saldo: balances.balance,
    totalIncome: balances.totalIncome,
    totalExpense: balances.totalExpense,
    byFundSource: balances.byFundSource,
    activeAnnouncementsCount: announcements.length,
    recentAnnouncements: announcements.slice(0, 5),
    upcomingEvents: upcoming,
    inventoryCount: getAll(SHEETS.INVENTORY).length,
    jamaahCount: getAll(SHEETS.JAMAAH).length
  };
}

function apiGetSettings_(token) {
  requirePermission_(token, 'settings');
  return getAllSettings();
}

function apiGetPublicSettings_() {
  var all = getAllSettings();
  var keys = ['mosque_name', 'mosque_address', 'mosque_phone', 'mosque_email', 'mosque_description',
    'logo_url', 'latitude', 'longitude', 'qibla_direction', 'footer_text', 'timezone'];
  var out = {};
  keys.forEach(function (k) { out[k] = all[k] !== undefined ? all[k] : ''; });
  return out;
}

function apiUpdateSettings_(data, token) {
  var ctx = requirePermission_(token, 'settings');
  Object.keys(data).forEach(function (k) { setSetting(k, data[k]); });
  logAudit(ctx.user_id, 'setting_change', 'settings', '', 'Mengubah pengaturan masjid');
  return getAllSettings();
}

/**
 * Finalisasi Setup Wizard pertama kali (butir 61): menyimpan profil masjid, lokasi,
 * timezone, konfigurasi shalat & display sekaligus, lalu menandai setup selesai.
 */
function apiCompleteSetupWizard_(data, token) {
  var ctx = requirePermission_(token, 'settings');
  var mosque = data.mosque || {};
  var location = data.location || {};
  var prayer = data.prayer || {};
  var display = data.display || {};

  Object.keys(mosque).forEach(function (k) { setSetting(k, mosque[k]); });
  Object.keys(location).forEach(function (k) { setSetting(k, location[k]); });
  Object.keys(prayer).forEach(function (k) { setSetting(k, prayer[k]); });
  Object.keys(display).forEach(function (k) { setDisplaySetting(k, display[k]); });
  setSetting('setup_completed', 'true', 'Menandakan wizard instalasi pertama sudah selesai');

  logAudit(ctx.user_id, 'setting_change', 'settings', '', 'Menyelesaikan setup wizard awal');
  return { status: 'ok' };
}
