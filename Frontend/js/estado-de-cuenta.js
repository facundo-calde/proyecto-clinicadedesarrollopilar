// estado-de-cuenta.js (encapsulado para evitar colisiones de nombres)
(() => {
  'use strict';

  if (typeof window.Swal === 'undefined') {
    console.warn('SweetAlert2 no está cargado. Agregá el <script> del CDN antes de este archivo.');
  }

  // ==========================
  // 🔐 Sesión, anti-back y helpers
  // ==========================
  const EDC_LOGIN = 'index.html';
  const edcGoLogin = () => location.replace(EDC_LOGIN);

  let edcUsuarioSesion = null;
  try {
    edcUsuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null');
  } catch {
    edcUsuarioSesion = null;
  }
  const edcToken = localStorage.getItem('token');
  if (!edcToken) edcGoLogin();

  window.addEventListener('pageshow', (e) => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fromBF = e.persisted || (nav && nav.type === 'back_forward');
    if (fromBF && !localStorage.getItem('token')) edcGoLogin();
  });

  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    if (!localStorage.getItem('token')) edcGoLogin();
    else history.pushState(null, '', location.href);
  });

  (() => {
    const userNameEl = document.getElementById('userName');
    if (userNameEl && edcUsuarioSesion && edcUsuarioSesion.nombreApellido) {
      userNameEl.textContent = edcUsuarioSesion.nombreApellido;
    }
  })();

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

      /* Tabla más flexible */
      .edc-table { width:100%; border-collapse:collapse; table-layout:auto; }
      .edc-table th, .edc-table td { padding:10px; border-bottom:1px solid #ddd; font-size:14px; vertical-align:middle; }

      .edc-th { background:#f2f4ff; font-weight:600; }

      /* Min-widths (no fijos) y comportamiento de texto */
      .edc-col-mes   { min-width: 90px;  white-space:nowrap; }
      .edc-col-mod   { min-width: 220px; white-space:normal; word-break:break-word; }
      .edc-col-cant  { min-width: 70px;  text-align:right; white-space:nowrap; }
      .edc-col-prof  { min-width: 220px; white-space:normal; word-break:break-word; }
      .edc-col-pag   { min-width: 120px; text-align:right; white-space:nowrap; }
      .edc-col-apag  { min-width: 120px; text-align:right; white-space:nowrap; }
      .edc-col-saldo { min-width: 120px; text-align:right; white-space:nowrap; }
      .edc-col-est   { min-width: 110px; text-align:left;  white-space:nowrap; }
      .edc-col-obs   { min-width: 240px; white-space:normal; word-break:break-word; }

      .edc-total-row { background:#fafafa; font-weight:600; }
    `;
    const style = document.createElement('style');
    style.id = 'edc-inline-styles';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ==============================
  // ESTADO DE CUENTA – API JSON
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
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
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
    try {
      return await edcApiJson(`/pacientes/${encodeURIComponent(dni)}`);
    } catch {
      return null;
    }
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

  const val = (v, fb = "sin datos") =>
    (v === undefined || v === null || v === "" ? fb : v);

  const fmtARS = (n) => {
    const num = Number(n || 0);
    return `$ ${num.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  function pickResponsable(p, tipo) {
    const arr = Array.isArray(p && p.responsables) ? p.responsables : [];
    const rx = new RegExp(tipo, "i");
    return arr.find((r) => rx.test(r.relacion || "")) || null;
  }

  async function edcFetchAreas() {
    try {
      const data = await edcApiJson('/areas');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  // ==============================
  // RENDER DEL ESTADO DE CUENTA (en página)
  // ==============================
  async function edcRenderEstadoDeCuenta(paciente, areaSel = null) {
    if ($contenedor) {
      const etiquetaArea =
        (areaSel && areaSel.nombre) ||
        (areaSel && areaSel.id ? '(Área seleccionada)' : 'Todas las áreas');
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

      const filas = Array.isArray(estado.filas) ? estado.filas : [];
      const movs  = Array.isArray(estado.movimientos) ? estado.movimientos : [];

      if (!filas.length && !movs.length) {
        $contenedor.innerHTML = `<p>No se encontraron datos de estado de cuenta para ${paciente.nombre}${areaSel ? ` en <strong>${areaSel.nombre || ''}</strong>` : ''}.</p>`;
        return;
      }

      if (filas.length) {
        const tot = estado.totales || {};
        const totalAPagar = Number(tot.aPagar || 0);
        const totalPagado = Number(
          (tot.pagadoOS || 0) +
          (tot.pagadoPART || 0) +
          (tot.ajustesMas || 0) -
          (tot.ajustesMenos || 0)
        );
        const saldo = Number(
          tot.saldo || (totalAPagar - totalPagado)
        );

        let html = `
          <h3>Estado de cuenta de ${paciente.nombre} (DNI ${paciente.dni})${areaSel ? ` — <small>${areaSel.nombre || ''}</small>` : ''}</h3>
          <p><strong>Total actual:</strong> ${fmtARS(saldo)}</p>
          <table class="edc-table">
            <thead>
              <tr class="edc-th">
                <th class="edc-col-mes">Mes</th>
                <th class="edc-col-mod">Módulo</th>
                <th class="edc-col-cant">Cant.</th>
                <th class="edc-col-prof">Profesional</th>
                <th class="edc-col-apag">A pagar</th>
              </tr>
            </thead>
            <tbody>
        `;
        filas.forEach((f) => {
          const profesional =
            f.profesional ||
            (f.profesionales &&
              (f.profesionales.profesional?.[0] ||
                f.profesionales.coordinador?.[0] ||
                f.profesionales.pasante?.[0] ||
                f.profesionales.directora?.[0])) ||
            "-";
          const modulo = f.moduloNombre || f.modulo || f.moduloNumero || "-";
          const cant =
            f.cantidad != null ? f.cantidad : f.cant != null ? f.cant : 1;
          const aPagar = Number(f.aPagar || 0);

          html += `
            <tr>
              <td class="edc-col-mes">${f.mes || "-"}</td>
              <td class="edc-col-mod">${modulo}</td>
              <td class="edc-col-cant">${cant}</td>
              <td class="edc-col-prof">${profesional}</td>
              <td class="edc-col-apag">${fmtARS(aPagar)}</td>
            </tr>
          `;
        });
        html += `
            </tbody>
            <tfoot>
              <tr class="edc-total-row">
                <td colspan="4" style="text-align:right;">TOTAL A PAGAR</td>
                <td class="edc-col-apag">${fmtARS(totalAPagar)}</td>
              </tr>
              <tr>
                <td colspan="4" style="text-align:right;">TOTAL PAGADO (OS+PART+AJUSTES)</td>
                <td class="edc-col-apag">${fmtARS(totalPagado)}</td>
              </tr>
              <tr>
                <td colspan="4" style="text-align:right;">SALDO</td>
                <td class="edc-col-apag">${fmtARS(saldo)}</td>
              </tr>
            </tfoot>
          </table>
        `;
        $contenedor.innerHTML = html;
        return;
      }

      // Fallback a movimientos crudos
      const total = movs.reduce((sum, m) => sum + Number(m.monto || 0), 0);
      let html = `
        <h3>Estado de cuenta de ${paciente.nombre} (DNI ${paciente.dni})${areaSel ? ` — <small>${areaSel.nombre || ''}</small>` : ''}</h3>
        <p><strong>Total actual:</strong> ${fmtARS(total)}</p>
        <table class="edc-table">
          <thead>
            <tr class="edc-th">
              <th class="edc-col-mes">Fecha</th>
              <th class="edc-col-mod">Área</th>
              <th class="edc-col-prof">Concepto</th>
              <th class="edc-col-apag">Monto</th>
              <th class="edc-col-est">Tipo</th>
            </tr>
          </thead>
          <tbody>
      `;
      movs.forEach((m) => {
        const concepto =
          (m.moduloNombre
            ? `${m.moduloNombre}${m.cantidad ? ` × ${m.cantidad}` : ""}`
            : null) || m.descripcion || "-";
        html += `
          <tr>
            <td class="edc-col-mes">${
              m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "-"
            }</td>
            <td class="edc-col-mod">${m.areaNombre ?? m.area ?? "-"}</td>
            <td class="edc-col-prof">${concepto}</td>
            <td class="edc-col-apag">${fmtARS(Number(m.monto || 0))}</td>
            <td class="edc-col-est">${m.tipo ?? "-"}</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
      $contenedor.innerHTML = html;
    } catch (err) {
      console.error("Error al cargar estado de cuenta:", err);
      if ($contenedor)
        $contenedor.innerHTML = `<p>Error al obtener el estado de cuenta.</p>`;
    }
  }

  // ==============================
  // Descargar estado de cuenta (PDF) – botón general
  // ==============================
  if ($btnDescargar) {
    $btnDescargar.addEventListener("click", async () => {
      try {
        const term =
          ($input && $input.value ? $input.value : "").trim();
        if (!term) {
          alert(
            "Primero buscá y abrí la ficha del paciente para elegir el área."
          );
          return;
        }
        alert(
          "Para descargar el PDF usá el botón 'Descargar PDF' dentro del modal de Estado de cuenta (ahí elige el área)."
        );
      } catch (err) {
        console.error(err);
        alert("No se pudo descargar el estado de cuenta.");
      }
    });
  }

  // ==============================
  // Modal de detalle por área (diseño tipo Excel)
  // ==============================
  async function edcMostrarEstadoCuentaAreaModal(paciente, areaSel) {
    try {
      // 1) Armar URL
      let path = `/estado-de-cuenta/${paciente.dni}`;
      const qs = [];
      if (areaSel && areaSel.id) qs.push(`areaId=${encodeURIComponent(areaSel.id)}`);
      if (areaSel && areaSel.nombre) qs.push(`areaNombre=${encodeURIComponent(areaSel.nombre)}`);
      if (qs.length) path += `?${qs.join("&")}`;

      // 2) Traer datos
      const data = await edcApiJson(path);

      const filas = Array.isArray(data.filas) ? data.filas : [];
      const movimientos = Array.isArray(data.movimientos) ? data.movimientos : [];
      const facturas = Array.isArray(data.facturas) ? data.facturas : [];

      const tot = data.totales || {};
      const totalAPagar = Number(tot.aPagar || 0);
      const totalPagado = Number(
        (tot.pagadoOS || 0) +
          (tot.pagadoPART || 0) +
          (tot.ajustesMas || 0) -
          (tot.ajustesMenos || 0)
      );
      const totalSaldo = Number(
        tot.saldo != null ? tot.saldo : totalAPagar - totalPagado
      );

      const totalFacturado = facturas.reduce(
        (acc, f) => acc + Number(f.monto || f.total || 0),
        0
      );
      const difFactPag = totalFacturado - totalPagado;

      // 3) Normalizar filas tipo Excel
      const filasParaMostrar = filas.length
        ? filas.map((f) => {
            const mes = f.mes || "-";
            const modulo = f.moduloNombre || f.modulo || f.moduloNumero || "-";
            const cantidad =
              f.cantidad != null ? f.cantidad : f.cant != null ? f.cant : 1;
            const profesional =
              f.profesional ||
              (f.profesionales &&
                (f.profesionales.profesional?.[0] ||
                  f.profesionales.coordinador?.[0] ||
                  f.profesionales.pasante?.[0] ||
                  f.profesionales.directora?.[0])) ||
              "-";

            // Montos padres vs OS
            const pagPadres = Number(
              f.pagadoPadres ??
                f.pagadoPART ??
                f.pagoPadres ??
                0
            );
            const pagOS = Number(
              f.pagadoOS ??
                f.pagoOS ??
                f.pagadoObraSocial ??
                0
            );

            const aPagar = Number(f.aPagar || 0);

            const detPadres =
              f.detallePadres || f.obsPadres || f.detallePART || "";
            const detOS =
              f.detalleOS ||
              f.detalleObraSocial ||
              f.obsOS ||
              "";

            return {
              mes,
              modulo,
              cantidad,
              profesional,
              aPagar,
              pagPadres,
              pagOS,
              detPadres,
              detOS,
            };
          })
        : movimientos.map((m) => {
            const mes = m.mes || m.period || m.periodo || "-";
            const modulo =
              m.moduloNombre || m.modulo || m.moduloNumero || "-";
            const cantidad =
              m.cantidad != null ? m.cantidad : m.cant != null ? m.cant : 1;
            const profesional = m.profesional || m.profesionalNombre || "-";

            const pagPadres = Number(
              m.pagadoPadres ??
                m.pagadoPART ??
                (m.tipo === "PADRES" ? m.monto : 0) ??
                0
            );
            const pagOS = Number(
              m.pagadoOS ??
                (m.tipo === "OBRA_SOCIAL" ? m.monto : 0) ??
                0
            );

            const aPagar = Number(
              m.aPagar != null ? m.aPagar : m.monto || 0
            );

            const detPadres =
              m.detallePadres ||
              m.observacionPadres ||
              m.observaciones ||
              "";
            const detOS =
              m.detalleOS ||
              m.detalleObraSocial ||
              m.observacionOS ||
              "";

            return {
              mes,
              modulo,
              cantidad,
              profesional,
              aPagar,
              pagPadres,
              pagOS,
              detPadres,
              detOS,
            };
          });

      const rowsHtml = filasParaMostrar
        .map(
          (r) => `
        <tr>
          <td class="edc-col-mes">${r.mes}</td>
          <td class="edc-col-cant" style="text-align:center;">${r.cantidad}</td>
          <td class="edc-col-mod">${r.modulo}</td>
          <td class="edc-col-prof">${r.profesional}</td>
          <td class="edc-col-apag">${fmtARS(r.aPagar)}</td>
          <td class="edc-col-pag">${fmtARS(r.pagPadres)}</td>
          <td class="edc-col-obs">${r.detPadres || ""}</td>
          <td class="edc-col-pag">${fmtARS(r.pagOS)}</td>
          <td class="edc-col-obs">${r.detOS || ""}</td>
        </tr>
      `
        )
        .join("");

      // FACTURAS (lado derecho)
      const factRowsHtml = facturas
        .map((f) => {
          const mes =
            f.mes ||
            f.periodo ||
            (f.fecha
              ? new Date(f.fecha).toLocaleDateString("es-AR", {
                  year: "numeric",
                  month: "2-digit",
                })
              : "-");
          const fecha = f.fecha
            ? new Date(f.fecha).toLocaleDateString("es-AR")
            : "-";
          const nro = f.numero || f.nro || f.nFactura || "-";
          const monto = Number(f.monto || f.total || 0);
          const detalle =
            f.detalle || f.descripcion || f.observacion || "";

          return `
          <tr>
            <td class="edc-col-mes">${mes}</td>
            <td style="text-align:center;min-width:80px;">${nro}</td>
            <td class="edc-col-apag">${fmtARS(monto)}</td>
            <td class="edc-col-obs">${detalle}</td>
            <td class="edc-col-mes">${fecha}</td>
          </tr>
        `;
        })
        .join("");

      const areaNombre =
        (areaSel && areaSel.nombre) || "Todas las áreas";

      const html = `
      <div style="text-align:left;font-family:'Segoe UI',sans-serif;">
        <!-- CABECERA VERDE -->
        <div style="
          background:#7fbf32;
          color:#fff;
          padding:6px 10px;
          font-weight:600;
          display:flex;
          justify-content:space-between;
          align-items:center;
          border-radius:6px 6px 0 0;
        ">
          <span>AREA: ${areaNombre.toUpperCase()}</span>
          ${
            facturas.length
              ? `<span style="font-size:13px;">DIF ENTRE FACT Y PAGADO: ${fmtARS(difFactPag)}</span>`
              : ""
          }
        </div>

        <!-- CUERPO PRINCIPAL -->
        <div style="
          border:1px solid #7fbf32;
          border-top:none;
          border-radius:0 0 6px 6px;
          padding:8px;
          background:#f8fff4;
          display:flex;
          gap:10px;
        ">
          <!-- IZQUIERDA: MÓDULOS / PAGOS -->
          <div style="flex:3;min-width:0;">
            <table class="edc-table">
              <thead>
                <tr class="edc-th">
                  <th class="edc-col-mes">MES</th>
                  <th class="edc-col-cant">CANT</th>
                  <th class="edc-col-mod">CÓDIGO / MÓDULO</th>
                  <th class="edc-col-prof">PROFESIONAL</th>
                  <th class="edc-col-apag">A PAGAR</th>
                  <th class="edc-col-pag">PAGADO POR PADRES</th>
                  <th class="edc-col-obs">DETALLE</th>
                  <th class="edc-col-pag">PAGADO POR O.S</th>
                  <th class="edc-col-obs">DETALLE</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rowsHtml ||
                  `<tr><td colspan="9" style="padding:10px;"><em>Sin movimientos para esta área.</em></td></tr>`
                }
              </tbody>
              <tfoot>
                <tr class="edc-total-row">
                  <td colspan="4" style="text-align:left;">Total que debería haber pagado</td>
                  <td class="edc-col-apag">${fmtARS(totalAPagar)}</td>
                  <td colspan="4"></td>
                </tr>
                <tr class="edc-total-row">
                  <td colspan="4" style="text-align:left;">Total que pagó (OS + Padres + ajustes)</td>
                  <td class="edc-col-apag">${fmtARS(totalPagado)}</td>
                  <td colspan="4"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- DERECHA: FACTURAS -->
          ${
            facturas.length
              ? `
          <div style="flex:2;min-width:0;">
            <div style="background:#7fbf32;color:#fff;padding:4px 6px;font-weight:600;margin-bottom:4px;">
              FACTURAS
            </div>
            <table class="edc-table">
              <thead>
                <tr class="edc-th">
                  <th class="edc-col-mes">MES</th>
                  <th style="min-width:80px;">N FACTURA</th>
                  <th class="edc-col-apag">MONTO</th>
                  <th class="edc-col-obs">DETALLE</th>
                  <th class="edc-col-mes">FECHA</th>
                </tr>
              </thead>
              <tbody>
                ${factRowsHtml}
              </tbody>
              <tfoot>
                <tr class="edc-total-row">
                  <td colspan="2" style="text-align:left;">Total que se le facturó</td>
                  <td class="edc-col-apag">${fmtARS(totalFacturado)}</td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          `
              : ""
          }
        </div>

        <!-- TOTALES FINALES / DIF -->
        ${
          facturas.length
            ? `
        <div style="margin-top:8px;padding:6px 8px;border-radius:6px;background:#fffbea;border:1px solid #f0c36d;">
          <strong>Diferencia entre facturado y pagado:</strong>
          <span style="margin-left:6px;">${fmtARS(difFactPag)}</span>
        </div>
        `
            : ""
        }

        <!-- BOTÓN PDF -->
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
          <button id="edcBtnDescargarPDF"
                  class="swal2-confirm swal2-styled"
                  style="background:#6c5ce7;">
            Descargar PDF
          </button>
        </div>
      </div>
    `;

      await Swal.fire({
        title: "Estado de cuenta",
        html,
        width: 1100,
        showCloseButton: true,
        confirmButtonText: "Cerrar",
      });

      // 4) Acción Descargar PDF
      const $pdfBtn = document.getElementById("edcBtnDescargarPDF");
      if ($pdfBtn) {
        $pdfBtn.addEventListener("click", () => {
          let url = `/api/estado-de-cuenta/${encodeURIComponent(
            paciente.dni
          )}/extracto`;
          const qs2 = [];
          if (areaSel && areaSel.id)
            qs2.push(`areaId=${encodeURIComponent(areaSel.id)}`);
          if (qs2.length) url += `?${qs2.join("&")}`;
          window.open(url, "_blank");
        });
      }
    } catch (e) {
      console.error("Error al abrir modal de estado de cuenta:", e);
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo cargar el estado de cuenta del área seleccionada.",
      });
    }
  }

  // ==============================
  // Modal ficha de paciente + selector de área
  // ==============================
  async function edcMostrarFichaPaciente(p = {}) {
    const AREAS = await edcFetchAreas();

    const abonado = val(p.condicionDePago);
    const estado = val(p.estado);
    const fechaN = val(p.fechaNacimiento);
    const colegio = val(p.colegio);
    const curso = val(p.curso);

    const prestador = val(
      p.prestador != null ? p.prestador : getDeep(p, "obraSocial.prestador")
    );
    const credencial = val(
      p.credencial != null ? p.credencial : getDeep(p, "obraSocial.credencial")
    );
    const tipoOS = val(
      p.tipo != null ? p.tipo : getDeep(p, "obraSocial.tipo")
    );

    const rMadre = pickResponsable(p, "madre");
    const rPadre = pickResponsable(p, "padre");
    const rTutor = pickResponsable(p, "tutor");

    const madreNombre = val(rMadre && rMadre.nombre);
    const madreWsp = (rMadre && rMadre.whatsapp) || "";
    const madreMail = (rMadre && rMadre.email) || "";

    const padreNombre = val(rPadre && rPadre.nombre);
    const padreWsp = (rPadre && rPadre.whatsapp) || "";
    const padreMail = (rPadre && rPadre.email) || "";

    const tutorNombre = val(
      getDeep(p, "tutor.nombre") != null
        ? getDeep(p, "tutor.nombre")
        : rTutor && rTutor.nombre
    );
    const tutorWsp =
      (getDeep(p, "tutor.whatsapp") != null
        ? getDeep(p, "tutor.whatsapp")
        : rTutor && rTutor.whatsapp) || "";
    const tutorMail =
      (getDeep(p, "tutor.email") != null
        ? getDeep(p, "tutor.email")
        : rTutor && rTutor.email) || "";

    const wspLink = (num) =>
      num
        ? `<a href="https://wa.me/${num}" target="_blank" style="color:#25d366;text-decoration:none;">${num}</a>`
        : "sin datos";
    const mailLink = (mail) =>
      mail
        ? `<a href="mailto:${mail}" style="color:#1a73e8;text-decoration:none;">${mail}</a>`
        : "sin datos";

    const areaOptions = AREAS.map(
      (a) => `<option value="${a._id}">${a.nombre}</option>`
    ).join("");

    const html = `
    <div style="text-align:left;font-family:'Segoe UI',sans-serif;color:#222;max-width:980px;margin:auto;">
      <h2 style="margin:0 0 12px 0;">${val(
        p.nombre,
        "Sin nombre"
      )} - DNI ${val(p.dni, "-")}</h2>

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
      title: "Ficha del Paciente",
      html,
      width: 1000,
      showCloseButton: true,
      showCancelButton: true,
      confirmButtonText: "Ver estado de cuenta",
      cancelButtonText: "Cerrar",
      focusConfirm: false,
    });

    if (dlg.isConfirmed) {
      const selEl = document.getElementById("edcSelArea");
      const selId = selEl ? selEl.value : "";
      const found = AREAS.find((a) => String(a._id) === String(selId));
      const areaSelObj = selId
        ? { id: selId, nombre: (found && found.nombre) || null }
        : null;
      await edcMostrarEstadoCuentaAreaModal(p, areaSelObj);
    }
  }

  // window.edcMostrarFichaPaciente = edcMostrarFichaPaciente;
})();



