const express = require('express');
const cors = require('cors');
const pacientesRoutes = require('./backend/routes/pacientes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/pacientes', pacientesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
