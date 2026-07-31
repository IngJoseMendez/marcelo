'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ResultadoOrden, RespuestaInstruccion } from '@/lib/tipos'

const SUGERENCIAS = [
  '¿Qué me queda hoy?',
  'Anótame estudiar para el parcial, dos horas',
  'Cancélame el gimnasio del viernes',
]

/** Lo que el navegador de turno sepa grabar. Chrome webm, Safari mp4. */
const TIPOS = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

const BARRAS = 15

interface Oido {
  texto: string
  confianza: 'alta' | 'media' | 'baja'
  boleta: string
}

/**
 * La lámina de hablarle: el canal de instrucciones, con la misma boca que
 * Telegram.
 *
 * Al soltar el micrófono muestra la transcripción ANTES de ejecutar nada,
 * para que él vea qué se entendió. Y si la orden toca algo que ya está en
 * el calendario, todavía pide confirmación: una transcripción puede cambiar
 * «mañana» por «semana», y ahí el riesgo no es perder algo irrecuperable,
 * es tocar el evento equivocado.
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
  const onda = useRef<HTMLSpanElement>(null)
  const grabadora = useRef<MediaRecorder | null>(null)
  const pista = useRef<MediaStream | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const cuadro = useRef<number | null>(null)

  const [texto, setTexto] = useState(textoInicial)
  const [oido, setOido] = useState<Oido | null>(null)
  const [resultados, setResultados] = useState<ResultadoOrden[] | null>(null)
  const [estado, setEstado] = useState<'idle' | 'grabando' | 'oyendo' | 'pensando'>('idle')
  const [ocupado, setOcupado] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [puedeGrabar, setPuedeGrabar] = useState(false)

  useEffect(() => {
    setPuedeGrabar(
      typeof window !== 'undefined'
      && typeof window.MediaRecorder !== 'undefined'
      && Boolean(navigator.mediaDevices?.getUserMedia))
  }, [])

  const soltarMicro = useCallback(() => {
    if (cuadro.current !== null) cancelAnimationFrame(cuadro.current)
    cuadro.current = null
    pista.current?.getTracks().forEach((t) => t.stop())
    pista.current = null
    void audio.current?.close()
    audio.current = null
    // Las barras vuelven a su reposo: dejarlas congeladas parece que sigue oyendo.
    onda.current?.querySelectorAll('span').forEach((b) => {
      b.style.setProperty('--h', '0.18')
    })
  }, [])

  useEffect(() => {
    if (!abierta) return
    setTexto(textoInicial)
    setResultados(null)
    setOido(null)
    setError(null)
    const t = window.setTimeout(() => campo.current?.focus(), 340)
    return () => window.clearTimeout(t)
  }, [abierta, textoInicial])

  useEffect(() => () => soltarMicro(), [soltarMicro])

  useEffect(() => {
    if (!abierta) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierta, alCerrar])

  // ── el micrófono ─────────────────────────────────────────────

  function medirNivel(fuente: MediaStream) {
    const contexto = new AudioContext()
    audio.current = contexto
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 64
    contexto.createMediaStreamSource(fuente).connect(analizador)
    const datos = new Uint8Array(analizador.frequencyBinCount)

    const pintar = () => {
      analizador.getByteFrequencyData(datos)
      const barras = onda.current?.querySelectorAll('span')
      if (barras) {
        const porBarra = Math.max(1, Math.floor(datos.length / BARRAS))
        barras.forEach((barra, i) => {
          let suma = 0
          for (let j = 0; j < porBarra; j++) suma += datos[i * porBarra + j] ?? 0
          const nivel = suma / porBarra / 255
          barra.style.setProperty('--h', String(Math.max(0.18, Math.min(1, nivel * 2.2))))
        })
      }
      cuadro.current = requestAnimationFrame(pintar)
    }
    cuadro.current = requestAnimationFrame(pintar)
  }

  async function empezar() {
    if (estado !== 'idle' || !puedeGrabar) return
    setError(null)
    try {
      const fuente = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      pista.current = fuente
      const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t))
      const grabador = new MediaRecorder(fuente, tipo ? { mimeType: tipo } : undefined)
      const trozos: Blob[] = []
      grabador.ondataavailable = (e) => { if (e.data.size > 0) trozos.push(e.data) }
      grabador.onstop = () => {
        soltarMicro()
        void transcribir(new Blob(trozos, { type: grabador.mimeType || 'audio/webm' }))
      }
      grabadora.current = grabador
      grabador.start()
      medirNivel(fuente)
      setEstado('grabando')
    } catch {
      soltarMicro()
      setEstado('idle')
      setError('No pude usar el micrófono. Revisa el permiso del navegador.')
    }
  }

  function terminar() {
    if (estado !== 'grabando') return
    setEstado('oyendo')
    grabadora.current?.stop()
    grabadora.current = null
  }

  async function transcribir(nota: Blob) {
    if (nota.size < 1200) {
      setEstado('idle')
      setError('Muy corto. Mantén pulsado mientras hablas.')
      return
    }
    try {
      const r = await fetch('/api/transcribir', {
        method: 'POST',
        headers: { 'content-type': nota.type || 'audio/webm' },
        body: nota,
      })
      const datos = (await r.json().catch(() => ({}))) as Partial<Oido> & { error?: string }
      if (!r.ok || !datos.texto) {
        setError(datos.error ?? 'No entendí el audio')
        return
      }
      setOido(datos as Oido)
      setTexto(datos.texto)
      setResultados(null)
      campo.current?.focus()
    } catch {
      setError('No se pudo llegar a la asistente')
    } finally {
      setEstado('idle')
    }
  }

  // ── mandar la orden ──────────────────────────────────────────

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const orden = texto.trim()
    if (!orden || estado === 'pensando') return

    setEstado('pensando')
    setError(null)
    try {
      const r = await fetch('/api/instruccion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // La boleta viaja tal cual: si él corrigió una palabra, la firma ya
        // no cuadra y la asistente lo trata como texto escrito, que es
        // exactamente lo que pasó a ser.
        body: JSON.stringify({ texto: orden, boleta: oido?.boleta }),
      })
      const datos = (await r.json().catch(() => ({}))) as
        Partial<RespuestaInstruccion> & { error?: string }

      if (!r.ok || !datos.resultados) {
        setError(datos.error ?? 'No pude entenderte')
        return
      }

      setResultados(datos.resultados)
      setTexto('')
      setOido(null)
      if (datos.resultados.some((o) => o.estado === 'hecho')) router.refresh()
    } catch {
      setError('No se pudo llegar a la asistente')
    } finally {
      setEstado('idle')
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
      className="hoja" data-abierto={abierta ? 'true' : 'false'} data-estado={estado}
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
              {o.estado !== 'confirma' && o.estado !== 'nada' && o.entendido && (
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
              onClick={() => { setTexto(s); setOido(null); campo.current?.focus() }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {oido && (
        <p className="oido" data-confianza={oido.confianza}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 8.5a8 8 0 0 1 16 0M7.5 12a4.5 4.5 0 0 1 9 0M12 12v5.5" /></svg>
          <span>
            {oido.confianza === 'baja'
              ? 'No te oí del todo bien. Léelo antes de mandarlo.'
              : 'Esto oí. Corrígelo si hace falta y dale a Decir.'}
          </span>
        </p>
      )}

      <form className="compositor" onSubmit={enviar}>
        <input
          ref={campo} className="campo" type="text" value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Dile qué hacer…" autoComplete="off"
          aria-label="Escríbele a la asistente"
        />
        <button
          className="enviar" type="submit"
          disabled={estado === 'pensando' || !texto.trim()}
        >
          {estado === 'pensando' ? 'Pensando…' : 'Decir'}
        </button>
      </form>

      {error && <p className="entrar__error" style={{ marginBottom: 12 }}>{error}</p>}

      <button
        className="pulsar" type="button" disabled={!puedeGrabar || estado === 'pensando'}
        onPointerDown={(e) => { e.preventDefault(); void empezar() }}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void empezar() }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); terminar() }
        }}
      >
        {estado === 'grabando' ? (
          <>
            <span className="onda" ref={onda} aria-hidden="true">
              {Array.from({ length: BARRAS }, (_, i) => <span key={i} />)}
            </span>
            Suelta para terminar
          </>
        ) : estado === 'oyendo' ? (
          'Oyéndote…'
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2.8" width="6" height="11" rx="3" /><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0" /><path d="M12 18v3.2" /></svg>
            {puedeGrabar ? 'Mantén para hablar' : 'Este navegador no graba audio'}
          </>
        )}
      </button>
    </section>
  )
}
