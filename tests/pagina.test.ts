import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginaConfiguracion } from '../src/configuracion/pagina.ts'

/**
 * La página del asistente lleva su JavaScript dentro de una plantilla de
 * TypeScript, y ahí nadie lo comprueba: el compilador ve una cadena.
 *
 * Un `\"` mal puesto ahí dentro dejó la página entera muerta —todos los
 * bloques en «cargando», para siempre— y el `tsc` pasaba limpio. Esta
 * prueba es la única red que hay debajo de ese código.
 */

const PAGINA = paginaConfiguracion({
  redirecciones: {
    google: 'http://localhost:3210/oauth/google',
    microsoft: 'http://localhost:3210/oauth/microsoft',
  },
  puertoServicio: 3000,
  urlPropuestaBase: 'postgres://asistente:x@localhost:5433/asistente',
})

const guion = (): string => PAGINA.split('<script>')[1]!.split('</script>')[0]!

test('el JavaScript de la página parsea', () => {
  // Si esto falla, la página abre pero no hace nada: los bloques se quedan
  // en «cargando» y no hay forma de configurar nada.
  assert.doesNotThrow(() => new Function(guion()),
    'el guión de la página tiene un error de sintaxis')
})

test('el guión no lleva comillas escapadas: dentro de una plantilla no escapan nada', () => {
  // `\"` dentro de un template literal de TS sale como `"` y parte la
  // cadena de JavaScript en dos. Es exactamente cómo se rompió.
  assert.ok(!guion().includes('\\"'),
    'usa comillas simples para los selectores, como el resto del archivo')
})

test('la página trae los bloques y su script', () => {
  assert.match(PAGINA, /<!doctype html>/i)
  for (const id of [
    'requisitos', 'vigilia', 'actualizar', 'base', 'groq',
    'google', 'telegram', 'tunel', 'app', 'outlook', 'manual',
  ]) {
    assert.ok(PAGINA.includes(`data-bloque="${id}"`), `falta el bloque ${id}`)
  }
})

test('cada cosa que el guión busca por id existe en el HTML', () => {
  // Pintar sobre un id que no está deja la pantalla a medias sin decir
  // nada: no lanza, simplemente no aparece.
  const buscados = [...guion().matchAll(/\$\('#([a-z-]+)'\)/g)].map((m) => m[1]!)
  const unicos = [...new Set(buscados)]

  assert.ok(unicos.length > 4, 'la prueba dejó de encontrar los selectores')
  for (const id of unicos) {
    assert.ok(PAGINA.includes(`id="${id}"`), `el guión pinta en #${id} y no existe`)
  }
})

test('los selectores de bloque del guión apuntan a bloques que existen', () => {
  const buscados = [...guion().matchAll(/\[data-bloque="([a-z-]+)"\]/g)].map((m) => m[1]!)

  for (const id of [...new Set(buscados)]) {
    assert.ok(PAGINA.includes(`data-bloque="${id}"`), `el guión busca ${id} y no existe`)
  }
})

test('el HTML no queda con etiquetas de plantilla sin resolver', () => {
  // Un `${…}` que sobrevive al render es un fallo de escapado, y en esta
  // página se ve como texto crudo en medio de la guía.
  assert.ok(!PAGINA.includes('${'), 'quedó una interpolación sin resolver')
})
