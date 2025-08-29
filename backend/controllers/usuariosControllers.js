const Usuario = require('../models/usuarios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET_KEY = "supersecreto"; // 🔑 cámbialo por algo seguro en producción

// ==================================================
// Crear usuario
// ==================================================
exports.crearUsuario = async (req, res) => {
  try {
    const { body, files } = req;

    // Procesar documentos subidos
    let documentos = [];
    if (files && files.length > 0) {
      documentos = files.map(file => ({
        tipo: 'general',
        nombre: file.originalname,
        url: `/uploads/usuarios/${file.filename}`,
        fechaSubida: new Date()
      }));
    }

    // 🔒 Hashear contraseña
    let hashedPassword = body.contrasena;
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(body.contrasena, salt);
    }

    const nuevo = new Usuario({
      ...body,
      contrasena: hashedPassword,
      documentos
    });

    await nuevo.save();

    // Quitar contraseña antes de devolver
    nuevo.contrasena = undefined;

    res.status(201).json(nuevo);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario', detalles: err });
  }
};

// ==================================================
// Obtener todos los usuarios
// ==================================================
exports.obtenerUsuarios = async (req, res) => {
  try {
    const lista = await Usuario.find().select("-contrasena"); // 🔒 no mostrar contraseñas
    res.status(200).json(lista);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

// ==================================================
// Obtener usuario por ID
// ==================================================
exports.getUsuarioPorId = async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.params.id).select("-contrasena");
    if (!usuario) return res.status(404).json({ error: 'No encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

// ==================================================
// Actualizar usuario
// ==================================================
exports.actualizarUsuario = async (req, res) => {
  try {
    const { body, files } = req;

    let documentos = [];
    if (files && files.length > 0) {
      documentos = files.map(file => ({
        tipo: 'general',
        nombre: file.originalname,
        url: `/uploads/usuarios/${file.filename}`,
        fechaSubida: new Date()
      }));
    }

    // Buscar usuario
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    // 🔒 Si hay nueva contraseña, la hasheamos
    if (body.contrasena) {
      const salt = await bcrypt.genSalt(10);
      body.contrasena = await bcrypt.hash(body.contrasena, salt);
    } else {
      delete body.contrasena;
    }

    usuario.set(body);

    if (documentos.length > 0) {
      usuario.documentos = usuario.documentos.concat(documentos);
    }

    await usuario.save();

    usuario.contrasena = undefined; // no devolver contraseña
    res.json(usuario);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario', detalles: err });
  }
};

// ==================================================
// Eliminar usuario
// ==================================================
exports.eliminarUsuario = async (req, res) => {
  try {
    await Usuario.findByIdAndDelete(req.params.id);
    res.status(200).json({ mensaje: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

// ==================================================
// Login con JWT
// ==================================================
exports.login = async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    // Buscar usuario en la BD
    const user = await Usuario.findOne({ usuario });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    // Validar contraseña
    const validPassword = await bcrypt.compare(contrasena, user.contrasena);
    if (!validPassword)
      return res.status(401).json({ error: "Contraseña incorrecta" });

    // 🔥 Crear token con datos básicos
    const token = jwt.sign(
      { id: user._id, usuario: user.usuario, rol: user.rol },
      process.env.JWT_SECRET || "clavePorDefecto", // Usa variable de entorno o fallback
      { expiresIn: "8h" }
    );

    // No enviar la contraseña en la respuesta
    const userData = user.toObject();
    delete userData.contrasena;

    res.json({
      mensaje: "Login exitoso",
      user: userData,
      token,
    });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error en login", detalles: err.message });
  }
};

// ==================================================
// Middleware de autenticación con JWT
// ==================================================
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Token inválido" });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded; // Datos del usuario disponible en req.user
    next();
  } catch (err) {
    return res.status(403).json({ error: "Token no válido o expirado" });
  }
};





