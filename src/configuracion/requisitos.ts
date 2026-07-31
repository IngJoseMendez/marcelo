/**
 * Lo que la máquina necesita tener, y cómo ponérselo si no lo tiene.
 *
 * El resto del asistente daba por hecho que Docker, cloudflared y ffmpeg
 * ya estaban ahí. En la laptop de Marcelo no hay ninguno de los tres, y
 * «instala Docker» en un documento es exactamente el punto donde alguien
 * que no es programador abandona.
 *
 * Así que esto se detecta y se instala desde la misma pantalla — pero
 * **preguntando cada vez**. Instalar software en la máquina de otro no es
 * algo que deba pasar por descuido: cada botón es una decisión suya.
 */

export type Plataforma = 'windows' | 'mac' | 'linux'

export type Ejecutar = (
  programa: string,
  argumentos: string[]
) => Promise<{ ok: boolean; salida: string }>

export interface Requisito {
  id: string
  nombre: string
  /** Para qué hace falta, en una línea que se pueda leer. */
  porque: string
  /** Sin esto la asistente no funciona. */
  imprescindible: boolean
  comprobar: { programa: string; argumentos: string[] }
  /** De dónde sacar el número de versión de la salida. */
  patronVersion?: RegExp
  /** Versión mayor mínima. */
  minimo?: number
  /** El identificador en el gestor de paquetes de cada sistema. */
  paquete: Partial<Record<Plataforma, string>>
  /** Por si el gestor no está o falla. */
  manual: string
  /** Además de instalado, tiene que estar corriendo. */
  debeEstarVivo?: { programa: string; argumentos: string[] }
}

export const REQUISITOS: readonly Requisito[] = [
  {
    id: 'node',
    nombre: 'Node.js',
    porque: 'Es donde corre la asistente. Si estás viendo esta página, ya lo tienes.',
    imprescindible: true,
    comprobar: { programa: 'node', argumentos: ['--version'] },
    patronVersion: /v?(\d+)\.\d+/,
    minimo: 20,
    paquete: { windows: 'OpenJS.NodeJS.LTS', mac: 'node', linux: 'nodejs' },
    manual: 'https://nodejs.org',
  },
  {
    id: 'docker',
    nombre: 'Docker Desktop',
    porque: 'Dentro vive la base de datos, que es donde se guarda todo lo que ella aprende.',
    imprescindible: true,
    comprobar: { programa: 'docker', argumentos: ['--version'] },
    patronVersion: /(\d+)\.\d+/,
    paquete: { windows: 'Docker.DockerDesktop', mac: 'docker', linux: 'docker.io' },
    manual: 'https://www.docker.com/products/docker-desktop/',
    // Instalado no basta: Docker Desktop puede estar cerrado, y entonces la
    // base no existe aunque el programa sí.
    debeEstarVivo: { programa: 'docker', argumentos: ['info', '--format', '{{.ServerVersion}}'] },
  },
  {
    id: 'cloudflared',
    nombre: 'cloudflared',
    porque: 'Abre el túnel por el que la app en tu teléfono alcanza esta laptop.',
    imprescindible: false,
    comprobar: { programa: 'cloudflared', argumentos: ['--version'] },
    patronVersion: /(\d+)\.\d+/,
    paquete: { windows: 'Cloudflare.cloudflared', mac: 'cloudflared', linux: 'cloudflared' },
    manual: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  },
  {
    id: 'ffmpeg',
    nombre: 'ffmpeg',
    porque: 'Sube el volumen de las notas de voz antes de transcribirlas. Llegan bajas, y eso hace que entienda mal.',
    imprescindible: false,
    comprobar: { programa: 'ffmpeg', argumentos: ['-version'] },
    patronVersion: /version\s+n?(\d+)/i,
    paquete: { windows: 'Gyan.FFmpeg', mac: 'ffmpeg', linux: 'ffmpeg' },
    manual: 'https://ffmpeg.org/download.html',
  },
  {
    id: 'git',
    nombre: 'Git',
    porque: 'Para traerte las mejoras que se publiquen después. Se puede vivir sin él.',
    imprescindible: false,
    comprobar: { programa: 'git', argumentos: ['--version'] },
    patronVersion: /(\d+)\.\d+/,
    paquete: { windows: 'Git.Git', mac: 'git', linux: 'git' },
    manual: 'https://git-scm.com/downloads',
  },
]

export type SaludRequisito = 'listo' | 'apagado' | 'viejo' | 'falta'

export interface EstadoRequisito {
  id: string
  nombre: string
  porque: string
  imprescindible: boolean
  salud: SaludRequisito
  version: string
  mensaje: string
  /** Se puede poner desde aquí, con un botón. */
  instalable: boolean
  manual: string
}

export function versionDe(salida: string, patron?: RegExp): string {
  if (!patron) return ''
  return patron.exec(salida)?.[1] ?? ''
}

export function plataformaActual(so: NodeJS.Platform): Plataforma {
  if (so === 'win32') return 'windows'
  if (so === 'darwin') return 'mac'
  return 'linux'
}

/** Con qué se instala en cada sistema. Vacío = no hay gestor que valga. */
export function gestorDe(plataforma: Plataforma): string {
  return plataforma === 'windows' ? 'winget' : plataforma === 'mac' ? 'brew' : ''
}

export function comandoDeInstalacion(
  requisito: Requisito,
  plataforma: Plataforma
): { programa: string; argumentos: string[] } | null {
  const paquete = requisito.paquete[plataforma]
  if (!paquete) return null

  if (plataforma === 'windows') {
    return {
      programa: 'winget',
      argumentos: [
        'install', '--id', paquete, '-e',
        // Sin esto winget se queda esperando a que alguien acepte términos
        // en una consola que nadie está mirando.
        '--accept-source-agreements', '--accept-package-agreements',
        '--disable-interactivity',
      ],
    }
  }
  if (plataforma === 'mac') {
    return { programa: 'brew', argumentos: ['install', paquete] }
  }
  // En Linux haría falta sudo, y pedir la contraseña de root desde una
  // página web es justo lo que no se debe hacer.
  return null
}

async function revisarUno(
  requisito: Requisito,
  ejecutar: Ejecutar,
  plataforma: Plataforma
): Promise<EstadoRequisito> {
  const base = {
    id: requisito.id,
    nombre: requisito.nombre,
    porque: requisito.porque,
    imprescindible: requisito.imprescindible,
    manual: requisito.manual,
    instalable: comandoDeInstalacion(requisito, plataforma) !== null,
  }

  const r = await ejecutar(requisito.comprobar.programa, requisito.comprobar.argumentos)
  if (!r.ok) {
    return {
      ...base, salud: 'falta', version: '',
      mensaje: requisito.imprescindible
        ? 'Hace falta. Puedo instalártelo.'
        : 'No lo tienes. Puedo instalártelo.',
    }
  }

  const version = versionDe(r.salida, requisito.patronVersion)
  if (requisito.minimo && version && Number(version) < requisito.minimo) {
    return {
      ...base, salud: 'viejo', version,
      mensaje: `Tienes la ${version} y hace falta la ${requisito.minimo} o más nueva.`,
    }
  }

  if (requisito.debeEstarVivo) {
    const vivo = await ejecutar(
      requisito.debeEstarVivo.programa, requisito.debeEstarVivo.argumentos)
    if (!vivo.ok) {
      return {
        ...base, salud: 'apagado', version,
        // Instalado pero cerrado es un estado aparte, y confundirlo con «no
        // está» manda a alguien a reinstalar lo que ya tiene.
        mensaje: 'Está instalado pero no está corriendo. Ábrelo y espera a que arranque.',
      }
    }
  }

  return {
    ...base, salud: 'listo', version,
    mensaje: version ? `versión ${version}` : 'listo',
  }
}

export async function revisarRequisitos(
  ejecutar: Ejecutar,
  plataforma: Plataforma,
  lista: readonly Requisito[] = REQUISITOS
): Promise<{ requisitos: EstadoRequisito[]; listo: boolean; faltan: number }> {
  const requisitos = await Promise.all(lista.map((r) => revisarUno(r, ejecutar, plataforma)))
  const rotos = requisitos.filter((r) => r.imprescindible && r.salud !== 'listo')
  return {
    requisitos,
    listo: rotos.length === 0,
    faltan: requisitos.filter((r) => r.salud !== 'listo').length,
  }
}

export const porId = (id: string): Requisito | undefined =>
  REQUISITOS.find((r) => r.id === id)
