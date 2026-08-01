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
    // Una orden hablada esperando que él confirme.
    { id: 77, tipo: 'cancelar_instancia', origen: 'voz', confianza: 'alta',
      estado: estado.deshechas.has(11) ? 'aplicada' : 'pendiente',
      creadaEn: haceHoras(0.2), deshechaEn: null, porElla: false, ensayo: false,
      titulo: 'Gimnasio', resumen: 'cancelar «Gimnasio» el viernes 7 de agosto',
      objetivo: { inicio: en(7), fin: en(8, 15), desdeInicio: null },
      compromiso: { id: 3, titulo: 'Gimnasio' }, correo: null },
    { id: 12, tipo: 'mover_evento', origen: 'correo', confianza: 'media',
      estado: estado.deshechas.has(12) ? 'deshecha' : 'aplicada',
      creadaEn: haceHoras(6), deshechaEn: null, porElla: true, ensayo: false,
      titulo: 'Grupo de estudio', resumen: null,
      objetivo: { inicio: en(16), fin: en(18), desdeInicio: en(15) },
      compromiso: { id: 4, titulo: 'Grupo de estudio' },
      correo: { remitente: 'andres.m@uni.edu.co', asunto: 'Nos corremos una hora',
        recibidoEn: haceHoras(6) } },
    { id: 11, tipo: 'cancelar_instancia', origen: 'correo', confianza: 'alta',
      estado: estado.deshechas.has(11) ? 'deshecha' : 'aplicada',
      creadaEn: haceHoras(7), deshechaEn: null, porElla: true, ensayo: false,
      titulo: 'Cálculo', resumen: null,
      objetivo: { inicio: en(16), fin: en(17), desdeInicio: null },
      compromiso: { id: 1, titulo: 'Cálculo' },
      correo: { remitente: 'ramirez@uni.edu.co', asunto: 'Clase de hoy',
        recibidoEn: haceHoras(7) } },
  ],
})


/** El libro contable de mentira: un mes con vida, para ver la pantalla. */
const tesoro = () => {
  const mes = hoy().slice(0, 7)
  const dia = (d) => `${mes}-${String(d).padStart(2, '0')}`
  const mov = (id, d, tipo, monto, contraparte, categoria, concepto = null, moneda = 'COP') =>
    ({ id, fecha: dia(d), tipo, monto, moneda, montoCop: moneda === 'COP' ? monto : null,
       contraparte, concepto, categoria, correoId: id, estado: 'registrado' })

  const movimientos = [
    mov(1, 1, 'ingreso', 320000000, 'Nómina', 'ingreso', 'Quincena'),
    mov(2, 2, 'egreso', 180000000, 'Inmobiliaria Norte', 'arriendo', 'Arriendo'),
    mov(3, 3, 'egreso', 24500000, 'Almacenes Éxito', 'mercado'),
    mov(4, 4, 'egreso', 8990000, 'Rappi', 'restaurantes'),
    mov(5, 5, 'egreso', 4500000, 'Claro Colombia', 'servicios', 'Plan celular'),
    mov(6, 6, 'egreso', 3800000, 'Uber', 'transporte'),
    mov(7, 7, 'egreso', 8990000, 'Rappi', 'restaurantes'),
    mov(8, 8, 'egreso', 2000, 'OpenAI', 'suscripciones', 'ChatGPT Plus', 'USD'),
    mov(9, 9, 'ingreso', 45000000, 'Juan Pérez', 'transferencia', 'Nequi'),
  ]

  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso' && m.moneda === 'COP')
    .reduce((t, m) => t + m.monto, 0)
  const egresos = movimientos.filter((m) => m.tipo === 'egreso' && m.moneda === 'COP')
    .reduce((t, m) => t + m.monto, 0)

  const porCategoria = Object.entries(
    movimientos.filter((m) => m.tipo === 'egreso' && m.moneda === 'COP')
      .reduce((acc, m) => ({ ...acc, [m.categoria]: (acc[m.categoria] ?? 0) + m.monto }), {}))
    .map(([categoria, total]) => ({
      categoria,
      nombre: { arriendo: 'Arriendo', mercado: 'Mercado', restaurantes: 'Restaurantes',
                servicios: 'Servicios', transporte: 'Transporte' }[categoria] ?? categoria,
      total,
    }))
    .sort((a, b) => b.total - a.total)

  return {
    disponible: true,
    desde: dia(1), hasta: dia(28),
    ingresos, egresos, neto: ingresos - egresos,
    porCategoria,
    movimientos: [...movimientos].reverse(),
    cuentasPorPagar: [
      { id: 1, acreedor: 'Arriendo septiembre', monto: 180000000, moneda: 'COP',
        venceEl: dia(28), diasRestantes: 2 },
      { id: 2, acreedor: 'Tarjeta Visa', monto: 62400000, moneda: 'COP',
        venceEl: dia(28), diasRestantes: 9 },
    ],
    sospechas: [{ contraparte: 'Rappi', monto: 8990000, veces: 2 }],
    moneda: 'COP',
  }
}

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

/**
 * El intérprete de mentira: empareja palabras sueltas.
 *
 * Divergencia deliberada del backend real: aquí una cancelación SIEMPRE
 * pide confirmación, aunque venga escrita, para poder revisar ese flujo sin
 * tener el transcriptor. En la asistente de verdad sólo confirma lo que
 * llega por voz.
 */
function interpretar(texto) {
  // Sin tildes: "cancélame" tiene que emparejar con "cancel".
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  if (t.includes('cancel') || t.includes('quita')) {
    return [{
      herramienta: 'cancelar', estado: 'confirma',
      entendido: 'cancelar «Gimnasio» el viernes 7 de agosto',
      respuesta: 'Entendí: cancelar «Gimnasio» el viernes 7 de agosto. ¿Lo hago?',
      confirmaId: 77,
    }]
  }
  if (t.includes('que') || t.includes('?')) {
    return [{
      herramienta: 'consultar_agenda', estado: 'respuesta',
      entendido: 'qué tienes hoy',
      respuesta: 'Te queda hoy: 16:00 Grupo de estudio · 20:00 Estudiar para el parcial. Tienes 2 h libres entre las 18:00 y las 20:00.',
    }]
  }
  if (t.includes('anot') || t.includes('recuérdame') || t.includes('acuérdate')) {
    const titulo = texto.replace(/^.*?(an[oó]tame|an[oó]ta|recu[eé]rdame)\s*/i, '')
    const id = intenciones.length + 1
    intenciones.push({
      id, titulo: titulo || texto, detalle: null, prioridad: 'normal',
      duracionMin: 30, venceEl: null, estado: 'pendiente', origen: 'texto',
      googleEventId: null,
    })
    return [{
      herramienta: 'anotar_pendiente', estado: 'hecho',
      entendido: `anotar «${titulo || texto}»`,
      respuesta: `Anotado: «${titulo || texto}» (30 min, normal).`,
    }]
  }
  return [{
    herramienta: 'nada', estado: 'nada', entendido: 'nada claro',
    respuesta: 'No te entendí. Dímelo de otra forma.',
  }]
}

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
  if (req.method === 'GET' && ruta === '/tesoro') return responder(res, 200, tesoro())
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
    // El transcriptor de mentira: se traga el audio y devuelve algo fijo.
    if (ruta === '/transcribir') {
      let bytes = 0
      req.on('data', (t) => { bytes += t.length })
      req.on('end', () => {
        responder(res, 200, {
          texto: 'cancélame el gimnasio del viernes',
          confianza: bytes > 20_000 ? 'alta' : 'baja',
          segmentos: [{ texto: 'cancélame el gimnasio del viernes', confianza: 'alta' }],
          boleta: 'de-mentira',
        })
      })
      return
    }

    if (ruta === '/instruccion') {
      let cuerpo = ''
      req.on('data', (t) => { cuerpo += t })
      req.on('end', () => {
        const { texto = '' } = JSON.parse(cuerpo || '{}')
        const resultados = interpretar(texto)
        responder(res, 200, {
          texto: resultados.map((r) => r.respuesta).join(' '),
          resultados,
        })
      })
      return
    }

    const confirmar = ruta.match(/^\/instrucciones\/(\d+)\/(confirmar|descartar)$/)
    if (confirmar) {
      const acepta = confirmar[2] === 'confirmar'
      if (acepta) estado.deshechas.add(11)
      return responder(res, 200, {
        herramienta: 'cancelar', estado: acepta ? 'hecho' : 'nada',
        entendido: 'cancelar «Gimnasio» el viernes 7 de agosto',
        respuesta: acepta
          ? 'Listo: cancelar «Gimnasio» el viernes 7 de agosto.'
          : 'Bueno. Dímelo otra vez y lo vuelvo a intentar.',
      })
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
