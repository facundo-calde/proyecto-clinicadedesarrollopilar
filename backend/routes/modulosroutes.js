const express = require('express');
const router = express.Router();
const {
  crearModulo,
  obtenerModulos,
  buscarModulos,
  obtenerModuloPorNumero,
  actualizarModulo,
  eliminarModulo // ✅ <--- AÑADILO ACÁ
} = require('../controllers/moduloscontrollers');


// Crear módulo
router.post('/', crearModulo);

// Obtener todos
router.get('/', obtenerModulos);

// Buscar por coincidencia de número
router.get('/buscar', buscarModulos);

// Obtener por número exacto (para modificar)
router.get('/:numero', obtenerModuloPorNumero);

// Actualizar módulo existente
router.put('/:numero', actualizarModulo);
//Eliminar modulo
router.delete('/:numero', eliminarModulo);


module.exports = router;

