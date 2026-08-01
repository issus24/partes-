# Parte de Trabajo — Taller

Seguimiento diario de las reparaciones del taller. Dos vistas sobre los mismos datos:

- **Escritorio** (`/index.html`) — grilla vehículo × día para la oficina.
- **Móvil** (`/movil.html`) — lista compacta para el mecánico, con pedidos de repuestos.

## Estructura

```
public/         cliente (se sirve tal cual, sin build)
  core.js       modelo de datos, catálogos y sincronización — compartido
  app.js        vista de escritorio
  movil.js      vista móvil
  login.html    ingreso por PIN
server/
  index.js      API REST + eventos en vivo (SSE) + estáticos
  db.js         Postgres, o archivo JSON si no hay DATABASE_URL
```

## Correr en la PC

```bash
npm install
npm start
```

Abrir <http://localhost:3000>. Sin `DATABASE_URL` guarda en `datos/datos.json`, así que
no hace falta instalar Postgres para probar.

PIN por defecto: **1234** (oficina) y **5678** (taller). Cambialos antes de publicar.

También se puede seguir usando sin servidor: abriendo `public/index.html` con doble clic,
la app funciona igual pero guarda solo en ese navegador.

## Desplegar en Railway

1. Subir el proyecto a un repo de GitHub.
2. En Railway: **New Project → Deploy from GitHub repo** y elegir el repo.
3. **New → Database → Add PostgreSQL**. Railway inyecta `DATABASE_URL` solo.
4. En el servicio de la app, pestaña **Variables**, cargar:

   | Variable | Valor |
   |---|---|
   | `PIN_OFICINA` | el PIN de la oficina |
   | `PIN_TALLER` | el PIN del taller |
   | `SECRETO` | una cadena larga y aleatoria |
   | `NODE_ENV` | `production` |

5. **Settings → Networking → Generate Domain** para obtener la URL pública.

El deploy corre `npm start` y la tabla se crea sola al arrancar.

> El disco de Railway es efímero: se borra en cada deploy. El modo archivo es solo
> para desarrollo — en producción hace falta el plugin de Postgres.

## Roles

| | Oficina | Taller |
|---|---|---|
| Ver todo | ✅ | ✅ |
| Cargar actualizaciones y pedidos | ✅ | ✅ |
| Cambiar estado del vehículo | ✅ | ✅ |
| Crear y editar vehículos | ✅ | ✅ |
| Borrar vehículos | ✅ | ❌ |
| Importar backup / borrar todo | ✅ | ❌ |

## Sincronización

Guardar toca un vehículo por vez, así dos personas editando unidades distintas
nunca se pisan. El servidor avisa a los demás por SSE y la pantalla se refresca sola.

Si el celular se queda sin señal, el cambio se guarda igual en el teléfono y queda
en una cola que se vacía al recuperar conexión. El indicador del encabezado muestra
el estado y cuántos cambios faltan enviar.

## API

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/api/login` | — |
| `POST` | `/api/logout` | — |
| `GET` | `/api/yo` | cualquiera |
| `GET` | `/api/datos` | cualquiera |
| `PUT` | `/api/vehiculos/:id` | cualquiera |
| `DELETE` | `/api/vehiculos/:id` | oficina |
| `PUT` | `/api/datos` | oficina |
| `GET` | `/api/eventos` | cualquiera (SSE) |
| `GET` | `/salud` | — |

## Ajustes frecuentes

- **Categorías de problemas y palabras clave** → `CATEGORIAS` en `public/core.js`.
- **Estados del vehículo** → `ESTADOS` en `public/core.js`.
- **Estados de un pedido** → `ESTADOS_PEDIDO` en `public/core.js`.
- **Sectores sugeridos** → `SECTORES` en `public/core.js`.
