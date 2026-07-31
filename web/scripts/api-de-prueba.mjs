/**
 * Una asistente de mentira, para ver la app sin levantar la de verdad.
 *
 * Sirve exactamente las mismas rutas que el Fastify de la laptop, con datos
 * de ejemplo. Sirve para revisar el diseño en el celular antes de conectar
 * Google, y para trabajar en la interfaz sin depender de la base de datos.
 *
 *   node scripts/api-de-prueba.mjs        (queda escuchando en :4000)
 *
 * En web/.env.local:  API_BASE=http://localhost:4000
 *
 * NO se usa en producción: la app real habla con la asistente por el túnel.
 */
import { createServer } from 'node:http'

const PUERTO = Number(process.env.PUERTO_PRUEBA ?? 4000)

// Bogotá no tiene horario de verano: siempre −05:00.
const ahoraBogota = () => new Date(Date.now() - 5 * 3600_000)
const hoy = () => ahoraBogota().toISOString().slice(0, 10)
const en = (h, m = 0) =>
  `${hoy()}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`
const ahora = () => `${ahoraBogota().toISOString().slice(0, 19)}-05:00`
const haceHoras = (h) =>
  `${new Date(ahoraBogota().getTime() - h * 3600_000).toISOString().slice(0, 19)}-05:00`

const marca = (accionId, tipo, extra = {}) => ({
  accionId, tipo, origen: 'correo', confianza: 'alta',
  cuando: haceHoras(6), porElla: true, ensayo: false, deshecha: false,
  desdeInicio: null, ...extra,
})

const estado = {
  deshechas: new Set(),
  agendadas: new Set(),
  cerradas: new Set(),
}

const intenciones = [
  { id: 1, titulo: 'Estudiar para el parcial de Cálculo', detalle: null,
    prioridad: 'alta', duracionMin: 120, venceEl: null, estado: 'pendiente',
    origen: 'texto', googleEventId: null },
  { id: 2, titulo: 'Responder el correo de la beca', detalle: null,
    prioridad: 'urgente', duracionMin: 30, venceEl: `${hoy()}T23:00:00-05:00`,
    estado: 'pendiente', origen: 'correo', googleEventId: null },
  { id: 3, titulo: 'Terminar el taller de Álgebra', detalle: null,
    prioridad: 'normal', duracionMin: 60, venceEl: null, estado: 'pendiente',
    origen: 'texto', googleEventId: null },
]

function jornada() {
  const eventos = [
    { id: 'gym', eventoId: 'serie-gym', titulo: 'Gimnasio',
      inicio: en(7), fin: en(8, 15), todoElDia: false, estado: 'confirmado',
      momento: 'pasado', marca: null },
    { id: 'bd', eventoId: 'serie-bd', titulo: 'Bases de Datos',
      inicio: en(9), fin: en(11), todoElDia: false, estado: 'confirmado',
      momento: 'pasado', marca: null },
    { id: 'calc', eventoId: 'serie-calc', titulo: 'Cálculo',
      inicio: en(16), fin: en(17), todoElDia: false, estado: 'cancelado',
      momento: 'futuro',
      marca: estado.deshechas.has(11) ? null : marca(11, 'cancelar_instancia') },
    { id: 'grupo', eventoId: 'serie-grupo', titulo: 'Grupo de estudio',
      inicio: en(16), fin: en(18), todoElDia: false, estado: 'confirmado',
      momento: 'futuro',
      marca: estado.deshechas.has(12)
        ? null
        : marca(12, 'mover_evento', { confianza: 'media', desdeInicio: en(15) }) },
    { id: 'parcial', eventoId: 'bloque', titulo: 'Estudiar para el parcial',
      inicio: en(20), fin: en(22), todoElDia: false, estado: 'confirmado',
      momento: 'futuro', marca: null },
  ]

  return {
    fecha: hoy(),
    zonaHoraria: 'America/Bogota',
    ahora: ahora(),
    esHoy: true,
    ventana: { inicio: en(7), fin: en(22) },
    eventos,
    huecos: [
      { inicio: en(8, 15), fin: en(9), minutos: 45 },
      { inicio: en(11), fin: en(16), minutos: 300 },
      { inicio: en(18), fin: en(20), minutos: 120 },
    ],
    cambiosDeElla: eventos.filter((e) => e.marca?.porElla).length,
    modoSombra: false,
  }
}

const cronica = () => ({
  ahora: ahora(),
  desde: `${hoy()}T00:00:00-05:00`,
  entradas: [
    { id: 12, tipo: 'mover_evento', origen: 'correo', confianza: 'media',
      estado: estado.deshechas.has(12) ? 'deshecha' : 'aplicada',
      creadaEn: haceHoras(6), deshechaEn: null, porElla: true, ensayo: false,
      titulo: 'Grupo de estudio',
      objetivo: { inicio: en(16), fin: en(18), desdeInicio: en(15) },
      compromiso: { id: 4, titulo: 'Grupo de estudio' },
      correo: { remitente: 'andres.m@uni.edu.co', asunto: 'Nos corremos una hora',
        recibidoEn: haceHoras(6) } },
    { id: 11, tipo: 'cancelar_instancia', origen: 'correo', confianza: 'alta',
      estado: estado.deshechas.has(11) ? 'deshecha' : 'aplicada',
      creadaEn: haceHoras(7), deshechaEn: null, porElla: true, ensayo: false,
      titulo: 'Cálculo',
      objetivo: { inicio: en(16), fin: en(17), desdeInicio: null },
      compromiso: { id: 1, titulo: 'Cálculo' },
      correo: { remitente: 'ramirez@uni.edu.co', asunto: 'Clase de hoy',
        recibidoEn: haceHoras(7) } },
  ],
})

const pactos = () => ({
  compromisos: [
    { id: 1, titulo: 'Cálculo', alias: ['calculo', 'clase'],
      rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
      tz: 'America/Bogota', googleCalendarId: 'primary', googleEventId: 'evt1',
      remitentesVinculados: ['ramirez@uni.edu.co'], activo: true },
    { id: 2, titulo: 'Bases de Datos', alias: ['bases'],
      rrule: 'FREQ=WEEKLY;BYDAY=TH', horaInicio: '09:00', horaFin: '11:00',
      tz: 'America/Bogota', googleCalendarId: 'primary', googleEventId: 'evt2',
      remitentesVinculados: ['coordinacion@uni.edu.co'], activo: true },
    { id: 3, titulo: 'Gimnasio', alias: ['gym'],
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', horaInicio: '07:00', horaFin: '08:15',
      tz: 'America/Bogota', googleCalendarId: 'primary', googleEventId: 'evt3',
      remitentesVinculados: [], activo: true },
  ],
})

function responder(res, codigo, cuerpo) {
  const json = JSON.stringify(cuerpo)
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' })
  res.end(json)
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const ruta = url.pathname.replace(/^\/api/, '')

  if (req.method === 'GET' && ruta === '/estado') {
    return responder(res, 200, {
      ok: true, modoSombra: false, zonaHoraria: 'America/Bogota',
      ahora: ahora(), ultimoLatido: haceHoras(0.1),
    })
  }
  if (req.method === 'GET' && ruta === '/jornada') return responder(res, 200, jornada())
  if (req.method === 'GET' && ruta === '/cronica') return responder(res, 200, cronica())
  if (req.method === 'GET' && ruta === '/pactos') return responder(res, 200, pactos())
  if (req.method === 'GET' && ruta === '/bandeja') {
    return responder(res, 200, {
      fecha: hoy(),
      huecos: jornada().huecos,
      intenciones: intenciones.filter(
        (i) => !estado.agendadas.has(i.id) && !estado.cerradas.has(i.id)),
    })
  }

  if (req.method === 'POST') {
    const deshacer = ruta.match(/^\/acciones\/(\d+)\/deshacer$/)
    if (deshacer) {
      estado.deshechas.add(Number(deshacer[1]))
      return responder(res, 200, { ok: true, accionId: Number(deshacer[1]) })
    }
    const agendar = ruta.match(/^\/intenciones\/(\d+)\/agendar$/)
    if (agendar) {
      estado.agendadas.add(Number(agendar[1]))
      return responder(res, 200, { ok: true, accionId: 99, eventoId: 'nuevo' })
    }
    const cerrar = ruta.match(/^\/intenciones\/(\d+)\/cerrar$/)
    if (cerrar) {
      estado.cerradas.add(Number(cerrar[1]))
      return responder(res, 200, { ok: true })
    }
    if (ruta === '/intenciones') {
      const id = intenciones.length + 1
      let cuerpo = ''
      req.on('data', (t) => { cuerpo += t })
      req.on('end', () => {
        const datos = JSON.parse(cuerpo || '{}')
        intenciones.push({
          id, titulo: datos.titulo ?? 'Sin título', detalle: null,
          prioridad: datos.prioridad ?? 'normal', duracionMin: datos.duracionMin ?? 30,
          venceEl: null, estado: 'pendiente', origen: 'texto', googleEventId: null,
        })
        responder(res, 200, { id })
      })
      return
    }
  }

  responder(res, 404, { error: `No existe ${ruta}` })
}).listen(PUERTO, () => {
  console.log(`Asistente de mentira en http://localhost:${PUERTO}`)
})
