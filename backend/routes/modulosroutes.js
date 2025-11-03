// backend/routes/modulosroutes.js
const express = require('express');
const router = express.Router();

const {
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModulo,
  actualizarModulo,
  eliminarModulo,
  crearEventoEspecial,
  listarEventosEspeciales,
  buscarEventosEspeciales,
  obtenerEventoEspecial,
  actualizarEventoEspecial,
  eliminarEventoEspecial,
} = require('../controllers/moduloscontrollers');

// =========================
// MÓDULOS NORMALES
// =========================
router.post('/', crearModulo);
router.get('/', obtenerModulos);
router.get('/buscar', buscarModulos);

// =========================
// EVENTOS ESPECIALES
// =========================
router.post('/evento-especial', crearEventoEspecial);
router.get('/evento-especial', listarEventosEspeciales);
router.get('/evento-especial/buscar', buscarEventosEspeciales);
router.get('/evento-especial/:idOrNombre', obtenerEventoEspecial);
router.put('/evento-especial/:idOrNombre', actualizarEventoEspecial);
router.delete('/evento-especial/:idOrNombre', eliminarEventoEspecial);

// =========================
// CATCH-ALL MÓDULOS NORMALES
// =========================
router.get('/:idOrNombre', obtenerModulo);
router.put('/:idOrNombre', actualizarModulo);
router.delete('/:idOrNombre', eliminarModulo);

module.exports = router;

