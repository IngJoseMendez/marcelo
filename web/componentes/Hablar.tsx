'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const DURACIONES = [15, 30, 60, 120] as const
const PRIORIDADES = ['baja', 'normal', 'alta', 'urgente'] as const

const SUGERENCIAS = [
  'Estudiar para el parcial',
  'Responder el correo de la beca',
  'Terminar el taller de Álgebra',
]

/**
 * La lámina de hablarle.
 *
 * Hoy escribe: lo que le digas entra a la bandeja como algo por hacer, con su
 * prioridad y su duración. Entender órdenes («cancélame el gimnasio del
 * viernes») necesita el intérprete, que vive con el canal de voz de Telegram;
 * cuando exista, este mismo formulario apunta ahí sin cambiar de sitio.
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
  const [duracion, setDuracion] = useState<number>(30)
  const [prioridad, setPrioridad] = useState<string>('normal')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierta) return
    setTexto(textoInicial)
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
    const titulo = texto.trim()
    if (!titulo || enviando) return

    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/intenciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titulo, duracionMin: duracion, prioridad }),
      })
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
        setError(cuerpo.error ?? 'No se pudo anotar')
        return
      }
      setTexto('')
      alCerrar()
      alHecho('Anotado en la bandeja.')
      router.refresh()
    } catch {
      setError('No se pudo llegar a la asistente')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section
      className="hoja" data-abierto={abierta ? 'true' : 'false'}
      role="dialog" aria-modal="true" aria-label="Hablarle a la asistente"
      aria-hidden={abierta ? undefined : true}
    >
      <div className="hoja__asa" aria-hidden="true" />
      <div className="hoja__cab">
        <h2 className="hoja__titulo">Háblale</h2>
        <button className="hoja__cerrar" type="button" onClick={alCerrar}>Cerrar</button>
      </div>

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

      <form className="compositor" onSubmit={enviar}>
        <input
          ref={campo} className="campo" type="text" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="¿Qué tienes que hacer?" autoComplete="off"
          aria-label="Escríbele a la asistente"
        />
        <button className="enviar" type="submit" disabled={enviando || !texto.trim()}>
          {enviando ? 'Anotando…' : 'Anotar'}
        </button>
      </form>

      {error && <p className="entrar__error" style={{ marginBottom: 12 }}>{error}</p>}

      <div className="ajustes">
        <div className="ajuste">
          <p className="ajuste__rotulo">CUÁNTO TOMA</p>
          <div className="ajuste__ops">
            {DURACIONES.map((d) => (
              <button
                key={d} className="ajuste__op" type="button"
                aria-pressed={duracion === d}
                onClick={() => setDuracion(d)}
              >
                {d < 60 ? `${d}m` : `${d / 60}h`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ajustes">
        <div className="ajuste">
          <p className="ajuste__rotulo">QUÉ TAN URGENTE</p>
          <div className="ajuste__ops">
            {PRIORIDADES.map((p) => (
              <button
                key={p} className="ajuste__op" type="button"
                aria-pressed={prioridad === p}
                onClick={() => setPrioridad(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pulsar">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2.8" width="6" height="11" rx="3" /><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0" /><path d="M12 18v3.2" /></svg>
        Hablarle llega con el canal de voz
      </div>
    </section>
  )
}
