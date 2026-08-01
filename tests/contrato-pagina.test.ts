import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { paginaConfiguracion } from '../src/configuracion/pagina.ts'

/**
 * El contrato entre la página del asistente y su servidor.
 *
 * La página manda nombres de campo y llama a rutas por su cadena; el
 * servidor los lee por su cadena. Entre las dos no hay ningún tipo, así
 * que TypeScript no ve nada: un `<select>` que no se recogía hizo que
 * elegir Cloudflare probara los modelos de Groq, y un campo que la página
 * dejaba escribir se descartaba en silencio al guardar.
 *
 * Ninguno de los dos daba error. Los dos aparecieron lejísimos de su
 * causa. Esto es lo que hay en lugar de un compilador.
 */

const HTML = paginaConfiguracion({
  redirecciones: {
    google: 'http://localhost:3210/oauth/google',
    microsoft: 'http://localhost:3210/oauth/microsoft',
  },
  puertoServicio: 3000,
  urlPropuestaBase: 'postgres://asistente:x@localhost:5433/asistente',
})

const SERVIDOR = readFileSync('src/configuracion/servidor.ts', 'utf8')
const GUION = HTML.split('<script>')[1]!.split('</script>')[0]!

/** Cada bloque con sus campos y las rutas a las que apunta. */
const BLOQUES = HTML.split('<section class="bloque"').slice(1).map((trozo) => {
  const cuerpo = trozo.split('</section>')[0]!
  return {
    id: /data-bloque="([a-z-]+)"/.exec(cuerpo)?.[1] ?? '?',
    campos: [...cuerpo.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([A-Z_]+)"/g)]
      .map((m) => m[1]!),
    rutas: [...cuerpo.matchAll(/data-ruta="([^"]+)"/g)].map((m) => m[1]!),
  }
})

/** Todo lo que la página puede pedirle al servidor. */
const LLAMADAS = [...new Set([
  ...BLOQUES.flatMap((b) => b.rutas),
  ...[...GUION.matchAll(/fetch\('(\/api[^']*)'/g)].map((m) => m[1]!),
  ...[...GUION.matchAll(/pedir\('(\/api[^']*)'/g)].map((m) => m[1]!),
  ...[...HTML.matchAll(/action="(\/api[^"]*)"/g)].map((m) => m[1]!),
])]

const RUTAS = new Set(
  [...SERVIDOR.matchAll(/app\.(?:get|post)\('([^']+)'/g)].map((m) => m[1]!))

// ── que exista lo que se llama ──────────────────────────────────

test('toda ruta que la página llama existe en el servidor', () => {
  assert.ok(LLAMADAS.length > 8, 'la prueba dejó de encontrar las llamadas')

  for (const llamada of LLAMADAS) {
    assert.ok(RUTAS.has(llamada.split('?')[0]!),
      `la página llama a ${llamada} y el servidor no la tiene`)
  }
})

test('los botones apuntan a rutas, no a cualquier cosa', () => {
  for (const b of BLOQUES) {
    for (const ruta of b.rutas) {
      assert.match(ruta, /^\/api\//, `el bloque «${b.id}» apunta a ${ruta}`)
    }
  }
})

// ── que se lea lo que se puede escribir ─────────────────────────

test('todo campo que la página deja escribir lo conoce el servidor', () => {
  // Se mira también en verificaciones.ts porque ahí es donde se guarda lo
  // que sale de una prueba: DATABASE_URL, por ejemplo, lo devuelve
  // `probarBase` en su `guardar`, no lo escribe el servidor a mano.
  const trasfondo = SERVIDOR + readFileSync('src/configuracion/verificaciones.ts', 'utf8')
  const campos = [...new Set(BLOQUES.flatMap((b) => b.campos))]
  assert.ok(campos.length > 12, 'la prueba dejó de encontrar los campos')

  for (const campo of campos) {
    assert.ok(trasfondo.includes(campo),
      `la página deja escribir ${campo} y el servidor no lo menciona nunca`)
  }
})

test('cada campo vive en el bloque cuyo botón lo va a mandar', () => {
  // `valores(caja)` recoge del bloque, no de la página entera: un campo en
  // el bloque de al lado nunca llega, y el fallo se ve a kilómetros.
  const donde: Record<string, string> = {
    DATABASE_URL: 'base',
    LLM_PROVEEDOR: 'groq', LLM_API_KEY: 'groq', LLM_BASE_URL: 'groq',
    VOZ_API_KEY: 'groq', VOZ_BASE_URL: 'groq',
    GOOGLE_CLIENT_ID: 'google', GOOGLE_CLIENT_SECRET: 'google',
    MS_CLIENT_ID: 'outlook', MS_CLIENT_SECRET: 'outlook',
    TELEGRAM_BOT_TOKEN: 'telegram',
    URL_PUBLICA: 'tunel', TUNEL_NOMBRE: 'tunel',
    API_TOKEN: 'app', CODIGO_ACCESO: 'app', SECRETO_SESION: 'app',
    RESPALDO_CLAVE: 'app', APP_URL: 'app',
    VERCEL_TOKEN: 'app', VERCEL_PROYECTO: 'app', VERCEL_GANCHO: 'app',
  }

  for (const [campo, bloque] of Object.entries(donde)) {
    const suyo = BLOQUES.find((b) => b.id === bloque)
    assert.ok(suyo, `no existe el bloque ${bloque}`)
    assert.ok(suyo.campos.includes(campo),
      `${campo} debería estar en el bloque «${bloque}» y no está`)
  }
})

// ── lo que no puede perderse ────────────────────────────────────

test('abrir el túnel deja encendido que se vuelva a abrir solo', () => {
  // cloudflared es un proceso hijo: se muere con la asistente. Sin
  // encender TUNEL_AUTO, el túnel duraba hasta el primer reinicio y la app
  // quedaba apuntando a una dirección que ya no existía.
  const handler = SERVIDOR.split("app.post('/api/tunel'")[1]!.split('app.post(')[0]!

  assert.match(handler, /TUNEL_AUTO: 'true'/,
    'abrir el túnel a mano tiene que dejarlo puesto para el próximo arranque')
})

test('los secretos generados se guardan todos al publicar', () => {
  const handler = SERVIDOR.split("app.post('/api/vercel'")[1]!.split('app.post(')[0]!

  for (const clave of ['API_TOKEN', 'CODIGO_ACCESO', 'SECRETO_SESION', 'RESPALDO_CLAVE']) {
    assert.ok(handler.includes(`'${clave}'`),
      `publicar no guarda ${clave}, así que editarlo en la pantalla no hace nada`)
  }
})
