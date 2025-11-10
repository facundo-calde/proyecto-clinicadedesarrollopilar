// models/estadoDeCuentaMovimiento.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const TIPO_ENUM = [
  "CARGO",        // usado por el job
  // Extras por si después registrás ingresos/ajustes/facturas
  "OS", "PART", "FACT",
  "AJUSTE+", "AJUSTE-",
  // Compat genérica
  "PAGO", "AJUSTE"
];

const MovimientoSchema = new Schema(
  {
    // Identificación (el job setea pacienteId en $setOnInsert)
    pacienteId: { type: Schema.Types.ObjectId, ref: "Paciente", required: true, index: true },
    dni:        { type: String, required: true, index: true },

    // Dimensión contable (el job siempre envía ambos)
    areaId:     { type: Schema.Types.ObjectId, ref: "Area",   required: true, index: true },
    moduloId:   { type: Schema.Types.ObjectId, ref: "Modulo", required: true, index: true },

    // Clave de mes (YYYY-MM) – la usa el upsert
    period:     { type: String, required: true, index: true },

    // Naturaleza del movimiento
    tipo:       { type: String, required: true, enum: TIPO_ENUM, index: true },

    // Campos que el job actualiza en $set
    descripcion:{ type: String },
    monto:      { type: Number, required: true, default: 0 },
    cantidad:   { type: Number, default: 1 },
    profesional:{ type: String },

    // Campos que el job setea en $setOnInsert
    fecha:      { type: Date, default: Date.now },
    estado:     { type: String, enum: ["PENDIENTE", "PAGADO"], default: "PENDIENTE", index: true },
  },
  { timestamps: true }
);

// Idempotencia SOLO para CARGO (como espera el job):
// Un CARGO por (dni, areaId, moduloId, period).
MovimientoSchema.index(
  { dni: 1, areaId: 1, moduloId: 1, period: 1, tipo: 1 },
  { unique: true, partialFilterExpression: { tipo: "CARGO" } }
);

// Índices útiles para listados/reportes (opcionales, no rompen nada)
MovimientoSchema.index({ dni: 1, period: 1 });
MovimientoSchema.index({ pacienteId: 1, period: 1 });

module.exports = mongoose.model("EstadoDeCuentaMovimiento", MovimientoSchema);


