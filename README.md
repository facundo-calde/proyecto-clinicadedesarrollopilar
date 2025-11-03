# Proyecto Clínica de Desarrollo Pilar

Aplicación web integral para la gestión administrativa, clínica y operativa de una institución de salud.
El sistema permite administrar pacientes, módulos, profesionales, áreas, usuarios, movimientos financieros, liquidaciones y documentación, con un enfoque orientado a la trazabilidad y eficiencia en la gestión.

---

## Descripción general

El proyecto está desarrollado con **Node.js**, **Express**, **MongoDB** y **SweetAlert2** en el frontend.
Su arquitectura modular separa el backend, frontend y servicios complementarios, permitiendo mantener una estructura clara, escalable y mantenible.

---

## Características principales

* Gestión completa de pacientes y fichas clínicas.
* Módulos por área y profesional, con control de asignaciones y estados.
* Administración de usuarios y roles (profesionales, coordinadores, pasantes, administradores).
* Gestión de áreas terapéuticas.
* Registro de movimientos de caja, fichas y liquidaciones.
* Dashboard de control general con indicadores diarios.
* Carga y almacenamiento de documentos personales y diagnósticos (integrado con almacenamiento S3).
* Autenticación y control de acceso mediante **JWT**.
* Configuración por variables de entorno (.env).

---

## Estructura del proyecto

```
proyecto-clinicadedesarrollopilar/
├── backend/
│   ├── controllers/      # Controladores del backend
│   ├── lib/              # Funciones auxiliares y utilidades
│   ├── models/           # Modelos de datos (MongoDB/Mongoose)
│   ├── routes/           # Rutas de la API
│   ├── middlewares/      # Autenticación, validaciones y manejo de errores
│   ├── server.js         # Punto de entrada principal del servidor
│   └── .env              # Variables de entorno (no versionado)
│
├── frontend/
│   ├── css/              # Hojas de estilo personalizadas
│   ├── html/             # Páginas del sistema (interfaz principal)
│   ├── img/              # Recursos gráficos
│   └── js/               # Lógica del frontend y conexión con la API
│
├── r2-worker/            # Worker de subida a almacenamiento S3 (Cloudflare R2)
├── scripts/              # Scripts auxiliares y configuraciones
├── .gitignore
├── package.json
└── README.md
```

---

## Instalación local

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/facundo-calde/proyecto-clinicadedesarrollopilar.git
   cd proyecto-clinicadedesarrollopilar
   ```

2. Instalar dependencias:

   ```bash
   npm install
   ```

3. Crear el archivo `.env` con las variables de entorno necesarias:

   ```
   PORT=5000
   MONGODB_URI=mongodb+srv://<usuario>:<password>@<cluster>/<db>
   JWT_SECRET=clave_segura
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET_URL=
   ```

4. Iniciar el servidor:

   ```bash
   npm start
   ```

   o en entorno de desarrollo:

   ```bash
   npm run dev
   ```

---

## Variables de entorno

El archivo `.env` debe contener las siguientes variables (según el entorno de ejecución):

```
PORT=5000
MONGODB_URI=
JWT_SECRET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_URL=
```

> Este archivo no debe versionarse. Se recomienda crear un `.env.example` para compartir la estructura de configuración.

---

## Despliegue en producción

El sistema se encuentra desplegado en un servidor **AWS Lightsail**, configurado con **Caddy** como proxy reverso y **PM2** para la gestión de procesos.
El entorno incluye conexión a **MongoDB Atlas** y almacenamiento de archivos en **Cloudflare R2**.

**URL de producción:**
[https://app.clinicadesarrollopilar.com.ar](https://app.clinicadesarrollopilar.com.ar)

El despliegue contempla variables de entorno seguras, manejo de logs, y actualizaciones continuas mediante Git y PM2.

---

## Tecnologías utilizadas

* Node.js / Express
* MongoDB / Mongoose
* Cloudflare R2 (almacenamiento de archivos)
* SweetAlert2 (modales en el frontend)
* CORS / JWT / dotenv / bcrypt
* PM2 (entorno de producción)
* Caddy (proxy reverso en entorno productivo)

---

## Autor

**Facundo Calderón**
Desarrollador Full Stack
Contacto: [calderonquintanapablofacundo@gmail.com](mailto:calderonquintanapablofacundo@gmail.com)

---

## Licencia

Este proyecto se distribuye bajo la licencia **MIT**, lo que permite su uso, copia y modificación con atribución al autor original.
