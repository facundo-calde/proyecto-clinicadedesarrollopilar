// lib/r2Client.js
const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: "auto", // R2 no usa regiones, siempre "auto"
  endpoint: process.env.R2_ENDPOINT, // Ej: https://<accountid>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

module.exports = {
  s3,
  buckets: {
    pacientes: process.env.R2_BUCKET_PACIENTES, // documentos-pacientes
    usuarios: process.env.R2_BUCKET_USUARIOS    // documentos-usuarios
  }
};

