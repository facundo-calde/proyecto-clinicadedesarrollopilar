// ==========================
// 🔐 Sesión, anti-back y helpers
// ==========================
const LOGIN = 'index.html';

const goLogin = () => location.replace(LOGIN);

// Usuario y token
let usuarioSesion = null;
try { usuarioSesion = JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { usuarioSesion = null; }
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

async function fetchAuth(url, options = {}) {
  if (typeof url === 'string') {
    url = url.startsWith('/api/')
      ? url
      : (url.startsWith('/') ? `/api${url}` : `/api/${url}`);
  }

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


/// ==========================
// 📋 Listado inicial
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  const botonAgregar = document.getElementById('btnAgregarUsuario');
  const userList = document.getElementById('user-list');

  // Mostrar usuarios existentes (agrupados por área)
  apiFetch(`/usuarios`)
    .then(res => res.json())
    .then(data => {
      const sinInfo = document.querySelector('.sin-info');
      if (!Array.isArray(data) || data.length === 0) {
        if (sinInfo) sinInfo.style.display = 'block';
        return;
      }
      if (sinInfo) sinInfo.style.display = 'none';

      // limpiar tabla antes de renderizar
      userList.innerHTML = "";

      // helpers
      const escapeHTML = (s) => String(s ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");

      const ROLE_ORDER = {
        "Coordinador y profesional": 0,
        "Coordinador de área": 1,
        "Profesional": 2,
        "Pasante": 3,
        "Administrativo": 4,
        "Recepcionista": 5,
        "Área": 6,
        "Directoras": 7,
        "Administrador": 8
      };
      const getRoleRank = (rol) => (rol in ROLE_ORDER ? ROLE_ORDER[rol] : 999);

      const extractAreas = (u) => {
        const set = new Set();

        if (Array.isArray(u.areas)) {
          u.areas.forEach(a => { if (a) set.add(String(a)); });
        }
        if (Array.isArray(u.areasProfesional)) {
          u.areasProfesional.forEach(ap => {
            const nm = ap?.areaNombre || ap?.area || ap?.nombre;
            if (nm) set.add(String(nm));
          });
        }
        if (Array.isArray(u.areasCoordinadas)) {
          u.areasCoordinadas.forEach(ac => {
            const nm = ac?.areaNombre || ac?.area || ac?.nombre;
            if (nm) set.add(String(nm));
          });
        }
        if (u.pasanteArea) {
          if (typeof u.pasanteArea === "string") {
            set.add(u.pasanteArea);
          } else {
            const nm = u.pasanteArea?.areaNombre || u.pasanteArea?.area || u.pasanteArea?.nombre;
            if (nm) set.add(String(nm));
          }
        }
        if (set.size === 0) set.add("Sin área");
        return Array.from(set);
      };

      // agrupar
      const groups = new Map();
      data.forEach(u => {
        const areas = extractAreas(u);
        areas.forEach(area => {
          const key = area.trim() || "Sin área";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(u);
        });
      });

      const areaNames = Array.from(groups.keys()).sort((a, b) => {
        if (a === "Sin área" && b !== "Sin área") return 1;
        if (b === "Sin área" && a !== "Sin área") return -1;
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
      });

      // render
      areaNames.forEach(area => {
        const usuarios = groups.get(area) || [];
        usuarios.sort((u1, u2) => {
          const r = getRoleRank(u1.rol) - getRoleRank(u2.rol);
          if (r !== 0) return r;
          const n1 = (u1.nombreApellido || "").toLowerCase();
          const n2 = (u2.nombreApellido || "").toLowerCase();
          return n1.localeCompare(n2, 'es', { sensitivity: 'base' });
        });

        // fila separadora
        const sep = document.createElement('tr');
        sep.className = 'area-sep';
        sep.innerHTML = `
  <td colspan="6" style="background:#f0f4f8; font-weight:700; padding:8px 10px; border-top:2px solid #d9e2ec;">
    ${escapeHTML(area)}
  </td>`;

        userList.appendChild(sep);

        usuarios.forEach(usuario => {
          const areasCol = extractAreas(usuario).join(', ');
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${escapeHTML(usuario.nombreApellido || '')}</td>
            <td>${escapeHTML(areasCol)}</td>
            <td>${escapeHTML(usuario.mail || '')}</td>
            <td>${escapeHTML(usuario.whatsapp || '')}</td>
            <td>${usuario.activo ? 'Activo' : 'Inactivo'}</td>
            <td>
              <button onclick="editarUsuario('${usuario._id}')">Editar</button>
              <button onclick="borrarUsuario('${usuario._id}')">Borrar</button>
            </td>
          `;
          userList.appendChild(tr);
        });
      });
    })
    .catch(err => console.error(err));

  if (botonAgregar) {
    botonAgregar.addEventListener('click', () => mostrarFormularioUsuario());
  }
});


// ==========================
// 🧾 Formulario (SweetAlert)
// ==========================
// Crea el HTML de checkboxes de áreas con las seleccionadas marcadas
function buildAreasCheckboxes(areas = [], seleccionadas = new Set()) {
  return areas
    .map((a) => {
      const label = (typeof a === "string")
        ? a
        : (a.nombre || a.name || a.titulo || a.descripcion || a.area || "");
      const safe = String(label).replace(/"/g, "&quot;");
      const checked = seleccionadas.has(label) ? "checked" : "";
      return `<label><input type="checkbox" class="area-check" name="areas[]" value="${safe}" ${checked}> ${safe}</label><br>`;
    })
    .join("");
}

async function mostrarFormularioUsuario(u = {}, modoEdicion = false) {
  // 1) Traer áreas
  let AREAS = [];
  try {
    const res = await apiFetch("/areas", { method: "GET" });
    if (!res.ok) throw new Error("No se pudo obtener áreas");
    const data = await res.json();
    AREAS = (Array.isArray(data) ? data : [])
      .map(a => (typeof a === "string") ? a : (a.nombre || a.name || a.titulo || a.descripcion || a.area || ""))
      .filter(Boolean);
  } catch (e) {
    console.error(e);
    AREAS = [];
  }

  const AREA_OPTS = AREAS.length
    ? AREAS.map(n => `<option value="${n}">${n}</option>`).join("")
    : `<option value="">(No hay áreas)</option>`;

  const buildProRow = (areaNombre = "", nivel = "") => `
    <div class="pro-row">
      <select class="swal2-select pro-area">
        <option value="">-- Área --</option>
        ${AREA_OPTS}
      </select>
      <select class="swal2-select pro-nivel">
        <option value="">Nivel...</option>
        <option value="Junior">Junior</option>
        <option value="Senior">Senior</option>
      </select>
      <button type="button" class="icon-btn btn-del-pro" title="Quitar">✕</button>
    </div>`;

  const buildCoordRow = (areaNombre = "") => `
    <div class="coord-row">
      <select class="swal2-select coord-area">
        <option value="">-- Área --</option>
        ${AREA_OPTS}
      </select>
      <button type="button" class="icon-btn btn-del-coord" title="Quitar">✕</button>
    </div>`;

  Swal.fire({
    title: modoEdicion ? "Editar usuario" : "Registrar nuevo usuario",
    width: "90%",
    html: `
      <style>
        .swal2-popup * { box-sizing: border-box; }
        .swal2-popup.swal2-modal{
          padding:18px 22px;font-family:'Montserrat','Segoe UI',sans-serif;
          background:#fff;border:1px solid #ccc;border-radius:10px;
          box-shadow:0 3px 12px rgba(0,0,0,.2);max-width:1600px;
        }
        .swal-body{ max-height:72vh; overflow-y:auto; overflow-x:auto; }
        .form-container{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; }
        .form-column{ display:flex; flex-direction:column; }
        .form-column label{ font-weight:600;font-size:14px;margin-top:8px;color:#333; text-align:left; }
        .swal2-input,.swal2-select{ width:100%; padding:10px; margin-top:6px; margin-bottom:10px;
          border:1px solid #ccc;border-radius:8px;background:#f9f9f9;font-size:14px; }
        .mini-btn{ padding:6px 10px;border:1px solid #ccc;border-radius:8px;background:#eee;cursor:pointer;font-size:12px; }
        .icon-btn{ width:36px;height:36px;display:flex;align-items:center;justify-content:center;
          border-radius:8px;border:1px solid #d32f2f;background:#e53935;color:#fff;cursor:pointer;padding:0; }
        .block{ border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fafafa;margin-top:6px;width:100%; }
        .pro-row{ display:grid; grid-template-columns:1fr 150px 36px; gap:8px; align-items:center; margin:6px 0; }
        .coord-row{ display:grid; grid-template-columns:1fr 36px; gap:8px; align-items:center; margin:6px 0; }
        input[type="file"].swal2-input{ width:100%; display:block; }
        .two-col { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .swal2-confirm{ background:#2f72c4 !important;color:#fff !important;font-weight:700;padding:8px 20px;border-radius:8px; }
        .swal2-cancel { background:#e53935 !important;color:#fff !important;font-weight:700;padding:8px 20px; }
        .prefix-wrapper{ position:relative; }
        .prefix-wrapper > .peso-prefix{
          position:absolute; left:10px; top:50%; transform:translateY(-50%);
          color:#333; font-weight:600;
        }
        .prefix-wrapper > input{ padding-left:28px; }

        /* ✅ Fix visual para Pasante */
        #pasanteSection{ display:none; grid-column:1 / -1; max-width:100%; }
        #pasanteSection .row{ display:grid; grid-template-columns:1fr; gap:10px; }
        @media (min-width:1024px){
          #pasanteSection .row{ grid-template-columns:1fr 1fr; }
        }
      </style>

      <div class="swal-body">
        <div class="form-container">
          <!-- Col 1 -->
          <div class="form-column">
            <input class="swal2-input" id="nombreApellido" placeholder="Nombre y Apellido" autocomplete="off">
            <input class="swal2-input" id="fechaNacimiento" type="date" placeholder="Fecha de Nacimiento" autocomplete="off">
            <input class="swal2-input" id="domicilio" placeholder="Domicilio" autocomplete="off">
            <input class="swal2-input" id="dni" placeholder="DNI" autocomplete="off">
            <input class="swal2-input" id="cuit" placeholder="CUIT" autocomplete="off">
            <input class="swal2-input" id="matricula" placeholder="Matrícula" autocomplete="off">

            <label><strong>Jurisdicción:</strong></label>
            <select id="jurisdiccion" class="swal2-select">
              <option value="">Seleccionar...</option>
              <option value="Provincial">Provincial</option>
              <option value="Nacional">Nacional</option>
            </select>

            <input class="swal2-input" id="registroNacionalDePrestadores" placeholder="Registro Nacional de Prestadores" autocomplete="off">
            <input class="swal2-input" id="whatsapp" placeholder="Whatsapp" autocomplete="off">
            <input class="swal2-input" id="mail" placeholder="Mail" autocomplete="off">

            <div class="two-col">
              <div>
                <div class="prefix-wrapper">
                  <input class="swal2-input" id="salarioAcuerdo" placeholder="Salario acordado" autocomplete="off" inputmode="numeric">
                </div>
                <input class="swal2-input" id="salarioAcuerdoObs" placeholder="Obs. salario (opcional)" autocomplete="off">
              </div>
              <div>
                <div class="prefix-wrapper">
                  <input class="swal2-input" id="fijoAcuerdo" placeholder="Fijo acordado" autocomplete="off" inputmode="numeric">
                </div>
                <input class="swal2-input" id="fijoAcuerdoObs" placeholder="Obs. fijo (opcional)" autocomplete="off">
              </div>
            </div>

            <input class="swal2-input" id="banco" placeholder="Banco" autocomplete="off">
            <input class="swal2-input" id="cbu" placeholder="CBU" autocomplete="off">
            <input class="swal2-input" id="numeroCuenta" placeholder="Número de cuenta" autocomplete="off">
            <input class="swal2-input" id="numeroSucursal" placeholder="Número de sucursal" autocomplete="off">
            <input class="swal2-input" id="alias" placeholder="Alias" autocomplete="off">
            <input class="swal2-input" id="nombreFiguraExtracto" placeholder="Nombre como figura en extracto" autocomplete="off">
            <input class="swal2-input" id="tipoCuenta" placeholder="Tipo de cuenta" autocomplete="off">
          </div>

          <!-- Col 2 -->
          <div class="form-column">
            <label><strong>Rol asignado:</strong></label>
            <select id="rol" class="swal2-select">
              <option value="">Seleccionar...</option>
              <option value="Administrador">Administrador</option>
              <option value="Directoras">Directoras</option>
              <option value="Coordinador y profesional">Coordinador y profesional</option>
              <option value="Coordinador de área">Coordinador de área</option>
              <option value="Profesional">Profesional</option>
              <option value="Pasante">Pasante</option>
              <option value="Administrativo">Administrativo</option>
              <option value="Recepcionista">Recepcionista</option>
              <option value="Área">Área</option>
            </select>

            <!-- Sección Pasante con fix visual -->
            <div id="pasanteSection" class="block" style="display:none;">
              <div class="row">
                <div>
                  <label><strong>Nivel de pasante:</strong></label>
                  <select id="pasanteNivel" class="swal2-select">
                    <option value="">Seleccionar...</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                  </select>
                </div>
                <div>
                  <label><strong>Área de pasante:</strong></label>
                  <select id="pasanteArea" class="swal2-select">
                    <option value="">-- Área --</option>
                    ${AREA_OPTS}
                  </select>
                </div>
              </div>
            </div>

            <div id="proSection" class="block" style="display:none;">
              <label><strong>Áreas como profesional (con nivel):</strong></label>
              <div id="proList"></div>
              <button type="button" id="btnAddPro" class="mini-btn">+ Agregar área profesional</button>
            </div>

            <div id="coordSection" class="block" style="display:none;">
              <label><strong>Áreas como coordinador:</strong></label>
              <div id="coordList"></div>
              <button type="button" id="btnAddCoord" class="mini-btn">+ Agregar área a coordinar</button>
            </div>

            <label id="labelSeguro" style="display:none;margin-top:10px;"><strong>Seguro de mala praxis:</strong></label>
            <input class="swal2-input" id="seguroMalaPraxis" placeholder="Número de póliza o compañía" style="display:none" autocomplete="off">
          </div>

          <!-- Col 3 -->
          <div class="form-column">
            <label><strong>Usuario y Contraseña:</strong></label>
            <input class="swal2-input" id="usuario" placeholder="Usuario (email)"
                   autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">

            <div style="position:relative; display:flex; align-items:center;">
              <input class="swal2-input" id="contrasena" type="password" placeholder="Contraseña"
                     style="flex:1; padding-right:44px;" autocomplete="new-password">
              <button type="button" id="togglePass"
                      style="position:absolute; right:10px; height:32px; width:32px; border:none; background:transparent; cursor:pointer;">
                <i id="togglePassIcon" class="fa-solid fa-eye"></i>
              </button>
            </div>

            <label><strong>Documentos:</strong></label>
            <input type="file" id="documentos" name="documentos" class="swal2-input" multiple accept=".pdf,image/*,.doc,.docx,.txt">

            <div id="docsExistentes" class="block" style="display:none; margin-top:8px;">
              <label><strong>Documentos existentes:</strong></label>
              <ul id="docsList" style="margin:6px 0; padding-left:18px;"></ul>
            </div>
          </div>
        </div>
      </div>
    `,
    confirmButtonText: modoEdicion ? "Actualizar" : "Guardar",
    showCancelButton: true,
    cancelButtonText: "Cancelar",
    didOpen: () => {
      // Helpers moneda
      const nfARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });
      const cleanNumber = (s) => (s ? String(s).replace(/\D+/g, "") : "");
      const formatInputARS = (input) => {
        if (!input) return;
        const apply = () => {
          const raw = cleanNumber(input.value);
          input.value = raw ? nfARS.format(Number(raw)) : "";
        };
        input.addEventListener("input", apply);
        input.addEventListener("blur", apply);
        apply();
      };

      const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val ?? ""); };

      if (modoEdicion) {
        set("nombreApellido", u.nombreApellido);
        set("fechaNacimiento", u.fechaNacimiento ? String(u.fechaNacimiento).split("T")[0] : "");
        set("domicilio", u.domicilio);
        set("dni", u.dni);
        set("cuit", u.cuit);
        set("matricula", u.matricula);
        if (u.jurisdiccion) document.getElementById("jurisdiccion").value = u.jurisdiccion;
        set("registroNacionalDePrestadores", u.registroNacionalDePrestadores);
        set("whatsapp", u.whatsapp);
        set("mail", u.mail);

        const salEl = document.getElementById("salarioAcuerdo");
        const fijoEl = document.getElementById("fijoAcuerdo");
        if (salEl) salEl.value = u.salarioAcuerdo ? nfARS.format(Number(cleanNumber(u.salarioAcuerdo))) : "";
        if (fijoEl) fijoEl.value = u.fijoAcuerdo ? nfARS.format(Number(cleanNumber(u.fijoAcuerdo))) : "";

        set("salarioAcuerdoObs", u.salarioAcuerdoObs);
        set("fijoAcuerdo", "");
        set("fijoAcuerdoObs", u.fijoAcuerdoObs);
        set("banco", u.banco);
        set("cbu", u.cbu);
        set("numeroCuenta", u.numeroCuenta);
        set("numeroSucursal", u.numeroSucursal);
        set("alias", u.alias);
        set("nombreFiguraExtracto", u.nombreFiguraExtracto);
        set("tipoCuenta", u.tipoCuenta);
        set("usuario", u.usuario);
        if (u.rol) document.getElementById("rol").value = u.rol;

        if (u.pasanteNivel) document.getElementById("pasanteNivel").value = u.pasanteNivel;
        if (u.pasanteArea)  document.getElementById("pasanteArea").value  =
          (typeof u.pasanteArea === "string" ? u.pasanteArea : (u.pasanteArea?.areaNombre || ""));
        if (u.seguroMalaPraxis) document.getElementById("seguroMalaPraxis").value = u.seguroMalaPraxis;
      } else {
        const usuarioEl = document.getElementById("usuario");
        const passEl    = document.getElementById("contrasena");
        if (usuarioEl) usuarioEl.value = "";
        if (passEl)     passEl.value = "";
        setTimeout(() => {
          if (usuarioEl) usuarioEl.value = "";
          if (passEl)    passEl.value = "";
        }, 0);
      }

      formatInputARS(document.getElementById("salarioAcuerdo"));
      formatInputARS(document.getElementById("fijoAcuerdo"));

      const rolSelect      = document.getElementById("rol");
      const proSection     = document.getElementById("proSection");
      const coordSection   = document.getElementById("coordSection");
      const pasanteSection = document.getElementById("pasanteSection");
      const proList        = document.getElementById("proList");
      const coordList      = document.getElementById("coordList");
      const btnAddPro      = document.getElementById("btnAddPro");
      const btnAddCoord    = document.getElementById("btnAddCoord");
      const labelSeguro    = document.getElementById("labelSeguro");
      const inputSeguro    = document.getElementById("seguroMalaPraxis");

      function addProRow(areaNombre = "", nivel = "") {
        proList.insertAdjacentHTML("beforeend", buildProRow(areaNombre, nivel));
        const row = proList.lastElementChild;
        if (areaNombre) row.querySelector(".pro-area").value = areaNombre;
        if (nivel)      row.querySelector(".pro-nivel").value = nivel;
        row.querySelector(".btn-del-pro").addEventListener("click", () => row.remove());
      }
      function addCoordRow(areaNombre = "") {
        coordList.insertAdjacentHTML("beforeend", buildCoordRow(areaNombre));
        const row = coordList.lastElementChild;
        if (areaNombre) row.querySelector(".coord-area").value = areaNombre;
        row.querySelector(".btn-del-coord").addEventListener("click", () => row.remove());
      }
      btnAddPro?.addEventListener("click", () => addProRow());
      btnAddCoord?.addEventListener("click", () => addCoordRow());

      const ROLES_PROF  = new Set(["Profesional", "Coordinador y profesional"]);
      const ROLES_COORD = new Set(["Coordinador de área", "Coordinador y profesional"]);

      function syncVisibility() {
        const rol = rolSelect.value;

        proSection.style.display   = ROLES_PROF.has(rol)  ? "block" : "none";
        coordSection.style.display = ROLES_COORD.has(rol) ? "block" : "none";

        // Mostrar seguro para profesionales y coordinadores (no obligatorio)
        const showSeguro = ROLES_PROF.has(rol) || ROLES_COORD.has(rol);
        labelSeguro.style.display = showSeguro ? "block" : "none";
        inputSeguro.style.display = showSeguro ? "block" : "none";

        if (proSection.style.display !== "none" && !proList.querySelector(".pro-row")) addProRow();
        if (coordSection.style.display !== "none" && !coordList.querySelector(".coord-row")) addCoordRow();

        pasanteSection.style.display = (rol === "Pasante") ? "block" : "none";
      }
      syncVisibility();

      if (modoEdicion) {
        if (Array.isArray(u.areasProfesional) && u.areasProfesional.length) {
          proList.innerHTML = "";
          u.areasProfesional.forEach(ap => addProRow(ap.areaNombre || "", ap.nivel || ""));
        }
        if (Array.isArray(u.areasCoordinadas) && u.areasCoordinadas.length) {
          coordList.innerHTML = "";
          u.areasCoordinadas.forEach(ac => addCoordRow(ac.areaNombre || ""));
        }
      }

      rolSelect.addEventListener("change", syncVisibility);

      // Render docs + eliminar
      const docsBox  = document.getElementById("docsExistentes");
      const docsList = document.getElementById("docsList");
      function renderDocs(docs = []) {
        if (!Array.isArray(docs) || docs.length === 0) {
          docsBox.style.display = "none";
          docsList.innerHTML = "";
          return;
        }
        docsBox.style.display = "block";
        docsList.innerHTML = docs.map(d => {
          const href  = d.publicUrl || d.url || "#";
          const name  = d.nombre || (href.split("/").pop() || "archivo");
          const fecha = d.fechaSubida ? new Date(d.fechaSubida).toLocaleString() : "";
          const idDoc = d._id || d.id;
          return `<li style="margin:4px 0; display:flex; align-items:center; gap:8px;">
            <a href="${href}" target="_blank" rel="noopener" style="flex:1">${name}</a>
            ${fecha ? `<small style="color:#666;">${fecha}</small>` : ""}
            <button type="button" class="mini-btn btn-del-doc" data-docid="${idDoc}" ${!idDoc ? "disabled" : ""}>Eliminar</button>
          </li>`;
        }).join("");
      }
      if (modoEdicion) renderDocs(u.documentos || []);

      docsList?.addEventListener("click", async (ev) => {
        const btn = ev.target.closest(".btn-del-doc");
        if (!btn) return;
        const docId = btn.getAttribute("data-docid");
        if (!docId || !u?._id) {
          Swal.fire("Error", "Documento inválido.", "error");
          return;
        }
        const conf = await Swal.fire({
          title: "Eliminar documento",
          text: "¿Seguro que querés eliminar este archivo?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Sí, eliminar",
          cancelButtonText: "Cancelar"
        });
        if (!conf.isConfirmed) return;

        const res = await apiFetch(`/usuarios/${u._id}/documentos/${docId}`, { method: "DELETE" });
        if (!res.ok) {
          let msg = "No se pudo eliminar el documento";
          try { const j = await res.json(); msg = j?.error || msg; } catch {}
          Swal.fire("Error", msg, "error");
          return;
        }
        try {
          const updated = await res.json();
          const docs = Array.isArray(updated?.documentos)
            ? updated.documentos
            : (u.documentos || []).filter(d => (d._id || d.id) !== docId);
          u.documentos = docs;
          renderDocs(docs);
        } catch {
          btn.closest("li")?.remove();
          if (!docsList.querySelector("li")) docsBox.style.display = "none";
        }
        Swal.fire("Listo", "Documento eliminado", "success");
      });

      // Toggle password
      const passInput  = document.getElementById("contrasena");
      const toggleBtn  = document.getElementById("togglePass");
      const toggleIcon = document.getElementById("togglePassIcon");
      if (toggleBtn && passInput && toggleIcon) {
        toggleBtn.addEventListener("click", () => {
          const show = passInput.type === "password";
          passInput.type = show ? "text" : "password";
          toggleIcon.className = show ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
        });
      }
    },
    preConfirm: () => {
      const get = id => document.getElementById(id)?.value?.trim();
      const onlyDigits = s => (s || "").replace(/\D+/g, "");

      // helpers para preservar valores previos al editar
      const valOrPrev = (id, prev) => {
        const v = get(id);
        return (v !== undefined && v !== "") ? v : prev;
      };
      const numOrPrev = (id, prev) => {
        const raw = get(id);
        if (raw === undefined || raw === "") return prev;
        const n = onlyDigits(raw);
        return n === "" ? prev : n;
      };

      const rol = valOrPrev("rol", u.rol);

      const proSectionVisible   = document.getElementById("proSection")?.style.display !== "none";
      const coordSectionVisible = document.getElementById("coordSection")?.style.display !== "none";
      const pasanteVisible      = document.getElementById("pasanteSection")?.style.display !== "none";

      const areasProfesional = proSectionVisible
        ? Array.from(document.querySelectorAll("#proList .pro-row"))
            .map(row => {
              const areaNombre = row.querySelector(".pro-area")?.value?.trim() || "";
              const nivel      = row.querySelector(".pro-nivel")?.value?.trim() || "";
              if (!areaNombre || !nivel) return null;
              return { areaNombre, nivel };
            })
            .filter(Boolean)
        : (Array.isArray(u.areasProfesional) ? u.areasProfesional : []);

      const areasCoordinadas = coordSectionVisible
        ? Array.from(document.querySelectorAll("#coordList .coord-row"))
            .map(row => {
              const areaNombre = row.querySelector(".coord-area")?.value?.trim() || "";
              if (!areaNombre) return null;
              return { areaNombre };
            })
            .filter(Boolean)
        : (Array.isArray(u.areasCoordinadas) ? u.areasCoordinadas : []);

      const ROLES_PROF  = new Set(["Profesional", "Coordinador y profesional"]);
      const ROLES_COORD = new Set(["Coordinador de área", "Coordinador y profesional"]);

      if (proSectionVisible && ROLES_PROF.has(rol) && areasProfesional.length === 0) {
        Swal.showValidationMessage("Agregá al menos un área con nivel para el rol profesional.");
        return false;
      }
      if (coordSectionVisible && ROLES_COORD.has(rol) && areasCoordinadas.length === 0) {
        Swal.showValidationMessage("Agregá al menos un área para coordinación.");
        return false;
      }

      // Pasante: si la sección está visible, tomar lo nuevo; si no, conservar lo previo
      const pasanteNivel = pasanteVisible ? valOrPrev("pasanteNivel", u.pasanteNivel) : u.pasanteNivel;
      const pasanteArea  = pasanteVisible
        ? (() => {
            const v = get("pasanteArea");
            if (!v && u.pasanteArea) return u.pasanteArea;
            return v ? { areaNombre: v } : undefined;
          })()
        : (u.pasanteArea ?? undefined);

      const payload = {
        nombreApellido:      valOrPrev("nombreApellido", u.nombreApellido),
        fechaNacimiento:     valOrPrev("fechaNacimiento",  u.fechaNacimiento),
        domicilio:           valOrPrev("domicilio",        u.domicilio),
        dni:                 valOrPrev("dni",              u.dni),
        cuit:                valOrPrev("cuit",             u.cuit),
        matricula:           valOrPrev("matricula",        u.matricula),
        jurisdiccion:        valOrPrev("jurisdiccion",     u.jurisdiccion),
        registroNacionalDePrestadores: valOrPrev("registroNacionalDePrestadores", u.registroNacionalDePrestadores),
        whatsapp:            valOrPrev("whatsapp",         u.whatsapp),
        mail:                valOrPrev("mail",             u.mail),
        salarioAcuerdo:      numOrPrev("salarioAcuerdo",   u.salarioAcuerdo),
        salarioAcuerdoObs:   valOrPrev("salarioAcuerdoObs",u.salarioAcuerdoObs),
        fijoAcuerdo:         numOrPrev("fijoAcuerdo",      u.fijoAcuerdo),
        fijoAcuerdoObs:      valOrPrev("fijoAcuerdoObs",   u.fijoAcuerdoObs),
        banco:               valOrPrev("banco",            u.banco),
        cbu:                 valOrPrev("cbu",              u.cbu),
        numeroCuenta:        valOrPrev("numeroCuenta",     u.numeroCuenta),
        numeroSucursal:      valOrPrev("numeroSucursal",   u.numeroSucursal),
        alias:               valOrPrev("alias",            u.alias),
        nombreFiguraExtracto:valOrPrev("nombreFiguraExtracto", u.nombreFiguraExtracto),
        tipoCuenta:          valOrPrev("tipoCuenta",       u.tipoCuenta),
        rol,
        pasanteNivel,
        pasanteArea, // puede quedar undefined
        usuario:             valOrPrev("usuario",          u.usuario),
        contrasena:          get("contrasena") || undefined, // si está vacío, no cambia
        seguroMalaPraxis:    valOrPrev("seguroMalaPraxis", u.seguroMalaPraxis),
        areasProfesional,
        areasCoordinadas
      };

      // borrar undefined para no pisar en backend
      Object.keys(payload).forEach(k => {
        if (payload[k] === undefined) delete payload[k];
      });

      // Validación extra: si rol es Pasante y la sección está visible,
      // exigimos un área (si no había antes y no se selecciona ahora).
      if (rol === "Pasante" && pasanteVisible) {
        const hadBefore = !!u.pasanteArea;
        const nowVal = document.getElementById("pasanteArea")?.value?.trim();
        if (!hadBefore && !nowVal) {
          Swal.showValidationMessage("Seleccioná el área a la que pertenece el pasante.");
          return false;
        }
      }

      return payload;
    }
  }).then(async result => {
    if (!result.isConfirmed) return;

    const path = modoEdicion ? `/usuarios/${u._id}` : `/usuarios`;
    const method = modoEdicion ? "PUT" : "POST";

    const archivosInput = document.getElementById("documentos");
    const archivos = archivosInput && archivosInput.files ? Array.from(archivosInput.files) : [];
    let res;

    if (!archivos.length) {
      res = await apiFetch(path, { method, body: JSON.stringify(result.value) });
    } else {
      const fd = new FormData();
      for (const [key, val] of Object.entries(result.value)) {
        if (val == null) continue;
        if (key === "areasProfesional" || key === "areasCoordinadas" || key === "pasanteArea") {
          fd.append(key, JSON.stringify(val));
        } else {
          fd.append(key, val);
        }
      }
      for (const file of archivos) {
        fd.append("documentos", file, file.name);
      }
      res = await apiFetch(path, { method, body: fd });
    }

    if (!res.ok) {
      let msg = "Error al guardar";
      try { const j = await res.json(); msg = j?.error || msg; } catch {}
      throw new Error(msg);
    }

    await res.json();
    Swal.fire("Éxito", modoEdicion ? "Usuario actualizado correctamente" : "Usuario creado correctamente", "success")
      .then(() => location.reload());
  }).catch(err => {
    console.error(err);
    Swal.fire("Error", "No se pudo guardar el usuario", "error");
  });
}










// ==========================
// ✏️ Editar / 🗑️ Borrar
// ==========================
async function editarUsuario(id) {
  try {
    const u = await apiFetchJson(`/usuarios/${id}`); // maneja 4xx/5xx y parsea JSON
    await mostrarFormularioUsuario(u, true);
  } catch (err) {
    console.error(err);
    Swal.fire('Error', err.message || 'No se pudo cargar el usuario', 'error');
  }
}


function borrarUsuario(id) {
  Swal.fire({
    title: '¿Estás seguro?',
    html: '<p style="font-size:14px; color:#555;">Esta acción no se puede deshacer.</p>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, borrar',
    cancelButtonText: 'Cancelar',
    customClass: {
      popup: 'swal2-modal',
      confirmButton: 'swal2-confirm',
      cancelButton: 'swal2-cancel'
    },
    buttonsStyling: false
  }).then(result => {
    if (!result.isConfirmed) return;

    apiFetch(`/usuarios/${id}`, { method: 'DELETE' })
      .then(res => {
        if (!res.ok) throw new Error('Error al borrar');
        return res.text();
      })
      .then(() => {
        Swal.fire({
          title: 'Eliminado',
          text: 'El usuario fue eliminado correctamente.',
          icon: 'success',
          confirmButtonText: 'OK',
          customClass: {
            popup: 'swal2-modal',
            confirmButton: 'swal2-confirm'
          },
          buttonsStyling: false
        }).then(() => location.reload());
      })
      .catch(err => {
        console.error(err);
        Swal.fire({
          title: 'Error',
          text: 'No se pudo borrar el usuario',
          icon: 'error',
          confirmButtonText: 'OK',
          customClass: {
            popup: 'swal2-modal',
            confirmButton: 'swal2-confirm'
          },
          buttonsStyling: false
        });
      });
  });
}



