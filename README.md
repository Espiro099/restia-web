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

## Forma de trabajo (GitHub Flow)

- `main` siempre compila y pasa pruebas; el CI (`.github/workflows/ci.yml`) corre en cada push y pull request a `main`.
- Cada cambio va en una rama corta `feature/<nombre>` desde `main`, con commits atómicos, y entra por pull request revisado por otro integrante.
