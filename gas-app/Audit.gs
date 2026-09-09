/**
 * Audit.gs
 * Pencatatan log aktivitas (login, logout, create, update, delete, publish, unpublish,
 * setting_change, display_change) dan API untuk melihatnya (SUPER_ADMIN only).
 */

function logAudit(userId, action, module, recordId, description) {
  try {
    var sheet = getSheet(SHEETS.AUDIT_LOGS);
    var id = generateId(SHEETS.AUDIT_LOGS);
    sheet.appendRow([id, userId || '', action, module, recordId || '', description || '', nowIso_()]);
  } catch (e) {
    Logger.log('Gagal menulis audit log: ' + e);
  }
}

function apiGetAuditLogs(params, token) {
  requirePermission_(token, 'audit');
  var rows = getAll(SHEETS.AUDIT_LOGS);
  rows.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

  if (params.module) rows = rows.filter(function (r) { return r.module === params.module; });
  if (params.action) rows = rows.filter(function (r) { return r.action === params.action; });
  if (params.user_id) rows = rows.filter(function (r) { return r.user_id === params.user_id; });
  if (params.start_date || params.end_date) {
    rows = rows.filter(function (r) { return inDateRange_(r.timestamp, params.start_date, params.end_date); });
  }
  if (params.search) {
    rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['description', 'module', 'action']); });
  }

  var result = paginate_(rows, params.page, params.pageSize);
  result.items.forEach(function (r) { delete r.__row; });
  return result;
}
