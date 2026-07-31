/**
 * El paso que más duele a mano: conseguir un refresh_token.
 *
 * Google y Microsoft usan el mismo baile —código de autorización con
 * PKCE-menos, vuelta a un `redirect_uri` y canje por tokens— así que
 * cambian los nombres, no la forma. El `redirect_uri` es `localhost`, que
 * las dos plataformas permiten sin verificación ni dominio, y que además
 * es la razón por la que este asistente vive en la laptop y no en Vercel:
 * el consentimiento tiene que volver a la misma máquina que lo pidió.
 */

export type Proveedor = 'google' | 'microsoft'

export interface Tokens {
  refreshToken: string
  /** De qué cuenta, para poder enseñarlo. Sale del id_token. */
  cuenta: string
}

interface Definicion {
  autorizar: (tenant: string) => string
  canjear: (tenant: string) => string
  alcances: string[]
  /** Lo que obliga a que venga refresh_token y no sólo el de acceso. */
  extra: Record<string, string>
}

const PROVEEDORES: Record<Proveedor, Definicion> = {
  google: {
    autorizar: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    canjear: () => 'https://oauth2.googleapis.com/token',
    alcances: [
      'openid', 'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    // Sin `prompt=consent` la segunda vez Google devuelve todo menos el
    // refresh_token, y el asistente parecería haber fallado sin decir por qué.
    extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
  },
  microsoft: {
    autorizar: (t) => `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
    canjear: (t) => `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
    alcances: ['openid', 'email', 'offline_access', 'Mail.Read'],
    extra: { response_mode: 'query' },
  },
}

export interface Peticion {
  proveedor: Proveedor
  clientId: string
  redirectUri: string
  estado: string
  tenant?: string
}

export function urlDeConsentimiento(p: Peticion): string {
  const def = PROVEEDORES[p.proveedor]
  const url = new URL(def.autorizar(p.tenant || 'common'))
  const params = {
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: def.alcances.join(' '),
    state: p.estado,
    ...def.extra,
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url.toString()
}

/** El `email` del id_token. Viene del endpoint por TLS: no hay que validarlo. */
export function cuentaDelIdToken(idToken: string | undefined): string {
  const carga = idToken?.split('.')[1]
  if (!carga) return ''
  try {
    const json = JSON.parse(
      Buffer.from(carga.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as { email?: string; preferred_username?: string; upn?: string }
    return json.email ?? json.preferred_username ?? json.upn ?? ''
  } catch {
    return ''
  }
}

export interface RespuestaTokens {
  refresh_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

export async function canjearCodigo(
  p: Peticion & { clientSecret: string; codigo: string },
  buscar: Buscar = fetch
): Promise<Tokens> {
  const def = PROVEEDORES[p.proveedor]
  const cuerpo = new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    code: p.codigo,
    grant_type: 'authorization_code',
    redirect_uri: p.redirectUri,
  })

  const r = await buscar(def.canjear(p.tenant || 'common'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString(),
  })

  const datos = (await r.json().catch(() => ({}))) as RespuestaTokens
  if (!r.ok || datos.error) {
    throw new Error(datos.error_description ?? datos.error ?? `El canje falló (${r.status})`)
  }
  if (!datos.refresh_token) {
    // Pasa cuando ya se dio permiso antes: el proveedor devuelve sólo el de
    // acceso. Decirlo es mejor que guardar vacío y fallar dentro de una hora.
    throw new Error(
      'No llegó refresh_token. Quita el permiso a la app en tu cuenta y vuelve a conectar.')
  }

  return { refreshToken: datos.refresh_token, cuenta: cuentaDelIdToken(datos.id_token) }
}

/** Las claves del `.env` donde aterriza cada proveedor. */
export const CLAVES: Record<Proveedor, { refresh: string; cuenta: string }> = {
  google: { refresh: 'GOOGLE_REFRESH_TOKEN', cuenta: 'GOOGLE_CUENTA' },
  microsoft: { refresh: 'MS_REFRESH_TOKEN', cuenta: 'MS_CUENTA' },
}
