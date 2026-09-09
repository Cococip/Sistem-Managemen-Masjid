/**
 * Inventory.gs
 * CRUD Inventaris masjid.
 */

function apiGetInventory(params, token) {
  requirePermission_(token, 'inventory');
  var rows = getAll(SHEETS.INVENTORY).map(function (r) { delete r.__row; return r; });
  if (params.category) rows = rows.filter(function (r) { return r.category === params.category; });
  if (params.condition) rows = rows.filter(function (r) { return r.condition === params.condition; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['name', 'asset_code', 'location']); });
  return paginate_(rows, params.page, params.pageSize);
}

function apiCreateInventory(data, token) {
  var ctx = requirePermission_(token, 'inventory');
  requireFields_(data, ['name', 'category', 'quantity']);
  requireEnum_(data.condition || 'Baik', INVENTORY_CONDITIONS, 'Kondisi');
  var record = insert(SHEETS.INVENTORY, {
    asset_code: data.asset_code || ('AST-' + Date.now().toString().slice(-6)),
    name: sanitizeString_(data.name),
    category: sanitizeString_(data.category),
    quantity: requireNumber_(data.quantity, 'Jumlah'),
    condition: data.condition || 'Baik',
    location: sanitizeString_(data.location || ''),
    purchase_date: isBlank_(data.purchase_date) ? '' : formatDateYmd_(requireDate_(data.purchase_date, 'Tanggal beli')),
    purchase_price: data.purchase_price ? requireNumber_(data.purchase_price, 'Harga beli') : 0,
    fund_source: data.fund_source || '',
    status: data.status || 'active',
    notes: sanitizeString_(data.notes || '')
  });
  logAudit(ctx.user_id, 'create', 'inventory', record.id, 'Menambah inventaris: ' + record.name);
  return record;
}

function apiUpdateInventory(id, data, token) {
  var ctx = requirePermission_(token, 'inventory');
  var existing = findById(SHEETS.INVENTORY, id);
  if (!existing) throw new AppError('Inventaris tidak ditemukan.');
  var patch = {};
  ['category', 'location', 'fund_source', 'status'].forEach(function (f) { if (data[f] !== undefined) patch[f] = sanitizeString_(data[f]); });
  if (data.name !== undefined) patch.name = sanitizeString_(data.name);
  if (data.condition !== undefined) patch.condition = requireEnum_(data.condition, INVENTORY_CONDITIONS, 'Kondisi');
  if (data.quantity !== undefined) patch.quantity = requireNumber_(data.quantity, 'Jumlah');
  if (data.purchase_price !== undefined) patch.purchase_price = requireNumber_(data.purchase_price, 'Harga beli');
  if (data.purchase_date !== undefined) patch.purchase_date = isBlank_(data.purchase_date) ? '' : formatDateYmd_(requireDate_(data.purchase_date, 'Tanggal beli'));
  if (data.notes !== undefined) patch.notes = sanitizeString_(data.notes);
  var updated = update(SHEETS.INVENTORY, id, patch);
  logAudit(ctx.user_id, 'update', 'inventory', id, 'Mengubah inventaris: ' + existing.name);
  return updated;
}

function apiDeleteInventory(id, token) {
  var ctx = requirePermission_(token, 'inventory');
  var existing = findById(SHEETS.INVENTORY, id);
  if (!existing) throw new AppError('Inventaris tidak ditemukan.');
  remove(SHEETS.INVENTORY, id);
  logAudit(ctx.user_id, 'delete', 'inventory', id, 'Menghapus inventaris: ' + existing.name);
  return true;
}

function apiGetInventoryStats(token) {
  requirePermission_(token, 'inventory');
  var rows = getAll(SHEETS.INVENTORY);
  var byCondition = {};
  INVENTORY_CONDITIONS.forEach(function (c) { byCondition[c] = 0; });
  rows.forEach(function (r) { byCondition[r.condition] = (byCondition[r.condition] || 0) + (Number(r.quantity) || 0); });
  return {
    total: rows.reduce(function (s, r) { return s + (Number(r.quantity) || 0); }, 0),
    byCondition: byCondition,
    totalItems: rows.length
  };
}
