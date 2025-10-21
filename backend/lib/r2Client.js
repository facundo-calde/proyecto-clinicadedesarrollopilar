// lib/r2Client.js
const { S3Client } = require("@aws-sdk/client-s3");

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error("Faltan variables de R2 (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
}

const s3 = new S3Client({
  region: "auto",
  endpoint,
  forcePathStyle: true, // R2 funciona mejor en path-style
  credentials: { accessKeyId, secretAccessKey },
});

// Map de buckets por dominio
const buckets = {
  pacientes: process.env.R2_BUCKET_PACIENTES,
  usuarios:  process.env.R2_BUCKET_USUARIOS,
};

if (!buckets.pacientes || !buckets.usuarios) {
  throw new Error("Faltan R2_BUCKET_PACIENTES o R2_BUCKET_USUARIOS en .env");
}

module.exports = { s3, buckets };

