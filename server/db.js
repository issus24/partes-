/* ============================================================
   Capa de datos.

   Con DATABASE_URL definida (lo que pasa en Railway al agregar el
   plugin de Postgres) guarda en Postgres. Sin ella, guarda en un
   archivo JSON local para poder desarrollar sin instalar nada.

   OJO: el disco de Railway es efímero — se borra en cada deploy.
   En producción hay que usar Postgres sí o sí.
   ============================================================ */

const fs = require('fs/promises');
const path = require('path');

const URL_BD = process.env.DATABASE_URL;
const ARCHIVO = path.join(__dirname, '..', 'datos', 'datos.json');

let pool = null;

/* ---------- Arranque ---------- */

async function iniciar() {
  if (!URL_BD) {
    await fs.mkdir(path.dirname(ARCHIVO), { recursive: true });
    try { await fs.access(ARCHIVO); }
    catch { await fs.writeFile(ARCHIVO, JSON.stringify({ vehiculos: [] }, null, 2)); }
    console.log('[bd] modo archivo:', ARCHIVO, '(solo para desarrollo local)');
    return;
  }

  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: URL_BD,
    // Railway expone Postgres con certificado propio.
    ssl: URL_BD.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehiculos (
      id          TEXT PRIMARY KEY,
      data        JSONB       NOT NULL,
      actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  console.log('[bd] modo Postgres');
}

/* ---------- Lectura ---------- */

async function listar() {
  if (!pool) {
    const txt = await fs.readFile(ARCHIVO, 'utf8');
    return JSON.parse(txt).vehiculos || [];
  }
  const { rows } = await pool.query('SELECT data FROM vehiculos ORDER BY data->>\'patente\'');
  return rows.map(r => r.data);
}

/* ---------- Escritura ---------- */

async function guardarVehiculo(v) {
  if (!pool) {
    const lista = await listar();
    const i = lista.findIndex(x => x.id === v.id);
    if (i >= 0) lista[i] = v; else lista.push(v);
    return escribirArchivo(lista);
  }
  await pool.query(
    `INSERT INTO vehiculos (id, data, actualizado) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, actualizado = now()`,
    [v.id, v]
  );
}

async function borrarVehiculo(id) {
  if (!pool) {
    const lista = (await listar()).filter(v => v.id !== id);
    return escribirArchivo(lista);
  }
  await pool.query('DELETE FROM vehiculos WHERE id = $1', [id]);
}

/* Reemplaza todo el contenido (importar backup / borrar todo). */
async function reemplazarTodo(vehiculos) {
  if (!pool) return escribirArchivo(vehiculos);

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('DELETE FROM vehiculos');
    for (const v of vehiculos) {
      await cliente.query('INSERT INTO vehiculos (id, data) VALUES ($1, $2)', [v.id, v]);
    }
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK');
    throw e;
  } finally {
    cliente.release();
  }
}

function escribirArchivo(vehiculos) {
  return fs.writeFile(ARCHIVO, JSON.stringify({ vehiculos }, null, 2));
}

module.exports = { iniciar, listar, guardarVehiculo, borrarVehiculo, reemplazarTodo };
