// backend/controllers/usuariosControllers.js
const Usuario = require("../models/usuarios");
const bcrypt  = require("bcrypt");
const jwt     = require("jsonwebtoken");

// === R2 (Cloudflare) ===
const { uploadBuffer, deleteKey, buckets, toWorkerViewUrl } = require("../lib/storageR2");

const JWT_SECRET = process.env.JWT_SECRET || "supersecreto";

/* ------------------------ Helpers ------------------------ */
function parseMaybeJSON(v) {
  if (v == null) return v;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

// Junta archivos sin importar si vino req.file, req.files[], "documentos", "archivo", etc.
function collectFilesFromReq(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  return files;
}

// Sube archivos a R2 y devuelve objetos {tipo, nombre, url, publicUrl, fechaSubida}
async function uploadUserDocsR2(files, ownerId) {
  const out = [];
  for (const file of files) {
    const key = `${ownerId}/${Date.now()}_${file.originalname}`;
    const internalUrl = await uploadBuffer({
      bucket: buckets.usuarios,
      key,
      buffer: file.buffer,
      contentType: file.mimetype
    });
    out.push({
      tipo: "general",
      nombre: file.originalname,
      url: internalUrl,                        // interno
      publicUrl: toWorkerViewUrl(internalUrl), // público para frontend
      fechaSubida: new Date()
    });
  }
  return out;
}

// Normaliza body cuando viene por multipart/form-data o JSON
function normalizeBody(body) {
  body.areasProfesional = parseMaybeJSON(body.areasProfesional);
  body.areasCoordinadas = parseMaybeJSON(body.areasCoordinadas);
  if (body.areasProfesional == null || body.areasProfesional === "") body.areasProfesional = [];
  if (body.areasCoordinadas == null || body.areasCoordinadas === "") body.areasCoordinadas = [];

  [
    "jurisdiccion","registroNacionalDePrestadores",
    "salarioAcuerdo","salarioAcuerdoObs",
    "fijoAcuerdo","fijoAcuerdoObs",
    "banco","cbu","numeroCuenta","numeroSucursal",
    "alias","nombreFiguraExtracto","tipoCuenta",
    "seguroMalaPraxis","pasanteNivel",
    "usuario","cuit","matricula","domicilio",
    "whatsapp","mail","dni","nombreApellido",
    "rol"
  ].forEach(k => {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const val = (body[k] ?? "").toString().trim();
      body[k] = val === "" ? undefined : val;
    }
  });

  if (body.usuario) body.usuario = body.usuario.toLowerCase();
  if (body.mail)    body.mail    = body.mail.toLowerCase();

  // alias front → schema
  if (Object.prototype.hasOwnProperty.call(body, "pasanteNivel")) {
    body.nivelPasante = body.pasanteNivel || undefined;
  }

  return body;
}

// Reglas por rol
function applyRoleCleaning(rol, body, currentDoc = null) {
  // alias defensivo
  if (body.pasanteNivel && !body.nivelPasante) {
    body.nivelPasante = body.pasanteNivel;
  }

  const esProfesional = rol === "Profesional" || rol === "Coordinador y profesional";
  const esCoordinador = rol === "Coordinador de área" || rol === "Coordinador y profesional";
  const esPasante     = rol === "Pasante";

  if (!esProfesional) body.seguroMalaPraxis = undefined;

  if (esPasante) {
    body.areasProfesional = [];
    body.areasCoordinadas = [];
  } else {
    if (!esProfesional) body.areasProfesional = [];
    if (!esCoordinador) body.areasCoordinadas = [];
  }

  // Si NO es pasante, borrar nivel de pasante
  if (!esPasante) body.nivelPasante = undefined;

  if (currentDoc) {
    if (!Array.isArray(body.areasProfesional) && currentDoc.areasProfesional) {
      body.areasProfesional = currentDoc.areasProfesional;
    }
    if (!Array.isArray(body.areasCoordinadas) && currentDoc.areasCoordinadas) {
      body.areasCoordinadas = currentDoc.areasCoordinadas;
    }
  }
}

// Extrae key de URL R2 (bucket usuarios)
function extractUsuariosKeyFromUrl(url) {
  try {
    const pivot = `/${buckets.usuarios}/`;
    const idx = url.indexOf(pivot);
    if (idx === -1) return null;
    return url.substring(idx + pivot.length);
  } catch {
    return null;
  }
}

// Mapear documentos para que siempre expongan publicUrl
function mapDocsForView(docs) {
  return (docs || []).map(d => {
    const plain = d && typeof d.toObject === "function" ? d.toObject() : d || {};
    return {
      ...plain,
      _id: plain._id?.toString?.() || plain._id || plain.id,
      publicUrl: plain.publicUrl || toWorkerViewUrl(plain.url)
    };
  });
}

/* ---------- Helpers extra: áreas con nivel (para exponer al front) ---------- */
const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);

function normAreaEntry(x){
  if (!x) return null;
  if (typeof x === 'string') return { nombre: x.trim(), nivel: '' };
  if (typeof x === 'object'){
    // ⬇️ incluye areaNombre
    const nombre =
      (x.nombre || x.name || x.titulo || x.area || x.areaNombre || '')
      .toString().trim();
    const nivel =
      (x.nivel ?? x.Nivel ?? x.nivelArea ?? x.nivel_area ??
       x.nivelProfesional ?? x.grado ?? x.categoria ?? x.seniority ?? '')
      .toString().trim();
    if (!nombre && !nivel) return null;
    return { nombre, nivel };
  }
  return null;
}


function pairAreasLevels(areas = [], niveles = []) {
  return areas.map((a, i) => {
    const nombre = (typeof a === "string"
      ? a
      : (a?.nombre || a?.name || a?.area || "")
    ).toString().trim();
    const nivel = (niveles[i] ?? a?.nivel ?? a?.nivelProfesional ?? "")
      .toString().trim();
    if (!nombre && !nivel) return null;
    return { nombre, nivel };
  }).filter(Boolean);
}

// Devuelve [{nombre, nivel}] robusto para PROF / COORD
function buildAreasDetalladas(u, tipo = "Profesional") {
  const userLevel = (
    u.nivel ?? u.Nivel ?? u.nivelProfesional ?? u.categoria ?? u.grado ?? u.seniority ?? ""
  ).toString().trim();

  const Akey = (tipo === "Profesional") ? "areasProfesional"   : "areasCoordinadas";
  const Nkey = (tipo === "Profesional") ? "nivelesProfesional" : "nivelesCoordinadas";

  let list = [];

  // 1) Objetos con {nombre/nivel}
  list = list.concat(arr(u[Akey]).map(normAreaEntry).filter(Boolean));

  // 2) Arrays paralelos (si existen)
  if (u[Akey] && u[Nkey]) {
    list = list.concat(pairAreasLevels(arr(u[Akey]), arr(u[Nkey])));
  }

  // 3) Compat y extras
  list = list.concat(arr(u.areas).map(normAreaEntry).filter(Boolean));
  list = list.concat(arr(u.area).map(normAreaEntry).filter(Boolean));
  list = list.concat(arr(u.areaPrincipal).map(normAreaEntry).filter(Boolean));

  // Completar nivel faltante con nivel del usuario
  if (userLevel) list = list.map(a => ({ ...a, nivel: a.nivel || userLevel }));

  // Quitar duplicados simples
  const seen = new Set();
  list = list.filter(a => {
    const k = `${a.nombre}|${a.nivel}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return list;
}

/* ------------------------ Crear ------------------------ */
exports.crearUsuario = async (req, res) => {
  try {
    const { body } = req;
    normalizeBody(body);

    let hashedPassword = body.contrasena;
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(body.contrasena, salt);
    }

    const rolFinal = body.rol;
    applyRoleCleaning(rolFinal, body);

    const nuevo = new Usuario({
      ...body,
      contrasena: hashedPassword,
      documentos: []
    });

    await nuevo.save();

    const files = collectFilesFromReq(req);
    if (files.length > 0) {
      const uploaded = await uploadUserDocsR2(files, nuevo._id);
      nuevo.documentos = uploaded;
      await nuevo.save();
    }

    // salida
    const nuevoObj = nuevo.toObject();
    delete nuevoObj.contrasena;

    return res.status(201).json({
      ...nuevoObj,
      pasanteNivel: nuevoObj.nivelPasante,               // espejo para el front
      documentos: mapDocsForView(nuevoObj.documentos),
      areasProfesionalDetalladas: buildAreasDetalladas(nuevoObj, "Profesional"),
      areasCoordinadasDetalladas: buildAreasDetalladas(nuevoObj, "Coordinador")
    });
  } catch (err) {
    console.error("crearUsuario error:", err?.stack || err);
    return res.status(500).json({ error: "Error al crear usuario", detalles: err.message });
  }
};

/* ------------------------ Listar ------------------------ */
exports.obtenerUsuarios = async (_req, res) => {
  try {
    const lista = await Usuario.find().select("-contrasena").lean();
    const out = lista.map(u => ({
      ...u,
      pasanteNivel: u.nivelPasante, // espejo
      // Para pasantes es útil un nivel “global”
      nivelRol: u.rol === "Pasante" ? (u.nivelPasante || "") : "",
      documentos: mapDocsForView(u.documentos),
      areasProfesionalDetalladas: buildAreasDetalladas(u, "Profesional"),
      areasCoordinadasDetalladas: buildAreasDetalladas(u, "Coordinador")
    }));
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

/* ------------------------ Obtener por ID ------------------------ */
exports.getUsuarioPorId = async (req, res) => {
  try {
    const u = await Usuario.findById(req.params.id).select("-contrasena").lean();
    if (!u) return res.status(404).json({ error: "No encontrado" });

    res.json({
      ...u,
      pasanteNivel: u.nivelPasante,
      documentos: mapDocsForView(u.documentos),
      areasProfesionalDetalladas: buildAreasDetalladas(u, "Profesional"),
      areasCoordinadasDetalladas: buildAreasDetalladas(u, "Coordinador")
    });
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuario" });
  }
};

/* ------------------------ Actualizar ------------------------ */
exports.actualizarUsuario = async (req, res) => {
  try {
    const { body } = req;
    normalizeBody(body);

    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    if (Object.prototype.hasOwnProperty.call(body, "seguroMalaPraxis")) {
      const v = (body.seguroMalaPraxis ?? "").toString().trim();
      body.seguroMalaPraxis = v || undefined;
    }

    const rolFinal = body.rol || usuario.rol;
    applyRoleCleaning(rolFinal, body, usuario);

    usuario.set(body);

    const files = collectFilesFromReq(req);
    if (files.length > 0) {
      const nuevosDocs = await uploadUserDocsR2(files, usuario._id);
      usuario.documentos = (usuario.documentos || []).concat(nuevosDocs);
    }

    await usuario.save();

    const uObj = usuario.toObject();
    delete uObj.contrasena;

    return res.json({
      ...uObj,
      pasanteNivel: uObj.nivelPasante,
      documentos: mapDocsForView(uObj.documentos),
      areasProfesionalDetalladas: buildAreasDetalladas(uObj, "Profesional"),
      areasCoordinadasDetalladas: buildAreasDetalladas(uObj, "Coordinador")
    });
  } catch (err) {
    console.error("actualizarUsuario error:", err?.stack || err);
    return res.status(500).json({ error: "Error al actualizar usuario", detalles: err.message });
  }
};

/* ------------------------ Eliminar documento ------------------------ */
exports.eliminarDocumentoUsuario = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const usuario = await Usuario.findById(id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

    const doc = usuario.documentos.id(docId);
    if (!doc) return res.status(404).json({ error: "Documento no encontrado" });

    // Borrar en R2 si hay URL interna
    if (doc.url) {
      const key = extractUsuariosKeyFromUrl(doc.url);
      if (key) {
        try { await deleteKey({ bucket: buckets.usuarios, key }); } catch { /* noop */ }
      }
    }

    // Quitar subdocumento y guardar
    doc.deleteOne();
    await usuario.save();

    return res.json({ documentos: mapDocsForView(usuario.documentos) });
  } catch (err) {
    console.error("eliminarDocumentoUsuario error:", err?.stack || err);
    return res.status(500).json({ error: "Error al eliminar documento" });
  }
};

/* ------------------------ Eliminar ------------------------ */
exports.eliminarUsuario = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

    if (Array.isArray(usuario.documentos) && usuario.documentos.length > 0) {
      const jobs = [];
      for (const doc of usuario.documentos) {
        if (doc?.url) {
          const key = extractUsuariosKeyFromUrl(doc.url);
          if (key) jobs.push(deleteKey({ bucket: buckets.usuarios, key }).catch(() => null));
        }
      }
      await Promise.all(jobs);
    }

    await Usuario.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: "Usuario eliminado" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
};

/* ------------------------ Login ------------------------ */
exports.login = async (req, res) => {
  try {
    const usuarioBody = (req.body?.usuario || "").toLowerCase().trim();
    const emailBody   = (req.body?.email   || "").toLowerCase().trim();
    const loginUsuario = usuarioBody || emailBody;

    const password = (req.body?.contrasena || req.body?.password || "").trim();
    if (!loginUsuario || !password) {
      return res.status(400).json({ error: "Faltan credenciales" });
    }

    const user = await Usuario.findOne({
      $or: [{ usuario: loginUsuario }, { mail: loginUsuario }]
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const hash = user.contrasena || user.passwordHash || user.clave;
    if (!hash) return res.status(500).json({ error: "Usuario sin contraseña configurada" });

    const validPassword = await bcrypt.compare(password, hash);
    if (!validPassword) return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign(
      { id: user._id, usuario: user.usuario, rol: user.rol, nombreApellido: user.nombreApellido },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    const userData = user.toObject();
    delete userData.contrasena;
    delete userData.passwordHash;
    delete userData.clave;

    res.json({ mensaje: "Login exitoso", user: userData, token });
  } catch (err) {
    console.error("Error en login:", err?.stack || err);
    res.status(500).json({ error: "Error en login", detalles: err.message });
  }
};

/* ------------------------ Auth middleware ------------------------ */
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers["x-access-token"];
  if (!authHeader) return res.status(401).json({ error: "Token requerido" });

  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
  if (!token) return res.status(401).json({ error: "Token inválido" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token no válido o expirado" });
  }
};

