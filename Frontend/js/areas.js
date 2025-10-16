// ====== ÁREAS (listado + CRUD) ======
const tablaBody    = document.getElementById('tabla-areas');
const sinInfo      = document.querySelector('.sin-info');
const btnRegistrar = document.getElementById('btnAgregar');

const esc = (s) => encodeURIComponent(String(s ?? ''));
const unesc = (s) => decodeURIComponent(String(s ?? ''));

document.addEventListener('DOMContentLoaded', cargarAreas);

// Cargar y renderizar áreas
async function cargarAreas() {
  try {
    const res = await apiFetch('/areas');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const areas = await res.json();

    tablaBody.innerHTML = '';
    sinInfo.style.display = areas.length ? 'none' : 'block';

    areas.forEach(area => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${area.nombre || ''}</td>
        <td>${area.mail || ''}</td>
        <td>
          <i class="fas fa-pen btn-edit" 
             style="cursor:pointer;"
             data-id="${area._id}"
             data-nombre="${esc(area.nombre)}"
             data-mail="${esc(area.mail)}"></i>

          <i class="fas fa-trash btn-del" 
             style="cursor:pointer; margin-left:10px;"
             data-id="${area._id}"></i>
        </td>
      `;
      tablaBody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error al cargar áreas:', error);
    tablaBody.innerHTML = '';
    sinInfo.style.display = 'block';
  }
}

// Delegación de eventos para Editar / Eliminar
tablaBody.addEventListener('click', (e) => {
  const edit = e.target.closest('.btn-edit');
  if (edit) {
    const id  = edit.dataset.id;
    const nom = unesc(edit.dataset.nombre);
    const mail = unesc(edit.dataset.mail);
    editarArea(id, nom, mail);
    return;
  }
  const del = e.target.closest('.btn-del');
  if (del) {
    eliminarArea(del.dataset.id);
  }
});

// Registrar nueva área
if (btnRegistrar) {
  btnRegistrar.addEventListener('click', () => {
    Swal.fire({
      title: 'Registrar nueva área',
      html: `
        <label for="swal-nombre" style="display:block; margin-bottom:5px; font-weight:bold;">Nombre del área:</label>
        <input id="swal-nombre" class="swal2-input" placeholder="Ej: Psicopedagogía" style="width:100%; box-sizing:border-box;">

        <label for="swal-mail" style="display:block; margin:15px 0 5px; font-weight:bold;">Mail:</label>
        <input id="swal-mail" class="swal2-input" placeholder="ejemplo@mail.com" style="width:100%; box-sizing:border-box;">
      `,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      showCancelButton: true,
      preConfirm: async () => {
        const nombre = document.getElementById('swal-nombre').value.trim();
        const mail   = document.getElementById('swal-mail').value.trim();

        if (!nombre || !mail) {
          Swal.showValidationMessage('Completa todos los campos');
          return false;
        }

        try {
          const res = await apiFetch('/areas', {
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
}

// Editar área
async function editarArea(id, nombreActual, mailActual) {
  Swal.fire({
    title: 'Editar área',
    html: `
      <label>Nombre del área:</label>
      <input id="swal-nombre" class="swal2-input" value="${(nombreActual || '').replace(/"/g, '&quot;')}">
      <label>Mail:</label>
      <input id="swal-mail" class="swal2-input" value="${(mailActual || '').replace(/"/g, '&quot;')}">
    `,
    confirmButtonText: 'Actualizar',
    cancelButtonText: 'Cancelar',
    showCancelButton: true,
    preConfirm: async () => {
      const nombre = document.getElementById('swal-nombre').value.trim();
      const mail   = document.getElementById('swal-mail').value.trim();

      if (!nombre || !mail) {
        Swal.showValidationMessage('Todos los campos son obligatorios');
        return false;
      }

      try {
        const res = await apiFetch(`/areas/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, mail })
        });
        if (!res.ok) throw new Error('Error al actualizar');
        Swal.fire('¡Actualizado!', '', 'success');
        cargarAreas();
      } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo actualizar', 'error');
      }
    }
  });
}

// Eliminar área
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
      const res = await apiFetch(`/areas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      Swal.fire('¡Eliminado!', '', 'success');
      cargarAreas();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo eliminar el área', 'error');
    }
  }
}

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

// Anti-BFCache
window.addEventListener('pageshow', (e) => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fromBF = e.persisted || nav?.type === 'back_forward';
  if (fromBF && !localStorage.getItem('token')) goLogin();
});

// Anti-atrás
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




