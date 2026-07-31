'use client'

import { useEffect, useRef } from 'react'
import { disponer, horasDe, minutosDeVentana, posicionDe } from '@/lib/rejilla'
import { duracion, hora } from '@/lib/tiempo'
import type { EventoJornada, Hueco } from '@/lib/tipos'

/** Debe coincidir con --minuto en globals.css. */
const PX = 1.15
const ALTO_MINIMO = 22
/** Por debajo de esto el hueco no cabe ni su propia etiqueta. */
const HUECO_VISIBLE = 25

/**
 * La vista de agenda: horas a la izquierda, cada evento como un bloque cuya
 * altura es su duración, los solapes en columnas y el tiempo libre dibujado.
 *
 * Una lista es ciega al espacio vacío. Aquí el hueco de dos horas entre
 * clases se ve —y es donde aterriza la bandeja: ver el hueco y ver lo que
 * cabe en él es la misma operación.
 */
export function Rejilla({
  eventos,
  huecos,
  ventana,
  ahora,
  esHoy,
  alTocarHueco,
}: {
  eventos: EventoJornada[]
  huecos: Hueco[]
  ventana: { inicio: string; fin: string }
  ahora: string
  esHoy: boolean
  alTocarHueco?: (hueco: Hueco) => void
}) {
  const lineaAhora = useRef<HTMLDivElement>(null)
  const total = minutosDeVentana(ventana)
  const marcas = horasDe(ventana)
  const bloques = disponer(eventos.filter((e) => !e.todoElDia), ventana)
  const posicionAhora = esHoy ? posicionDe(ahora, ventana) : null

  // Abrir el día por donde uno está, no por las 7 de la mañana.
  useEffect(() => {
    lineaAhora.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div className="rejilla" style={{ height: total * PX }}>
      <div className="rejilla__horas" aria-hidden="true">
        {marcas.map((m) => (
          <span key={m.desde} className="rejilla__hora" style={{ top: m.desde * PX }}>
            {m.etiqueta}
          </span>
        ))}
      </div>

      <div className="rejilla__lienzo">
        {marcas.map((m) => (
          <span key={m.desde} className="rejilla__pauta" style={{ top: m.desde * PX }} aria-hidden="true" />
        ))}

        {huecos
          .filter((h) => h.minutos >= HUECO_VISIBLE)
          .map((h) => {
            const desde = posicionDe(h.inicio, ventana) ?? 0
            const alto = Math.max(h.minutos * PX, ALTO_MINIMO)
            const contenido = `${duracion(h.minutos)} libre${h.minutos >= 60 ? 's' : ''}`
            return alTocarHueco ? (
              <button
                key={h.inicio} type="button" className="rejilla__hueco"
                style={{ top: desde * PX, height: alto }}
                onClick={() => alTocarHueco(h)}
                aria-label={`Ver qué cabe en ${contenido} desde las ${hora(h.inicio)}`}
              >
                <b aria-hidden="true">+</b>{contenido}
              </button>
            ) : (
              <span
                key={h.inicio} className="rejilla__hueco"
                style={{ top: desde * PX, height: alto }}
              >
                {contenido}
              </span>
            )
          })}

        {bloques.map((b) => {
          const e = b.evento
          const alto = Math.max(b.minutos * PX, ALTO_MINIMO)
          const ancho = 100 / b.columnas
          return (
            <article
              key={e.id}
              className={`bloque-ev${alto < 34 ? ' bloque-ev--corto' : ''}`}
              data-quien={e.marca?.porElla ? 'ella' : 'tu'}
              data-momento={e.momento}
              data-estado={e.estado}
              style={{
                top: b.desde * PX,
                height: alto,
                left: `${b.columna * ancho}%`,
                width: `calc(${ancho}% - 5px)`,
              }}
            >
              <p className="bloque-ev__titulo">{e.titulo}</p>
              <p className="bloque-ev__hora">
                {hora(e.inicio)}–{hora(e.fin)}
                {e.marca?.porElla ? ' · ella' : ''}
              </p>
            </article>
          )
        })}

        {posicionAhora !== null && (
          <div
            ref={lineaAhora} className="rejilla__ahora"
            style={{ top: posicionAhora * PX }}
          >
            <span>{hora(ahora)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
