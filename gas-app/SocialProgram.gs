/**
 * SocialProgram.gs
 * CRUD Program Sosial (santunan yatim, dhuafa, sembako, beasiswa, bantuan bencana, zakat, dll).
 */

function apiGetSocialPrograms(params, token) {
  requirePermission_(token, 'social_program');
  var rows = getAll(SHEETS.SOCIAL_PROGRAMS).map(function (r) { delete r.__row; return r; });
  if (params.start_date || params.end_date) rows = rows.filter(function (r) { return inDateRange_(r.date, params.start_date, params.end_date); });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['name', 'person_in_charge']); });
  rows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return paginate_(rows, params.page, params.pageSize);
}

function apiCreateSocialProgram(data, token) {
  var ctx = requirePermission_(token, 'social_program');
  requireFields_(data, ['name', 'date', 'recipient_count']);
  var record = insert(SHEETS.SOCIAL_PROGRAMS, {
    name: sanitizeString_(data.name),
    date: formatDateYmd_(requireDate_(data.date, 'Tanggal')),
    recipient_count: requireNumber_(data.recipient_count, 'Jumlah penerima'),
    fund_source_id: data.fund_source_id || '',
    amount: data.amount ? requireNumber_(data.amount, 'Nominal') : 0,
    person_in_charge: sanitizeString_(data.person_in_charge || ''),
    description: sanitizeString_(data.description || '')
  });
  logAudit(ctx.user_id, 'create', 'social_program', record.id, 'Membuat program sosial: ' + record.name);
  return record;
}

function apiUpdateSocialProgram(id, data, token) {
  var ctx = requirePermission_(token, 'social_program');
  var existing = findById(SHEETS.SOCIAL_PROGRAMS, id);
  if (!existing) throw new AppError('Program sosial tidak ditemukan.');
  var patch = {};
  if (data.name !== undefined) patch.name = sanitizeString_(data.name);
  if (data.date !== undefined) patch.date = formatDateYmd_(requireDate_(data.date, 'Tanggal'));
  if (data.recipient_count !== undefined) patch.recipient_count = requireNumber_(data.recipient_count, 'Jumlah penerima');
  if (data.fund_source_id !== undefined) patch.fund_source_id = data.fund_source_id;
  if (data.amount !== undefined) patch.amount = requireNumber_(data.amount, 'Nominal');
  if (data.person_in_charge !== undefined) patch.person_in_charge = sanitizeString_(data.person_in_charge);
  if (data.description !== undefined) patch.description = sanitizeString_(data.description);
  var updated = update(SHEETS.SOCIAL_PROGRAMS, id, patch);
  logAudit(ctx.user_id, 'update', 'social_program', id, 'Mengubah program sosial: ' + existing.name);
  return updated;
}

function apiDeleteSocialProgram(id, token) {
  var ctx = requirePermission_(token, 'social_program');
  var existing = findById(SHEETS.SOCIAL_PROGRAMS, id);
  if (!existing) throw new AppError('Program sosial tidak ditemukan.');
  remove(SHEETS.SOCIAL_PROGRAMS, id);
  logAudit(ctx.user_id, 'delete', 'social_program', id, 'Menghapus program sosial: ' + existing.name);
  return true;
}
