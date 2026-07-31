import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOMBRE_TAREA, comandoDeTarea, comandosDeVigilia, enPalabras,
  revisarVigilia, valoresDePowercfg, type Ejecutar,
} from '../src/configuracion/vigilia.ts'

/** Lo que escupe powercfg en un Windows en inglés. */
const DORMIR_INGLES = `
Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
  Subgroup GUID: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Sleep)
    Power Setting GUID: 29f6c1db-86da-48c5-9fdb-f2b67b1f44da  (Sleep after)
      Minimum Possible Setting: 0x00000000
      Maximum Possible Setting: 0xffffffff
      Possible Settings increment: 0x00000001
      Current AC Power Setting Index: 0x00000708
      Current DC Power Setting Index: 0x00000384
`

/** Y lo mismo en español, que es lo que hay en la laptop de Marcelo. */
const DORMIR_ESPANOL = `
GUID de la combinación de energía: 381b4222-f694-41f0-9685-ff5bb260df2e  (Equilibrado)
  GUID del subgrupo: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Suspender)
    GUID de configuración de energía: 29f6c1db-86da-48c5-9fdb-f2b67b1f44da  (Suspender tras)
      Configuración mínima posible: 0x00000000
      Configuración máxima posible: 0xffffffff
      Incremento de configuraciones posibles: 0x00000001
      Índice de configuración de energía de CA actual: 0x00000000
      Índice de configuración de energía de CC actual: 0x00000384
`

// ── leer los ajustes de energía ─────────────────────────────────

test('lee los dos valores por posición, no por la etiqueta', () => {
  // Por posición a propósito: la etiqueta está traducida, y buscar «Current
  // AC Power Setting Index» fallaría justo en la única máquina que importa.
  assert.deepEqual(valoresDePowercfg(DORMIR_INGLES), { ac: 1800, dc: 900 })
  assert.deepEqual(valoresDePowercfg(DORMIR_ESPANOL), { ac: 0, dc: 900 })
})

test('los GUID no se confunden con valores', () => {
  // Llevan guiones y no empiezan por 0x: si se colaran, leeríamos basura.
  const v = valoresDePowercfg(DORMIR_INGLES)!
  assert.equal(v.ac, 1800)
})

test('si powercfg no dice nada, se admite en vez de inventar', () => {
  assert.equal(valoresDePowercfg('sin nada que leer'), null)
  assert.equal(valoresDePowercfg('0x00000001'), null)
})

// ── el estado entero ────────────────────────────────────────────

function maquina(o: {
  dormirAc?: number; tapaAc?: number; tarea?: boolean
}): Ejecutar {
  const hex = (n: number) => `0x${n.toString(16).padStart(8, '0')}`
  return async (programa, argumentos) => {
    if (programa === 'schtasks') return { ok: o.tarea ?? false, salida: '' }
    const esTapa = argumentos.includes('5ca83367-6e45-459f-a27b-476b1d01c936')
    const ac = esTapa ? (o.tapaAc ?? 1) : (o.dormirAc ?? 1800)
    return { ok: true, salida: `GUID: aaa-bbb\n  ${hex(ac)}\n  ${hex(900)}\n` }
  }
}

test('una laptop de fábrica: se duerme, se apaga al cerrar la tapa y no vuelve', async () => {
  const e = await revisarVigilia(maquina({}))

  assert.equal(e.listo, false)
  assert.equal(e.siempreDespierta, false)
  assert.equal(e.arrancaSola, false)

  const dichos = enPalabras(e).join(' ')
  assert.match(dichos, /se duerme a los 30 min/)
  assert.match(dichos, /Si cierras la tapa se duerme/)
  assert.match(dichos, /no vuelve sola/)
})

test('una laptop ya arreglada lo dice en cristiano', async () => {
  const e = await revisarVigilia(maquina({ dormirAc: 0, tapaAc: 0, tarea: true }))

  assert.equal(e.listo, true)
  const dichos = enPalabras(e).join(' ')
  assert.match(dichos, /no se duerme nunca/)
  assert.match(dichos, /cerrar la tapa y sigue trabajando/)
  assert.match(dichos, /Vuelve sola/)
})

test('con batería sí puede dormirse: eso es lo que la salva en un apagón', async () => {
  const e = await revisarVigilia(maquina({ dormirAc: 0, tapaAc: 0, tarea: true }))

  assert.equal(e.duerme!.dc, 900, 'con corriente es lo único que manda')
  assert.equal(e.listo, true)
})

// ── los comandos ────────────────────────────────────────────────

test('apaga la suspensión pero deja que la pantalla se apague', () => {
  const c = comandosDeVigilia().map((x) => x.argumentos.join(' '))

  assert.ok(c.some((x) => x.includes('standby-timeout-ac 0')))
  assert.ok(c.some((x) => x.includes('hibernate-timeout-ac 0')))
  assert.ok(c.some((x) => /monitor-timeout-ac (?!0\b)\d+/.test(x)),
    'la pantalla sí se apaga: no congela nada y cuida el panel')
  assert.equal(c.at(-1), '/setactive SCHEME_CURRENT', 'sin esto no se aplica')
})

test('la tarea apunta a la carpeta del proyecto y no pide administrador', () => {
  const c = comandoDeTarea('C:\\cerebro')

  assert.equal(c.programa, 'schtasks')
  assert.ok(c.argumentos.includes(NOMBRE_TAREA))
  assert.ok(c.argumentos.includes('onlogon'))
  assert.ok(c.argumentos.some((a) => a.includes('C:\\cerebro\\ARRANCAR.cmd')))
  assert.ok(!c.argumentos.includes('highest'),
    'no hace falta administrador, y pedirlo saca un aviso de Windows cada vez')
})

test('registrar dos veces no falla: se sobrescribe', () => {
  assert.ok(comandoDeTarea('C:\\x').argumentos.includes('/f'))
})
