const express = require('express');
const router = express.Router();

const {
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente
} = require('../controllers/pacientescontrollers'); // ← coincide con el nombre del archivo

// 🔧 IMPORT CORRECTO (plural + C mayúscula)
const { authMiddleware } = require('../controllers/usuariosControllers');

// Lecturas (podés protegerlas también si querés)
router.get('/', buscarPaciente);
router.get('/:dni', obtenerPorDNI);

// Escrituras: requieren token
router.post('/', authMiddleware, crearPaciente);
router.put('/:dni', authMiddleware, actualizarPaciente);

module.exports = router;
