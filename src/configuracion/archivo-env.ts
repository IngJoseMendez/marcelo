/**
 * Leer y escribir el `.env` sin destrozarlo.
 *
 * El archivo que edita el asistente es el mismo que lee una persona
 * cuando algo falla, así que fundir cambios tiene que conservar los
 * comentarios y el orden. Regenerarlo desde una plantilla sería más fácil
 * de escribir y borraría justo lo que hace entendible el archivo.
 */

/** Lo que hay que envolver en comillas para que no se rompa al releerlo. */
const NECESITA_COMILLAS = /[\s#'"]/

export function comoValor(bruto: string): string {
  const valor = bruto.trim()
  if (!valor) return ''
  if (!NECESITA_COMILLAS.test(valor)) return valor
  return `"${valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function desdeValor(bruto: string): string {
  const valor = bruto.trim()
  const comillas = /^(['"])([\s\S]*)\1$/.exec(valor)
  if (!comillas) return valor.split(' #')[0]!.trim()
  return comillas[1] === '"'
    ? comillas[2]!.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    : comillas[2]!
}

const LINEA = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

export function leerEnv(texto: string): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim() || linea.trimStart().startsWith('#')) continue
    const m = LINEA.exec(linea)
    if (m) valores[m[1]!] = desdeValor(m[2]!)
  }
  return valores
}

/**
 * Mete los cambios en el texto original.
 *
 * Lo que ya existe se reemplaza en su sitio; lo que no, se añade al final
 * bajo un encabezado que dice quién lo puso. Una clave con valor vacío se
 * escribe igual: dejar `GOOGLE_REFRESH_TOKEN=` es información —significa
 * «esto se intentó y está pendiente»— y borrar la línea no lo es.
 */
export function fundirEnv(original: string, cambios: Record<string, string>): string {
  const pendientes = new Map(Object.entries(cambios))
  const lineas = original.split(/\r?\n/)

  const salida = lineas.map((linea) => {
    const m = LINEA.exec(linea)
    if (!m) return linea
    const clave = m[1]!
    if (!pendientes.has(clave)) return linea
    const valor = pendientes.get(clave)!
    pendientes.delete(clave)
    return `${clave}=${comoValor(valor)}`
  })

  if (pendientes.size > 0) {
    if (salida.at(-1)?.trim()) salida.push('')
    salida.push('# ── Puesto por el asistente de configuración ──')
    for (const [clave, valor] of pendientes) salida.push(`${clave}=${comoValor(valor)}`)
    salida.push('')
  }

  return salida.join('\n')
}

/** El `.env` de partida cuando no hay ninguno: sólo el esqueleto comentado. */
export const ENV_INICIAL = `# ─────────────────────────────────────────────
#  Mi Segundo Cerebro
#  Este archivo lo escribe el asistente de configuración,
#  pero puedes editarlo a mano cuando quieras.
# ─────────────────────────────────────────────

ZONA_HORARIA=America/Bogota
MODO_SOMBRA=true
PUERTO=3000
NIVEL_LOG=info
`
