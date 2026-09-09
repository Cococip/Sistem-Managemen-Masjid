/**
 * Donation.gs
 * Campaign donasi + catatan donasi. current_amount pada campaign SELALU dihitung ulang
 * dari total donasi berstatus 'verified' agar tidak pernah "menyimpang" dari data asli.
 */

function recalcCampaignAmount_(campaignId) {
  var donations = findBy(SHEETS.DONATIONS, function (d) { return d.campaign_id === campaignId && d.status === 'verified'; });
  var total = donations.reduce(function (s, d) { return s + (Number(d.amount) || 0); }, 0);
  update(SHEETS.CAMPAIGNS, campaignId, { current_amount: total });
  return total;
}

function apiGetCampaigns(params, token) {
  requirePermission_(token, 'donation');
  var rows = getAll(SHEETS.CAMPAIGNS).map(function (r) { delete r.__row; return r; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['title']); });
  return paginate_(rows, params.page, params.pageSize);
}

function apiCreateCampaign(data, token) {
  var ctx = requirePermission_(token, 'donation');
  requireFields_(data, ['title', 'target_amount', 'start_date']);
  var record = insert(SHEETS.CAMPAIGNS, {
    title: sanitizeString_(data.title),
    description: sanitizeString_(data.description || ''),
    target_amount: requirePositiveAmount_(data.target_amount, 'Target donasi'),
    current_amount: 0,
    start_date: formatDateYmd_(requireDate_(data.start_date, 'Tanggal mulai')),
    end_date: isBlank_(data.end_date) ? '' : formatDateYmd_(requireDate_(data.end_date, 'Tanggal selesai')),
    status: data.status || 'active',
    is_public: data.is_public !== false,
    cover_url: data.cover_url || ''
  });
  logAudit(ctx.user_id, 'create', 'donation', record.id, 'Membuat campaign: ' + record.title);
  return record;
}

function apiUpdateCampaign(id, data, token) {
  var ctx = requirePermission_(token, 'donation');
  var existing = findById(SHEETS.CAMPAIGNS, id);
  if (!existing) throw new AppError('Campaign tidak ditemukan.');
  var patch = {};
  if (data.title !== undefined) patch.title = sanitizeString_(data.title);
  if (data.description !== undefined) patch.description = sanitizeString_(data.description);
  if (data.target_amount !== undefined) patch.target_amount = requirePositiveAmount_(data.target_amount, 'Target donasi');
  if (data.start_date !== undefined) patch.start_date = formatDateYmd_(requireDate_(data.start_date, 'Tanggal mulai'));
  if (data.end_date !== undefined) patch.end_date = isBlank_(data.end_date) ? '' : formatDateYmd_(requireDate_(data.end_date, 'Tanggal selesai'));
  if (data.status !== undefined) patch.status = data.status;
  if (data.is_public !== undefined) patch.is_public = (data.is_public === true || data.is_public === 'true');
  if (data.cover_url !== undefined) patch.cover_url = data.cover_url;
  var updated = update(SHEETS.CAMPAIGNS, id, patch);
  logAudit(ctx.user_id, 'update', 'donation', id, 'Mengubah campaign: ' + existing.title);
  return updated;
}

function apiDeleteCampaign(id, token) {
  var ctx = requirePermission_(token, 'donation');
  var existing = findById(SHEETS.CAMPAIGNS, id);
  if (!existing) throw new AppError('Campaign tidak ditemukan.');
  remove(SHEETS.CAMPAIGNS, id);
  logAudit(ctx.user_id, 'delete', 'donation', id, 'Menghapus campaign: ' + existing.title);
  return true;
}

function apiGetDonationsByCampaign(campaignId, params, token) {
  requirePermission_(token, 'donation');
  var rows = getAll(SHEETS.DONATIONS).filter(function (d) { return d.campaign_id === campaignId; })
    .map(function (r) { delete r.__row; return r; });
  rows.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  return paginate_(rows, params.page, params.pageSize);
}

function apiCreateDonation(data, token) {
  var ctx = requirePermission_(token, 'donation');
  requireFields_(data, ['campaign_id', 'amount', 'payment_method']);
  var campaign = findById(SHEETS.CAMPAIGNS, data.campaign_id);
  if (!campaign) throw new AppError('Campaign tidak ditemukan.');
  requireEnum_(data.payment_method, PAYMENT_METHODS, 'Metode pembayaran');
  var record = insert(SHEETS.DONATIONS, {
    campaign_id: data.campaign_id,
    donor_name: (data.is_anonymous === true || data.is_anonymous === 'true') ? 'Hamba Allah' : sanitizeString_(data.donor_name || 'Hamba Allah'),
    amount: requirePositiveAmount_(data.amount, 'Nominal donasi'),
    payment_method: data.payment_method,
    is_anonymous: data.is_anonymous === true || data.is_anonymous === 'true',
    note: sanitizeString_(data.note || ''),
    status: data.status || 'verified'
  });
  recalcCampaignAmount_(data.campaign_id);
  logAudit(ctx.user_id, 'create', 'donation', record.id, 'Donasi masuk untuk campaign ' + campaign.title);
  return record;
}

function apiUpdateDonationStatus(id, status, token) {
  var ctx = requirePermission_(token, 'donation');
  var existing = findById(SHEETS.DONATIONS, id);
  if (!existing) throw new AppError('Donasi tidak ditemukan.');
  requireEnum_(status, TRANSACTION_STATUS, 'Status');
  var updated = update(SHEETS.DONATIONS, id, { status: status });
  recalcCampaignAmount_(existing.campaign_id);
  logAudit(ctx.user_id, 'update', 'donation', id, 'Mengubah status donasi menjadi ' + status);
  return updated;
}

function apiDeleteDonation(id, token) {
  var ctx = requirePermission_(token, 'donation');
  var existing = findById(SHEETS.DONATIONS, id);
  if (!existing) throw new AppError('Donasi tidak ditemukan.');
  remove(SHEETS.DONATIONS, id);
  recalcCampaignAmount_(existing.campaign_id);
  logAudit(ctx.user_id, 'delete', 'donation', id, 'Menghapus donasi');
  return true;
}

// ================== PUBLIC ==================
function apiGetPublicCampaigns(params) {
  var rows = getAll(SHEETS.CAMPAIGNS).filter(function (r) { return r.is_public === true; })
    .map(function (r) {
      delete r.__row;
      r.progress_percent = r.target_amount > 0 ? Math.min(100, Math.round((Number(r.current_amount) / Number(r.target_amount)) * 100)) : 0;
      return r;
    });
  rows.sort(function (a, b) { return a.status === 'active' ? -1 : 1; });
  return paginate_(rows, params && params.page, (params && params.pageSize) || 20);
}
