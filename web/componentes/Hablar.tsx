'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoOrden, RespuestaInstruccion } from '@/lib/tipos'

const SUGERENCIAS = [
  '¿Qué me queda hoy?',
  'Anótame estudiar para el parcial, dos horas',
  'Cancélame el gimnasio del viernes',
]

/**
 * La lámina de hablarle: el canal de instrucciones, con la misma boca que
 * Telegram.
 *
 * Lo que ella entendió se enseña SIEMPRE, haya actuado o no. Y cuando la
 * orden viene de una transcripción y toca algo que ya está en el calendario,
 * no se hace hasta que él confirme: un toque, y de paso verifica que la
 * transcripción no cambió «mañana» por «semana».
 */
export function Hablar({
  abierta,
  textoInicial,
  alCerrar,
  alHecho,
}: {
  abierta: boolean
  textoInicial: string
  alCerrar: () => void
  alHecho: (mensaje: string) => void
}) {
  const router = useRouter()
  const campo = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState(textoInicial)
  const [resultados, setResultados] = useState<ResultadoOrden[] | null>(null)
  const [pensando, setPensando] = useState(false)
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierta) return
    setTexto(textoInicial)
    setResultados(null)
    setError(null)
    const t = window.setTimeout(() => campo.current?.focus(), 340)
    return () => window.clearTimeout(t)
  }, [abierta, textoInicial])

  useEffect(() => {
    if (!abierta) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierta, alCerrar])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const orden = texto.trim()
    if (!orden || pensando) return

    setPensando(true)
    setError(null)
    try {
      const r = await fetch('/api/instruccion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: orden }),
      })
      const datos = (await r.json().catch(() => ({}))) as
        Partial<RespuestaInstruccion> & { error?: string }

      if (!r.ok || !datos.resultados) {
        setError(datos.error ?? 'No pude entenderte')
        return
      }

      setResultados(datos.resultados)
      setTexto('')
      // Algo pudo cambiar en la agenda o en la bandeja: que las pantallas
      // de atrás no se queden contando el día anterior.
      if (datos.resultados.some((o) => o.estado === 'hecho')) router.refresh()
    } catch {
      setError('No se pudo llegar a la asistente')
    } finally {
      setPensando(false)
    }
  }

  async function responder(indice: number, id: number, ruta: 'confirmar' | 'descartar') {
    setOcupado(id)
    try {
      const r = await fetch(`/api/instrucciones/${id}/${ruta}`, { method: 'POST' })
      const datos = (await r.json().catch(() => ({}))) as ResultadoOrden & { error?: string }
      if (!r.ok) {
        alHecho(datos.error ?? 'No se pudo')
        return
      }
      setResultados((previos) =>
        (previos ?? []).map((o, i) => (i === indice ? { ...datos } : o)))
      if (ruta === 'confirmar') {
        alHecho(datos.respuesta)
        router.refresh()
      }
    } catch {
      alHecho('No se pudo llegar a la asistente')
    } finally {
      setOcupado(null)
    }
  }

  const hayRespuesta = resultados !== null && resultados.length > 0

  return (
    <section
      className="hoja" data-abierto={abierta ? 'true' : 'false'}
      data-estado={pensando ? 'pensando' : hayRespuesta ? 'listo' : 'idle'}
      role="dialog" aria-modal="true" aria-label="Hablarle a la asistente"
      aria-hidden={abierta ? undefined : true}
    >
      <div className="hoja__asa" aria-hidden="true" />
      <div className="hoja__cab">
        <h2 className="hoja__titulo">Háblale</h2>
        <button className="hoja__cerrar" type="button" onClick={alCerrar}>Cerrar</button>
      </div>

      {hayRespuesta ? (
        <div className="entendido">
          {resultados.map((o, i) => (
            <div className="entendido__caja" key={`${o.herramienta}-${i}`} data-estado={o.estado}>
              <p className="entendido__texto">{o.respuesta}</p>
              {o.estado === 'confirma' && (
                <>
                  <p className="entendido__nota">
                    Confirma antes de que lo toque. Así verificas también que te
                    entendí bien.
                  </p>
                  <div className="entendido__acciones">
                    <button
                      className="confirmar" type="button" disabled={ocupado === o.confirmaId}
                      onClick={() => responder(i, o.confirmaId!, 'confirmar')}
                    >
                      Confirmar
                    </button>
                    <button
                      className="rechazar" type="button" disabled={ocupado === o.confirmaId}
                      onClick={() => responder(i, o.confirmaId!, 'descartar')}
                    >
                      No, esa no
                    </button>
                  </div>
                </>
              )}
              {o.estado !== 'confirma' && o.entendido && o.estado !== 'nada' && (
                <p className="entendido__nota">Entendí: {o.entendido}</p>
              )}
            </div>
          ))}

          <div className="entendido__acciones">
            <button
              className="btn" type="button"
              onClick={() => { setResultados(null); campo.current?.focus() }}
            >
              Decirle otra cosa
            </button>
          </div>
        </div>
      ) : (
        <div className="sugerencias">
          {SUGERENCIAS.map((s) => (
            <button
              key={s} className="sugerencia" type="button"
              onClick={() => { setTexto(s); campo.current?.focus() }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form className="compositor" onSubmit={enviar}>
        <input
          ref={campo} className="campo" type="text" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Dile qué hacer…" autoComplete="off"
          aria-label="Escríbele a la asistente"
        />
        <button className="enviar" type="submit" disabled={pensando || !texto.trim()}>
          {pensando ? 'Pensando…' : 'Decir'}
        </button>
      </form>

      {error && <p className="entrar__error" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="pulsar">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2.8" width="6" height="11" rx="3" /><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0" /><path d="M12 18v3.2" /></svg>
        Hablarle con la voz llega con el transcriptor
      </div>
    </section>
  )
}
