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


// ==========================
// 📋 Listado inicial
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  const botonAgregar = document.getElementById('btnAgregarUsuario');
  const userList = document.getElementById('user-list');

  // Mostrar usuarios existentes (con token)
  apiFetch(`/usuarios`)
    .then(res => res.json())
    .then(data => {
      if (!Array.isArray(data) || data.length === 0) {
        const sinInfo = document.querySelector('.sin-info');
        if (sinInfo) sinInfo.style.display = 'block';
        return;
      }

      const sinInfo = document.querySelector('.sin-info');
      if (sinInfo) sinInfo.style.display = 'none';

      data.forEach(usuario => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${usuario.nombreApellido || ''}</td>
          <td>${(usuario.areas || []).join(', ')}</td>
          <td>${usuario.mail || ''}</td>
          <td>${usuario.whatsapp || ''}</td>
          <td>${usuario.activo ? 'Activo' : 'Inactivo'}</td>
          <td>
            <button onclick="editarUsuario('${usuario._id}')">Editar</button>
            <button onclick="borrarUsuario('${usuario._id}')">Borrar</button>
          </td>
        `;
        userList.appendChild(tr);
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
    const res = await apiFetch(`/areas`, { method: "GET" });
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
    title: modoEdicion ? 'Editar usuario' : 'Registrar nuevo usuario',
    width: '90%',
    html: `
      <style>
        .swal2-popup * { box-sizing: border-box; }
        .swal2-popup.swal2-modal{
          padding:18px 22px;
          font-family:'Montserrat','Segoe UI',sans-serif;
          background:#fff;border:1px solid #ccc;border-radius:10px;
          box-shadow:0 3px 12px rgba(0,0,0,.2);
          max-width: 1600px;
        }
        .swal-body{ max-height:72vh; overflow-y:auto; overflow-x:auto; }
        .form-container{
          display:grid;
          grid-template-columns: minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);
          gap:24px; min-width:0; width:100%;
        }
        .form-column{ display:flex; flex-direction:column; min-width:0; }
        .form-column label{ font-weight:600;font-size:14px;margin-top:8px;color:#333; }
        .swal2-input,.swal2-select{
          width:100%; min-width:0; max-width:100%;
          padding:10px; margin-top:6px; margin-bottom:10px;
          border:1px solid #ccc;border-radius:8px;background:#f9f9f9;font-size:14px;
        }
        .mini-btn{ padding:6px 10px;border:1px solid #ccc;border-radius:8px;background:#eee;cursor:pointer;font-size:12px; }
        .icon-btn{
          width:36px;height:36px;min-width:36px; display:flex;align-items:center;justify-content:center;
          border-radius:8px;border:1px solid #d32f2f;background:#e53935;color:#fff;cursor:pointer;padding:0;
        }
        .block{ border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fafafa;margin-top:6px;min-width:0;width:100%; }
        .pro-row{ display:grid; grid-template-columns: minmax(0,1fr) 150px 36px; gap:8px; align-items:center; margin:6px 0; }
        .coord-row{ display:grid; grid-template-columns: minmax(0,1fr) 36px; gap:8px; align-items:center; margin:6px 0; }
        input[type="file"].swal2-input{ width:100%; display:block; }
        .swal2-confirm{ background:#2f72c4 !important;color:#fff !important;font-weight:700;padding:8px 20px;border-radius:8px; }
        .swal2-cancel { background:#e53935 !important;color:#fff !important;font-weight:700;padding:8px 20px;border-radius:8px; }
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
            <input class="swal2-input" id="salarioAcuerdo" placeholder="Salario acordado" autocomplete="off">
            <input class="swal2-input" id="fijoAcuerdo" placeholder="Fijo acordado" autocomplete="off">
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
              <option value="Administrativo">Administrativo</option>
              <option value="Recepcionista">Recepcionista</option>
            </select>

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
            <input type="file" id="documentos" class="swal2-input" multiple>
          </div>
        </div>
      </div>
    `,
    confirmButtonText: modoEdicion ? 'Actualizar' : 'Guardar',
    showCancelButton: true,
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      // Precarga si es edición
      if (modoEdicion) {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val ?? ''); };
        set('nombreApellido', u.nombreApellido);
        set('fechaNacimiento', u.fechaNacimiento ? String(u.fechaNacimiento).split('T')[0] : '');
        set('domicilio', u.domicilio);
        set('dni', u.dni);
        set('cuit', u.cuit);
        set('matricula', u.matricula);
        if (u.jurisdiccion) document.getElementById('jurisdiccion').value = u.jurisdiccion;
        set('registroNacionalDePrestadores', u.registroNacionalDePrestadores);
        set('whatsapp', u.whatsapp);
        set('mail', u.mail);
        set('salarioAcuerdo', u.salarioAcuerdo);
        set('fijoAcuerdo', u.fijoAcuerdo);
        set('banco', u.banco);
        set('cbu', u.cbu);
        set('numeroCuenta', u.numeroCuenta);
        set('numeroSucursal', u.numeroSucursal);
        set('alias', u.alias);
        set('nombreFiguraExtracto', u.nombreFiguraExtracto);
        set('tipoCuenta', u.tipoCuenta);
        set('usuario', u.usuario);
        // No precargar contraseña por seguridad
        if (u.rol) document.getElementById('rol').value = u.rol;
      } else {
        // Creación: asegurar campos vacíos (evita autofill)
        const usuarioEl = document.getElementById('usuario');
        const passEl    = document.getElementById('contrasena');
        if (usuarioEl) usuarioEl.value = '';
        if (passEl)     passEl.value = '';
        setTimeout(() => {
          if (usuarioEl) usuarioEl.value = '';
          if (passEl)    passEl.value = '';
        }, 0);
      }

      const rolSelect    = document.getElementById('rol');
      const proSection   = document.getElementById('proSection');
      const coordSection = document.getElementById('coordSection');
      const proList      = document.getElementById('proList');
      const coordList    = document.getElementById('coordList');
      const btnAddPro    = document.getElementById('btnAddPro');
      const btnAddCoord  = document.getElementById('btnAddCoord');
      const labelSeguro  = document.getElementById('labelSeguro');
      const inputSeguro  = document.getElementById('seguroMalaPraxis');

      function addProRow(areaNombre = "", nivel = "") {
        proList.insertAdjacentHTML('beforeend', buildProRow(areaNombre, nivel));
        const row = proList.lastElementChild;
        if (areaNombre) row.querySelector('.pro-area').value = areaNombre;
        if (nivel)      row.querySelector('.pro-nivel').value = nivel;
        row.querySelector('.btn-del-pro').addEventListener('click', () => row.remove());
      }
      function addCoordRow(areaNombre = "") {
        coordList.insertAdjacentHTML('beforeend', buildCoordRow(areaNombre));
        const row = coordList.lastElementChild;
        if (areaNombre) row.querySelector('.coord-area').value = areaNombre;
        row.querySelector('.btn-del-coord').addEventListener('click', () => row.remove());
      }
      btnAddPro.addEventListener('click', () => addProRow());
      btnAddCoord.addEventListener('click', () => addCoordRow());

      const ROLES_PROF  = new Set(['Profesional', 'Coordinador y profesional']);
      const ROLES_COORD = new Set(['Coordinador de área', 'Coordinador y profesional']);

      function syncVisibility() {
        const rol = rolSelect.value;
        proSection.style.display   = ROLES_PROF.has(rol)  ? 'block' : 'none';
        coordSection.style.display = ROLES_COORD.has(rol) ? 'block' : 'none';

        const showSeguro = ROLES_PROF.has(rol);
        labelSeguro.style.display = showSeguro ? 'block' : 'none';
        inputSeguro.style.display = showSeguro ? 'block' : 'none';

        if (proSection.style.display !== 'none' && !proList.querySelector('.pro-row')) addProRow();
        if (coordSection.style.display !== 'none' && !coordList.querySelector('.coord-row')) addCoordRow();
      }
      syncVisibility();

      // Precarga arrays edición (si existen)
      if (modoEdicion) {
        if (Array.isArray(u.areasProfesional) && u.areasProfesional.length) {
          proList.innerHTML = '';
          u.areasProfesional.forEach(ap => addProRow(ap.areaNombre || '', ap.nivel || ''));
        }
        if (Array.isArray(u.areasCoordinadas) && u.areasCoordinadas.length) {
          coordList.innerHTML = '';
          u.areasCoordinadas.forEach(ac => addCoordRow(ac.areaNombre || ''));
        }
        if (u.seguroMalaPraxis && (u.rol === 'Profesional' || u.rol === 'Coordinador y profesional')) {
          inputSeguro.value = u.seguroMalaPraxis;
        }
      }

      rolSelect.addEventListener('change', syncVisibility);

      // 👁️ Toggle mostrar/ocultar contraseña
      const passInput  = document.getElementById('contrasena');
      const toggleBtn  = document.getElementById('togglePass');
      const toggleIcon = document.getElementById('togglePassIcon');
      if (toggleBtn && passInput && toggleIcon) {
        toggleBtn.addEventListener('click', () => {
          const show = passInput.type === 'password';
          passInput.type = show ? 'text' : 'password';
          toggleIcon.className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        });
      }
    },
    preConfirm: () => {
      const get = id => document.getElementById(id)?.value?.trim();

      const rol = get('rol');

      const areasProfesional = Array.from(document.querySelectorAll('#proList .pro-row'))
        .map(row => {
          const areaNombre = row.querySelector('.pro-area')?.value?.trim() || "";
          const nivel      = row.querySelector('.pro-nivel')?.value?.trim() || "";
          if (!areaNombre || !nivel) return null;
          return { areaNombre, nivel };
        }).filter(Boolean);

      const areasCoordinadas = Array.from(document.querySelectorAll('#coordList .coord-row'))
        .map(row => {
          const areaNombre = row.querySelector('.coord-area')?.value?.trim() || "";
          if (!areaNombre) return null;
          return { areaNombre };
        }).filter(Boolean);

      const ROLES_PROF  = new Set(['Profesional', 'Coordinador y profesional']);
      const ROLES_COORD = new Set(['Coordinador de área', 'Coordinador y profesional']);

      if (ROLES_PROF.has(rol) && areasProfesional.length === 0) {
        Swal.showValidationMessage('Agregá al menos un área con nivel para el rol profesional.');
        return false;
      }
      if (ROLES_COORD.has(rol) && areasCoordinadas.length === 0) {
        Swal.showValidationMessage('Agregá al menos un área para coordinación.');
        return false;
      }

      return {
        nombreApellido: get('nombreApellido'),
        fechaNacimiento: get('fechaNacimiento'),
        domicilio: get('domicilio'),
        dni: get('dni'),
        cuit: get('cuit'),
        matricula: get('matricula'),
        jurisdiccion: get('jurisdiccion'),
        registroNacionalDePrestadores: get('registroNacionalDePrestadores'),
        whatsapp: get('whatsapp'),
        mail: get('mail'),
        salarioAcuerdo: get('salarioAcuerdo'),
        fijoAcuerdo: get('fijoAcuerdo'),
        banco: get('banco'),
        cbu: get('cbu'),
        numeroCuenta: get('numeroCuenta'),
        numeroSucursal: get('numeroSucursal'),
        alias: get('alias'),
        nombreFiguraExtracto: get('nombreFiguraExtracto'),
        tipoCuenta: get('tipoCuenta'),
        rol,
        usuario: get('usuario'),
        contrasena: get('contrasena'),
        seguroMalaPraxis: get('seguroMalaPraxis') || undefined,
        areasProfesional,
        areasCoordinadas
      };
    }
  }).then(async result => {
    if (!result.isConfirmed) return;

    const url = modoEdicion ? `/api/usuarios/${u._id}` : `/api/usuarios`;
    const method = modoEdicion ? 'PUT' : 'POST';

    const archivos = (document.getElementById('documentos')?.files) || [];
    let response;

    if (!archivos.length) {
      response = await fetchAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.value)
      });
    } else {
      const formData = new FormData();
      for (const [key, val] of Object.entries(result.value)) {
        if (val == null) continue;
        if (key === 'areasProfesional' || key === 'areasCoordinadas') {
          formData.append(key, JSON.stringify(val));
        } else {
          formData.append(key, val);
        }
      }
      for (let i = 0; i < archivos.length; i++) formData.append('documentos', archivos[i]);
      response = await fetchAuth(url, { method, body: formData });
    }

    if (!response.ok) {
      let msg = 'Error al guardar';
      try { const j = await response.json(); msg = j?.error || msg; } catch {}
      throw new Error(msg);
    }

    await response.json();
    Swal.fire('Éxito', modoEdicion ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success')
      .then(() => location.reload());
  }).catch(err => {
    console.error(err);
    Swal.fire('Error', 'No se pudo guardar el usuario', 'error');
  });
}




// ==========================
// ✏️ Editar / 🗑️ Borrar
// ==========================
function editarUsuario(id) {
  apiFetch(`/usuarios/${id}`)
    .then(res => res.json())
    .then(u => mostrarFormularioUsuario(u, true))
    .catch(err => {
      console.error(err);
      Swal.fire('Error', 'No se pudo cargar el usuario', 'error');
    });
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



