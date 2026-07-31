import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REQUISITOS, comandoDeInstalacion, gestorDe, plataformaActual, porId,
  revisarRequisitos, versionDe, type Ejecutar,
} from '../src/configuracion/requisitos.ts'

/** Una máquina de mentira: se le dice qué tiene y qué no. */
function maquina(tiene: Record<string, string>): { ejecutar: Ejecutar; corridos: string[] } {
  const corridos: string[] = []
  const ejecutar: Ejecutar = async (programa, argumentos) => {
    corridos.push([programa, ...argumentos].join(' '))
    const salida = tiene[programa]
    return salida === undefined
      ? { ok: false, salida: `'${programa}' no se reconoce` }
      : { ok: true, salida }
  }
  return { ejecutar, corridos }
}

const COMPLETA = {
  node: 'v22.11.0',
  docker: 'Docker version 27.3.1, build ce1223035a',
  cloudflared: 'cloudflared version 2025.1.0',
  ffmpeg: 'ffmpeg version n7.1 Copyright (c) 2000-2024',
  git: 'git version 2.47.1.windows.1',
}

// ── leer versiones ──────────────────────────────────────────────

test('saca la versión de lo que escupe cada programa', () => {
  assert.equal(versionDe('v22.11.0', /v?(\d+)\.\d+/), '22')
  assert.equal(versionDe('Docker version 27.3.1, build x', /(\d+)\.\d+/), '27')
  assert.equal(versionDe('ffmpeg version n7.1 Copy', /version\s+n?(\d+)/i), '7')
  assert.equal(versionDe('lo que sea', undefined), '')
})

// ── qué falta ───────────────────────────────────────────────────

test('una máquina con todo puesto no pide nada', async () => {
  const { ejecutar } = maquina(COMPLETA)

  const r = await revisarRequisitos(ejecutar, 'windows')

  assert.equal(r.listo, true)
  assert.equal(r.faltan, 0)
  assert.ok(r.requisitos.every((q) => q.salud === 'listo'))
})

test('una máquina recién comprada: sólo Node, y lo demás se ofrece', async () => {
  // Es el caso de verdad. El asistente corre en Node, así que Node siempre
  // está; lo que no está es todo lo demás, y era justo lo que se daba por
  // hecho en la documentación.
  const { ejecutar } = maquina({ node: 'v22.11.0' })

  const r = await revisarRequisitos(ejecutar, 'windows')

  assert.equal(r.listo, false, 'sin Docker no hay dónde guardar nada')
  const docker = r.requisitos.find((q) => q.id === 'docker')!
  assert.equal(docker.salud, 'falta')
  assert.equal(docker.instalable, true)
  assert.match(docker.porque, /base de datos/)
})

test('lo opcional no impide arrancar, pero se dice que falta', async () => {
  const { ejecutar } = maquina({
    node: COMPLETA.node, docker: COMPLETA.docker,
  })

  const r = await revisarRequisitos(ejecutar, 'windows')

  assert.equal(r.listo, true, 'ffmpeg y git no son imprescindibles')
  assert.equal(r.faltan, 3)
  assert.equal(r.requisitos.find((q) => q.id === 'ffmpeg')!.imprescindible, false)
})

test('Docker instalado pero cerrado es otra cosa que Docker ausente', async () => {
  // Confundirlos manda a alguien a reinstalar lo que ya tiene.
  const ejecutar: Ejecutar = async (programa, argumentos) => {
    if (programa !== 'docker') {
      return { ok: true, salida: COMPLETA[programa as keyof typeof COMPLETA] ?? 'v1' }
    }
    return argumentos[0] === 'info'
      ? { ok: false, salida: 'error during connect: docker daemon is not running' }
      : { ok: true, salida: COMPLETA.docker }
  }

  const r = await revisarRequisitos(ejecutar, 'windows')
  const docker = r.requisitos.find((q) => q.id === 'docker')!

  assert.equal(docker.salud, 'apagado')
  assert.equal(docker.version, '27', 'sí sabe qué versión tiene')
  assert.match(docker.mensaje, /Ábrelo/)
  assert.equal(r.listo, false)
})

test('un Node viejo se distingue de un Node ausente', async () => {
  const { ejecutar } = maquina({ ...COMPLETA, node: 'v18.20.4' })

  const node = (await revisarRequisitos(ejecutar, 'windows'))
    .requisitos.find((q) => q.id === 'node')!

  assert.equal(node.salud, 'viejo')
  assert.match(node.mensaje, /18.*20/s)
})

// ── cómo se instala en cada sistema ─────────────────────────────

test('en Windows se instala con winget, sin quedarse esperando a nadie', () => {
  const c = comandoDeInstalacion(porId('docker')!, 'windows')!

  assert.equal(c.programa, 'winget')
  assert.ok(c.argumentos.includes('Docker.DockerDesktop'))
  assert.ok(c.argumentos.includes('--accept-package-agreements'),
    'sin esto winget espera un sí en una consola que nadie mira')
  assert.ok(c.argumentos.includes('--disable-interactivity'))
})

test('en Mac con brew', () => {
  assert.deepEqual(comandoDeInstalacion(porId('ffmpeg')!, 'mac'),
    { programa: 'brew', argumentos: ['install', 'ffmpeg'] })
})

test('en Linux no se instala solo: haría falta sudo', () => {
  // Pedir la contraseña de root desde una página web es justo lo que no se
  // debe hacer. Ahí se ofrece el enlace y ya.
  assert.equal(comandoDeInstalacion(porId('docker')!, 'linux'), null)
  assert.equal(gestorDe('linux'), '')
})

test('cada requisito dice para qué sirve, no sólo cómo se llama', () => {
  for (const r of REQUISITOS) {
    assert.ok(r.porque.length > 20, `${r.id} no explica para qué hace falta`)
    assert.ok(r.manual.startsWith('https://'), `${r.id} no dice dónde bajarlo a mano`)
  }
})

test('el sistema se traduce a lo que entiende el instalador', () => {
  assert.equal(plataformaActual('win32'), 'windows')
  assert.equal(plataformaActual('darwin'), 'mac')
  assert.equal(plataformaActual('linux'), 'linux')
  assert.equal(gestorDe('windows'), 'winget')
})
