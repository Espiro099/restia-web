# restia-web

Panel web de Restia para administradores y gerentes: personal, sucursales, catálogo, mesas y QR, inventario, caja, facturación, impresión, reportes y auditoría. Consume la API de [`restia-api`](https://github.com/Espiro099/restia-api) (Laravel 13 + MongoDB), cuyo contrato está en `openapi/restia-api.yaml`.

## Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | 20 o superior (probado con 24) |
| npm | 10 o superior |
| restia-api | En `http://127.0.0.1:8000` para desarrollo (ver su README) |

## Comandos

```bash
npm ci            # instala exactamente lo de package-lock.json
npm run dev       # servidor de desarrollo en http://localhost:5173
npm test          # pruebas unitarias (Vitest)
npm run build     # compilación de producción en dist/
```

`npm run dev` envía `/api` y `/sanctum` al backend (`RESTIA_API_URL`, por omisión `http://127.0.0.1:8000`) para que la cookie de sesión y el token CSRF sean del mismo origen.

Usuarios locales de prueba: `gerente@demo.mx` usa `RESTIA_DEMO_PASSWORD` del `.env` de restia-api (`restia:demo --staff`). `admin@demo.mx` usa la contraseña que se dio en `restia:install`.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/modules.js` | Catálogo de módulos: título, permiso, grupo y fase del plan. De ahí salen el menú, el inicio y las rutas. |
| `src/router.js` | `/` es la página de inicio con el acceso; `/panel/*` necesita sesión, y cada módulo, su permiso en la sucursal elegida. |
| `src/stores/session.js` | Sesión de cookie (`/auth/me`, login, salir, vencimiento) y sucursal elegida. |
| `src/lib/client.js` | Cliente compartido: un 401 en un módulo marca la sesión vencida y regresa al acceso. |
| `src/layouts/PanelLayout.vue` | Menú lateral, selector de sucursal, usuario y salir. |

El panel es para administración y gerencia: un módulo se ve solo si el rol en la sucursal elegida es `ADMIN` o `MANAGER` y tiene su permiso. Meseros y cocina trabajan en la app Android. La API aplica los permisos en cada petición; el panel solo decide qué mostrar.

Para construir un módulo, agrega su pantalla a `BUILT` en `src/router.js` (sin ella muestra `ModulePendingView`) y recarga sus datos observando `session.branchId`.

## Forma de trabajo (GitHub Flow)

- `main` siempre compila y pasa pruebas; el CI (`.github/workflows/ci.yml`) corre en cada push y pull request a `main`.
- Cada cambio va en una rama corta `feature/<nombre>` desde `main`, con commits atómicos, y entra por pull request revisado por otro integrante.
