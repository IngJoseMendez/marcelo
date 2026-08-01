import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  enPalabras, hashDedup, monedaDe, normalizarContraparte, parsearMonto,
} from '../src/dominio/dinero.ts'
import { decidirCategoria, NOMBRES } from '../src/dominio/categorias.ts'

/**
 * Aquí se decide si el libro miente o no.
 *
 * Un banco colombiano escribe «$1.240.000» y un cargo en dólares escribe
 * «45.99». El mismo punto significa cosas distintas, y equivocarse
 * multiplica o divide por mil una cifra que nadie va a volver a mirar.
 */

// ── leer plata ──────────────────────────────────────────────────

test('un monto colombiano: el punto separa miles', () => {
  assert.equal(parsearMonto('$1.240.000'), 124_000_000)
  assert.equal(parsearMonto('$89.900'), 8_990_000)
  assert.equal(parsearMonto('COP 45.000'), 4_500_000)
})

test('un monto en dólares: el punto es decimal', () => {
  assert.equal(parsearMonto('45.99', 'USD'), 4599)
  assert.equal(parsearMonto('US$ 9.50', 'USD'), 950)
})

test('con coma y punto manda el que esté más a la derecha', () => {
  // Cubre el colombiano «1.240.000,50» y el anglosajón «1,240,000.50»
  // sin tener que adivinar el idioma del banco.
  assert.equal(parsearMonto('$1.240.000,50'), 124_000_050)
  assert.equal(parsearMonto('1,240,000.50', 'USD'), 124_000_050)
})

test('tres cifras tras el separador son miles, no decimales', () => {
  // «1,240» son mil doscientos cuarenta. Leerlo como 1.24 divide por mil.
  assert.equal(parsearMonto('$1,240'), 124_000)
  assert.equal(parsearMonto('$1.240'), 124_000)
})

test('un número pelado también se lee', () => {
  assert.equal(parsearMonto('1240000'), 124_000_000)
  assert.equal(parsearMonto('Se debitaron 50000 pesos'), 5_000_000)
})

test('lo que no tiene número no se inventa', () => {
  // Mejor no registrar que registrar mal: un libro que se equivoca en
  // silencio es la peor forma de fallar que tiene este sistema.
  assert.equal(parsearMonto('sin cifras'), null)
  assert.equal(parsearMonto(''), null)
})

test('los negativos conservan el signo', () => {
  assert.equal(parsearMonto('-$45.000'), -4_500_000)
})

// ── qué moneda ──────────────────────────────────────────────────

test('reconoce la moneda por el símbolo y por el nombre', () => {
  assert.equal(monedaDe('$1.240.000'), 'COP')
  assert.equal(monedaDe('COP 45.000'), 'COP')
  assert.equal(monedaDe('USD 45.99'), 'USD')
  assert.equal(monedaDe('US$ 45.99'), 'USD')
  assert.equal(monedaDe('45,99 EUR'), 'EUR')
  assert.equal(monedaDe('cargo de 30 dólares'), 'USD')
})

test('«US$» no se confunde con «$»', () => {
  // Lo más específico primero: «US$» contiene «$», y en el otro orden todo
  // cargo en dólares entraría al libro como pesos.
  assert.equal(monedaDe('US$ 20'), 'USD')
})

test('sin pistas, pesos: es la moneda de la casa', () => {
  assert.equal(monedaDe('20000'), 'COP')
})

// ── escribirla ──────────────────────────────────────────────────

test('se escribe como la escribiría un colombiano', () => {
  assert.equal(enPalabras(124_000_000), '$1.240.000')
  assert.equal(enPalabras(8_990_000), '$89.900')
  assert.equal(enPalabras(-4_500_000), '−$45.000')
})

test('los pesos sin centavos no arrastran «,00»', () => {
  assert.equal(enPalabras(500_000), '$5.000')
  assert.equal(enPalabras(500_050), '$5.000,50')
})

test('las otras monedas sí llevan sus decimales', () => {
  assert.equal(enPalabras(4599, 'USD'), 'US$45,99')
})

test('lo que se lee se puede volver a escribir igual', () => {
  for (const texto of ['$1.240.000', '$89.900', '$45.000', '$5.000']) {
    assert.equal(enPalabras(parsearMonto(texto)!), texto)
  }
})

// ── la huella que evita contar dos veces ────────────────────────

test('el mismo movimiento da la misma huella, aunque el nombre venga distinto', () => {
  // El banco reenvía el aviso escribiendo «BANCOLOMBIA S.A.» donde antes
  // decía «Bancolombia SA». Si la huella cambia, el libro cuenta dos veces.
  const a = hashDedup({ fecha: '2026-08-07', centavos: 124_000_000, moneda: 'COP', contraparte: 'BANCOLOMBIA S.A.' })
  const b = hashDedup({ fecha: '2026-08-07', centavos: 124_000_000, moneda: 'COP', contraparte: 'Bancolombia SA' })

  assert.equal(a, b)
})

test('la fecha con hora no cambia la huella', () => {
  const a = hashDedup({ fecha: '2026-08-07', centavos: 1000, moneda: 'COP', contraparte: 'x' })
  const b = hashDedup({ fecha: '2026-08-07T14:30:00-05:00', centavos: 1000, moneda: 'COP', contraparte: 'x' })

  assert.equal(a, b)
})

test('dos cobros distintos dan huellas distintas', () => {
  const base = { fecha: '2026-08-07', centavos: 1000, moneda: 'COP', contraparte: 'Claro' }

  assert.notEqual(hashDedup(base), hashDedup({ ...base, centavos: 1001 }))
  assert.notEqual(hashDedup(base), hashDedup({ ...base, fecha: '2026-08-08' }))
  assert.notEqual(hashDedup(base), hashDedup({ ...base, contraparte: 'Movistar' }))
  assert.notEqual(hashDedup(base), hashDedup({ ...base, moneda: 'USD' }))
})

test('normalizar quita acentos, mayúsculas y sufijos de sociedad', () => {
  assert.equal(normalizarContraparte('Almacenes ÉXITO S.A.'), 'almacenes exito')
  assert.equal(normalizarContraparte('rappi  ltda'), 'rappi')
})

// ── en qué se va la plata ───────────────────────────────────────

const gasto = (contraparte: string, propuesta = '', concepto = '') =>
  decidirCategoria({ propuesta, contraparte, concepto, tipo: 'egreso' })

test('la contraparte conocida manda sobre lo que diga el modelo', () => {
  // El modelo a veces propone «compras» para un recibo de Claro. La
  // contraparte es un hecho; la propuesta es una opinión.
  assert.equal(gasto('CLARO COLOMBIA', 'compras'), 'servicios')
  assert.equal(gasto('Almacenes Éxito', 'otros'), 'mercado')
  assert.equal(gasto('UBER TRIP', ''), 'transporte')
  assert.equal(gasto('Netflix.com', 'compras'), 'suscripciones')
})

test('si no se reconoce, vale lo que propuso el modelo', () => {
  assert.equal(gasto('Ferretería La 30', 'compras'), 'compras')
})

test('una propuesta inventada cae en «otros»', () => {
  assert.equal(gasto('Algo raro', 'criptomonedas'), 'otros')
  assert.equal(gasto('Algo raro', ''), 'otros')
})

test('un ingreso nunca cae en una categoría de gasto', () => {
  // El modelo mete «mercado» en una devolución de compra, y eso descuadra
  // el mes entero: aparece como gasto lo que fue una entrada.
  assert.equal(
    decidirCategoria({ propuesta: 'mercado', contraparte: 'Éxito', concepto: 'devolución', tipo: 'ingreso' }),
    'ingreso')
  assert.equal(
    decidirCategoria({ propuesta: 'transferencia', contraparte: 'Nequi', concepto: '', tipo: 'ingreso' }),
    'transferencia')
})

test('toda categoría tiene nombre para enseñar', () => {
  for (const c of Object.keys(NOMBRES)) {
    assert.ok(NOMBRES[c as keyof typeof NOMBRES].length > 2, c)
  }
})
