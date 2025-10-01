const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const usuariosCtrl = require('../controllers/usuariosControllers');

// 📂 Aseguramos carpeta de uploads
const uploadDir = path.join(__dirname, '../uploads/usuarios');
fs.mkdirSync(uploadDir, { recursive: true });

// 📂 Configuración Multer para guardar documentos de usuarios
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// 🔑 Login (público) → /api/login
router.post('/login', usuariosCtrl.login);

// ✅ CRUD Usuarios (protegido con JWT) → /api/usuarios...
router.get('/usuarios', usuariosCtrl.authMiddleware, usuariosCtrl.obtenerUsuarios);
router.get('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.getUsuarioPorId);
router.post('/usuarios', usuariosCtrl.authMiddleware, upload.array('documentos', 10), usuariosCtrl.crearUsuario);
router.put('/usuarios/:id', usuariosCtrl.authMiddleware, upload.array('documentos', 10), usuariosCtrl.actualizarUsuario);
router.delete('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.eliminarUsuario);

module.exports = router;

