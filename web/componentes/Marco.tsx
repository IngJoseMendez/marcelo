'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ContextoApp } from './contexto'
import { Hablar } from './Hablar'
import type { Estado } from '@/lib/tipos'

const PESTANAS = [
  { ruta: '/', nombre: 'Jornada', icono: <><circle cx="12" cy="12" r="8.6" /><path d="M12 7.4V12l3.2 1.9" /></> },
  { ruta: '/bandeja', nombre: 'Bandeja', icono: <><path d="M3.4 13.4h4l1.4 2.4h6.4l1.4-2.4h4" /><path d="M5.6 5.4h12.8l2.2 8v4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2v-4z" /></> },
  { ruta: '/cronica', nombre: 'Crónica', icono: <><path d="M4 7h9M4 12h13M4 17h6" /><circle cx="19" cy="7" r="1.7" fill="currentColor" stroke="none" /></> },
  { ruta: '/tesoro', nombre: 'Tesoro', icono: <><rect x="3.2" y="6" width="17.6" height="13" rx="3.4" /><path d="M3.2 10.2h17.6" /><circle cx="16.6" cy="14.6" r="1.25" fill="currentColor" stroke="none" /></> },
  { ruta: '/pactos', nombre: 'Pactos', icono: <><path d="M4 10.5V9a4 4 0 0 1 4-4h8" /><path d="m13.6 2.6 2.8 2.4-2.8 2.4" /><path d="M20 13.5V15a4 4 0 0 1-4 4H8" /><path d="m10.4 21.4-2.8-2.4 2.8-2.4" /></> },
] as const

const VISTO = 'sc-visto'

function haceCuanto(iso: string): string {
  const minutos = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (!Number.isFinite(minutos) || minutos < 0) return 'hace un momento'
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

export function Marco({
  sesion,
  estado,
  children,
}: {
  sesion: boolean
  estado: Estado | null
  children: React.ReactNode
}) {
  const ruta = usePathname()
  const [tema, setTema] = useState<'light' | 'dark' | null>(null)
  const [tostada, setTostada] = useState<string | null>(null)
  const [hoja, setHoja] = useState<{ abierta: boolean; texto: string }>(
    { abierta: false, texto: '' })
  const [pulso, setPulso] = useState<string>(
    estado ? 'Conectada' : 'Sin conexión con la asistente')

  const tostar = useCallback((mensaje: string) => {
    setTostada(mensaje)
    window.setTimeout(() => setTostada((t) => (t === mensaje ? null : t)), 3600)
  }, [])

  const hablar = useCallback((texto = '') => setHoja({ abierta: true, texto }), [])
  const contexto = useMemo(() => ({ tostar, hablar }), [tostar, hablar])

  useEffect(() => {
    setTema(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  }, [])

  // El texto de la barra se calcula en el cliente: depende del reloj de quien
  // mira, y calcularlo en el servidor haría que el HTML no coincidiera.
  useEffect(() => {
    // Sin sesión no hay nada que reportar: decir "sin conexión" en la puerta
    // sería alarmar por algo que ni siquiera se ha intentado.
    if (!sesion) {
      setPulso('Mi Segundo Cerebro')
      return
    }
    function pintar() {
      if (!estado) {
        const visto = window.localStorage.getItem(VISTO)
        const desde = visto
          ? new Date(Number(visto)).toLocaleTimeString('es-CO',
              { hour: '2-digit', minute: '2-digit', hour12: false })
          : null
        setPulso(desde ? `Sin conexión desde las ${desde}` : 'Sin conexión con la asistente')
        return
      }
      window.localStorage.setItem(VISTO, String(Date.now()))
      const sombra = estado.modoSombra ? 'Modo sombra · ' : ''
      setPulso(estado.ultimoLatido
        ? `${sombra}leyó tu correo ${haceCuanto(estado.ultimoLatido)}`
        : `${sombra}sin cuentas de correo conectadas`)
    }
    pintar()
    const reloj = window.setInterval(pintar, 60_000)
    return () => window.clearInterval(reloj)
  }, [estado, sesion])

  function cambiarTema() {
    const nuevo = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark'
    document.documentElement.dataset.theme = nuevo
    try { window.localStorage.setItem('sc-tema', nuevo) } catch { /* modo incógnito */ }
    setTema(nuevo)
  }

  const indice = PESTANAS.findIndex((p) => p.ruta === (ruta === '/' ? '/' : `/${ruta.split('/')[1]}`))

  return (
    <ContextoApp.Provider value={contexto}>
      <div className="app">
        <header className="barra">
          <div className="pulso" data-caida={!sesion || estado ? 'false' : 'true'}>
            <span className="pulso__punto" aria-hidden="true" />
            <p className="pulso__texto">{pulso}</p>
          </div>
          <button
            className="tema" type="button" onClick={cambiarTema}
            aria-label={tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            <span className="tema__icono" aria-hidden="true">
              <svg className="sol" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4M18.7 18.7l-1.4-1.4M6.7 6.7 5.3 5.3" /></svg>
              <svg className="luna" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>
            </span>
          </button>
        </header>

        <main className="scroll" id="scroll">{children}</main>

        {sesion && (
          <nav className="dock" aria-label="Secciones">
            <div className="pastilla" style={{ '--tab': Math.max(indice, 0) } as React.CSSProperties}>
              <span className="pastilla__marca" aria-hidden="true" />
              {PESTANAS.map((p) => (
                <Link
                  key={p.ruta} href={p.ruta} className="tab" prefetch
                  aria-current={p.ruta === ruta ? 'page' : undefined}
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p.icono}</svg>
                  <span className="tab__nombre">{p.nombre}</span>
                </Link>
              ))}
            </div>
            <button
              className="fab" type="button" aria-haspopup="dialog" aria-label="Hablarle"
              onClick={() => hablar()}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="2.8" width="6" height="11" rx="3" /><path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0" /><path d="M12 18v3.2" /></svg>
            </button>
          </nav>
        )}

        <div
          className="velo" data-abierto={hoja.abierta ? 'true' : 'false'}
          onClick={() => setHoja({ abierta: false, texto: '' })}
        />
        <Hablar
          abierta={hoja.abierta}
          textoInicial={hoja.texto}
          alCerrar={() => setHoja({ abierta: false, texto: '' })}
          alHecho={tostar}
        />

        <div className="tostada" data-visible={tostada ? 'true' : 'false'} role="status" aria-live="polite">
          <span className="tostada__marca" aria-hidden="true" />
          <span>{tostada}</span>
        </div>
      </div>
    </ContextoApp.Provider>
  )
}
