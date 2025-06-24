<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Usuarios</title>
    <link rel="stylesheet" href="usuarios.css">
</head>
<body>
    <header class="header">
        <div class="nav-container">
            <button class="nav-btn">USUARIOS</button>
            <div class="user-info">
                <span>USUARIO: <strong>Belén Contreras</strong></span>
                <button class="logout-btn">CERRAR SESIÓN</button>
            </div>
        </div>
    </header>

    <main class="main-content">
        <h2>Listado de usuarios:</h2>
        <div class="table-container">
            <div class="register-user">
                <span>Registrar nuevo usuario:</span>
                <button class="add-user-btn">+</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Usuarios</th>
                        <th>Área</th>
                        <th>Mail</th>
                        <th>WhatsApp</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="user-list">
                    <!-- Filas de usuarios irán acá -->
                </tbody>
            </table>
        </div>
    </main>
</body>
</html>
