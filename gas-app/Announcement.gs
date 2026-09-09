/**
 * Announcement.gs
 * CRUD Pengumuman + publish/unpublish/pin + query untuk display & public site.
 */

function apiGetAnnouncements(params, token) {
  requirePermission_(token, 'announcement');
  var rows = getAll(SHEETS.ANNOUNCEMENTS).map(function (r) { delete r.__row; return r; });
  if (params.category) rows = rows.filter(function (r) { return r.category === params.category; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['title', 'content']); });
  rows.sort(function (a, b) {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return paginate_(rows, params.page, params.pageSize);
}

function validateAnnouncementInput_(data) {
  requireFields_(data, ['title', 'content', 'category', 'start_date']);
  requireEnum_(data.category, ANNOUNCEMENT_CATEGORIES, 'Kategori pengumuman');
  requireDate_(data.start_date, 'Tanggal mulai');
  if (!isBlank_(data.end_date)) requireDate_(data.end_date, 'Tanggal selesai');
}

function apiCreateAnnouncement(data, token) {
  var ctx = requirePermission_(token, 'announcement');
  validateAnnouncementInput_(data);
  var record = insert(SHEETS.ANNOUNCEMENTS, {
    title: sanitizeString_(data.title),
    content: sanitizeString_(data.content),
    category: data.category,
    start_date: formatDateYmd_(requireDate_(data.start_date, 'Tanggal mulai')),
    end_date: isBlank_(data.end_date) ? '' : formatDateYmd_(requireDate_(data.end_date, 'Tanggal selesai')),
    priority: data.priority || 'normal',
    status: data.status || 'draft',
    is_display: data.is_display === true || data.is_display === 'true',
    is_pinned: data.is_pinned === true || data.is_pinned === 'true',
    created_by: ctx.user_id
  });
  logAudit(ctx.user_id, 'create', 'announcement', record.id, 'Membuat pengumuman: ' + record.title);
  return record;
}

function apiUpdateAnnouncement(id, data, token) {
  var ctx = requirePermission_(token, 'announcement');
  var existing = findById(SHEETS.ANNOUNCEMENTS, id);
  if (!existing) throw new AppError('Pengumuman tidak ditemukan.');
  var patch = {};
  ['category', 'priority', 'status'].forEach(function (f) { if (data[f] !== undefined) patch[f] = data[f]; });
  if (data.title !== undefined) patch.title = sanitizeString_(data.title);
  if (data.content !== undefined) patch.content = sanitizeString_(data.content);
  if (data.start_date !== undefined) patch.start_date = formatDateYmd_(requireDate_(data.start_date, 'Tanggal mulai'));
  if (data.end_date !== undefined) patch.end_date = isBlank_(data.end_date) ? '' : formatDateYmd_(requireDate_(data.end_date, 'Tanggal selesai'));
  if (data.is_display !== undefined) patch.is_display = (data.is_display === true || data.is_display === 'true');
  if (data.is_pinned !== undefined) patch.is_pinned = (data.is_pinned === true || data.is_pinned === 'true');
  var updated = update(SHEETS.ANNOUNCEMENTS, id, patch);
  logAudit(ctx.user_id, 'update', 'announcement', id, 'Mengubah pengumuman: ' + existing.title);
  return updated;
}

function apiDeleteAnnouncement(id, token) {
  var ctx = requirePermission_(token, 'announcement');
  var existing = findById(SHEETS.ANNOUNCEMENTS, id);
  if (!existing) throw new AppError('Pengumuman tidak ditemukan.');
  remove(SHEETS.ANNOUNCEMENTS, id);
  logAudit(ctx.user_id, 'delete', 'announcement', id, 'Menghapus pengumuman: ' + existing.title);
  return true;
}

function apiPublishAnnouncement(id, token) {
  var ctx = requirePermission_(token, 'announcement');
  var updated = update(SHEETS.ANNOUNCEMENTS, id, { status: 'published' });
  if (!updated) throw new AppError('Pengumuman tidak ditemukan.');
  logAudit(ctx.user_id, 'publish', 'announcement', id, 'Publish pengumuman');
  return updated;
}

function apiUnpublishAnnouncement(id, token) {
  var ctx = requirePermission_(token, 'announcement');
  var updated = update(SHEETS.ANNOUNCEMENTS, id, { status: 'draft' });
  if (!updated) throw new AppError('Pengumuman tidak ditemukan.');
  logAudit(ctx.user_id, 'unpublish', 'announcement', id, 'Unpublish pengumuman');
  return updated;
}

/**
 * Dipakai oleh Public site & Display: hanya pengumuman published dan dalam rentang tanggal aktif.
 */
function getActiveAnnouncements_() {
  var today = formatDateYmd_(new Date());
  return getAll(SHEETS.ANNOUNCEMENTS).filter(function (r) {
    if (r.status !== 'published') return false;
    if (r.start_date && r.start_date > today) return false;
    if (r.end_date && r.end_date < today) return false;
    return true;
  }).sort(function (a, b) {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  }).map(function (r) { delete r.__row; return r; });
}

function apiGetPublicAnnouncements(params) {
  var rows = getActiveAnnouncements_();
  if (params && params.category) rows = rows.filter(function (r) { return r.category === params.category; });
  return paginate_(rows, params.page, params.pageSize || 10);
}
