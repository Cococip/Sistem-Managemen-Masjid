/**
 * Documents.gs
 * Upload/kelola file ke Google Drive. Spreadsheet HANYA menyimpan metadata
 * (file_id, file_url, file_name, file_type), bukan file itu sendiri (lihat butir 42).
 */

function getDocumentsFolder_() {
  var folderId = getSetting('drive_folder_id', '');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (e) { /* fallback ke root */ }
  }
  var folders = DriveApp.getFoldersByName('Masjid Management System - Dokumen');
  if (folders.hasNext()) return folders.next();
  var folder = DriveApp.createFolder('Masjid Management System - Dokumen');
  setSetting('drive_folder_id', folder.getId(), 'Folder Drive untuk dokumentasi');
  return folder;
}

function apiUploadDocument(data, token) {
  var ctx = requirePermission_(token, 'documents');
  requireFields_(data, ['filename', 'mimeType', 'base64Data']);
  var folder = getDocumentsFolder_();
  var bytes = Utilities.base64Decode(data.base64Data);
  var blob = Utilities.newBlob(bytes, data.mimeType, data.filename);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var record = insert(SHEETS.DOCUMENTS, {
    file_id: file.getId(),
    file_url: file.getUrl(),
    file_name: data.filename,
    file_type: data.mimeType,
    related_module: data.related_module || '',
    related_id: data.related_id || '',
    uploaded_by: ctx.user_id
  });
  logAudit(ctx.user_id, 'create', 'documents', record.id, 'Upload dokumen: ' + record.file_name);
  return record;
}

function apiGetDocuments(params, token) {
  requirePermission_(token, 'documents');
  var rows = getAll(SHEETS.DOCUMENTS).map(function (r) { delete r.__row; return r; });
  if (params.related_module) rows = rows.filter(function (r) { return r.related_module === params.related_module; });
  if (params.related_id) rows = rows.filter(function (r) { return r.related_id === params.related_id; });
  rows.sort(function (a, b) { return new Date(b.uploaded_at) - new Date(a.uploaded_at); });
  return paginate_(rows, params.page, params.pageSize);
}

function apiDeleteDocument(id, token) {
  var ctx = requirePermission_(token, 'documents');
  var existing = findById(SHEETS.DOCUMENTS, id);
  if (!existing) throw new AppError('Dokumen tidak ditemukan.');
  try {
    DriveApp.getFileById(existing.file_id).setTrashed(true);
  } catch (e) {
    Logger.log('Gagal menghapus file Drive: ' + e);
  }
  remove(SHEETS.DOCUMENTS, id);
  logAudit(ctx.user_id, 'delete', 'documents', id, 'Menghapus dokumen: ' + existing.file_name);
  return true;
}
