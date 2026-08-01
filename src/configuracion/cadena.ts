/**
 * Por qué la app dice «sin conexión».
 *
 * Entre la pantalla del teléfono y los datos de la laptop hay cuatro saltos,
 * y cuando uno falla los cuatro se ven igual: todo vacío. Sin poder mirar
 * dentro, «no me sale nada» no se distingue de «la laptop está apagada», de
 * «el túnel estrenó dirección» ni de «Vercel tiene las variables buenas pero
 * está sirviendo un despliegue viejo» — que es la trampa peor, porque todo
 * parece bien configurado y aun así no funciona.
 *
 * Esto recorre los cuatro saltos de verdad, en orden, y se detiene a
 * explicar el primero que falla. Un diagnóstico que dice «el túnel responde
 * pero Vercel apunta a la dirección de ayer» convierte una visita del
 * ingeniero en un botón.
 */

import type { Buscar } from './vercel.ts'

const API = 'https://api.vercel.com'

export type Estado = 'bien' | 'mal' | 'aviso' | 'sin_datos'

export interface Eslabon {
  id: 'laptop' | 'tunel' | 'vercel' | 'despliegue'
  titulo: string
  estado: Estado
  detalle: string
  /** Qué hacer, en una frase, dicho a quien no sabe qué es un túnel. */
  arreglo?: string
}

export interface Diagnostico {
  eslabones: Eslabon[]
  /** ¿Puede la app enseñar datos ahora mismo? */
  ok: boolean
  /** Lo primero que hay que arreglar. */
  culpable: Eslabon | null
  /** El botón «Reparar» serviría de algo. */
  reparable: boolean
}

export interface DepsCadena {
  puertoLocal: number
  urlPublica: string
  apiToken: string
  vercel: { token: string; proyecto: string; gancho: string }
  buscar?: Buscar
  /** Cuánto se espera a cada salto. El túnel puede tardar en despertar. */
  limiteMs?: number
}

interface EnvVercel {
  envs?: Array<{ key: string; value?: string; updatedAt?: number; createdAt?: number }>
}

interface DespliegueVercel {
  deployments?: Array<{ created?: number; readyState?: string; url?: string }>
}

async function tocar(
  buscar: Buscar, url: string, init: RequestInit, limiteMs: number
): Promise<{ r?: Response; error?: string }> {
  try {
    const r = await buscar(url, { ...init, signal: AbortSignal.timeout(limiteMs) })
    return { r }
  } catch (e) {
    const nombre = e instanceof Error ? e.name : ''
    if (nombre === 'TimeoutError' || nombre === 'AbortError') {
      return { error: 'no contestó a tiempo' }
    }
    return { error: e instanceof Error ? e.message : 'no se pudo llegar' }
  }
}

const cuando = (ms?: number): string => {
  if (!ms) return 'sin fecha'
  const minutos = Math.round((Date.now() - ms) / 60_000)
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} días`
}

/** La dirección se compara sin barra final ni mayúsculas: son la misma. */
const normalizar = (u: string): string => u.trim().replace(/\/+$/, '').toLowerCase()

export async function probarCadena(d: DepsCadena): Promise<Diagnostico> {
  const buscar = d.buscar ?? fetch
  const limite = d.limiteMs ?? 10_000
  const eslabones: Eslabon[] = []
  const auth = { authorization: `Bearer ${d.apiToken}` }

  // ── 1. La asistente, aquí mismo ────────────────────────────────
  // Se pregunta por `/api/estado` y no por `/salud` a propósito: es la ruta
  // que usa la app de verdad, y exige el token. Así este primer salto ya
  // descarta a la vez «está apagada» y «el token no sirve».
  const local = await tocar(
    buscar, `http://127.0.0.1:${d.puertoLocal}/api/estado`, { headers: auth }, 4_000)

  if (local.error || !local.r) {
    eslabones.push({
      id: 'laptop', titulo: 'La asistente en esta laptop', estado: 'mal',
      detalle: `No responde en el puerto ${d.puertoLocal} (${local.error ?? 'sin detalle'}).`,
      arreglo: 'La asistente no está corriendo. Dale a «Aplicar y arrancar» abajo.',
    })
    return { eslabones, ok: false, culpable: eslabones[0]!, reparable: false }
  }
  if (local.r.status === 401 || local.r.status === 503) {
    eslabones.push({
      id: 'laptop', titulo: 'La asistente en esta laptop', estado: 'mal',
      detalle: local.r.status === 503
        ? 'Está viva pero arrancó sin token: la app no puede entrar.'
        : 'Responde, pero rechaza el token guardado.',
      arreglo: 'Genera los secretos aquí abajo y dale a «Aplicar y arrancar».',
    })
    return { eslabones, ok: false, culpable: eslabones[0]!, reparable: false }
  }
  eslabones.push({
    id: 'laptop', titulo: 'La asistente en esta laptop', estado: 'bien',
    detalle: 'Viva y contestando.',
  })

  // ── 2. El túnel, dando la vuelta por internet ──────────────────
  // A propósito por la dirección pública y no por localhost: es el camino
  // que hace la app de verdad, con Cloudflare en medio.
  if (!d.urlPublica.trim()) {
    eslabones.push({
      id: 'tunel', titulo: 'El túnel', estado: 'mal',
      detalle: 'No hay dirección pública guardada.',
      arreglo: 'Abre el túnel en el paso del túnel, aquí arriba.',
    })
    return { eslabones, ok: false, culpable: eslabones[1]!, reparable: false }
  }

  const fuera = await tocar(
    buscar, `${normalizar(d.urlPublica)}/api/estado`, { headers: auth }, limite)

  if (fuera.error || !fuera.r?.ok) {
    const codigo = fuera.r ? `respondió ${fuera.r.status}` : fuera.error
    eslabones.push({
      id: 'tunel', titulo: 'El túnel', estado: 'mal',
      detalle: `${d.urlPublica} no sirve: ${codigo}.`,
      arreglo: 'El túnel está caído o estrenó dirección. Vuelve a abrirlo y publica en Vercel.',
    })
    return { eslabones, ok: false, culpable: eslabones[1]!, reparable: true }
  }
  eslabones.push({
    id: 'tunel', titulo: 'El túnel', estado: 'bien',
    detalle: `Se llega desde fuera por ${d.urlPublica}`,
  })

  // ── 3. Lo que Vercel tiene apuntado ────────────────────────────
  if (!d.vercel.token || !d.vercel.proyecto) {
    eslabones.push({
      id: 'vercel', titulo: 'Lo que sabe Vercel', estado: 'sin_datos',
      detalle: 'Sin token de Vercel no puedo mirar qué tiene puesto.',
      arreglo: 'Pon el token y el nombre del proyecto aquí abajo, o copia '
        + `API_BASE = ${d.urlPublica} a mano en Vercel.`,
    })
    return { eslabones, ok: false, culpable: eslabones[2]!, reparable: false }
  }

  const proyecto = encodeURIComponent(d.vercel.proyecto.trim())
  const cabeceras = { authorization: `Bearer ${d.vercel.token.trim()}` }
  const env = await tocar(
    buscar, `${API}/v9/projects/${proyecto}/env?decrypt=true`, { headers: cabeceras }, limite)

  if (env.error || !env.r?.ok) {
    const detalle = env.r?.status === 404
      ? `Vercel no encuentra el proyecto «${d.vercel.proyecto}».`
      : env.r?.status === 403
        ? 'El token de Vercel no tiene permiso sobre ese proyecto.'
        : `No se pudo consultar Vercel: ${env.error ?? env.r?.status}.`
    eslabones.push({
      id: 'vercel', titulo: 'Lo que sabe Vercel', estado: 'mal', detalle,
      arreglo: 'Revisa el token y que el nombre del proyecto sea exacto.',
    })
    return { eslabones, ok: false, culpable: eslabones[2]!, reparable: false }
  }

  const cuerpo = (await env.r.json().catch(() => ({}))) as EnvVercel
  const puestas = new Map((cuerpo.envs ?? []).map((e) => [e.key, e]))
  const base = puestas.get('API_BASE')
  const token = puestas.get('API_TOKEN')

  if (!base?.value || !token?.value) {
    eslabones.push({
      id: 'vercel', titulo: 'Lo que sabe Vercel', estado: 'mal',
      detalle: `Le falta ${!base?.value ? 'API_BASE' : 'API_TOKEN'}: la app no sabe a dónde llamar.`,
      arreglo: 'Dale a «Reparar»: se las pongo y redespliego.',
    })
    return { eslabones, ok: false, culpable: eslabones[2]!, reparable: true }
  }
  if (normalizar(base.value) !== normalizar(d.urlPublica)) {
    eslabones.push({
      id: 'vercel', titulo: 'Lo que sabe Vercel', estado: 'mal',
      detalle: `Vercel llama a ${base.value}, pero el túnel de ahora es ${d.urlPublica}.`,
      arreglo: 'Dale a «Reparar»: le paso la dirección nueva y redespliego.',
    })
    return { eslabones, ok: false, culpable: eslabones[2]!, reparable: true }
  }
  if (token.value.trim() !== d.apiToken.trim()) {
    eslabones.push({
      id: 'vercel', titulo: 'Lo que sabe Vercel', estado: 'mal',
      detalle: 'El token de la app no es el mismo que el de esta laptop: la asistente la rechaza.',
      arreglo: 'Dale a «Reparar»: le paso el token bueno y redespliego.',
    })
    return { eslabones, ok: false, culpable: eslabones[2]!, reparable: true }
  }
  eslabones.push({
    id: 'vercel', titulo: 'Lo que sabe Vercel', estado: 'bien',
    detalle: `Apunta aquí, con el token bueno (guardado ${cuando(base.updatedAt ?? base.createdAt)}).`,
  })

  // ── 4. El despliegue que está sirviendo ────────────────────────
  // La trampa: Vercel inyecta las variables AL DESPLEGAR. Cambiarlas no
  // toca lo que ya está en el aire. Si el último despliegue es anterior al
  // último cambio, todo está bien configurado y la app sigue sin funcionar.
  const desp = await tocar(
    buscar,
    `${API}/v6/deployments?projectId=${proyecto}&limit=1&state=READY&target=production`,
    { headers: cabeceras }, limite)

  if (desp.error || !desp.r?.ok) {
    eslabones.push({
      id: 'despliegue', titulo: 'La app publicada', estado: 'sin_datos',
      detalle: 'No pude ver el último despliegue, pero lo demás está bien.',
    })
    return { eslabones, ok: true, culpable: null, reparable: true }
  }

  const lista = ((await desp.r.json().catch(() => ({}))) as DespliegueVercel).deployments ?? []
  const ultimo = lista[0]
  const cambio = base.updatedAt ?? base.createdAt ?? 0

  if (!ultimo?.created) {
    eslabones.push({
      id: 'despliegue', titulo: 'La app publicada', estado: 'mal',
      detalle: 'No hay ningún despliegue listo en producción.',
      arreglo: 'Entra a Vercel y despliega el proyecto una primera vez.',
    })
    return { eslabones, ok: false, culpable: eslabones[3]!, reparable: false }
  }

  if (ultimo.created < cambio) {
    eslabones.push({
      id: 'despliegue', titulo: 'La app publicada', estado: 'mal',
      detalle: `La app en el aire es de ${cuando(ultimo.created)}, anterior al último `
        + 'cambio de variables. Está corriendo con las viejas.',
      arreglo: 'Dale a «Reparar»: redespliego y en un minuto agarra las nuevas.',
    })
    return { eslabones, ok: false, culpable: eslabones[3]!, reparable: true }
  }

  eslabones.push({
    id: 'despliegue', titulo: 'La app publicada', estado: 'bien',
    detalle: `Desplegada ${cuando(ultimo.created)}, después del último cambio.`,
  })

  return { eslabones, ok: true, culpable: null, reparable: true }
}
