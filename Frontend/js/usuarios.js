// ==========================
// 🔐 Sesión y helpers
// ==========================
const API = 'http://localhost:3000';

// Token y usuario de la sesión
const token = localStorage.getItem("token");
const usuarioSesion = JSON.parse(localStorage.getItem("usuario") || "null");

// Si no hay token → volver al login
if (!token) {
  window.location.href = "index.html";
}

// Mostrar nombre dinámico en el top bar
if (usuarioSesion && usuarioSesion.nombreApellido) {
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = usuarioSesion.nombreApellido;
}

// Helper: agrega Authorization automáticamente y maneja 401
async function fetchAuth(url, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // token inválido/expirado
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.href = "index.html";
    throw new Error("No autorizado");
  }
  return res;
}

// 🔹 Botón cerrar sesión
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.href = "index.html";
  });
}

// ==========================
// 📋 Listado inicial
// ==========================
document.addEventListener('DOMContentLoaded', () => {
  const botonAgregar = document.getElementById('btnAgregarUsuario');
  const userList = document.getElementById('user-list');

  // Mostrar usuarios existentes (con token)
  fetchAuth(`${API}/api/usuarios`)
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
function mostrarFormularioUsuario(u = {}, modoEdicion = false) { // ← renombrado para no pisar la global
  Swal.fire({
    title: modoEdicion ? 'Editar usuario' : 'Registrar nuevo usuario',
    width: '80%',
    html: `
      <style>
        .swal2-popup.swal2-modal {
          padding: 25px 35px;
          font-family: 'Montserrat', 'Segoe UI', sans-serif;
          background-color: #ffffff;
          border: 1px solid #ccc;
          border-radius: 8px;
          box-shadow: 0 3px 12px rgba(0, 0, 0, 0.2);
          max-width: 1000px;
        }
        .form-container {
          display: flex;
          gap: 30px;
          justify-content: space-between;
          text-align: left;
          flex-wrap: wrap;
        }
        .form-column {
          flex: 1 1 280px;
          display: flex;
          flex-direction: column;
        }
        .form-column label {
          font-weight: bold;
          font-size: 14px;
          margin-top: 10px;
          color: #333;
        }
        .swal2-input,
        .swal2-select {
          width: 100%;
          padding: 10px;
          margin-top: 6px;
          margin-bottom: 10px;
          border: 1px solid #ccc;
          border-radius: 6px;
          background-color: #f9f9f9;
          font-size: 14px;
          font-family: 'Montserrat', sans-serif;
        }
        .area-check { margin-right: 6px; }
        .swal2-confirm {
          background-color: #2f72c4 !important;
          color: white !important;
          font-weight: bold;
          padding: 8px 20px;
          border-radius: 5px;
        }
        .swal2-cancel {
          background-color: #e53935 !important;
          color: white !important;
          font-weight: bold;
          padding: 8px 20px;
          border-radius: 5px;
          margin-right: 10px;
        }
      </style>
      <div class="form-container">
        <div class="form-column">
          <input class="swal2-input" id="nombreApellido" placeholder="Nombre y Apellido">
          <input class="swal2-input" id="fechaNacimiento" type="date" placeholder="Fecha de Nacimiento">
          <input class="swal2-input" id="domicilio" placeholder="Domicilio">
          <input class="swal2-input" id="dni" placeholder="DNI/CUIL/CUIT">
          <input class="swal2-input" id="matricula" placeholder="Matrícula">
          <input class="swal2-input" id="jurisdiccion" placeholder="Jurisdicción">
          <input class="swal2-input" id="whatsapp" placeholder="Whatsapp">
          <input class="swal2-input" id="mail" placeholder="Mail">
          <input class="swal2-input" id="salarioAcuerdo" placeholder="Salario acordado">
          <input class="swal2-input" id="fijoAcuerdo" placeholder="Fijo acordado">
          <input class="swal2-input" id="banco" placeholder="Banco">
          <input class="swal2-input" id="cbu" placeholder="CBU">
          <input class="swal2-input" id="alias" placeholder="Alias">
          <input class="swal2-input" id="tipoCuenta" placeholder="Tipo de cuenta">
        </div>
        <div class="form-column">
          <label><strong>Área asignada:</strong></label><br>
          ${['Fonoaudiología', 'Psicopedagogía', 'Terapia Ocupacional', 'Atención Temprana', 'Abordaje Integral', 'Habilidades Sociales']
            .map(area => `<label><input type="checkbox" class="area-check" value="${area}"> ${area}</label><br>`).join('')}
          <br>
          <label><strong>Rol asignado:</strong></label>
          <select id="rol" class="swal2-select">
            <option value="">Seleccionar...</option>
            <option value="Administrador">Administrador</option>
            <option value="Coordinador de área">Coordinador de área</option>
            <option value="Profesional">Profesional</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Recepcionista">Recepcionista</option>
          </select>
        </div>
        <div class="form-column">
          <label><strong>Usuario y Contraseña:</strong></label>
          <input class="swal2-input" id="usuario" placeholder="Usuario">
          <input class="swal2-input" id="contrasena" type="password" placeholder="Contraseña">

          <label><strong>Documentos:</strong></label>
          <input type="file" id="documentos" class="swal2-input" multiple>
        </div>
      </div>
    `,
    confirmButtonText: modoEdicion ? 'Actualizar' : 'Guardar',
    showCancelButton: true,
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      if (modoEdicion) {
        const set = (id, val) => document.getElementById(id).value = val || '';
        set('nombreApellido', u.nombreApellido);
        set('fechaNacimiento', u.fechaNacimiento ? u.fechaNacimiento.split('T')[0] : '');
        set('domicilio', u.domicilio);
        set('dni', u.dni);
        set('matricula', u.matricula);
        set('jurisdiccion', u.jurisdiccion);
        set('whatsapp', u.whatsapp);
        set('mail', u.mail);
        set('salarioAcuerdo', u.salarioAcuerdo);
        set('fijoAcuerdo', u.fijoAcuerdo);
        set('banco', u.banco);
        set('cbu', u.cbu);
        set('alias', u.alias);
        set('tipoCuenta', u.tipoCuenta);
        set('usuario', u.usuario);
        set('contrasena', u.contrasena);

        (u.areas || []).forEach(area => {
          const checkbox = Array.from(document.querySelectorAll('.area-check')).find(c => c.value === area);
          if (checkbox) checkbox.checked = true;
        });

        if (u.rol) document.getElementById('rol').value = u.rol;
      }
    },
    preConfirm: () => {
      const get = id => document.getElementById(id).value;
      const areasSeleccionadas = Array.from(document.querySelectorAll('.area-check:checked')).map(e => e.value);

      return {
        nombreApellido: get('nombreApellido'),
        fechaNacimiento: get('fechaNacimiento'),
        domicilio: get('domicilio'),
        dni: get('dni'),
        matricula: get('matricula'),
        jurisdiccion: get('jurisdiccion'),
        whatsapp: get('whatsapp'),
        mail: get('mail'),
        salarioAcuerdo: get('salarioAcuerdo'),
        fijoAcuerdo: get('fijoAcuerdo'),
        banco: get('banco'),
        cbu: get('cbu'),
        alias: get('alias'),
        tipoCuenta: get('tipoCuenta'),
        areas: areasSeleccionadas,
        rol: get('rol'),
        usuario: get('usuario'),
        contrasena: get('contrasena')
      };
    }
  }).then(result => {
    if (!result.isConfirmed) return;

    const url = modoEdicion ? `${API}/api/usuarios/${u._id}` : `${API}/api/usuarios`;
    const method = modoEdicion ? 'PUT' : 'POST';

    const formData = new FormData();
    // Campos de texto
    Object.entries(result.value).forEach(([key, val]) => {
      if (Array.isArray(val)) {
        val.forEach(v => formData.append(`${key}[]`, v));
      } else {
        formData.append(key, val);
      }
    });

    // Archivos
    const archivos = document.getElementById('documentos').files;
    for (let i = 0; i < archivos.length; i++) {
      formData.append('documentos', archivos[i]);
    }

    // Envío con token (sin Content-Type manual)
    fetchAuth(url, { method, body: formData })
      .then(res => {
        if (!res.ok) throw new Error('Error al guardar');
        return res.json();
      })
      .then(() => {
        Swal.fire('Éxito', modoEdicion ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success')
          .then(() => location.reload());
      })
      .catch(err => {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar el usuario', 'error');
      });
  });
}

// ==========================
// ✏️ Editar / 🗑️ Borrar
// ==========================
function editarUsuario(id) {
  fetchAuth(`${API}/api/usuarios/${id}`)
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

    fetchAuth(`${API}/api/usuarios/${id}`, { method: 'DELETE' })
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




