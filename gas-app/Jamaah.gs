/**
 * Jamaah.gs
 * Modul data jamaah sederhana. Hanya menyimpan data yang benar-benar diperlukan
 * (tidak ada data sensitif seperti NIK/KTP) sesuai butir 39.
 */

function apiGetJamaah(params, token) {
  requirePermission_(token, 'jamaah');
  var rows = getAll(SHEETS.JAMAAH).map(function (r) { delete r.__row; return r; });
  if (params.gender) rows = rows.filter(function (r) { return r.gender === params.gender; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['name', 'phone', 'address']); });
  return paginate_(rows, params.page, params.pageSize);
}

function apiCreateJamaah(data, token) {
  var ctx = requirePermission_(token, 'jamaah');
  requireFields_(data, ['name', 'gender']);
  requireEnum_(data.gender, ['L', 'P'], 'Jenis kelamin');
  var record = insert(SHEETS.JAMAAH, {
    name: sanitizeString_(data.name),
    gender: data.gender,
    phone: sanitizeString_(data.phone || ''),
    address: sanitizeString_(data.address || ''),
    status: data.status || 'active',
    registered_at: nowIso_(),
    notes: sanitizeString_(data.notes || '')
  });
  logAudit(ctx.user_id, 'create', 'jamaah', record.id, 'Menambah jamaah: ' + record.name);
  return record;
}

function apiUpdateJamaah(id, data, token) {
  var ctx = requirePermission_(token, 'jamaah');
  var existing = findById(SHEETS.JAMAAH, id);
  if (!existing) throw new AppError('Data jamaah tidak ditemukan.');
  var patch = {};
  if (data.name !== undefined) patch.name = sanitizeString_(data.name);
  if (data.gender !== undefined) patch.gender = requireEnum_(data.gender, ['L', 'P'], 'Jenis kelamin');
  if (data.phone !== undefined) patch.phone = sanitizeString_(data.phone);
  if (data.address !== undefined) patch.address = sanitizeString_(data.address);
  if (data.status !== undefined) patch.status = data.status;
  if (data.notes !== undefined) patch.notes = sanitizeString_(data.notes);
  var updated = update(SHEETS.JAMAAH, id, patch);
  logAudit(ctx.user_id, 'update', 'jamaah', id, 'Mengubah jamaah: ' + existing.name);
  return updated;
}

function apiDeleteJamaah(id, token) {
  var ctx = requirePermission_(token, 'jamaah');
  var existing = findById(SHEETS.JAMAAH, id);
  if (!existing) throw new AppError('Data jamaah tidak ditemukan.');
  remove(SHEETS.JAMAAH, id);
  logAudit(ctx.user_id, 'delete', 'jamaah', id, 'Menghapus jamaah: ' + existing.name);
  return true;
}

function apiGetJamaahStats(token) {
  requirePermission_(token, 'jamaah');
  var rows = getAll(SHEETS.JAMAAH);
  return {
    total: rows.length,
    laki: rows.filter(function (r) { return r.gender === 'L'; }).length,
    perempuan: rows.filter(function (r) { return r.gender === 'P'; }).length,
    active: rows.filter(function (r) { return r.status === 'active'; }).length
  };
}
