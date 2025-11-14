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
async function edcFetchModulos() {
  try {
    const data = await edcApiJson('/modulos');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function edcFetchUsuarios() {
  try {
    const data = await edcApiJson('/usuarios');
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
// Modal de detalle por área (Excel + editable + selects)
// ==============================
async function edcMostrarEstadoCuentaAreaModal(paciente, areaSel) {
  try {
    // Catálogos
    const [AREAS, MODULOS_ALL, USUARIOS_ALL] = await Promise.all([
      edcFetchAreas(),
      edcFetchModulos(),
      edcFetchUsuarios(),
    ]);

    const areaId     = areaSel && areaSel.id ? String(areaSel.id) : null;
    const areaNombre = areaSel && areaSel.nombre ? String(areaSel.nombre) : null;

    // Módulos filtrados por área (si se puede)
    const MODULOS = MODULOS_ALL.filter((m) => {
      if (!areaId && !areaNombre) return true;
      const mAreaId =
        m.areaId || (m.area && m.area._id) || m.area || null;
      const mAreaNom =
        m.areaNombre ||
        (typeof m.area === "string" ? m.area : m.area && m.area.nombre) ||
        null;

      if (areaId && mAreaId && String(mAreaId) === areaId) return true;
      if (
        areaNombre &&
        mAreaNom &&
        mAreaNom.toLowerCase() === areaNombre.toLowerCase()
      )
        return true;

      return !mAreaId && !mAreaNom;
    });

    const moduloMap = {};
    MODULOS.forEach((m) => {
      moduloMap[String(m._id)] = m;
    });

    // Profesionales por rol y área
    const PROFESIONALES = USUARIOS_ALL.filter((u) => {
      const roles = [];
      if (u.rol) roles.push(String(u.rol));
      if (u.role) roles.push(String(u.role));
      if (Array.isArray(u.roles)) roles.push(...u.roles.map(String));

      const esProf = roles.some((r) =>
        r.toLowerCase().includes("prof")
      );
      if (!esProf) return false;

      if (!areaId && !areaNombre) return true;

      const areasUser = [];

      if (Array.isArray(u.areasProfesional)) {
        u.areasProfesional.forEach((a) => {
          if (!a) return;
          if (typeof a === "string") areasUser.push(a.toLowerCase());
          else if (a.nombre) areasUser.push(a.nombre.toLowerCase());
          else if (a.area) areasUser.push(String(a.area).toLowerCase());
        });
      }
      if (u.area && typeof u.area === "string")
        areasUser.push(u.area.toLowerCase());
      if (u.areaNombre) areasUser.push(u.areaNombre.toLowerCase());

      if (areaNombre && areasUser.includes(areaNombre.toLowerCase()))
        return true;

      return !areasUser.length;
    });

    const profMap = {};
    PROFESIONALES.forEach((p) => {
      profMap[String(p._id)] = p;
    });

    // ================== Datos de estado de cuenta ==================
    let path = `/estado-de-cuenta/${paciente.dni}`;
    const qs = [];
    if (areaSel && areaSel.id) qs.push(`areaId=${encodeURIComponent(areaSel.id)}`);
    if (areaSel && areaSel.nombre) qs.push(`areaNombre=${encodeURIComponent(areaSel.nombre)}`);
    if (qs.length) path += `?${qs.join("&")}`;

    const data = await edcApiJson(path);

    const filas       = Array.isArray(data.filas) ? data.filas : [];
    const movimientos = Array.isArray(data.movimientos) ? data.movimientos : [];
    const facturasRaw = Array.isArray(data.facturas) ? data.facturas : [];

    // ---------- Normalizar líneas de módulos ----------
    let lineas = (filas.length ? filas : movimientos).map((f) => {
      const mes = f.mes || f.periodo || f.period || "";
      const cantidad = f.cantidad ?? f.cant ?? 1;

      const moduloNombre =
        f.moduloNombre || f.modulo || f.moduloNumero || "";
      const moduloIdCrudo =
        f.moduloId ||
        f.moduloIdMongo ||
        (typeof f.modulo === "string" &&
        /^[0-9a-fA-F]{24}$/.test(f.modulo)
          ? f.modulo
          : null);

      let moduloId = moduloIdCrudo || "";
      let moduloRef = moduloId ? moduloMap[String(moduloId)] : null;

      if (!moduloRef && moduloNombre) {
        moduloRef = MODULOS.find(
          (m) =>
            (m.nombre || m.codigo || m.titulo || "").toLowerCase() ===
            String(moduloNombre).toLowerCase()
        );
        if (moduloRef) moduloId = String(moduloRef._id);
      }

      const precioModulo =
        (moduloRef &&
          (Number(moduloRef.valorModulo || moduloRef.precioModulo || moduloRef.precio || 0))) ||
        Number(f.precioModulo || f.valorModulo || 0);

      const aPagar = Number(
        f.aPagar != null
          ? f.aPagar
          : precioModulo
          ? precioModulo * (Number(cantidad) || 0)
          : f.monto || 0
      );

      const pagPadres = Number(
        f.pagadoPadres ??
          f.pagadoPART ??
          f.pagoPadres ??
          (f.tipo === "PADRES" ? f.monto : 0) ??
          0
      );
      const pagOS = Number(
        f.pagadoOS ??
          f.pagoOS ??
          f.pagadoObraSocial ??
          (f.tipo === "OBRA_SOCIAL" ? f.monto : 0) ??
          0
      );

      const detPadres =
        f.detallePadres || f.obsPadres || f.detallePART || f.observaciones || "";
      const detOS =
        f.detalleOS ||
        f.detalleObraSocial ||
        f.obsOS ||
        f.observacionOS ||
        "";

      // profesional
      const profNombre =
        f.profesional ||
        (f.profesionales &&
          (f.profesionales.profesional?.[0] ||
            f.profesionales.coordinador?.[0] ||
            f.profesionales.pasante?.[0] ||
            f.profesionales.directora?.[0])) ||
        "";
      let profId = f.profesionalId || "";

      if (!profId && profNombre) {
        const found = PROFESIONALES.find((p) => {
          const nom =
            p.nombreApellido || p.nombreCompleto || p.nombre || "";
          return nom.toLowerCase() === profNombre.toLowerCase();
        });
        if (found) profId = String(found._id);
      }

      return {
        mes,
        cantidad: Number(cantidad) || 0,
        moduloId,
        moduloNombre,
        profesionalId: profId,
        profesionalNombre: profNombre,
        precioModulo,
        aPagar,
        pagPadres,
        detPadres,
        pagOS,
        detOS,
      };
    });

    // ---------- Normalizar facturas ----------
    let facturas = facturasRaw.map((f) => {
      const mes =
        f.mes ||
        f.periodo ||
        (f.fecha
          ? new Date(f.fecha).toISOString().slice(0, 7)
          : "");
      const fecha = f.fecha
        ? new Date(f.fecha).toISOString().slice(0, 10)
        : "";
      const nro = f.numero || f.nro || f.nFactura || "";
      const monto = Number(f.monto || f.total || 0);
      const detalle = f.detalle || f.descripcion || f.observacion || "";

      return { mes, nro, monto, detalle, fecha };
    });

    // si no hay facturas, creo una fila vacía
    if (!facturas.length) {
      facturas.push({
        mes: "",
        nro: "",
        monto: 0,
        detalle: "",
        fecha: "",
      });
    }

    // ---------- Cálculo de totales ----------
    const calcTotales = () => {
      // actualizar A PAGAR si tenemos precioModulo
      lineas = lineas.map((l) => {
        if (l.precioModulo && !isNaN(l.precioModulo)) {
          const cant = Number(l.cantidad) || 0;
          l.aPagar = l.precioModulo * cant;
        }
        return l;
      });

      const totalAPagar = lineas.reduce((acc, l) => acc + (Number(l.aPagar) || 0), 0);
      const totalPagado = lineas.reduce(
        (acc, l) =>
          acc + (Number(l.pagPadres) || 0) + (Number(l.pagOS) || 0),
        0
      );
      const totalFacturado = facturas.reduce(
        (acc, f) => acc + (Number(f.monto) || 0),
        0
      );

      // DIFERENCIA: lo que cuesta el módulo - lo que se pagó
      const difFactPag = totalAPagar - totalPagado;

      return { totalAPagar, totalPagado, totalFacturado, difFactPag };
    };

    // ---------- HTML base del modal ----------
    const areaNombreActual =
      (areaSel && areaSel.nombre) || "Todas las áreas";

    const areaOptionsHtml = [
      `<option value="">(Todas las áreas)</option>`,
      ...AREAS.map(
        (a) =>
          `<option value="${a._id}" ${
            areaSel && String(areaSel.id) === String(a._id) ? "selected" : ""
          }>${a.nombre}</option>`
      ),
    ].join("");

    const html = `
      <div id="edcModalRoot" style="text-align:left;font-family:'Segoe UI',sans-serif;">
        <!-- Select de área -->
        <div style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">
          <strong>Área:</strong>
          <select id="edcAreaSelectModal" style="padding:4px 6px; border-radius:6px; border:1px solid #bbb; min-width:220px;">
            ${areaOptionsHtml}
          </select>
        </div>

        <h3 style="margin:0 0 6px 0;">${paciente.nombre} — ${areaNombreActual}</h3>

        <!-- BARRA VERDE SUPERIOR -->
        <div style="
          background:#7fbf32;
          color:#fff;
          padding:4px 10px;
          font-weight:600;
          border-radius:6px 6px 0 0;
        ">
          AREA: ${areaNombreActual.toUpperCase()}
        </div>

        <!-- CUERPO PRINCIPAL: AHORA EN COLUMNA -->
        <div style="
          border:1px solid #7fbf32;
          border-top:none;
          border-radius:0 0 6px 6px;
          padding:8px;
          background:#f8fff4;
          display:flex;
          flex-direction:column;
          gap:10px;
        ">

          <!-- MÓDULOS / PAGOS (arriba, ancho completo) -->
          <div style="width:100%;min-width:0;">
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
              <tbody id="edcBodyLineas"></tbody>
              <tfoot id="edcFootLineas"></tfoot>
            </table>
            <button id="edcBtnAddLinea" class="swal2-confirm swal2-styled" style="margin-top:6px;background:#6c5ce7;">+ Agregar línea</button>
          </div>

          <!-- FACTURAS (abajo, ancho completo) -->
          <div style="width:100%;min-width:0;">
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
                  <th class="edc-col-mes">FECHA PAGO</th>
                </tr>
              </thead>
              <tbody id="edcBodyFacturas"></tbody>
              <tfoot id="edcFootFacturas"></tfoot>
            </table>
            <button id="edcBtnAddFactura" class="swal2-confirm swal2-styled" style="margin-top:6px;background:#6c5ce7;">+ Agregar factura</button>
          </div>
        </div>

        <!-- DIFERENCIA -->
        <div id="edcResumenDif" style="margin-top:8px;padding:6px 8px;border-radius:6px;background:#fffbea;border:1px solid #f0c36d;">
        </div>

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

    // ================== Mostrar modal ==================
    await Swal.fire({
      title: "Estado de cuenta",
      html,
      showCloseButton: true,
      confirmButtonText: "Cerrar",
      grow: "fullscreen",
      width: "100%",
      padding: 0,
      didOpen: (popup) => {
        const root       = popup.querySelector("#edcModalRoot");
        const tbodyLin   = popup.querySelector("#edcBodyLineas");
        const tfootLin   = popup.querySelector("#edcFootLineas");
        const tbodyFac   = popup.querySelector("#edcBodyFacturas");
        const tfootFac   = popup.querySelector("#edcFootFacturas");
        const resumenDif = popup.querySelector("#edcResumenDif");

        const render = () => {
          const { totalAPagar, totalPagado, totalFacturado, difFactPag } =
            calcTotales();

          // opciones para selects
          const buildModuloOptions = (selId) =>
            [
              `<option value="">(Elegir módulo)</option>`,
              ...MODULOS.map((m) => {
                const text =
                  m.nombre ||
                  `${m.numero || ""} ${m.descripcion || ""}`.trim();
                const id = String(m._id);
                return `<option value="${id}" ${
                  selId === id ? "selected" : ""
                }>${text}</option>`;
              }),
            ].join("");

          const buildProfOptions = (selId) =>
            [
              `<option value="">(Elegir profesional)</option>`,
              ...PROFESIONALES.map((p) => {
                const text =
                  p.nombreApellido ||
                  p.nombreCompleto ||
                  p.nombre ||
                  "";
                const id = String(p._id);
                return `<option value="${id}" ${
                  selId === id ? "selected" : ""
                }>${text}</option>`;
              }),
            ].join("");

          // ----- líneas -----
          tbodyLin.innerHTML = lineas
            .map((r, idx) => {
              const selMod  = r.moduloId ? String(r.moduloId) : "";
              const selProf = r.profesionalId ? String(r.profesionalId) : "";
              const vCant   = Number(r.cantidad) || 0;

              return `
              <tr>
                <td class="edc-col-mes">
                  <input type="month" data-idx="${idx}" data-field="mes" class="edc-input-linea" style="width:110px;" value="${r.mes || ""}">
                </td>
                <td class="edc-col-cant">
                  <select data-idx="${idx}" data-field="cantidad" class="edc-input-linea" style="width:80px;">
                    <option value="1" ${vCant === 1 ? "selected" : ""}>1</option>
                    <option value="0.3333" ${vCant === 0.3333 ? "selected" : ""}>1/3</option>
                    <option value="0.5" ${vCant === 0.5 ? "selected" : ""}>1/2</option>
                    <option value="0.25" ${vCant === 0.25 ? "selected" : ""}>1/4</option>
                  </select>
                </td>
                <td class="edc-col-mod">
                  <select data-idx="${idx}" data-field="moduloId" class="edc-input-linea" style="width:100%;">
                    ${buildModuloOptions(selMod)}
                  </select>
                </td>
                <td class="edc-col-prof">
                  <select data-idx="${idx}" data-field="profesionalId" class="edc-input-linea" style="width:100%;">
                    ${buildProfOptions(selProf)}
                  </select>
                </td>
                <td class="edc-col-apag">
                  ${fmtARS(r.aPagar)}
                </td>
                <td class="edc-col-pag">
                  <input data-idx="${idx}" data-field="pagPadres" class="edc-input-linea" style="width:100px;text-align:right;" value="${r.pagPadres}">
                </td>
                <td class="edc-col-obs">
                  <input data-idx="${idx}" data-field="detPadres" class="edc-input-linea" style="width:100%;" value="${r.detPadres || ""}">
                </td>
                <td class="edc-col-pag">
                  <input data-idx="${idx}" data-field="pagOS" class="edc-input-linea" style="width:100px;text-align:right;" value="${r.pagOS}">
                </td>
                <td class="edc-col-obs">
                  <input data-idx="${idx}" data-field="detOS" class="edc-input-linea" style="width:100%;" value="${r.detOS || ""}">
                </td>
              </tr>
            `;
            })
            .join("");

          tfootLin.innerHTML = `
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
          `;

          // ----- facturas -----
          tbodyFac.innerHTML = facturas
            .map(
              (f, idx) => `
            <tr>
              <td class="edc-col-mes">
                <input type="month" data-idx="${idx}" data-field="mes" class="edc-input-fact" style="width:120px;" value="${f.mes || ""}">
              </td>
              <td style="text-align:center;min-width:80px;">
                <input data-idx="${idx}" data-field="nro" class="edc-input-fact" style="width:80px;" value="${f.nro || ""}">
              </td>
              <td class="edc-col-apag">
                <input data-idx="${idx}" data-field="monto" class="edc-input-fact" style="width:100px;text-align:right;" value="${f.monto}">
              </td>
              <td class="edc-col-obs">
                <input data-idx="${idx}" data-field="detalle" class="edc-input-fact" style="width:100%;" value="${f.detalle || ""}">
              </td>
              <td class="edc-col-mes">
                <input type="date" data-idx="${idx}" data-field="fecha" class="edc-input-fact" style="width:130px;" value="${f.fecha || ""}">
              </td>
            </tr>
          `
            )
            .join("");

          tfootFac.innerHTML = `
            <tr class="edc-total-row">
              <td colspan="2" style="text-align:left;">Total que se le facturó</td>
              <td class="edc-col-apag">${fmtARS(totalFacturado)}</td>
              <td colspan="2"></td>
            </tr>
          `;

          resumenDif.innerHTML = `
            <strong>Diferencia entre facturado y pagado:</strong>
            <span style="margin-left:6px;">${fmtARS(difFactPag)}</span>
          `;
        };

        render();

        // Handler común para inputs/selects
        const handleChange = (e) => {
          const t = e.target;
          if (t.classList.contains("edc-input-linea")) {
            const idx = Number(t.dataset.idx);
            const field = t.dataset.field;

            if (field === "moduloId") {
              const id = t.value || "";
              lineas[idx].moduloId = id;
              const m = id ? moduloMap[String(id)] : null;
              if (m) {
                const texto =
                  m.nombre ||
                  `${m.numero || ""} ${m.descripcion || ""}`.trim();
                lineas[idx].moduloNombre = texto;
                lineas[idx].precioModulo = Number(
                  m.valorModulo || m.precioModulo || m.precio || 0
                );
              }
              render();
              return;
            }

            if (field === "profesionalId") {
              const id = t.value || "";
              lineas[idx].profesionalId = id;
              const p = id ? profMap[String(id)] : null;
              if (p) {
                lineas[idx].profesionalNombre =
                  p.nombreApellido ||
                  p.nombreCompleto ||
                  p.nombre ||
                  "";
              }
              render();
              return;
            }

            if (
              field === "cantidad" ||
              field === "pagPadres" ||
              field === "pagOS"
            ) {
              lineas[idx][field] = Number(
                String(t.value).replace(",", ".")
              ) || 0;
            } else {
              lineas[idx][field] = t.value;
            }
            render();
          } else if (t.classList.contains("edc-input-fact")) {
            const idx = Number(t.dataset.idx);
            const field = t.dataset.field;
            if (field === "monto") {
              facturas[idx][field] =
                Number(String(t.value).replace(",", ".")) || 0;
            } else {
              facturas[idx][field] = t.value;
            }
            render();
          }
        };

        root.addEventListener("input", handleChange);
        root.addEventListener("change", handleChange);

        // Botón agregar línea
        const btnAddLinea = popup.querySelector("#edcBtnAddLinea");
        if (btnAddLinea) {
          btnAddLinea.addEventListener("click", () => {
            lineas.push({
              mes: "",
              cantidad: 1,
              moduloId: "",
              moduloNombre: "",
              profesionalId: "",
              profesionalNombre: "",
              precioModulo: 0,
              aPagar: 0,
              pagPadres: 0,
              detPadres: "",
              pagOS: 0,
              detOS: "",
            });
            render();
          });
        }

        // Botón agregar factura
        const btnAddFactura = popup.querySelector("#edcBtnAddFactura");
        if (btnAddFactura) {
          btnAddFactura.addEventListener("click", () => {
            facturas.push({
              mes: "",
              nro: "",
              monto: 0,
              detalle: "",
              fecha: "",
            });
            render();
          });
        }

        // Select de área dentro del modal
        const selAreaModal = popup.querySelector("#edcAreaSelectModal");
        if (selAreaModal) {
          selAreaModal.addEventListener("change", () => {
            const selId = selAreaModal.value;
            const found = AREAS.find((a) => String(a._id) === String(selId));
            const nuevaArea = selId
              ? { id: selId, nombre: (found && found.nombre) || null }
              : null;
            Swal.close();
            edcMostrarEstadoCuentaAreaModal(paciente, nuevaArea);
          });
        }

        // Botón PDF (igual que antes)
        const btnPDF = popup.querySelector("#edcBtnDescargarPDF");
        if (btnPDF) {
          btnPDF.addEventListener("click", () => {
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
      },
    });
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



