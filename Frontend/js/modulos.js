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

    // Helpers de UI $ARS
    const formatARS = (n) => {
      if (n === '' || n == null || isNaN(n)) return '';
      try {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(n));
      } catch { return `$ ${Number(n).toFixed(2)}`; }
    };
    const attachMoneyMask = (root) => {
      root.querySelectorAll('input.money').forEach(inp => {
        inp.setAttribute('inputmode', 'decimal');
        inp.setAttribute('step', '0.01');
        inp.addEventListener('blur', () => {
          const v = inp.value.trim();
          if (v === '') return;
          const num = Number(v.replace(',', '.'));
          if (!isNaN(num)) inp.value = num.toFixed(2);
          const label = inp.closest('.money-wrap')?.querySelector('.money-preview');
          if (label) label.textContent = formatARS(inp.value || 0);
        });
        inp.addEventListener('input', () => {
          const label = inp.closest('.money-wrap')?.querySelector('.money-preview');
          if (label) {
            const num = Number((inp.value || '0').replace(',', '.'));
            label.textContent = isNaN(num) ? '' : formatARS(num);
          }
        });
      });
    };

    // Traer usuarios por área+rol
    async function fetchUsuariosPorArea(areaNombre) {
      // Ajustá estos endpoints/queries si tus rutas difieren
      const qp = encodeURIComponent(areaNombre);
      const [profRes, coordRes] = await Promise.all([
        apiFetch(`/usuarios?area=${qp}&rol=profesional`, { method: 'GET' }),
        apiFetch(`/usuarios?area=${qp}&rol=coordinador`, { method: 'GET' })
      ]);
      const profesionales = (await profRes.json()).filter(Boolean);
      const coordinadores = (await coordRes.json()).filter(Boolean);
      return { profesionales, coordinadores };
    }

    // Pre-cargar datos de Fono y Psico
    let FONO = { profesionales: [], coordinadores: [] };
    let PSICO = { profesionales: [], coordinadores: [] };
    try {
      [FONO, PSICO] = await Promise.all([
        fetchUsuariosPorArea('Fonoaudiología'),
        fetchUsuariosPorArea('Psicología'),
      ]);
    } catch (e) {
      console.error('Error cargando usuarios por área:', e);
      // Seguimos con arrays vacíos para no romper el modal
    }

    // Renderiza listas (checkbox + input $) por persona
    const renderLista = (items = [], prefix = '') => {
      if (!Array.isArray(items) || items.length === 0) {
        return `<div class="text-sm text-gray-500" style="margin:6px 0 10px;">(No hay personas para asignar)</div>`;
      }
      return items.map(u => {
        const id = (u._id || u.id || Math.random().toString(36).slice(2));
        const nombre = [u.apellido, u.nombre].filter(Boolean).join(', ') || u.nombre || u.usuario || 'Sin nombre';
        return `
          <div class="persona-row" style="display:flex; gap:10px; align-items:center; margin:6px 0;">
            <input type="checkbox" id="${prefix}_chk_${id}" data-userid="${id}" data-nombre="${nombre}">
            <label for="${prefix}_chk_${id}" style="flex:1;">${nombre}</label>
            <div class="money-wrap" style="display:flex; gap:6px; align-items:center;">
              <span>$</span>
              <input class="money" id="${prefix}_monto_${id}" placeholder="0,00" style="width:120px; text-align:right;">
              <span class="money-preview" style="min-width:110px; text-align:right; font-size:12px; color:#666;"></span>
            </div>
          </div>
        `;
      }).join('');
    };

    const { value: formValues } = await Swal.fire({
      title: 'Cargar nuevo módulo',
      width: '900px',
      html: `
        <style>
          .grupo-bloque { border:1px solid #e5e7eb; border-radius:8px; padding:12px; margin:10px 0; }
          .azul { background:#f0f7ff; }
          .verde { background:#f2fff0; }
          .grupo-bloque h4 { margin:0 0 8px; }
          .grid-2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
          .subcol { border:1px dashed #cbd5e1; border-radius:8px; padding:8px; background:#fff; }
          .subcol h5 { margin:0 0 6px; font-size:14px; }
          .swal2-input { width:100%; }
          label { display:block; font-size:13px; margin-bottom:4px; }
        </style>

        <!-- NRO MÓDULO -->
        <div class="grupo-bloque">
          <label for="modulo_numero"><strong>Número del módulo</strong></label>
          <input id="modulo_numero" class="swal2-input" placeholder="Ej: 101">
        </div>

        <!-- PAGA PACIENTE -->
        <div class="grupo-bloque">
          <label for="paga_paciente"><strong>Paga paciente</strong> <small>(ARS)</small></label>
          <div class="money-wrap" style="display:flex; gap:8px; align-items:center;">
            <span>$</span>
            <input id="paga_paciente" class="swal2-input money" style="max-width:200px; text-align:right;" placeholder="0,00">
            <span id="paga_paciente_preview" class="money-preview" style="min-width:120px; text-align:right; font-size:12px; color:#666;"></span>
          </div>
        </div>

        <!-- FONO / PSICO -->
        <div class="grupo-bloque azul">
          <h4>FONOAUDIOLOGÍA</h4>
          <div class="grid-2">
            <div class="subcol">
              <h5>Coordinadores (monto por módulo)</h5>
              ${renderLista(FONO.coordinadores, 'fono_coord')}
            </div>
            <div class="subcol">
              <h5>Profesionales (monto por módulo)</h5>
              ${renderLista(FONO.profesionales, 'fono_prof')}
            </div>
          </div>
        </div>

        <div class="grupo-bloque azul">
          <h4>PSICOLOGÍA</h4>
          <div class="grid-2">
            <div class="subcol">
              <h5>Coordinadores (monto por módulo)</h5>
              ${renderLista(PSICO.coordinadores, 'psico_coord')}
            </div>
            <div class="subcol">
              <h5>Profesionales (monto por módulo)</h5>
              ${renderLista(PSICO.profesionales, 'psico_prof')}
            </div>
          </div>
        </div>

        <!-- ÁREAS EXTERNAS (se mantiene) -->
        <div class="grupo-bloque verde">
          <h4>ÁREAS EXTERNAS</h4>
          <div style="display:grid; grid-template-columns: 1fr 120px 1fr; gap:10px; align-items:end;">
            <div class="money-wrap">
              <label>Paciente (ARS)</label>
              <div style="display:flex; gap:6px; align-items:center;">
                <span>$</span>
                <input id="ae_paciente" class="money" placeholder="0,00" style="width:120px; text-align:right;">
                <span class="money-preview" style="min-width:110px; text-align:right; font-size:12px; color:#666;"></span>
              </div>
            </div>
            <div>
              <label>%</label>
              <input id="ae_porcentaje" class="swal2-input" placeholder="Ej: 30" style="width:120px;">
            </div>
            <div>
              <label>Profesional (calculado)</label>
              <input id="ae_profesional" class="swal2-input" readonly>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      didOpen: () => {
        // Máscaras $ARS
        attachMoneyMask(document);
        // Cálculo áreas externas
        calcProfesional('ae_paciente', 'ae_porcentaje', 'ae_profesional');
      },
      preConfirm: () => {
        const numero = parseInt(document.getElementById('modulo_numero').value, 10);
        if (isNaN(numero)) {
          Swal.showValidationMessage('⚠️ El número del módulo es obligatorio');
          return false;
        }

        // Paga paciente
        const pagaPaciente = getNumberOrZero('paga_paciente');

        // Recolectar asignaciones (area, rol, userId, nombre, monto)
        const collectAsignaciones = (prefix, area, rol) => {
          const rows = [];
          document.querySelectorAll(`[id^="${prefix}_chk_"]`).forEach(chk => {
            if (!chk.checked) return;
            const userId = chk.getAttribute('data-userid');
            const nombre = chk.getAttribute('data-nombre') || '';
            const montoInputId = `${prefix}_monto_${userId}`;
            const monto = getNumberOrZero(montoInputId);
            rows.push({ area, rol, userId, nombre, monto });
          });
          return rows;
        };

        const asignaciones = [
          ...collectAsignaciones('fono_coord', 'Fonoaudiología', 'coordinador'),
          ...collectAsignaciones('fono_prof',  'Fonoaudiología', 'profesional'),
          ...collectAsignaciones('psico_coord','Psicología',     'coordinador'),
          ...collectAsignaciones('psico_prof', 'Psicología',     'profesional'),
        ];

        // Áreas externas
        const areasExternas = {
          paciente:    getNumberOrZero('ae_paciente'),
          porcentaje:  getNumberOrZero('ae_porcentaje'),
          profesional: getNumberOrZero('ae_profesional')
        };

        return {
          numero,
          pagaPaciente,
          asignaciones,    // detalle por persona con su monto en $ARS
          areasExternas    // igual que antes
        };
      }
    });

    if (!formValues) return;

    try {
      const res = await apiFetch(`/modulos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues)
      });
      const data = await res.json();

      if (res.ok) {
        Swal.fire('Éxito', 'Módulo guardado correctamente', 'success');
        cargarListadoModulos();
      } else {
        Swal.fire('Error', data.error || 'No se pudo guardar', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Ocurrió un error al guardar', 'error');
    }
  });
}


  // ---------- Render ficha (detalle de un módulo) ----------
  function mostrarFichaModulo(modulo) {
    contenedorFicha.innerHTML = `
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
          <tbody>
            <tr>
              <td>${modulo.numero}</td>
              <td>01-2027</td>
              <td>$${(modulo.valoresModulo?.paciente ?? 0).toLocaleString()}</td>
              <td>$${(modulo.areasExternas?.profesional ?? 0).toLocaleString()}</td>
              <td>$${(modulo.habilidadesSociales?.profesional ?? 0).toLocaleString()}</td>
              <td>Activo</td>
              <td>
                <button class="btn-modificar" onclick="modificarModulo(${modulo.numero})">✏️</button>
                <button class="btn-borrar"    onclick="borrarModulo(${modulo.numero})">🗑️</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
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





