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

// 🔹 Logout
const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    localStorage.clear();
    goLogin();
  });
}

// ==============================
// ESTADO DE CUENTA – LÓGICA
// ==============================

// Helper autenticado para obtener JSON
async function apiFetchJson(path, init = {}) {
  const res = await fetchAuth(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ==============================
// BUSCADOR DE PACIENTES
// ==============================
const $input = document.getElementById("busquedaInputEDC");
const $btnBuscar = document.getElementById("btnBuscarEDC");
const $sugerencias = document.getElementById("sugerenciasEDC");
const $contenedor = document.getElementById("estadoCuentaContainer");

// debounce simple (evita consultas en cada letra)
function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// Buscar pacientes por nombre o DNI
async function buscarPacientesEDC(termino) {
  const q = (termino || "").trim();
  $sugerencias.innerHTML = "";
  if (q.length < 2) return;

  try {
    let pacientes = [];
    const esSoloDigitos = /^\d+$/.test(q);

    if (esSoloDigitos) {
      // 1️⃣ Buscar por DNI exacto
      const exacto = await apiFetchJson(`/pacientes/${q}`).catch(() => null);
      if (exacto) {
        pacientes = [exacto];
      } else {
        // 2️⃣ Intentar búsqueda parcial por DNI
        try {
          const parciales = await apiFetchJson(`/pacientes?dni=${encodeURIComponent(q)}`);
          if (Array.isArray(parciales)) pacientes = parciales;
        } catch {
          // 3️⃣ Fallback: buscar por nombre con el mismo valor
          const fallback = await apiFetchJson(`/pacientes?nombre=${encodeURIComponent(q)}`).catch(() => []);
          if (Array.isArray(fallback)) pacientes = fallback;
        }
      }
    } else {
      // Búsqueda por nombre
      pacientes = await apiFetchJson(`/pacientes?nombre=${encodeURIComponent(q)}`).catch(() => []);
    }

    if (!Array.isArray(pacientes)) pacientes = [];
    renderSugerencias(pacientes);
  } catch (err) {
    console.error("Error al buscar pacientes:", err);
  }
}

// Mostrar sugerencias bajo el input
function renderSugerencias(lista = []) {
  $sugerencias.innerHTML = "";
  if (!Array.isArray(lista) || !lista.length) return;

  lista.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = `${p.nombre ?? "Sin nombre"} — DNI ${p.dni ?? "-"}`;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      $input.value = p.nombre ?? "";
      $sugerencias.innerHTML = "";
      renderEstadoDeCuenta(p);
    });
    $sugerencias.appendChild(li);
  });
}

// Eventos de búsqueda
const debouncedInput = debounce(() => buscarPacientesEDC($input.value), 300);

$input.addEventListener("input", debouncedInput);
$btnBuscar.addEventListener("click", (e) => {
  e.preventDefault();
  buscarPacientesEDC($input.value);
});
$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    buscarPacientesEDC($input.value);
  }
});

// Cerrar sugerencias al hacer click afuera
document.addEventListener("click", (e) => {
  const dentro = e.target.closest(".search-bar") || e.target.closest("#sugerenciasEDC");
  if (!dentro) $sugerencias.innerHTML = "";
});

// ==============================
// RENDER DEL ESTADO DE CUENTA
// ==============================
async function renderEstadoDeCuenta(paciente) {
  $contenedor.innerHTML = `<p>Cargando estado de cuenta de <strong>${paciente.nombre}</strong>...</p>`;

  try {
    // ⚙️ Ajustá esta ruta según tu backend real
    const estado = await apiFetchJson(`/estado-de-cuenta/${paciente.dni}`);

    if (!estado || !Array.isArray(estado.movimientos)) {
      $contenedor.innerHTML = `<p>No se encontraron datos de estado de cuenta para ${paciente.nombre}.</p>`;
      return;
    }

    const total = estado.movimientos.reduce((sum, m) => sum + (m.monto || 0), 0);

    let html = `
      <h3>Estado de cuenta de ${paciente.nombre} (DNI ${paciente.dni})</h3>
      <p><strong>Total actual:</strong> $ ${total.toLocaleString("es-AR")}</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th>Monto</th>
            <th>Tipo</th>
          </tr>
        </thead>
        <tbody>
    `;

    estado.movimientos.forEach((m) => {
      html += `
        <tr>
          <td>${m.fecha ?? "-"}</td>
          <td>${m.descripcion ?? "-"}</td>
          <td>$ ${(m.monto ?? 0).toLocaleString("es-AR")}</td>
          <td>${m.tipo ?? "-"}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    $contenedor.innerHTML = html;
  } catch (err) {
    console.error("Error al cargar estado de cuenta:", err);
    $contenedor.innerHTML = `<p>Error al obtener el estado de cuenta.</p>`;
  }
}


const btnDescargar = document.getElementById("btnDescargarEDC");
if (btnDescargar) {
  btnDescargar.addEventListener("click", async () => {
    try {
      // ejemplo: descargar PDF con el estado de cuenta actual
      const paciente = $input.value.trim();
      if (!paciente) return alert("Primero buscá un paciente.");
      
      // ruta de descarga (ajustá según tu backend)
      const url = `/api/estado-de-cuenta/descargar?nombre=${encodeURIComponent(paciente)}`;
      window.open(url, "_blank");
    } catch (err) {
      console.error(err);
      alert("No se pudo descargar el estado de cuenta.");
    }
  });
}

