'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp } from './contexto'
import { diasHasta, duracion, hora, relativa } from '@/lib/tiempo'
import type { Bandeja, Intencion } from '@/lib/tipos'

function plazo(intencion: Intencion, hoy: string): { texto: string; urgente: boolean } | null {
  if (!intencion.venceEl) return null
  const dias = diasHasta(intencion.venceEl.slice(0, 10), hoy)
  if (dias < 0) return { texto: 'se pasó la fecha', urgente: true }
  if (dias === 0) return { texto: 'vence hoy', urgente: true }
  if (dias === 1) return { texto: 'vence mañana', urgente: true }
  return { texto: `vence en ${dias} días`, urgente: dias <= 3 }
}

export function VistaBandeja({
  bandeja,
  huecoPreferido,
}: {
  bandeja: Bandeja
  huecoPreferido: string | null
}) {
  const router = useRouter()
  const { tostar, hablar } = useApp()
  const [elegido, setElegido] = useState<string | null>(huecoPreferido)
  const [ocupado, setOcupado] = useState<number | null>(null)

  const hueco = bandeja.huecos.find((h) => h.inicio === elegido) ?? null

  async function llamar(ruta: string, cuerpo: unknown, intencionId: number, exito: string) {
    setOcupado(intencionId)
    try {
      const r = await fetch(ruta, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const datos = (await r.json().catch(() => ({}))) as { motivo?: string; error?: string; ensayo?: boolean }
      if (!r.ok) {
        tostar(datos.motivo ?? datos.error ?? 'No se pudo')
        return
      }
      tostar(datos.ensayo ? 'Ensayo: en modo sombra no toqué el calendario.' : exito)
      router.refresh()
    } catch {
      tostar('No se pudo llegar a la asistente')
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section className="vista">
      <div className="cabecera" data-anim>
        <p className="ojal">bandeja</p>
        <h1 className="titular titular--corto">Lo que tienes por hacer</h1>
        <p className="subtitular">
          Elige un hueco de {relativa(bandeja.fecha, bandeja.fecha)} y mete ahí lo que quepa.
        </p>
      </div>

      {bandeja.huecos.length > 0 && (
        <div className="bloque">
          <div className="seccion" data-anim>
            <h2 className="seccion__titulo">Huecos de hoy</h2>
            {hueco && (
              <button className="btn btn--fantasma" type="button" onClick={() => setElegido(null)}>
                Quitar selección
              </button>
            )}
          </div>
          <div className="huecos" data-anim>
            {bandeja.huecos.map((h) => (
              <button
                key={h.inicio} type="button" className="hueco-chip"
                aria-pressed={h.inicio === elegido}
                onClick={() => setElegido(h.inicio === elegido ? null : h.inicio)}
              >
                {hora(h.inicio)}–{hora(h.fin)}
                <small>{duracion(h.minutos)}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bloque">
        <div className="seccion" data-anim>
          <h2 className="seccion__titulo">
            {hueco ? `Qué cabe en ${duracion(hueco.minutos)}` : 'Pendientes'}
          </h2>
          <button className="btn" type="button" onClick={() => hablar()}>Anotar algo</button>
        </div>

        {bandeja.intenciones.length === 0 ? (
          <div className="tarjeta vacio" data-anim>
            <strong>La bandeja está vacía</strong>
            Lo que le digas por el botón de abajo cae aquí, con su prioridad y
            cuánto toma, listo para meterlo en un hueco.
          </div>
        ) : (
          <div className="intenciones">
            {bandeja.intenciones.map((i, indice) => {
              const cabe = hueco !== null && i.duracionMin <= hueco.minutos
              const limite = plazo(i, bandeja.fecha)
              return (
                <article
                  key={i.id} className="tarjeta intencion" data-anim
                  style={{ '--i': indice } as React.CSSProperties}
                >
                  <div className="intencion__cab">
                    <h3 className="intencion__titulo">{i.titulo}</h3>
                    <span className="etiqueta" data-tono={i.prioridad}>
                      {i.prioridad.toUpperCase()}
                    </span>
                  </div>

                  <div className="intencion__meta">
                    <span>{duracion(i.duracionMin)}</span>
                    {limite && <><i>·</i>{limite.urgente ? <em>{limite.texto}</em> : <span>{limite.texto}</span>}</>}
                    {i.origen !== 'texto' && <><i>·</i><span>lo detectó ella</span></>}
                  </div>

                  <div className="intencion__acciones">
                    <button
                      className="btn btn--principal" type="button"
                      disabled={!cabe || ocupado === i.id}
                      title={hueco ? undefined : 'Elige primero un hueco'}
                      onClick={() => hueco && llamar(
                        `/api/intenciones/${i.id}/agendar`,
                        { inicio: hueco.inicio },
                        i.id,
                        `Listo. «${i.titulo}» a las ${hora(hueco.inicio)}.`)}
                    >
                      {!hueco
                        ? 'Elige un hueco'
                        : cabe
                          ? `Meter a las ${hora(hueco.inicio)}`
                          : `No cabe en ${duracion(hueco.minutos)}`}
                    </button>
                    <button
                      className="btn btn--fantasma" type="button" disabled={ocupado === i.id}
                      onClick={() => llamar(`/api/intenciones/${i.id}/cerrar`,
                        { estado: 'hecha' }, i.id, 'Hecha. Fuera de la bandeja.')}
                    >
                      Ya la hice
                    </button>
                    <button
                      className="btn btn--fantasma" type="button" disabled={ocupado === i.id}
                      onClick={() => llamar(`/api/intenciones/${i.id}/cerrar`,
                        { estado: 'descartada' }, i.id, 'Descartada.')}
                    >
                      Descartar
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p className="pie" data-anim>
          Meterla en un hueco crea el evento de verdad: pasa por la misma
          política y se deshace desde la <Link className="pie__enlace" href="/cronica">Crónica</Link>.
        </p>
      </div>
    </section>
  )
}
