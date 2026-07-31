'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Rejilla } from './Rejilla'
import { firmaDe } from '@/lib/textos'
import { duracion, fechaLarga, hora, masDias, relativa } from '@/lib/tiempo'
import type { EventoJornada, Jornada } from '@/lib/tipos'

const PREFERENCIA = 'sc-vista-jornada'

function Firma({ evento }: { evento: EventoJornada }) {
  if (!evento.marca) return null
  const suya = evento.marca.porElla
  return (
    <Link
      className="evento__firma" href="/cronica"
      data-quien={suya ? 'ella' : 'tu'}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {evento.marca.tipo === 'cancelar_instancia'
          ? <path d="M6 6l12 12M18 6 6 18" />
          : evento.marca.tipo === 'mover_evento'
            ? <path d="M4 12h13M13 7l5 5-5 5" />
            : <path d="M12 5v14M5 12h14" />}
      </svg>
      <span>{firmaDe(evento.marca)}</span>
      <svg className="evento__firma-flecha" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
    </Link>
  )
}

function Lista({ jornada }: { jornada: Jornada }) {
  const conHora = jornada.eventos.filter((e) => !e.todoElDia)
  const ahoraMs = Date.parse(jornada.ahora)
  let puestaLaLinea = !jornada.esHoy

  return (
    <div className="parrilla">
      {conHora.map((e, i) => {
        const antes = !puestaLaLinea && Date.parse(e.inicio) > ahoraMs
        if (antes) puestaLaLinea = true
        return (
          <div key={e.id}>
            {antes && <LineaAhora ahora={jornada.ahora} />}
            <div
              className="fila" data-anim style={{ '--i': i } as React.CSSProperties}
              data-quien={e.marca?.porElla ? 'ella' : 'tu'}
              data-momento={e.momento}
              data-estado={e.estado}
            >
              <p className="fila__hora">{hora(e.inicio)}</p>
              <div className="fila__hilo"><span className="fila__nodo" /></div>
              <article className="tarjeta evento">
                <h3 className="evento__titulo">{e.titulo}</h3>
                <p className="evento__meta">
                  {hora(e.inicio)}–{hora(e.fin)}
                  {e.estado === 'cancelado' ? ' · cancelada' : ''}
                </p>
                <Firma evento={e} />
              </article>
            </div>
          </div>
        )
      })}
      {!puestaLaLinea && <LineaAhora ahora={jornada.ahora} />}
    </div>
  )
}

function LineaAhora({ ahora }: { ahora: string }) {
  return (
    <div className="ahora" data-anim>
      <p className="ahora__hora">{hora(ahora)}</p>
      <div className="ahora__hilo" />
      <div className="ahora__barra">
        <span className="ahora__texto">ahora</span>
        <span className="ahora__linea" />
      </div>
    </div>
  )
}

export function VistaJornada({ jornada }: { jornada: Jornada }) {
  const router = useRouter()
  const [vista, setVista] = useState<'lista' | 'agenda'>('lista')
  const hoy = jornada.ahora.slice(0, 10)

  useEffect(() => {
    const guardada = window.localStorage.getItem(PREFERENCIA)
    if (guardada === 'agenda' || guardada === 'lista') setVista(guardada)
  }, [])

  function cambiar(a: 'lista' | 'agenda') {
    setVista(a)
    try { window.localStorage.setItem(PREFERENCIA, a) } catch { /* incógnito */ }
  }

  const todoElDia = jornada.eventos.filter((e) => e.todoElDia)
  const libres = [...jornada.huecos]
    .filter((h) => Date.parse(h.fin) > Date.parse(jornada.ahora))
    .sort((a, b) => b.minutos - a.minutos)
  const mayor = libres[0]

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">{relativa(jornada.fecha, hoy)}</p>
        <h1 className="titular">{fechaLarga(jornada.fecha)}</h1>
      </div>

      {jornada.modoSombra && (
        <div className="aviso aviso--lumen" data-anim>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
          <span>
            Modo sombra: por ahora sólo ensaya. Lo que dice que habría hecho no
            está tocando tu calendario.
          </span>
        </div>
      )}

      <div className="seccion" data-anim>
        <div className="conmutador" role="group" aria-label="Cómo ver el día">
          <button
            className="conmutador__op" type="button"
            aria-pressed={vista === 'lista'} onClick={() => cambiar('lista')}
          >
            Lista
          </button>
          <button
            className="conmutador__op" type="button"
            aria-pressed={vista === 'agenda'} onClick={() => cambiar('agenda')}
          >
            Agenda
          </button>
        </div>

        <Link
          className="contador" href="/cronica"
          data-vacio={jornada.cambiosDeElla === 0 ? 'true' : 'false'}
        >
          <span className="nodo" data-quien={jornada.cambiosDeElla ? 'ella' : 'tu'} aria-hidden="true" />
          {jornada.cambiosDeElla === 0
            ? 'hoy no tocó nada'
            : jornada.cambiosDeElla === 1 ? '1 cambio de ella' : `${jornada.cambiosDeElla} cambios de ella`}
        </Link>
      </div>

      {todoElDia.length > 0 && (
        <div className="huecos" data-anim>
          {todoElDia.map((e) => (
            <span key={e.id} className="hueco-chip">{e.titulo}<small>todo el día</small></span>
          ))}
        </div>
      )}

      {jornada.eventos.length === 0 ? (
        <div className="tarjeta vacio" data-anim>
          <strong>El día está limpio</strong>
          Nada en el calendario. Si tienes algo por hacer, dilo con el botón de
          abajo y cae en la bandeja.
        </div>
      ) : vista === 'lista' ? (
        <Lista jornada={jornada} />
      ) : (
        <Rejilla
          eventos={jornada.eventos}
          huecos={jornada.huecos}
          ventana={jornada.ventana}
          ahora={jornada.ahora}
          esHoy={jornada.esHoy}
          alTocarHueco={(h) =>
            router.push(`/bandeja?desde=${encodeURIComponent(h.inicio)}&minutos=${h.minutos}`)}
        />
      )}

      <p className="pie" data-anim>
        {mayor
          ? `Tienes ${duracion(mayor.minutos)} libre${mayor.minutos >= 60 ? 's' : ''} entre las ${hora(mayor.inicio)} y las ${hora(mayor.fin)}.`
          : 'No queda hueco libre en lo que resta del día.'}
        {' '}
        <Link className="pie__enlace" href="/bandeja">Ver qué cabe ahí</Link>.
      </p>

      <nav className="acciones" aria-label="Cambiar de día" style={{ marginTop: 18 }}>
        <Link className="btn btn--fantasma" href={`/?fecha=${masDias(jornada.fecha, -1)}`}>
          ‹ Día anterior
        </Link>
        {jornada.fecha !== hoy && <Link className="btn" href="/">Hoy</Link>}
        <Link className="btn btn--fantasma" href={`/?fecha=${masDias(jornada.fecha, 1)}`}>
          Día siguiente ›
        </Link>
      </nav>
    </section>
  )
}
