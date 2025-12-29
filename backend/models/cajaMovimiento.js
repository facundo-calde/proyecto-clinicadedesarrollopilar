// models/CajaMovimiento.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const CajaMovimientoSchema = new Schema(
  {
    caja: {
      type: Schema.Types.ObjectId,
      ref: "Caja",
      required: true,
    },

    area: {
      type: Schema.Types.ObjectId,
      ref: "Area",
      required: true,
    },

    fecha: {
      type: Date,
      default: Date.now,
    },

    tipo: {
      type: String,
      enum: ["INGRESO", "EGRESO", "AJUSTE"],
      default: "INGRESO",
    },

    origen: {
      type: String,
      enum: ["ESTADO_CUENTA", "PAGO_MANUAL", "AJUSTE_MANUAL"],
      default: "ESTADO_CUENTA",
    },

    // vínculo con el paciente
    pacienteDni: {
      type: String,
    },
    pacienteNombre: {
      type: String,
    },

    // detalle del concepto
    concepto: {
      type: String,
      trim: true,
    },

    montoPadres: {
      type: Number,
      default: 0,
    },
    montoOS: {
      type: Number,
      default: 0,
    },
    montoTotal: {
      type: Number,
      required: true, // montoPadres + montoOS (o lo que corresponda)
    },

    usuario: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CajaMovimiento", CajaMovimientoSchema);
