const mongoose = require("mongoose");
const { Schema } = mongoose;

const MovimientoSchema = new Schema(
  {
    // Identificación
    pacienteId: { type: Schema.Types.ObjectId, ref: "Paciente", index: true, required: true },
    dni:        { type: String, index: true, required: true },

    // Dimensión contable
    areaId:   { type: Schema.Types.ObjectId, ref: "Area", index: true, required: true },
    moduloId: { type: Schema.Types.ObjectId, ref: "Modulo", index: true },

    // Denormalizados para mostrar en frontend
    areaNombre:   { type: String },
    moduloNombre: { type: String },

    // Eventos especiales (pago único)
    esEventoEspecial:           { type: Boolean, default: false, index: true },
    moduloEventoEspecialId:     { type: Schema.Types.ObjectId, ref: "ModuloEventoEspecial", index: true },
    moduloEventoEspecialNombre: { type: String },

    // Clave de mes (YYYY-MM)
    period: { type: String, index: true },

    // Clave de asignación (distingue movimientos del mismo módulo en el mismo mes)
    asigKey: { type: String, index: true },

    tipo: {
      type: String,
      enum: ["CARGO", "OS", "PART", "FACT", "AJUSTE+", "AJUSTE-"],
      required: true,
      index: true,
    },

    fecha: { type: Date, default: Date.now },
    monto: { type: Number, required: true, default: 0 },

    // Snapshot de asignación (para cargos mensuales)
    cantidad:    { type: Number },
    profesional: { type: String },
    coordinador: { type: String },
    pasante:     { type: String },
    directoras:  [{ type: String }],

    // Pagos asociados al cargo (lo que usa el modal)
    pagPadres: { type: Number, default: 0 },
    detPadres: { type: String },
    pagOS:     { type: Number, default: 0 },
    detOS:     { type: String },

    // Datos complementarios (FACT, OS, PART, etc.)
    nroRecibo:     { type: String },
    tipoFactura:   { type: String },
    formato:       { type: String },
    archivoURL:    { type: String },
    descripcion:   { type: String },
    observaciones: { type: String },

    // ✅ NUEVO: estado manual de factura (solo tipo FACT)
    facturaPagada: { type: Boolean, default: false, index: true },

    estado: {
      type: String,
      enum: ["PENDIENTE", "PAGADO"],
      default: "PENDIENTE",
      index: true,
    },

    // Metadata libre
    meta: { type: Object },
  },
  { timestamps: true }
);

// Índice único para CARGO (un cargo por paciente/área/módulo/mes/asigKey)
MovimientoSchema.index(
  { dni: 1, areaId: 1, moduloId: 1, period: 1, tipo: 1, asigKey: 1 },
  { unique: true, partialFilterExpression: { tipo: "CARGO" } }
);

module.exports =
  mongoose.models.EstadoDeCuentaMovimiento ||
  mongoose.model("EstadoDeCuentaMovimiento", MovimientoSchema);



