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
    const fromBF = e.persisted || (nav && nav.type === 'back_forward');
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
    if (userNameEl && edcUsuarioSesion && edcUsuarioSesion.nombreApellido) {
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
  const $input        = document.getElementById("busquedaInputEDC");
  const $btnBuscar    = document.getElementById("btnBuscarEDC");
  const $sugerencias  = document.getElementById("sugerenciasEDC");
  const $contenedor   = document.getElementById("estadoCuentaContainer");
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
      edcBuscarPacientes($input ? $input.value : "");
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

  const fmtARS = (n) => {
    const num = Number(n || 0);
    return `$ ${num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  function pickResponsable(p, tipo) {
    const arr = Array.isArray(p && p.responsables) ? p.responsables : [];
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
  // RENDER DEL ESTADO DE CUENTA (en página)
  // ==============================
  async function edcRenderEstadoDeCuenta(paciente, areaSel = null) {
    if ($contenedor) {
      const etiquetaArea = (areaSel && areaSel.nombre) || (areaSel && areaSel.id ? '(Área seleccionada)' : 'Todas las áreas');
      $contenedor.innerHTML = `
        <p>Cargando estado de cuenta de <strong>${(paciente && paciente.nombre) || "-"}</strong>
        ${areaSel ? ` — <em>${etiquetaArea}</em>` : ''}...</p>
      `;
    }

    try {
      let path = `/estado-de-cuenta/${paciente.dni}`;
      const qs = [];
      if (areaSel && areaSel.id) qs.push(`areaId=${encodeURIComponent(areaSel.id)}`);
      if (areaSel && areaSel.nombre) qs.push(`areaNombre=${encodeURIComponent(areaSel.nombre)}`);
      if (qs.length) path += `?${qs.join('&')}`;

      const estado = await edcApiJson(path);
      if (!$contenedor) return;

      // Preferimos filas + totales. Si no vienen, caemos a movimientos.
      const filas = Array.isArray(estado.filas) ? estado.filas : [];
      const movs  = Array.isArray(estado.movimientos) ? estado.movimientos : [];

      if (!filas.length && !movs.length) {
        $contenedor.innerHTML = `<p>No se encontraron datos de estado de cuenta para ${paciente.nombre}${areaSel ? ` en <strong>${areaSel.nombre || ''}</strong>` : ''}.</p>`;
        return;
      }

      if (filas.length) {
        const tot = estado.totales || {};
        const totalAPagar = Number(tot.aPagar || 0);
        const totalPagado = Number((tot.pagadoOS || 0) + (tot.pagadoPART || 0) + (tot.ajustesMas || 0) - (tot.ajustesMenos || 0));
        const saldo       = Number(tot.saldo || (totalAPagar - totalPagado));

        let html = `
          <h3>Estado de cuenta de ${paciente.nombre} (DNI ${paciente.dni})${areaSel ? ` — <small>${areaSel.nombre || ''}</small>` : ''}</h3>
          <p><strong>Total actual:</strong> ${fmtARS(saldo)}</p>
          <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Módulo</th>
                <th>Cant.</th>
                <th>Profesional</th>
                <th>A pagar</th>
              </tr>
            </thead>
            <tbody>
        `;
        filas.forEach(f => {
          const profesional =
            f.profesional ||
            (f.profesionales && (f.profesionales.profesional?.[0] || f.profesionales.coordinador?.[0] || f.profesionales.pasante?.[0] || f.profesionales.directora?.[0])) ||
            "-";
          const modulo = f.modulo || f.moduloNumero || "-";
          const cant   = f.cantidad != null ? f.cantidad : (f.cant != null ? f.cant : 1);
          const aPagar = Number(f.aPagar || 0);

          html += `
            <tr>
              <td>${f.mes || "-"}</td>
              <td>${modulo}</td>
              <td style="text-align:right;">${cant}</td>
              <td>${profesional}</td>
              <td style="text-align:right;">${fmtARS(aPagar)}</td>
            </tr>
          `;
        });
        html += `
            </tbody>
            <tfoot>
              <tr style="background:#fafafa;font-weight:600;">
                <td colspan="4" style="text-align:right;">TOTAL A PAGAR</td>
                <td style="text-align:right;">${fmtARS(totalAPagar)}</td>
              </tr>
              <tr>
                <td colspan="4" style="text-align:right;">TOTAL PAGADO (OS+PART+AJUSTES)</td>
                <td style="text-align:right;">${fmtARS(totalPagado)}</td>
              </tr>
              <tr>
                <td colspan="4" style="text-align:right;">SALDO</td>
                <td style="text-align:right;">${fmtARS(saldo)}</td>
              </tr>
            </tfoot>
          </table>
        `;
        $contenedor.innerHTML = html;
        return;
      }

      // Fallback a movimientos crudos
      const total = movs.reduce((sum, m) => sum + (m.monto || 0), 0);
      let html = `
        <h3>Estado de cuenta de ${paciente.nombre} (DNI ${paciente.dni})${areaSel ? ` — <small>${areaSel.nombre || ''}</small>` : ''}</h3>
        <p><strong>Total actual:</strong> ${fmtARS(total)}</p>
        <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse">
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
      movs.forEach((m) => {
        html += `
          <tr>
            <td>${m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR') : "-"}</td>
            <td>${m.areaNombre ?? m.area ?? "-"}</td>
            <td>${m.descripcion ?? "-"}</td>
            <td style="text-align:right;">${fmtARS(m.monto)}</td>
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
  // Descargar estado de cuenta (PDF)
  // ==============================
  // NOTA: este botón solo abrirá el PDF del último paciente buscado y área elegida en el modal.
  // Si necesitás elegir área acá también, tendríamos que guardar en una variable global la última selección.
  if ($btnDescargar) {
    $btnDescargar.addEventListener("click", async () => {
      try {
        // Intento: si hay texto en el input, busco el paciente por DNI exacto (si es numérico) o muestro aviso
        const term = ($input && $input.value ? $input.value : '').trim();
        if (!term) { alert("Primero buscá y abrí la ficha del paciente para elegir el área."); return; }
        // Este botón queda como auxiliar. El flujo recomendado es usar el botón del modal (ver abajo).
        alert("Para descargar el PDF usá el botón 'Descargar PDF' dentro del modal de Estado de cuenta (ahí elige el área).");
      } catch (err) {
        console.error(err);
        alert("No se pudo descargar el estado de cuenta.");
      }
    });
  }

  // ==============================
  // Modal con selector de área + Modal de detalle por área
  // ==============================
  async function edcMostrarEstadoCuentaAreaModal(paciente, areaSel) {
    try {
      let path = `/estado-de-cuenta/${paciente.dni}`;
      const qs = [];
      if (areaSel && areaSel.id) qs.push(`areaId=${encodeURIComponent(areaSel.id)}`);
      if (areaSel && areaSel.nombre) qs.push(`areaNombre=${encodeURIComponent(areaSel.nombre)}`);
      if (qs.length) path += `?${qs.join('&')}`;

      const data = await edcApiJson(path);

      // Preferimos filas con totales
      const filas = Array.isArray(data.filas) ? data.filas : [];
      const movimientos = Array.isArray(data.movimientos) ? data.movimientos : [];
      const tot = data.totales || {};
      const totalAPagar = Number(tot.aPagar || 0);
      const totalPagado = Number((tot.pagadoOS || 0) + (tot.pagadoPART || 0) + (tot.ajustesMas || 0) - (tot.ajustesMenos || 0));
      const totalSaldo  = Number(tot.saldo || (totalAPagar - totalPagado));

      // Construcción de filas visuales compatibles
      const filasParaMostrar = filas.length
        ? filas.map(f => {
            const mes = f.mes || "-";
            const modulo = f.modulo || f.moduloNumero || "-";
            const cantidad = f.cantidad != null ? f.cantidad : (f.cant != null ? f.cant : 1);
            const profesional =
              f.profesional ||
              (f.profesionales && (f.profesionales.profesional?.[0] || f.profesionales.coordinador?.[0] || f.profesionales.pasante?.[0] || f.profesionales.directora?.[0])) ||
              "-";
            const pagado = Number(f.pagado || 0); // si no traemos por fila, queda 0
            const aPagar = Number(f.aPagar || 0);
            const saldo  = Number(f.saldo != null ? f.saldo : (aPagar - pagado));
            const estado = f.estado || (saldo <= 0 ? "PAGADO" : "PENDIENTE");
            const observacion = f.obs || f.observaciones || "";

            return { mes, modulo, cantidad, profesional, pagado, aPagar, saldo, estado, observacion };
          })
        : movimientos.map(m => {
            const mes = m.mes || m.period || m.periodo || "-";
            const modulo = m.moduloNombre || m.modulo || m.moduloNumero || "-";
            const cantidad = m.cantidad != null ? m.cantidad : (m.cant != null ? m.cant : 1);
            const profesional = m.profesional || m.profesionalNombre || "-";
            const pagado = Number(m.pagado != null ? m.pagado : (m.pago || 0));
            const aPagar = Number(m.aPagar != null ? m.aPagar : (m.monto || 0));
            const saldo  = Number(m.saldo != null ? m.saldo : (aPagar - pagado));
            const estado = m.estado || (saldo <= 0 ? "PAGADO" : "PENDIENTE");
            const observacion = m.observaciones || m.observacion || "";

            return { mes, modulo, cantidad, profesional, pagado, aPagar, saldo, estado, observacion };
          });

      const rowsHtml = filasParaMostrar.map((r) => `
        <tr>
          <td>${r.mes}</td>
          <td>${r.modulo}</td>
          <td style="text-align:right;">${r.cantidad}</td>
          <td>${r.profesional}</td>
          <td style="text-align:right;">${fmtARS(r.pagado)}</td>
          <td style="text-align:right;">${fmtARS(r.aPagar)}</td>
          <td style="text-align:right;">${fmtARS(r.saldo)}</td>
          <td>${r.estado}</td>
          <td>${r.observacion || '<em>Sin observaciones</em>'}</td>
        </tr>
      `).join("");

      const html = `
        <div style="text-align:left;font-family:'Segoe UI',sans-serif;">
          <h3 style="margin:0 0 8px 0;">${paciente.nombre} — ${areaSel && areaSel.nombre ? areaSel.nombre : 'Estado de cuenta'}</h3>
          <div style="overflow:auto; max-height:60vh; border:1px solid #d0d0d0; border-radius:8px;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead style="background:#f2f4ff;">
                <tr>
                  <th style="padding:8px; border-bottom:1px solid #ddd;">MES</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd;">MÓDULO</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd;">CANT.</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd;">PROFESIONAL</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">PAGADO</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">A PAGAR</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd; text-align:right;">SALDO</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd;">ESTADO</th>
                  <th style="padding:8px; border-bottom:1px solid #ddd;">OBSERVACIONES</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="9" style="padding:10px;"><em>Sin movimientos para esta área.</em></td></tr>`}
              </tbody>
              <tfoot>
                <tr style="background:#fafafa; font-weight:600;">
                  <td colspan="4" style="padding:8px;">TOTAL</td>
                  <td style="padding:8px; text-align:right;">${fmtARS(totalPagado)}</td>
                  <td style="padding:8px; text-align:right;">${fmtARS(totalAPagar)}</td>
                  <td style="padding:8px; text-align:right;">${fmtARS(totalSaldo)}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
            <button id="edcBtnDescargarPDF" class="swal2-confirm swal2-styled" style="background:#6c5ce7;">Descargar PDF</button>
          </div>
        </div>
      `;

      await Swal.fire({
        title: 'Estado de cuenta',
        html,
        width: 1100,
        showCloseButton: true,
        confirmButtonText: 'Cerrar',
      });

      // Acción de descarga del PDF (usa tu endpoint /api/estado-de-cuenta/:dni/extracto)
      const $pdfBtn = document.getElementById('edcBtnDescargarPDF');
      if ($pdfBtn) {
        $pdfBtn.addEventListener('click', () => {
          let url = `/api/estado-de-cuenta/${encodeURIComponent(paciente.dni)}/extracto`;
          const qs = [];
          if (areaSel && areaSel.id) qs.push(`areaId=${encodeURIComponent(areaSel.id)}`);
          // si usás period, agregalo acá, ej: qs.push(`period=${encodeURIComponent(period)}`)
          if (qs.length) url += `?${qs.join('&')}`;
          window.open(url, '_blank');
        });
      }

    } catch (e) {
      console.error('Error al abrir modal de estado de cuenta:', e);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo cargar el estado de cuenta del área seleccionada.',
      });
    }
  }

  async function edcMostrarFichaPaciente(p = {}) {
    const AREAS = await edcFetchAreas();

    const abonado = val(p.condicionDePago);
    const estado  = val(p.estado);
    const fechaN  = val(p.fechaNacimiento);
    const colegio = val(p.colegio);
    const curso   = val(p.curso);

    const prestador  = val((p.prestador != null ? p.prestador : getDeep(p, "obraSocial.prestador")));
    const credencial = val((p.credencial != null ? p.credencial : getDeep(p, "obraSocial.credencial")));
    const tipoOS     = val((p.tipo != null ? p.tipo : getDeep(p, "obraSocial.tipo")));

    const rMadre = pickResponsable(p, "madre");
    const rPadre = pickResponsable(p, "padre");
    const rTutor = pickResponsable(p, "tutor");

    const madreNombre = val(rMadre && rMadre.nombre);
    const madreWsp    = (rMadre && rMadre.whatsapp) || "";
    const madreMail   = (rMadre && rMadre.email) || "";

    const padreNombre = val(rPadre && rPadre.nombre);
    const padreWsp    = (rPadre && rPadre.whatsapp) || "";
    const padreMail   = (rPadre && rPadre.email) || "";

    const tutorNombre = val((getDeep(p, "tutor.nombre") != null ? getDeep(p, "tutor.nombre") : (rTutor && rTutor.nombre)));
    const tutorWsp    = (getDeep(p, "tutor.whatsapp") != null ? getDeep(p, "tutor.whatsapp") : (rTutor && rTutor.whatsapp)) || "";
    const tutorMail   = (getDeep(p, "tutor.email") != null ? getDeep(p, "tutor.email") : (rTutor && rTutor.email)) || "";

    const wspLink  = (num)  => (num ? `<a href="https://wa.me/${num}" target="_blank" style="color:#25d366;text-decoration:none;">${num}</a>` : "sin datos");
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
        <label for="edcSelArea" style="display:block;margin-bottom:6px;"><strong>Área para ver el estado de cuenta</strong></label>
        <div style="display:flex;justify-content:center;">
          <select id="edcSelArea" class="swal2-select"
            style="width:95%;max-width:420px;padding:6px 8px;border-radius:8px;border:1px solid #bbb;">
            <option value="">(Todas las áreas)</option>
            ${areaOptions}
          </select>
        </div>
      </div>
    </div>
    `;

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
      const selId = selEl ? selEl.value : "";
      const found = AREAS.find(a => String(a._id) === String(selId));
      const areaSel = selId ? { id: selId, nombre: (found && found.nombre) || null } : null;
      await edcMostrarEstadoCuentaAreaModal(p, areaSel);
    }
  }

  // Exponer si querés usarlo externamente (opcional):
  // window.edcMostrarFichaPaciente = edcMostrarFichaPaciente;

})();
