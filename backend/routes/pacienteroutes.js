const express = require('express');
const router = express.Router();
const {
  buscarPaciente,
  obtenerPorDNI,
  crearPaciente,
  actualizarPaciente
} = require('../controllers/pacientescontrollers');

router.get('/', buscarPaciente);
router.get('/:dni', obtenerPorDNI);
router.post('/', crearPaciente);
router.put('/:dni', actualizarPaciente);

module.exports = router;
