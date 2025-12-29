// ==========================
// 🔐 Sesión, anti-back y helpers
// ==========================
const LOGIN = 'index.html';

const goLogin = () => location.replace(LOGIN);

// Usuario y token
let usuarioSesion = null;
try {
  usuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null');
} catch {
  usuarioSesion = null;
}
const token = localStorage.getItem('token');

// Guard inmediato
if (!token) goLogin();

// Anti-BFCache: si vuelven con atrás y la página se restaura desde caché
window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fromBF = e.persisted || nav?.type === 'back_forward';
  if (fromBF && !localStorage.getItem('token')) goLogin();
});

// Anti-atrás: si no hay token, mandá a login; si hay, re-inyectá el estado
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  if (!localStorage.getItem('token')) goLogin();
  else history.pushState(null, '', location.href);
});

// Pintar nombre en top bar (si existe id="userName")
if (usuarioSesion?.nombreApellido) {
  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = usuarioSesion.nombreApellido;
}

// Helper fetch con Authorization y manejo de 401
async function fetchAuth(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    },
    cache: 'no-store',
  };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    goLogin();
    throw new Error('No autorizado');
  }
  return res;
}

// Helper JSON
async function apiFetchJson(url, options = {}) {
  const res = await fetchAuth(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  }
  return res.json();
}

// 🔹 Logout
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    localStorage.clear();
    goLogin();
  });
}

// ==========================
// 🧩 CAJA: lógica de pantalla
// ==========================

const API_CAJA_BASE = '/api/cajas';

// Función comodín para encontrar elementos por varios IDs posibles
function elById(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

// Referencias DOM (ajustá si tus IDs son otros)
const $selectCaja = elById('selectCaja', 'filtroCaja', 'caja');
const $selectMes = elById('selectMes', 'filtroMes', 'mes');
const $selectTipo = elById('selectTipoMovimiento', 'filtroTipoMov', 'tipoMovimiento');
const $selectCategoria = elById('selectCategoria', 'filtroCategoria', 'categoria');
const $selectFormato = elById('selectFormato', 'filtroFormato', 'formato');
const $selectProfesional = elById('selectProfesional', 'filtroProfesional', 'profesional');
const $selectBeneficiario = elById('selectBeneficiario', 'filtroBeneficiario', 'beneficiario');

const $btnBuscar = elById('btnBuscarCaja', 'btnBuscar');
const $btnNuevo = elById('btnNuevoMovimientoCaja', 'btnNuevoMovimiento');
const $saldoActual = elById('saldoActualCaja', 'saldoActual');
const $contenedorMovs = elById('cajaMovimientosContainer', 'cajaMovimientos', 'contenedorMovimientos');

// -------------- Helpers UI -----------------

function fmtARS(n) {
  const num = Number(n || 0);
  return `$ ${num.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function setMensajeLista(msg) {
  if (!$contenedorMovs) return;
  $contenedorMovs.innerHTML = `
    <div class="caja-no-data">
      <p style="color:#777;font-style:italic;margin:12px 0;">${msg}</p>
    </div>
  `;
}

function getVal(selectEl) {
  return selectEl && selectEl.value ? selectEl.value : '';
}

// -------------- Cargar cajas y saldo -----------------

async function cargarCajas() {
  if (!$selectCaja) return;

  try {
    const cajas = await apiFetchJson(API_CAJA_BASE);

    if (!Array.isArray(cajas) || !cajas.length) {
      $selectCaja.innerHTML = '<option value="">Sin cajas</option>';
      if ($saldoActual) $saldoActual.textContent = '$ _________';
      setMensajeLista('No hay cajas definidas. Todavía no se registraron pagos.');
      return;
    }

    $selectCaja.innerHTML =
      '<option value="">Caja</option>' +
      cajas
        .map((c) => {
          const nombre =
            c.nombreArea ||
            (c.area && c.area.nombre) ||
            c.nombre ||
            'Caja sin nombre';
          const saldo = fmtARS(c.saldoTotal ?? 0);
          return `<option value="${c._id}">${nombre} — ${saldo}</option>`;
        })
        .join('');

    // Si querés seleccionar automáticamente la primera caja
    // y mostrar su saldo:
    $selectCaja.value = cajas[0]._id;
    await actualizarSaldoActual();
    await buscarMovimientos(); // si ya tenés el endpoint de movimientos
  } catch (err) {
    console.error('Error cargando cajas:', err);
    setMensajeLista('Error al cargar las cajas.');
    if ($saldoActual) $saldoActual.textContent = 'Error';
  }
}

async function actualizarSaldoActual() {
  if (!$selectCaja || !$saldoActual) return;

  const cajaId = $selectCaja.value;
  if (!cajaId) {
    $saldoActual.textContent = '$ _________';
    return;
  }

  try {
    const caja = await apiFetchJson(`${API_CAJA_BASE}/${cajaId}`);
    const saldo = fmtARS(caja.saldoTotal ?? 0);
    $saldoActual.textContent = saldo;
  } catch (err) {
    console.error('Error obteniendo caja:', err);
    $saldoActual.textContent = 'Error';
  }
}

// -------------- Movimientos: búsqueda y render -----------------

async function buscarMovimientos() {
  if (!$selectCaja || !$contenedorMovs) return;

  const cajaId = $selectCaja.value;
  if (!cajaId) {
    setMensajeLista('No hay información / seleccionar filtros.');
    return;
  }

  // Si todavía no tenés la ruta de movimientos hecha,
  // dejá esto en standby; cuando la crees, usás la query:
  const params = new URLSearchParams();
  params.set('mes', getVal($selectMes));
  params.set('tipoMovimiento', getVal($selectTipo));
  params.set('categoria', getVal($selectCategoria));
  params.set('formato', getVal($selectFormato));
  params.set('profesionalId', getVal($selectProfesional));
  params.set('beneficiario', getVal($selectBeneficiario));

  // Limpiamos params vacíos
  for (const [k, v] of [...params.entries()]) {
    if (!v) params.delete(k);
  }

  try {
    setMensajeLista('Buscando movimientos...');

    // Ajustá la ruta cuando tengas el backend:
    // Ejemplo: GET /api/cajas/:id/movimientos?...
    const url = `${API_CAJA_BASE}/${cajaId}/movimientos${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    const data = await apiFetchJson(url);
    const movs = Array.isArray(data) ? data : data.movimientos || [];

    if (!movs.length) {
      setMensajeLista('No hay información / seleccionar filtros.');
      return;
    }

    renderMovimientos(movs);
  } catch (err) {
    console.error('Error buscando movimientos de caja:', err);
    setMensajeLista('Error al buscar movimientos.');
  }
}

function renderMovimientos(movs) {
  if (!$contenedorMovs) return;

  const filas = movs
    .map((m) => {
      const fecha = m.fecha
        ? new Date(m.fecha).toLocaleDateString('es-AR')
        : '';
      const tipo = m.tipoMovimiento || m.tipo || '';
      const cat = m.categoria || '';
      const formato = m.formato || m.medioPago || '';
      const profesional =
        m.profesionalNombre ||
        (m.profesional && m.profesional.nombreApellido) ||
        '';
      const beneficiario = m.beneficiario || '';
      const concepto = m.concepto || m.descripcion || '';
      const montoPadres = fmtARS(m.montoPadres ?? 0);
      const montoOS = fmtARS(m.montoOS ?? 0);
      const montoTotal = fmtARS(m.montoTotal ?? 0);

      return `
        <tr>
          <td>${fecha}</td>
          <td>${tipo}</td>
          <td>${cat}</td>
          <td>${formato}</td>
          <td>${profesional}</td>
          <td>${beneficiario}</td>
          <td style="text-align:right;">${montoPadres}</td>
          <td style="text-align:right;">${montoOS}</td>
          <td style="text-align:right;font-weight:600;">${montoTotal}</td>
          <td>${concepto}</td>
        </tr>
      `;
    })
    .join('');

  $contenedorMovs.innerHTML = `
    <div class="tabla-caja-wrapper">
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
            <th>O.S.</th>
            <th>Total</th>
            <th>Concepto</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>
    </div>
  `;
}

// -------------- Nuevo movimiento (placeholder) -----------------

async function abrirNuevoMovimiento() {
  // Por ahora solo placeholder; después lo conectamos con SweetAlert2
  // para cargar un movimiento manual.
  console.log('Nuevo movimiento de caja (pendiente de implementar)');
}

// -------------- Listeners iniciales -----------------

document.addEventListener('DOMContentLoaded', () => {
  // Cargar cajas al entrar
  cargarCajas();

  if ($selectCaja) {
    $selectCaja.addEventListener('change', async () => {
      await actualizarSaldoActual();
      // Podés decidir si refrescar la grilla automáticamente o no
      await buscarMovimientos();
    });
  }

  if ($btnBuscar) {
    $btnBuscar.addEventListener('click', (e) => {
      e.preventDefault();
      buscarMovimientos();
    });
  }

  if ($btnNuevo) {
    $btnNuevo.addEventListener('click', (e) => {
      e.preventDefault();
      abrirNuevoMovimiento();
    });
  }

  // Mensaje inicial
  if ($contenedorMovs) {
    setMensajeLista('No hay información / seleccionar filtros.');
  }
});




