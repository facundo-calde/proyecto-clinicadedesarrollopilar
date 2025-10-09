const API_URL = '/api/areas';
const tablaBody = document.getElementById('tabla-areas');
const sinInfo = document.querySelector('.sin-info');
const btnRegistrar = document.getElementById('btnAgregar');


document.addEventListener('DOMContentLoaded', cargarAreas);

// Cargar y renderizar áreas
async function cargarAreas() {
  try {
    const res = await fetch(API_URL);
    const areas = await res.json();

    tablaBody.innerHTML = '';
    sinInfo.style.display = areas.length ? 'none' : 'block';

    areas.forEach(area => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${area.nombre}</td>
        <td>${area.mail}</td>
        <td>
          <i class="fas fa-pen" style="cursor:pointer;" onclick="editarArea('${area._id}', '${area.nombre}', '${area.mail}')"></i>
          <i class="fas fa-trash" style="cursor:pointer; margin-left: 10px;" onclick="eliminarArea('${area._id}')"></i>
        </td>
      `;
      tablaBody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error al cargar áreas:', error);
  }
}

// Abrir formulario para registrar nueva área
btnRegistrar.addEventListener('click', () => {
  Swal.fire({
    title: 'Registrar nueva área',
html: `
  <label for="swal-nombre" style="display:block; margin-bottom:5px; font-weight:bold;">Nombre del área:</label>
  <input id="swal-nombre" class="swal2-input" placeholder="Ej: Psicopedagogía" style="width: 100%; box-sizing: border-box;">
  
  <label for="swal-mail" style="display:block; margin: 15px 0 5px; font-weight:bold;">Mail:</label>
  <input id="swal-mail" class="swal2-input" placeholder="ejemplo@mail.com" style="width: 100%; box-sizing: border-box;">
`,



    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    showCancelButton: true,
    preConfirm: async () => {
      const nombre = document.getElementById('swal-nombre').value.trim();
      const mail = document.getElementById('swal-mail').value.trim();

      if (!nombre || !mail) {
        Swal.showValidationMessage('Completa todos los campos');
        return false;
      }

      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, mail })
        });

        if (!res.ok) throw new Error('Error al registrar área');
        Swal.fire('¡Área creada!', '', 'success');
        cargarAreas();
      } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo crear el área', 'error');
      }
    }
  });
});

// Función para editar área
async function editarArea(id, nombreActual, mailActual) {
  Swal.fire({
    title: 'Editar área',
    html:
      `<label>Nombre del área:</label><input id="swal-nombre" class="swal2-input" value="${nombreActual}">` +
      `<label>Mail:</label><input id="swal-mail" class="swal2-input" value="${mailActual}">`,
    confirmButtonText: 'Actualizar',
    cancelButtonText: 'Cancelar',
    showCancelButton: true,
    preConfirm: async () => {
      const nombre = document.getElementById('swal-nombre').value.trim();
      const mail = document.getElementById('swal-mail').value.trim();

      if (!nombre || !mail) {
        Swal.showValidationMessage('Todos los campos son obligatorios');
        return false;
      }

      try {
        await fetch(`${API_URL}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, mail })
        });
        Swal.fire('¡Actualizado!', '', 'success');
        cargarAreas();
      } catch (err) {
        Swal.fire('Error', 'No se pudo actualizar', 'error');
      }
    }
  });
}

// Función para eliminar área
async function eliminarArea(id) {
  const confirm = await Swal.fire({
    title: '¿Eliminar área?',
    text: 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (confirm.isConfirmed) {
    try {
      await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
      });
      Swal.fire('¡Eliminado!', '', 'success');
      cargarAreas();
    } catch (err) {
      Swal.fire('Error', 'No se pudo eliminar el área', 'error');
    }
  }
}



// ==========================
// 🔐 Sesión, anti-back y helpers
// ==========================
const API   = 'http://localhost:3000';   // <-- ajustá si corresponde
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



