import { createHash } from 'node:crypto'

/**
 * Leer plata escrita como la escribe un banco colombiano.
 *
 * El modelo devuelve el monto **tal como aparece en el correo**, en texto,
 * y aquí se convierte a número. Es la misma disciplina que con las fechas:
 * pedirle a un LLM que normalice `$1.240.000` a `1240000` es pedirle
 * aritmética, y es justo donde se equivoca sin avisar — devolvería
 * `1.24` con la misma seguridad.
 *
 * La ambigüedad real: en Colombia el punto separa miles (`$1.240.000` son
 * un millón doscientos cuarenta mil) mientras que en un cargo en dólares
 * `45.99` son cuarenta y cinco con noventa y nueve. Se resuelve por la
 * forma del número, no por la moneda, porque la moneda a veces tampoco
 * viene.
 */

export type Moneda = 'COP' | 'USD' | 'EUR' | string

/** Céntimos, o centavos. Se guarda en entero: los flotantes pierden plata. */
export interface Monto {
  /** En la unidad menor: 1.240.000 pesos son 124000000. */
  centavos: number
  moneda: Moneda
}

/** Cuántos decimales tiene de verdad cada moneda. */
const DECIMALES: Record<string, number> = { COP: 2, USD: 2, EUR: 2 }

export function monedaDe(texto: string, porDefecto: Moneda = 'COP'): Moneda {
  const t = texto.toUpperCase()
  // Lo más específico primero: «US$» contiene «$».
  if (/US\$|\bUSD\b|\bDÓLAR|\bDOLAR/.test(t)) return 'USD'
  if (/\bEUR\b|€|\bEURO/.test(t)) return 'EUR'
  if (/\bCOP\b|\$|\bPESO/.test(t)) return 'COP'
  return porDefecto
}

/**
 * De «$1.240.000,50» a centavos.
 *
 * Devuelve `null` si no hay un número reconocible: mejor no registrar que
 * registrar mal. Un libro contable que se equivoca en silencio es la peor
 * forma de fallar que tiene este sistema.
 */
export function parsearMonto(texto: string, moneda: Moneda = 'COP'): number | null {
  const crudo = texto.replace(/\s/g, '')
  const encontrado = /(-?[\d.,]+)/.exec(crudo)
  if (!encontrado) return null
  const soloNumero = encontrado[1]!

  // El signo suele ir ANTES del símbolo de moneda —«-$45.000»— y ahí la
  // expresión de arriba ya no lo alcanza. Se mira lo que quedó delante.
  const delante = crudo.slice(0, encontrado.index)

  const tieneComa = soloNumero.includes(',')
  const tienePunto = soloNumero.includes('.')
  let entero = soloNumero
  let decimal = ''

  if (tieneComa && tienePunto) {
    // El que aparece más a la derecha es el decimal: cubre «1.240.000,50»
    // (colombiano) y «1,240,000.50» (anglosajón) sin adivinar el idioma.
    const usaComaDecimal = soloNumero.lastIndexOf(',') > soloNumero.lastIndexOf('.')
    const separador = usaComaDecimal ? ',' : '.'
    const corte = soloNumero.lastIndexOf(separador)
    entero = soloNumero.slice(0, corte)
    decimal = soloNumero.slice(corte + 1)
  } else if (tieneComa) {
    const trozos = soloNumero.split(',')
    const ultimo = trozos.at(-1)!
    // «1,240» con tres cifras detrás son mil doscientos cuarenta, no 1.24.
    if (trozos.length === 2 && ultimo.length !== 3) {
      entero = trozos[0]!
      decimal = ultimo
    }
  } else if (tienePunto) {
    const trozos = soloNumero.split('.')
    const ultimo = trozos.at(-1)!
    if (trozos.length === 2 && ultimo.length !== 3) {
      entero = trozos[0]!
      decimal = ultimo
    }
  }

  const digitos = entero.replace(/[^\d-]/g, '')
  if (!/\d/.test(digitos)) return null

  const escala = DECIMALES[moneda] ?? 2
  const menor = (decimal.replace(/\D/g, '') + '0'.repeat(escala)).slice(0, escala)
  const negativo = digitos.startsWith('-') || /[-−]/.test(delante)

  const valor = Number(digitos.replace('-', '')) * 10 ** escala + Number(menor || 0)
  if (!Number.isFinite(valor)) return null
  return negativo ? -valor : valor
}

/** Para enseñarlo: 124000000 centavos → «$1.240.000». */
export function enPalabras(centavos: number, moneda: Moneda = 'COP'): string {
  const escala = DECIMALES[moneda] ?? 2
  const signo = centavos < 0 ? '−' : ''
  const abs = Math.abs(centavos)
  const enteros = Math.floor(abs / 10 ** escala)
  const resto = abs % 10 ** escala

  const miles = enteros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const simbolo = moneda === 'COP' ? '$' : moneda === 'USD' ? 'US$' : '€'

  // Los pesos casi nunca llevan centavos y ponerlos en cero ensucia.
  const cola = moneda === 'COP' && resto === 0
    ? ''
    : `,${String(resto).padStart(escala, '0')}`

  return `${signo}${simbolo}${miles}${cola}`
}

/**
 * Normalizar a quién se le pagó, para poder compararlo.
 *
 * «BANCOLOMBIA S.A.», «Bancolombia SA» y «bancolombia  s.a` son el mismo
 * acreedor, y si no lo son para el hash, el mismo aviso reenviado entra
 * dos veces al libro.
 */
export function normalizarContraparte(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?a\.?s?\.?|ltda\.?|s\.?a\.?s\.?|inc\.?|corp\.?)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * La huella que impide contar dos veces el mismo movimiento.
 *
 * El banco reenvía el mismo aviso, Marcelo lo reenvía, o la recuperación
 * tras un apagón reprocesa un rango. Sin esto el libro cuenta dos veces el
 * mismo ingreso y **queda mintiendo en silencio**, que es la peor forma de
 * fallar en contabilidad. Va con constraint UNIQUE en la base, no con una
 * consulta previa: eso lo hace seguro ante dos avisos que lleguen a la vez.
 */
export function hashDedup(m: {
  fecha: string
  centavos: number
  moneda: Moneda
  contraparte: string
}): string {
  const partes = [
    m.fecha.slice(0, 10),
    String(m.centavos),
    m.moneda.toUpperCase(),
    normalizarContraparte(m.contraparte),
  ]
  return createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 32)
}
