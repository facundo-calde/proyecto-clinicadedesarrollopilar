const Paciente = require('../models/pacientes');
const { PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../lib/r2Client");

// =============================
// GET documentos de un paciente
// =============================
const obtenerDocumentos = async (req, res) => {
  try {
    const { dni } = req.params;
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    res.json(paciente.documentosPersonales || []);
  } catch (err) {
    console.error("Error al obtener documentos:", err);
    res.status(500).json({ error: 'Error al obtener documentos' });
  }
};

// =============================
// POST documento (con archivo)
// =============================
const agregarDocumento = async (req, res) => {
  try {
    const { dni } = req.params;
    const { fecha, tipo, observaciones } = req.body;
    const file = req.file; // viene de multer

    if (!file) return res.status(400).json({ error: "Archivo requerido" });

    // Buscar paciente
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    // Generar nombre único en el bucket
    const key = `${dni}/${Date.now()}_${file.originalname}`;

    // Subir a R2
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    // URL pública/privada del archivo en R2
    const archivoURL = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${key}`;

    // Guardar en MongoDB
    paciente.documentosPersonales = paciente.documentosPersonales || [];
    paciente.documentosPersonales.push({
      fecha,
      tipo,
      observaciones,
      archivoURL
    });
    await paciente.save();

    res.status(201).json(paciente.documentosPersonales);
  } catch (err) {
    console.error("Error al agregar documento:", err);
    res.status(500).json({ error: 'Error al agregar documento' });
  }
};

// =============================
// DELETE documento
// =============================
const eliminarDocumento = async (req, res) => {
  try {
    const { dni, index } = req.params;
    const paciente = await Paciente.findOne({ dni });
    if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado' });

    if (paciente.documentosPersonales && paciente.documentosPersonales[index]) {
      const doc = paciente.documentosPersonales[index];

      // Borrar de R2 si hay archivo
      if (doc.archivoURL) {
        const key = doc.archivoURL.split(`/${process.env.R2_BUCKET}/`)[1];
        if (key) {
          await s3.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
          }));
        }
      }

      // Borrar de Mongo
      paciente.documentosPersonales.splice(index, 1);
      await paciente.save();

      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'Documento no encontrado' });
    }
  } catch (err) {
    console.error("Error al eliminar documento:", err);
    res.status(500).json({ error: 'Error al eliminar documento' });
  }
};

module.exports = {
  agregarDocumento,
  obtenerDocumentos,
  eliminarDocumento
};
