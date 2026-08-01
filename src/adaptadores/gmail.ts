import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { CorreoInalcanzable, type CorreoCrudo } from '../dominio/tipos.ts'

/**
 * Gmail contesta 404 a un mensaje que se borró, y también a uno que existe
 * pero en OTRA cuenta — que es lo que pasa cuando la cola trae ids de
 * antes de reconectar con otra dirección. En los dos casos es definitivo.
 */
function seFue(e: unknown): boolean {
  const codigo = (e as { status?: number; code?: number })?.status
    ?? (e as { code?: number })?.code
  return codigo === 404 || codigo === 410
}

/** Recorre el árbol MIME buscando texto legible. */
function extraerCuerpo(payload: unknown): string {
  const p = payload as {
    mimeType?: string
    body?: { data?: string }
    parts?: unknown[]
  } | undefined
  if (!p) return ''
  if (p.mimeType?.startsWith('text/') && p.body?.data) {
    return Buffer.from(p.body.data, 'base64url').toString('utf8')
  }
  for (const parte of p.parts ?? []) {
    const texto = extraerCuerpo(parte)
    if (texto) return texto
  }
  if (p.body?.data) return Buffer.from(p.body.data, 'base64url').toString('utf8')
  return ''
}

export class FuenteGmail {
  private readonly gmail

  constructor(auth: OAuth2Client, private readonly cuentaId: number) {
    this.gmail = google.gmail({ version: 'v1', auth })
  }

  /**
   * Ids nuevos desde el cursor. Si el historyId caducó (más de una semana
   * sin sincronizar) Gmail responde 404 y hay que caer al respaldo.
   */
  async idsDesde(historyId: string): Promise<
    { caduco: false; ids: string[]; nuevoCursor: string } | { caduco: true }
  > {
    try {
      const r = await this.gmail.users.history.list({
        userId: 'me', startHistoryId: historyId, historyTypes: ['messageAdded'],
      })
      const ids = (r.data.history ?? [])
        .flatMap((h) => h.messagesAdded ?? [])
        .map((m) => m.message?.id)
        .filter((id): id is string => Boolean(id))
      return { caduco: false, ids: [...new Set(ids)], nuevoCursor: r.data.historyId ?? historyId }
    } catch (e) {
      if ((e as { code?: number }).code === 404) return { caduco: true }
      throw e
    }
  }

  /** Respaldo cuando el cursor caducó o es el primer arranque. */
  async idsRecientes(consulta = 'newer_than:3d'): Promise<{ ids: string[]; cursor: string }> {
    const lista = await this.gmail.users.messages.list({
      userId: 'me', q: consulta, maxResults: 100,
    })
    const perfil = await this.gmail.users.getProfile({ userId: 'me' })
    return {
      ids: (lista.data.messages ?? []).map((m) => m.id!).filter(Boolean),
      cursor: String(perfil.data.historyId ?? ''),
    }
  }

  async mensajeCompleto(messageId: string): Promise<CorreoCrudo> {
    const r = await this.gmail.users.messages.get({
      userId: 'me', id: messageId, format: 'full',
    }).catch((e: unknown) => {
      if (seFue(e)) throw new CorreoInalcanzable(messageId, 'gmail')
      throw e
    })
    const cabeceras = r.data.payload?.headers ?? []
    const buscar = (n: string) =>
      cabeceras.find((h) => h.name?.toLowerCase() === n)?.value ?? null

    return {
      cuentaId: this.cuentaId,
      messageId,
      threadId: r.data.threadId ?? null,
      remitente: buscar('from') ?? '(desconocido)',
      asunto: buscar('subject'),
      cuerpo: extraerCuerpo(r.data.payload),
      recibidoEn: new Date(Number(r.data.internalDate ?? Date.now())).toISOString(),
      etiquetas: r.data.labelIds ?? [],
    }
  }

  /**
   * El watch caduca a los 7 días. Si el cron de renovación falla, Gmail
   * deja de avisar SIN dar ningún error: los logs se ven perfectos y
   * simplemente nunca vuelve a pasar nada.
   */
  async renovarWatch(topico: string): Promise<{ cursor: string; venceEl: Date }> {
    const r = await this.gmail.users.watch({
      userId: 'me', requestBody: { topicName: topico, labelIds: ['INBOX'] },
    })
    return {
      cursor: String(r.data.historyId ?? ''),
      venceEl: new Date(Number(r.data.expiration ?? Date.now() + 7 * 86_400_000)),
    }
  }
}
