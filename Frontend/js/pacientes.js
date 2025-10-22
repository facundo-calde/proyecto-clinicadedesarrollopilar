// pacientes.js

// ─────────────────────────────────────────────────────────────────────────────
// BUSCADOR (usar apiFetch: devuelve JSON directo)
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("busquedaInput").addEventListener("input", async () => {
  const input = document.getElementById("busquedaInput").value.trim();
  const sugerencias = document.getElementById("sugerencias");
  sugerencias.innerHTML = "";

  if (input.length < 2) return;

  try {
    const pacientes = await apiFetchJson(`/pacientes?nombre=${encodeURIComponent(input)}`);
    if (!Array.isArray(pacientes)) return;

    pacientes.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${p.nombre} - DNI ${p.dni ?? "No registrado"}`;
      li.addEventListener("click", () => {
        document.getElementById("busquedaInput").value = p.nombre;
        sugerencias.innerHTML = "";
        renderFichaPaciente(p);
      });
      sugerencias.appendChild(li);
    });
  } catch (error) {
    console.error("Error cargando sugerencias", error);
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// RENDER FICHA
// ─────────────────────────────────────────────────────────────────────────────
async function renderFichaPaciente(p) {
  const container = document.getElementById("fichaPacienteContainer");

  // cache simple de catálogos
  if (!window.__catCache) window.__catCache = {};
  const cache = window.__catCache;

  async function loadCats() {
    if (!cache.modulos || !cache.areas || !cache.usersTried) {
      try {
        const [modulos, areas] = await Promise.all([
          apiFetchJson(`/modulos`),
          apiFetchJson(`/areas`),
        ]);
        cache.modulos = Array.isArray(modulos) ? modulos : [];
        cache.areas   = Array.isArray(areas)   ? areas   : [];
      } catch {
        cache.modulos = [];
        cache.areas   = [];
      }

      cache.users = [];
      try {
        // usar apiFetchJson para unificar manejo y token
        cache.users = await apiFetchJson(`/usuarios`);
      } catch {
        cache.users = [];
      }
      cache.usersTried = true;

      cache.modById  = new Map(cache.modulos.map(m => [String(m._id), m]));
      cache.areaById = new Map(cache.areas.map(a => [String(a._id), a]));
      cache.userById = new Map(cache.users.map(u => [String(u._id), u]));
    }
  }
  await loadCats();

  // helpers
  const cap = (s) => (typeof s === "string" && s ? s[0].toUpperCase() + s.slice(1) : s);
  const HEX24 = /^[a-f0-9]{24}$/i;
  const fmtDateTime = (d) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d ?? "");
      return dt.toLocaleString();
    } catch { return String(d ?? ""); }
  };
  const shortId = (id) => String(id || "").slice(-6);

  const areaName = (val) => {
    if (!val) return "";
    if (typeof val === "object" && val !== null) {
      return val.nombre || cache.areaById.get(String(val._id))?.nombre || "";
    }
    if (HEX24.test(String(val))) {
      return cache.areaById.get(String(val))?.nombre || "";
    }
    return String(val);
  };

  // módulos
  const modulosHTML = Array.isArray(p.modulosAsignados) && p.modulosAsignados.length
    ? `<ul style="margin:5px 0; padding-left:20px;">
        ${p.modulosAsignados.map(m => {
          const mod = cache.modById.get(String(m.moduloId));
          const modNombre = mod ? `Módulo ${mod.numero}` : (m.nombre || "Módulo");
          const cant = (m.cantidad ?? "-");

          const det = Array.isArray(m.profesionales) && m.profesionales.length
            ? `<ul style="margin:4px 0 0 18px;">
                ${m.profesionales.map(pr => {
                  const u = cache.userById.get(String(pr.profesionalId));
                  const profNom = u ? (u.nombreApellido || u.nombre || u.usuario) : "Profesional";
                  const aVal = pr.areaId ?? pr.area;
                  const aNom = areaName(aVal);
                  return `<li>${profNom}${aNom ? ` — ${aNom}` : ""}</li>`;
                }).join("")}
               </ul>`
            : "";

          return `<li>${modNombre} - Cantidad: ${cant}${det}</li>`;
        }).join("")}
      </ul>`
    : "Sin módulos asignados";

  // mails
  const clickableMail = (mail) =>
    mail
      ? `<a href="mailto:${mail}" style="color:#1a73e8; text-decoration:none;">${mail}</a>`
      : "sin datos";

  // responsables
  const responsablesHTML = (() => {
    if (Array.isArray(p.responsables) && p.responsables.length) {
      return `
        <ul style="margin:5px 0; padding-left:20px;">
          ${p.responsables.slice(0,3).map(r => {
            const rel = cap(r.relacion ?? "");
            const nom = r.nombre ?? "sin nombre";
            const wspHTML = r.whatsapp
              ? ` 📱 <a href="https://wa.me/${r.whatsapp}" target="_blank" style="color:#25d366; text-decoration:none;">${r.whatsapp}</a>`
              : "";
            const mailHTML = r.email ? ` ✉️ ${clickableMail(r.email)}` : "";
            return `<li><strong>${rel}:</strong> ${nom}${wspHTML}${mailHTML}</li>`;
          }).join("")}
        </ul>`;
    }
    const tutorLinea = (p.tutor?.nombre || p.tutor?.whatsapp)
      ? `<li><strong>Tutor/a:</strong> ${p.tutor?.nombre ?? "sin datos"}${
          p.tutor?.whatsapp
            ? ` 📱 <a href="https://wa.me/${p.tutor.whatsapp}" target="_blank" style="color:#25d366; text-decoration:none;">${p.tutor.whatsapp}</a>`
            : ""}</li>`
      : "";
    const mpLinea = (p.madrePadre || p.whatsappMadrePadre)
      ? `<li><strong>Padre o Madre:</strong> ${p.madrePadre ?? "sin datos"}${
          p.whatsappMadrePadre
            ? ` 📱 <a href="https://wa.me/${p.whatsappMadrePadre}" target="_blank" style="color:#25d366; text-decoration:none;">${p.whatsappMadrePadre}</a>`
            : ""}</li>`
      : "";
    if (!tutorLinea && !mpLinea) return "Sin responsables cargados";
    return `<ul style="margin:5px 0; padding-left:20px;">${mpLinea}${tutorLinea}</ul>`;
  })();

  // historial
  const historialHTML = (() => {
    const hist = Array.isArray(p.estadoHistorial) ? p.estadoHistorial.slice() : [];
    if (!hist.length) return "<em>Sin movimientos</em>";

    hist.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    let prevEstado = null;
    const items = hist.map((h, idx) => {
      const from = (h.estadoAnterior ?? h.desde ?? (idx === 0 ? "—" : prevEstado ?? "—"));
      const to   = (h.estadoNuevo    ?? h.hasta ?? h.estado ?? "—");
      prevEstado = to;

      let actor = "";
      const cp = h.cambiadoPor || {};
      if (cp.nombre) actor = cp.nombre;
      else if (cp.usuario) actor = cp.usuario;
      else if (cp.usuarioId && cache.userById.has(String(cp.usuarioId))) {
        const u = cache.userById.get(String(cp.usuarioId));
        actor = u?.nombreApellido || u?.usuario || shortId(cp.usuarioId);
      } else if (cp.usuarioId) {
        actor = `ID:${shortId(cp.usuarioId)}`;
      }

      const actorHTML = actor ? ` — <em style="color:#666;">por ${actor}</em>` : "";
      const descHTML  = h.descripcion ? ` — <span style="color:#555;">${h.descripcion}</span>` : "";
      const fechaHTML = ` <span style="color:#777;">(${fmtDateTime(h.fecha)})</span>`;

      return `<li><strong>${from}</strong> → <strong>${to}</strong>${fechaHTML}${actorHTML}${descHTML}</li>`;
    });

    items.reverse();

    return `
      <ul style="margin:6px 0 0 14px; padding-left:6px; list-style: disc;">
        ${items.join("")}
      </ul>
    `;
  })();

  // render
  container.innerHTML = `
    <div class="ficha-paciente">
      <div class="ficha-header">
        <h3>${p.nombre ?? "Sin nombre"} - DNI ${p.dni ?? "Sin DNI"}</h3>
      </div>

      <div class="ficha-row">
        <div class="ficha-bloque ficha-simple">
          <p><strong>Condición de Pago:</strong> ${p.condicionDePago ?? "sin datos"}</p>
          <p><strong>Estado actual:</strong> ${p.estado ?? "sin datos"}</p>
          ${p.estado === "Baja"
            ? `<p><strong>Fecha de baja:</strong> ${p.fechaBaja ?? "-"}</p>
               <p><strong>Motivo de baja:</strong> ${p.motivoBaja ?? "-"}</p>`
            : ""}
          <div style="margin-top:8px;">
            <h4 style="margin:0 0 4px 0;">Historial de estado</h4>
            ${historialHTML}
          </div>
        </div>

        <div class="ficha-bloque">
          <h4>Datos:</h4>
          <p><strong>Fecha de nacimiento:</strong> ${p.fechaNacimiento ?? "sin datos"}</p>
          <p><strong>Colegio:</strong> ${p.colegio ?? "sin datos"}</p>
          <p><strong>Mail del colegio:</strong> ${clickableMail(p.colegioMail)}</p>
          <p><strong>Curso / Nivel:</strong> ${p.curso ?? "sin datos"}</p>
        </div>
      </div>

      <div class="ficha-bloque">
        <h4>Responsables</h4>
        ${responsablesHTML}
      </div>

      <div class="ficha-bloque">
        <h4>Obra Social</h4>
        <p><strong>Prestador:</strong> ${p.prestador ?? "sin datos"}</p>
        <p><strong>Credencial:</strong> ${p.credencial ?? "sin datos"}</p>
        <p><strong>Tipo:</strong> ${p.tipo ?? "sin datos"}</p>
      </div>

      <div class="ficha-bloque">
        <h4>Plan</h4>
        <p><strong>Módulos asignados:</strong></p>
        ${modulosHTML}
        ${p.planPaciente ? `<div style="margin-top:8px;"><strong>Plan:</strong><br><pre style="white-space:pre-wrap;margin:0;">${p.planPaciente}</pre></div>` : ""}
      </div>

      <div class="ficha-acciones">
        <button onclick="modificarPaciente('${p.dni}')" class="btn-modificar">✏️ Modificar</button>
        <button onclick="verDiagnosticos('${p.dni}')" class="btn-secundario">Diagnósticos</button>
        <button onclick="verDocumentos('${p.dni}')" class="btn-secundario">Documentos</button>
      </div>
    </div>
  `;
}



// ─────────────────────────────────────────────────────────────────────────────
// MODIFICAR PACIENTE
// ─────────────────────────────────────────────────────────────────────────────
async function modificarPaciente(dni) {
  try {
    // ← antes: apiFetch(...) devolvía Response
    const p = await apiFetchJson(`/pacientes/${dni}`);

    // Catálogos
    let MODULOS = [], AREAS = [], USUARIOS = [];
    try {
      const [m, a, u] = await Promise.all([
        apiFetchJson(`/modulos`),   // ← antes: apiFetch
        apiFetchJson(`/areas`),     // ← antes: apiFetch
        apiFetchJson(`/usuarios`),  // ← antes: fetch('/api/usuarios')
      ]);
      MODULOS = Array.isArray(m) ? m : [];
      AREAS   = Array.isArray(a) ? a : [];
      USUARIOS = Array.isArray(u) ? u : [];
    } catch (_) {
      // deja arrays vacíos si algo falla
    }

    const MOD_OPTS = MODULOS.length
      ? MODULOS.map(m => `<option value="${m._id}">Módulo ${m.numero}</option>`).join("")
      : `<option value="">No disponible</option>`;

    const AREA_OPTS = AREAS.length
      ? AREAS.map(a => `<option value="${a._id}">${a.nombre}</option>`).join("")
      : `<option value="">No disponible</option>`;

    // helpers filtro profesionales
    const norm  = (s) => (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const HEX24 = /^[a-f0-9]{24}$/i;
    const AREA_ID_TO_NAME_NORM = new Map();
    AREAS.forEach(a => AREA_ID_TO_NAME_NORM.set(String(a._id), norm(a.nombre)));
    const ROLES_PROF = new Set(["profesional", "coordinador y profesional"]);

    const profesionalesDeArea = (areaId) => {
      const targetNameNorm = AREA_ID_TO_NAME_NORM.get(String(areaId)) || "";
      const lista = (USUARIOS || [])
        .filter(u => ROLES_PROF.has(norm(u.rol || u.rolAsignado)))
        .filter(u => {
          if (!areaId) return true;

          if (Array.isArray(u.areasProfesional) && u.areasProfesional.length) {
            for (const ap of u.areasProfesional) {
              const nombre = ap?.areaNombre || "";
              if (norm(nombre) === targetNameNorm) return true;
            }
          }
          const arr = Array.isArray(u.areas) ? u.areas : [];
          for (const it of arr) {
            const idCandidate   = typeof it === "object" ? it._id    : it;
            const nameCandidate = typeof it === "object" ? it.nombre : it;
            if (HEX24.test(String(idCandidate || ""))) {
              const n = AREA_ID_TO_NAME_NORM.get(String(idCandidate));
              if (n && n === targetNameNorm) return true;
            }
            if (norm(nameCandidate) === targetNameNorm) return true;
          }
          return false;
        });

      if (!lista.length) return `<option value="">Sin profesionales para el área</option>`;
      return `<option value="">-- Seleccionar --</option>` +
             lista.map(u => `<option value="${u._id}">${u.nombreApellido || u.nombre || u.usuario}</option>`).join("");
    };

    // template módulo — SOLO cambia este select de cantidad
    const renderModuloSelect = (index) => `
      <div class="modulo-row" data-index="${index}"
           style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:6px;">
        <div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; margin-bottom:10px;">
          <div style="min-width:0;">
            <label>Módulo:</label>
            <select class="modulo-select swal2-select" style="width:100%; margin:0;">
              <option value="">-- Seleccionar --</option>
              ${MOD_OPTS}
            </select>
          </div>
          <div style="min-width:0;">
            <label>Cantidad:</label>
            <select class="cantidad-select swal2-select" style="width:100%; margin:0;">
              <option value="0.25">1/4</option>
              <option value="0.5">1/2</option>
              <option value="0.75">3/4</option>
              <option value="1">1</option>
            </select>
          </div>
        </div>

        <div class="profesionales-container" style="margin-top:10px;">
          <h5 style="margin:8px 0;">Profesionales:</h5>
          <div class="profesional-row" style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px;">
            <select class="area-select swal2-select" style="width:100%; margin:0;">
              <option value="">-- Área --</option>
              ${AREA_OPTS}
            </select>
            <select class="profesional-select swal2-select" style="width:100%; margin:0;">
              <option value="">-- Seleccionar profesional --</option>
            </select>
          </div>
        </div>

        <button type="button" class="btnAgregarProfesional"
          style="margin-top:8px; padding:4px 10px; border:1px solid #ccc; border-radius:5px; background:#eee; cursor:pointer;">
          ➕ Agregar profesional
        </button>
      </div>
    `;

    // responsables iniciales
    const responsablesIniciales = Array.isArray(p.responsables) && p.responsables.length
      ? p.responsables.slice(0,3).map(r => ({
          relacion: r.relacion, nombre: r.nombre, whatsapp: r.whatsapp, email: r.email || ""
        }))
      : (() => {
          const arr = [];
          if (p.tutor?.nombre && p.tutor?.whatsapp) {
            arr.push({ relacion:'tutor', nombre:p.tutor.nombre, whatsapp:p.tutor.whatsapp, email: "" });
          }
          if (p.madrePadre) {
            arr.push({
              relacion: /madre/i.test(p.madrePadre) ? 'madre' : 'padre',
              nombre: String(p.madrePadre).replace(/^(madre|padre)\s*:\s*/i,'').trim(),
              whatsapp: p.whatsappMadrePadre || '',
              email: ""
            });
          }
          return arr.slice(0,3);
        })();

    // modal
    const { isConfirmed, value: data } = await Swal.fire({
      title: '<h3 style="font-family: Montserrat; font-weight: 600;">Modificar datos del paciente:</h3>',
      html: `
        <form id="formEditarPaciente" class="formulario-paciente">
          <div class="grid-form">
            <div class="columna">
              <label>Nombre y Apellido:</label>
              <input id="nombre" class="swal2-input" value="${p.nombre ?? ""}">
              <label>DNI:</label>
              <input id="dniInput" class="swal2-input" value="${p.dni ?? ""}" disabled>
              <label>Fecha de nacimiento:</label>
              <input id="fecha" class="swal2-input" type="date" value="${p.fechaNacimiento ?? ""}">
              <label>Colegio:</label>
              <input id="colegio" class="swal2-input" value="${p.colegio ?? ""}">
              <label>Mail del colegio:</label>
              <input id="colegioMail" class="swal2-input" type="email" value="${p.colegioMail ?? ""}">
              <label>Curso / Nivel:</label>
              <input id="curso" class="swal2-input" value="${p.curso ?? ""}">

              <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
                <label style="font-weight:bold; margin:0;">Responsables</label>
                <button id="btnAgregarResponsable" type="button"
                        class="swal2-confirm swal2-styled" style="padding:2px 8px; font-size:12px;">+ Agregar</button>
              </div>
              <small style="display:block; margin-bottom:6px; color:#666;">Máximo 3. <b>Se puede repetir</b> la relación.</small>
              <div id="responsablesContainer"></div>

              <label>Condición de Pago:</label>
              <select id="condicionDePago" class="swal2-select">
                <option value="Obra Social" ${p.condicionDePago === "Obra Social" ? "selected" : ""}>Obra Social</option>
                <option value="Particular" ${p.condicionDePago === "Particular" || !p.condicionDePago ? "selected" : ""}>Particular</option>
                <option value="Obra Social + Particular" ${p.condicionDePago === "Obra Social + Particular" ? "selected" : ""}>Obra Social + Particular</option>
              </select>

              <div id="obraSocialExtra" style="display:none; margin-top:10px;">
                <label>Prestador:</label>
                <input id="prestador" class="swal2-input" value="${p.prestador ?? ""}">
                <label>Credencial:</label>
                <input id="credencial" class="swal2-input" value="${p.credencial ?? ""}">
                <label>Tipo:</label>
                <input id="tipo" class="swal2-input" value="${p.tipo ?? ""}">
              </div>

              <label>Estado:</label>
              <select id="estado" class="swal2-select">
                <option ${p.estado === "Alta" ? "selected" : ""}>Alta</option>
                <option ${p.estado === "Baja" ? "selected" : ""}>Baja</option>
                <option ${p.estado === "En espera" || !p.estado ? "selected" : ""}>En espera</option>
              </select>

              <div id="estadoDescWrap" style="display:none; margin-top:8px;">
                <label>Descripción del cambio de estado:</label>
                <textarea id="descripcionEstado" class="swal2-textarea" rows="3"
                  placeholder="Ej: Solicitud de la familia, falta de documentación, etc."></textarea>
              </div>
            </div>

            <div class="columna" style="margin-top: 20px;">
              <div class="plan-titulo">Plan seleccionado para el paciente:</div>
              <textarea id="planPaciente" rows="8"
                style="width:100%; border:1px solid #ccc; border-radius:5px; margin-top:5px; padding:10px;">${p.planPaciente ?? ""}</textarea>
            </div>
          </div>

          <hr>
          <h4 style="margin-top:15px;">Módulos asignados</h4>
          <div id="modulosContainer"></div>
          <button type="button" id="btnAgregarModulo"
            style="margin-top:10px; padding:5px 10px; border:1px solid #ccc; border-radius:5px; background:#f7f7f7; cursor:pointer;">
            ➕ Agregar otro módulo
          </button>
        </form>
      `,
      didOpen: () => {
        // obra social
        const condicionDePagoSelect = document.getElementById("condicionDePago");
        const obraSocialExtra = document.getElementById("obraSocialExtra");
        const toggleObraSocial = () => {
          const v = condicionDePagoSelect.value;
          obraSocialExtra.style.display =
            (v === "Obra Social" || v === "Obra Social + Particular") ? "block" : "none";
        };
        condicionDePagoSelect.addEventListener("change", toggleObraSocial);
        toggleObraSocial();

        // descripción de estado
        const estadoSel = document.getElementById("estado");
        const estadoDescWrap = document.getElementById("estadoDescWrap");
        const estadoInicial = p.estado || "En espera";
        const toggleDesc = () => {
          estadoDescWrap.style.display =
            (estadoSel.value !== estadoInicial) ? "block" : "none";
        };
        estadoSel.addEventListener("change", toggleDesc);
        toggleDesc();

        // responsables
        const cont = document.getElementById("responsablesContainer");
        const btnAdd = document.getElementById("btnAgregarResponsable");
        const relaciones = ['padre','madre','tutor'];
        const makeRelacionOptions = (sel='') =>
          ['<option value="">-- Relación --</option>']
            .concat(relaciones.map(r => `<option value="${r}" ${r===sel?'selected':''}>${r[0].toUpperCase()+r.slice(1)}</option>`))
            .join('');

        let idx = 0;
        const addRespRow = (preset={relacion:'tutor', nombre:'', email:'', whatsapp:''}) => {
          const filas = cont.querySelectorAll('.responsable-row').length;
          if (filas >= 3) return;
          const rowId = `resp-${idx++}`;
          const html = `
            <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
              <div style="display:grid; grid-template-columns: 140px 1fr 1fr 1fr 40px; gap:10px; align-items:center;">
                <select class="swal2-select resp-relacion" style="margin:0;height:40px;">
                  ${makeRelacionOptions(preset.relacion || '')}
                </select>
                <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}" style="margin:0;height:40px;">
                <input class="swal2-input resp-email" type="email" placeholder="Email (opcional)" value="${preset.email || ''}" style="margin:0;height:40px;">
                <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}" style="margin:0;height:40px;">
                <button type="button" class="swal2-cancel swal2-styled btn-remove" title="Quitar"
                        style="width:36px;height:36px;margin:0;padding:0;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
              </div>
            </div>`;
          cont.insertAdjacentHTML('beforeend', html);
          cont.lastElementChild.querySelector('.btn-remove')
            .addEventListener('click', () => cont.removeChild(document.getElementById(rowId)));
        };
        if (responsablesIniciales.length) responsablesIniciales.forEach(r => addRespRow(r));
        else addRespRow({ relacion:'tutor' });
        btnAdd.addEventListener('click', () => addRespRow());

        // módulos
        const modCont = document.getElementById("modulosContainer");

        const attachAgregarProfesional = (modRowEl) => {
          const btn = modRowEl.querySelector(".btnAgregarProfesional");
          const container = modRowEl.querySelector(".profesionales-container");
          if (!btn || !container) return;

          const buildRow = () => `
            <div class="profesional-row" style="margin-top:5px; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px;">
              <select class="area-select swal2-select" style="width:100%; margin:0;">
                <option value="">-- Área --</option>
                ${AREA_OPTS}
              </select>
              <select class="profesional-select swal2-select" style="width:100%; margin:0;">
                <option value="">-- Seleccionar profesional --</option>
              </select>
            </div>`;

          const wireFilter = (row) => {
            const areaSel = row.querySelector(".area-select");
            const profSel = row.querySelector(".profesional-select");
            const render  = () => { profSel.innerHTML = profesionalesDeArea(areaSel.value); };
            areaSel.addEventListener("change", render);
            render();
          };

          btn.addEventListener("click", () => {
            container.insertAdjacentHTML("beforeend", buildRow());
            wireFilter(container.lastElementChild);
          });

          wireFilter(container.querySelector(".profesional-row"));
        };

        const addModuloRow = () => {
          const index = modCont.querySelectorAll(".modulo-row").length;
          modCont.insertAdjacentHTML("beforeend", renderModuloSelect(index));
          const modRowEl = modCont.lastElementChild;
          attachAgregarProfesional(modRowEl);
          return modRowEl;
        };

        const existentes = Array.isArray(p.modulosAsignados) ? p.modulosAsignados : [];
        if (existentes.length === 0) {
          addModuloRow();
        } else {
          existentes.forEach(m => {
            const row = addModuloRow();
            const selMod = row.querySelector(".modulo-select");
            const selCant = row.querySelector(".cantidad-select");
            if (selMod) selMod.value = String(m.moduloId || "");
            if (selCant) selCant.value = String(m.cantidad ?? "0");

            const contProf = row.querySelector(".profesionales-container");
            const ensureRows = (n) => {
              const actuales = contProf.querySelectorAll(".profesional-row").length;
              for (let i = actuales; i < n; i++) {
                row.querySelector(".btnAgregarProfesional").click();
              }
            };
            const profesionales = Array.isArray(m.profesionales) ? m.profesionales : [];
            if (profesionales.length === 0) return;

            ensureRows(profesionales.length);
            const filas = contProf.querySelectorAll(".profesional-row");

            profesionales.forEach((pr, i) => {
              const f = filas[i];
              const areaSel = f.querySelector(".area-select");
              const profSel = f.querySelector(".profesional-select");

              const areaId = pr.areaId || pr.area || "";
              areaSel.value = String(areaId);
              areaSel.dispatchEvent(new Event("change", { bubbles: true }));
              setTimeout(() => { profSel.value = String(pr.profesionalId || ""); }, 0);
            });
          });
        }

        document.getElementById("btnAgregarModulo").addEventListener("click", () => {
          addModuloRow();
        });
      },
      width: "80%",
      customClass: { popup: "swal-scrollable-form" },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const gv = (id) => (document.getElementById(id)?.value ?? "").trim();

        const nombre = gv("nombre");
        const fechaNacimiento = gv("fecha");

        const colegio     = gv("colegio");
        const colegioMail = gv("colegioMail");
        const curso       = gv("curso");

        const condicionDePagoVal = gv("condicionDePago");
        const estado = gv("estado");
        const descripcionEstado = (document.getElementById("estadoDescWrap").style.display !== "none")
          ? gv("descripcionEstado")
          : "";

        const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const wspRegex  = /^\d{10,15}$/;

        if (!nombre || !fechaNacimiento) {
          Swal.showValidationMessage("⚠️ Completá los campos obligatorios (Nombre, Fecha).");
          return false;
        }
        if (colegioMail && !mailRegex.test(colegioMail)) {
          Swal.showValidationMessage("⚠️ Mail del colegio inválido.");
          return false;
        }

        const filas = Array.from(document.querySelectorAll('#responsablesContainer .responsable-row'));
        if (filas.length < 1 || filas.length > 3) {
          Swal.showValidationMessage("⚠️ Debe haber entre 1 y 3 responsables.");
          return false;
        }
        const responsables = [];
        for (const row of filas) {
          const relacion = row.querySelector('.resp-relacion')?.value || "";
          const nombreR  = (row.querySelector('.resp-nombre')?.value || "").trim();
          const emailR   = (row.querySelector('.resp-email')?.value || "").trim().toLowerCase();
          const whatsapp = (row.querySelector('.resp-whatsapp')?.value || "").trim();

          if (!relacion || !nombreR || !whatsapp) {
            Swal.showValidationMessage("⚠️ Completá relación, nombre y WhatsApp en cada responsable.");
            return false;
          }
          if (!wspRegex.test(whatsapp)) {
            Swal.showValidationMessage("⚠️ WhatsApp inválido (10 a 15 dígitos).");
            return false;
          }
          if (emailR && !mailRegex.test(emailR)) {
            Swal.showValidationMessage("⚠️ Email de responsable inválido.");
            return false;
          }

          const r = { relacion, nombre: nombreR, whatsapp };
          if (emailR) r.email = emailR;
          responsables.push(r);
        }

        const modulosAsignados = [];
        document.querySelectorAll(".modulo-row").forEach((row) => {
          const moduloId = row.querySelector(".modulo-select")?.value;
          const cantidad = parseFloat(row.querySelector(".cantidad-select")?.value);
          if (moduloId && cantidad > 0) {
            const profesionalesAsignados = [];
            row.querySelectorAll(".profesional-row").forEach(profRow => {
              const areaId        = profRow.querySelector(".area-select")?.value;
              const profesionalId = profRow.querySelector(".profesional-select")?.value;
              if (profesionalId && areaId) profesionalesAsignados.push({ profesionalId, areaId });
            });
            modulosAsignados.push({ moduloId, cantidad, profesionales: profesionalesAsignados });
          }
        });

        const planTexto = gv("planPaciente");

        let prestador = "", credencial = "", tipo = "";
        if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
          prestador  = gv("prestador");
          credencial = gv("credencial");
          tipo       = gv("tipo");
        }

        return {
          nombre,
          fechaNacimiento,
          colegio,
          colegioMail,
          curso,
          responsables,
          condicionDePago: condicionDePagoVal,
          estado,
          descripcionEstado,
          prestador, credencial, tipo,
          planPaciente: planTexto,
          modulosAsignados
        };
      }
    });

    if (!isConfirmed) return;

    // PUT (config.js mete Authorization y reescribe /api)
    const putRes = await fetch(`/api/pacientes/${dni}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!putRes.ok) {
      let msg = "Error al guardar";
      try { const j = await putRes.json(); msg = j?.error || msg; } catch {}
      if (putRes.status === 401) msg = 'Token requerido o inválido. Iniciá sesión nuevamente.';
      throw new Error(msg);
    }

    const actualizado = await putRes.json();
    Swal.fire("✅ Cambios guardados", "", "success");
    renderFichaPaciente(actualizado);

  } catch (err) {
    console.error(err);
    Swal.fire("❌ Error al cargar/modificar paciente", err.message || "", "error");
  }
}



// ─────────────────────────────────────────────────────────────────────────────
// NUEVO PACIENTE
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("btnNuevoPaciente").addEventListener("click", () => {
  const getAuthHeaders = () => {
    const token =
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      "";
    return token
      ? { Authorization: `Bearer ${token}`, "x-access-token": token }
      : {};
  };

  Swal.fire({
    title: '<h3 style="font-family: Montserrat; font-weight: 600;">Cargar nuevo paciente:</h3>',
    html: `
      <form id="formNuevoPaciente" class="formulario-paciente">
        <div class="grid-form">
          <div class="columna">
            <label>Nombre y Apellido:</label>
            <input id="nombre" class="swal2-input">
            <label>DNI:</label>
            <input id="dni" class="swal2-input">
            <label>Fecha de nacimiento:</label>
            <input id="fecha" class="swal2-input" type="date">
            <label>Colegio:</label>
            <input id="colegio" class="swal2-input">
            <label>Mail del colegio:</label>
            <input id="colegioMail" class="swal2-input" type="email">
            <label>Curso / Nivel:</label>
            <input id="curso" class="swal2-input">

            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
              <label style="font-weight:bold; margin:0;">Responsables</label>
              <button id="btnAgregarResponsable" type="button" class="swal2-confirm swal2-styled" style="padding:2px 8px; font-size:12px;">+ Agregar</button>
            </div>
            <small style="display:block; margin-bottom:6px; color:#666;">Máximo 3.</small>
            <div id="responsablesContainer"></div>

            <label>Condición de Pago:</label>
            <select id="condicionDePago" class="swal2-select">
              <option value="Obra Social">Obra Social</option>
              <option value="Particular" selected>Particular</option>
              <option value="Obra Social + Particular">Obra Social + Particular</option>
            </select>

            <div id="obraSocialExtra" style="display:none; margin-top:10px;">
              <label>Prestador:</label>
              <input id="prestador" class="swal2-input">
              <label>Credencial:</label>
              <input id="credencial" class="swal2-input">
              <label>Tipo:</label>
              <input id="tipo" class="swal2-input">
            </div>

            <label>Estado:</label>
            <select id="estado" class="swal2-select">
              <option>Alta</option>
              <option>Baja</option>
              <option selected>En espera</option>
            </select>
          </div>

          <div class="columna" style="margin-top: 20px;">
            <label style="font-weight:bold;">Área:</label>
            <select id="areaSeleccionada" class="swal2-select" style="margin-bottom: 10px;">
              <option value="">-- Cargando áreas --</option>
            </select>

            <label style="font-weight:bold;">Profesional:</label>
            <select id="profesionalSeleccionado" class="swal2-select" style="margin-bottom: 10px;">
              <option value="">-- Cargando profesionales --</option>
            </select>
          </div>
        </div>
      </form>
    `,
    width: "80%",
    customClass: { popup: "swal-scrollable-form" },
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",

    didOpen: async () => {
      // obra social
      const condicionDePagoSelect = document.getElementById("condicionDePago");
      const obraSocialExtra = document.getElementById("obraSocialExtra");
      const toggleObraSocial = () => {
        const v = condicionDePagoSelect.value;
        obraSocialExtra.style.display =
          v === "Obra Social" || v === "Obra Social + Particular" ? "block" : "none";
      };
      condicionDePagoSelect.addEventListener("change", toggleObraSocial);
      toggleObraSocial();

      // áreas + profesionales
      const areaSel = document.getElementById("areaSeleccionada");
      const profSel = document.getElementById("profesionalSeleccionado");

      const setOptions = (selectEl, items, mapFn, emptyText) => {
        if (!Array.isArray(items) || items.length === 0) {
          selectEl.innerHTML = `<option value="">${emptyText}</option>`;
          return;
        }
        const opts = [`<option value="">-- Seleccionar --</option>`].concat(items.map(mapFn));
        selectEl.innerHTML = opts.join("");
      };

      let AREAS = [];
      let USUARIOS = [];

      try {
        const [areas, usuarios] = await Promise.all([
          apiFetchJson(`/areas`),
          apiFetchJson(`/usuarios`)
        ]);

        AREAS    = Array.isArray(areas) ? areas : [];
        USUARIOS = Array.isArray(usuarios) ? usuarios : [];

        setOptions(areaSel, AREAS, (a) => `<option value="${a._id}">${a.nombre}</option>`, "No disponible");

        const norm = (s) =>
          (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

        const ID2NAME = new Map();
        AREAS.forEach(a => ID2NAME.set(String(a._id), a.nombre));

        const ROLES_PROF = new Set(['profesional', 'coordinador y profesional']);

        const renderProfesionales = () => {
          const selId = areaSel.value || "";
          if (!selId) {
            profSel.innerHTML = `<option value="">-- Seleccioná un área primero --</option>`;
            return;
          }
          const targetNameNorm = norm(ID2NAME.get(selId) || "");

          const lista = USUARIOS
            .filter(u => ROLES_PROF.has(norm(u.rol || "")))
            .filter(u => {
              if (Array.isArray(u.areasProfesional) && u.areasProfesional.length) {
                for (const ap of u.areasProfesional) {
                  if (norm(ap?.areaNombre) === targetNameNorm) return true;
                }
              }
              if (Array.isArray(u.areas) && u.areas.length) {
                for (const a of u.areas) {
                  const name = typeof a === 'object' ? (a.nombre || a.name) : a;
                  if (norm(name) === targetNameNorm) return true;
                }
              }
              return false;
            });

          profSel.innerHTML = lista.length === 0
            ? `<option value="">Sin profesionales para el área</option>`
            : `<option value="">-- Seleccionar --</option>` +
              lista.map(u =>
                `<option value="${u._id}">${u.nombreApellido || u.nombre || u.usuario}</option>`
              ).join("");
        };

        renderProfesionales();
        areaSel.addEventListener("change", renderProfesionales);
      } catch (e) {
        console.warn("No se pudieron cargar áreas/profesionales:", e);
        areaSel.innerHTML = `<option value="">No disponible</option>`;
        profSel.innerHTML = `<option value="">No disponible</option>`;
      }

      // responsables (con email)
      const cont = document.getElementById("responsablesContainer");
      const btnAdd = document.getElementById("btnAgregarResponsable");

      const relaciones = ['padre', 'madre', 'tutor'];
      const makeRelacionOptions = (seleccionActual = '') =>
        ['<option value="">-- Relación --</option>']
          .concat(relaciones.map(r =>
            `<option value="${r}" ${r === seleccionActual ? 'selected' : ''}>${r[0].toUpperCase()+r.slice(1)}</option>`
          )).join('');

      let idx = 0;
      const addRow = (preset = {relacion:'tutor', nombre:'', whatsapp:'', email:''}) => {
        const filas = cont.querySelectorAll('.responsable-row').length;
        if (filas >= 3) return;

        const rowId = `resp-${idx++}`;
        const html = `
          <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
            <div style="display:grid; grid-template-columns: 140px 1fr 1fr 1fr 42px; gap:10px; align-items:center;">
              <select class="swal2-select resp-relacion" style="margin:0;height:40px;">
                ${makeRelacionOptions(preset.relacion || '')}
              </select>
              <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}" style="margin:0;height:40px;">
              <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}" style="margin:0;height:40px;">
              <input class="swal2-input resp-email" placeholder="Email (opcional)" type="email" value="${preset.email || ''}" style="margin:0;height:40px;">
              <button type="button" class="swal2-cancel swal2-styled btn-remove" title="Quitar"
                style="width:36px;height:36px;margin:0;padding:0;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
          </div>
        `;
        cont.insertAdjacentHTML('beforeend', html);
        cont.lastElementChild.querySelector('.btn-remove')
          .addEventListener('click', () => cont.removeChild(document.getElementById(rowId)));
      };

      btnAdd.addEventListener('click', () => addRow());
      addRow({relacion:'tutor'});
    },

    preConfirm: () => {
      const gv = (id) => (document.getElementById(id)?.value ?? "").trim();

      const nombre = gv("nombre");
      const dni = gv("dni");
      const fechaNacimiento = gv("fecha");

      const colegio      = gv("colegio");
      const colegioMail  = gv("colegioMail");
      const curso        = gv("curso");

      const condicionDePagoVal = gv("condicionDePago");
      const estado       = gv("estado");

      const dniRegex  = /^\d{7,8}$/;
      const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!nombre || !dni || !fechaNacimiento) {
        Swal.showValidationMessage("⚠️ Completá los campos obligatorios (Nombre, DNI, Fecha).");
        return false;
      }
      if (!dniRegex.test(dni)) {
        Swal.showValidationMessage("⚠️ El DNI debe tener entre 7 y 8 dígitos numéricos.");
        return false;
      }
      if (colegioMail && !mailRegex.test(colegioMail)) {
        Swal.showValidationMessage("⚠️ El mail del colegio no es válido.");
        return false;
      }

      const filas = Array.from(document.querySelectorAll('#responsablesContainer .responsable-row'));
      if (filas.length < 1 || filas.length > 3) {
        Swal.showValidationMessage("⚠️ Debe haber entre 1 y 3 responsables.");
        return false;
      }
      const responsables = [];
      for (const row of filas) {
        const relacion = row.querySelector('.resp-relacion')?.value || "";
        const nombreR  = (row.querySelector('.resp-nombre')?.value || "").trim();
        const whatsapp = (row.querySelector('.resp-whatsapp')?.value || "").trim();
        const email    = (row.querySelector('.resp-email')?.value || "").trim().toLowerCase();

        if (!relacion || !nombreR || !whatsapp) {
          Swal.showValidationMessage("⚠️ Completá relación, nombre y WhatsApp en cada responsable.");
          return false;
        }
        if (!/^\d{10,15}$/.test(whatsapp)) {
          Swal.showValidationMessage("⚠️ WhatsApp inválido (10 a 15 dígitos).");
          return false;
        }
        if (email && !mailRegex.test(email)) {
          Swal.showValidationMessage("⚠️ Email de responsable inválido.");
          return false;
        }

        const r = { relacion, nombre: nombreR, whatsapp };
        if (email) r.email = email;
        responsables.push(r);
      }

      let prestador="", credencial="", tipo="";
      if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
        prestador  = gv("prestador");
        credencial = gv("credencial");
        tipo       = gv("tipo");
      }

      // si no usás módulos acá:
      const modulosAsignados = [];
      const areasDerivadas = [];

      return {
        nombre,
        dni,
        fechaNacimiento,
        colegio,
        colegioMail,
        curso,
        responsables,
        condicionDePago: condicionDePagoVal,
        estado,
        prestador,
        credencial,
        tipo,
        modulosAsignados,
        areas: areasDerivadas
      };
    }
  }).then(async (result) => {
    if (!result.isConfirmed) return;

    try {
      // POST (config.js mete Authorization y reescribe /api)
      const response = await fetch(`/api/pacientes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(result.value)
      });

      if (!response.ok) throw new Error("No se pudo guardar");

      const nuevoPaciente = await response.json();
      Swal.fire("✅ Paciente cargado con éxito", "", "success");
      renderFichaPaciente(nuevoPaciente);
    } catch (error) {
      console.error("Error al guardar el nuevo paciente", error);
      Swal.fire("❌ Error al guardar", "", "error");
    }
  });
});



/// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS / DIAGNÓSTICOS
// ─────────────────────────────────────────────────────────────────────────────
async function verDocumentos(dni) {
  try {
    const paciente = await apiFetchJson(`/pacientes/${dni}`);
    const documentos = Array.isArray(paciente.documentosPersonales)
      ? paciente.documentosPersonales
      : [];

    const htmlTabla = documentos.length
      ? documentos.map((doc, i) => `
        <tr>
          <td>${doc.fecha ?? "-"}</td>
          <td>${doc.tipo ?? "-"}</td>
          <td>${doc.observaciones ?? "-"}</td>
          <td>
            <a href="${doc.archivoURL}" target="_blank" rel="noopener" title="Ver archivo">
              <i class="fa fa-file-pdf"></i>
            </a>
          </td>
          <td>
            <button onclick="editarDocumento('${dni}', ${i})"><i class="fa fa-pen"></i></button>
            <button onclick="eliminarDocumento('${dni}', ${i})"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" style="text-align:center;">No hay documentos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Documentos personales - DNI ${dni}</h3>`,
      html: `
        <button onclick="agregarDocumento('${dni}')" class="swal2-confirm" style="margin-bottom: 10px;">
          ➕ Agregar documento
        </button>
        <table style="width:100%; font-size: 14px; text-align: left;">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Observaciones</th><th>Ver adjuntos</th><th>Modificar</th></tr>
          </thead>
          <tbody>${htmlTabla}</tbody>
        </table>
      `,
      width: "70%",
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: "Cerrar",
    });
  } catch (e) {
    console.error("Error al mostrar documentos:", e);
    Swal.fire("❌ Error al cargar documentos", "", "error");
  }
}

async function agregarDocumento(dni) {
  const { isConfirmed } = await Swal.fire({
    title: "Agregar nuevo documento",
    html: `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <label>Fecha:</label>
        <input type="date" id="docFecha" class="swal2-input">
        <label>Tipo:</label>
        <input type="text" id="docTipo" class="swal2-input" placeholder="Ej: DNI, Autorización, Carnet OS...">
        <label>Observaciones:</label>
        <textarea id="docObs" class="swal2-textarea" placeholder="Opcional"></textarea>
        <label>Archivo adjunto (PDF o imagen):</label>
        <input type="file" id="docArchivo" class="swal2-file" accept=".pdf,image/*">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",

    // Subimos DIRECTO al backend (que a su vez sube a R2)
    preConfirm: async () => {
      const fecha = document.getElementById("docFecha").value;
      const tipo = document.getElementById("docTipo").value.trim();
      const observaciones = document.getElementById("docObs").value.trim();
      const archivo = document.getElementById("docArchivo").files[0];

      if (!fecha || !tipo || !archivo) {
        Swal.showValidationMessage("Todos los campos excepto observaciones son obligatorios");
        return false;
      }

      const fd = new FormData();
      fd.append("archivo", archivo);         // ← nombre debe coincidir con multer.single("archivo")
      fd.append("fecha", fecha);
      fd.append("tipo", tipo);
      fd.append("observaciones", observaciones);

      const res = await fetch(`/api/documentos/${dni}`, {
        method: "POST",
        body: fd
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "No se pudo subir el documento");
      }

      // opcional: podrías usar lo que devuelve (lista actualizada)
      // const documentos = await res.json();
      return true;
    },
  });

  if (!isConfirmed) return;

  Swal.fire("✅ Documento agregado", "", "success");
  // recargá la tabla del modal
  verDocumentos(dni);
}




async function verDiagnosticos(dni) {
  try {
    const paciente = await apiFetch(`/pacientes/${dni}`);
    const diagnosticos = paciente.diagnosticos ?? [];

    const htmlTabla = diagnosticos.length
      ? diagnosticos.map((d, i) => `
        <tr>
          <td>${d.fecha}</td>
          <td>${d.area}</td>
          <td>${d.observaciones ?? "-"}</td>
          <td><a href="${d.archivoURL}" target="_blank"><i class="fa fa-file-pdf"></i></a></td>
          <td>
            <button onclick="editarDiagnostico('${dni}', ${i})"><i class="fa fa-pen"></i></button>
            <button onclick="eliminarDiagnostico('${dni}', ${i})"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" style="text-align:center;">No hay diagnósticos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Historial de informes:<br>${paciente.nombre} - DNI ${dni}</h3>`,
      html: `
        <button onclick="agregarDiagnostico('${dni}')" class="swal2-confirm" style="margin-bottom: 10px;">➕ Agregar nuevo diagnóstico</button>
        <table style="width:100%; font-size:14px; text-align:left;">
          <thead>
            <tr><th>Fecha</th><th>Área</th><th>Observaciones</th><th>Ver adjuntos</th><th>Modificar</th></tr>
          </thead>
          <tbody>${htmlTabla}</tbody>
        </table>
      `,
      width: "70%",
      showCancelButton: true,
      showConfirmButton: false,
      cancelButtonText: "Cerrar",
    });
  } catch (e) {
    console.error("Error al mostrar diagnósticos:", e);
    Swal.fire("❌ Error al cargar diagnósticos", "", "error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 🔐 Sesión, anti-back y helpers (ok con tu config.js, no hay conflicto)
// ─────────────────────────────────────────────────────────────────────────────
const LOGIN = 'index.html';
const goLogin = () => location.replace(LOGIN);

let usuarioSesion = null;
try { usuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { usuarioSesion = null; }
const token = localStorage.getItem('token');

if (!token) goLogin();

window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fromBF = e.persisted || nav?.type === 'back_forward';
  if (fromBF && !localStorage.getItem('token')) goLogin();
});

history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  if (!localStorage.getItem('token')) goLogin();
  else history.pushState(null, '', location.href);
});

if (usuarioSesion?.nombreApellido) {
  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = usuarioSesion.nombreApellido;
}

// fetchAuth (lo podés seguir usando si te gusta; pero con config.js ya tenés fetch global con token)
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

const btnLogout = document.getElementById('btnLogout');
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    localStorage.clear();
    goLogin();
  });
}
