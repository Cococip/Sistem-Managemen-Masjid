/**
 * Event.gs
 * CRUD Agenda kegiatan masjid + query calendar/upcoming untuk display & public site.
 */

function apiGetEvents(params, token) {
  requirePermission_(token, 'event');
  var rows = getAll(SHEETS.EVENTS).map(function (r) { delete r.__row; return r; });
  if (params.category) rows = rows.filter(function (r) { return r.category === params.category; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.start_date || params.end_date) rows = rows.filter(function (r) { return inDateRange_(r.date, params.start_date, params.end_date); });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['title', 'location', 'speaker']); });
  rows.sort(function (a, b) { return new Date(a.date + 'T' + (a.start_time || '00:00')) - new Date(b.date + 'T' + (b.start_time || '00:00')); });
  return paginate_(rows, params.page, params.pageSize);
}

function validateEventInput_(data) {
  requireFields_(data, ['title', 'category', 'date', 'start_time']);
  requireEnum_(data.category, EVENT_CATEGORIES, 'Kategori agenda');
  requireDate_(data.date, 'Tanggal');
}

function apiCreateEvent(data, token) {
  var ctx = requirePermission_(token, 'event');
  validateEventInput_(data);
  var record = insert(SHEETS.EVENTS, {
    title: sanitizeString_(data.title),
    category: data.category,
    date: formatDateYmd_(requireDate_(data.date, 'Tanggal')),
    start_time: data.start_time,
    end_time: data.end_time || '',
    location: sanitizeString_(data.location || ''),
    speaker: sanitizeString_(data.speaker || ''),
    description: sanitizeString_(data.description || ''),
    status: data.status || 'scheduled',
    is_display: data.is_display === true || data.is_display === 'true'
  });
  logAudit(ctx.user_id, 'create', 'event', record.id, 'Membuat agenda: ' + record.title);
  return record;
}

function apiUpdateEvent(id, data, token) {
  var ctx = requirePermission_(token, 'event');
  var existing = findById(SHEETS.EVENTS, id);
  if (!existing) throw new AppError('Agenda tidak ditemukan.');
  var patch = {};
  ['category', 'start_time', 'end_time', 'status'].forEach(function (f) { if (data[f] !== undefined) patch[f] = data[f]; });
  if (data.title !== undefined) patch.title = sanitizeString_(data.title);
  if (data.location !== undefined) patch.location = sanitizeString_(data.location);
  if (data.speaker !== undefined) patch.speaker = sanitizeString_(data.speaker);
  if (data.description !== undefined) patch.description = sanitizeString_(data.description);
  if (data.date !== undefined) patch.date = formatDateYmd_(requireDate_(data.date, 'Tanggal'));
  if (data.is_display !== undefined) patch.is_display = (data.is_display === true || data.is_display === 'true');
  var updated = update(SHEETS.EVENTS, id, patch);
  logAudit(ctx.user_id, 'update', 'event', id, 'Mengubah agenda: ' + existing.title);
  return updated;
}

function apiDeleteEvent(id, token) {
  var ctx = requirePermission_(token, 'event');
  var existing = findById(SHEETS.EVENTS, id);
  if (!existing) throw new AppError('Agenda tidak ditemukan.');
  remove(SHEETS.EVENTS, id);
  logAudit(ctx.user_id, 'delete', 'event', id, 'Menghapus agenda: ' + existing.title);
  return true;
}

function getUpcomingEvents_(limit) {
  var today = formatDateYmd_(new Date());
  var rows = getAll(SHEETS.EVENTS).filter(function (r) {
    return r.status !== 'cancelled' && r.date >= today;
  }).sort(function (a, b) { return new Date(a.date + 'T' + (a.start_time || '00:00')) - new Date(b.date + 'T' + (b.start_time || '00:00')); });
  if (limit) rows = rows.slice(0, limit);
  return rows.map(function (r) { delete r.__row; return r; });
}

function apiGetUpcomingEvents(params) {
  return getUpcomingEvents_(params && params.limit ? Number(params.limit) : 10);
}

function apiGetPublicEvents(params) {
  var rows = getAll(SHEETS.EVENTS).filter(function (r) { return r.status !== 'cancelled'; })
    .map(function (r) { delete r.__row; return r; });
  if (params && params.month) {
    rows = rows.filter(function (r) { return r.date && r.date.indexOf(params.month) === 0; });
  }
  rows.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  return paginate_(rows, params.page, params.pageSize || 20);
}

/**
 * Event yang sedang berlangsung SEKARANG (untuk Display EVENT mode).
 */
function getOngoingEvent_() {
  var now = new Date();
  var tz = getSetting('timezone', DEFAULT_TIMEZONE);
  var todayStr = formatDateYmd_(now, tz);
  var nowHm = formatTimeHm_(now, tz);
  var candidates = getAll(SHEETS.EVENTS).filter(function (r) {
    if (r.status === 'cancelled') return false;
    if (r.is_display !== true) return false;
    if (r.date !== todayStr) return false;
    if (!r.start_time) return false;
    var end = r.end_time || '23:59';
    return nowHm >= r.start_time && nowHm <= end;
  });
  return candidates.length > 0 ? candidates[0] : null;
}
