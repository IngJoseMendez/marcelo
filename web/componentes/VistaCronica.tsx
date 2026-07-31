'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './contexto'
import { cronicaEnPalabras, deQuien } from '@/lib/textos'
import { hora12, relativa } from '@/lib/tiempo'
import type { EntradaCronica } from '@/lib/tipos'

function agruparPorDia(entradas: EntradaCronica[]): Array<[string, EntradaCronica[]]> {
  const dias = new Map<string, EntradaCronica[]>()
  for (const e of entradas) {
    const dia = e.creadaEn.slice(0, 10)
    const lista = dias.get(dia)
    if (lista) lista.push(e)
    else dias.set(dia, [e])
  }
  return [...dias.entries()]
}

function Entrada({ entrada, hoy }: { entrada: EntradaCronica; hoy: string }) {
  const router = useRouter()
  const { tostar } = useApp()
  const [abierto, setAbierto] = useState(false)
  const [deshaciendo, setDeshaciendo] = useState(false)

  const deshecha = entrada.estado === 'deshecha'
  const quien = deQuien(entrada)

  async function deshacer() {
    setDeshaciendo(true)
    try {
      const r = await fetch(`/api/acciones/${entrada.id}/deshacer`, { method: 'POST' })
      const datos = (await r.json().catch(() => ({}))) as { motivo?: string; error?: string }
      if (!r.ok) {
        tostar(datos.motivo ?? datos.error ?? 'No se pudo deshacer')
        return
      }
      tostar('Listo, lo devolví como estaba.')
      router.refresh()
    } catch {
      tostar('No se pudo llegar a la asistente')
    } finally {
      setDeshaciendo(false)
    }
  }

  return (
    <article className="entrada" data-anim data-deshecha={deshecha ? 'true' : 'false'}>
      <div className="entrada__hilo">
        <span
          className="nodo entrada__nodo"
          data-quien={entrada.porElla && !deshecha ? 'ella' : 'tu'}
        />
      </div>
      <div className="tarjeta entrada__cuerpo">
        <p className="entrada__accion">{cronicaEnPalabras(entrada)}</p>

        <div className="entrada__meta">
          <span>{hora12(entrada.creadaEn)}</span>
          {quien && <><i>·</i><span>{quien}</span></>}
          {entrada.ensayo && <span className="etiqueta" data-tono="ensayo">ENSAYO</span>}
        </div>

        <div className="certeza" data-nivel={entrada.confianza}>
          <span className="certeza__medidor" aria-hidden="true"><span /><span /><span /></span>
          <span className="certeza__texto">certeza {entrada.confianza}</span>
        </div>

        <div className="acciones">
          {entrada.correo && (
            <button
              className="btn" type="button" aria-expanded={abierto}
              onClick={() => setAbierto((a) => !a)}
            >
              <span>{abierto ? 'Ocultar el correo' : 'Ver el correo'}</span>
              <svg className="btn__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: abierto ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
          <button
            className="btn btn--fantasma" type="button"
            disabled={entrada.estado !== 'aplicada' || deshaciendo}
            title={entrada.ensayo ? 'En sombra no se aplicó nada' : undefined}
            onClick={deshacer}
          >
            {deshecha ? 'Deshecho' : deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        </div>

        {entrada.correo && (
          <div className="plegable" data-abierto={abierto ? 'true' : 'false'}>
            <div className="plegable__cierre">
              <div className="plegable__caja">
                <p className="mono correo__de">De {entrada.correo.remitente}</p>
                <p className="correo__asunto">{entrada.correo.asunto ?? '(sin asunto)'}</p>
                <p className="correo__cuerpo">
                  Llegó el {relativa(entrada.correo.recibidoEn.slice(0, 10), hoy)} a
                  las {hora12(entrada.correo.recibidoEn)}. El cuerpo del correo no
                  se guarda: la asistente lo lee y se queda con los hechos.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

export function VistaCronica({ entradas, hoy }: { entradas: EntradaCronica[]; hoy: string }) {
  const dias = agruparPorDia(entradas)

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">crónica</p>
        <h1 className="titular titular--corto">Lo que hizo sola</h1>
        <p className="subtitular">Cada acción, con el correo que la causó y qué tan segura estaba.</p>
      </div>

      {dias.length === 0 ? (
        <div className="tarjeta vacio" data-anim>
          <strong>Todavía no ha hecho nada</strong>
          Cuando lea un correo que cambie tu agenda, aparece aquí con su origen
          y un botón para deshacerlo.
        </div>
      ) : (
        dias.map(([dia, delDia]) => (
          <div className="bloque" key={dia}>
            <p className="dia" data-anim>{relativa(dia, hoy).toUpperCase()}</p>
            {delDia.map((e) => <Entrada key={e.id} entrada={e} hoy={hoy} />)}
          </div>
        ))
      )}

      <p className="pie" data-anim>
        Deshacer no borra el registro: agrega uno nuevo. Siempre queda el rastro
        de qué pasó y por qué.
      </p>
    </section>
  )
}
