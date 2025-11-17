const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Movimiento del estado de cuenta por paciente/área y mes.
 * tipo:
 *  - 'CARGO'     = cargo mensual del abono (módulos y, si querés, también eventos)
 *  - 'OS'        = pago obra social
 *  - 'PART'      = pago particular
 *  - 'FACT'      = factura/recibo emitido
 *  - 'AJUSTE+'   = ajuste a favor (suma)
 *  - 'AJUSTE-'   = ajuste en contra (resta)
 *
 * 🔹 Módulos mensuales:
 *   - normalmente: tipo = 'CARGO'
 *   - usan: moduloId, moduloNombre, cantidad, period (YYYY-MM), monto
 *
 * 🔹 Eventos especiales (pago único):
 *   - esEventoEspecial = true
 *   - opcional: moduloEventoEspecialId / moduloEventoEspecialNombre
 *   - el job de cargos NO debería replicarlos mes a mes (eso se maneja en la lógica, no acá)
 */
const MovimientoSchema = new Schema(
  {
    // Identificación
    pacienteId: { type: Schema.Types.ObjectId, ref: "Paciente", index: true, required: true },
    dni:        { type: String, index: true, required: true },

    // Dimensión contable
    areaId:     { type: Schema.Types.ObjectId, ref: "Area", index: true, required: true },
    moduloId:   { type: Schema.Types.ObjectId, ref: "Modulo", index: true },

    // ✅ Denormalizados para mostrar en frontend
    areaNombre:   { type: String },
    moduloNombre: { type: String },

    /**
     * Eventos especiales (pago único)
     *  - En lugar de usar moduloId, podés usar estos campos.
     *  - esEventoEspecial = true marca claramente que este movimiento NO es un módulo mensual.
     */
    esEventoEspecial:           { type: Boolean, default: false, index: true },
    moduloEventoEspecialId:     { type: Schema.Types.ObjectId, ref: "ModuloEventoEspecial", index: true },
    moduloEventoEspecialNombre: { type: String },

    // Clave de mes (YYYY-MM) para agrupar / liquidar
    period:     { type: String, index: true },

    // Clave de asignación (distingue movimientos del mismo módulo en el mismo mes)
    asigKey:    { type: String, index: true }, // ej: subdoc _id de modulosAsignados

    tipo: {
      type: String,
      enum: ["CARGO", "OS", "PART", "FACT", "AJUSTE+", "AJUSTE-"],
      required: true,
      index: true
    },

    fecha:  { type: Date, default: Date.now },
    monto:  { type: Number, required: true, default: 0 },

    // Snapshot de asignación
    cantidad:   { type: Number }, // para módulos mensuales se usa para multiplicar
    profesional:{ type: String },
    coordinador:{ type: String },
    pasante:    { type: String },
    directoras: [{ type: String }],

    // Datos complementarios (FACT, OS, PART, etc.)
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

    // Espacio libre para metadata adicional sin romper estructura
    meta: { type: Object },
  },
  { timestamps: true }
);

// 🔒 Un CARGO por (dni, areaId, moduloId, period, asigKey)
//    Esto está pensado para módulos mensuales.
//    Para eventos especiales podés:
//      - usar moduloId = null y moduloEventoEspecialId distinto
//      - o dejar asigKey distinto si hicieras más de un cargo especial.
MovimientoSchema.index(
  { dni: 1, areaId: 1, moduloId: 1, period: 1, tipo: 1, asigKey: 1 },
  { unique: true, partialFilterExpression: { tipo: "CARGO" } }
);

// ✅ Evitar OverwriteModelError en hot-reload / tests
module.exports =
  mongoose.models.EstadoDeCuentaMovimiento
  || mongoose.model("EstadoDeCuentaMovimiento", MovimientoSchema);

