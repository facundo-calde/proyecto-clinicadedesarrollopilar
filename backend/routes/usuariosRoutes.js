// backend/routes/usuariosRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const usuariosCtrl = require('../controllers/usuariosControllers');

// Multer en MEMORIA (no escribe a /uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB por archivo (ajustá si querés)
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/'); // png, jpg, etc.
    if (!ok) return cb(new Error('Tipo de archivo no permitido'), false);
    cb(null, true);
  }
});

// 🔑 Login (público) → /api/login
router.post('/login', usuariosCtrl.login);

// ✅ CRUD Usuarios (protegido con JWT) → /api/usuarios...
router.get('/usuarios', usuariosCtrl.authMiddleware, usuariosCtrl.obtenerUsuarios);
router.get('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.getUsuarioPorId);

// Crear/Actualizar aceptan múltiples adjuntos en el campo "documentos"
router.post(
  '/usuarios',
  usuariosCtrl.authMiddleware,
  upload.array('documentos', 10),
  usuariosCtrl.crearUsuario
);

router.put(
  '/usuarios/:id',
  usuariosCtrl.authMiddleware,
  upload.array('documentos', 10),
  usuariosCtrl.actualizarUsuario
);

router.delete('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.eliminarUsuario);

module.exports = router;
