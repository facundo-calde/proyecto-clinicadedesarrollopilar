document.addEventListener('DOMContentLoaded', () => {
  const botonAgregar = document.getElementById('btnAgregarUsuario');
  const userList = document.getElementById('user-list');

  // Mostrar usuarios existentes
  fetch('http://localhost:3000/api/usuarios')
    .then(res => res.json())
    .then(data => {
      if (!data.length) {
        document.querySelector('.sin-info').style.display = 'block';
        return;
      }

      document.querySelector('.sin-info').style.display = 'none';

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
    });

  if (botonAgregar) {
    botonAgregar.addEventListener('click', () => mostrarFormularioUsuario());
  }
});

function mostrarFormularioUsuario(usuario = {}, modoEdicion = false) {
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
        .area-check {
          margin-right: 6px;
        }
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
        </div>
      </div>
    `,
    confirmButtonText: modoEdicion ? 'Actualizar' : 'Guardar',
    showCancelButton: true,
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      if (modoEdicion) {
        const set = (id, val) => document.getElementById(id).value = val || '';
        set('nombreApellido', usuario.nombreApellido);
        set('fechaNacimiento', usuario.fechaNacimiento);
        set('domicilio', usuario.domicilio);
        set('dni', usuario.dni);
        set('matricula', usuario.matricula);
        set('jurisdiccion', usuario.jurisdiccion);
        set('whatsapp', usuario.whatsapp);
        set('mail', usuario.mail);
        set('salarioAcuerdo', usuario.salarioAcuerdo);
        set('fijoAcuerdo', usuario.fijoAcuerdo);
        set('banco', usuario.banco);
        set('cbu', usuario.cbu);
        set('alias', usuario.alias);
        set('tipoCuenta', usuario.tipoCuenta);
        set('usuario', usuario.usuario);
        set('contrasena', usuario.contrasena);

        (usuario.areas || []).forEach(area => {
          const checkbox = Array.from(document.querySelectorAll('.area-check')).find(c => c.value === area);
          if (checkbox) checkbox.checked = true;
        });

        if (usuario.rol) document.getElementById('rol').value = usuario.rol;
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
    if (result.isConfirmed) {
      const url = modoEdicion ? `http://localhost:3000/api/usuarios/${usuario._id}` : 'http://localhost:3000/api/usuarios';
      const method = modoEdicion ? 'PUT' : 'POST';

      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.value)
      })
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
    }
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
    if (result.isConfirmed) {
      fetch(`http://localhost:3000/api/usuarios/${id}`, { method: 'DELETE' })
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
    }
  });
}


function editarUsuario(id) {
  fetch(`http://localhost:3000/api/usuarios/${id}`)
    .then(res => res.json())
    .then(usuario => mostrarFormularioUsuario(usuario, true))
    .catch(err => {
      console.error(err);
      Swal.fire('Error', 'No se pudo cargar el usuario', 'error');
    });
}




