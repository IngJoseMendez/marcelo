import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidir } from '../src/dominio/politica.ts'

test('correo + confianza alta + cancelar una instancia -> actúa callada', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_callado')
})

test('correo + confianza alta + borrar la serie -> actúa pero avisa', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'borrar_serie',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_y_avisar')
})

test('correo + confianza media -> actúa pero avisa', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'media', silenciadoPorRegla: false,
  }), 'actuar_y_avisar')
})

test('correo + confianza baja -> pregunta', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'baja', silenciadoPorRegla: false,
  }), 'preguntar')
})

test('voz + acción destructiva -> confirma aunque la confianza sea alta', () => {
  // La transcripción puede corromper el input: "mañana" -> "semana".
  assert.equal(decidir({
    origen: 'voz', tipo: 'borrar_serie',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'confirmar')
})

test('voz + acción reversible -> actúa y avisa', () => {
  assert.equal(decidir({
    origen: 'voz', tipo: 'mover_evento',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_y_avisar')
})

test('voz con confianza baja tampoco borra series a la brava', () => {
  assert.equal(decidir({
    origen: 'voz', tipo: 'borrar_serie',
    confianza: 'baja', silenciadoPorRegla: false,
  }), 'confirmar')
})

test('texto escrito por él -> actúa sin fricción', () => {
  assert.equal(decidir({
    origen: 'texto', tipo: 'borrar_serie',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_callado')
})

test('una regla de silencio degrada el aviso pero no impide actuar', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'media', silenciadoPorRegla: true,
  }), 'actuar_callado')
})

test('una regla de silencio NO convierte un "preguntar" en actuar', () => {
  // Si no entendió, callarla no la autoriza. Este es el caso que evita
  // que "de Bancolombia no me avises" se vuelva "de Bancolombia haz lo
  // que quieras sin preguntar".
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'baja', silenciadoPorRegla: true,
  }), 'preguntar')
})

test('una regla de silencio no autoriza borrar una serie en silencio... salvo que ya fuera segura', () => {
  // Confianza alta + destructiva + silenciada: la regla la puso él a
  // sabiendas, así que actúa callada. Queda auditado igual.
  assert.equal(decidir({
    origen: 'correo', tipo: 'borrar_serie',
    confianza: 'alta', silenciadoPorRegla: true,
  }), 'actuar_callado')
})
