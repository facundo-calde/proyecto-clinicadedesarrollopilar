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
    moduloId:   { type: Schema.Types.ObjectId, ref: "Modulo", index: true },

    // Denormalizados para mostrar en frontend (evitan joins)
    areaNombre:   { type: String },
    moduloNombre: { type: String },

    // Clave de mes (YYYY-MM)
    period:     { type: String, index: true },

    tipo: {
      type: String,
      enum: ["CARGO", "OS", "PART", "FACT", "AJUSTE+", "AJUSTE-"],
      required: true,
      index: true
    },

    fecha:  { type: Date, default: Date.now },
    monto:  { type: Number, required: true, default: 0 },

    // Snapshot de asignación
    cantidad:    { type: Number },
    profesional: { type: String },
    coordinador: { type: String },
    pasante:     { type: String },
    directoras:  [{ type: String }],

    // Datos complementarios
    nroRecibo:     { type: String },
    tipoFactura:   { type: String },
    formato:       { type: String },
    archivoURL:    { type: String },
    descripcion:   { type: String },
    observaciones: { type: String },

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

// ⛔️ IMPORTANTE:
// Quitamos el índice único para permitir múltiples CARGOS por (dni, areaId, moduloId, period).
// Si querés performance, mantenemos índices no únicos en los campos ya marcados con { index: true }.

// ✅ Publicación con guardia para evitar OverwriteModelError
module.exports =
  mongoose.models.EstadoDeCuentaMovimiento
  || mongoose.model("EstadoDeCuentaMovimiento", MovimientoSchema);
