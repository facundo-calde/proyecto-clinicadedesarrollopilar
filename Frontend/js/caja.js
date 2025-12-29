// ==========================
// 🔐 Sesión, anti-back y helpers
// ==========================
const LOGIN = "index.html";

const goLogin = () => location.replace(LOGIN);

// Usuario y token
let usuarioSesion = null;
try {
  usuarioSesion = JSON.parse(localStorage.getItem("usuario") || "null");
} catch {
  usuarioSesion = null;
}
const token = localStorage.getItem("token");

// Guard inmediato
if (!token) goLogin();

// Anti-BFCache
window.addEventListener("pageshow", (e) => {
  const nav = performance.getEntriesByType("navigation")[0];
  const fromBF = e.persisted || nav?.type === "back_forward";
  if (fromBF && !localStorage.getItem("token")) goLogin();
});

// Anti-atrás
history.pushState(null, "", location.href);
window.addEventListener("popstate", () => {
  if (!localStorage.getItem("token")) goLogin();
  else history.pushState(null, "", location.href);
});

// Pintar nombre en top bar
if (usuarioSesion?.nombreApellido) {
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = usuarioSesion.nombreApellido;
}

// Helper fetch con Authorization
async function fetchAuth(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    goLogin();
    throw new Error("No autorizado");
  }
  return res;
}

// Logout
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    localStorage.clear();
    goLogin();
  });
}

// =================================================
// 🎨 Inyectar estilos específicos de CAJA
// =================================================
function injectCajaStyles() {
  if (document.getElementById("caja-styles")) return; // evitar duplicar

  const css = `
  /* ===== Tabla movimientos caja ===== */
  .tabla-caja {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    background: #ffffff;
    font-size: 13px;
  }

  .tabla-caja thead th {
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-bottom: 1px solid #dcdcdc;
    white-space: nowrap;
    background: #f5f5f5;
  }

  .tabla-caja tbody td {
    font-size: 12px;
    padding: 6px 10px;
    border-bottom: 1px solid #eeeeee;
    vertical-align: middle;
  }

  .tabla-caja tbody tr:nth-child(even) {
    background: #fbfbfb;
  }

  .tabla-caja td.num {
    text-align: right;
    white-space: nowrap;
  }

  /* Anchos de columnas */
  .tabla-caja th:nth-child(1),
  .tabla-caja td:nth-child(1) { width: 80px; }   /* Fecha */

  .tabla-caja th:nth-child(2),
  .tabla-caja td:nth-child(2) { width: 80px; }   /* Tipo */

  .tabla-caja th:nth-child(3),
  .tabla-caja td:nth-child(3) { width: 120px; }  /* Categoría */

  .tabla-caja th:nth-child(4),
  .tabla-caja td:nth-child(4) { width: 110px; }  /* Formato */

  .tabla-caja th:nth-child(5),
  .tabla-caja td:nth-child(5) { width: 220px; }  /* Beneficiario */

  .tabla-caja th:nth-child(6),
  .tabla-caja td:nth-child(6) { width: 120px; }  /* Movimiento */

  .sin-info {
    padding: 16px;
    font-size: 13px;
    color: #666666;
  }
  `;

  const style = document.createElement("style");
  style.id = "caja-styles";
  style.type = "text/css";
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

// =================================================
// 📦 CAJA – LÓGICA
// =================================================
const MOVS_ENDPOINT_BASE = "/api/cajas";

// DOM
const $selectCaja = document.getElementById("selectCaja");
const $selectMes = document.getElementById("selectMes");
const $selectTipo = document.getElementById("selectTipoMovimiento");
const $selectCategoria = document.getElementById("selectCategoria");
const $selectFormato = document.getElementById("selectFormato");
const $selectBeneficiario = document.getElementById("selectBeneficiario");

const $btnBuscar = document.getElementById("btnBuscarCaja");
const $btnNuevo = document.getElementById("btnNuevoMovimientoCaja");

const $saldoActual = document.getElementById("saldoActualCaja");
const $tablaContainer = document.getElementById("cajaMovimientosContainer");

let CAJAS = [];

// --------------------------
// Helpers visuales
// --------------------------
function fmtARS(n) {
  const num = Number(n || 0);
  return `$ ${num.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function fmtFecha(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("es-AR");
}

// --------------------------
// Filtros estáticos
// --------------------------
function initFiltrosEstaticos() {
  if ($selectMes) {
    const now = new Date();
    const year = now.getFullYear();
    $selectMes.innerHTML = `<option value="">Mes</option>`;
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const opt = document.createElement("option");
      opt.value = `${year}-${mm}`; // YYYY-MM
      opt.textContent = `${mm}/${year}`;
      $selectMes.appendChild(opt);
    }
  }

if ($selectTipo) {
  $selectTipo.innerHTML = `
    <option value="">Tipo de movimiento</option>
    <option value="INGRESO">Ingreso</option>
    <option value="EGRESO">Egreso</option>
  `;
}


  if ($selectCategoria) {
    $selectCategoria.innerHTML = `
      <option value="">Categoría</option>
      <option value="PADRES">Pagos padres</option>
      <option value="OS">Obra social</option>
      <option value="AMBOS">Ambos</option>
      <option value="MANUAL">Ajuste / Manual</option>
    `;
  }

  if ($selectFormato) {
    $selectFormato.innerHTML = `
      <option value="">Formato</option>
      <option value="EFECTIVO">Efectivo</option>
      <option value="TRANSFERENCIA">Transferencia</option>
      <option value="MP">Mercado Pago</option>
      <option value="OTRO">Otro</option>
    `;
  }

  if ($selectBeneficiario) {
    $selectBeneficiario.innerHTML = `
      <option value="">Beneficiario</option>
    `;
  }
}

// --------------------------
// Cargar cajas y saldo
// --------------------------
async function cargarCajas() {
  if (!$selectCaja) return;
  $selectCaja.innerHTML = `<option value="">Caja</option>`;
  if ($saldoActual) $saldoActual.textContent = "__________";

  try {
    const res = await fetchAuth("/api/cajas");
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      if ($saldoActual) $saldoActual.textContent = "—";
      return;
    }

    CAJAS = data;

    data.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c._id;
      const nombre = c.nombreArea || c.nombre || "Caja";
      const total = Number(c.saldoTotal || 0);
      opt.textContent = `${nombre} — ${fmtARS(total)}`;
      opt.dataset.saldoTotal = total;
      $selectCaja.appendChild(opt);
    });

    if (data[0]) {
      $selectCaja.value = data[0]._id;
      actualizarSaldoCaja();
      buscarMovimientos();
    }
  } catch (err) {
    console.error("Error al cargar cajas:", err);
    if ($saldoActual) $saldoActual.textContent = "—";
  }
}

function actualizarSaldoCaja() {
  if (!$saldoActual || !$selectCaja) return;
  const caja = CAJAS.find((c) => String(c._id) === String($selectCaja.value));
  if (!caja) {
    $saldoActual.textContent = "__________";
    return;
  }
  $saldoActual.textContent = fmtARS(Number(caja.saldoTotal || 0));
}

// --------------------------
// Render tabla
// --------------------------
function renderMovimientos(list) {
  if (!$tablaContainer) return;

  if (!Array.isArray(list) || !list.length) {
    $tablaContainer.innerHTML =
      `<p class="sin-info">No hay movimientos para los filtros seleccionados.</p>`;
    return;
  }

  const rows = list
    .map((m) => {
      const fecha = fmtFecha(m.fecha || m.createdAt);
      const tipo = m.tipoMovimiento || m.tipo || "";

      let categoria = "";
      switch ((m.categoria || "").toUpperCase()) {
        case "PADRES":
          categoria = "Pagos padres";
          break;
        case "OS":
          categoria = "Obra social";
          break;
        case "AMBOS":
          categoria = "Ambos";
          break;
        case "MANUAL":
          categoria = "Ajuste / Manual";
          break;
        default:
          categoria = "";
      }

      const formato = m.formato || "";

      // Beneficiario = quien recibe la plata (profesional)
      const beneficiario =
        m.profesionalNombre ||
        m.profesional ||
        m.usuarioNombre ||
        m.beneficiarioNombre ||
        m.beneficiario ||
        "";

      const total = Number(m.montoTotal || m.monto || 0);

      const concepto = m.concepto || m.descripcion || m.origen || "";

      return `
        <tr>
          <td>${fecha}</td>
          <td>${tipo}</td>
          <td>${categoria}</td>
          <td>${formato}</td>
          <td>${beneficiario}</td>
          <td class="num">${fmtARS(total)}</td>
          <td>${concepto}</td>
        </tr>
      `;
    })
    .join("");

  $tablaContainer.innerHTML = `
    <table class="tabla-caja">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Categoría</th>
          <th>Formato</th>
          <th>Beneficiario</th>
          <th>Movimiento</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// --------------------------
// Buscar movimientos
// --------------------------
async function buscarMovimientos() {
  if (!$selectCaja || !$selectCaja.value) {
    if ($tablaContainer) {
      $tablaContainer.innerHTML =
        `<p class="sin-info">Seleccioná una caja.</p>`;
    }
    return;
  }

  const cajaId = $selectCaja.value;
  const params = new URLSearchParams();

  if ($selectMes?.value) params.set("mes", $selectMes.value);
  if ($selectTipo?.value) params.set("tipoMovimiento", $selectTipo.value);
  if ($selectCategoria?.value) params.set("categoria", $selectCategoria.value);
  if ($selectFormato?.value) params.set("formato", $selectFormato.value);
  if ($selectBeneficiario?.value)
    params.set("beneficiarioId", $selectBeneficiario.value);

  const qs = params.toString();
  const url = qs
    ? `${MOVS_ENDPOINT_BASE}/${cajaId}/movimientos?${qs}`
    : `${MOVS_ENDPOINT_BASE}/${cajaId}/movimientos`;

  if ($tablaContainer) {
    $tablaContainer.innerHTML =
      `<p class="sin-info">Buscando movimientos...</p>`;
  }

  try {
    const res = await fetchAuth(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.movimientos || [];
    renderMovimientos(list);
  } catch (err) {
    console.error("Error al buscar movimientos de caja:", err);
    if ($tablaContainer) {
      $tablaContainer.innerHTML =
        `<p class="sin-info">Error al buscar movimientos.</p>`;
    }
  }
}

// --------------------------
// Nuevo movimiento (placeholder)
// --------------------------
function initNuevoMovimiento() {
  if (!$btnNuevo) return;
  $btnNuevo.addEventListener("click", () => {
    alert("Alta de movimiento manual de caja: pendiente de implementar.");
  });
}

// --------------------------
// INIT
// --------------------------
document.addEventListener("DOMContentLoaded", () => {
  injectCajaStyles();      // ⬅ estilos incrustados
  initFiltrosEstaticos();
  cargarCajas();
  initNuevoMovimiento();

  if ($selectCaja) {
    $selectCaja.addEventListener("change", () => {
      actualizarSaldoCaja();
      buscarMovimientos();
    });
  }

  if ($btnBuscar) {
    $btnBuscar.addEventListener("click", (e) => {
      e.preventDefault();
      buscarMovimientos();
    });
  }
});






