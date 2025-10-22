// backend/routes/usuariosRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const usuariosCtrl = require('../controllers/usuariosControllers');

// ─────────────────────────────────────────────────────────────────────────────
// Multer en MEMORIA (solo si llega multipart/form-data)
// ─────────────────────────────────────────────────────────────────────────────
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
    return upload.any()(req, res, next); // acepta cualquier campo de archivo (p.ej. "documentos", "archivo")
  }
  return next();
};

// ─────────────────────────────────────────────────────────────────────────────
// Rutas públicas
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', usuariosCtrl.login);

// ─────────────────────────────────────────────────────────────────────────────
// Rutas protegidas (JWT)
// ─────────────────────────────────────────────────────────────────────────────

// Listado general (soporta q/limit/sort en el controller)
router.get('/usuarios', usuariosCtrl.authMiddleware, usuariosCtrl.obtenerUsuarios);

// Búsqueda (opcional). Si no implementaste el controller, borrá esta línea.
router.get('/usuarios/buscar', usuariosCtrl.authMiddleware, usuariosCtrl.buscarUsuarios);

// Obtener por ID
router.get('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.getUsuarioPorId);

// Crear (JSON o multipart)
router.post('/usuarios', usuariosCtrl.authMiddleware, maybeUpload, usuariosCtrl.crearUsuario);

// Actualizar (JSON o multipart)
router.put('/usuarios/:id', usuariosCtrl.authMiddleware, maybeUpload, usuariosCtrl.actualizarUsuario);

// Eliminar documento de un usuario
router.delete(
  '/usuarios/:id/documentos/:docId',
  usuariosCtrl.authMiddleware,
  usuariosCtrl.eliminarDocumentoUsuario
);

// Eliminar usuario
router.delete('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.eliminarUsuario);

// ─────────────────────────────────────────────────────────────────────────────
// Manejo de errores de subida (multer)
// ─────────────────────────────────────────────────────────────────────────────
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
