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
scripts/
  importar-partes.js   carga el histórico de los CSV del taller
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

## Importar el histórico

Los partes diarios del taller viven en `partes_por_dia_2026/`, un CSV por día
exportado de la planilla. Para volcarlos en la app:

```bash
npm run importar                                  # informe, no escribe nada
node scripts/importar-partes.js --escribir        # vuelca en datos/datos.json
node scripts/importar-partes.js --detalle IOK295  # audita una unidad
```

Se niega a pisar un `datos.json` que ya tenga vehículos; para reemplazarlo hay
que agregar `--forzar`.

Los CSV no son parejos: el encabezado cambió de nombre seis veces, trece
archivos se exportaron sin nombres de columna, y cada hoja arrastra partes
viejos pegados más abajo. El importador los resuelve por posición, corta la
basura por el tamaño del hueco de filas vacías, y reconstruye las estadías así:

- La **entrada** sale de la columna F-I. Antes del 18/6/26 esa columna no
  existía, así que se toma el primer día en que la unidad figura en un parte.
- La **salida** sale de F-T. Si está vacía, es el día en que el parte la dio
  por operativa.
- Si el F-I se carga con atraso (la unidad entra el 6 y el parte del 8 le pone
  "F-I 06/07"), se corrige el ingreso en lugar de abrir una visita nueva. Una
  fecha posterior sí abre una visita nueva.

El informe termina con un control de que ninguna unidad quede dos veces en el
taller el mismo día: si eso no da cero, la grilla mostraría la visita
equivocada.

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
