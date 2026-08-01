/* ============================================================
   Servidor: API + archivos estáticos + eventos en vivo (SSE).
   Pensado para desplegar en Railway con el plugin de Postgres.
   ============================================================ */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bd = require('./db');

const app = express();
const PUERTO = process.env.PORT || 3000;

/* Los PIN definen quién entra y con qué permisos.
   Configuralos como variables de entorno en Railway. */
const PIN_OFICINA = process.env.PIN_OFICINA || '1234';
const PIN_TALLER  = process.env.PIN_TALLER  || '5678';
const SECRETO     = process.env.SECRETO     || 'cambiar-este-secreto';

const DURACION_SESION = 30 * 24 * 60 * 60 * 1000;   // 30 días

app.use(express.json({ limit: '5mb' }));

/* ------------------------------------------------------------------
   Sesión: token firmado con HMAC, sin estado en el servidor (así
   sobrevive a los redeploys de Railway).
   ------------------------------------------------------------------ */

function firmar(payload) {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

function verificar(token) {
  if (!token || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

function leerCookie(req, nombre) {
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sesion(req, _res, next) {
  req.usuario = verificar(leerCookie(req, 'sesion'));
  next();
}

const requiereSesion = (req, res, next) =>
  req.usuario ? next() : res.status(401).json({ error: 'Sesión no iniciada' });

const requiereOficina = (req, res, next) =>
  req.usuario?.rol === 'oficina' ? next() : res.status(403).json({ error: 'Requiere permisos de oficina' });

app.use(sesion);

/* ------------------------------------------------------------------
   Autenticación
   ------------------------------------------------------------------ */

app.post('/api/login', (req, res) => {
  const { pin, nombre } = req.body || {};
  let rol = null;
  if (pin === PIN_OFICINA) rol = 'oficina';
  else if (pin === PIN_TALLER) rol = 'taller';
  if (!rol) return res.status(401).json({ error: 'PIN incorrecto' });

  const usuario = {
    nombre: String(nombre || '').trim().slice(0, 40) || (rol === 'oficina' ? 'Oficina' : 'Taller'),
    rol,
    exp: Date.now() + DURACION_SESION,
  };
  res.setHeader('Set-Cookie',
    `sesion=${firmar(usuario)}; Path=/; Max-Age=${DURACION_SESION / 1000}; HttpOnly; SameSite=Lax` +
    (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
  res.json({ nombre: usuario.nombre, rol: usuario.rol });
});

app.post('/api/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'sesion=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.json({ ok: true });
});

app.get('/api/yo', requiereSesion, (req, res) => {
  res.json({ nombre: req.usuario.nombre, rol: req.usuario.rol });
});

/* ------------------------------------------------------------------
   Eventos en vivo: cuando alguien guarda, el resto se entera.
   ------------------------------------------------------------------ */

const oyentes = new Set();

function avisar(evento, quien) {
  const msg = `data: ${JSON.stringify({ evento, quien, ts: Date.now() })}\n\n`;
  for (const res of oyentes) {
    try { res.write(msg); } catch { oyentes.delete(res); }
  }
}

app.get('/api/eventos', requiereSesion, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  oyentes.add(res);

  // Latido para que proxies y celulares no corten la conexión.
  const latido = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);

  req.on('close', () => { clearInterval(latido); oyentes.delete(res); });
});

/* ------------------------------------------------------------------
   Datos
   ------------------------------------------------------------------ */

app.get('/api/datos', requiereSesion, async (_req, res, next) => {
  try { res.json({ vehiculos: await bd.listar() }); }
  catch (e) { next(e); }
});

app.put('/api/vehiculos/:id', requiereSesion, async (req, res, next) => {
  try {
    const v = req.body;
    if (!v || v.id !== req.params.id) {
      return res.status(400).json({ error: 'El id del cuerpo no coincide con el de la URL' });
    }
    if (!String(v.patente || '').trim()) {
      return res.status(400).json({ error: 'Falta la patente' });
    }
    await bd.guardarVehiculo(v);
    avisar('vehiculo', req.usuario.nombre);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/vehiculos/:id', requiereSesion, requiereOficina, async (req, res, next) => {
  try {
    await bd.borrarVehiculo(req.params.id);
    avisar('vehiculo', req.usuario.nombre);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Reemplazo total: importar un backup o vaciar. Solo oficina. */
app.put('/api/datos', requiereSesion, requiereOficina, async (req, res, next) => {
  try {
    const vehiculos = req.body?.vehiculos;
    if (!Array.isArray(vehiculos)) return res.status(400).json({ error: 'Formato inválido' });
    await bd.reemplazarTodo(vehiculos);
    avisar('reemplazo', req.usuario.nombre);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ------------------------------------------------------------------
   Estáticos
   ------------------------------------------------------------------ */

const PUBLICO = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLICO, { extensions: ['html'] }));

app.get('/salud', (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Error del servidor' });
});

/* ------------------------------------------------------------------ */

bd.iniciar()
  .then(() => app.listen(PUERTO, () => console.log(`[web] escuchando en :${PUERTO}`)))
  .catch(e => { console.error('No se pudo iniciar la base de datos:', e); process.exit(1); });
