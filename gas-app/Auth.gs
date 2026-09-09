/**
 * Auth.gs
 * Login, session/token, dan permission checking di sisi SERVER.
 * Frontend TIDAK BOLEH dipercaya untuk mengirim role/user_id sendiri (lihat butir 88).
 * Setiap request yang butuh otorisasi harus menyertakan `token` yang divalidasi ulang di sini.
 */

function login(username, password) {
  if (isBlank_(username) || isBlank_(password)) {
    throw new AppError('Username dan password wajib diisi.');
  }
  var users = getAll(SHEETS.USERS);
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username === username) { user = users[i]; break; }
  }
  if (!user) throw new AppError('Username atau password salah.');
  if (user.status !== 'active') throw new AppError('Akun tidak aktif. Hubungi administrator.');
  if (!verifyPassword_(password, user.password_hash)) {
    throw new AppError('Username atau password salah.');
  }

  var token = generateToken_();
  var createdAt = new Date();
  var expiresAt = new Date(createdAt.getTime() + SESSION_DURATION_MS);
  var sheet = getSheet(SHEETS.SESSIONS);
  sheet.appendRow([token, user.id, user.username, user.role_id, createdAt.toISOString(), expiresAt.toISOString()]);

  update(SHEETS.USERS, user.id, { last_login: nowIso_() });
  logAudit(user.id, 'login', 'auth', user.id, 'User login: ' + user.username);

  var role = findById(SHEETS.ROLES, user.role_id);
  return {
    token: token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role_id: user.role_id,
      role_name: role ? role.name : user.role_id,
      email: user.email,
      phone: user.phone
    },
    expires_at: expiresAt.toISOString()
  };
}

function logout(token) {
  var session = getSessionByToken_(token);
  if (session) {
    removeSessionRow_(token);
    logAudit(session.user_id, 'logout', 'auth', session.user_id, 'User logout: ' + session.username);
  }
  return true;
}

function removeSessionRow_(token) {
  var sheet = getSheet(SHEETS.SESSIONS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === token) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function getSessionByToken_(token) {
  if (isBlank_(token)) return null;
  var sessions = getAll(SHEETS.SESSIONS);
  for (var i = 0; i < sessions.length; i++) {
    if (sessions[i].token === token) return sessions[i];
  }
  return null;
}

/**
 * Validasi token dan kembalikan konteks user, atau null jika invalid/expired.
 * Session yang sudah expired otomatis dibersihkan.
 */
function verifySession(token) {
  var session = getSessionByToken_(token);
  if (!session) return null;
  var expiresAt = new Date(session.expires_at);
  if (isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    removeSessionRow_(token);
    return null;
  }
  var user = findById(SHEETS.USERS, session.user_id);
  if (!user || user.status !== 'active') return null;
  return {
    token: token,
    user_id: user.id,
    username: user.username,
    name: user.name,
    role_id: user.role_id
  };
}

/**
 * Wajib dipanggil oleh setiap action backend yang butuh login.
 * Melempar AppError jika token invalid atau role tidak punya akses ke module.
 */
function requireAuth_(token) {
  var ctx = verifySession(token);
  if (!ctx) throw new AppError('Sesi tidak valid atau sudah berakhir. Silakan login kembali.');
  return ctx;
}

function requirePermission_(token, moduleName) {
  var ctx = requireAuth_(token);
  if (ctx.role_id === ROLES.SUPER_ADMIN) return ctx;
  var allowed = PERMISSION_MATRIX[moduleName];
  if (!allowed || allowed.indexOf(ctx.role_id) === -1) {
    throw new AppError('Anda tidak memiliki izin untuk mengakses fitur ini.');
  }
  return ctx;
}

function changePassword(token, oldPassword, newPassword) {
  var ctx = requireAuth_(token);
  var user = findById(SHEETS.USERS, ctx.user_id);
  if (!verifyPassword_(oldPassword, user.password_hash)) {
    throw new AppError('Password lama tidak sesuai.');
  }
  if (isBlank_(newPassword) || newPassword.length < 6) {
    throw new AppError('Password baru minimal 6 karakter.');
  }
  update(SHEETS.USERS, user.id, { password_hash: makePasswordHash_(newPassword) });
  logAudit(ctx.user_id, 'update', 'auth', user.id, 'Ganti password');
  return true;
}
