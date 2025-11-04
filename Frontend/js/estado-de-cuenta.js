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

// Anti-BFCache
window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fromBF = e.persisted || nav?.type === 'back_forward';
  if (fromBF && !localStorage.getItem('token')) goLogin();
});

// Anti-atrás
history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  if (!localStorage.getItem('token')) goLogin();
  else history.pushState(null, '', location.href);
});

// Pintar nombre en top bar
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

/* ==========================
   💄 Estilos inline (JS)
   ========================== */
(function injectEDCStyles() {
  if (document.getElementById('edc-inline-styles')) return;
  const css = `
    #buscadorEDC{max-width:980px;margin:0 auto;display:block}
    .search-bar{display:flex;align-items:center;gap:12px}
    .search-bar input#busquedaInputEDC{flex:1;height:46px;padding:10px 14px;font-size:16px;border-radius:10px}
    .search-bar .search-btn#btnBuscarEDC{height:46px;padding:0 18px;font-size:15px;border-radius:10px}
    #sugerenciasEDC{list-style:none;margin:8px 0 0 0;padding:0;background:#fff;border:1px solid #d0d0d0;border-radius:10px;
      max-height:280px;overflow:auto}
    #sugerenciasEDC li{padding:12px 14px}
    #sugerenciasEDC li:hover{background:#f5f7f8}
  `;
  const style = document.createElement('style');
  style.id = 'edc-inline-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ==============================
// ESTADO DE CUENTA – LÓGICA
// ==============================
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

function debounce(fn, delay = 300) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

async function buscarPacientesEDC(termino) {
  const q = (termino || "").trim();
  $sugerencias.innerHTML = "";
  if (q.length < 2) return;

  try {
    let pacientes = [];
    const esSoloDigitos = /^\d+$/.test(q);

    if (esSoloDigitos) {
      const exacto = await apiFetchJson(`/pacientes/${q}`).catch(() => null);
      if (exacto) {
        pacientes = [exacto];
      } else {
        try {
          const parciales = await apiFetchJson(`/pacientes?dni=${encodeURIComponent(q)}`);
          if (Array.isArray(parciales)) pacientes = parciales;
        } catch {
          const fallback = await apiFetchJson(`/pacientes?nombre=${encodeURIComponent(q)}`).catch(() => []);
          if (Array.isArray(fallback)) pacientes = fallback;
        }
      }
    } else {
      pacientes = await apiFetchJson(`/pacientes?nombre=${encodeURIComponent(q)}`).catch(() => []);
    }

    if (!Array.isArray(pacientes)) pacientes = [];
    renderSugerencias(pacientes);
  } catch (err) {
    console.error("Error al buscar pacientes:", err);
  }
}

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
      mostrarFichaPaciente(p);
    });
    $sugerencias.appendChild(li);
  });
}

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

// ==============================
// Descargar estado de cuenta
// ==============================
const btnDescargar = document.getElementById("btnDescargarEDC");
if (btnDescargar) {
  btnDescargar.addEventListener("click", async () => {
    try {
      const paciente = $input.value.trim();
      if (!paciente) return alert("Primero buscá un paciente.");
      const url = `/api/estado-de-cuenta/descargar?nombre=${encodeURIComponent(paciente)}`;
      window.open(url, "_blank");
    } catch (err) {
      console.error(err);
      alert("No se pudo descargar el estado de cuenta.");
    }
  });
}

// ==============================
// Mostrar ficha del paciente
// ==============================
const getDeep = (obj, path) =>
  path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
const val = (v, fb = "sin datos") => (v ? v : fb);
function pickResponsable(p, tipo) {
  const arr = Array.isArray(p?.responsables) ? p.responsables : [];
  const rx = new RegExp(tipo, "i");
  return arr.find(r => rx.test(r.relacion || "")) || null;
}

async function mostrarFichaPaciente(p) {
  const abonado = val(p.condicionDePago);
  const estado = val(p.estado);
  const fechaN = val(p.fechaNacimiento);
  const colegio = val(p.colegio);
  const curso = val(p.curso || p.nivel);

  const prestador = val(getDeep(p, "obraSocial.prestador") ?? p.prestador);
  const credencial = val(getDeep(p, "obraSocial.credencial") ?? p.credencial);
  const tipoOS = val(getDeep(p, "obraSocial.tipo") ?? p.tipo);

  const rMadre = pickResponsable(p, "madre");
  const rPadre = pickResponsable(p, "padre");
  const rTutor = pickResponsable(p, "tutor");

  const madreNombre = val(p.madre ?? rMadre?.nombre);
  const madreWsp = val(p.whatsappMadre ?? rMadre?.whatsapp);
  const madreMail = val(p.emailMadre ?? rMadre?.email);

  const padreNombre = val(p.padre ?? rPadre?.nombre);
  const padreWsp = val(p.whatsappPadre ?? rPadre?.whatsapp);
  const padreMail = val(p.emailPadre ?? rPadre?.email);

  const tutorNombre = val(getDeep(p, "tutor.nombre") ?? rTutor?.nombre);
  const tutorWsp = val(getDeep(p, "tutor.whatsapp") ?? rTutor?.whatsapp);
  const tutorMail = val(getDeep(p, "tutor.email") ?? rTutor?.email);

  const wspLink = (n) => (n && n !== "sin datos")
    ? `<a href="https://wa.me/${n}" target="_blank" style="color:#25d366;text-decoration:none;">${n}</a>` : "sin datos";
  const mailLink = (m) => (m && m !== "sin datos")
    ? `<a href="mailto:${m}" style="color:#1a73e8;text-decoration:none;">${m}</a>` : "sin datos";

  const html = `
  <div style="text-align:left;font-family:'Segoe UI',sans-serif;color:#222;max-width:980px;margin:auto;">
    <h2 style="margin:0 0 12px 0;">${val(p.nombre)} - DNI ${val(p.dni)}</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:space-between;">
      <div style="flex:1;min-width:280px;border:1px solid #ccc;border-radius:10px;padding:12px;">
        <p><strong>Abonado:</strong> ${abonado}</p>
        <p><strong>Estado:</strong> ${estado}</p>
        <p><strong>Fecha de nacimiento:</strong> ${fechaN}</p>
        <p><strong>Colegio:</strong> ${colegio}</p>
        <p><strong>Curso / Nivel:</strong> ${curso}</p>
      </div>
      <div style="flex:1;min-width:280px;border:1px solid #ccc;border-radius:10px;padding:12px;">
        <p><strong>Padres / Tutores:</strong></p>
        <p><strong>Madre:</strong> ${madreNombre}</p>
        <p>Whatsapp: ${wspLink(madreWsp)}</p>
        <p>Mail: ${mailLink(madreMail)}</p>
        <hr>
        <p><strong>Padre:</strong> ${padreNombre}</p>
        <p>Whatsapp: ${wspLink(padreWsp)}</p>
        <p>Mail: ${mailLink(padreMail)}</p>
        <hr>
        <p><strong>Tutor:</strong> ${tutorNombre}</p>
        <p>Whatsapp: ${wspLink(tutorWsp)}</p>
        <p>Mail: ${mailLink(tutorMail)}</p>
      </div>
      <div style="flex:1;min-width:280px;border:1px solid #ccc;border-radius:10px;padding:12px;">
        <p><strong>Obra Social:</strong></p>
        <p><strong>Prestador:</strong> ${prestador}</p>
        <p><strong>Credencial:</strong> ${credencial}</p>
        <p><strong>Tipo:</strong> ${tipoOS}</p>
      </div>
    </div>
  </div>`;

  await Swal.fire({
    title: 'Ficha del Paciente',
    html,
    width: 1000,
    showCloseButton: true,
    showCancelButton: true,
    confirmButtonText: 'Ver estado de cuenta',
    cancelButtonText: 'Cerrar',
    focusConfirm: false
  }).then(r => {
    if (r.isConfirmed) renderEstadoDeCuenta(p);
  });
}

