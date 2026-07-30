import type { CorreoCrudo, Proveedor } from '../dominio/tipos.ts'
import { correoDe } from '../dominio/resolutor.ts'

/**
 * Cada proveedor marca el ruido a su manera, así que el prefiltro se
 * define por proveedor. De aquí en adelante el pipeline es idéntico.
 */
const ETIQUETAS_RUIDO: Record<Proveedor, string[]> = {
  gmail: ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'SPAM', 'TRASH'],
  outlook: ['junkemail', 'deleteditems', 'clutter', 'inferencia:other'],
}

/**
 * Filtro sin costo: mata el grueso del volumen antes de gastar un token.
 * De ~200 correos diarios, al modelo le llegan unos 30.
 *
 * Sólo descarta lo que es ruido con certeza. Ante la duda deja pasar:
 * un falso positivo aquí significa perder una clase cancelada.
 */
export function esRuidoObvio(
  correo: CorreoCrudo,
  proveedor: Proveedor,
  remitentesIgnorados: readonly string[]
): boolean {
  const ruido = ETIQUETAS_RUIDO[proveedor].map((e) => e.toLowerCase())
  if (correo.etiquetas.some((e) => ruido.includes(e.toLowerCase()))) return true

  const de = correoDe(correo.remitente)
  return remitentesIgnorados.some((r) => r.trim().toLowerCase() === de)
}
