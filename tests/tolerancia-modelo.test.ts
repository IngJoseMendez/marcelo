import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EsquemaClasificacion, EsquemaConfianza } from '../src/dominio/esquemas.ts'
import { EsquemaInterpretacion } from '../src/dominio/herramientas.ts'

/**
 * Lo que un modelo contesta cuando contesta BIEN.
 *
 * Estos cuatro casos pararon la lectura de correo entera en la máquina de
 * Marcelo: el modelo clasificaba perfectamente y el esquema lo rechazaba,
 * tres reintentos por correo, quemando cuota, con veintidós encolados. El
 * error decía «no se pudo llegar al proveedor» y el proveedor estaba ahí.
 *
 * La regla que sale de eso: **estricto con lo que significa, flexible con
 * cómo lo escribe.** Un decimal en vez de una etiqueta no cambia nada de
 * lo que hay que decidir.
 */

test('0.9 es alta: es como un modelo dice que está seguro', () => {
  assert.equal(EsquemaConfianza.parse(0.9), 'alta')
  assert.equal(EsquemaConfianza.parse(1), 'alta')
})

test('el corte de arriba es severo a propósito', () => {
  // «alta» es lo que la política deja actuar SIN preguntar. Un 0.8 lo
  // suelta cualquier modelo con bastante alegría, y no basta para eso.
  assert.equal(EsquemaConfianza.parse(0.8), 'media')
  assert.equal(EsquemaConfianza.parse(0.5), 'media')
  assert.equal(EsquemaConfianza.parse(0.49), 'baja')
  assert.equal(EsquemaConfianza.parse(0), 'baja')
})

test('en porcentaje quiere decir lo mismo', () => {
  assert.equal(EsquemaConfianza.parse(90), 'alta')
  assert.equal(EsquemaConfianza.parse(60), 'media')
  assert.equal(EsquemaConfianza.parse(10), 'baja')
})

test('las etiquetas en inglés se traducen en vez de costar un reintento', () => {
  assert.equal(EsquemaConfianza.parse('high'), 'alta')
  assert.equal(EsquemaConfianza.parse('MEDIUM'), 'media')
  assert.equal(EsquemaConfianza.parse('low'), 'baja')
})

test('un número escrito como texto también', () => {
  assert.equal(EsquemaConfianza.parse('0.95'), 'alta')
})

test('lo de siempre sigue funcionando igual', () => {
  assert.equal(EsquemaConfianza.parse('alta'), 'alta')
  assert.equal(EsquemaConfianza.parse(' Media '), 'media')
})

// Tolerar la forma no es tragarse cualquier cosa: lo que no significa nada
// se sigue rechazando, que es para lo que está el esquema.
test('lo que no quiere decir nada se sigue rechazando', () => {
  assert.throws(() => EsquemaConfianza.parse('regular'))
  assert.throws(() => EsquemaConfianza.parse(''))
  assert.throws(() => EsquemaConfianza.parse(null))
  assert.throws(() => EsquemaConfianza.parse({ nivel: 'alta' }))
})

test('la respuesta exacta que fallaba en producción ahora pasa', () => {
  const r = EsquemaClasificacion.parse(JSON.parse('{"clasificacion":"ruido","confianza":0.9}'))
  assert.deepEqual(r, { clasificacion: 'ruido', confianza: 'alta' })
})

/**
 * «Hola» no es una orden, y el modelo acierta al no sacar ninguna. Pedir
 * un mínimo de uno lo empujaba a inventarse algo para cumplir el esquema
 * —lo último que se quiere de un intérprete que puede cancelar clases— y
 * si no se lo inventaba, error rojo por un saludo.
 */
test('una lista de órdenes vacía es una respuesta, no un fallo', () => {
  const r = EsquemaInterpretacion.parse(JSON.parse('{"ordenes":[] }'))
  assert.deepEqual(r.ordenes, [])
})

test('el tope de cuatro sigue en pie: de una nota no salen quince acciones', () => {
  const una = {
    herramienta: 'consultar_agenda',
    referente: { tipo: 'hoy' },
    confianza: 'alta',
  }
  assert.throws(() => EsquemaInterpretacion.parse({ ordenes: Array(5).fill(una) }))
})

test('la confianza también se traduce dentro de una orden', () => {
  const r = EsquemaInterpretacion.parse({
    ordenes: [{
      herramienta: 'consultar_agenda',
      referente: { tipo: 'hoy' },
      confianza: 0.95,
    }],
  })
  assert.equal(r.ordenes[0]!.confianza, 'alta')
})
