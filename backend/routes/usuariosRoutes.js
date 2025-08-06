const express = require('express');
const router = express.Router();
const usuariosCtrl = require('../controllers/usuariosControllers');

// ✅ Estas rutas funcionan correctamente con app.use('/api', ...)
router.get('/usuarios', usuariosCtrl.obtenerUsuarios);
router.get('/usuarios/:id', usuariosCtrl.getUsuarioPorId);
router.post('/usuarios', usuariosCtrl.crearUsuario);
router.put('/usuarios/:id', usuariosCtrl.actualizarUsuario);
router.delete('/usuarios/:id', usuariosCtrl.eliminarUsuario);

module.exports = router;

