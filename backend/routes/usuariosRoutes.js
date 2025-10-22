// backend/routes/usuariosRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const usuariosCtrl = require('../controllers/usuariosControllers');

// Multer en MEMORIA
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);

    if (allowed.has(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// ✅ SOLO usa multer si es multipart/form-data
const maybeUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    return upload.any()(req, res, next); // acepta "documentos" o "archivo"
  }
  return next();
};

// 🔑 Login (público)
router.post('/login', usuariosCtrl.login);

// ✅ CRUD Usuarios (con JWT)
router.get('/usuarios', usuariosCtrl.authMiddleware, usuariosCtrl.obtenerUsuarios);
router.get('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.getUsuarioPorId);

// Crear/Actualizar: si viene JSON -> NO pasa por multer; si viene FormData -> SÍ
router.post('/usuarios', usuariosCtrl.authMiddleware, maybeUpload, usuariosCtrl.crearUsuario);
router.put('/usuarios/:id', usuariosCtrl.authMiddleware, maybeUpload, usuariosCtrl.actualizarUsuario);

// 🗑️ Eliminar un documento de un usuario
router.delete(
  '/usuarios/:id/documentos/:docId',
  usuariosCtrl.authMiddleware,
  usuariosCtrl.eliminarDocumentoUsuario
);

// 🗑️ Eliminar usuario
router.delete('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.eliminarUsuario);

// Handler claro para errores de subida
router.use((err, req, res, next) => {
  if (err && err.message === 'Tipo de archivo no permitido') {
    return res.status(400).json({ error: 'Tipo de archivo no permitido (PDF, imágenes, DOCX o TXT).' });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Archivo demasiado grande (máx 20MB).' });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: `Error de carga: ${err.code}` });
  }
  next(err);
});

module.exports = router;

