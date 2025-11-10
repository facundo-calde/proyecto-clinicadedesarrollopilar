// backend/models/estadoDeCuentaMovimiento.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Movimiento del estado de cuenta por paciente/área y mes.
 * tipo:
 *  - 'CARGO'     = cargo mensual del abono
 *  - 'OS'        = pago obra social
 *  - 'PART'      = pago particular
 *  - 'FACT'      = factura/recibo emitido
 *  - 'AJUSTE+'   = ajuste a favor (suma)
 *  - 'AJUSTE-'   = ajuste en contra (resta)
 */
const MovimientoSchema = new Schema(
  {
    // Identificación
    pacienteId: { type: Schema.Types.ObjectId, ref: "Paciente", index: true, required: true },
    dni:        { type: String, index: true, required: true },

    // Dimensión contable
    areaId:     { type: Schema.Types.ObjectId, ref: "Area", index: true, required: true },
    moduloId:   { type: Schema.Types.ObjectId, ref: "Modulo", index: true }, // para CARGO

    // Clave de mes (YYYY-MM) para idempotencia
    period:     { type: String, index: true }, // ej: "2025-11"

    tipo: {
      type: String,
      enum: ["CARGO", "OS", "PART", "FACT", "AJUSTE+", "AJUSTE-"],
      required: true,
      index: true
    },

    fecha:  { type: Date, default: Date.now },
    monto:  { type: Number, required: true, default: 0 }, // positivo para cargos/ajustes+, negativo si nota crédito

    // Snapshot de asignación (opcionales)
    cantidad:   { type: Number },   // 0.25, 0.5, 1, 1.5, 2, etc.
    profesional:{ type: String },
    coordinador:{ type: String },
    pasante:    { type: String },
    directoras: [{ type: String }],

    // Datos complementarios
    nroRecibo:    { type: String },
    tipoFactura:  { type: String },
    formato:      { type: String },
    archivoURL:   { type: String },
    descripcion:  { type: String },
    observaciones:{ type: String },

    estado: {
      type: String,
      enum: ["PENDIENTE", "PAGADO"],
      default: "PENDIENTE",
      index: true
    },
    meta: { type: Object },
  },
  { timestamps: true }
);

// 🔒 Evita duplicados: un CARGO por (dni, areaId, moduloId, period)
MovimientoSchema.index(
  { dni: 1, areaId: 1, moduloId: 1, period: 1, tipo: 1 },
  { unique: true, partialFilterExpression: { tipo: "CARGO" } }
);

// ✅ Publicación con guardia para evitar OverwriteModelError
module.exports =
  mongoose.models.EstadoDeCuentaMovimiento
  || mongoose.model("EstadoDeCuentaMovimiento", MovimientoSchema);
