import { normalizarContraparte } from './dinero.ts'

/**
 * En qué se le va la plata.
 *
 * El modelo propone una categoría leyendo el correo, pero **manda el
 * código**: si la contraparte es Claro, es servicios, diga lo que diga el
 * texto del mensaje. Es la misma disciplina que con la prioridad de las
 * intenciones — el modelo lee, el código decide — y aquí importa más,
 * porque una categoría mal puesta no se nota hasta que alguien mira el
 * resumen del mes y no cuadra con lo que recuerda.
 */

export const CATEGORIAS = [
  'arriendo', 'servicios', 'mercado', 'transporte', 'salud', 'educacion',
  'restaurantes', 'compras', 'suscripciones', 'transferencia', 'retiro',
  'impuestos', 'ingreso', 'otros',
] as const

export type Categoria = (typeof CATEGORIAS)[number]

/**
 * Lo que se reconoce por el nombre de la contraparte.
 *
 * Deliberadamente corto y colombiano. Una lista larga envejece mal y da
 * una falsa sensación de cobertura; lo que no esté aquí lo propone el
 * modelo, que para eso está.
 */
const POR_CONTRAPARTE: Array<[RegExp, Categoria]> = [
  [/claro|movistar|tigo|wom|etb|epm|afinia|air e|vanti|acueducto|energia|gas natural/, 'servicios'],
  [/exito|olimpica|d1|ara|justo *bueno|carulla|jumbo|makro|surtimax/, 'mercado'],
  [/uber|didi|indriver|cabify|taxi|transmilenio|terpel|primax|biomax|esso|mobil/, 'transporte'],
  [/rappi|mcdonald|dominos|kfc|frisby|burger|crepes|juan valdez|starbucks/, 'restaurantes'],
  [/netflix|spotify|disney|hbo|max|prime video|youtube|apple|icloud|dropbox|adobe|openai|google one/, 'suscripciones'],
  [/eps|sura|sanitas|compensar|colsanitas|famisanar|drogueria|farmacia|cruz verde|locatel/, 'salud'],
  [/universidad|colegio|uninorte|unal|javeriana|andes|sena|platzi|udemy|coursera/, 'educacion'],
  [/dian|impuesto|predial|retefuente|iva/, 'impuestos'],
  [/arriendo|inmobiliaria|administracion.*conjunto|conjunto residencial/, 'arriendo'],
  [/cajero|retiro en|atm/, 'retiro'],
  [/nequi|daviplata|transferencia|pse|transfiya/, 'transferencia'],
]

export function esCategoria(valor: string): valor is Categoria {
  return (CATEGORIAS as readonly string[]).includes(valor)
}

export interface Entrada {
  /** Lo que propuso el modelo. Puede ser cualquier cosa. */
  propuesta: string
  contraparte: string
  concepto: string
  tipo: 'ingreso' | 'egreso'
}

/**
 * Decide la categoría final.
 *
 * Orden: la contraparte conocida gana siempre, después lo que propuso el
 * modelo si es una categoría que existe, y si no, `otros`. Un ingreso
 * nunca cae en una categoría de gasto — el modelo a veces mete «mercado»
 * en una devolución de compra, y eso descuadra el mes entero.
 */
export function decidirCategoria(e: Entrada): Categoria {
  if (e.tipo === 'ingreso') {
    // Sólo dos categorías tienen sentido cuando entra plata.
    const propuesta = e.propuesta.trim().toLowerCase()
    return propuesta === 'transferencia' ? 'transferencia' : 'ingreso'
  }

  const texto = normalizarContraparte(`${e.contraparte} ${e.concepto}`)
  for (const [patron, categoria] of POR_CONTRAPARTE) {
    if (patron.test(texto)) return categoria
  }

  const propuesta = e.propuesta.trim().toLowerCase()
  if (esCategoria(propuesta) && propuesta !== 'ingreso') return propuesta
  return 'otros'
}

/** Para pintarlas sin que nadie tenga que leer un identificador. */
export const NOMBRES: Record<Categoria, string> = {
  arriendo: 'Arriendo',
  servicios: 'Servicios',
  mercado: 'Mercado',
  transporte: 'Transporte',
  salud: 'Salud',
  educacion: 'Educación',
  restaurantes: 'Restaurantes',
  compras: 'Compras',
  suscripciones: 'Suscripciones',
  transferencia: 'Transferencias',
  retiro: 'Retiros',
  impuestos: 'Impuestos',
  ingreso: 'Ingresos',
  otros: 'Otros',
}
