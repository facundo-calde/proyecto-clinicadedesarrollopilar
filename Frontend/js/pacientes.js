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
// RENDER FICHA (solo muestra RESUMEN DE ESTADOS; se quitó el historial detallado)
// ─────────────────────────────────────────────────────────────────────────────
async function renderFichaPaciente(p) {

  const _l = document.getElementById('listadoPacientes'); if (_l) _l.style.display = 'none';
  const container = document.getElementById("fichaPacienteContainer");

  // cache simple de catálogos
  if (!window.__catCache) window.__catCache = {};
  const cache = window.__catCache;

  async function apiFetchJson(path, init = {}) {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    const headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}`, "x-access-token": token } : {})
    };
    const res = await fetch(`/api${path}`, { ...init, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadCats() {
    if (!cache.modulos || !cache.areas || !cache.usersTried) {
      try {
        const [modulos, areas] = await Promise.all([
          apiFetchJson(`/modulos`),
          apiFetchJson(`/areas`),
        ]);
        cache.modulos = Array.isArray(modulos) ? modulos : [];
        cache.areas = Array.isArray(areas) ? areas : [];
      } catch {
        cache.modulos = [];
        cache.areas = [];
      }

      cache.users = [];
      try { cache.users = await apiFetchJson(`/usuarios`); }
      catch { cache.users = []; }

      cache.usersTried = true;

      cache.modById = new Map(cache.modulos.map(m => [String(m._id), m]));
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

  const userLabel = (cp) => {
    if (!cp) return "";
    if (typeof cp === "object") {
      if (cp.nombre) return cp.nombre;
      if (cp.usuario) return cp.usuario;
      if (cp.usuarioId) {
        const u = cache.userById.get(String(cp.usuarioId));
        return u?.nombreApellido || u?.usuario || `ID:${shortId(cp.usuarioId)}`;
      }
    }
    if (HEX24.test(String(cp))) {
      const u = cache.userById.get(String(cp));
      return u?.nombreApellido || u?.usuario || `ID:${shortId(cp)}`;
    }
    return String(cp);
  };

  // ── RESUMEN: creado (En espera), Alta, Baja ───────────────────────────────
  function buildEstadoResumen() {
    const hist = Array.isArray(p.estadoHistorial) ? [...p.estadoHistorial].filter(h => h && h.fecha) : [];
    hist.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // asc

    // creado/en espera
    let creado = null;
    for (const h of hist) {
      const to = (h.estadoNuevo ?? h.estado ?? "").toLowerCase();
      if (to === "en espera") {
        creado = {
          actor: userLabel(h.cambiadoPor),
          fecha: h.fecha,
          obs: h.descripcion || ""
        };
        break;
      }
    }
    if (!creado && (p.creadoPor || p.createdBy || p.creadoPorId || p.createdAt || p.fechaCreacion)) {
      creado = {
        actor: userLabel(p.creadoPor || p.createdBy || p.creadoPorId),
        fecha: p.createdAt || p.fechaCreacion || p.creadoEl || "",
        obs: p.observacionCreacion || ""
      };
    }

    // última Alta
    let alta = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      const to = (h.estadoNuevo ?? h.estado ?? "").toLowerCase();
      if (to === "alta") {
        alta = { actor: userLabel(h.cambiadoPor), fecha: h.fecha, obs: h.descripcion || "" };
        break;
      }
    }

    // última Baja
    let baja = null;
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      const to = (h.estadoNuevo ?? h.estado ?? "").toLowerCase();
      if (to === "baja") {
        baja = { actor: userLabel(h.cambiadoPor), fecha: h.fecha, obs: h.descripcion || "" };
        break;
      }
    }

    const line = (lbl, data) => {
      if (!data) return "";
      const actor = data.actor || "—";
      const fecha = data.fecha ? ` — <span style="color:#777;">(${fmtDateTime(data.fecha)})</span>` : "";
      const obs = data.obs ? ` — <span style="color:#555;">${data.obs}</span>` : "";
      return `<p><strong>${lbl}:</strong> ${actor}${fecha}${obs}</p>`;
    };

    return `
      ${line("Creado (En espera) por", creado)}
      ${line("Dado de Alta por", alta)}
      ${line("Dado de Baja por", baja)}
    `;
  }

  // ── MÓDULOS (sin “undefined”) ─────────────────────────────────────────────
  const modulosHTML = (Array.isArray(p.modulosAsignados) && p.modulosAsignados.length)
    ? (() => {
      const items = p.modulosAsignados
        .map(m => {
          const mod = cache.modById.get(String(m.moduloId));
          const nombreSeguro =
            (mod?.nombre) ||
            (typeof mod?.numero !== "undefined" ? `Módulo ${mod.numero}` : null) ||
            m.moduloNombre || m.nombre || "Módulo";
          const cant = (typeof m.cantidad !== "undefined" && m.cantidad !== null) ? m.cantidad : "-";

          const det = (Array.isArray(m.profesionales) && m.profesionales.length)
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

          if (!m.moduloId && nombreSeguro === "Módulo") return "";
          return `<li>${nombreSeguro} - Cantidad: ${cant}${det}</li>`;
        })
        .filter(Boolean);

      if (!items.length) return "Sin módulos asignados";
      return `<ul style="margin:5px 0; padding-left:20px;">${items.join("")}</ul>`;
    })()
    : "Sin módulos asignados";

  // mails
  const clickableMail = (mail) =>
    mail
      ? `<a href="mailto:${mail}" style="color:#1a73e8; text-decoration:none;">${mail}</a>`
      : "sin datos";

  // ── RESPONSABLES (incluye Documento) ──────────────────────────────────────
  const responsablesHTML = (() => {
    if (Array.isArray(p.responsables) && p.responsables.length) {
      return `
        <ul style="margin:5px 0; padding-left:20px;">
          ${p.responsables.slice(0, 3).map(r => {
        const rel = cap(r.relacion ?? "");
        const nom = r.nombre ?? "sin nombre";
        const wspHTML = r.whatsapp
          ? ` 📱 <a href="https://wa.me/${r.whatsapp}" target="_blank" style="color:#25d366; text-decoration:none;">${r.whatsapp}</a>`
          : "";
        const docHTML = r.documento ? ` 🧾 ${r.documento}` : "";
        const mailHTML = r.email ? ` ✉️ ${clickableMail(r.email)}` : "";
        return `<li><strong>${rel}:</strong> ${nom}${wspHTML}${docHTML}${mailHTML}</li>`;
      }).join("")}
        </ul>`;
    }
    const tutorLinea = (p.tutor?.nombre || p.tutor?.whatsapp)
      ? `<li><strong>Tutor/a:</strong> ${p.tutor?.nombre ?? "sin datos"}${p.tutor?.whatsapp
        ? ` 📱 <a href="https://wa.me/${p.tutor.whatsapp}" target="_blank" style="color:#25d366; text-decoration:none;">${p.tutor.whatsapp}</a>`
        : ""}</li>`
      : "";
    const mpLinea = (p.madrePadre || p.whatsappMadrePadre)
      ? `<li><strong>Padre o Madre:</strong> ${p.madrePadre ?? "sin datos"}${p.whatsappMadrePadre
        ? ` 📱 <a href="https://wa.me/${p.whatsappMadrePadre}" target="_blank" style="color:#25d366; text-decoration:none;">${p.whatsappMadrePadre}</a>`
        : ""}</li>`
      : "";
    if (!tutorLinea && !mpLinea) return "Sin responsables cargados";
    return `<ul style="margin:5px 0; padding-left:20px;">${mpLinea}${tutorLinea}</ul>`;
  })();

  // ── RENDER ────────────────────────────────────────────────────────────────
  container.innerHTML = `
    <div class="ficha-paciente">
      <div class="ficha-header">
        <h3>${p.nombre ?? "Sin nombre"} - DNI ${p.dni ?? "Sin DNI"}</h3>
      </div>

      <div class="ficha-row">
        <div class="ficha-bloque ficha-simple">
          <p><strong>Condición de Pago:</strong> ${p.condicionDePago ?? "sin datos"}</p>
          <p><strong>Estado actual:</strong> ${p.estado ?? "sin datos"}</p>

          <div style="margin-top:8px;">
            <h4 style="margin:0 0 6px 0;">Resumen de estados</h4>
            ${buildEstadoResumen()}
          </div>

          ${p.estado === "Baja"
      ? `<p><strong>Fecha de baja:</strong> ${p.fechaBaja ?? "-"}</p>
               <p><strong>Motivo de baja:</strong> ${p.motivoBaja ?? "-"}</p>`
      : ""}
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


async function apiFetch(path, init = {}) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}`, "x-access-token": token } : {}),
  };
  return fetch(`/api${path}`, { ...init, headers });
}

// BORRAR documento: usa id si está, si no usa ?index
async function borrarDocumento(dni, id, index, after) {
  const url = id ? `/pacientes/${dni}/documentos/${id}` : `/pacientes/${dni}/documentos?index=${index}`;
  const ok = confirm("¿Eliminar este documento? Esta acción no se puede deshacer.");
  if (!ok) return;

  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "No se pudo eliminar el documento");
    return;
  }
  if (typeof after === "function") after(); // refrescá la lista
}

// BORRAR diagnóstico
async function borrarDiagnostico(dni, id, index, after) {
  const url = id ? `/pacientes/${dni}/diagnosticos/${id}` : `/pacientes/${dni}/diagnosticos?index=${index}`;
  const ok = confirm("¿Eliminar este diagnóstico?");
  if (!ok) return;

  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || "No se pudo eliminar el diagnóstico");
    return;
  }
  if (typeof after === "function") after();
}


async function modificarPaciente(dni) {
  try {
    const p = await apiFetchJson(`/pacientes/${dni}`);

    let MODULOS = [], AREAS = [], USUARIOS = [], MODULOS_ESP = [];
    try {
      const [m, a, u] = await Promise.all([
        apiFetchJson(`/modulos`),
        apiFetchJson(`/areas`),
        apiFetchJson(`/usuarios`),
      ]);
      MODULOS  = Array.isArray(m) ? m : [];
      AREAS    = Array.isArray(a) ? a : [];
      USUARIOS = Array.isArray(u) ? u : [];

      // Intento 1: endpoint dedicado
      try {
        const me = await apiFetchJson(`/modulos-especiales`);
        if (Array.isArray(me) && me.length) MODULOS_ESP = me;
      } catch (_) {}

      // Intento 2 (fallback): derivar de MODULOS
      if (!MODULOS_ESP.length && Array.isArray(MODULOS)) {
        MODULOS_ESP = MODULOS.filter(m =>
          m?.esEspecial === true ||
          m?.especial === true ||
          (typeof m?.tipo === "string" && m.tipo.toLowerCase() === "especial") ||
          (typeof m?.nombre === "string" && /especial/i.test(m.nombre))
        );
      }
    } catch (_) { }

    // 👇 usa m.nombre del esquema actual
    const MOD_OPTS = MODULOS.length
      ? MODULOS.map(m => `<option value="${m._id}">${m.nombre}</option>`).join("")
      : `<option value="">No disponible</option>`;

    const MOD_ESP_OPTS = MODULOS_ESP.length
      ? MODULOS_ESP.map(m => `<option value="${m._id}">${m.nombre}</option>`).join("")
      : `<option value="">No disponible</option>`;

    const AREA_OPTS = AREAS.length
      ? AREAS.map(a => `<option value="${a._id}">${a.nombre}</option>`).join("")
      : `<option value="">No disponible</option>`;

    // ---- Helpers de filtro por área/rol (reforzados) ----
    const norm = (s) => (s ?? "").toString()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().trim();
    const HEX24 = /^[a-f0-9]{24}$/i;

    const AREA_ID_TO_NAME_NORM = new Map();
    AREAS.forEach(a => AREA_ID_TO_NAME_NORM.set(String(a._id), norm(a.nombre)));

    function normalizeRole(r) {
      const x = norm(r);
      if (!x) return "";
      if (x.includes("directora")) return "directoras";
      if (x.includes("coordinador") && x.includes("profes")) return "coordinador y profesional";
      if (x.includes("coordinador") && (x.includes("area") || x.includes("área"))) return "coordinador de área";
      if (x.startsWith("pasant")) return "pasante";
      if (x.startsWith("profes")) return "profesional";
      return x;
    }

    const ROLES_ASIGNABLES = new Set([
      "profesional",
      "coordinador y profesional",
      "coordinador de área",
      "directoras",
      "pasante",
    ]);

    function userRoles(u) {
      const out = new Set();
      if (u.rol) out.add(normalizeRole(u.rol));
      if (u.rolAsignado) out.add(normalizeRole(u.rolAsignado));
      if (Array.isArray(u.roles)) for (const rr of u.roles) out.add(normalizeRole(rr));
      return new Set([...out].filter(Boolean));
    }

    function matchAreaEntry(entry, targetId, targetNameNorm) {
      if (!entry) return false;

      if (typeof entry === "string") {
        const s = entry.trim();
        if (!s) return false;
        if (HEX24.test(s) && s === targetId) return true;
        return norm(s) === targetNameNorm;
      }

      const idCandidates = [
        entry._id, entry.id, entry.areaId,
        entry.area?._id, entry.area?.id
      ].filter(Boolean).map(String);
      if (idCandidates.some(x => x === targetId)) return true;

      const nameCandidates = [
        entry.areaNombre, entry.nombre, entry.name, entry.area,
        entry.area?.nombre, entry.area?.name
      ].filter(Boolean).map(norm);

      return nameCandidates.some(n => n === targetNameNorm);
    }

    function userBelongsToArea(u, targetId) {
      const targetNameNorm = AREA_ID_TO_NAME_NORM.get(String(targetId)) || "";

      if (Array.isArray(u.areasProfesional) && u.areasProfesional.some(e => matchAreaEntry(e, String(targetId), targetNameNorm))) return true;
      if (Array.isArray(u.areasCoordinadas) && u.areasCoordinadas.some(e => matchAreaEntry(e, String(targetId), targetNameNorm))) return true;
      if (Array.isArray(u.areasProfesionalDetalladas) && u.areasProfesionalDetalladas.some(e => matchAreaEntry(e, String(targetId), targetNameNorm))) return true;
      if (Array.isArray(u.areasCoordinadasDetalladas) && u.areasCoordinadasDetalladas.some(e => matchAreaEntry(e, String(targetId), targetNameNorm))) return true;

      if (Array.isArray(u.areas) && u.areas.some(e => matchAreaEntry(e, String(targetId), targetNameNorm))) return true;

      if (u.area && matchAreaEntry(u.area, String(targetId), targetNameNorm)) return true;
      if (u.areaNombre && matchAreaEntry(u.areaNombre, String(targetId), targetNameNorm)) return true;

      if ([...userRoles(u)].includes("pasante") && u.pasanteArea && matchAreaEntry(u.pasanteArea, String(targetId), targetNameNorm)) return true;

      return false;
    }

    const profesionalesDeArea = (areaId) => {
      const selId = String(areaId || "");
      const lista = (USUARIOS || [])
        .filter(u => {
          const roles = userRoles(u);
          if (![...roles].some(r => ROLES_ASIGNABLES.has(r))) return false;
          if (roles.has("directoras")) return true;
          if (!selId) return true;
          return userBelongsToArea(u, selId);
        })
        .sort((a, b) => (a.nombreApellido || "").localeCompare(b.nombreApellido || "", "es"));

      if (!lista.length) return `<option value="">Sin usuarios para el área</option>`;
      return `<option value="">-- Seleccionar --</option>` +
        lista.map(u => {
          const roles = [...userRoles(u)].filter(r => ROLES_ASIGNABLES.has(r));
          const rolMostrar = roles.includes("directoras") ? "Directora" : (roles[0] || (u.rol || ""));
          return `<option value="${u._id}">${u.nombreApellido || u.nombre || u.usuario} — ${rolMostrar}</option>`;
        }).join("");
    };

    // ---- Template común de cada bloque de módulo ----
    const renderModuloSelect = (index, optsHtml) => `
      <div class="modulo-row" data-index="${index}"
           style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:6px;">
        <div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; margin-bottom:10px;">
          <div style="min-width:0;">
            <label>Módulo:</label>
            <select class="modulo-select swal2-select" style="width:100%; margin:0;">
              <option value="">-- Seleccionar --</option>
              ${optsHtml}
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
          <h5 style="margin:8px 0;">Usuarios (profesionales / coordinadores / directoras / pasantes):</h5>
          <div class="profesional-row" style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px;">
            <select class="area-select swal2-select" style="width:100%; margin:0;">
              <option value="">-- Área --</option>
              ${AREA_OPTS}
            </select>
            <select class="profesional-select swal2-select" style="width:100%; margin:0;">
              <option value="">-- Seleccionar usuario --</option>
            </select>
          </div>
        </div>

        <button type="button" class="btnAgregarProfesional"
          style="margin-top:8px; padding:4px 10px; border:1px solid #ccc; border-radius:5px; background:#eee; cursor:pointer;">
          ➕ Agregar otro
        </button>
      </div>
    `;

    // ---- Responsables iniciales (con documento opcional) ----
    const responsablesIniciales = Array.isArray(p.responsables) && p.responsables.length
      ? p.responsables.slice(0, 3).map(r => ({
          relacion: r.relacion,
          nombre: r.nombre,
          whatsapp: r.whatsapp,
          email: r.email || "",
          documento: r.documento || ""
        }))
      : (() => {
          const arr = [];
          if (p.tutor?.nombre && p.tutor?.whatsapp) {
            arr.push({ relacion: 'tutor', nombre: p.tutor.nombre, whatsapp: p.tutor.whatsapp, email: "", documento: "" });
          }
          if (p.madrePadre) {
            arr.push({
              relacion: /madre/i.test(p.madrePadre) ? 'madre' : 'padre',
              nombre: String(p.madrePadre).replace(/^(madre|padre)\s*:\s*/i, '').trim(),
              whatsapp: p.whatsappMadrePadre || '',
              email: "",
              documento: ""
            });
          }
          return arr.slice(0, 3);
        })();

    // ---- Modal principal ----
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

          <hr>
          <h4 style="margin-top:15px;">Módulos <u>especiales</u> asignados</h4>
          <div id="modulosEspecialesContainer"></div>
          <button type="button" id="btnAgregarModuloEspecial"
            style="margin-top:10px; padding:5px 10px; border:1px solid #ccc; border-radius:5px; background:#f7f7f7; cursor:pointer;">
            ✨ Agregar módulo especial
          </button>
        </form>
      `,
      didOpen: () => {
        // obra social
        const condicionDePagoSelect = document.getElementById("condicionDePago");
        const obraSocialExtra = document.getElementById("obraSocialExtra");
        const toggleObraSocial = () => {
          const v = condicionDePagoSelect.value;
          obraSocialExtra.style.display = (v === "Obra Social" || v === "Obra Social + Particular") ? "block" : "none";
        };
        condicionDePagoSelect.addEventListener("change", toggleObraSocial);
        toggleObraSocial();

        // desc estado
        const estadoSel = document.getElementById("estado");
        theEstadoDescWrap = document.getElementById("estadoDescWrap"); // conservar nombre previo
        const estadoInicial = p.estado || "En espera";
        const toggleDesc = () => {
          theEstadoDescWrap.style.display = (estadoSel.value !== estadoInicial) ? "block" : "none";
        };
        estadoSel.addEventListener("change", toggleDesc);
        toggleDesc();

        // responsables
        const cont = document.getElementById("responsablesContainer");
        const btnAdd = document.getElementById("btnAgregarResponsable");
        const relaciones = ['padre', 'madre', 'tutor'];
        const makeRelacionOptions = (sel = '') =>
          ['<option value="">-- Relación --</option>']
            .concat(relaciones.map(r => `<option value="${r}" ${r === sel ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`))
            .join('');
        let idx = 0;
        const addRespRow = (preset = { relacion: 'tutor', nombre: '', email: '', whatsapp: '', documento: '' }) => {
          const filas = cont.querySelectorAll('.responsable-row').length;
          if (filas >= 3) return;
          const rowId = `resp-${idx++}`;
          const html = `
            <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
              <div style="display:grid; grid-template-columns: 140px 1fr 1fr 1fr 1fr 40px; gap:10px; align-items:center;">
                <select class="swal2-select resp-relacion" style="margin:0;height:40px;">
                  ${makeRelacionOptions(preset.relacion || '')}
                </select>
                <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}" style="margin:0;height:40px;">
                <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}" style="margin:0;height:40px;">
                <input class="swal2-input resp-documento" placeholder="Documento (DNI/CUIT)" value="${preset.documento || ''}" style="margin:0;height:40px;">
                <input class="swal2-input resp-email" type="email" placeholder="Email (opcional)" value="${preset.email || ''}" style="margin:0;height:40px;">
                <button type="button" class="swal2-cancel swal2-styled btn-remove" title="Quitar"
                        style="width:36px;height:36px;margin:0;padding:0;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
              </div>
            </div>`;
          cont.insertAdjacentHTML('beforeend', html);
          cont.lastElementChild.querySelector('.btn-remove')
            .addEventListener('click', () => cont.removeChild(document.getElementById(rowId)));
        };
        if (responsablesIniciales.length) responsablesIniciales.forEach(r => addRespRow(r));
        else addRespRow({ relacion: 'tutor' });
        btnAdd.addEventListener('click', () => addRespRow());

        // ====== Módulos (comunes) ======
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
                <option value="">-- Seleccionar usuario --</option>
              </select>
            </div>`;

          const wireFilter = (row) => {
            const areaSel = row.querySelector(".area-select");
            const profSel = row.querySelector(".profesional-select");
            const render = () => { profSel.innerHTML = profesionalesDeArea(areaSel.value); };
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
          modCont.insertAdjacentHTML("beforeend", renderModuloSelect(index, MOD_OPTS));
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
            if (!profesionales.length) return;

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

        // ====== Módulos ESPECIALES ======
        const modEspCont = document.getElementById("modulosEspecialesContainer");

        const addModuloEspecialRow = () => {
          const index = modEspCont.querySelectorAll(".modulo-row").length;
          modEspCont.insertAdjacentHTML("beforeend", renderModuloSelect(index, MOD_ESP_OPTS));
          const modRowEl = modEspCont.lastElementChild;
          // reutilizamos el mismo attach
          (function attachAgregarProfesional(modRowEl) {
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
                  <option value="">-- Seleccionar usuario --</option>
                </select>
              </div>`;

            const wireFilter = (row) => {
              const areaSel = row.querySelector(".area-select");
              const profSel = row.querySelector(".profesional-select");
              const render = () => { profSel.innerHTML = profesionalesDeArea(areaSel.value); };
              areaSel.addEventListener("change", render);
              render();
            };

            btn.addEventListener("click", () => {
              container.insertAdjacentHTML("beforeend", buildRow());
              wireFilter(container.lastElementChild);
            });

            wireFilter(container.querySelector(".profesional-row"));
          })(modRowEl);

          return modRowEl;
        };

        const existentesEsp = Array.isArray(p.modulosEspecialesAsignados)
          ? p.modulosEspecialesAsignados
          : (Array.isArray(p.modulosEspeciales) ? p.modulosEspeciales : []); // legacy

        if (!existentesEsp.length) {
          addModuloEspecialRow();
        } else {
          existentesEsp.forEach(m => {
            const row = addModuloEspecialRow();
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
            if (!profesionales.length) return;

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

        document.getElementById("btnAgregarModuloEspecial").addEventListener("click", () => {
          addModuloEspecialRow();
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
        const colegio = gv("colegio");
        const colegioMail = gv("colegioMail");
        const curso = gv("curso");

        const condicionDePagoVal = gv("condicionDePago");
        const estado = gv("estado");
        const descripcionEstado = (document.getElementById("estadoDescWrap").style.display !== "none")
          ? gv("descripcionEstado")
          : "";

        const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const wspRegex = /^\d{10,15}$/;

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
          const documento= (row.querySelector('.resp-documento')?.value || "").trim();

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
          if (documento) r.documento = documento;
          if (emailR)  r.email = emailR;
          responsables.push(r);
        }

        // === Recolectar módulos comunes
        const modulosAsignados = [];
        document.querySelectorAll("#modulosContainer .modulo-row").forEach((row) => {
          const moduloId = row.querySelector(".modulo-select")?.value;
          const cantidad = parseFloat(row.querySelector(".cantidad-select")?.value);
          if (moduloId && cantidad > 0) {
            const profesionalesAsignados = [];
            row.querySelectorAll(".profesional-row").forEach(profRow => {
              const areaId = profRow.querySelector(".area-select")?.value;
              const profesionalId = profRow.querySelector(".profesional-select")?.value;
              if (profesionalId && areaId) profesionalesAsignados.push({ profesionalId, areaId });
            });
            modulosAsignados.push({ moduloId, cantidad, profesionales: profesionalesAsignados });
          }
        });

        // === Recolectar módulos ESPECIALES
        const modulosEspecialesAsignados = [];
        document.querySelectorAll("#modulosEspecialesContainer .modulo-row").forEach((row) => {
          const moduloId = row.querySelector(".modulo-select")?.value;
          const cantidad = parseFloat(row.querySelector(".cantidad-select")?.value);
          if (moduloId && cantidad > 0) {
            const profesionalesAsignados = [];
            row.querySelectorAll(".profesional-row").forEach(profRow => {
              const areaId = profRow.querySelector(".area-select")?.value;
              const profesionalId = profRow.querySelector(".profesional-select")?.value;
              if (profesionalId && areaId) profesionalesAsignados.push({ profesionalId, areaId });
            });
            modulosEspecialesAsignados.push({ moduloId, cantidad, profesionales: profesionalesAsignados });
          }
        });

        const planTexto = gv("planPaciente");

        let prestador = "", credencial = "", tipo = "";
        if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
          prestador = gv("prestador");
          credencial = gv("credencial");
          tipo = gv("tipo");
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
          modulosAsignados,
          modulosEspecialesAsignados
        };
      }
    });

    if (!isConfirmed) return;

    const putRes = await fetch(`/api/pacientes/${dni}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!putRes.ok) {
      let msg = "Error al guardar";
      try { const j = await putRes.json(); msg = j?.error || msg; } catch { }
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

  // Helper para pedir JSON con auth
  async function apiFetchJson(path, init = {}) {
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
        ...getAuthHeaders(),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  Swal.fire({
    title: '<h3 style="font-family: Montserrat; font-weight: 600;">Cargar nuevo paciente:</h3>',
    html: `
      <form id="formNuevoPaciente" class="formulario-paciente">
        <div class="grid-form">
          <div class="columna">
            <label>Apellido y Nombre:</label>
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

            <label style="font-weight:bold;">Profesional / Coord. / Directora / Pasante:</label>
            <select id="profesionalSeleccionado" class="swal2-select" style="margin-bottom: 10px;">
              <option value="">-- Cargando usuarios --</option>
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

      // áreas + usuarios
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

        AREAS = Array.isArray(areas) ? areas : [];
        USUARIOS = Array.isArray(usuarios) ? usuarios : [];

        setOptions(
          areaSel,
          AREAS,
          (a) => `<option value="${a._id}">${a.nombre}</option>`,
          "No disponible"
        );

        // ====== Helpers robustos (idénticos a los de modificarPaciente, pero ampliados) ======
        const norm = (s) =>
          (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const HEX24 = /^[a-f0-9]{24}$/i;

        // id -> nombre normalizado
        const ID2NAME_NORM = new Map();
        AREAS.forEach(a => ID2NAME_NORM.set(String(a._id), norm(a.nombre)));

        // Normalización de roles (acepta variaciones y plurales)
        function normalizeRole(r) {
          const x = norm(r);
          if (!x) return "";
          if (x.includes("directora")) return "directoras";
          if (x.includes("coordinador") && x.includes("profes")) return "coordinador y profesional";
          if (x.includes("coordinador") && (x.includes("area") || x.includes("área"))) return "coordinador de área";
          if (x.startsWith("pasant")) return "pasante";
          if (x.startsWith("profes")) return "profesional";
          return x; // fallback
        }

        const ROLES_OK = new Set([
          "profesional",
          "coordinador y profesional",
          "coordinador de área",
          "directoras",
          "pasante"
        ]);

        // Extrae TODOS los roles posibles de un usuario (rol, rolAsignado, roles[])
        function userRoles(u) {
          const out = new Set();
          if (u.rol) out.add(normalizeRole(u.rol));
          if (u.rolAsignado) out.add(normalizeRole(u.rolAsignado));
          if (Array.isArray(u.roles)) {
            for (const rr of u.roles) out.add(normalizeRole(rr));
          }
          // Limpieza: sacamos vacíos
          return new Set([...out].filter(Boolean));
        }

        function matchAreaEntry(entry, targetId, targetNameNorm) {
          if (!entry) return false;

          if (typeof entry === "string") {
            const s = entry.trim();
            if (!s) return false;
            if (HEX24.test(s) && s === targetId) return true;
            return norm(s) === targetNameNorm;
          }

          // ids potenciales
          const idCandidates = [
            entry._id, entry.id, entry.areaId,
            entry.area?._id, entry.area?.id
          ].filter(Boolean).map(String);
          if (idCandidates.some(x => x === targetId)) return true;

          // nombres potenciales
          const nameCandidates = [
            entry.areaNombre, entry.nombre, entry.name, entry.area,
            entry.area?.nombre, entry.area?.name
          ].filter(Boolean).map(norm);

          return nameCandidates.some(n => n === targetNameNorm);
        }

        // ¿El usuario pertenece al área?
        function userBelongsToArea(u, targetId) {
          const targetNameNorm = ID2NAME_NORM.get(targetId) || "";

          // 1) Arrays de detalle
          if (Array.isArray(u.areasProfesional) && u.areasProfesional.some(e => matchAreaEntry(e, targetId, targetNameNorm))) return true;
          if (Array.isArray(u.areasCoordinadas) && u.areasCoordinadas.some(e => matchAreaEntry(e, targetId, targetNameNorm))) return true;
          if (Array.isArray(u.areasProfesionalDetalladas) && u.areasProfesionalDetalladas.some(e => matchAreaEntry(e, targetId, targetNameNorm))) return true;
          if (Array.isArray(u.areasCoordinadasDetalladas) && u.areasCoordinadasDetalladas.some(e => matchAreaEntry(e, targetId, targetNameNorm))) return true;

          // 2) Campo general "areas" (mixto)
          if (Array.isArray(u.areas) && u.areas.some(e => matchAreaEntry(e, targetId, targetNameNorm))) return true;

          // 3) Campos sueltos "area"/"areaNombre"
          if (u.area && matchAreaEntry(u.area, targetId, targetNameNorm)) return true;
          if (u.areaNombre && matchAreaEntry(u.areaNombre, targetId, targetNameNorm)) return true;

          // 4) Pasantes
          if ([...userRoles(u)].includes("pasante") && u.pasanteArea && matchAreaEntry(u.pasanteArea, targetId, targetNameNorm)) return true;

          return false;
        }

        function renderProfesionales() {
          const selId = areaSel.value || "";
          if (!selId) {
            profSel.innerHTML = `<option value="">-- Seleccioná un área primero --</option>`;
            return;
          }

          const lista = (USUARIOS || [])
            .filter(u => {
              const roles = userRoles(u);
              // debe tener algún rol válido
              if (![...roles].some(r => ROLES_OK.has(r))) return false;
              // directoras: siempre visibles
              if (roles.has("directoras")) return true;
              // resto: deben matchear el área
              return userBelongsToArea(u, selId);
            })
            .sort((a, b) => (a.nombreApellido || "").localeCompare(b.nombreApellido || "", "es"));

          profSel.innerHTML = lista.length === 0
            ? `<option value="">Sin usuarios para el área</option>`
            : `<option value="">-- Seleccionar --</option>` +
            lista.map(u => {
              const roles = [...userRoles(u)].filter(r => ROLES_OK.has(r));
              const rolMostrar = roles.includes("directoras")
                ? "Directora"
                : (roles[0] || (u.rol || ""));
              return `<option value="${u._id}">
                          ${u.nombreApellido || u.nombre || u.usuario} — ${rolMostrar}
                        </option>`;
            }).join("");
        }

        renderProfesionales();
        areaSel.addEventListener("change", renderProfesionales);
      } catch (e) {
        console.warn("No se pudieron cargar áreas/usuarios:", e);
        areaSel.innerHTML = `<option value="">No disponible</option>`;
        profSel.innerHTML = `<option value="">No disponible</option>`;
      }

      // RESPONSABLES (WhatsApp + Documento + Email)
      const cont = document.getElementById("responsablesContainer");
      const btnAdd = document.getElementById("btnAgregarResponsable");

      const relaciones = ['padre', 'madre', 'tutor'];
      const makeRelacionOptions = (seleccionActual = '') =>
        ['<option value="">-- Relación --</option>']
          .concat(relaciones.map(r =>
            `<option value="${r}" ${r === seleccionActual ? 'selected' : ''}>${r[0].toUpperCase() + r.slice(1)}</option>`
          )).join('');

      let idx = 0;
      const addRow = (preset = { relacion: 'tutor', nombre: '', whatsapp: '', documento: '', email: '' }) => {
        const filas = cont.querySelectorAll('.responsable-row').length;
        if (filas >= 3) return;

        const rowId = `resp-${idx++}`;
        const html = `
          <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
            <div style="display:grid; grid-template-columns: 140px 1fr 1fr 1fr 1fr 42px; gap:10px; align-items:center;">
              <select class="swal2-select resp-relacion" style="margin:0;height:40px;">
                ${makeRelacionOptions(preset.relacion || '')}
              </select>
              <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}" style="margin:0;height:40px;">
              <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}" style="margin:0;height:40px;">
              <input class="swal2-input resp-documento" placeholder="Documento (DNI/CUIT)" value="${preset.documento || ''}" style="margin:0;height:40px;">
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
      addRow({ relacion: 'tutor' });
    },

    preConfirm: () => {
      const gv = (id) => (document.getElementById(id)?.value ?? "").trim();

      const nombre = gv("nombre");
      const dni = gv("dni");
      const fechaNacimiento = gv("fecha");

      const colegio = gv("colegio");
      const colegioMail = gv("colegioMail");
      const curso = gv("curso");

      const condicionDePagoVal = gv("condicionDePago");
      const estado = gv("estado");

      const dniRegex = /^\d{7,8}$/;
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
        const nombreR = (row.querySelector('.resp-nombre')?.value || "").trim();
        const whatsapp = (row.querySelector('.resp-whatsapp')?.value || "").trim();
        const documento = (row.querySelector('.resp-documento')?.value || "").trim(); // opcional
        const email = (row.querySelector('.resp-email')?.value || "").trim().toLowerCase();

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
        if (documento) r.documento = documento;
        if (email) r.email = email;
        responsables.push(r);
      }

      let prestador = "", credencial = "", tipo = "";
      if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
        prestador = gv("prestador");
        credencial = gv("credencial");
        tipo = gv("tipo");
      }

      // sin módulos acá
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



// ─────────────────────────────────────────────────────────────────────────────
// R2 (Worker) – helpers (usa tus buckets: usuarios, pacientes)
// ─────────────────────────────────────────────────────────────────────────────
const R2_BASE = 'https://r2-uploader.clinicadesarrollopilarapp.workers.dev'; // ← cambialo si hace falta
const R2_BUCKET_PACIENTES = 'pacientes';

const slugFileName = (name = '') =>
  String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

async function r2Put({ bucket, key, file, contentType }) {
  const url = `${R2_BASE}/${bucket}/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType || file.type || 'application/octet-stream' },
    body: file
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `Error subiendo a R2 (${res.status})`);
  }
  return { key, url }; // url pública del Worker
}

async function r2Delete({ bucket, key }) {
  const url = `${R2_BASE}/${bucket}/${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `Error borrando en R2 (${res.status})`);
  }
}

const nfISO = (d) => {
  try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[m]);

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS PERSONALES
// ─────────────────────────────────────────────────────────────────────────────
async function verDocumentos(dni) {
  try {
    const paciente   = await apiFetchJson(`/pacientes/${dni}`);
    const documentos = Array.isArray(paciente.documentosPersonales) ? paciente.documentosPersonales : [];

    const htmlTabla = documentos.length
      ? documentos.map((doc) => {
          const fecha = doc.fecha ? nfISO(doc.fecha) : '-';
          const tipo  = esc(doc.tipo ?? '-');
          const obs   = esc(doc.observaciones ?? '-');

          const href =
            doc.archivoURL || doc.archivoUrl || doc.url || doc.fileUrl || doc.publicUrl ||
            (doc.archivoKey || doc.key || doc.r2Key
              ? `${R2_BASE}/${R2_BUCKET_PACIENTES}/${encodeURIComponent(doc.archivoKey || doc.key || doc.r2Key)}`
              : "");

          return `
            <tr>
              <td>${fecha}</td>
              <td>${tipo}</td>
              <td>${obs}</td>
              <td>
                ${href
                  ? `<a href="${href}" target="_blank" rel="noopener" title="Ver archivo">
                       <i class="fa-solid fa-file-pdf"></i> Ver
                     </a>`
                  : "-"}
              </td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="text-align:center;">No hay documentos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Documentos personales - DNI ${dni}</h3>`,
      html: `
        <button onclick="agregarDocumento('${dni}')" class="swal2-confirm" style="margin-bottom:10px;">➕ Agregar documento</button>
        <table style="width:100%; font-size:14px; text-align:left;">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Observaciones</th><th>Ver adjuntos</th></tr>
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
      <div style="display:flex; flex-direction:column; gap:10px;">
        <label>Fecha:</label>
        <input type="date" id="docFecha" class="swal2-input">
        <label>Tipo:</label>
        <input type="text" id="docTipo" class="swal2-input" placeholder="Ej: DNI, Autorización, Carnet OS...">
        <label>Observaciones:</label>
        <textarea id="docObs" class="swal2-textarea" placeholder="Opcional"></textarea>
        <label>Archivo adjunto (PDF/imagen/doc):</label>
        <input type="file" id="docArchivo" class="swal2-file" accept=".pdf,image/*,.doc,.docx,.txt">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    preConfirm: async () => {
      const fecha = document.getElementById("docFecha").value;
      const tipo  = document.getElementById("docTipo").value.trim();
      const observaciones = document.getElementById("docObs").value.trim();
      const archivo = document.getElementById("docArchivo").files[0];

      if (!fecha || !tipo || !archivo) {
        Swal.showValidationMessage("Fecha, tipo y archivo son obligatorios");
        return false;
      }

      // 1) Subir archivo a R2 vía Worker
      const safeName = slugFileName(archivo.name);
      const ts = Date.now();
      const key = `${dni}/documentos/${ts}-${safeName}`;
      await r2Put({ bucket: R2_BUCKET_PACIENTES, key, file: archivo });

      // 2) Guardar metadata en backend
      const res = await apiFetch(`/pacientes/${dni}/documentos`, {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          tipo,
          observaciones,
          archivoKey: key,
          archivoURL: `${R2_BASE}/${R2_BUCKET_PACIENTES}/${encodeURIComponent(key)}`
        })
      });
      if (!res.ok) {
        try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key }); } catch { }
        let msg = "No se pudo guardar el documento";
        try { const j = await res.json(); msg = j?.error || msg; } catch { }
        throw new Error(msg);
      }
      return true;
    },
  });

  if (!isConfirmed) return;
  Swal.fire("✅ Documento agregado", "", "success").then(() => verDocumentos(dni));
}

async function editarDocumento(dni, index) {
  try {
    const paciente = await apiFetchJson(`/pacientes/${dni}`);
    const docs = Array.isArray(paciente.documentosPersonales) ? paciente.documentosPersonales : [];
    const doc = docs[index];
    if (!doc) throw new Error("Documento inválido");

    const { value, isConfirmed } = await Swal.fire({
      title: "Editar documento",
      html: `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label>Fecha:</label>
          <input type="date" id="docFecha" class="swal2-input" value="${doc.fecha ? nfISO(doc.fecha) : ''}">
          <label>Tipo:</label>
          <input type="text" id="docTipo" class="swal2-input" value="${esc(doc.tipo || '')}">
          <label>Observaciones:</label>
          <textarea id="docObs" class="swal2-textarea">${esc(doc.observaciones || '')}</textarea>
          <label>Reemplazar archivo (opcional):</label>
          <input type="file" id="docArchivo" class="swal2-file" accept=".pdf,image/*,.doc,.docx,.txt">
          ${doc.archivoURL ? `<small>Actual: <a href="${doc.archivoURL}" target="_blank">ver</a></small>` : ""}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar cambios",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fecha = document.getElementById("docFecha").value;
        const tipo  = document.getElementById("docTipo").value.trim();
        const observaciones = document.getElementById("docObs").value.trim();
        const file = document.getElementById("docArchivo").files[0] || null;
        if (!fecha || !tipo) {
          Swal.showValidationMessage("Fecha y tipo son obligatorios");
          return false;
        }
        return { fecha, tipo, observaciones, file };
      }
    });

    if (!isConfirmed) return;

    let newKey = doc.archivoKey;
    let newURL = doc.archivoURL;

    if (value.file) {
      const safe = slugFileName(value.file.name);
      const ts = Date.now();
      newKey = `${dni}/documentos/${ts}-${safe}`;
      await r2Put({ bucket: R2_BUCKET_PACIENTES, key: newKey, file: value.file });
      newURL = `${R2_BASE}/${R2_BUCKET_PACIENTES}/${encodeURIComponent(newKey)}`;
    }

    const docId = doc._id || doc.id;
    const url = docId
      ? `/pacientes/${dni}/documentos/${docId}`
      : `/pacientes/${dni}/documentos?index=${index}`;

    const res = await apiFetch(url, {
      method: 'PUT',
      body: JSON.stringify({
        fecha: value.fecha,
        tipo: value.tipo,
        observaciones: value.observaciones,
        archivoKey: newKey,
        archivoURL: newURL
      })
    });
    if (!res.ok) {
      if (value.file) { try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key: newKey }); } catch { }
      }
      let msg = "No se pudo actualizar el documento";
      try { const j = await res.json(); msg = j?.error || msg; } catch { }
      throw new Error(msg);
    }

    if (value.file && doc.archivoKey && doc.archivoKey !== newKey) {
      try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key: doc.archivoKey }); } catch { }
    }

    Swal.fire("✅ Documento actualizado", "", "success").then(() => verDocumentos(dni));
  } catch (e) {
    console.error(e);
    Swal.fire("❌ Error", e.message || "No se pudo editar el documento", "error");
  }
}

async function eliminarDocumento(dni, id, index) {
  try {
    const conf = await Swal.fire({
      title: "Eliminar documento",
      text: "¿Seguro que querés eliminar este archivo?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });
    if (!conf.isConfirmed) return;

    // 1) Backend: elimina metadata por id o por index
    const url = id
      ? `/pacientes/${dni}/documentos/${id}`
      : `/pacientes/${dni}/documentos?index=${index}`;

    const res = await apiFetch(url, { method: 'DELETE' });
    if (!res.ok) {
      let msg = "No se pudo eliminar el documento";
      try { const j = await res.json(); msg = j?.error || msg; } catch { }
      throw new Error(msg);
    }

    // 2) Si querés, podés volver a cargar para obtener la key y borrar en R2;
    //    si tu backend ya devuelve la lista, podés evitar otro GET.
    try {
      const paciente = await apiFetchJson(`/pacientes/${dni}`);
      const doc = (paciente.documentosPersonales || [])[index];
      if (doc && doc.archivoKey) {
        try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key: doc.archivoKey }); } catch {}
      }
    } catch {}

    Swal.fire("✅ Documento eliminado", "", "success").then(() => verDocumentos(dni));
  } catch (e) {
    console.error(e);
    Swal.fire("❌ Error", e.message || "No se pudo eliminar el documento", "error");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICOS (informes)
// ─────────────────────────────────────────────────────────────────────────────
async function verDiagnosticos(dni) {
  try {
    const paciente      = await apiFetchJson(`/pacientes/${dni}`);
    const diagnosticos  = Array.isArray(paciente.diagnosticos) ? paciente.diagnosticos : [];

    const htmlTabla = diagnosticos.length
      ? diagnosticos.map((d) => {
          const fecha = d.fecha ? nfISO(d.fecha) : '-';
          const area  = esc(d.area || '');
          const obs   = esc(d.observaciones ?? '-');

          const href =
            d.archivoURL || d.archivoUrl || d.url || d.fileUrl || d.publicUrl ||
            (d.archivoKey || d.key || d.r2Key
              ? `${R2_BASE}/${R2_BUCKET_PACIENTES}/${encodeURIComponent(d.archivoKey || d.key || d.r2Key)}`
              : "");

          return `
            <tr>
              <td>${fecha}</td>
              <td>${area}</td>
              <td>${obs}</td>
              <td>
                ${href
                  ? `<a href="${href}" target="_blank" rel="noopener" title="Ver archivo">
                       <i class="fa-solid fa-file-pdf"></i> Ver
                     </a>`
                  : "-"}
              </td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="text-align:center;">No hay diagnósticos cargados.</td></tr>`;

    await Swal.fire({
      title: `<h3 style="font-family:Montserrat;">Historial de informes:<br>DNI ${dni}</h3>`,
      html: `
        <button onclick="agregarDiagnostico('${dni}')" class="swal2-confirm" style="margin-bottom:10px;">➕ Agregar diagnóstico</button>
        <table style="width:100%; font-size:14px; text-align:left;">
          <thead>
            <tr><th>Fecha</th><th>Área</th><th>Observaciones</th><th>Adjunto</th></tr>
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

async function agregarDiagnostico(dni) {
  const { isConfirmed } = await Swal.fire({
    title: "Agregar diagnóstico",
    html: `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <label>Fecha:</label>
        <input type="date" id="dxFecha" class="swal2-input">
        <label>Área:</label>
        <input type="text" id="dxArea" class="swal2-input" placeholder="Ej: Fonoaudiología">
        <label>Observaciones:</label>
        <textarea id="dxObs" class="swal2-textarea" placeholder="Opcional"></textarea>
        <label>Archivo adjunto (PDF/imagen/doc):</label>
        <input type="file" id="dxArchivo" class="swal2-file" accept=".pdf,image/*,.doc,.docx,.txt">
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    preConfirm: async () => {
      const fecha = document.getElementById("dxFecha").value;
      const area  = document.getElementById("dxArea").value.trim();
      const observaciones = document.getElementById("dxObs").value.trim();
      const archivo = document.getElementById("dxArchivo").files[0];

      if (!fecha || !area || !archivo) {
        Swal.showValidationMessage("Fecha, área y archivo son obligatorios");
        return false;
      }

      const safeName = slugFileName(archivo.name);
      const ts = Date.now();
      const key = `${dni}/diagnosticos/${ts}-${safeName}`;
      await r2Put({ bucket: R2_BUCKET_PACIENTES, key, file: archivo });

      const res = await apiFetch(`/pacientes/${dni}/diagnosticos`, {
        method: 'POST',
        body: JSON.stringify({
          fecha,
          area,
          observaciones,
          archivoKey: key,
          archivoURL: `${R2_BASE}/${R2_BUCKET_PACIENTES}/${encodeURIComponent(key)}`
        })
      });
      if (!res.ok) {
        try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key }); } catch { }
        let msg = "No se pudo guardar el diagnóstico";
        try { const j = await res.json(); msg = j?.error || msg; } catch { }
        throw new Error(msg);
      }
      return true;
    }
  });

  if (!isConfirmed) return;
  Swal.fire("✅ Diagnóstico agregado", "", "success").then(() => verDiagnosticos(dni));
}

async function editarDiagnostico(dni, index) {
  try {
    const paciente = await apiFetchJson(`/pacientes/${dni}`);
    const arr = Array.isArray(paciente.diagnosticos) ? paciente.diagnosticos : [];
    const dx = arr[index];
    if (!dx) throw new Error("Diagnóstico inválido");

    const { value, isConfirmed } = await Swal.fire({
      title: "Editar diagnóstico",
      html: `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <label>Fecha:</label>
          <input type="date" id="dxFecha" class="swal2-input" value="${dx.fecha ? nfISO(dx.fecha) : ''}">
          <label>Área:</label>
          <input type="text" id="dxArea" class="swal2-input" value="${esc(dx.area || '')}">
          <label>Observaciones:</label>
          <textarea id="dxObs" class="swal2-textarea">${esc(dx.observaciones || '')}</textarea>
          <label>Reemplazar archivo (opcional):</label>
          <input type="file" id="dxArchivo" class="swal2-file" accept=".pdf,image/*,.doc,.docx,.txt">
          ${dx.archivoURL ? `<small>Actual: <a href="${dx.archivoURL}" target="_blank">ver</a></small>` : ""}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar cambios",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const fecha = document.getElementById("dxFecha").value;
        const area  = document.getElementById("dxArea").value.trim();
        const observaciones = document.getElementById("dxObs").value.trim();
        const file = document.getElementById("dxArchivo").files[0] || null;
        if (!fecha || !area) {
          Swal.showValidationMessage("Fecha y área son obligatorios");
          return false;
        }
        return { fecha, area, observaciones, file };
      }
    });

    if (!isConfirmed) return;

    let newKey = dx.archivoKey;
    let newURL = dx.archivoURL;

    if (value.file) {
      const safe = slugFileName(value.file.name);
      const ts = Date.now();
      newKey = `${dni}/diagnosticos/${ts}-${safe}`;
      await r2Put({ bucket: R2_BUCKET_PACIENTES, key: newKey, file: value.file });
      newURL = `${R2_BASE}/${R2_BUCKET_PACIENTES}/${encodeURIComponent(newKey)}`;
    }

    const dxId = dx._id || dx.id;
    const url = dxId
      ? `/pacientes/${dni}/diagnosticos/${dxId}`
      : `/pacientes/${dni}/diagnosticos?index=${index}`;

    const res = await apiFetch(url, {
      method: 'PUT',
      body: JSON.stringify({
        fecha: value.fecha,
        area: value.area,
        observaciones: value.observaciones,
        archivoKey: newKey,
        archivoURL: newURL
      })
    });
    if (!res.ok) {
      if (value.file) { try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key: newKey }); } catch { }
      }
      let msg = "No se pudo actualizar el diagnóstico";
      try { const j = await res.json(); msg = j?.error || msg; } catch { }
      throw new Error(msg);
    }

    if (value.file && dx.archivoKey && dx.archivoKey !== newKey) {
      try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key: dx.archivoKey }); } catch { }
    }

    Swal.fire("✅ Diagnóstico actualizado", "", "success").then(() => verDiagnosticos(dni));
  } catch (e) {
    console.error(e);
    Swal.fire("❌ Error", e.message || "No se pudo editar el diagnóstico", "error");
  }
}

async function eliminarDiagnostico(dni, id, index) {
  try {
    const conf = await Swal.fire({
      title: "Eliminar diagnóstico",
      text: "¿Seguro que querés eliminar este archivo?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });
    if (!conf.isConfirmed) return;

    const url = id
      ? `/pacientes/${dni}/diagnosticos/${id}`
      : `/pacientes/${dni}/diagnosticos?index=${index}`;

    const res = await apiFetch(url, { method: 'DELETE' });
    if (!res.ok) {
      let msg = "No se pudo eliminar el diagnóstico";
      try { const j = await res.json(); msg = j?.error || msg; } catch { }
      throw new Error(msg);
    }

    // Borrado del objeto en R2 (best effort): necesitamos la key; hacemos un GET rápido
    try {
      const paciente = await apiFetchJson(`/pacientes/${dni}`);
      const dx = (paciente.diagnosticos || [])[index];
      if (dx && dx.archivoKey) {
        try { await r2Delete({ bucket: R2_BUCKET_PACIENTES, key: dx.archivoKey }); } catch {}
      }
    } catch {}

    Swal.fire("✅ Diagnóstico eliminado", "", "success").then(() => verDiagnosticos(dni));
  } catch (e) {
    console.error(e);
    Swal.fire("❌ Error", e.message || "No se pudo eliminar el diagnóstico", "error");
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


// ─────────────────────────────────────────────────────────────────────────────
// LISTADO INICIAL (primeros 20 pacientes)
// ─────────────────────────────────────────────────────────────────────────────
function ensureListadoContainer() {
  let el = document.getElementById('listadoPacientes');
  if (el) return el;

  // Lo ubicamos justo antes del contenedor de ficha si existe (queda bajo la línea azul)
  const ficha = document.getElementById('fichaPacienteContainer');
  el = document.createElement('div');
  el.id = 'listadoPacientes';
  el.style.margin = '12px 8px';
  el.style.padding = '10px';
  el.style.background = '#fff';
  el.style.border = '1px solid #e0e0e0';
  el.style.borderRadius = '6px';
  el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';

  if (ficha && ficha.parentNode) {
    ficha.parentNode.insertBefore(el, ficha);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

function renderListadoPacientes(items) {
  const cont = ensureListadoContainer();
  if (!Array.isArray(items) || items.length === 0) {
    cont.innerHTML = `<div style="color:#666;">No hay pacientes para mostrar.</div>`;
    return;
  }

  // Tabla simple
  const filas = items.map(p => `
    <tr data-dni="${p.dni ?? ''}" style="cursor:pointer;">
      <td style="padding:6px 8px;">${p.nombre ?? '(Sin nombre)'}</td>
      <td style="padding:6px 8px;">${p.dni ?? '-'}</td>
      <td style="padding:6px 8px;">${p.estado ?? '-'}</td>
      <td style="padding:6px 8px;">${p.condicionDePago ?? '-'}</td>
      <td style="padding:6px 8px; text-align:right;">
        <button class="btn-ver" data-dni="${p.dni ?? ''}" style="padding:4px 8px;">Ver</button>
      </td>
    </tr>
  `).join('');

  cont.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <strong>Pacientes (primeros 20)</strong>
      <small style="color:#777;">Click en una fila para ver la ficha</small>
    </div>
    <div style="overflow:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <thead>
          <tr style="background:#f5f7f8;">
            <th style="text-align:left; padding:6px 8px;">Nombre</th>
            <th style="text-align:left; padding:6px 8px;">DNI</th>
            <th style="text-align:left; padding:6px 8px;">Estado</th>
            <th style="text-align:left; padding:6px 8px;">Condición</th>
            <th style="text-align:right; padding:6px 8px;">Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;

  // Click fila / botón
  cont.querySelectorAll('tr[data-dni], .btn-ver').forEach(el => {
    el.addEventListener('click', async (e) => {
      const dni = el.getAttribute('data-dni') || e.target.getAttribute('data-dni');
      if (!dni) return;
      try {
        const p = await apiFetchJson(`/pacientes/${dni}`);
        // Oculto el listado al abrir una ficha
        const l = document.getElementById('listadoPacientes');
        if (l) l.style.display = 'none';
        renderFichaPaciente(p);
      } catch (err) {
        console.error(err);
      }
    });
  });
}

async function cargarListadoInicial() {
  try {
    // filtro neutro: nombre='.' y limit=20
    const url = `/pacientes?nombre=${encodeURIComponent('.')} &limit=20`;
    let data = await apiFetchJson(url);

    // normalizo por si el backend devuelve {items:[]}
    const items = Array.isArray(data) ? data.slice(0, 20)
      : Array.isArray(data?.items) ? data.items.slice(0, 20)
        : [];

    renderListadoPacientes(items);
  } catch (e) {
    console.error('No se pudo cargar el listado inicial', e);
    renderListadoPacientes([]);
  }
}


// Cargar al entrar a pacientes.html
document.addEventListener('DOMContentLoaded', cargarListadoInicial);

// Si querés que al hacer una búsqueda se oculte el listado:
const __inputBusq = document.getElementById('busquedaInput');
if (__inputBusq) {
  __inputBusq.addEventListener('input', () => {
    const l = document.getElementById('listadoPacientes');
    if (l) l.style.display = 'none';
  });
}
