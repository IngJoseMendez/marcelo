import { test } from 'node:test'
import assert from 'node:assert/strict'
import { probarCadena, type DepsCadena } from '../src/configuracion/cadena.ts'

/**
 * El valor de esto está en distinguir cuatro fallos que se ven idénticos
 * desde el teléfono. Así que lo que hay que probar no es que «diga algo»,
 * sino que señale al culpable correcto en cada uno.
 */

const URL_TUNEL = 'https://algo-random.trycloudflare.com'
const TOKEN = 'token-de-la-laptop'

type Respuestas = Record<string, { estado?: number; cuerpo?: unknown }>

/** Un `fetch` que sólo sabe lo que se le dice, y anota a quién llamaron. */
function fingirRed(respuestas: Respuestas) {
  const llamadas: string[] = []
  const buscar = async (url: string, init?: RequestInit): Promise<Response> => {
    llamadas.push(url)
    const clave = Object.keys(respuestas).find((k) => url.includes(k))
    if (clave === undefined) throw new Error('no se pudo llegar')
    const { estado = 200, cuerpo = {} } = respuestas[clave]!
    // El token viaja de verdad: así se puede probar que compara el bueno.
    void init
    return new Response(JSON.stringify(cuerpo), {
      status: estado, headers: { 'content-type': 'application/json' },
    })
  }
  return { buscar, llamadas }
}

const AHORA = Date.now()

const base = (respuestas: Respuestas): DepsCadena => ({
  puertoLocal: 3000,
  urlPublica: URL_TUNEL,
  apiToken: TOKEN,
  vercel: { token: 'vtok', proyecto: 'mi-app', gancho: '' },
  buscar: fingirRed(respuestas).buscar,
  limiteMs: 500,
})

/** Todo bien: sirve de línea de partida para romper una cosa a la vez. */
const TODO_BIEN: Respuestas = {
  '127.0.0.1:3000': { cuerpo: { ok: true } },
  'trycloudflare.com': { cuerpo: { ok: true } },
  '/env?decrypt=true': {
    cuerpo: {
      envs: [
        { key: 'API_BASE', value: URL_TUNEL, updatedAt: AHORA - 600_000 },
        { key: 'API_TOKEN', value: TOKEN, updatedAt: AHORA - 600_000 },
      ],
    },
  },
  '/v6/deployments': { cuerpo: { deployments: [{ created: AHORA - 60_000 }] } },
}

test('con todo en su sitio, dice que sí y no culpa a nadie', async () => {
  const r = await probarCadena(base(TODO_BIEN))
  assert.equal(r.ok, true)
  assert.equal(r.culpable, null)
  assert.equal(r.eslabones.length, 4)
  assert.ok(r.eslabones.every((e) => e.estado === 'bien'))
})

test('la laptop apagada se ve como tal, y no se culpa al túnel', async () => {
  const r = await probarCadena(base({ ...TODO_BIEN, '127.0.0.1:3000': undefined as never }))
  assert.equal(r.ok, false)
  assert.equal(r.culpable?.id, 'laptop')
  // Y se para ahí: seguir preguntando por el túnel sólo añade ruido.
  assert.equal(r.eslabones.length, 1)
})

test('un 401 local no es «apagada»: es el token', async () => {
  const r = await probarCadena(base({ ...TODO_BIEN, '127.0.0.1:3000': { estado: 401 } }))
  assert.equal(r.culpable?.id, 'laptop')
  assert.match(r.culpable!.detalle, /token/i)
  // Reparar no arregla esto: hay que generar los secretos y reiniciar.
  assert.equal(r.reparable, false)
})

test('el túnel caído se distingue de la laptop apagada', async () => {
  const r = await probarCadena(base({ ...TODO_BIEN, 'trycloudflare.com': { estado: 502 } }))
  assert.equal(r.culpable?.id, 'tunel')
  assert.equal(r.eslabones[0]!.estado, 'bien')
  assert.equal(r.reparable, true)
})

test('sin dirección pública ni sale a internet a probar', async () => {
  const red = fingirRed(TODO_BIEN)
  const r = await probarCadena({ ...base(TODO_BIEN), urlPublica: '', buscar: red.buscar })
  assert.equal(r.culpable?.id, 'tunel')
  assert.ok(!red.llamadas.some((u) => u.includes('vercel.com')))
})

test('Vercel apuntando a la dirección de ayer: el caso del reinicio', async () => {
  const r = await probarCadena(base({
    ...TODO_BIEN,
    '/env?decrypt=true': {
      cuerpo: {
        envs: [
          { key: 'API_BASE', value: 'https://el-tunel-de-ayer.trycloudflare.com' },
          { key: 'API_TOKEN', value: TOKEN },
        ],
      },
    },
  }))
  assert.equal(r.culpable?.id, 'vercel')
  assert.match(r.culpable!.detalle, /el-tunel-de-ayer/)
  assert.equal(r.reparable, true)
})

test('una barra final de más no es un fallo', async () => {
  const r = await probarCadena(base({
    ...TODO_BIEN,
    '/env?decrypt=true': {
      cuerpo: {
        envs: [
          { key: 'API_BASE', value: `${URL_TUNEL}/` },
          { key: 'API_TOKEN', value: TOKEN },
        ],
      },
    },
  }))
  assert.equal(r.ok, true)
})

test('un token distinto en Vercel se nombra: la app llegaría y sería rechazada', async () => {
  const r = await probarCadena(base({
    ...TODO_BIEN,
    '/env?decrypt=true': {
      cuerpo: {
        envs: [
          { key: 'API_BASE', value: URL_TUNEL },
          { key: 'API_TOKEN', value: 'el-de-otra-instalacion' },
        ],
      },
    },
  }))
  assert.equal(r.culpable?.id, 'vercel')
  assert.match(r.culpable!.detalle, /token/i)
})

/**
 * La trampa que nadie ve: las variables están bien puestas y aun así la app
 * sale vacía, porque Vercel sólo las inyecta al desplegar. Sin este eslabón
 * el diagnóstico diría «todo bien» delante de una app que no funciona, que
 * es peor que no tener diagnóstico.
 */
test('variables buenas pero despliegue viejo: sigue estando mal', async () => {
  const r = await probarCadena(base({
    ...TODO_BIEN,
    '/env?decrypt=true': {
      cuerpo: {
        envs: [
          { key: 'API_BASE', value: URL_TUNEL, updatedAt: AHORA - 60_000 },
          { key: 'API_TOKEN', value: TOKEN, updatedAt: AHORA - 60_000 },
        ],
      },
    },
    '/v6/deployments': { cuerpo: { deployments: [{ created: AHORA - 600_000 }] } },
  }))
  assert.equal(r.ok, false)
  assert.equal(r.culpable?.id, 'despliegue')
  assert.match(r.culpable!.arreglo!, /redespliego/i)
})

test('sin ningún despliegue en producción lo dice, y reparar no basta', async () => {
  const r = await probarCadena(base({
    ...TODO_BIEN, '/v6/deployments': { cuerpo: { deployments: [] } },
  }))
  assert.equal(r.culpable?.id, 'despliegue')
  assert.equal(r.reparable, false)
})

test('sin token de Vercel no se inventa un veredicto', async () => {
  const r = await probarCadena({
    ...base(TODO_BIEN),
    vercel: { token: '', proyecto: '', gancho: '' },
  })
  assert.equal(r.culpable?.id, 'vercel')
  assert.equal(r.culpable!.estado, 'sin_datos')
  // Y aun así se puede arreglar a mano: le da la dirección para copiarla.
  assert.match(r.culpable!.arreglo!, new RegExp(URL_TUNEL))
})

test('un proyecto que no existe se nombra, en vez de decir «error 404»', async () => {
  const r = await probarCadena(base({ ...TODO_BIEN, '/env?decrypt=true': { estado: 404 } }))
  assert.match(r.culpable!.detalle, /mi-app/)
})

test('si Vercel no deja ver los despliegues, no se da por caído lo que sí funciona', async () => {
  const r = await probarCadena(base({ ...TODO_BIEN, '/v6/deployments': { estado: 403 } }))
  assert.equal(r.ok, true)
  assert.equal(r.eslabones[3]!.estado, 'sin_datos')
})

test('pregunta por la ruta que usa la app de verdad, y con el token', async () => {
  const red = fingirRed(TODO_BIEN)
  await probarCadena({ ...base(TODO_BIEN), buscar: red.buscar })
  // `/salud` no pide token: probar por ahí daría «bien» con un token malo.
  assert.ok(red.llamadas.some((u) => u === `http://127.0.0.1:3000/api/estado`))
  assert.ok(red.llamadas.some((u) => u === `${URL_TUNEL}/api/estado`))
})
