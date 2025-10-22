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
  // Si algún middleware setea req.body.documentos como FileList serializada (raro), se ignora.
  return files;
}

// Convierte URLs internas a URLs de vista (Worker) SOLO para responder al front
function mapDocsForView(docs) {
  if (!Array.isArray(docs)) return [];
  return docs.map(d => ({
    ...d,
    url: toWorkerViewUrl(d?.url || "")
  }));
}

// Sube archivos a R2 y devuelve objetos {tipo, nombre, url, fechaSubida}
async function uploadUserDocsR2(files, ownerId) {
  const out = [];
  for (const file of files) {
    const safeName = String(file.originalname || "archivo")
      .replace(/[/\\]+/g, "_")
      .replace(/\s+/g, "_");
    const key = `${ownerId}/${Date.now()}_${safeName}`;
    const url = await uploadBuffer({
      bucket: buckets.usuarios,
      key,
      buffer: file.buffer,
      contentType: file.mimetype
    });
    out.push({
      tipo: "general",
      nombre: file.originalname,
      url,                   // interna: https://r2.internal/<bucket>/<key>
      fechaSubida: new Date()
    });
  }
  return out;
}

// Normaliza body cuando viene por multipart/form-data o JSON
function normalizeBody(body) {
  // Arrays que pueden venir como JSON string
  body.areasProfesional = parseMaybeJSON(body.areasProfesional);
  body.areasCoordinadas = parseMaybeJSON(body.areasCoordinadas);
  if (body.areasProfesional == null || body.areasProfesional === "") body.areasProfesional = [];
  if (body.areasCoordinadas == null || body.areasCoordinadas === "") body.areasCoordinadas = [];

  // Trims + vacíos -> undefined
  [
    "jurisdiccion",
    "registroNacionalDePrestadores",
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

  return body;
}

// Reglas por rol
function applyRoleCleaning(rol, body, currentDoc = null) {
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

  if (!esPasante) body.pasanteNivel = undefined;

  // En update, si no llegan arrays conservar los actuales
  if (currentDoc) {
    if (!Array.isArray(body.areasProfesional) && currentDoc.areasProfesional) {
      body.areasProfesional = currentDoc.areasProfesional;
    }
    if (!Array.isArray(body.areasCoordinadas) && currentDoc.areasCoordinadas) {
      body.areasCoordinadas = currentDoc.areasCoordinadas;
    }
  }
}

// Extrae key del URL interno: https://r2.internal/<bucket>/<key>
// (para borrar en R2 cuando eliminás el usuario)
function extractKeyFromInternalUrl(url, expectedBucket) {
  try {
    const prefix = "https://r2.internal/";
    if (!url?.startsWith(prefix)) return null;
    const rest = url.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) return null;
    const bucket = rest.slice(0, slash);
    const key    = rest.slice(slash + 1);
    if (expectedBucket && bucket !== expectedBucket) return null;
    return key;
  } catch {
    return null;
  }
}

/* ------------------------ Crear ------------------------ */
exports.crearUsuario = async (req, res) => {
  try {
    const { body } = req;
    normalizeBody(body);

    // Hash de contraseña si vino
    let hashedPassword = body.contrasena;
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(body.contrasena, salt);
    }

    // Limpieza por rol
    const rolFinal = body.rol;
    applyRoleCleaning(rolFinal, body);

    // Crear doc base
    const nuevo = new Usuario({
      ...body,
      contrasena: hashedPassword,
      documentos: []
    });

    await nuevo.save(); // necesitamos _id

    // Subir adjuntos si hay
    const files = collectFilesFromReq(req);
    if (files.length > 0) {
      const uploaded = await uploadUserDocsR2(files, nuevo._id);
      nuevo.documentos = uploaded;
      await nuevo.save();
    }

    // Preparar respuesta (sin hash y con URLs visibles)
    const resp = nuevo.toObject();
    delete resp.contrasena;
    resp.documentos = mapDocsForView(resp.documentos);

    return res.status(201).json(resp);
  } catch (err) {
    console.error("crearUsuario error:", err?.stack || err);
    return res.status(500).json({ error: "Error al crear usuario", detalles: err.message });
  }
};

/* ------------------------ Listar ------------------------ */
exports.obtenerUsuarios = async (_req, res) => {
  try {
    const lista = await Usuario.find().select("-contrasena");
    const resp = lista.map(u => {
      const obj = u.toObject();
      obj.documentos = mapDocsForView(obj.documentos);
      return obj;
    });
    res.status(200).json(resp);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

/* ------------------------ Obtener por ID ------------------------ */
exports.getUsuarioPorId = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select("-contrasena");
    if (!usuario) return res.status(404).json({ error: "No encontrado" });
    const obj = usuario.toObject();
    obj.documentos = mapDocsForView(obj.documentos);
    res.json(obj);
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

    // Hash sólo si llega nueva contraseña
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    // Normalizar seguro
    if (Object.prototype.hasOwnProperty.call(body, "seguroMalaPraxis")) {
      const v = (body.seguroMalaPraxis ?? "").toString().trim();
      body.seguroMalaPraxis = v || undefined;
    }

    // Reglas por rol
    const rolFinal = body.rol || usuario.rol;
    applyRoleCleaning(rolFinal, body, usuario);

    // Set de campos
    usuario.set(body);

    // Adjuntar nuevos documentos si hay
    const files = collectFilesFromReq(req);
    if (files.length > 0) {
      const nuevosDocs = await uploadUserDocsR2(files, usuario._id);
      usuario.documentos = (usuario.documentos || []).concat(nuevosDocs);
    }

    await usuario.save();

    const resp = usuario.toObject();
    delete resp.contrasena;
    resp.documentos = mapDocsForView(resp.documentos);

    return res.json(resp);
  } catch (err) {
    console.error("actualizarUsuario error:", err?.stack || err);
    return res.status(500).json({ error: "Error al actualizar usuario", detalles: err.message });
  }
};

/* ------------------------ Eliminar ------------------------ */
exports.eliminarUsuario = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

    // Borrado best-effort en R2
    if (Array.isArray(usuario.documentos) && usuario.documentos.length > 0) {
      const jobs = [];
      for (const doc of usuario.documentos) {
        const key = extractKeyFromInternalUrl(doc?.url, buckets.usuarios);
        if (key) jobs.push(deleteKey({ bucket: buckets.usuarios, key }).catch(() => null));
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

    // también mapeo URLs por si devolvés documentos en el perfil
    userData.documentos = mapDocsForView(userData.documentos);

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
