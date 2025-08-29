const express = require('express');
const router = express.Router();
const usuariosCtrl = require('../controllers/usuariosControllers');
const multer = require('multer');
const path = require('path');

// 📂 Configuración Multer para guardar documentos de usuarios
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/usuarios')); // Carpeta de destino
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname); // Nombre único
  }
});

const upload = multer({ storage });

// ✅ Rutas API CRUD (protegidas con JWT)
router.get('/usuarios', usuariosCtrl.authMiddleware, usuariosCtrl.obtenerUsuarios);
router.get('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.getUsuarioPorId);
router.post('/usuarios', usuariosCtrl.authMiddleware, upload.array('documentos', 10), usuariosCtrl.crearUsuario);
router.put('/usuarios/:id', usuariosCtrl.authMiddleware, upload.array('documentos', 10), usuariosCtrl.actualizarUsuario);
router.delete('/usuarios/:id', usuariosCtrl.authMiddleware, usuariosCtrl.eliminarUsuario);

// 🔑 Login (público)
router.post('/login', usuariosCtrl.login);

module.exports = router;

