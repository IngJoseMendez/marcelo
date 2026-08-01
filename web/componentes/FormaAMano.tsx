'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './contexto'

/**
 * Hacer las cosas escribiéndolas, sin pasar por ningún modelo.
 *
 * La IA es un añadido buenísimo, pero no puede ser el único camino hacia
 * sus propios datos. Si se acabó la cuota, si el proveedor está caído, si
 * no hay quien transcriba, o si sencillamente prefiere teclearlo exacto en
 * un bus, esto tiene que estar. Una agenda que sólo funciona cuando
 * funciona una API de terceros no es una agenda.
 *
 * Por debajo va por el mismo sitio que todo lo demás: la misma política,
 * la inversa guardada antes de aplicar, la misma auditoría y el mismo
 * deshacer. Lo único que se salta es la parte de *entender*, porque aquí
 * él ya dijo exactamente qué quiere.
 */

const DIAS = [
  { n: 1, corto: 'L', largo: 'lunes' },
  { n: 2, corto: 'M', largo: 'martes' },
  { n: 3, corto: 'X', largo: 'miércoles' },
  { n: 4, corto: 'J', largo: 'jueves' },
  { n: 5, corto: 'V', largo: 'viernes' },
  { n: 6, corto: 'S', largo: 'sábado' },
  { n: 7, corto: 'D', largo: 'domingo' },
]

const DURACIONES = [
  { min: 15, texto: '15 min' },
  { min: 30, texto: 'media hora' },
  { min: 60, texto: '1 hora' },
  { min: 120, texto: '2 horas' },
]

function Plegable({
  titulo, pista, children,
}: { titulo: string; pista: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="tarjeta a-mano" data-anim data-abierto={abierto}>
      <button
        type="button" className="a-mano__cabeza"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        <span className="a-mano__mas" aria-hidden="true">{abierto ? '−' : '+'}</span>
        <span>
          <strong>{titulo}</strong>
          <span className="a-mano__pista">{pista}</span>
        </span>
      </button>
      {abierto && <div className="a-mano__cuerpo">{children}</div>}
    </div>
  )
}

/** Apuntar algo pendiente. No toca el calendario: sólo la bandeja. */
export function FormaAnotar() {
  const router = useRouter()
  const { tostar } = useApp()
  const [titulo, setTitulo] = useState('')
  const [duracionMin, setDuracion] = useState(30)
  const [prioridad, setPrioridad] = useState('normal')
  const [vence, setVence] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || ocupado) return
    setOcupado(true)
    try {
      const r = await fetch('/api/intenciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          duracionMin,
          prioridad,
          // La fecha va con hora de fin de día: «vence el 5» quiere decir
          // que el 5 todavía vale, no que a las 00:00 ya se pasó.
          venceEl: vence ? `${vence}T23:59:00-05:00` : null,
        }),
      })
      if (!r.ok) {
        const c = (await r.json().catch(() => ({}))) as { error?: string }
        tostar(c.error ?? 'No se pudo anotar')
        return
      }
      setTitulo('')
      setVence('')
      tostar('Anotado')
      router.refresh()
    } catch {
      tostar('No se pudo llegar a la asistente')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Plegable titulo="Anotar algo a mano" pista="sin hablarle, sin IA">
      <form onSubmit={enviar}>
        <label className="a-mano__etiqueta" htmlFor="anotar-titulo">¿Qué tienes que hacer?</label>
        <input
          id="anotar-titulo" className="campo campo--ancho" value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Estudiar para el parcial de cálculo"
          maxLength={200} autoComplete="off"
        />

        <label className="a-mano__etiqueta">¿Cuánto te toma?</label>
        <div className="a-mano__fila">
          {DURACIONES.map((d) => (
            <button
              key={d.min} type="button"
              className="ficha" data-viva={duracionMin === d.min}
              onClick={() => setDuracion(d.min)}
            >{d.texto}</button>
          ))}
        </div>

        <div className="a-mano__par">
          <div>
            <label className="a-mano__etiqueta" htmlFor="anotar-prioridad">Qué tan urgente</label>
            <select
              id="anotar-prioridad" className="campo" value={prioridad}
              onChange={(e) => setPrioridad(e.target.value)}
            >
              <option value="baja">Cuando se pueda</option>
              <option value="normal">Normal</option>
              <option value="alta">Importante</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label className="a-mano__etiqueta" htmlFor="anotar-vence">Para cuándo (opcional)</label>
            <input
              id="anotar-vence" className="campo" type="date" value={vence}
              onChange={(e) => setVence(e.target.value)}
            />
          </div>
        </div>

        <button className="btn btn--principal a-mano__enviar" disabled={!titulo.trim() || ocupado}>
          {ocupado ? 'Anotando…' : 'Anotar'}
        </button>
        <p className="a-mano__nota">
          Si pones fecha límite, ella sube la prioridad sola cuando se acerque.
          Anotar no toca tu calendario: queda en la bandeja hasta que le busques hueco.
        </p>
      </form>
    </Plegable>
  )
}

/** Enseñarle un compromiso fijo. Esto sí crea el evento en el calendario. */
export function FormaPacto() {
  const router = useRouter()
  const { tostar } = useApp()
  const [titulo, setTitulo] = useState('')
  const [dias, setDias] = useState<number[]>([])
  const [horaInicio, setInicio] = useState('')
  const [horaFin, setFin] = useState('')
  const [remitente, setRemitente] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const listo = titulo.trim() && dias.length > 0 && horaInicio && horaFin
    && horaFin > horaInicio

  function alternar(n: number) {
    setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!listo || ocupado) return
    setOcupado(true)
    try {
      const r = await fetch('/api/pactos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          dias,
          horaInicio,
          horaFin,
          remitentes: remitente.trim() ? [remitente.trim()] : [],
        }),
      })
      const c = (await r.json().catch(() => ({}))) as { error?: string; mensaje?: string }
      if (!r.ok) {
        tostar(c.error ?? 'No se pudo')
        return
      }
      setTitulo(''); setDias([]); setInicio(''); setFin(''); setRemitente('')
      tostar(c.mensaje ?? 'Aprendido')
      router.refresh()
    } catch {
      tostar('No se pudo llegar a la asistente')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Plegable titulo="Enseñarle un compromiso a mano" pista="sin hablarle, sin IA">
      <form onSubmit={enviar}>
        <label className="a-mano__etiqueta" htmlFor="pacto-titulo">¿Cómo se llama?</label>
        <input
          id="pacto-titulo" className="campo campo--ancho" value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Laboratorio de Química" maxLength={200} autoComplete="off"
        />

        <label className="a-mano__etiqueta">¿Qué días?</label>
        <div className="a-mano__fila">
          {DIAS.map((d) => (
            <button
              key={d.n} type="button" className="ficha ficha--dia"
              data-viva={dias.includes(d.n)} onClick={() => alternar(d.n)}
              aria-label={d.largo} aria-pressed={dias.includes(d.n)}
            >{d.corto}</button>
          ))}
        </div>

        <div className="a-mano__par">
          <div>
            <label className="a-mano__etiqueta" htmlFor="pacto-desde">Desde</label>
            <input
              id="pacto-desde" className="campo" type="time" value={horaInicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="a-mano__etiqueta" htmlFor="pacto-hasta">Hasta</label>
            <input
              id="pacto-hasta" className="campo" type="time" value={horaFin}
              onChange={(e) => setFin(e.target.value)}
            />
          </div>
        </div>
        {horaInicio && horaFin && horaFin <= horaInicio && (
          <p className="a-mano__nota" data-mal="true">La hora de fin va después de la de inicio.</p>
        )}

        <label className="a-mano__etiqueta" htmlFor="pacto-remitente">
          ¿De qué correo llegan los avisos? (opcional)
        </label>
        <input
          id="pacto-remitente" className="campo campo--ancho" value={remitente}
          onChange={(e) => setRemitente(e.target.value)}
          placeholder="profesora@universidad.edu.co"
          inputMode="email" autoComplete="off" spellCheck={false}
        />

        <button className="btn btn--principal a-mano__enviar" disabled={!listo || ocupado}>
          {ocupado ? 'Aprendiendo…' : 'Enseñárselo'}
        </button>
        <p className="a-mano__nota">
          Esto sí crea el evento en tu calendario, y se repite cada semana. El
          correo es lo que le da permiso: sin él, un mensaje que cancela esta
          clase no le dice nada y no toca nada.
        </p>
      </form>
    </Plegable>
  )
}
