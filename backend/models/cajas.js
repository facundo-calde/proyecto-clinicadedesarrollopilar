// models/Caja.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const CajaSchema = new Schema(
  {
    area: {
      type: Schema.Types.ObjectId,
      ref: "Area",
      required: true,
      unique: true, // una caja por área
    },
    nombreArea: {
      type: String,
      required: true,
      trim: true,
    },

    // Saldos acumulados
    saldoPadres: {
      type: Number,
      default: 0, // todo lo que entró por PART
    },
    saldoOS: {
      type: Number,
      default: 0, // todo lo que entró por OS
    },
    saldoTotal: {
      type: Number,
      default: 0, // saldoPadres + saldoOS + otros ajustes si querés
    },

    // Por si después hacés cierres o cortes
    ultimoMovimiento: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Caja", CajaSchema);
