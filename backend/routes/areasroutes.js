// routes/areasroutes.js
const express = require('express');
const router = express.Router();
const controlador = require('../controllers/areascontrollers');

router.get('/', controlador.obtenerAreas);
router.post('/', controlador.crearArea);
router.put('/:id', controlador.editarArea);
router.delete('/:id', controlador.eliminarArea);

module.exports = router;
