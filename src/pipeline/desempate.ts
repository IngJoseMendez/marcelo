import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { Candidato } from '../dominio/resolutor.ts'
import { EsquemaEleccion } from '../dominio/esquemas.ts'

const SISTEMA = `Te doy un correo y una lista CERRADA de compromisos candidatos.
Eliges cuál de ellos menciona el correo.

Responde con el id EXACTO de uno de los candidatos que te di.
Si ninguno encaja con claridad, responde compromisoId: null.
Nunca inventes un id que no esté en la lista.

Formato: {"compromisoId": 3, "justificacion": "..."}`

export function crearDesempate(llm: ProveedorLLM, modelo: string) {
  return {
    async elegir(candidatos: Candidato[], texto: string): Promise<Candidato | null> {
      if (candidatos.length === 0) return null
      // Con un solo candidato no hay nada que desempatar: no se gasta token.
      if (candidatos.length === 1) return candidatos[0]!

      const lista = candidatos
        .map((c) => {
          const alias = c.compromiso.alias.length
            ? ` (alias: ${c.compromiso.alias.join(', ')})`
            : ''
          return `- id ${c.compromiso.id}: ${c.compromiso.titulo}${alias}`
        })
        .join('\n')

      const eleccion = await llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: `Candidatos:\n${lista}\n\nCorreo:\n${texto}`,
        esquema: EsquemaEleccion,
      })

      // La garantía estructural del sistema: sólo se acepta un id que
      // estaba en la lista mostrada. Una alucinación se vuelve pregunta,
      // nunca un borrado. No depende de que el modelo sea bueno: depende
      // de que el código no le dé la opción.
      return candidatos.find((c) => c.compromiso.id === eleccion.compromisoId) ?? null
    },
  }
}

export type Desempate = ReturnType<typeof crearDesempate>
