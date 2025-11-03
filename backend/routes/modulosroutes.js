// backend/routes/modulosroutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');

const {
  // Módulos normales
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModulo,
  actualizarModulo,
  eliminarModulo,
  // Evento especial
  crearEventoEspecial,
  listarEventosEspeciales,
  buscarEventosEspeciales,
  obtenerEventoEspecial,
  actualizarEventoEspecial,
  eliminarEventoEspecial,
} = require('../controllers/moduloscontrollers');

/* =========================================================
   RUTAS PARA MÓDULOS NORMALES
   ========================================================= */
router.post('/', verifyToken, crearModulo);
router.get('/', verifyToken, obtenerModulos);
router.get('/buscar', verifyToken, buscarModulos);
router.get('/:idOrNombre', verifyToken, obtenerModulo);
router.put('/:idOrNombre', verifyToken, actualizarModulo);
router.delete('/:idOrNombre', verifyToken, eliminarModulo);

/* =========================================================
   RUTAS PARA MÓDULOS DE EVENTO ESPECIAL
   (prefijo /modulos/evento-especial)
   ========================================================= */
router.post('/evento-especial', verifyToken, crearEventoEspecial);
router.get('/evento-especial', verifyToken, listarEventosEspeciales);
router.get('/evento-especial/buscar', verifyToken, buscarEventosEspeciales);
router.get('/evento-especial/:idOrNombre', verifyToken, obtenerEventoEspecial);
router.put('/evento-especial/:idOrNombre', verifyToken, actualizarEventoEspecial);
router.delete('/evento-especial/:idOrNombre', verifyToken, eliminarEventoEspecial);

module.exports = router;

