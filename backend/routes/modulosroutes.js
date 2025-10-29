const express = require('express');
const router = express.Router();
const {
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModuloPorNumero, // sigue funcionando pero ahora resuelve id/nombre/numero
  actualizarModulo,
  eliminarModulo
} = require('../controllers/moduloscontrollers');

// Crear módulo
router.post('/', crearModulo);

// Obtener todos
router.get('/', obtenerModulos);

// Buscar por coincidencia (?nombre=... o ?numero=...)
router.get('/buscar', buscarModulos);

// Obtener uno (por id de Mongo, nombre o número legacy)
router.get('/:idOrNombre', obtenerModuloPorNumero);

// Actualizar módulo existente
router.put('/:idOrNombre', actualizarModulo);

// Eliminar módulo
router.delete('/:idOrNombre', eliminarModulo);

module.exports = router;

