'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FormaEntrar() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [pidiendo, setPidiendo] = useState(false)
  const [mandado, setMandado] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim() || entrando) return
    setEntrando(true)
    setError(null)
    try {
      const r = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      if (!r.ok) {
        setError('Ese código no es')
        setCodigo('')
        return
      }
      router.replace('/')
      router.refresh()
    } catch {
      setError('No se pudo entrar')
    } finally {
      setEntrando(false)
    }
  }

  /**
   * Pedirle el código al bot.
   *
   * El código sale por Telegram y nunca vuelve por aquí: lo único que
   * dice la respuesta es si se pudo mandar. Está autenticado por poseer
   * el teléfono, que es exactamente lo que pide el spec.
   */
  async function pedirCodigo() {
    if (pidiendo) return
    setPidiendo(true)
    setError(null)
    try {
      const r = await fetch('/api/sesion', { method: 'PUT' })
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => ({}))) as { error?: string }
        setError(cuerpo.error ?? 'No te pude mandar el código')
        return
      }
      setMandado(true)
    } catch {
      setError('No se pudo pedir el código')
    } finally {
      setPidiendo(false)
    }
  }

  return (
    <form className="compositor" onSubmit={entrar} style={{ flexWrap: 'wrap' }}>
      <input
        className="campo" type="password" inputMode="numeric" value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Tu código" autoComplete="one-time-code"
        aria-label="Código de acceso" autoFocus
      />
      <button className="enviar" type="submit" disabled={entrando || !codigo.trim()}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>

      <button
        className="pedir" type="button" onClick={pedirCodigo} disabled={pidiendo}
      >
        {pidiendo
          ? 'mandándolo…'
          : mandado
            ? 'te lo mandé por Telegram · pedir otro'
            : 'mándame un código por Telegram'}
      </button>

      {error && <p className="entrar__error" style={{ width: '100%' }}>{error}</p>}
    </form>
  )
}
