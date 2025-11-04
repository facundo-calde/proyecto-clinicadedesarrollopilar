// estado-de-cuenta.js (encapsulado para evitar colisiones de nombres)
(() => {
  'use strict';

  // Si NO cargaste SweetAlert2 en el HTML, agregalo:
  // <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  if (typeof window.Swal === 'undefined') {
    console.warn('SweetAlert2 no está cargado. Agregá el <script> del CDN antes de este archivo.');
  }

  // ==========================
  // 🔐 Sesión, anti-back y helpers
  // ==========================
  const EDC_LOGIN = 'index.html';
  const edcGoLogin = () => location.replace(EDC_LOGIN);

  // Usuario y token
  let edcUsuarioSesion = null;
  try {
    edcUsuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null');
  } catch {
    edcUsuarioSesion = null;
  }
  const edcToken = localStorage.getItem('token');

  // Guard inmediato
  if (!edcToken) edcGoLogin();

  // Anti-BFCache
  window.addEventListener('pageshow', (e) => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fromBF = e.persisted || nav?.type === 'back_forward';
    if (fromBF && !localStorage.getItem('token')) edcGoLogin();
  });

  // Anti-atrás
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    if (!localStorage.getItem('token')) edcGoLogin();
    else history.pushState(null, '', location.href);
  });

  // Pintar nombre en top bar
  (() => {
    const userNameEl = document.getElementById('userName');
    if (userNameEl && edcUsuarioSesion?.nombreApellido) {
      userNameEl.textContent = edcUsuarioSesion.nombreApellido;
    }
  })();

  // Helper fetch con Authorization y manejo de 401
  async function edcFetchAuth(url, options = {}) {
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
      edcGoLogin();
      throw new Error('No autorizado');
    }
    return res;
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
      #sugerenciasEDC{list-style:none;margin:8px 0 0 0;padding:0;background:#fff;border:1px solid #d0d0d0;border-radius:10px;max-height:280px;overflow:auto}
      #sugerenciasEDC li{padding:12px 14px;cursor:pointer}
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
  async function edcApiJson(path, init = {}) {
    const res = await edcFetchAuth(`/api${path}`, {
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
  const $btnDescargar = document.getElementById("btnDescargarEDC");

  if (!$input || !$btnBuscar || !$sugerencias || !$contenedor) {
    console.warn('Faltan elementos del DOM (revisá los IDs en el HTML estado-de-cuenta).');
  }

  const debounce = (fn, delay = 300) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  };

  async function edcBuscarPacientes(termino) {
    const q = (termino || "").trim();
    if ($sugerencias) $sugerencias.innerHTML = "";
    if (q.length < 2) return;

    try {
      const esSoloDigitos = /^\d+$/.test(q);
      let pacientes = [];

      if (esSoloDigitos && q.length >= 7) {
        const exacto = await edcApiJson(`/pacientes/${q}`).catch(() => null);
        if (exacto) pacientes = [exacto];
        else pacientes = await edcApiJson(`/pacientes/buscar?nombre=${encodeURIComponent(q)}`).catch(() => []);
      } else {
        pacientes = await edcApiJson(`/pacientes/buscar?nombre=${encodeURIComponent(q)}`).catch(() => []);
      }

      if (!Array.isArray(pacientes)) pacientes = [];
      edcRenderSugerencias(pacientes);
    } catch (err) {
      console.error("Error al buscar pacientes:", err);
    }
  }

  async function edcFetchPacienteByDNI(dni) {
    if (!dni) return null;
    try { return await edcApiJson(`/pacientes/${encodeURIComponent(dni)}`); }
    catch { return null; }
  }

  function edcRenderSugerencias(lista = []) {
    if (!$sugerencias) return;
    $sugerencias.innerHTML = "";
    if (!Array.isArray(lista) || !lista.length) return;

    lista.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${p.nombre ?? "Sin nombre"} — DNI ${p.dni ?? "-"}`;
      li.addEventListener("click", async () => {
        if ($input) $input.value = p.nombre ?? "";
        $sugerencias.innerHTML = "";
        const full = await edcFetchPacienteByDNI(p.dni);
        edcMostrarFichaPaciente(full || p);
      });
      $sugerencias.appendChild(li);
    });
  }

  if ($input) {
    $input.addEventListener("input", debounce(() => edcBuscarPacientes($input.value), 300));
    $input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        edcBuscarPacientes($input.value);
      }
    });
  }
  if ($btnBuscar) {
    $btnBuscar.addEventListener("click", (e) => {
      e.preventDefault();
      edcBuscarPacientes($input?.value || "");
    });
  }

  document.addEventListener("click", (e) => {
    const dentro = e.target.closest(".search-bar") || e.target.closest("#sugerenciasEDC");
    if (!dentro && $sugerencias) $sugerencias.innerHTML = "";
  });

  // ==============================
  // Helpers comunes
  // ==============================
  const getDeep = (obj, path) =>
    path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  const val = (v, fb = "sin datos") => (v === undefined || v === null || v === "" ? fb : v);
  function pickResponsable(p, tipo) {
    const arr = Array.isArray(p?.responsables) ? p.responsables : [];
    const rx = new RegExp(tipo, "i");
    return arr.find(r => rx.test(r.relacion || "")) || null;
  }
  async function edcFetchAreas() {
    try {
      const data = await edcApiJson('/areas');
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  // ==============================
  // RENDER DEL ESTADO DE CUENTA
  // ==============================
  async function edcRenderEstadoDeCuenta(paciente, areaSel = null) {
    if ($contenedor) {
      const etiquetaArea = areaSel?.nombre || (areaSel?.id ? `(Área seleccionada)` : 'Todas las áreas');
      $contenedor.innerHTML = `
        <p>Cargando estado de cuenta de <strong>${paciente?.nombre || "-"}</strong>
        ${areaSel ? ` — <em>${etiquetaArea}</em>` : ''}...</p>
      `;
    }

    try {
      let path = `/estado-de-cuenta/${paciente.dni}`;
      const qs = [];
      if (areaSel?.id) qs.push(`areaId=${encodeURIComponent(areaSel.id)}`);
      if (areaSel?.nombre) qs.push(`areaNombre=${encodeURIComponent(areaSel.nombre)}`);
      if (qs.length) path += `?${qs.join('&')}`;

      const estado = await edcApiJson(path);
      if (!$contenedor) return;

      if (!estado || !Array.isArray(estado.movimientos)) {
        $contenedor.innerHTML = `<p>No se encontraron datos de estado de cuenta para ${paciente.nombre}${areaSel ? ` en <strong>${areaSel.nombre || ''}</strong>` : ''}.</p>`;
        return;
      }

      const total = estado.movimientos.reduce((sum, m) => sum + (m.monto || 0), 0);

      let html = `
        <h3>Estado de cuenta de ${paciente.nombre} (DNI ${paciente.dni})${areaSel ? ` — <small>${areaSel.nombre || ''}</small>` : ''}</h3>
        <p><strong>Total actual:</strong> $ ${total.toLocaleString("es-AR")}</p>
        <table border="1" cellpadding="6" cellspacing="0">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Área</th>
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
            <td>${m.areaNombre ?? m.area ?? "-"}</td>
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
      if ($contenedor) $contenedor.innerHTML = `<p>Error al obtener el estado de cuenta.</p>`;
    }
  }

  // ==============================
  // Descargar estado de cuenta
  // ==============================
  if ($btnDescargar) {
    $btnDescargar.addEventListener("click", async () => {
      try {
        const paciente = ($input?.value || '').trim();
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
  // Modal con selector de área
  // ==============================
  async function edcMostrarFichaPaciente(p = {}) {
    const AREAS = await edcFetchAreas();

    const abonado = val(p.condicionDePago);
    const estado = val(p.estado);
    const fechaN = val(p.fechaNacimiento);
    const colegio = val(p.colegio);
    const curso = val(p.curso);

    const prestador = val(p.prestador ?? getDeep(p, "obraSocial.prestador"));
    const credencial = val(p.credencial ?? getDeep(p, "obraSocial.credencial"));
    const tipoOS = val(p.tipo ?? getDeep(p, "obraSocial.tipo"));

    const rMadre = pickResponsable(p, "madre");
    const rPadre = pickResponsable(p, "padre");
    const rTutor = pickResponsable(p, "tutor");

    const madreNombre = val(rMadre?.nombre);
    const madreWsp = rMadre?.whatsapp || "";
    const madreMail = rMadre?.email || "";

    const padreNombre = val(rPadre?.nombre);
    const padreWsp = rPadre?.whatsapp || "";
    const padreMail = rPadre?.email || "";

    const tutorNombre = val(getDeep(p, "tutor.nombre") ?? rTutor?.nombre);
    const tutorWsp = (getDeep(p, "tutor.whatsapp") ?? rTutor?.whatsapp) || "";
    const tutorMail = (getDeep(p, "tutor.email") ?? rTutor?.email) || "";

    const wspLink = (num) => (num ? `<a href="https://wa.me/${num}" target="_blank" style="color:#25d366;text-decoration:none;">${num}</a>` : "sin datos");
    const mailLink = (mail) => (mail ? `<a href="mailto:${mail}" style="color:#1a73e8;text-decoration:none;">${mail}</a>` : "sin datos");

    const areaOptions = AREAS.map(a => `<option value="${a._id}">${a.nombre}</option>`).join("");

    const html = `
    <div style="text-align:left;font-family:'Segoe UI',sans-serif;color:#222;max-width:980px;margin:auto;">
      <h2 style="margin:0 0 12px 0;">${val(p.nombre, "Sin nombre")} - DNI ${val(p.dni, "-")}</h2>

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

      <div style="margin-top:14px;border:1px solid #ccc;border-radius:10px;padding:12px;">
        <label for="edcSelArea"><strong>Área para ver el estado de cuenta</strong></label>
        <select id="edcSelArea" class="swal2-select" style="width:100%;margin-top:6px;">
          <option value="">(Todas las áreas)</option>
          ${areaOptions}
        </select>
      </div>
    </div>`;

    const dlg = await Swal.fire({
      title: 'Ficha del Paciente',
      html,
      width: 1000,
      showCloseButton: true,
      showCancelButton: true,
      confirmButtonText: 'Ver estado de cuenta',
      cancelButtonText: 'Cerrar',
      focusConfirm: false
    });

    if (dlg.isConfirmed) {
      const selEl = document.getElementById('edcSelArea');
      const selId = selEl?.value || "";
      const found = AREAS.find(a => String(a._id) === String(selId));
      const areaSel = selId ? { id: selId, nombre: found?.nombre || null } : null;
      await edcRenderEstadoDeCuenta(p, areaSel);
    }
  }

  // Exponer solo si realmente lo necesitás fuera
  // window.edcMostrarFichaPaciente = edcMostrarFichaPaciente;

})();

