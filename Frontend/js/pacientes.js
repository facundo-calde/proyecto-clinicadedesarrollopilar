// pacientes.js

const API_URL = "http://localhost:3000/api/pacientes";

document.getElementById("busquedaInput").addEventListener("input", async () => {
  const input = document.getElementById("busquedaInput").value.trim();
  const sugerencias = document.getElementById("sugerencias");
  sugerencias.innerHTML = "";

  if (input.length < 2) return;

  try {
    const res = await fetch(`${API_URL}?nombre=${encodeURIComponent(input)}`);
    const pacientes = await res.json();

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


// Render de la ficha con módulos
async function renderFichaPaciente(p) {
  const container = document.getElementById("fichaPacienteContainer");

  // ---- cache simple de catálogos ----
  if (!window.__catCache) window.__catCache = {};
  const cache = window.__catCache;

  const getAuthHeaders = () => {
    const token = window.AUTH_TOKEN || localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function loadCats() {
    if (!cache.modulos || !cache.areas || !cache.usersTried) {
      try {
        const [rm, ra] = await Promise.all([
          fetch(API_URL.replace("/pacientes", "/modulos")),
          fetch(API_URL.replace("/pacientes", "/areas")),
        ]);
        cache.modulos = rm.ok ? await rm.json() : [];
        cache.areas   = ra.ok ? await ra.json() : [];
      } catch {
        cache.modulos = [];
        cache.areas   = [];
      }

      cache.users = [];
      try {
        const ru = await fetch(
          API_URL.replace("/pacientes", "/usuarios"),
          { headers: getAuthHeaders() }
        );
        if (ru.ok) cache.users = await ru.json();
      } catch {}
      cache.usersTried = true;

      cache.modById  = new Map(cache.modulos.map(m => [String(m._id), m]));
      cache.areaById = new Map(cache.areas.map(a => [String(a._id), a]));
      cache.userById = new Map(cache.users.map(u => [String(u._id), u]));
    }
  }
  await loadCats();

  // ---- helpers ----
  const cap = (s) => (typeof s === "string" && s ? s[0].toUpperCase() + s.slice(1) : s);
  const HEX24 = /^[a-f0-9]{24}$/i;
  const fmtDateTime = (d) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d ?? "");
      return dt.toLocaleString(); // usa la locale del navegador
    } catch { return String(d ?? ""); }
  };

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

  // ---- módulos con profesionales/áreas ----
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
                  const aVal = pr.areaId ?? pr.area;   // tolera areaId o area (legacy)
                  const aNom = areaName(aVal);
                  return `<li>${profNom}${aNom ? ` — ${aNom}` : ""}</li>`;
                }).join("")}
               </ul>`
            : "";

          return `<li>${modNombre} - Cantidad: ${cant}${det}</li>`;
        }).join("")}
      </ul>`
    : "Sin módulos asignados";

  // ---- responsables (con WhatsApp cliqueable) ----
  const responsablesHTML = (() => {
    if (Array.isArray(p.responsables) && p.responsables.length) {
      return `
        <ul style="margin:5px 0; padding-left:20px;">
          ${p.responsables.slice(0,3).map(r => {
            const rel = cap(r.relacion ?? "");
            const nom = r.nombre ?? "sin nombre";
            if (r.whatsapp) {
              return `<li><strong>${rel}:</strong> ${nom} 
                        📱 <a href="https://wa.me/${r.whatsapp}" target="_blank" 
                          style="color:#25d366; text-decoration:none;">
                          ${r.whatsapp}
                        </a>
                      </li>`;
            }
            return `<li><strong>${rel}:</strong> ${nom}</li>`;
          }).join("")}
        </ul>`;
    }
    // fallback legacy
    const tutorLinea = (p.tutor?.nombre || p.tutor?.whatsapp)
      ? `<li><strong>Tutor/a:</strong> ${p.tutor?.nombre ?? "sin datos"}${
          p.tutor?.whatsapp
            ? ` 📱 <a href="https://wa.me/${p.tutor.whatsapp}" target="_blank"
                     style="color:#25d366; text-decoration:none;">
                     ${p.tutor.whatsapp}
                   </a>`
            : ""}</li>`
      : "";
    const mpLinea = (p.madrePadre || p.whatsappMadrePadre)
      ? `<li><strong>Padre o Madre:</strong> ${p.madrePadre ?? "sin datos"}${
          p.whatsappMadrePadre
            ? ` 📱 <a href="https://wa.me/${p.whatsappMadrePadre}" target="_blank"
                     style="color:#25d366; text-decoration:none;">
                     ${p.whatsappMadrePadre}
                   </a>`
            : ""}</li>`
      : "";
    if (!tutorLinea && !mpLinea) return "Sin responsables cargados";
    return `<ul style="margin:5px 0; padding-left:20px;">${mpLinea}${tutorLinea}</ul>`;
  })();

  // ---- historial de estado ----
  const historialHTML = (() => {
    const hist = Array.isArray(p.estadoHistorial) ? p.estadoHistorial.slice() : [];
    if (!hist.length) return "<em>Sin movimientos</em>";
    // opcional: mostrar más reciente primero
    hist.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return `
      <ul style="margin:6px 0 0 14px; padding-left:6px; list-style: disc;">
        ${hist.map(h => {
          const de = h.estadoAnterior || "—";
          const a  = h.estadoNuevo || "—";
          const f  = fmtDateTime(h.fecha);
          const d  = h.descripcion ? ` — <span style="color:#555;">${h.descripcion}</span>` : "";
          return `<li><strong>${de}</strong> → <strong>${a}</strong> <span style="color:#777;">(${f})</span>${d}</li>`;
        }).join("")}
      </ul>
    `;
  })();

  // ---- mails cliqueables ----
  const clickableMail = (mail) =>
    mail
      ? `<a href="mailto:${mail}" style="color:#1a73e8; text-decoration:none;">${mail}</a>`
      : "sin datos";

  // ---- render ----
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
          <p><strong>Mail de los padres:</strong> ${clickableMail(p.mailPadres)}</p>
          <p><strong>Mail del tutor:</strong> ${clickableMail(p.mailTutor)}</p>
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








async function modificarPaciente(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const p = await res.json();

    // ---- Token (para /usuarios) ----
    const TOKEN =
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      "";

    // ---- Catálogos ----
    let MODULOS = [], AREAS = [], USUARIOS = [];
    try {
      const [resMod, resAreas, resUsers] = await Promise.all([
        fetch(`${API_URL.replace("/pacientes", "/modulos")}`),
        fetch(`${API_URL.replace("/pacientes", "/areas")}`),
        fetch(`${API_URL.replace("/pacientes", "/usuarios")}`, {
          headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
        })
      ]);
      if (resMod.ok)   MODULOS  = await resMod.json();
      if (resAreas.ok) AREAS    = await resAreas.json();
      if (resUsers.ok) USUARIOS = await resUsers.json();
      if (!resUsers.ok) console.warn("No se pudieron cargar usuarios:", resUsers.status);
    } catch (_) {}

    const MOD_OPTS = MODULOS.length
      ? MODULOS.map(m => `<option value="${m._id}">Módulo ${m.numero}</option>`).join("")
      : `<option value="">No disponible</option>`;

    const AREA_OPTS = AREAS.length
      ? AREAS.map(a => `<option value="${a._id}">${a.nombre}</option>`).join("")
      : `<option value="">No disponible</option>`;

    // ---- helpers para filtrar profesionales por área ----
    const norm  = (s) => (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    const HEX24 = /^[a-f0-9]{24}$/i;
    const AREA_ID_TO_NAME_NORM = new Map();
    AREAS.forEach(a => AREA_ID_TO_NAME_NORM.set(String(a._id), norm(a.nombre)));

    const profesionalesDeArea = (areaId) => {
      const targetNameNorm = AREA_ID_TO_NAME_NORM.get(String(areaId)) || "";
      const lista = USUARIOS
        .filter(u => norm(u.rol || u.rolAsignado) === "profesional")
        .filter(u => {
          if (!areaId) return true;
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

    // ---- template de módulo ----
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
              <option value="0">0</option>
              <option value="0.25">1/4</option>
              <option value="0.5">1/2</option>
              <option value="0.75">3/4</option>
              <option value="1">1</option>
              <option value="1.25">1 1/4</option>
              <option value="1.5">1 1/2</option>
              <option value="2">2</option>
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

    // ---- responsables iniciales ----
    const responsablesIniciales = Array.isArray(p.responsables) && p.responsables.length
      ? p.responsables.slice(0,3)
      : (() => {
          const arr = [];
          if (p.tutor?.nombre && p.tutor?.whatsapp) {
            arr.push({ relacion:'tutor', nombre:p.tutor.nombre, whatsapp:p.tutor.whatsapp });
          }
          if (p.madrePadre) {
            arr.push({
              relacion: /madre/i.test(p.madrePadre) ? 'madre' : 'padre',
              nombre: String(p.madrePadre).replace(/^(madre|padre)\s*:\s*/i,'').trim(),
              whatsapp: p.whatsappMadrePadre || ''
            });
          }
          return arr.slice(0,3);
        })();

    // ---- modal ----
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

              <label>Mail de los padres:</label>
              <input id="mailPadres" class="swal2-input" type="email" value="${p.mailPadres ?? ""}">
              <label>Mail del tutor:</label>
              <input id="mailTutor" class="swal2-input" type="email" value="${p.mailTutor ?? ""}">

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
        // Toggle obra social
        const condicionDePagoSelect = document.getElementById("condicionDePago");
        const obraSocialExtra = document.getElementById("obraSocialExtra");
        const toggleObraSocial = () => {
          const v = condicionDePagoSelect.value;
          obraSocialExtra.style.display =
            v === "Obra Social" || v === "Obra Social + Particular" ? "block" : "none";
        };
        condicionDePagoSelect.addEventListener("change", toggleObraSocial);
        toggleObraSocial();

        // descripción de estado sólo si cambia
        const estadoSel = document.getElementById("estado");
        const estadoDescWrap = document.getElementById("estadoDescWrap");
        const estadoInicial = p.estado || "En espera";
        const toggleDesc = () => {
          estadoDescWrap.style.display =
            (estadoSel.value !== estadoInicial) ? "block" : "none";
        };
        estadoSel.addEventListener("change", toggleDesc);
        toggleDesc();

        // Responsables dinámicos
        const cont = document.getElementById("responsablesContainer");
        const btnAdd = document.getElementById("btnAgregarResponsable");
        const relaciones = ['padre','madre','tutor'];
        const makeRelacionOptions = (sel='') =>
          ['<option value="">-- Relación --</option>']
            .concat(relaciones.map(r => `<option value="${r}" ${r===sel?'selected':''}>${r[0].toUpperCase()+r.slice(1)}</option>`))
            .join('');

        let idx = 0;
        const addRespRow = (preset={relacion:'tutor', nombre:'', whatsapp:''}) => {
          const filas = cont.querySelectorAll('.responsable-row').length;
          if (filas >= 3) return;
          const rowId = `resp-${idx++}`;
          const html = `
            <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
              <div style="display:grid; grid-template-columns: 150px 1fr 1fr 48px; gap:10px; align-items:center;">
                <select class="swal2-select resp-relacion" style="margin:0;height:40px;">
                  ${makeRelacionOptions(preset.relacion || '')}
                </select>
                <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}" style="margin:0;height:40px;">
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

        // -------- MÓDULOS: precarga + wire --------
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

          // primera fila ya existente en el bloque
          wireFilter(container.querySelector(".profesional-row"));
        };

        const addModuloRow = () => {
          const index = modCont.querySelectorAll(".modulo-row").length;
          modCont.insertAdjacentHTML("beforeend", renderModuloSelect(index));
          const modRowEl = modCont.lastElementChild;
          attachAgregarProfesional(modRowEl);
          return modRowEl;
        };

        // Precargar módulos existentes
        const existentes = Array.isArray(p.modulosAsignados) ? p.modulosAsignados : [];
        if (existentes.length === 0) {
          addModuloRow(); // uno vacío
        } else {
          existentes.forEach(m => {
            const row = addModuloRow();
            // set módulo y cantidad
            const selMod = row.querySelector(".modulo-select");
            const selCant = row.querySelector(".cantidad-select");
            if (selMod) selMod.value = String(m.moduloId || "");
            if (selCant) selCant.value = String(m.cantidad ?? "0");

            // profesionales del módulo
            const contProf = row.querySelector(".profesionales-container");
            // la primera fila ya existe, las extra hay que agregarlas
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

              // set área
              const areaId = pr.areaId || pr.area || "";
              areaSel.value = String(areaId);

              // disparar change para poblar profesionales y luego setear
              areaSel.dispatchEvent(new Event("change", { bubbles: true }));
              // dar un tick al event loop para que se reemplace el innerHTML antes de setear el value
              setTimeout(() => {
                profSel.value = String(pr.profesionalId || "");
              }, 0);
            });
          });
        }

        // botón agregar módulo manual
        document.getElementById("btnAgregarModulo").addEventListener("click", () => {
          addModuloRow();
        });
      },
      width: "90%",
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
        const mailPadres  = gv("mailPadres");
        const mailTutor   = gv("mailTutor");

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
        if (colegioMail && !mailRegex.test(colegioMail)) { Swal.showValidationMessage("⚠️ Mail del colegio inválido."); return false; }
        if (mailPadres  && !mailRegex.test(mailPadres))  { Swal.showValidationMessage("⚠️ Mail de los padres inválido."); return false; }
        if (mailTutor   && !mailRegex.test(mailTutor))   { Swal.showValidationMessage("⚠️ Mail del tutor inválido."); return false; }

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
          if (!relacion || !nombreR || !whatsapp) { Swal.showValidationMessage("⚠️ Completá relación, nombre y WhatsApp en cada responsable."); return false; }
          if (!wspRegex.test(whatsapp)) { Swal.showValidationMessage("⚠️ WhatsApp inválido (10 a 15 dígitos)."); return false; }
          responsables.push({ relacion, nombre: nombreR, whatsapp });
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
          mailPadres: mailPadres || undefined,
          mailTutor:  mailTutor  || undefined,
          responsables,
          condicionDePago: condicionDePagoVal,
          estado,
          descripcionEstado,          // -> el backend arma historial si cambió
          prestador, credencial, tipo,
          planPaciente: planTexto,
          modulosAsignados
        };
      }
    });

    if (!isConfirmed) return;

    // PUT
    const putRes = await fetch(`${API_URL}/${dni}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!putRes.ok) {
      let msg = "Error al guardar";
      try { const j = await putRes.json(); msg = j?.error || msg; } catch {}
      throw new Error(msg);
    }

    const actualizado = await putRes.json();
    Swal.fire("✅ Cambios guardados", "", "success");
    renderFichaPaciente(actualizado);
    document.getElementById("fichaPacienteContainer").innerHTML = "";
    document.getElementById("busquedaInput").value = "";
  } catch (err) {
    console.error(err);
    Swal.fire("❌ Error al cargar/modificar paciente", "", "error");
  }
}









document.getElementById("btnNuevoPaciente").addEventListener("click", () => {
  Swal.fire({
    title:
      '<h3 style="font-family: Montserrat; font-weight: 600;">Cargar nuevo paciente:</h3>',
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

            <!-- 🔹 Responsables (padre/madre/tutor) -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
              <label style="font-weight:bold; margin:0;">Responsables</label>
              <button id="btnAgregarResponsable" type="button" class="swal2-confirm swal2-styled" style="padding:2px 8px; font-size:12px;">+ Agregar</button>
            </div>
            <small style="display:block; margin-bottom:6px; color:#666;">Máximo 3. </small>

            <div id="responsablesContainer"></div>

            <label>Mail de los padres:</label>
            <input id="mailPadres" class="swal2-input" type="email">

            <label>Mail del tutor:</label>
            <input id="mailTutor" class="swal2-input" type="email">

            <label>Condición de Pago:</label>
            <select id="condicionDePago" class="swal2-select">
              <option value="Obra Social">Obra Social</option>
              <option value="Particular" selected>Particular</option>
              <option value="Obra Social + Particular">Obra Social + Particular</option>
            </select>

            <!-- 🔹 Extra Obra Social -->
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
              <option value="">-- Cargando áreas... --</option>
            </select>

            <label style="font-weight:bold;">Profesional:</label>
            <select id="profesionalSeleccionado" class="swal2-select" style="margin-bottom: 10px;">
              <option value="">-- Cargando profesionales... --</option>
            </select>
          </div>
        </div>
      </form>
    `,
    width: "90%",
    customClass: { popup: "swal-scrollable-form" },
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",

    didOpen: async () => {
      // --- Toggle Obra Social según condición de pago
      const condicionDePagoSelect = document.getElementById("condicionDePago");
      const obraSocialExtra = document.getElementById("obraSocialExtra");
      const toggleObraSocial = () => {
        const v = condicionDePagoSelect.value;
        obraSocialExtra.style.display =
          v === "Obra Social" || v === "Obra Social + Particular" ? "block" : "none";
      };
      condicionDePagoSelect.addEventListener("change", toggleObraSocial);
      toggleObraSocial();

  // --- Carga de Áreas y Profesionales (con filtro por rol/área)
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
let PROFES = [];

try {
  const token = localStorage.getItem("token") || "";
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const [resAreas, resProfs] = await Promise.all([
    fetch(`${API_URL.replace("/pacientes", "/areas")}`),
    fetch(`${API_URL.replace("/pacientes", "/usuarios")}`, { headers: authHeaders })
  ]);

  // si viene 401/403 mostramos algo útil
  if (!resProfs.ok) {
    console.warn("No se pudieron cargar usuarios:", resProfs.status, await resProfs.text());
  }

  AREAS  = resAreas.ok ? await resAreas.json() : [];
  PROFES = resProfs.ok ? await resProfs.json()  : [];

  setOptions(areaSel, AREAS, (a) => `<option value="${a._id}">${a.nombre}</option>`, "No disponible");

  // -------- filtro por rol/área (mismo que ya tenías) --------
  const norm = (s) =>
    (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const ID2NAME_NORM = new Map();
  AREAS.forEach(a => ID2NAME_NORM.set(String(a._id), norm(a.nombre)));
  const HEX24 = /^[a-f0-9]{24}$/i;

  const renderProfesionales = () => {
    const selId = areaSel.value || "";
    if (!selId) {
      profSel.innerHTML = `<option value="">-- Seleccioná un área primero --</option>`;
      return;
    }
    const targetNameNorm =
      ID2NAME_NORM.get(selId) || norm(areaSel.options[areaSel.selectedIndex]?.text || "");

    const lista = PROFES
      .filter(p => norm(p.rol || p.rolAsignado) === "profesional")
      .filter(p => {
        const arr = Array.isArray(p.areas) ? p.areas : [];
        for (const it of arr) {
          const idCandidate   = typeof it === "object" ? it._id    : it;
          const nameCandidate = typeof it === "object" ? it.nombre : it;
          if (HEX24.test(String(idCandidate || ""))) {
            const n = ID2NAME_NORM.get(String(idCandidate));
            if (n && n === targetNameNorm) return true;
          }
          if (norm(nameCandidate) === targetNameNorm) return true;
        }
        return false;
      });

    profSel.innerHTML = lista.length === 0
      ? `<option value="">Sin profesionales para el área</option>`
      : `<option value="">-- Seleccionar --</option>` +
        lista.map(p =>
          `<option value="${p._id}">${p.nombreApellido || p.nombre || p.usuario}</option>`
        ).join("");
  };

  renderProfesionales();
  areaSel.addEventListener("change", renderProfesionales);
} catch (e) {
  console.warn("No se pudieron cargar áreas/profesionales:", e);
  areaSel.innerHTML = `<option value="">No disponible</option>`;
  profSel.innerHTML = `<option value="">No disponible</option>`;
}



      // --- Responsables dinámicos (permitir repetir relación)
      const cont = document.getElementById("responsablesContainer");
      const btnAdd = document.getElementById("btnAgregarResponsable");

      const relaciones = ['padre', 'madre', 'tutor'];
      const makeRelacionOptions = (seleccionActual = '') => {
        return ['<option value="">-- Relación --</option>']
          .concat(relaciones.map(r =>
            `<option value="${r}" ${r === seleccionActual ? 'selected' : ''}>${r[0].toUpperCase()+r.slice(1)}</option>`
          )).join('');
      };

      let idx = 0;
      const addRow = (preset = {relacion:'tutor', nombre:'', whatsapp:''}) => {
        const filas = cont.querySelectorAll('.responsable-row').length;
        if (filas >= 3) return;

        const rowId = `resp-${idx++}`;
        const html = `
          <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
            <div style="display:grid; grid-template-columns: 150px 1fr 1fr 48px; gap:12px; align-items:center;">
              <select class="swal2-select resp-relacion" style="margin:0;height:40px;">
                ${makeRelacionOptions(preset.relacion || '')}
              </select>
              <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}" style="margin:0;height:40px;">
              <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}" style="margin:0;height:40px;">
              <button type="button" class="swal2-cancel swal2-styled btn-remove" title="Quitar"
                style="width:36px;height:36px;margin:0;padding:0;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
          </div>
        `;
        cont.insertAdjacentHTML('beforeend', html);

        const removeBtn = cont.lastElementChild.querySelector('.btn-remove');
        removeBtn.addEventListener('click', () => {
          cont.removeChild(document.getElementById(rowId));
        });
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
      const mailPadres   = gv("mailPadres");
      const mailTutor    = gv("mailTutor");
      const condicionDePagoVal = gv("condicionDePago");
      const estado       = gv("estado");

      const dniRegex  = /^\d{7,8}$/;
      const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const wspRegex  = /^\d{10,15}$/;

      if (!nombre || !dni || !fechaNacimiento) {
        Swal.showValidationMessage("⚠️ Completá los campos obligatorios (Nombre, DNI, Fecha).");
        return false;
      }
      if (!dniRegex.test(dni)) {
        Swal.showValidationMessage("⚠️ El DNI debe tener entre 7 y 8 dígitos numéricos.");
        return false;
      }

      // mails opcionales → si vienen, validar
      if (colegioMail && !mailRegex.test(colegioMail)) {
        Swal.showValidationMessage("⚠️ El mail del colegio no es válido.");
        return false;
      }
      if (mailPadres && !mailRegex.test(mailPadres)) {
        Swal.showValidationMessage("⚠️ El mail de los padres no es válido.");
        return false;
      }
      if (mailTutor && !mailRegex.test(mailTutor)) {
        Swal.showValidationMessage("⚠️ El mail del tutor no es válido.");
        return false;
      }

      // Responsables (1..3)
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
        if (!relacion || !nombreR || !whatsapp) {
          Swal.showValidationMessage("⚠️ Completá relación, nombre y WhatsApp en cada responsable.");
          return false;
        }
        if (!wspRegex.test(whatsapp)) {
          Swal.showValidationMessage("⚠️ WhatsApp inválido (10 a 15 dígitos).");
          return false;
        }
        responsables.push({ relacion, nombre: nombreR, whatsapp });
      }

      // Obra social opcional
      let prestador="", credencial="", tipo="";
      if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
        prestador  = gv("prestador");
        credencial = gv("credencial");
        tipo       = gv("tipo");
      }

      // ---- Módulos (si existieran filas .modulo-row en el DOM) ----
      const modulosAsignados = [];
      document.querySelectorAll(".modulo-row").forEach((row) => {
        const moduloSel    = row.querySelector(".modulo-select");
        const moduloId     = moduloSel?.value;
        const moduloNombre = moduloSel?.selectedOptions?.[0]?.textContent.trim();
        const cantidad     = parseFloat(row.querySelector(".cantidad-select")?.value);

        if (moduloId && cantidad > 0) {
          const profesionales = [];
          row.querySelectorAll(".profesional-row").forEach(profRow => {
            const profSel  = profRow.querySelector(".profesional-select");
            const areaSel  = profRow.querySelector(".area-select");

            const profesionalId   = profSel?.value;
            const profesionalName = profSel?.selectedOptions?.[0]?.textContent.trim();
            const areaName        = areaSel?.selectedOptions?.[0]?.textContent.trim();

            if (profesionalId && areaName) {
              profesionales.push({ profesionalId, nombre: profesionalName, area: areaName });
            }
          });

          modulosAsignados.push({
            moduloId,
            nombre: moduloNombre || "Módulo",
            cantidad,
            profesionales
          });
        }
      });

      // Derivar áreas desde módulos (si hay)
      const areasDerivadas = [...new Set(
        modulosAsignados.flatMap(m => (m.profesionales || []).map(pr => pr.area).filter(Boolean))
      )];

      // Payload
      return {
        nombre,
        dni,
        fechaNacimiento,
        colegio,
        colegioMail,
        curso,

        responsables,

        mailPadres: mailPadres || undefined,
        mailTutor:  mailTutor  || undefined,

        condicionDePago: condicionDePagoVal,
        estado,
        prestador,
        credencial,
        tipo,

        // módulos/áreas (si no hay UI, van vacíos y no pasa nada)
        modulosAsignados,
        areas: areasDerivadas
      };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    }
  });
});



async function verDocumentos(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();
    const documentos = paciente.documentosPersonales ?? [];

    const htmlTabla = documentos.length
      ? documentos
        .map(
          (doc, i) => `
        <tr>
          <td>${doc.fecha}</td>
          <td>${doc.tipo}</td>
          <td>${doc.observaciones ?? "-"}</td>
          <td><a href="${doc.archivoURL
            }" target="_blank" title="Ver archivo"><i class="fa fa-file-pdf"></i></a></td>
          <td>
            <button onclick="editarDocumento('${dni}', ${i})"><i class="fa fa-pen"></i></button>
            <button onclick="eliminarDocumento('${dni}', ${i})"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
      `
        )
        .join("")
      : `<tr><td colspan="5" style="text-align:center;">No hay documentos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Documentos personales - DNI ${dni}</h3>`,
      html: `
  <button onclick="agregarDocumento('${dni}')" class="swal2-confirm" style="margin-bottom: 10px;">➕ Agregar documento</button>
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
  const { value: formValues, isConfirmed } = await Swal.fire({
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
    preConfirm: async () => {
      const fecha = document.getElementById("docFecha").value;
      const tipo = document.getElementById("docTipo").value;
      const observaciones = document.getElementById("docObs").value;
      const archivo = document.getElementById("docArchivo").files[0];

      if (!fecha || !tipo || !archivo) {
        Swal.showValidationMessage(
          "Todos los campos excepto observaciones son obligatorios"
        );
        return false;
      }

      // Simulación de subida de archivo
      const archivoURL = await simularSubidaArchivo(archivo);

      return { fecha, tipo, observaciones, archivoURL };
    },
  });

  if (!isConfirmed || !formValues) return;

  try {
    // Traer paciente actual
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();

    const nuevoDoc = {
      fecha: formValues.fecha,
      tipo: formValues.tipo,
      observaciones: formValues.observaciones,
      archivoURL: formValues.archivoURL,
    };

    const documentosActualizados = [
      ...(Array.isArray(paciente.documentosPersonales)
        ? paciente.documentosPersonales
        : []),
      nuevoDoc,
    ];

    await fetch(`${API_URL}/${dni}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentosPersonales: documentosActualizados }), // ✅ corregido
    });

    Swal.fire("✅ Documento agregado", "", "success");
    verDocumentos(dni); // Refrescar la vista
  } catch (error) {
    console.error("Error al agregar documento:", error);
    Swal.fire("❌ Error al guardar documento", "", "error");
  }
}

async function verDiagnosticos(dni) {
  try {
    const res = await fetch(`${API_URL}/${dni}`);
    const paciente = await res.json();
    const diagnosticos = paciente.diagnosticos ?? [];

    const htmlTabla = diagnosticos.length
      ? diagnosticos
        .map(
          (d, i) => `
        <tr>
          <td>${d.fecha}</td>
          <td>${d.area}</td>
          <td>${d.observaciones ?? "-"}</td>
          <td><a href="${d.archivoURL
            }" target="_blank"><i class="fa fa-file-pdf"></i></a></td>
          <td>
            <button onclick="editarDiagnostico('${dni}', ${i})"><i class="fa fa-pen"></i></button>
            <button onclick="eliminarDiagnostico('${dni}', ${i})"><i class="fa fa-trash"></i></button>
          </td>
        </tr>
      `
        )
        .join("")
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

// ==========================
// 🔹 Manejo de sesión en Pacientes
// ==========================
const token = localStorage.getItem("token");
const usuario = JSON.parse(localStorage.getItem("usuario"));

// Si no hay token → volver al login
if (!token) {
  window.location.href = "index.html";
}

// Mostrar nombre dinámico en el top bar (si existe <strong id="userName">)
if (usuario && usuario.nombreApellido) {
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = usuario.nombreApellido;
}

// 🔹 Botón cerrar sesión (si existe <button id="btnLogout">)
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.href = "index.html";
  });
}
