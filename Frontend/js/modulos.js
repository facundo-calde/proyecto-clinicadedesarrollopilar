// ==========================
// MÓDULOS – Frontend
// ==========================

document.addEventListener('DOMContentLoaded', () => {
  const botonCargar     = document.getElementById('btnCargarModulo');
  const inputBusqueda   = document.getElementById('busquedaModulo');
  const sugerencias     = document.getElementById('sugerencias');
  const contenedorFicha = document.getElementById('fichaModuloContainer');
  // Si tu HTML tiene un contenedor dedicado (p.ej. <div id="listaModulos"></div>)
  // lo usamos; si no, reutilizamos el mismo contenedor de ficha.
  const contenedorLista = document.getElementById('listaModulos') || contenedorFicha;

  // ---------- Helpers ----------
  const getNumberOrZero = (id) => {
    const el = document.getElementById(id);
    return el && el.value.trim() !== '' ? parseFloat(el.value) : 0;
  };

  const calcProfesional = (idPaciente, idPorcentaje, idResultado) => {
    const pacienteInput    = document.getElementById(idPaciente);
    const porcentajeInput  = document.getElementById(idPorcentaje);
    const profesionalInput = document.getElementById(idResultado);

    const calcular = () => {
      const paciente   = parseFloat(pacienteInput.value);
      const porcentaje = parseFloat(porcentajeInput.value);
      profesionalInput.value =
        (!isNaN(paciente) && !isNaN(porcentaje))
          ? (paciente * (porcentaje / 100)).toFixed(3)
          : '';
    };

    pacienteInput.addEventListener('input', calcular);
    porcentajeInput.addEventListener('input', calcular);
  };

  // ---------- Listado completo ----------
  async function cargarListadoModulos() {
    try {
      const res = await apiFetch(`/modulos`);
      const mods = await res.json();

      if (!Array.isArray(mods) || mods.length === 0) {
        contenedorLista.innerHTML = `
          <div class="table-container">
            <div style="padding:12px;color:#666;font-style:italic;">No hay módulos cargados todavía.</div>
          </div>`;
        return;
      }

      renderListado(mods);
    } catch (e) {
      console.error('Error listando módulos:', e);
      contenedorLista.innerHTML = `
        <div class="table-container">
          <div style="padding:12px;color:#b91c1c;">Error al cargar el listado de módulos.</div>
        </div>`;
    }
  }

  function renderListado(mods) {
    const rows = mods.map(m => `
      <tr>
        <td>${m.numero}</td>
        <td>01-2027</td>
        <td>$${(m.valoresModulo?.paciente ?? 0).toLocaleString()}</td>
        <td>$${(m.areasExternas?.profesional ?? 0).toLocaleString()}</td>
        <td>$${(m.habilidadesSociales?.profesional ?? 0).toLocaleString()}</td>
        <td>Activo</td>
        <td>
          <button class="btn-modificar" onclick="modificarModulo(${m.numero})">✏️</button>
          <button class="btn-borrar"    onclick="borrarModulo(${m.numero})">🗑️</button>
        </td>
      </tr>
    `).join('');

    contenedorLista.innerHTML = `
      <div class="table-container">
        <table class="modulo-detalle">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Última modificación</th>
              <th>Valor FONO-PSICO</th>
              <th>Valor ÁREAS EXTERNAS</th>
              <th>Valor HABILIDADES SOCIALES</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ---------- Autocompletado / búsqueda ----------
  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', async () => {
      const valor = inputBusqueda.value.trim();
      if (sugerencias) sugerencias.innerHTML = '';
      if (contenedorFicha) contenedorFicha.innerHTML = '';

      if (valor.length < 2) return;

      try {
        const res = await apiFetch(`/modulos?numero=${encodeURIComponent(valor)}`);
        const modulos = await res.json();

        if (Array.isArray(modulos) && sugerencias) {
          modulos.forEach(mod => {
            const li = document.createElement('li');
            li.textContent = `Módulo ${mod.numero}`;
            li.style.cursor = 'pointer';
            li.addEventListener('click', () => {
              inputBusqueda.value = mod.numero;
              sugerencias.innerHTML = '';
              mostrarFichaModulo(mod);
            });
            sugerencias.appendChild(li);
          });
        }
      } catch (error) {
        console.error('Error al buscar módulos:', error);
      }
    });
  }

  // ---------- Crear módulo ----------
if (botonCargar) {
  botonCargar.addEventListener('click', async () => {
    const AREAS_FP = /(fonoaudiolog[íi]a|psicolog[íi]a)/i;

    // Traer usuarios (no rompas el modal si falla)
    let usuarios = [];
    try {
      const res = await apiFetch('/usuarios', { method: 'GET' });
      if (res.ok) usuarios = await res.json();
    } catch (e) {
      console.warn('No se pudieron obtener usuarios:', e);
    }

    const getArr   = v => Array.isArray(v) ? v : (v ? [v] : []);
    const fullName = u => [u.apellido, u.nombre].filter(Boolean).join(', ') || u.nombre || 'Sin nombre';
    const hasArea  = (u) =>
      getArr(u.areasProfesional).some(a => AREAS_FP.test(String(a||''))) ||
      getArr(u.areasCoordinadas).some(a => AREAS_FP.test(String(a||''))) ||
      getArr(u.areas).some(a => AREAS_FP.test(String(a||'')));
    const hasRol = (u, rol) => {
      const r1 = (u.rol || u.role || '').toLowerCase();
      const r2 = getArr(u.roles).map(x => String(x||'').toLowerCase());
      const target = rol.toLowerCase();
      return r1 === target || r2.includes(target);
    };

    const profesionales = usuarios.filter(u => hasArea(u) && (hasRol(u, 'profesional') || hasRol(u, 'terapeuta')));
    const coordinadores = usuarios.filter(u => hasArea(u) && (hasRol(u, 'coordinador') || hasRol(u, 'coordinadora')));

    const renderLista = (arr, name) => {
      if (!arr.length) return `<div class="empty">No hay ${name} en esas áreas</div>`;
      return arr
        .sort((a,b)=>fullName(a).localeCompare(fullName(b), 'es'))
        .map(u => `
          <label class="person-item">
            <input type="checkbox" name="${name}" value="${u._id}">
            <span>${fullName(u)}</span>
          </label>
        `).join('');
    };

    const { value: formValues } = await Swal.fire({
      title: 'Cargar nuevo módulo',
      width: '900px',
      html: `
        <style>
          .form-grid{display:grid;gap:12px}
          .row{display:grid;gap:10px}
          .cols-2{grid-template-columns:1fr 1fr}
          .person-list{max-height:260px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;padding:8px}
          .person-item{display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px dashed #eee}
          .person-item:last-child{border-bottom:none}
          .section-title{font-weight:700;margin:4px 0 6px}
          .empty{color:#888;font-style:italic;padding:6px}
          .swal2-input{width:100%}
        </style>

        <div class="form-grid">
          <div class="row cols-2">
            <div>
              <label for="modulo_numero"><strong>Número del módulo:</strong></label>
              <input id="modulo_numero" type="number" min="0" step="1" class="swal2-input">
            </div>
            <div>
              <label for="valor_padres"><strong>Pagan los padres (valor del módulo):</strong></label>
              <input id="valor_padres" type="number" min="0" step="0.01" class="swal2-input">
            </div>
          </div>

          <div>
            <div class="section-title">VALORES FONOAUDIOLOGÍA - PSICOLOGÍA</div>
            <div class="row cols-2">
              <div>
                <div class="section-title">Profesionales</div>
                <div class="person-list" id="listaProfesionales">
                  ${renderLista(profesionales, 'profesionales')}
                </div>
              </div>
              <div>
                <div class="section-title">Coordinadores</div>
                <div class="person-list" id="listaCoordinadores">
                  ${renderLista(coordinadores, 'coordinadores')}
                </div>
              </div>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const numero = parseInt(document.getElementById('modulo_numero').value, 10);
        const valorPadres = Number(document.getElementById('valor_padres').value);

        if (isNaN(numero)) return Swal.showValidationMessage('⚠️ El número del módulo es obligatorio');
        if (Number.isNaN(valorPadres)) return Swal.showValidationMessage('⚠️ Ingresá un valor válido para “Pagan los padres”');

        const sel = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);

        return {
          numero,
          valorPadres,
          profesionales: sel('profesionales'),
          coordinadores: sel('coordinadores'),
        };
      }
    });

    if (!formValues) return;

    // Guardar
    try {
      const res = await apiFetch(`/modulos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');

      Swal.fire('Éxito', 'Módulo guardado correctamente', 'success');
      cargarListadoModulos();
    } catch (error) {
      console.error('Error guardando módulo:', error);
      Swal.fire('Error', error?.message || 'Ocurrió un error al guardar', 'error');
    }
  });
}

  // ---------- Handlers globales (usados por onclick en la tabla) ----------
  window.borrarModulo = async (numero) => {
    const confirmacion = await Swal.fire({
      title: `¿Eliminar módulo ${numero}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar',
      cancelButtonText: 'Cancelar'
    });

    if (!confirmacion.isConfirmed) return;

    try {
      const res = await apiFetch(`/modulos/${numero}`, { method: 'DELETE' });
      if (res.ok) {
        Swal.fire('Borrado', 'El módulo fue eliminado.', 'success');
        if (contenedorFicha) contenedorFicha.innerHTML = '';
        cargarListadoModulos(); // refrescar listado
      } else {
        const data = await res.json();
        Swal.fire('Error', data.error || 'No se pudo borrar el módulo.', 'error');
      }
    } catch (error) {
      console.error('Error al borrar módulo:', error);
      Swal.fire('Error', 'Error al eliminar el módulo.', 'error');
    }
  };

  window.modificarModulo = async (numero) => {
    try {
      const res    = await apiFetch(`/modulos/${numero}`);
      const modulo = await res.json();
      if (!res.ok) throw new Error(modulo.error || 'No se pudo obtener el módulo');

      const { value: formValues } = await Swal.fire({
        title: `Modificar módulo ${numero}`,
        width: '800px',
        html: `
          <div style="margin-bottom: 15px;">
            <label for="modulo_numero"><strong>Número del módulo:</strong></label>
            <input id="modulo_numero" class="swal2-input" style="width: 100%;" value="${modulo.numero}" disabled>
          </div>

          <!-- FONO/PSICO -->
          <div class="grupo-bloque azul">
            <h4>VALORES FONOAUDIOLOGÍA - PSICOLOGÍA</h4>
            <label>Paciente:</label>
            <input id="fp_paciente"   value="${modulo.valoresModulo?.paciente ?? 0}">
            <label>Dirección:</label>
            <input id="fp_direccion"  value="${modulo.valoresModulo?.direccion ?? 0}">
          </div>

          <!-- COORDINADORES -->
          <div class="grupo-bloque azul">
            <h4>FIJO COORDINADORES</h4>
            <label>Nora:</label>
            <input id="coord_nora"  value="${modulo.coordinadores?.nora ?? 0}">
            <label>Tete:</label>
            <input id="coord_tete"  value="${modulo.coordinadores?.tete ?? 0}">
          </div>

          <!-- PROFESIONALES -->
          <div class="grupo-bloque azul">
            <h4>FIJO PROFESIONALES</h4>
            <label>Senior:</label>
            <input id="prof_senior" value="${modulo.profesionales?.senior ?? 0}">
            <label>Junior:</label>
            <input id="prof_junior" value="${modulo.profesionales?.junior ?? 0}">
          </div>

          <!-- ÁREAS EXTERNAS -->
          <div class="grupo-bloque verde">
            <h4>ÁREAS EXTERNAS</h4>
            <label>Paciente:</label>
            <input id="ae_paciente"    value="${modulo.areasExternas?.paciente ?? 0}">
            <label>%:</label>
            <input id="ae_porcentaje"  value="${modulo.areasExternas?.porcentaje ?? 0}">
            <label>Profesional:</label>
            <input id="ae_profesional" readonly value="${modulo.areasExternas?.profesional ?? 0}">
          </div>

          <!-- HABILIDADES SOCIALES -->
          <div class="grupo-bloque verde">
            <h4>HABILIDADES SOCIALES</h4>
            <label>Paciente:</label>
            <input id="hs_paciente"    value="${modulo.habilidadesSociales?.paciente ?? 0}">
            <label>%:</label>
            <input id="hs_porcentaje"  value="${modulo.habilidadesSociales?.porcentaje ?? 0}">
            <label>Profesional:</label>
            <input id="hs_profesional" readonly value="${modulo.habilidadesSociales?.profesional ?? 0}">
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar cambios',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
          calcProfesional('ae_paciente', 'ae_porcentaje', 'ae_profesional');
          calcProfesional('hs_paciente', 'hs_porcentaje', 'hs_profesional');
        },
        preConfirm: () => ({
          numero,
          valoresModulo: {
            paciente:  getNumberOrZero('fp_paciente'),
            direccion: getNumberOrZero('fp_direccion')
          },
          coordinadores: {
            nora: getNumberOrZero('coord_nora'),
            tete: getNumberOrZero('coord_tete')
          },
          profesionales: {
            senior: getNumberOrZero('prof_senior'),
            junior: getNumberOrZero('prof_junior')
          },
          areasExternas: {
            paciente:    getNumberOrZero('ae_paciente'),
            porcentaje:  getNumberOrZero('ae_porcentaje'),
            profesional: getNumberOrZero('ae_profesional')
          },
          habilidadesSociales: {
            paciente:    getNumberOrZero('hs_paciente'),
            porcentaje:  getNumberOrZero('hs_porcentaje'),
            profesional: getNumberOrZero('hs_profesional')
          }
        })
      });

      if (!formValues) return;

      const resUpdate = await apiFetch(`/modulos/${numero}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await resUpdate.json();

      if (resUpdate.ok) {
        Swal.fire('Éxito', 'Módulo actualizado correctamente', 'success');
        cargarListadoModulos(); // refrescar listado
      } else {
        Swal.fire('Error', data.error || 'No se pudo actualizar el módulo', 'error');
      }
    } catch (error) {
      console.error('Error al modificar módulo:', error);
      Swal.fire('Error', 'Ocurrió un error al cargar el módulo.', 'error');
    }
  };

  // 👉 Al entrar a la pantalla, cargamos el listado
  cargarListadoModulos();
});


// ==========================
// 🔐 Sesión, anti-back y helpers (igual que otras pantallas)
// ==========================
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

// Si necesitás fetchAuth local (por si no usás apiFetch acá)
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





