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

// ==========================
// 📦 CAJA – LÓGICA
// ==========================

// ⚠️ Si tu ruta de movimientos es distinta, cambiá ESTO:
const MOVS_ENDPOINT_BASE = "/api/cajas"; // => GET /api/cajas/:id/movimientos

// DOM
const $selectCaja = document.getElementById("selectCaja");
const $selectMes = document.getElementById("selectMes");
const $selectTipo = document.getElementById("selectTipoMovimiento");
const $selectCategoria = document.getElementById("selectCategoria");
const $selectFormato = document.getElementById("selectFormato");
const $selectProfesional = document.getElementById("selectProfesional");
const $selectBeneficiario = document.getElementById("selectBeneficiario");

const $btnBuscar = document.getElementById("btnBuscarCaja");
const $btnNuevo = document.getElementById("btnNuevoMovimientoCaja");

const $saldoActual = document.getElementById("saldoActualCaja");
const $tablaContainer = document.getElementById("cajaMovimientosContainer");

let CAJAS = [];

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
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = dt.getFullYear();
  return `${dd}/${mm}/${yy}`;
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

  if ($selectProfesional) {
    $selectProfesional.innerHTML = `
      <option value="">Profesional</option>
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
  $saldoActual.textContent = "__________";

  try {
    const res = await fetchAuth("/api/cajas");
    const data = await res.json();

    if (!Array.isArray(data) || !data.length) {
      $saldoActual.textContent = "—";
      return;
    }

    CAJAS = data;

    data.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c._id;
      const nombre = c.nombreArea || c.nombre || "Caja";
      const total =
        typeof c.saldoTotal === "number"
          ? c.saldoTotal
          : Number(c.saldoPadres || 0) + Number(c.saldoOS || 0);
      opt.textContent = `${nombre} — ${fmtARS(total)}`;
      opt.dataset.saldoTotal = total;
      $selectCaja.appendChild(opt);
    });

    // selecciono la primera caja por defecto
    if (data[0]) {
      $selectCaja.value = data[0]._id;
      actualizarSaldoCaja();
      // cargo movimientos iniciales
      buscarMovimientos();
    }
  } catch (err) {
    console.error("Error al cargar cajas:", err);
    $saldoActual.textContent = "—";
  }
}

function actualizarSaldoCaja() {
  if (!$saldoActual || !$selectCaja) return;
  const id = $selectCaja.value;
  if (!id) {
    $saldoActual.textContent = "__________";
    return;
  }

  const caja = CAJAS.find((c) => String(c._id) === String(id));
  if (!caja) {
    $saldoActual.textContent = "—";
    return;
  }

  const total =
    typeof caja.saldoTotal === "number"
      ? caja.saldoTotal
      : Number(caja.saldoPadres || 0) + Number(caja.saldoOS || 0);

  $saldoActual.textContent = fmtARS(total);
}

// --------------------------
// Listar movimientos
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
      const categoria = m.categoria || "";
      const formato = m.formato || "";
      const profesional =
        m.profesionalNombre || m.profesional || m.usuarioNombre || "";
      const beneficiario =
        m.pacienteNombre ||
        m.beneficiarioNombre ||
        m.beneficiario ||
        "";
      const concepto = m.concepto || m.descripcion || m.origen || "";
      const montoPadres = fmtARS(m.montoPadres || 0);
      const montoOS = fmtARS(m.montoOS || 0);
      const montoTotal = fmtARS(m.montoTotal || m.monto || 0);

      return `
        <tr>
          <td>${fecha}</td>
          <td>${tipo}</td>
          <td>${categoria}</td>
          <td>${formato}</td>
          <td>${profesional}</td>
          <td>${beneficiario}</td>
          <td class="num">${montoPadres}</td>
          <td class="num">${montoOS}</td>
          <td class="num">${montoTotal}</td>
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
          <th>Profesional</th>
          <th>Beneficiario</th>
          <th>Padres</th>
          <th>Obra social</th>
          <th>Total</th>
          <th>Detalle</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

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
  if ($selectProfesional?.value) params.set("profesionalId", $selectProfesional.value);
  if ($selectBeneficiario?.value) params.set("beneficiarioId", $selectBeneficiario.value);

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
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
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
// Nuevo movimiento (todavía sin implementar)
// --------------------------
function initNuevoMovimiento() {
  if (!$btnNuevo) return;
  $btnNuevo.addEventListener("click", () => {
    // Más adelante armamos el modal para cargar un movimiento manual
    alert("Alta de movimiento manual de caja: pendiente de implementar.");
  });
}

// --------------------------
// INIT
// --------------------------
document.addEventListener("DOMContentLoaded", () => {
  initFiltrosEstaticos();
  cargarCajas();
  initNuevoMovimiento();

  if ($selectCaja) {
    $selectCaja.addEventListener("change", () => {
      actualizarSaldoCaja();
      // si querés que al cambiar de caja se refresquen los movimientos:
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





