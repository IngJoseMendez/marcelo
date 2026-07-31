'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FormaEntrar() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

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

  return (
    <form className="compositor" onSubmit={entrar} style={{ flexWrap: 'wrap' }}>
      <input
        className="campo" type="password" inputMode="text" value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Tu código" autoComplete="one-time-code"
        aria-label="Código de acceso" autoFocus
      />
      <button className="enviar" type="submit" disabled={entrando || !codigo.trim()}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>
      {error && <p className="entrar__error" style={{ width: '100%' }}>{error}</p>}
    </form>
  )
}
