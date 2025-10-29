// backend/routes/modulosroutes.js
const express = require('express');
const router = express.Router();

const {
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModulo,     // resuelve por id o nombre
  actualizarModulo,
  eliminarModulo
} = require('../controllers/moduloscontrollers');

// Crear módulo
router.post('/', crearModulo);

// Obtener todos
router.get('/', obtenerModulos);

// Buscar por coincidencia (?nombre=...)
router.get('/buscar', buscarModulos);

// Obtener uno (por id de Mongo o nombre exacto)
router.get('/:idOrNombre', obtenerModulo);

// Actualizar módulo (por id o nombre)
router.put('/:idOrNombre', actualizarModulo);

// Eliminar módulo (por id o nombre)
router.delete('/:idOrNombre', eliminarModulo);

module.exports = router;

