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

  // 🔹 Armar listado de módulos asignados
  const modulosHTML =
    Array.isArray(p.modulosAsignados) && p.modulosAsignados.length > 0
      ? `<ul style="margin:5px 0; padding-left:20px;">
        ${p.modulosAsignados
        .map((m) => `<li>${m.nombre} - Cantidad: ${m.cantidad}</li>`)
        .join("")}
      </ul>`
      : "Sin módulos asignados";

  container.innerHTML = `
    <div class="ficha-paciente">
      <div class="ficha-header">
        <h3>${p.nombre ?? "Sin nombre"} - DNI ${p.dni ?? "Sin DNI"}</h3>
      </div>

      <div class="ficha-row">
        <div class="ficha-bloque ficha-simple">
          <p><strong>Abonado:</strong> ${p.abonado ?? "sin datos"}</p>
          <p><strong>Estado:</strong> ${p.estado ?? "sin datos"}</p>
          ${p.estado === "Baja"
      ? `
            <p><strong>Fecha de baja:</strong> ${p.fechaBaja ?? "-"}</p>
            <p><strong>Motivo de baja:</strong> ${p.motivoBaja ?? "-"}</p>
          `
      : ""
    }
        </div>

        <div class="ficha-bloque">
          <h4>Datos:</h4>
          <p><strong>Fecha de nacimiento:</strong> ${p.fechaNacimiento ?? "sin datos"
    }</p>
          <p><strong>Colegio:</strong> ${p.colegio ?? "sin datos"}</p>
          <p><strong>Curso / Nivel:</strong> ${p.curso ?? "sin datos"}</p>
        </div>
      </div>

     <div class="ficha-bloque">
  <h4>Familia:</h4>
  <p><strong>Padre o Madre:</strong> ${p.madrePadre ?? "sin datos"} ${p.whatsappMadrePadre ? `📱 ${p.whatsappMadrePadre}` : ""
    }</p>
  <p><strong>Tutor/a:</strong> ${p.tutor?.nombre ?? "sin datos"} ${p.tutor?.whatsapp ? `📱 ${p.tutor.whatsapp}` : ""
    }</p>
  <p><strong>Mail:</strong> ${p.mail ?? "sin datos"}</p>
</div>


      <div class="ficha-bloque">
        <h4>Obra Social:</h4>
        <p><strong>Prestador:</strong> ${p.prestador ?? "sin datos"}</p>
        <p><strong>Credencial:</strong> ${p.credencial ?? "sin datos"}</p>
        <p><strong>Tipo:</strong> ${p.tipo ?? "sin datos"}</p>
      </div>

      <div class="ficha-bloque">
        <h4>Plan y Áreas:</h4>
        <p><strong>Módulos asignados:</strong></p>
        ${modulosHTML}
        <p><strong>Áreas asignadas:</strong> ${Array.isArray(p.areas) && p.areas.length > 0
      ? p.areas.join(", ")
      : "Sin áreas asignadas"
    }</p>
      </div>

      <div class="ficha-acciones">
        <button onclick="modificarPaciente('${p.dni
    }')" class="btn-modificar">✏️ Modificar</button>
        <button onclick="verDiagnosticos('${p.dni
    }')" class="btn-secundario">Diagnósticos</button>
        <button onclick="verDocumentos('${p.dni
    }')" class="btn-secundario">Documentos</button>
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
              <input id="dniInput" class="swal2-input" value="${p.dni ?? ""}">
              <label>Fecha de nacimiento:</label>
              <input id="fecha" class="swal2-input" type="date" value="${p.fechaNacimiento ?? ""}">
              <label>Colegio:</label>
              <input id="colegio" class="swal2-input" value="${p.colegio ?? ""}">
              <label>Curso / Nivel:</label>
              <input id="curso" class="swal2-input" value="${p.curso ?? ""}">
              <label>Nombre del Tutor/a:</label>
              <input id="tutorNombre" class="swal2-input" value="${p.tutor?.nombre ?? ""}">
              <label>Whatsapp del Tutor/a:</label>
              <input id="tutorWhatsapp" class="swal2-input" value="${p.tutor?.whatsapp ?? ""}">
              <label>Padre o Madre:</label>
              <input id="madrePadre" class="swal2-input" value="${p.madrePadre ?? ""}">
              <label>Whatsapp Padre o Madre:</label>
              <input id="whatsappMadrePadre" class="swal2-input" value="${p.whatsappMadrePadre ?? ""}">
              <label>Mail:</label>
              <input id="mail" class="swal2-input" value="${p.mail ?? ""}">
              <label>Abonado:</label>
              <select id="abonado" class="swal2-select">
                <option ${p.abonado === "Obra Social" ? "selected" : ""}>Obra Social</option>
                <option ${p.abonado === "Particular" ? "selected" : ""}>Particular</option>
                <option ${p.abonado === "Obra Social + Particular" ? "selected" : ""}>Obra Social + Particular</option>
              </select>
              <label>Estado:</label>
              <select id="estado" class="swal2-select">
                <option ${p.estado === "Alta" ? "selected" : ""}>Alta</option>
                <option ${p.estado === "Baja" ? "selected" : ""}>Baja</option>
                <option ${p.estado === "En espera" ? "selected" : ""}>En espera</option>
              </select>
            </div>

           

              <div class="plan-titulo">Plan seleccionado para el paciente:</div>
              <textarea id="planPaciente" rows="4"
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

        let planTexto = document.getElementById("planPaciente")?.value.trim() || "";
        if (modulosAsignados.length > 0) {
          const resumen = modulosAsignados.map(m => `${m.nombre} (${m.cantidad})`).join(", ");
          planTexto += (planTexto ? "\n" : "") + `Módulos asignados: ${resumen}`;
        }

        return {
          nombre: document.getElementById("nombre")?.value,
          dni: document.getElementById("dniInput")?.value,
          fechaNacimiento: document.getElementById("fecha")?.value,
          colegio: document.getElementById("colegio")?.value,
          curso: document.getElementById("curso")?.value,
          tutor: {
            nombre: document.getElementById("tutorNombre")?.value,
            whatsapp: document.getElementById("tutorWhatsapp")?.value
          },
          madrePadre: document.getElementById("madrePadre")?.value,
          whatsappMadrePadre: document.getElementById("whatsappMadrePadre")?.value,
          mail: document.getElementById("mail")?.value,
          abonado: document.getElementById("abonado")?.value,
          estado: document.getElementById("estado")?.value,
          areas: [...document.querySelectorAll(".areas-box input:checked")].map(e => e.value),
          planPaciente: planTexto,
          modulosAsignados
        };
      }
    });

    if (!isConfirmed) return;

    await fetch(`${API_URL}/${dni}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    Swal.fire("✅ Cambios guardados", "", "success");
    renderFichaPaciente({ ...p, ...data, nombre: data.nombre, dni: data.dni });
    document.getElementById("fichaPacienteContainer").innerHTML = "";
    document.getElementById("busquedaInput").value = "";
  } catch (err) {
    console.error(err);
    Swal.fire("❌ Error al cargar paciente", "", "error");
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

            <label>Nombre del Tutor/a:</label>
            <input id="tutorNombre" class="swal2-input">

            <label>Whatsapp del Tutor/a:</label>
            <input id="tutorWhatsapp" class="swal2-input">

            <!-- 🔹 Madre/Padre -->
            <label>Madre o Padre:</label>
            <input id="madrePadre" class="swal2-input">

            <label>Whatsapp Madre o Padre:</label>
            <input id="whatsappMadrePadre" class="swal2-input">

            <label>Mail:</label>
            <input id="mail" class="swal2-input" type="email">

            <label>Abonado:</label>
            <select id="abonado" class="swal2-select">
              <option>Obra Social</option>
              <option selected>Particular</option>
              <option>Obra Social + Particular</option>
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
      // Mostrar/ocultar extra de Obra Social según selección
      const abonadoSelect = document.getElementById("abonado");
      const obraSocialExtra = document.getElementById("obraSocialExtra");
      const toggleObraSocial = () => {
        const v = abonadoSelect.value;
        obraSocialExtra.style.display =
          v === "Obra Social" || v === "Obra Social + Particular" ? "block" : "none";
      };
      abonadoSelect.addEventListener("change", toggleObraSocial);
      toggleObraSocial(); // estado inicial

      // 🔹 Poblar select de Áreas y Profesionales desde la API
      const areaSel = document.getElementById("areaSeleccionada");
      const profSel = document.getElementById("profesionalSeleccionado");

      // Utilidades de carga
      const setOptions = (selectEl, items, mapFn, emptyText) => {
        if (!Array.isArray(items) || items.length === 0) {
          selectEl.innerHTML = `<option value="">${emptyText}</option>`;
          return;
        }
        const opts = [`<option value="">-- Seleccionar --</option>`]
          .concat(items.map(mapFn));
        selectEl.innerHTML = opts.join("");
      };

      try {
        // Ajustá las rutas si tus endpoints difieren
        const [resAreas, resProfs] = await Promise.all([
          fetch(`${API_URL.replace("/pacientes", "/areas")}`),
          fetch(`${API_URL.replace("/pacientes", "/usuarios")}`)
        ]);

        const areas = resAreas.ok ? await resAreas.json() : [];
        const profesionales = resProfs.ok ? await resProfs.json() : [];

        setOptions(
          areaSel,
          areas,
          (a) => `<option value="${a._id}">${a.nombre}</option>`,
          "No disponible"
        );

        setOptions(
          profSel,
          profesionales,
          (p) => `<option value="${p._id}">${p.nombre}</option>`,
          "No disponible"
        );
      } catch (e) {
        // Si algo falla, mostrar "No disponible"
        areaSel.innerHTML = `<option value="">No disponible</option>`;
        profSel.innerHTML = `<option value="">No disponible</option>`;
        console.warn("No se pudieron cargar áreas/profesionales:", e);
      }
    },

    preConfirm: () => {
      const nombre = document.getElementById("nombre").value.trim();
      const dni = document.getElementById("dni").value.trim();
      const fechaNacimiento = document.getElementById("fecha").value;
      const tutorNombre = document.getElementById("tutorNombre").value.trim();
      const tutorWhatsapp = document.getElementById("tutorWhatsapp").value.trim();
      const madrePadre = document.getElementById("madrePadre").value.trim();
      const whatsappMadrePadre = document.getElementById("whatsappMadrePadre").value.trim();
      const mail = document.getElementById("mail").value.trim();

      const dniRegex = /^\d{7,8}$/;
      const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const wspRegex = /^\d{10,15}$/;

      if (!tutorNombre || !tutorWhatsapp) {
        Swal.showValidationMessage("⚠️ El nombre y Whatsapp del tutor/a son obligatorios.");
        return false;
      }
      if (!wspRegex.test(tutorWhatsapp)) {
        Swal.showValidationMessage("⚠️ El Whatsapp del tutor/a no es válido.");
        return false;
      }
      if (!fechaNacimiento || !dni || !tutorNombre || !tutorWhatsapp || !mail) {
        Swal.showValidationMessage("⚠️ Todos los campos obligatorios deben estar completos.");
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

      // Extra: obra social
      let prestador = "";
      let credencial = "";
      let tipo = "";
      const abonadoVal = document.getElementById("abonado").value;
      if (abonadoVal === "Obra Social" || abonadoVal === "Obra Social + Particular") {
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
        tutor: { nombre: tutorNombre, whatsapp: tutorWhatsapp },
        madrePadre,
        whatsappMadrePadre,
        mail,
        abonado: abonadoVal,
        estado: document.getElementById("estado").value,
        prestador,
        credencial,
        tipo,
        areaSeleccionada,           // <-- id de área o null
        profesionalSeleccionado     // <-- id de profesional o null
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
