import type { Reloj } from '../puertos/reloj.ts'
import type { AccionDestructiva, SumideroCalendario } from '../puertos/sumidero-calendario.ts'
import type { RepoCompromisos } from '../repos/compromisos.ts'
import type { RepoCorreos } from '../repos/correos.ts'
import type { RepoAcciones } from '../repos/acciones.ts'
import type { Clasificador } from './clasificador.ts'
import type { Extractor } from './extractor.ts'
import type { Desempate } from './desempate.ts'
import type { Confianza, CorreoCrudo, Proveedor } from '../dominio/tipos.ts'
import { esRuidoObvio } from './prefiltro.ts'
import { resolverReferente } from '../dominio/fechas.ts'
import { resolver } from '../dominio/resolutor.ts'
import { decidir, type Decision, type TipoAccion } from '../dominio/politica.ts'
import { aplicarConInversa } from './actuador.ts'

export interface DepsProcesador {
  reloj: Reloj
  repoCompromisos: RepoCompromisos
  repoCorreos: RepoCorreos
  repoAcciones: RepoAcciones
  clasificador: Clasificador
  extractor: Extractor
  desempate: Desempate
  /** Si es un CalendarioSombra, el pipeline entero ensaya sin escribir. */
  calendario: SumideroCalendario
  remitentesIgnorados: readonly string[]
  remitentesSilenciados: readonly string[]
}

export interface ResultadoProceso {
  decision: Decision | 'descartado'
  accionId: number | null
  motivo: string
}

const descartar = (motivo: string): ResultadoProceso => ({
  decision: 'descartado', accionId: null, motivo,
})

export function crearProcesador(d: DepsProcesador) {
  return {
    async procesar(correo: CorreoCrudo, proveedor: Proveedor): Promise<ResultadoProceso> {
      // 1. Prefiltro sin costo.
      if (esRuidoObvio(correo, proveedor, d.remitentesIgnorados)) {
        return descartar('Filtrado antes de tocar el modelo')
      }

      // 2. Idempotencia: el mismo correo nunca produce dos acciones.
      const { id: correoId, nuevo } = await d.repoCorreos.registrarSiEsNuevo(correo)
      if (!nuevo) return descartar('Ya estaba procesado')

      // 3. Clasificar con el modelo barato.
      const { clasificacion } = await d.clasificador.clasificar(correo)
      await d.repoCorreos.marcarProcesado(correoId, clasificacion)
      if (clasificacion !== 'agenda') return descartar(`Clasificado como ${clasificacion}`)

      // 4. Extraer hechos tipados.
      const hecho = await d.extractor.extraer(correo, correo.recibidoEn)
      if (hecho.intencion === 'ninguna') return descartar('No cambia la agenda')
      if (hecho.intencion === 'crear') {
        return descartar('Crear compromisos desde correo no entra en esta fase')
      }

      // 5. Resolver el momento y el compromiso. Todo en código.
      const resuelto = resolverReferente(hecho.referente, d.reloj.ahora())
      const intervalo = resuelto?.intervalo ?? null
      const ambiguo = resuelto?.ambiguo ?? false

      const texto = `${correo.asunto ?? ''}\n${correo.cuerpo}`
      const resolucion = resolver({
        compromisos: await d.repoCompromisos.listarActivos(),
        remitente: correo.remitente,
        texto,
        intervalo,
        ambiguo,
        threadCompromisoId: await d.repoCorreos.compromisoDelHilo(
          correo.cuentaId, correo.threadId),
      })

      let compromisoId: number
      let confianza: Confianza

      if (resolucion.estado === 'sin_candidatos') {
        return descartar('Ningún compromiso coincide')
      }
      if (resolucion.estado === 'empate') {
        const elegido = await d.desempate.elegir(resolucion.candidatos, texto)
        if (!elegido) {
          return { decision: 'preguntar', accionId: null, motivo: 'Empate sin resolver' }
        }
        compromisoId = elegido.compromiso.id
        // Hubo que desempatar: eso nunca es confianza alta.
        confianza = 'media'
      } else {
        compromisoId = resolucion.candidato.compromiso.id
        confianza = resolucion.confianza
      }

      const compromiso = await d.repoCompromisos.porId(compromisoId)
      if (!compromiso?.googleEventId) {
        return descartar('El compromiso no tiene evento en el calendario')
      }
      if (!intervalo) return descartar('No se pudo situar la instancia en el tiempo')

      const instancias = await d.calendario.instanciasEnRango(
        compromiso.googleCalendarId, compromiso.googleEventId,
        intervalo.inicio.toISO()!, intervalo.fin.toISO()!)
      const instancia = instancias.find((i) => i.estado === 'confirmado')
      if (!instancia) return descartar('No hay instancia confirmada en esa ventana')

      // 6. Política. Sin tokens, sin red.
      const tipo: TipoAccion =
        hecho.intencion === 'cancelar' ? 'cancelar_instancia' : 'mover_evento'

      const decision = decidir({
        origen: 'correo',
        tipo,
        confianza,
        silenciadoPorRegla: d.remitentesSilenciados.some(
          (r) => correo.remitente.toLowerCase().includes(r.toLowerCase())),
      })

      if (decision === 'preguntar' || decision === 'confirmar' || decision === 'ignorar') {
        return { decision, accionId: null, motivo: 'Necesita que Marcelo decida' }
      }

      // 7. Actuar, guardando primero cómo deshacerlo.
      const fecha = intervalo.inicio.toISODate()!
      const accion: AccionDestructiva = tipo === 'cancelar_instancia'
        ? {
            tipo: 'cancelar_instancia',
            calendarId: compromiso.googleCalendarId,
            instanciaId: instancia.instanciaId,
          }
        : {
            tipo: 'mover_evento',
            calendarId: compromiso.googleCalendarId,
            instanciaId: instancia.instanciaId,
            nuevoInicio: `${fecha}T${hecho.nuevoInicio ?? compromiso.horaInicio}:00`,
            nuevoFin: `${fecha}T${hecho.nuevoFin ?? compromiso.horaFin}:00`,
          }

      const inversa = await aplicarConInversa(
        d.calendario, accion, instancia, compromiso.rrule)

      // El estado sale del propio sumidero: si ensayó, se marca sombra.
      // Así nunca queda una acción "aplicada" que no se aplicó, ni una
      // "sombra" que sí tocó el calendario de verdad.
      const enSombra = d.calendario.sombra
      const accionId = await d.repoAcciones.registrar({
        tipo, origen: 'correo', correoId, compromisoId, confianza,
        payloadAplicado: accion, payloadInverso: inversa,
        estado: enSombra ? 'sombra' : 'aplicada',
      })

      return { decision, accionId, motivo: enSombra ? 'Registrada en sombra' : 'Aplicada' }
    },
  }
}

export type Procesador = ReturnType<typeof crearProcesador>
