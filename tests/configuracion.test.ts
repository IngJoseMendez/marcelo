import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fundirEnv, leerEnv } from '../src/configuracion/archivo-env.ts'
import { revisar, asomar } from '../src/configuracion/estado.ts'
import { elegirModelos } from '../src/configuracion/modelos.ts'
import { canjearCodigo, cuentaDelIdToken, urlDeConsentimiento } from '../src/configuracion/oauth.ts'
import { urlEnSalida } from '../src/configuracion/tunel.ts'
import { publicarVariables, redesplegar, variablesDeLaApp } from '../src/configuracion/vercel.ts'
import { esperarChat, probarBase, probarGroq, probarTelegram } from '../src/configuracion/verificaciones.ts'

/** Un `fetch` de mentira: guarda lo que le piden y devuelve lo guionado. */
function buscarFalso(respuestas: Array<{ estado?: number; cuerpo: unknown }>) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = []
  const cola = [...respuestas]
  const buscar = async (url: string, init?: RequestInit): Promise<Response> => {
    llamadas.push({ url, init })
    const r = cola.shift() ?? { estado: 500, cuerpo: {} }
    return {
      ok: (r.estado ?? 200) < 400,
      status: r.estado ?? 200,
      json: async () => r.cuerpo,
    } as Response
  }
  return { buscar, llamadas }
}

// ── el archivo .env ─────────────────────────────────────────────

test('leer un .env respeta comillas, comentarios y export', () => {
  const v = leerEnv([
    '# un comentario',
    'SIMPLE=valor',
    'export CON_EXPORT=otro',
    'CON_COMILLAS="con espacios y # almohadilla"',
    'VACIA=',
    'CON_COMENTARIO=algo # esto sobra',
  ].join('\n'))

  assert.equal(v.SIMPLE, 'valor')
  assert.equal(v.CON_EXPORT, 'otro')
  assert.equal(v.CON_COMILLAS, 'con espacios y # almohadilla')
  assert.equal(v.VACIA, '')
  assert.equal(v.CON_COMENTARIO, 'algo')
})

test('fundir cambios conserva los comentarios y el sitio de cada clave', () => {
  // El archivo que escribe el asistente es el mismo que lee una persona
  // cuando algo falla: regenerarlo borraría justo lo que lo hace entendible.
  const original = [
    '# Base de datos',
    'DATABASE_URL=viejo',
    '',
    '# Cerebro',
    'GROQ_API_KEY=',
  ].join('\n')

  const nuevo = fundirEnv(original, { DATABASE_URL: 'postgres://x', GROQ_API_KEY: 'gsk_1' })

  assert.match(nuevo, /# Base de datos\nDATABASE_URL=postgres:\/\/x/)
  assert.match(nuevo, /# Cerebro\nGROQ_API_KEY=gsk_1/)
})

test('lo que no existía se añade al final, diciendo quién lo puso', () => {
  const nuevo = fundirEnv('DATABASE_URL=x\n', { TELEGRAM_CHAT_ID: '12345' })

  assert.match(nuevo, /DATABASE_URL=x/)
  assert.match(nuevo, /asistente de configuración/)
  assert.match(nuevo, /TELEGRAM_CHAT_ID=12345/)
})

test('un valor con espacios sale entrecomillado, y vuelve igual al leerlo', () => {
  const texto = fundirEnv('', { NOMBRE: 'Prof. Ramírez <r@uni.edu.co>' })
  assert.equal(leerEnv(texto).NOMBRE, 'Prof. Ramírez <r@uni.edu.co>')
})

// ── qué falta ───────────────────────────────────────────────────

const MINIMO = {
  DATABASE_URL: 'postgres://a:b@localhost:5433/c',
  GROQ_API_KEY: 'gsk',
  GROQ_MODELO_CLASIFICADOR: 'a',
  GROQ_MODELO_EXTRACTOR: 'b',
  GROQ_MODELO_TRANSCRIPTOR: 'c',
}

test('sin ninguna fuente de correo no arranca, por completo que esté lo demás', () => {
  const r = revisar(MINIMO)

  assert.equal(r.listo, false, 'sin correo que leer no hay nada que hacer')
  assert.equal(r.faltantes, 1)
})

test('con Google conectado ya arranca', () => {
  const r = revisar({
    ...MINIMO,
    GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'y', GOOGLE_REFRESH_TOKEN: 'z',
  })

  assert.equal(r.listo, true)
  assert.equal(r.bloques.find((b) => b.id === 'google')!.salud, 'listo')
})

test('a medias es «parcial», no «pendiente»: sirve para saber dónde se quedó', () => {
  const google = revisar({ GOOGLE_CLIENT_ID: 'x' }).bloques.find((b) => b.id === 'google')!

  assert.equal(google.salud, 'parcial')
  assert.deepEqual(google.falta, ['GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'])
})

test('lo siguiente que hacer va en orden de dependencia', () => {
  assert.equal(revisar({}).siguiente, 'base')
  assert.equal(revisar({ DATABASE_URL: 'postgres://x' }).siguiente, 'groq')
})

test('la cadena de conexión no se enseña entera: lleva la contraseña dentro', () => {
  const base = revisar(MINIMO).bloques.find((b) => b.id === 'base')!

  assert.equal(base.detalle, 'c en localhost:5433')
  assert.ok(!base.detalle.includes('b'), 'la contraseña no puede acabar en pantalla')
})

test('un secreto se asoma por las puntas', () => {
  assert.equal(asomar('gsk_abcdefghijklmnop'), 'gsk_…mnop')
  assert.equal(asomar('corto'), '·····')
  assert.equal(asomar(undefined), '')
})

// ── elegir modelos del catálogo vivo ────────────────────────────

const CATALOGO = [
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
  'whisper-large-v3', 'whisper-large-v3-turbo',
  'meta-llama/llama-guard-4-12b', 'playai-tts',
]

test('elige el bueno para leer y el pequeño para clasificar', () => {
  const e = elegirModelos(CATALOGO)

  assert.equal(e.extractor, 'llama-3.3-70b-versatile')
  assert.equal(e.clasificador, 'llama-3.1-8b-instant')
  assert.equal(e.transcriptor, 'whisper-large-v3')
  assert.deepEqual(e.avisos, [])
})

test('si el preferido desapareció del catálogo, coge otro grande', () => {
  // Es el riesgo abierto nº2 del spec: los identificadores cambian. Aquí no
  // se asumen, se eligen de lo que Groq diga hoy.
  const e = elegirModelos(['llama-4-405b-loquesea', 'llama-3.1-8b-instant', 'whisper-large-v3'])

  assert.equal(e.extractor, 'llama-4-405b-loquesea')
})

test('nunca elige un modelo de voz para leer, ni un guardarraíl', () => {
  const e = elegirModelos(['whisper-large-v3', 'meta-llama/llama-guard-4-12b'])

  assert.equal(e.extractor, '')
  assert.match(e.avisos.join(' '), /ningún modelo de texto/)
})

test('sin un Whisper grande avisa: con acento costeño, uno pequeño inventa', () => {
  const e = elegirModelos(['llama-3.3-70b-versatile'])

  assert.equal(e.transcriptor, '')
  assert.match(e.avisos.join(' '), /notas de voz no se transcriben/)
})

test('sin modelo pequeño usa el bueno, pero lo dice', () => {
  const e = elegirModelos(['llama-3.3-70b-versatile', 'whisper-large-v3'])

  assert.equal(e.clasificador, 'llama-3.3-70b-versatile')
  assert.match(e.avisos.join(' '), /gasta más cuota/)
})

// ── OAuth ───────────────────────────────────────────────────────

test('la URL de consentimiento de Google pide el refresh_token explícitamente', () => {
  const url = new URL(urlDeConsentimiento({
    proveedor: 'google', clientId: 'abc',
    redirectUri: 'http://localhost:3210/oauth/google', estado: 'e1',
  }))

  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent',
    'sin esto, la segunda vez Google devuelve todo menos el refresh_token')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3210/oauth/google')
  assert.match(url.searchParams.get('scope')!, /gmail\.readonly/)
  assert.match(url.searchParams.get('scope')!, /calendar\.events/)
})

test('Microsoft pide offline_access, que es su forma de decir lo mismo', () => {
  const url = new URL(urlDeConsentimiento({
    proveedor: 'microsoft', clientId: 'abc',
    redirectUri: 'http://localhost:3210/oauth/microsoft', estado: 'e1', tenant: 'common',
  }))

  assert.match(url.toString(), /login\.microsoftonline\.com\/common/)
  assert.match(url.searchParams.get('scope')!, /offline_access/)
  assert.match(url.searchParams.get('scope')!, /Mail\.Read/)
})

test('la cuenta sale del id_token, sin llamar a nadie más', () => {
  const carga = Buffer.from(JSON.stringify({ email: 'marcelo@gmail.com' })).toString('base64url')
  assert.equal(cuentaDelIdToken(`x.${carga}.y`), 'marcelo@gmail.com')
  assert.equal(cuentaDelIdToken(undefined), '')
  assert.equal(cuentaDelIdToken('basura'), '')
})

test('canjear devuelve el refresh_token y de qué cuenta es', async () => {
  const carga = Buffer.from(JSON.stringify({ email: 'marcelo@gmail.com' })).toString('base64url')
  const { buscar, llamadas } = buscarFalso([
    { cuerpo: { refresh_token: '1//tok', id_token: `a.${carga}.b` } },
  ])

  const t = await canjearCodigo({
    proveedor: 'google', clientId: 'c', clientSecret: 's',
    redirectUri: 'http://localhost:3210/oauth/google', estado: 'e', codigo: 'abc',
  }, buscar)

  assert.equal(t.refreshToken, '1//tok')
  assert.equal(t.cuenta, 'marcelo@gmail.com')
  assert.match(String(llamadas[0]!.init!.body), /grant_type=authorization_code/)
})

test('si no llega refresh_token lo dice, en vez de guardar vacío', async () => {
  // Pasa cuando ya se dio el permiso antes. Guardar vacío haría que
  // fallara dentro de una hora, lejos de la causa.
  const { buscar } = buscarFalso([{ cuerpo: { access_token: 'solo-este' } }])

  await assert.rejects(() => canjearCodigo({
    proveedor: 'google', clientId: 'c', clientSecret: 's',
    redirectUri: 'x', estado: 'e', codigo: 'abc',
  }, buscar), /Quita el permiso/)
})

// ── túnel ───────────────────────────────────────────────────────

test('saca la dirección del túnel de entre el ruido de cloudflared', () => {
  const salida = [
    '2026-07-30T21:00:00Z INF Requesting new quick Tunnel...',
    '+---------------------------------------+',
    '|  https://azul-perro-mesa-24.trycloudflare.com  |',
    '+---------------------------------------+',
  ].join('\n')

  assert.equal(urlEnSalida(salida), 'https://azul-perro-mesa-24.trycloudflare.com')
  assert.equal(urlEnSalida('nada que ver'), null)
})

// ── Vercel ──────────────────────────────────────────────────────

test('publica cada variable en los tres entornos, no sólo en producción', async () => {
  const { buscar, llamadas } = buscarFalso([{ cuerpo: {} }, { cuerpo: {} }])

  const r = await publicarVariables(
    { token: 't', proyecto: 'mi-app', buscar }, { API_BASE: 'https://x', API_TOKEN: 'k' })

  assert.equal(r.ok, true)
  assert.deepEqual(r.puestas, ['API_BASE', 'API_TOKEN'])
  assert.match(llamadas[0]!.url, /projects\/mi-app\/env\?upsert=true/)
  const enviado = JSON.parse(String(llamadas[0]!.init!.body)) as { target: string[] }
  assert.deepEqual(enviado.target, ['production', 'preview', 'development'],
    'si sólo va producción, las vistas previas mienten')
})

test('un token sin permiso se dice en cristiano', async () => {
  const { buscar } = buscarFalso([{ estado: 403, cuerpo: {} }])

  const r = await publicarVariables({ token: 't', proyecto: 'x', buscar }, { A: '1' })

  assert.equal(r.ok, false)
  assert.match(r.mensaje, /no tiene permiso/)
})

test('las variables vacías no se publican', async () => {
  const { buscar, llamadas } = buscarFalso([{ cuerpo: {} }])

  await publicarVariables({ token: 't', proyecto: 'x', buscar }, { A: '1', B: '' })

  assert.equal(llamadas.length, 1)
})

test('el gancho de despliegue tiene que ser de Vercel', async () => {
  const { buscar } = buscarFalso([{ cuerpo: {} }])

  assert.equal((await redesplegar('https://evil.example.com/hook', buscar)).ok, false)
  assert.equal(
    (await redesplegar('https://api.vercel.com/v1/integrations/deploy/prj_1/abc', buscar)).ok,
    true)
})

test('lo que une la app con la laptop son cuatro valores', () => {
  const v = variablesDeLaApp({
    URL_PUBLICA: 'https://tunel.test', API_TOKEN: 'k',
    CODIGO_ACCESO: '1234', SECRETO_SESION: 's',
  })

  assert.equal(v.API_BASE, 'https://tunel.test', 'por dónde se llega a la laptop')
  assert.equal(v.API_TOKEN, 'k', 'con qué se identifica al llamar')
})

// ── las pruebas de cada credencial ──────────────────────────────

test('probar Groq elige los modelos y devuelve lo que hay que guardar', async () => {
  const { buscar } = buscarFalso([{ cuerpo: { data: CATALOGO.map((id) => ({ id })) } }])

  const r = await probarGroq('gsk_1', 'https://api.groq.com/openai/v1', buscar)

  assert.equal(r.ok, true)
  assert.equal(r.guardar!.GROQ_MODELO_EXTRACTOR, 'llama-3.3-70b-versatile')
  assert.equal(r.guardar!.GROQ_MODELO_TRANSCRIPTOR, 'whisper-large-v3')
  assert.equal(r.guardar!.GROQ_API_KEY, 'gsk_1',
    'nadie escribe un identificador de modelo a mano')
})

test('una clave mala de Groq dice qué hacer, no un número', async () => {
  const { buscar } = buscarFalso([{ estado: 401, cuerpo: {} }])

  const r = await probarGroq('mala', 'https://api.groq.com/openai/v1', buscar)

  assert.equal(r.ok, false)
  assert.match(r.mensaje, /console\.groq\.com/)
})

test('probar el bot devuelve su nombre y lo guarda', async () => {
  const { buscar } = buscarFalso([{ cuerpo: { ok: true, result: { username: 'cerebro_bot' } } }])

  const r = await probarTelegram('123:AA', buscar)

  assert.equal(r.ok, true)
  assert.equal(r.guardar!.TELEGRAM_BOT_NOMBRE, 'cerebro_bot')
  assert.match(r.mensaje, /escríbele algo/)
})

test('el número del chat se captura solo: nadie lo busca a mano', async () => {
  const { buscar } = buscarFalso([{
    cuerpo: { ok: true, result: [{ update_id: 1, message: { chat: { id: 987, first_name: 'Marcelo' } } }] },
  }])

  const r = await esperarChat('123:AA', buscar)

  assert.equal(r.guardar!.TELEGRAM_CHAT_ID, '987')
  assert.match(r.mensaje, /Marcelo/)
})

test('si todavía no le ha escrito, lo pide otra vez', async () => {
  const { buscar } = buscarFalso([{ cuerpo: { ok: true, result: [] } }])

  const r = await esperarChat('123:AA', buscar)

  assert.equal(r.ok, false)
  assert.match(r.mensaje, /Mándale cualquier cosa/)
})

test('la base caída se explica en cristiano, no con un ECONNREFUSED', async () => {
  const r = await probarBase('postgres://a:b@localhost:5433/c', async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:5433')
  })

  assert.equal(r.ok, false)
  assert.match(r.mensaje, /docker compose up -d/)
})

test('la base caída de verdad tampoco deja el mensaje en blanco', async () => {
  // Lo que lanza Node cuando localhost resuelve a IPv6 y a IPv4 y fallan las
  // dos: un AggregateError con el `message` vacío. Sin desenvolverlo, el
  // fallo más común del primer arranque se enseñaba como una caja vacía.
  const r = await probarBase('postgres://a:b@localhost:5433/c', async () => {
    throw new AggregateError(
      [new Error('connect ECONNREFUSED ::1:5433'),
       new Error('connect ECONNREFUSED 127.0.0.1:5433')])
  })

  assert.equal(r.ok, false)
  assert.match(r.mensaje, /docker compose up -d/)
})

test('una cadena que no es de Postgres se rechaza antes de intentar nada', async () => {
  let intentado = false
  const r = await probarBase('mysql://x', async () => { intentado = true })

  assert.equal(r.ok, false)
  assert.equal(intentado, false)
})
