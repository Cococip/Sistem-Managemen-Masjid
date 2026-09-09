/**
 * User.gs
 * CRUD Users & Roles. Hanya SUPER_ADMIN yang boleh mengelola (lihat PERMISSION_MATRIX.users).
 */

function sanitizeUser_(u) {
  if (!u) return u;
  var copy = {};
  Object.keys(u).forEach(function (k) {
    if (k === 'password_hash' || k === '__row') return;
    copy[k] = u[k];
  });
  return copy;
}

function apiGetUsers(params, token) {
  requirePermission_(token, 'users');
  var rows = getAll(SHEETS.USERS).map(sanitizeUser_);
  if (params.search) rows = rows.filter(function (r) { return matchesSearch_(r, params.search, ['name', 'username', 'email', 'phone']); });
  if (params.role_id) rows = rows.filter(function (r) { return r.role_id === params.role_id; });
  if (params.status) rows = rows.filter(function (r) { return r.status === params.status; });
  return paginate_(rows, params.page, params.pageSize);
}

function apiCreateUser(data, token) {
  var ctx = requirePermission_(token, 'users');
  requireFields_(data, ['name', 'username', 'password', 'role_id']);
  var existing = findBy(SHEETS.USERS, function (u) { return u.username === data.username; });
  if (existing.length > 0) throw new AppError('Username sudah digunakan.');
  var role = findById(SHEETS.ROLES, data.role_id);
  if (!role) throw new AppError('Role tidak ditemukan.');

  var record = insert(SHEETS.USERS, {
    name: data.name,
    username: data.username,
    password_hash: makePasswordHash_(data.password),
    role_id: data.role_id,
    phone: data.phone || '',
    email: data.email || '',
    status: data.status || 'active',
    last_login: ''
  });
  logAudit(ctx.user_id, 'create', 'users', record.id, 'Membuat user ' + record.username);
  return sanitizeUser_(record);
}

function apiUpdateUser(id, data, token) {
  var ctx = requirePermission_(token, 'users');
  var existing = findById(SHEETS.USERS, id);
  if (!existing) throw new AppError('User tidak ditemukan.');

  var patch = {};
  ['name', 'phone', 'email', 'status', 'role_id'].forEach(function (f) {
    if (data[f] !== undefined) patch[f] = data[f];
  });
  if (data.password) {
    patch.password_hash = makePasswordHash_(data.password);
  }
  var updated = update(SHEETS.USERS, id, patch);
  logAudit(ctx.user_id, 'update', 'users', id, 'Mengubah user ' + existing.username);
  return sanitizeUser_(updated);
}

function apiDeleteUser(id, token) {
  var ctx = requirePermission_(token, 'users');
  if (id === ctx.user_id) throw new AppError('Anda tidak dapat menghapus akun Anda sendiri.');
  var existing = findById(SHEETS.USERS, id);
  if (!existing) throw new AppError('User tidak ditemukan.');
  remove(SHEETS.USERS, id);
  logAudit(ctx.user_id, 'delete', 'users', id, 'Menghapus user ' + existing.username);
  return true;
}

// ================== ROLES ==================
function apiGetRoles(params, token) {
  requireAuth_(token); // semua role login boleh melihat daftar role (untuk dropdown), tanpa data sensitif
  return getAll(SHEETS.ROLES).map(function (r) { delete r.__row; return r; });
}

function apiCreateRole(data, token) {
  var ctx = requirePermission_(token, 'users');
  requireFields_(data, ['name']);
  var record = insert(SHEETS.ROLES, { name: data.name, description: data.description || '' });
  logAudit(ctx.user_id, 'create', 'roles', record.id, 'Membuat role ' + record.name);
  return record;
}

function apiUpdateRole(id, data, token) {
  var ctx = requirePermission_(token, 'users');
  var updated = update(SHEETS.ROLES, id, { name: data.name, description: data.description });
  if (!updated) throw new AppError('Role tidak ditemukan.');
  logAudit(ctx.user_id, 'update', 'roles', id, 'Mengubah role');
  return updated;
}
