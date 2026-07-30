import { DateTime } from 'luxon'

export const ZONA_POR_DEFECTO = 'America/Bogota'

/**
 * El tiempo entra al sistema por aquí y por ningún otro lado.
 *
 * Sin esto no se puede probar "llega el martes a las 11pm un correo que dice
 * 'la clase de mañana se cancela'", que es justo el caso donde el sistema se
 * equivoca de día. Nunca usar `new Date()` para lógica de negocio.
 */
export interface Reloj {
  ahora(): DateTime
}

export class RelojReal implements Reloj {
  constructor(private readonly zona: string = ZONA_POR_DEFECTO) {}

  ahora(): DateTime {
    return DateTime.now().setZone(this.zona)
  }
}

export class RelojFalso implements Reloj {
  private fijo: DateTime

  constructor(iso: string, zona: string = ZONA_POR_DEFECTO) {
    this.fijo = DateTime.fromISO(iso, { zone: zona })
    if (!this.fijo.isValid) {
      throw new Error(`RelojFalso: fecha inválida "${iso}" (${this.fijo.invalidReason})`)
    }
  }

  ahora(): DateTime {
    return this.fijo
  }

  avanzar(duracion: { days?: number; hours?: number; minutes?: number }): void {
    this.fijo = this.fijo.plus(duracion)
  }
}
