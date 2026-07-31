import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { cifrar, descifrar, nuevaClaveRespaldo } from '../src/dominio/cifrado.ts'
import { abrirRespaldo, crearServicioRespaldo, esViejo } from '../src/servicios/respaldo.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'

const CLAVE = 'clave-de-prueba-larga-y-aleatoria'
const VOLCADO = Buffer.from(
  '-- volcado\nCREATE TABLE compromisos (id int);\nINSERT INTO compromisos VALUES (1);\n'.repeat(40))

// viernes 7 de agosto de 2026, 3:40 am en Bogotá: la hora del respaldo.
const reloj = new RelojFalso('2026-08-07T03:40:00')

// ── el sobre ────────────────────────────────────────────────────

test('lo cifrado vuelve igual con su clave', () => {
  const sobre = cifrar(VOLCADO, CLAVE)

  assert.notEqual(sobre.toString('utf8'), VOLCADO.toString('utf8'))
  assert.deepEqual(descifrar(sobre, CLAVE), VOLCADO)
})

test('con otra clave no se abre', () => {
  const sobre = cifrar(VOLCADO, CLAVE)
  assert.throws(() => descifrar(sobre, 'otra'), /La clave no es/)
})

test('un byte cambiado se detecta en vez de devolver basura', () => {
  // Es lo que compra GCM sobre CBC, y en un respaldo importa más que en
  // ningún otro sitio: el daño se descubre el día que hace falta, y ese
  // día ya no hay a dónde volver.
  const sobre = cifrar(VOLCADO, CLAVE)
  sobre[sobre.length - 5] = (sobre.at(-5) ?? 0) ^ 0x01

  assert.throws(() => descifrar(sobre, CLAVE), /dañado|clave no es/)
})

test('dos respaldos del mismo volcado no salen iguales', () => {
  // Sal y vector nuevos por archivo: si salieran iguales, se sabría desde
  // fuera que esa noche no cambió nada.
  assert.notDeepEqual(cifrar(VOLCADO, CLAVE), cifrar(VOLCADO, CLAVE))
})

test('un archivo que no es nuestro se rechaza al abrirlo', () => {
  assert.throws(() => descifrar(Buffer.from('hola que tal'), CLAVE), /no es un respaldo/)
})

test('sin clave no se cifra: no hay modo «en claro»', () => {
  assert.throws(() => cifrar(VOLCADO, ''), /no voy a sacar esto en claro/)
})

test('las claves generadas no se repiten', () => {
  assert.notEqual(nuevaClaveRespaldo(), nuevaClaveRespaldo())
  assert.ok(nuevaClaveRespaldo().length >= 40)
})

// ── el respaldo entero ──────────────────────────────────────────

function armar(o: { enviar?: boolean; falla?: boolean; ficheros?: string[] } = {}) {
  const escritos: Array<{ ruta: string; datos: Uint8Array }> = []
  const enviados: Array<{ nombre: string; datos: Uint8Array }> = []
  const borrados: string[] = []

  const servicio = crearServicioRespaldo({
    reloj,
    volcar: async () => {
      if (o.falla) throw new Error('pg_dump no está')
      return VOLCADO
    },
    clave: CLAVE,
    carpeta: 'respaldos',
    retenerDias: 14,
    enviar: o.enviar === false
      ? undefined
      : async (nombre, datos) => { enviados.push({ nombre, datos }) },
    escribir: async (ruta, datos) => { escritos.push({ ruta, datos }) },
    listar: async () => o.ficheros ?? [],
    borrar: async (ruta) => { borrados.push(ruta) },
    crearCarpeta: async () => {},
  })

  return { servicio, escritos, enviados, borrados }
}

test('el respaldo se guarda cifrado y sale de la laptop', async () => {
  const p = armar()

  const r = await p.servicio.hacer()

  assert.equal(r.ok, true)
  assert.equal(r.fuera, true, 'uno que se queda dentro no es un respaldo')
  assert.match(r.archivo!, /respaldo-2026-08-07-0340\.sql\.gz\.enc$/)
  assert.equal(p.enviados.length, 1)
  assert.deepEqual(p.enviados[0]!.datos, p.escritos[0]!.datos,
    'lo que sale es exactamente lo que se guardó')
})

test('lo que sale no se puede leer sin la clave', async () => {
  const p = armar()
  await p.servicio.hacer()

  const sobre = p.enviados[0]!.datos
  assert.ok(!Buffer.from(sobre).toString('utf8').includes('CREATE TABLE'),
    'un chat de bot no es privado: ahí dentro va la agenda y el banco')
  assert.deepEqual(abrirRespaldo(sobre, CLAVE), VOLCADO)
})

test('comprime antes de cifrar: al revés no comprimiría nada', async () => {
  const p = armar()
  await p.servicio.hacer()

  assert.ok(p.escritos[0]!.datos.length < VOLCADO.length / 2,
    'lo cifrado no tiene patrones que aprovechar, así que el orden importa')
})

test('sin sitio a donde mandarlo lo dice, en vez de creer que quedó a salvo', async () => {
  const p = armar({ enviar: false })

  const r = await p.servicio.hacer()

  assert.equal(r.ok, true)
  assert.equal(r.fuera, false)
  assert.match(r.motivo!, /se queda en la laptop/)
})

test('si el volcado falla, se dice sin reventar el proceso', async () => {
  const p = armar({ falla: true })

  const r = await p.servicio.hacer()

  assert.equal(r.ok, false)
  assert.match(r.motivo!, /pg_dump no está/)
  assert.equal(p.escritos.length, 0, 'no se escribe un respaldo vacío que parezca bueno')
})

test('sin clave configurada no se hace nada', async () => {
  const servicio = crearServicioRespaldo({
    reloj, volcar: async () => VOLCADO, clave: '',
    carpeta: 'respaldos', retenerDias: 14,
    escribir: async () => {}, listar: async () => [], borrar: async () => {},
    crearCarpeta: async () => {},
  })

  const r = await servicio.hacer()

  assert.equal(r.ok, false)
  assert.match(r.motivo!, /RESPALDO_CLAVE/)
})

// ── rotación ────────────────────────────────────────────────────

test('se borran los viejos y se dejan los de dentro de la ventana', async () => {
  const p = armar({
    ficheros: [
      'respaldo-2026-07-01-0340.sql.gz.enc', // 37 días: fuera
      'respaldo-2026-08-05-0340.sql.gz.enc', // 2 días: se queda
      'respaldo-2026-08-07-0340.sql.gz.enc', // hoy
    ],
  })

  await p.servicio.hacer()

  assert.deepEqual(p.borrados.map((b) => b.replace(/^.*[\\/]/, '')),
    ['respaldo-2026-07-01-0340.sql.gz.enc'])
})

test('lo que no es un respaldo nuestro no se toca', async () => {
  const p = armar({ ficheros: ['fotos-viejas.zip', 'notas.txt', '.gitkeep'] })

  await p.servicio.hacer()

  assert.deepEqual(p.borrados, [],
    'si alguien deja algo en esa carpeta, no es asunto nuestro borrarlo')
})

test('la ventana se mide por la fecha del nombre', () => {
  const hoy = reloj.ahora()
  assert.equal(esViejo('respaldo-2026-07-01-0340.sql.gz.enc', hoy, 14), true)
  assert.equal(esViejo('respaldo-2026-08-05-0340.sql.gz.enc', hoy, 14), false)
  assert.equal(esViejo('respaldo-sin-fecha.sql.gz.enc', hoy, 14), false)
  assert.equal(esViejo('otra-cosa.txt', hoy, 14), false)
})

// ── el camino de vuelta ─────────────────────────────────────────

test('el respaldo se puede abrir: eso se prueba hoy, no el día que haga falta', async () => {
  const p = armar()
  await p.servicio.hacer()

  const sql = abrirRespaldo(p.enviados[0]!.datos, CLAVE)

  assert.match(sql.toString('utf8'), /CREATE TABLE compromisos/)
  assert.deepEqual(gunzipSync(descifrar(p.enviados[0]!.datos, CLAVE)), VOLCADO)
})
