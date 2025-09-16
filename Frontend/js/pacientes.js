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
function renderFichaPaciente(p) {
  const container = document.getElementById("fichaPacienteContainer");

  // 🔹 Módulos
  const modulosHTML =
    Array.isArray(p.modulosAsignados) && p.modulosAsignados.length > 0
      ? `<ul style="margin:5px 0; padding-left:20px;">
          ${p.modulosAsignados.map(m => `<li>${m.nombre ?? "Módulo"} - Cantidad: ${m.cantidad ?? "-"}</li>`).join("")}
        </ul>`
      : "Sin módulos asignados";

  // 🔹 Responsables (nuevo modelo, permite repetir relación)
  const cap = (s) => (typeof s === "string" && s ? s[0].toUpperCase() + s.slice(1) : s);
  const responsablesHTML = (() => {
    if (Array.isArray(p.responsables) && p.responsables.length) {
      return `
        <ul style="margin:5px 0; padding-left:20px;">
          ${p.responsables.slice(0,3).map(r => {
            const rel = cap(r.relacion ?? "");
            const nom = r.nombre ?? "sin nombre";
            const wsp = r.whatsapp ? ` 📱 ${r.whatsapp}` : "";
            return `<li><strong>${rel}:</strong> ${nom}${wsp}</li>`;
          }).join("")}
        </ul>`;
    }
    // 🔁 Legacy fallback
    const tutorLinea = (p.tutor?.nombre || p.tutor?.whatsapp)
      ? `<li><strong>Tutor/a:</strong> ${p.tutor?.nombre ?? "sin datos"}${p.tutor?.whatsapp ? ` 📱 ${p.tutor.whatsapp}` : ""}</li>`
      : "";
    const mpLinea = (p.madrePadre || p.whatsappMadrePadre)
      ? `<li><strong>Padre o Madre:</strong> ${p.madrePadre ?? "sin datos"}${p.whatsappMadrePadre ? ` 📱 ${p.whatsappMadrePadre}` : ""}</li>`
      : "";
    if (!tutorLinea && !mpLinea) return "Sin responsables cargados";
    return `<ul style="margin:5px 0; padding-left:20px;">${mpLinea}${tutorLinea}</ul>`;
  })();

  // 🔹 Áreas
  const areasHTML =
    Array.isArray(p.areas) && p.areas.length > 0
      ? p.areas.join(", ")
      : "Sin áreas asignadas";

  // 🔹 Estado + info de baja
  const estadoBloque =
    `<p><strong>Estado:</strong> ${p.estado ?? "sin datos"}</p>` +
    (p.estado === "Baja"
      ? `
        <p><strong>Fecha de baja:</strong> ${p.fechaBaja ?? "-"}</p>
        <p><strong>Motivo de baja:</strong> ${p.motivoBaja ?? "-"}</p>`
      : "");

  container.innerHTML = `
    <div class="ficha-paciente">
      <div class="ficha-header">
        <h3>${p.nombre ?? "Sin nombre"} - DNI ${p.dni ?? "Sin DNI"}</h3>
      </div>

      <div class="ficha-row">
        <div class="ficha-bloque ficha-simple">
          <p><strong>Condición de Pago:</strong> ${p.condicionDePago ?? "sin datos"}</p>
          ${estadoBloque}
        </div>

        <div class="ficha-bloque">
          <h4>Datos:</h4>
          <p><strong>Fecha de nacimiento:</strong> ${p.fechaNacimiento ?? "sin datos"}</p>
          <p><strong>Colegio:</strong> ${p.colegio ?? "sin datos"}</p>
          <p><strong>Curso / Nivel:</strong> ${p.curso ?? "sin datos"}</p>
          <p><strong>Mail:</strong> ${p.mail ?? "sin datos"}</p>
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
        <h4>Plan y Áreas</h4>
        <p><strong>Módulos asignados:</strong></p>
        ${modulosHTML}
        <p><strong>Áreas asignadas:</strong> ${areasHTML}</p>
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

    // Catálogos
    let modulos = [], areas = [], profesionales = [];
    try {
      const [resMod, resAreas, resProfs] = await Promise.all([
        fetch(`${API_URL.replace("/pacientes", "/modulos")}`),
        fetch(`${API_URL.replace("/pacientes", "/areas")}`),
        fetch(`${API_URL.replace("/pacientes", "/usuarios")}`) // si requiere auth, agregala
      ]);
      if (resMod.ok)   modulos       = await resMod.json();
      if (resAreas.ok) areas         = await resAreas.json();
      if (resProfs.ok) profesionales = await resProfs.json();
    } catch (_) { /* fail-safe */ }

    // Opciones HTML (simple y a prueba de 401)
    const MOD_OPTS  = (modulos?.length ? modulos.map(m => `<option value="${m._id}">Módulo ${m.numero}</option>`).join("") : `<option value="">No disponible</option>`);
    const PROF_OPTS = (profesionales?.length ? profesionales.map(pr => `<option value="${pr._id}">${pr.nombre}</option>`).join("") : `<option value="">No disponible</option>`);
    const AREA_OPTS = (areas?.length ? areas.map(a => `<option value="${a._id}">${a.nombre}</option>`).join("") : `<option value="">No disponible</option>`);

    // Template de módulo (grid; sin desbordes)
    const renderModuloSelect = (index, modOpts, profOpts, areaOpts) => `
      <div class="modulo-row"
           style="margin-bottom:15px; padding:10px; border:1px solid #ddd; border-radius:6px; overflow:hidden;">
        <div style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:10px; margin-bottom:10px;">
          <div style="min-width:0;">
            <label>Módulo:</label>
            <select class="modulo-select swal2-select" data-index="${index}"
                    style="width:100%; max-width:100%; box-sizing:border-box; margin:0;">
              <option value="">-- Seleccionar --</option>
              ${modOpts}
            </select>
          </div>
          <div style="min-width:0;">
            <label>Cantidad:</label>
            <select class="cantidad-select swal2-select" data-index="${index}"
                    style="width:100%; max-width:100%; box-sizing:border-box; margin:0;">
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

        <div class="profesionales-container" data-index="${index}" style="margin-top:10px;">
          <h5 style="margin:8px 0;">Profesionales:</h5>

          <div class="profesional-row"
               style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px;">
            <select class="profesional-select swal2-select"
                    style="width:100%; max-width:100%; box-sizing:border-box; margin:0;">
              <option value="">-- Seleccionar profesional --</option>
              ${profOpts}
            </select>
            <select class="area-select swal2-select"
                    style="width:100%; max-width:100%; box-sizing:border-box; margin:0;">
              <option value="">-- Área --</option>
              ${areaOpts}
            </select>
          </div>
        </div>

        <button type="button" class="btnAgregarProfesional" data-index="${index}"
          style="margin-top:8px; padding:4px 10px; border:1px solid #ccc; border-radius:5px; background:#eee; cursor:pointer;">
          ➕ Agregar profesional
        </button>
      </div>
    `;

    // Armar responsables iniciales desde p.responsables o legacy
    const responsablesIniciales = Array.isArray(p.responsables) && p.responsables.length
      ? p.responsables.slice(0, 3)
      : (() => {
          const arr = [];
          if (p.tutor?.nombre && p.tutor?.whatsapp) {
            arr.push({ relacion: 'tutor', nombre: p.tutor.nombre, whatsapp: p.tutor.whatsapp });
          }
          if (p.madrePadre) {
            arr.push({
              relacion: /madre/i.test(p.madrePadre) ? 'madre' : 'padre',
              nombre: String(p.madrePadre).replace(/^(madre|padre)\s*:\s*/i, '').trim(),
              whatsapp: p.whatsappMadrePadre || ''
            });
          }
          return arr.slice(0, 3);
        })();

    // Modal
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
              <label>Curso / Nivel:</label>
              <input id="curso" class="swal2-input" value="${p.curso ?? ""}">

              <!-- 🔹 Responsables (padre/madre/tutor) -->
              <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
                <label style="font-weight:bold; margin:0;">Responsables</label>
                <button id="btnAgregarResponsable" type="button" class="swal2-confirm swal2-styled" style="padding:2px 8px; font-size:12px;">+ Agregar</button>
              </div>
              <small style="display:block; margin-bottom:6px; color:#666;">Máximo 3. <b>Se puede repetir</b> la relación.</small>
              <div id="responsablesContainer"></div>

              <label>Mail:</label>
              <input id="mail" class="swal2-input" value="${p.mail ?? ""}">

              <label>Condición de Pago:</label>
              <select id="condicionDePago" class="swal2-select">
                <option value="Obra Social" ${p.condicionDePago === "Obra Social" ? "selected" : ""}>Obra Social</option>
                <option value="Particular" ${p.condicionDePago === "Particular" || !p.condicionDePago ? "selected" : ""}>Particular</option>
                <option value="Obra Social + Particular" ${p.condicionDePago === "Obra Social + Particular" ? "selected" : ""}>Obra Social + Particular</option>
              </select>

              <!-- 🔹 Extra Obra Social -->
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
            </div>

            <div class="columna" style="margin-top: 20px;">
              <div class="plan-titulo">Plan seleccionado para el paciente:</div>
              <textarea id="planPaciente" rows="8"
                style="width:100%; border:1px solid #ccc; border-radius:5px; margin-top:5px; padding:10px;">${p.planPaciente ?? ""}</textarea>
            </div>
          </div>

          <hr>
          <h4 style="margin-top:15px;">Módulos asignados</h4>
          <div id="modulosContainer">
            ${renderModuloSelect(0, MOD_OPTS, PROF_OPTS, AREA_OPTS)}
          </div>
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

        // Responsables dinámicos (permitir repetir relación)
        const cont = document.getElementById("responsablesContainer");
        const btnAdd = document.getElementById("btnAgregarResponsable");
        const relaciones = ['padre','madre','tutor'];

        const makeRelacionOptions = (sel = '') =>
          ['<option value="">-- Relación --</option>']
            .concat(relaciones.map(r => `<option value="${r}" ${r===sel?'selected':''}>${r[0].toUpperCase()+r.slice(1)}</option>`))
            .join('');

        let idx = 0;
        const addRow = (preset = { relacion:'tutor', nombre:'', whatsapp:'' }) => {
          const filas = cont.querySelectorAll('.responsable-row').length;
          if (filas >= 3) return;

          const rowId = `resp-${idx++}`;
          const html = `
            <div class="responsable-row" id="${rowId}" style="border:1px solid #ddd; border-radius:8px; padding:8px; margin:8px 0;">
              <div style="display:grid; grid-template-columns: 1fr 2fr 2fr auto; gap:6px; align-items:center;">
                <select class="swal2-select resp-relacion">${makeRelacionOptions(preset.relacion || '')}</select>
                <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}">
                <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}">
                <button type="button" class="swal2-cancel swal2-styled btn-remove" title="Quitar" style="padding:2px 8px;">✕</button>
              </div>
            </div>`;
          cont.insertAdjacentHTML('beforeend', html);
          cont.lastElementChild.querySelector('.btn-remove').addEventListener('click', () => {
            cont.removeChild(document.getElementById(rowId));
          });
        };

        // Precargar responsables existentes (o legacy)
        if (responsablesIniciales.length) {
          responsablesIniciales.forEach(r => addRow(r));
        } else {
          addRow({ relacion:'tutor' });
        }
        btnAdd.addEventListener('click', () => addRow());

        // Módulos UI
        document.getElementById("btnAgregarModulo").addEventListener("click", () => {
          const container = document.getElementById("modulosContainer");
          const index = container.querySelectorAll(".modulo-row").length;
          container.insertAdjacentHTML("beforeend", renderModuloSelect(index, MOD_OPTS, PROF_OPTS, AREA_OPTS));
          attachAgregarProfesional(index, PROF_OPTS, AREA_OPTS);
        });
        attachAgregarProfesional(0, PROF_OPTS, AREA_OPTS);
      },
      width: "90%",
      customClass: { popup: "swal-scrollable-form" },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        // Validaciones básicas
        const wspRegex = /^\d{10,15}$/;
        const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const nombre = document.getElementById("nombre")?.value.trim();
        const fechaNacimiento = document.getElementById("fecha")?.value;
        const mail = document.getElementById("mail")?.value.trim();

        if (!nombre || !fechaNacimiento || !mail) {
          Swal.showValidationMessage("⚠️ Completá los campos obligatorios (Nombre, Fecha, Mail).");
          return false;
        }
        if (!mailRegex.test(mail)) {
          Swal.showValidationMessage("⚠️ Mail inválido.");
          return false;
        }

        // Responsables (permitir repetidos)
        const filas = Array.from(document.querySelectorAll('#responsablesContainer .responsable-row'));
        if (filas.length < 1 || filas.length > 3) {
          Swal.showValidationMessage("⚠️ Debe haber entre 1 y 3 responsables.");
          return false;
        }
        const responsables = [];
        for (const row of filas) {
          const relacion = row.querySelector('.resp-relacion')?.value;
          const nombreR = row.querySelector('.resp-nombre')?.value.trim();
          const whatsapp = row.querySelector('.resp-whatsapp')?.value.trim();
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

        // Recolectar módulos + profesionales
        const modulosAsignados = [];
        document.querySelectorAll(".modulo-row").forEach((row) => {
          const moduloId = row.querySelector(".modulo-select")?.value;
          const cantidad = parseFloat(row.querySelector(".cantidad-select")?.value);
          if (moduloId && cantidad > 0) {
            const modSel = modulos.find(m => m._id === moduloId);
            const profesionalesAsignados = [];
            row.querySelectorAll(".profesional-row").forEach(profRow => {
              const profesionalId = profRow.querySelector(".profesional-select")?.value;
              const areaId = profRow.querySelector(".area-select")?.value;
              if (profesionalId && areaId) profesionalesAsignados.push({ profesionalId, areaId });
            });
            modulosAsignados.push({
              moduloId,
              nombre: modSel ? `Módulo ${modSel.numero}` : "",
              cantidad,
              profesionales: profesionalesAsignados
            });
          }
        });

        // Plan
        let planTexto = document.getElementById("planPaciente")?.value.trim() || "";
        if (modulosAsignados.length > 0) {
          const resumen = modulosAsignados.map(m => `${m.nombre} (${m.cantidad})`).join(", ");
          planTexto += (planTexto ? "\n" : "") + `Módulos asignados: ${resumen}`;
        }

        // Obra social segun condición de pago
        const condicionDePagoVal = document.getElementById("condicionDePago").value;
        let prestador = "", credencial = "", tipo = "";
        if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
          prestador = document.getElementById("prestador")?.value.trim() || "";
          credencial = document.getElementById("credencial")?.value.trim() || "";
          tipo = document.getElementById("tipo")?.value.trim() || "";
        }

        return {
          // básicos
          nombre,
          fechaNacimiento,
          colegio: document.getElementById("colegio")?.value,
          curso: document.getElementById("curso")?.value,

          // nuevo modelo
          responsables,                // ✅ permite repeticiones
          mail,
          condicionDePago: condicionDePagoVal, // ✅ unificado
          estado: document.getElementById("estado")?.value,

          // obra social
          prestador, credencial, tipo,

          // plan y módulos
          planPaciente: planTexto,
          modulosAsignados
        };
      }
    });

    if (!isConfirmed) return;

    // PUT (no intentes cambiar DNI acá; backend lo ignora)
    const putRes = await fetch(`${API_URL}/${dni}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!putRes.ok) {
      let msg = "Error al guardar";
      try {
        const j = await putRes.json();
        msg = j?.error || msg;
      } catch {}
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

  // Agregar otro par Profesional/Área dentro del módulo (usa HTML de opciones pasado por parámetro)
  function attachAgregarProfesional(index, PROF_OPTS_HTML, AREA_OPTS_HTML) {
    const btn = document.querySelector(`.btnAgregarProfesional[data-index="${index}"]`);
    const container = document.querySelector(`.profesionales-container[data-index="${index}"]`);
    if (!btn || !container) return;

    const buildRow = () => `
      <div class="profesional-row"
           style="margin-top:5px; display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px;">
        <select class="profesional-select swal2-select"
                style="width:100%; max-width:100%; box-sizing:border-box; margin:0;">
          <option value="">-- Seleccionar profesional --</option>
          ${PROF_OPTS_HTML}
        </select>
        <select class="area-select swal2-select"
                style="width:100%; max-width:100%; box-sizing:border-box; margin:0;">
          <option value="">-- Área --</option>
          ${AREA_OPTS_HTML}
        </select>
      </div>`;

    btn.addEventListener("click", () => {
      container.insertAdjacentHTML("beforeend", buildRow());
    });
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

            <label>Curso / Nivel:</label>
            <input id="curso" class="swal2-input">

            <!-- 🔹 Responsables (padre/madre/tutor) -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px;">
              <label style="font-weight:bold; margin:0;">Responsables</label>
              <button id="btnAgregarResponsable" type="button" class="swal2-confirm swal2-styled" style="padding:2px 8px; font-size:12px;">+ Agregar</button>
            </div>
            <small style="display:block; margin-bottom:6px; color:#666;">Máximo 3. <b>Se puede repetir</b> la relación.</small>

            <div id="responsablesContainer"></div>

            <label>Mail:</label>
            <input id="mail" class="swal2-input" type="email">

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

      // --- Carga de Áreas y Profesionales
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

      try {
        const [resAreas, resProfs] = await Promise.all([
          fetch(`${API_URL.replace("/pacientes", "/areas")}`),
          fetch(`${API_URL.replace("/pacientes", "/usuarios")}`)
        ]);
        const areas = resAreas.ok ? await resAreas.json() : [];
        const profesionales = resProfs.ok ? await resProfs.json() : [];

        setOptions(areaSel, areas, (a) => `<option value="${a._id}">${a.nombre}</option>`, "No disponible");
        setOptions(profSel, profesionales, (p) => `<option value="${p._id}">${p.nombre}</option>`, "No disponible");
      } catch (e) {
        areaSel.innerHTML = `<option value="">No disponible</option>`;
        profSel.innerHTML = `<option value="">No disponible</option>`;
        console.warn("No se pudieron cargar áreas/profesionales:", e);
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
            <div style="display:grid; grid-template-columns: 1fr 2fr 2fr auto; gap:6px; align-items:center;">
              <select class="swal2-select resp-relacion">${makeRelacionOptions(preset.relacion || '')}</select>
              <input class="swal2-input resp-nombre" placeholder="Nombre" value="${preset.nombre || ''}">
              <input class="swal2-input resp-whatsapp" placeholder="Whatsapp (solo dígitos)" value="${preset.whatsapp || ''}">
              <button type="button" class="swal2-cancel swal2-styled btn-remove" title="Quitar" style="padding:2px 8px;">✕</button>
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

      // Arranca con 1 responsable por defecto (tutor)
      addRow({relacion:'tutor'});
    },

    preConfirm: () => {
      const nombre = document.getElementById("nombre").value.trim();
      const dni = document.getElementById("dni").value.trim();
      const fechaNacimiento = document.getElementById("fecha").value;
      const mail = document.getElementById("mail").value.trim();

      const dniRegex = /^\d{7,8}$/;
      const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const wspRegex = /^\d{10,15}$/;

      if (!nombre || !dni || !fechaNacimiento || !mail) {
        Swal.showValidationMessage("⚠️ Completá los campos obligatorios (Nombre, DNI, Fecha, Mail).");
        return false;
      }
      if (!dniRegex.test(dni)) {
        Swal.showValidationMessage("⚠️ El DNI debe tener entre 7 y 8 dígitos numéricos.");
        return false;
      }
      if (!mailRegex.test(mail)) {
        Swal.showValidationMessage("⚠️ El mail ingresado no es válido.");
        return false;
      }

      // --- Tomar responsables (permitiendo repetir relación)
      const filas = Array.from(document.querySelectorAll('#responsablesContainer .responsable-row'));
      if (filas.length < 1) {
        Swal.showValidationMessage("⚠️ Agregá al menos un responsable.");
        return false;
      }
      if (filas.length > 3) {
        Swal.showValidationMessage("⚠️ Máximo 3 responsables.");
        return false;
      }

      const responsables = [];
      for (const row of filas) {
        const relacion = row.querySelector('.resp-relacion').value;
        const nombreR = row.querySelector('.resp-nombre').value.trim();
        const whatsapp = row.querySelector('.resp-whatsapp').value.trim();

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

      // Extra: obra social
      let prestador = "", credencial = "", tipo = "";
      const condicionDePagoVal = document.getElementById("condicionDePago").value;
      if (condicionDePagoVal === "Obra Social" || condicionDePagoVal === "Obra Social + Particular") {
        prestador = document.getElementById("prestador").value.trim();
        credencial = document.getElementById("credencial").value.trim();
        tipo = document.getElementById("tipo").value.trim();
      }

      // Selecciones de DB
      const areaSeleccionada = document.getElementById("areaSeleccionada").value || null;
      const profesionalSeleccionado = document.getElementById("profesionalSeleccionado").value || null;

      return {
        nombre,
        dni,
        fechaNacimiento,
        colegio: document.getElementById("colegio").value.trim(),
        curso: document.getElementById("curso").value.trim(),

        responsables, // ✅ puede tener relaciones repetidas

        mail,
        condicionDePago: condicionDePagoVal,   // ✅ unificado con el schema
        estado: document.getElementById("estado").value,
        prestador,
        credencial,
        tipo,
        areaSeleccionada,
        profesionalSeleccionado
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
