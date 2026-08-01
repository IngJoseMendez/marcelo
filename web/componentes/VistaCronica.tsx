'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './contexto'
import { cronicaEnPalabras, deQuien } from '@/lib/textos'
import { hora12, relativa } from '@/lib/tiempo'
import type { EntradaCronica, Graduacion as GraduacionTipo } from '@/lib/tipos'

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

  const deshecha = entrada.estado === 'deshecha' || entrada.estado === 'descartada'
  const esperando = entrada.estado === 'pendiente'
  const quien = deQuien(entrada)

  async function llamar(ruta: string, exito: string) {
    setDeshaciendo(true)
    try {
      const r = await fetch(ruta, { method: 'POST' })
      const datos = (await r.json().catch(() => ({}))) as { motivo?: string; error?: string }
      if (!r.ok) {
        tostar(datos.motivo ?? datos.error ?? 'No se pudo')
        return
      }
      tostar(exito)
      router.refresh()
    } catch {
      tostar('No se pudo llegar a la asistente')
    } finally {
      setDeshaciendo(false)
    }
  }

  const [veredicto, setVeredicto] = useState(entrada.veredicto)

  /**
   * El ✓ y el ✗ que alimentan el criterio de graduación.
   *
   * Sólo sobre lo que ella hizo sola: juzgar una orden que él mismo dictó
   * no mide la autonomía de nadie, y falsearía hacia arriba el número que
   * decide si puede tocar el calendario de verdad.
   */
  async function juzgar(cual: 'acierto' | 'error') {
    const antes = veredicto
    setVeredicto(cual)
    const r = await fetch(`/api/acciones/${entrada.id}/juzgar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ veredicto: cual }),
    }).catch(() => null)
    if (!r || !r.ok) setVeredicto(antes)
    else tostar(cual === 'acierto' ? 'Anotado como acierto.' : 'Anotado como error.')
  }

  const deshacer = () =>
    llamar(`/api/acciones/${entrada.id}/deshacer`, 'Listo, lo devolví como estaba.')

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
          {esperando && (
            <>
              <button
                className="btn btn--principal" type="button" disabled={deshaciendo}
                onClick={() => llamar(`/api/instrucciones/${entrada.id}/confirmar`,
                  'Listo, lo hice.')}
              >
                Confirmar
              </button>
              <button
                className="btn btn--fantasma" type="button" disabled={deshaciendo}
                onClick={() => llamar(`/api/instrucciones/${entrada.id}/descartar`,
                  'Bueno, no lo toqué.')}
              >
                No, esa no
              </button>
            </>
          )}
          {entrada.correo && (
            <button
              className="btn" type="button" aria-expanded={abierto}
              onClick={() => setAbierto((a) => !a)}
            >
              <span>{abierto ? 'Ocultar el correo' : 'Ver el correo'}</span>
              <svg className="btn__chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: abierto ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
          {!esperando && (
            <button
              className="btn btn--fantasma" type="button"
              disabled={entrada.estado !== 'aplicada' || deshaciendo}
              title={entrada.ensayo ? 'En sombra no se aplicó nada' : undefined}
              onClick={deshacer}
            >
              {deshecha ? 'Deshecho' : deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
            </button>
          )}
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

/**
 * Cuánto le falta para que le suelten la correa.
 *
 * El spec pone un número y no una sensación —≥95 % de aciertos durante 5
 * días seguidos— y hasta ahora ese número no se veía en ningún lado, así
 * que salir de sombra era una corazonada. Aquí está, con los días que
 * lleva y los que faltan.
 */
function Graduacion({ g }: { g: GraduacionTipo }) {
  if (!g.modoSombra) return null

  const listo = g.puedeGraduarse
  return (
    <div className="tarjeta sombra-panel" data-anim data-listo={listo ? 'true' : undefined}>
      <div className="sombra-panel__cab">
        <span className="ojal">modo sombra</span>
        <span className="sombra-panel__racha">
          {g.rachaActual} / {g.rachaNecesaria} días
        </span>
      </div>

      <div className="racha" aria-hidden="true">
        {g.dias.slice(-7).map((d) => (
          <span
            key={d.fecha} className="racha__dia"
            data-estado={
              d.precision === null ? 'vacio' : d.cumple ? 'bien' : 'mal'
            }
            title={
              d.precision === null
                ? `${d.fecha}: nada juzgado`
                : `${d.fecha}: ${Math.round(d.precision * 100)} % (${d.aciertos}✓ ${d.errores}✗)`
            }
          />
        ))}
      </div>

      <p className="sombra-panel__dictamen">{g.dictamen}</p>

      {g.sinJuzgar > 0 && (
        <p className="sombra-panel__pista">
          Marca ✓ o ✗ en cada acción de abajo. Lo que no revisas no cuenta ni a
          favor ni en contra: suponer que estaba bien sería la forma más fácil
          de que este número mienta.
        </p>
      )}
    </div>
  )
}

export function VistaCronica({
  entradas, hoy, graduacion,
}: {
  entradas: EntradaCronica[]
  hoy: string
  graduacion?: GraduacionTipo | null
}) {
  const dias = agruparPorDia(entradas)

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">crónica</p>
        <h1 className="titular titular--corto">Lo que hizo sola</h1>
        <p className="subtitular">Cada acción, con el correo que la causó y qué tan segura estaba.</p>
      </div>

      {graduacion && <Graduacion g={graduacion} />}

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
