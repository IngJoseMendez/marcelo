import { CorreoInalcanzable, type CorreoCrudo } from '../dominio/tipos.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'

interface MensajeGraph {
  id: string
  conversationId?: string
  subject?: string
  receivedDateTime?: string
  parentFolderId?: string
  inferenceClassification?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  body?: { content?: string; contentType?: string }
  bodyPreview?: string
}

/** Quita etiquetas HTML sin traerse una librería entera. */
function aTextoPlano(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Outlook por Microsoft Graph. Se usa fetch directo en vez del SDK: la
 * superficie que necesitamos son tres endpoints y así no arrastramos una
 * dependencia grande por eso.
 */
export class FuenteOutlook {
  private token: { valor: string; venceEn: number } | null = null

  constructor(
    private readonly cfg: {
      clientId: string
      clientSecret: string
      tenantId: string
      refreshToken: string
    },
    private readonly cuentaId: number
  ) {}

  private async accessToken(): Promise<string> {
    // Margen de 60s: un token que vence a mitad de la petición falla igual.
    if (this.token && Date.now() < this.token.venceEn - 60_000) return this.token.valor

    const r = await fetch(
      `https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          refresh_token: this.cfg.refreshToken,
          grant_type: 'refresh_token',
          scope: 'Mail.Read offline_access',
        }),
      })

    if (!r.ok) throw new Error(`Outlook: no se pudo renovar el token (${r.status})`)
    const j = (await r.json()) as { access_token: string; expires_in: number }
    this.token = { valor: j.access_token, venceEn: Date.now() + j.expires_in * 1000 }
    return j.access_token
  }

  private async pedir<T>(url: string): Promise<T> {
    const r = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
      headers: { authorization: `Bearer ${await this.accessToken()}` },
    })
    if (!r.ok) {
      const e = new Error(`Graph ${r.status}: ${await r.text()}`) as Error & { code?: number }
      e.code = r.status
      throw e
    }
    return (await r.json()) as T
  }

  /**
   * Delta de la bandeja. Graph devuelve un deltaLink al final, que es el
   * cursor para la próxima vez. Un cursor viejo da 410 Gone.
   */
  async idsDesde(deltaLink: string): Promise<
    { caduco: false; ids: string[]; nuevoCursor: string } | { caduco: true }
  > {
    try {
      const j = await this.pedir<{
        value: MensajeGraph[]
        '@odata.deltaLink'?: string
        '@odata.nextLink'?: string
      }>(deltaLink)
      return {
        caduco: false,
        ids: (j.value ?? []).map((m) => m.id).filter(Boolean),
        nuevoCursor: j['@odata.deltaLink'] ?? j['@odata.nextLink'] ?? deltaLink,
      }
    } catch (e) {
      if ((e as { code?: number }).code === 410) return { caduco: true }
      throw e
    }
  }

  /** Primer arranque o cursor caducado: empieza un delta nuevo. */
  async iniciarDelta(): Promise<{ ids: string[]; cursor: string }> {
    const j = await this.pedir<{
      value: MensajeGraph[]
      '@odata.deltaLink'?: string
      '@odata.nextLink'?: string
    }>('/me/mailFolders/inbox/messages/delta')
    return {
      ids: (j.value ?? []).map((m) => m.id).filter(Boolean),
      cursor: j['@odata.deltaLink'] ?? j['@odata.nextLink'] ?? '',
    }
  }

  async mensajeCompleto(messageId: string): Promise<CorreoCrudo> {
    // Borrado, o de una cuenta que ya no es ésta: no lo arregla insistir.
    const m = await this.pedir<MensajeGraph>(
      `/me/messages/${messageId}` +
      '?$select=id,conversationId,subject,receivedDateTime,from,body,' +
      'parentFolderId,inferenceClassification')
      .catch((e: unknown) => {
        const codigo = (e as { code?: number }).code
        if (codigo === 404 || codigo === 410) {
          throw new CorreoInalcanzable(messageId, 'outlook')
        }
        throw e
      })

    const contenido = m.body?.content ?? m.bodyPreview ?? ''
    const cuerpo = m.body?.contentType?.toLowerCase() === 'html'
      ? aTextoPlano(contenido)
      : contenido

    // El prefiltro trabaja con etiquetas: se traducen las señales de
    // Outlook a ese vocabulario para que el pipeline no cambie.
    const etiquetas = [m.parentFolderId ?? '']
    if (m.inferenceClassification === 'other') etiquetas.push('inferencia:other')

    const direccion = m.from?.emailAddress?.address ?? '(desconocido)'
    const nombre = m.from?.emailAddress?.name

    return {
      cuentaId: this.cuentaId,
      messageId: m.id,
      threadId: m.conversationId ?? null,
      remitente: nombre ? `${nombre} <${direccion}>` : direccion,
      asunto: m.subject ?? null,
      cuerpo,
      recibidoEn: m.receivedDateTime ?? new Date().toISOString(),
      etiquetas: etiquetas.filter(Boolean),
    }
  }
}
