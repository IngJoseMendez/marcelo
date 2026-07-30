# Núcleo de agenda — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la asistente lea el correo de Marcelo, entienda cuando un mensaje cancela o mueve un compromiso que ella conoce, y modifique su Google Calendar sola — con auditoría completa y capacidad de deshacer.

**Architecture:** Pipeline determinista con el LLM acotado a tres puntos tipados (clasificar, extraer, desempatar). Todo lo que decide y actúa es código puro, probado con puertos falsos y reloj congelado. El modo sombra es una sustitución de puerto, no un flujo aparte.

**Tech Stack:** Node 20 · TypeScript · Fastify · PostgreSQL · Zod · Luxon · googleapis · SDK compatible con OpenAI apuntando a Groq · node-cron · pino · `node --test`

## Global Constraints

Estas reglas aplican a **todas** las tareas. No se repiten en cada una.

- **Node 20 o superior.** TypeScript en modo estricto, ESM (`"type": "module"`).
- **Zona horaria `America/Bogota` en todo el sistema.** Nunca usar `new Date()` para lógica de negocio; siempre `Reloj.ahora()` que devuelve un `DateTime` de Luxon en esa zona.
- **El LLM nunca calcula fechas.** Devuelve el referente en crudo; Luxon lo resuelve.
- **El LLM nunca genera identificadores.** En el desempate recibe candidatos concretos y devuelve uno de esa lista. Respuesta fuera de la lista → se descarta y se pregunta.
- **La operación inversa se guarda ANTES de aplicar la acción.**
- **La auditoría es append-only.** Deshacer agrega un registro; nunca borra.
- **Ningún correo se pierde.** La cola vive en Postgres, no en memoria.
- **Toda la suite de pruebas corre sin red**, con puertos falsos y reloj congelado.
- **Nombres de dominio en español** (`compromisos`, `resolutor`, `politica`), nombres de librerías y APIs externas en su idioma original.
- Proveedor LLM: **Groq con Zero Data Retention activado**. Los identificadores de modelo van en variables de entorno y se verifican contra el catálogo vigente el primer día.

---

## Estructura de archivos

```
src/
  config.ts                      env validado con Zod
  index.ts                       arranque: migraciones, crons, servidor
  db/
    pool.ts                      pool de Postgres
    migrate.ts                   runner de migraciones
    migraciones/001_inicial.sql
  puertos/
    reloj.ts                     Reloj: interfaz + real + falso
    fuente-correo.ts             FuenteCorreo: interfaz + tipos
    sumidero-calendario.ts       SumideroCalendario: interfaz + tipos
    proveedor-llm.ts             ProveedorLLM: interfaz
  dominio/
    tipos.ts                     tipos compartidos del dominio
    fechas.ts                    resolución de referentes temporales
    esquemas.ts                  esquemas Zod de extracción
    resolutor.ts                 cascada de puntaje de entidades
    politica.ts                  tabla de decisión de autonomía
    inversas.ts                  cálculo de la operación inversa
  repos/
    compromisos.ts
    correos.ts
    acciones.ts
    cola.ts
  adaptadores/
    google-auth.ts               OAuth + refresco de token
    gmail.ts                     FuenteCorreo real
    google-calendar.ts           SumideroCalendario real
    calendario-sombra.ts         SumideroCalendario que sólo graba
    groq.ts                      ProveedorLLM real
  pipeline/
    prefiltro.ts                 categorías de Gmail + reglas
    clasificador.ts
    extractor.ts
    desempate.ts
    actuador.ts
    procesar-correo.ts           orquestador
  servicios/
    sincronizacion.ts            watch, historyId, recuperación
    deshacer.ts
  http/
    servidor.ts                  Fastify: webhook Pub/Sub + /salud
tests/
  fakes/                         implementaciones falsas de cada puerto
  fixtures/correos/              correos de ejemplo en JSON
  *.test.ts
```

---

### Task 1: Esqueleto, configuración y esquema de base de datos

**Files:**
- Create: `package.json`, `tsconfig.json`, `docker-compose.yml`, `.env.example`
- Create: `src/config.ts`, `src/db/pool.ts`, `src/db/migrate.ts`, `src/db/migraciones/001_inicial.sql`
- Test: `tests/config.test.ts`, `tests/migraciones.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea)
- Produces: `config` (objeto congelado con la env validada), `obtenerPool(): Pool`, `migrar(pool: Pool): Promise<void>`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "asistente-marcelo",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "db:migrate": "tsx src/db/migrate.ts",
    "test": "node --import tsx --test tests/**/*.test.ts"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "fastify": "^5.2.0",
    "googleapis": "^144.0.0",
    "luxon": "^3.5.0",
    "node-cron": "^3.0.3",
    "openai": "^4.77.0",
    "pg": "^8.13.1",
    "pino": "^9.5.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/luxon": "^3.4.2",
    "@types/node": "^22.10.0",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.11.10",
    "pino-pretty": "^13.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

Ejecutar: `npm install`

- [ ] **Step 2: Crear `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Crear `docker-compose.yml` y `.env.example`**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: asistente
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: asistente
    ports:
      - "5433:5432"
    volumes:
      - datos_db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U asistente"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  datos_db:
```

`.env.example`:

```bash
DATABASE_URL=postgres://asistente:cambiame@localhost:5433/asistente
POSTGRES_PASSWORD=cambiame

ZONA_HORARIA=America/Bogota

GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODELO_CLASIFICADOR=
GROQ_MODELO_EXTRACTOR=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=primary
GMAIL_TOPICO_PUBSUB=

MODO_SOMBRA=true
PUERTO=3000
NIVEL_LOG=info
```

Ejecutar: `docker compose up -d db`

- [ ] **Step 4: Escribir el test de configuración que falla**

`tests/config.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarConfig } from '../src/config.ts'

test('rechaza configuración sin DATABASE_URL', () => {
  assert.throws(() => cargarConfig({ GROQ_API_KEY: 'x' }), /DATABASE_URL/)
})

test('usa America/Bogota por defecto', () => {
  const c = cargarConfig({
    DATABASE_URL: 'postgres://a:b@localhost:5433/c',
    GROQ_API_KEY: 'x',
  })
  assert.equal(c.zonaHoraria, 'America/Bogota')
})

test('modo sombra activado por defecto', () => {
  const c = cargarConfig({
    DATABASE_URL: 'postgres://a:b@localhost:5433/c',
    GROQ_API_KEY: 'x',
  })
  assert.equal(c.modoSombra, true)
})
```

- [ ] **Step 5: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — `Cannot find module '../src/config.ts'`

- [ ] **Step 6: Implementar `src/config.ts`**

```ts
import { z } from 'zod'

const Esquema = z.object({
  DATABASE_URL: z.string().url(),
  ZONA_HORARIA: z.string().default('America/Bogota'),
  GROQ_API_KEY: z.string().min(1),
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_MODELO_CLASIFICADOR: z.string().default(''),
  GROQ_MODELO_EXTRACTOR: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REFRESH_TOKEN: z.string().default(''),
  GOOGLE_CALENDAR_ID: z.string().default('primary'),
  GMAIL_TOPICO_PUBSUB: z.string().default(''),
  MODO_SOMBRA: z.string().default('true'),
  PUERTO: z.coerce.number().default(3000),
  NIVEL_LOG: z.string().default('info'),
})

export function cargarConfig(env: Record<string, string | undefined>) {
  const r = Esquema.safeParse(env)
  if (!r.success) {
    const faltantes = r.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Configuración inválida: ${faltantes}`)
  }
  const v = r.data
  return Object.freeze({
    urlBaseDatos: v.DATABASE_URL,
    zonaHoraria: v.ZONA_HORARIA,
    groq: {
      apiKey: v.GROQ_API_KEY,
      baseUrl: v.GROQ_BASE_URL,
      modeloClasificador: v.GROQ_MODELO_CLASIFICADOR,
      modeloExtractor: v.GROQ_MODELO_EXTRACTOR,
    },
    google: {
      clientId: v.GOOGLE_CLIENT_ID,
      clientSecret: v.GOOGLE_CLIENT_SECRET,
      refreshToken: v.GOOGLE_REFRESH_TOKEN,
      calendarId: v.GOOGLE_CALENDAR_ID,
      topicoPubsub: v.GMAIL_TOPICO_PUBSUB,
    },
    modoSombra: v.MODO_SOMBRA !== 'false',
    puerto: v.PUERTO,
    nivelLog: v.NIVEL_LOG,
  })
}

export type Config = ReturnType<typeof cargarConfig>
```

- [ ] **Step 7: Ejecutar el test y verificar que pasa**

Run: `npm test -- tests/config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Escribir la migración inicial**

`src/db/migraciones/001_inicial.sql`:

```sql
CREATE TABLE IF NOT EXISTS compromisos (
  id                     BIGSERIAL PRIMARY KEY,
  titulo                 TEXT NOT NULL,
  alias                  TEXT[] NOT NULL DEFAULT '{}',
  rrule                  TEXT,
  hora_inicio            TIME NOT NULL,
  hora_fin               TIME NOT NULL,
  tz                     TEXT NOT NULL DEFAULT 'America/Bogota',
  google_calendar_id     TEXT NOT NULL DEFAULT 'primary',
  google_event_id        TEXT,
  remitentes_vinculados  TEXT[] NOT NULL DEFAULT '{}',
  activo                 BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El cliente recibe correo en Gmail y en Outlook. Cada cuenta es una fuente.
CREATE TABLE IF NOT EXISTS cuentas_correo (
  id          BIGSERIAL PRIMARY KEY,
  proveedor   TEXT NOT NULL CHECK (proveedor IN ('gmail','outlook')),
  direccion   TEXT NOT NULL,
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proveedor, direccion)
);

CREATE TABLE IF NOT EXISTS correos_procesados (
  id             BIGSERIAL PRIMARY KEY,
  cuenta_id      BIGINT NOT NULL REFERENCES cuentas_correo(id),
  message_id     TEXT NOT NULL,
  thread_id      TEXT,
  remitente      TEXT NOT NULL,
  asunto         TEXT,
  recibido_en    TIMESTAMPTZ NOT NULL,
  clasificacion  TEXT,
  estado         TEXT NOT NULL DEFAULT 'pendiente',
  procesado_en   TIMESTAMPTZ,
  -- Los identificadores de mensaje sólo son únicos dentro de su proveedor.
  UNIQUE (cuenta_id, message_id)
);

CREATE TABLE IF NOT EXISTS acciones (
  id                BIGSERIAL PRIMARY KEY,
  tipo              TEXT NOT NULL,
  origen            TEXT NOT NULL CHECK (origen IN ('correo','voz','texto')),
  correo_id         BIGINT REFERENCES correos_procesados(id),
  compromiso_id     BIGINT REFERENCES compromisos(id),
  confianza         TEXT NOT NULL CHECK (confianza IN ('alta','media','baja')),
  payload_aplicado  JSONB NOT NULL,
  payload_inverso   JSONB NOT NULL,
  estado            TEXT NOT NULL
                    CHECK (estado IN ('aplicada','deshecha','sombra','pendiente')),
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deshecha_en       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cola (
  id            BIGSERIAL PRIMARY KEY,
  message_id    TEXT NOT NULL UNIQUE,
  intentos      INT NOT NULL DEFAULT 0,
  ultimo_error  TEXT,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','procesando','listo','muerto')),
  encolado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un cursor por cuenta: historyId en Gmail, deltaLink en Outlook.
CREATE TABLE IF NOT EXISTS sync_cuenta (
  cuenta_id             BIGINT PRIMARY KEY REFERENCES cuentas_correo(id),
  cursor                TEXT,
  suscripcion_vence_en  TIMESTAMPTZ,
  ultimo_latido         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_acciones_creada ON acciones (creada_en DESC);
CREATE INDEX IF NOT EXISTS idx_cola_estado ON cola (estado, encolado_en);
```

- [ ] **Step 9: Escribir el test de migraciones que falla**

`tests/migraciones.test.ts`:

```ts
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { migrar } from '../src/db/migrate.ts'

const url = process.env.DATABASE_URL ??
  'postgres://asistente:cambiame@localhost:5433/asistente'
let pool: pg.Pool

before(async () => { pool = new pg.Pool({ connectionString: url }); await migrar(pool) })
after(async () => { await pool.end() })

test('crea todas las tablas del núcleo', async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  )
  const tablas = rows.map((r) => r.table_name)
  for (const t of ['cuentas_correo','compromisos','correos_procesados',
                   'acciones','cola','sync_cuenta']) {
    assert.ok(tablas.includes(t), `falta la tabla ${t}`)
  }
})

test('el mismo message_id se rechaza dentro de una cuenta', async () => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO cuentas_correo (proveedor, direccion) VALUES ('gmail','a@b.com')
     ON CONFLICT (proveedor, direccion) DO UPDATE SET activa = TRUE RETURNING id`)
  const cuenta = rows[0]!.id
  const ins = `INSERT INTO correos_procesados (cuenta_id, message_id, remitente, recibido_en)
               VALUES ($1,$2,'x@y.com', now())`
  await pool.query(ins, [cuenta, 'dup-1'])
  await assert.rejects(() => pool.query(ins, [cuenta, 'dup-1']), /duplicate key/)
  await pool.query(`DELETE FROM correos_procesados WHERE message_id='dup-1'`)
})

test('el mismo message_id SÍ se acepta en cuentas distintas', async () => {
  // Gmail y Outlook numeran sus mensajes por separado: una colisión entre
  // proveedores no debe descartar un correo real.
  const cuentas = await pool.query<{ id: string }>(
    `INSERT INTO cuentas_correo (proveedor, direccion)
     VALUES ('gmail','uno@gmail.com'), ('outlook','uno@outlook.com')
     ON CONFLICT (proveedor, direccion) DO UPDATE SET activa = TRUE RETURNING id`)
  const ins = `INSERT INTO correos_procesados (cuenta_id, message_id, remitente, recibido_en)
               VALUES ($1,'mismo-id','x@y.com', now())`
  await pool.query(ins, [cuentas.rows[0]!.id])
  await pool.query(ins, [cuentas.rows[1]!.id])
  const { rows: n } = await pool.query(
    `SELECT count(*)::int AS n FROM correos_procesados WHERE message_id='mismo-id'`)
  assert.equal(n[0]!.n, 2)
  await pool.query(`DELETE FROM correos_procesados WHERE message_id='mismo-id'`)
})

test('migrar es idempotente', async () => {
  await migrar(pool)
  await migrar(pool)
})
```

- [ ] **Step 10: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/migraciones.test.ts`
Expected: FAIL — `Cannot find module '../src/db/migrate.ts'`

- [ ] **Step 11: Implementar `src/db/pool.ts` y `src/db/migrate.ts`**

`src/db/pool.ts`:

```ts
import pg from 'pg'

let pool: pg.Pool | undefined

export function obtenerPool(url: string): pg.Pool {
  pool ??= new pg.Pool({ connectionString: url, max: 10 })
  return pool
}
```

`src/db/migrate.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'migraciones')

export async function migrar(pool: pg.Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS migraciones (
    nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`)

  const archivos = (await readdir(carpeta)).filter((a) => a.endsWith('.sql')).sort()
  const { rows } = await pool.query<{ nombre: string }>('SELECT nombre FROM migraciones')
  const aplicadas = new Set(rows.map((r) => r.nombre))

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue
    const sql = await readFile(join(carpeta, archivo), 'utf8')
    const cliente = await pool.connect()
    try {
      await cliente.query('BEGIN')
      await cliente.query(sql)
      await cliente.query('INSERT INTO migraciones (nombre) VALUES ($1)', [archivo])
      await cliente.query('COMMIT')
    } catch (e) {
      await cliente.query('ROLLBACK')
      throw e
    } finally {
      cliente.release()
    }
  }
}
```

- [ ] **Step 12: Ejecutar los tests y verificar que pasan**

Run: `npm test`
Expected: PASS (6 tests). Si falla la conexión, verificar `docker compose ps`.

- [ ] **Step 13: Commit**

```bash
git add package.json tsconfig.json docker-compose.yml .env.example src/config.ts src/db tests/config.test.ts tests/migraciones.test.ts
git commit -m "feat: esqueleto del proyecto, configuración validada y esquema inicial"
```

---

### Task 2: Puerto Reloj y resolución de referentes temporales

Esta es la pieza de mayor valor del plan. Al LLM se le prohíbe calcular fechas
justo porque es lo que peor hace; toda la aritmética de calendario vive aquí y
se prueba exhaustivamente con tiempo congelado.

**Files:**
- Create: `src/puertos/reloj.ts`, `src/dominio/fechas.ts`
- Test: `tests/fechas.test.ts`

**Interfaces:**
- Consumes: `config.zonaHoraria` de Task 1
- Produces:
  - `interface Reloj { ahora(): DateTime }`
  - `class RelojReal implements Reloj`
  - `class RelojFalso implements Reloj` con `constructor(iso: string, zona?: string)`
  - `type Referente` (unión discriminada, ver abajo)
  - `resolverReferente(ref: Referente, ahora: DateTime): ResultadoReferente`
  - `type ResultadoReferente = { intervalo: Intervalo; ambiguo: boolean } | null`
  - `type Intervalo = { inicio: DateTime; fin: DateTime }`

- [ ] **Step 1: Escribir el test que falla**

`tests/fechas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { resolverReferente } from '../src/dominio/fechas.ts'

// martes 4 de agosto de 2026, 11:00 pm en Bogotá
const martes23 = new RelojFalso('2026-08-04T23:00:00').ahora()

test('"hoy" a las 11pm del martes sigue siendo martes, no miércoles', () => {
  const r = resolverReferente({ tipo: 'hoy' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-04')
  assert.equal(r.ambiguo, false)
})

test('"mañana" a las 11pm del martes es miércoles', () => {
  const r = resolverReferente({ tipo: 'manana' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-05')
})

test('"este miércoles" enviado el martes es el día siguiente', () => {
  const r = resolverReferente(
    { tipo: 'dia_semana', dia: 3, modificador: 'este' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-05')
})

test('"próximo miércoles" enviado el martes es la semana siguiente', () => {
  const r = resolverReferente(
    { tipo: 'dia_semana', dia: 3, modificador: 'proximo' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-12')
})

test('"próximo miércoles" enviado el martes se marca AMBIGUO', () => {
  // En español coloquial esto significa mañana para unos hablantes y la
  // semana entrante para otros. Marcarlo ambiguo hace que la política
  // pregunte en vez de adivinar sobre un borrado.
  const r = resolverReferente(
    { tipo: 'dia_semana', dia: 3, modificador: 'proximo' }, martes23)
  assert.ok(r)
  assert.equal(r.ambiguo, true)
})

test('"próximo lunes" enviado el martes NO es ambiguo (faltan 6 días)', () => {
  const r = resolverReferente(
    { tipo: 'dia_semana', dia: 1, modificador: 'proximo' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-10')
  assert.equal(r.ambiguo, false)
})

test('fecha explícita se respeta tal cual', () => {
  const r = resolverReferente({ tipo: 'fecha', iso: '2026-08-06' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toISODate(), '2026-08-06')
})

test('el intervalo cubre el día completo en zona de Bogotá', () => {
  const r = resolverReferente({ tipo: 'hoy' }, martes23)
  assert.ok(r)
  assert.equal(r.intervalo.inicio.toFormat('HH:mm'), '00:00')
  assert.equal(r.intervalo.fin.toFormat('HH:mm'), '23:59')
  assert.equal(r.intervalo.inicio.zoneName, 'America/Bogota')
})

test('referente desconocido devuelve null', () => {
  assert.equal(resolverReferente({ tipo: 'desconocido' }, martes23), null)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/fechas.test.ts`
Expected: FAIL — `Cannot find module '../src/puertos/reloj.ts'`

- [ ] **Step 3: Implementar `src/puertos/reloj.ts`**

```ts
import { DateTime } from 'luxon'

export const ZONA_POR_DEFECTO = 'America/Bogota'

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
    if (!this.fijo.isValid) throw new Error(`Fecha inválida: ${iso}`)
  }
  ahora(): DateTime { return this.fijo }
  avanzar(dias: number): void { this.fijo = this.fijo.plus({ days: dias }) }
}
```

- [ ] **Step 4: Implementar `src/dominio/fechas.ts`**

```ts
import type { DateTime } from 'luxon'

export type Referente =
  | { tipo: 'hoy' }
  | { tipo: 'manana' }
  | { tipo: 'fecha'; iso: string }
  | { tipo: 'dia_semana'; dia: number; modificador: 'este' | 'proximo' }
  | { tipo: 'desconocido' }

export type Intervalo = { inicio: DateTime; fin: DateTime }
export type ResultadoReferente = { intervalo: Intervalo; ambiguo: boolean } | null

/** Un "próximo <día>" que cae dentro de esta ventana se considera ambiguo. */
const DIAS_ZONA_AMBIGUA = 2

function diaCompleto(d: DateTime): Intervalo {
  return { inicio: d.startOf('day'), fin: d.endOf('day') }
}

export function resolverReferente(ref: Referente, ahora: DateTime): ResultadoReferente {
  switch (ref.tipo) {
    case 'hoy':
      return { intervalo: diaCompleto(ahora), ambiguo: false }

    case 'manana':
      return { intervalo: diaCompleto(ahora.plus({ days: 1 })), ambiguo: false }

    case 'fecha': {
      const d = ahora.set({ year: 0 }) // placeholder reemplazado abajo
      const parsed = ahora.zone
        ? ahora.set({}).setZone(ahora.zoneName!) : ahora
      const fecha = parsed.set({
        year: Number(ref.iso.slice(0, 4)),
        month: Number(ref.iso.slice(5, 7)),
        day: Number(ref.iso.slice(8, 10)),
      })
      void d
      if (!fecha.isValid) return null
      return { intervalo: diaCompleto(fecha), ambiguo: false }
    }

    case 'dia_semana': {
      if (ref.dia < 1 || ref.dia > 7) return null
      const hoyDia = ahora.weekday // 1 = lunes … 7 = domingo
      let delta = (ref.dia - hoyDia + 7) % 7
      if (delta === 0) delta = 7 // "este miércoles" dicho un miércoles = el siguiente
      if (ref.modificador === 'proximo' && delta <= DIAS_ZONA_AMBIGUA) {
        // El hablante pudo querer decir el de esta semana o el de la entrante.
        // Se elige el de la semana entrante y se marca ambiguo.
        return { intervalo: diaCompleto(ahora.plus({ days: delta + 7 })), ambiguo: true }
      }
      return { intervalo: diaCompleto(ahora.plus({ days: delta })), ambiguo: false }
    }

    case 'desconocido':
      return null
  }
}
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

Run: `npm test -- tests/fechas.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Simplificar el caso `fecha`**

El caso `'fecha'` del paso 4 quedó enredado. Reemplazarlo por:

```ts
    case 'fecha': {
      const fecha = DateTime.fromISO(ref.iso, { zone: ahora.zoneName ?? undefined })
      if (!fecha.isValid) return null
      return { intervalo: diaCompleto(fecha), ambiguo: false }
    }
```

Y agregar arriba del archivo: `import { DateTime } from 'luxon'` (cambiando el
`import type` por un import normal).

- [ ] **Step 7: Ejecutar los tests y verificar que siguen pasando**

Run: `npm test -- tests/fechas.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 8: Commit**

```bash
git add src/puertos/reloj.ts src/dominio/fechas.ts tests/fechas.test.ts
git commit -m "feat: reloj inyectable y resolución de referentes temporales con detección de ambigüedad"
```

---

### Task 3: Tipos del dominio y repositorios con idempotencia

**Files:**
- Create: `src/dominio/tipos.ts`, `src/repos/compromisos.ts`, `src/repos/correos.ts`
- Test: `tests/repos.test.ts`

**Interfaces:**
- Consumes: `obtenerPool` de Task 1
- Produces:
  - `type Compromiso = { id: number; titulo: string; alias: string[]; rrule: string | null; horaInicio: string; horaFin: string; tz: string; googleCalendarId: string; googleEventId: string | null; remitentesVinculados: string[]; activo: boolean }`
  - `type CorreoCrudo = { messageId: string; threadId: string | null; remitente: string; asunto: string | null; cuerpo: string; recibidoEn: string; etiquetas: string[] }`
  - `crearRepoCompromisos(pool)` → `{ listarActivos(): Promise<Compromiso[]>, crear(c): Promise<Compromiso>, porId(id): Promise<Compromiso | null> }`
  - `crearRepoCorreos(pool)` → `{ registrarSiEsNuevo(c: CorreoCrudo): Promise<{ id: number; nuevo: boolean }>, marcarProcesado(id, clasificacion): Promise<void> }`

- [ ] **Step 1: Escribir el test que falla**

`tests/repos.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { migrar } from '../src/db/migrate.ts'
import { crearRepoCompromisos } from '../src/repos/compromisos.ts'
import { crearRepoCorreos } from '../src/repos/correos.ts'

const url = process.env.DATABASE_URL ??
  'postgres://asistente:cambiame@localhost:5433/asistente'
let pool: pg.Pool

before(async () => { pool = new pg.Pool({ connectionString: url }); await migrar(pool) })
after(async () => { await pool.end() })
beforeEach(async () => {
  await pool.query('TRUNCATE acciones, cola, correos_procesados, compromisos RESTART IDENTITY CASCADE')
})

test('crea y lista compromisos activos', async () => {
  const repo = crearRepoCompromisos(pool)
  await repo.crear({
    titulo: 'Cálculo', alias: ['calculo', 'clase'],
    rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
    tz: 'America/Bogota', googleCalendarId: 'primary',
    googleEventId: 'evt_1', remitentesVinculados: ['ramirez@uni.edu.co'],
  })
  const activos = await repo.listarActivos()
  assert.equal(activos.length, 1)
  assert.equal(activos[0]!.titulo, 'Cálculo')
  assert.deepEqual(activos[0]!.alias, ['calculo', 'clase'])
})

test('el mismo message_id sólo se registra una vez', async () => {
  const repo = crearRepoCorreos(pool)
  const correo = {
    messageId: 'msg-1', threadId: 't-1', remitente: 'ramirez@uni.edu.co',
    asunto: 'Clase cancelada', cuerpo: 'No hay clase hoy',
    recibidoEn: '2026-08-04T14:14:00-05:00', etiquetas: ['INBOX'],
  }
  const primero = await repo.registrarSiEsNuevo(correo)
  const segundo = await repo.registrarSiEsNuevo(correo)

  assert.equal(primero.nuevo, true)
  assert.equal(segundo.nuevo, false)
  assert.equal(primero.id, segundo.id)

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM correos_procesados')
  assert.equal(rows[0]!.n, 1)
})

test('marcarProcesado guarda la clasificación', async () => {
  const repo = crearRepoCorreos(pool)
  const { id } = await repo.registrarSiEsNuevo({
    messageId: 'msg-2', threadId: null, remitente: 'a@b.com',
    asunto: null, cuerpo: '', recibidoEn: '2026-08-04T10:00:00-05:00', etiquetas: [],
  })
  await repo.marcarProcesado(id, 'agenda')
  const { rows } = await pool.query(
    'SELECT clasificacion, estado FROM correos_procesados WHERE id=$1', [id])
  assert.equal(rows[0]!.clasificacion, 'agenda')
  assert.equal(rows[0]!.estado, 'procesado')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/repos.test.ts`
Expected: FAIL — `Cannot find module '../src/repos/compromisos.ts'`

- [ ] **Step 3: Implementar `src/dominio/tipos.ts`**

```ts
export type Confianza = 'alta' | 'media' | 'baja'
export type Origen = 'correo' | 'voz' | 'texto'
export type Clasificacion = 'agenda' | 'finanzas' | 'ruido'

export interface Compromiso {
  id: number
  titulo: string
  alias: string[]
  rrule: string | null
  horaInicio: string
  horaFin: string
  tz: string
  googleCalendarId: string
  googleEventId: string | null
  remitentesVinculados: string[]
  activo: boolean
}

export type NuevoCompromiso = Omit<Compromiso, 'id' | 'activo'>

export interface CorreoCrudo {
  messageId: string
  threadId: string | null
  remitente: string
  asunto: string | null
  cuerpo: string
  recibidoEn: string
  etiquetas: string[]
}
```

- [ ] **Step 4: Implementar `src/repos/compromisos.ts`**

```ts
import type pg from 'pg'
import type { Compromiso, NuevoCompromiso } from '../dominio/tipos.ts'

interface Fila {
  id: string; titulo: string; alias: string[]; rrule: string | null
  hora_inicio: string; hora_fin: string; tz: string
  google_calendar_id: string; google_event_id: string | null
  remitentes_vinculados: string[]; activo: boolean
}

const aDominio = (f: Fila): Compromiso => ({
  id: Number(f.id),
  titulo: f.titulo,
  alias: f.alias,
  rrule: f.rrule,
  horaInicio: f.hora_inicio.slice(0, 5),
  horaFin: f.hora_fin.slice(0, 5),
  tz: f.tz,
  googleCalendarId: f.google_calendar_id,
  googleEventId: f.google_event_id,
  remitentesVinculados: f.remitentes_vinculados,
  activo: f.activo,
})

const COLUMNAS = `id, titulo, alias, rrule, hora_inicio, hora_fin, tz,
  google_calendar_id, google_event_id, remitentes_vinculados, activo`

export function crearRepoCompromisos(pool: pg.Pool) {
  return {
    async listarActivos(): Promise<Compromiso[]> {
      const { rows } = await pool.query<Fila>(
        `SELECT ${COLUMNAS} FROM compromisos WHERE activo ORDER BY id`)
      return rows.map(aDominio)
    },

    async porId(id: number): Promise<Compromiso | null> {
      const { rows } = await pool.query<Fila>(
        `SELECT ${COLUMNAS} FROM compromisos WHERE id=$1`, [id])
      return rows[0] ? aDominio(rows[0]) : null
    },

    async crear(c: NuevoCompromiso): Promise<Compromiso> {
      const { rows } = await pool.query<Fila>(
        `INSERT INTO compromisos
           (titulo, alias, rrule, hora_inicio, hora_fin, tz,
            google_calendar_id, google_event_id, remitentes_vinculados)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING ${COLUMNAS}`,
        [c.titulo, c.alias, c.rrule, c.horaInicio, c.horaFin, c.tz,
         c.googleCalendarId, c.googleEventId, c.remitentesVinculados])
      return aDominio(rows[0]!)
    },
  }
}

export type RepoCompromisos = ReturnType<typeof crearRepoCompromisos>
```

- [ ] **Step 5: Implementar `src/repos/correos.ts`**

```ts
import type pg from 'pg'
import type { CorreoCrudo } from '../dominio/tipos.ts'

export function crearRepoCorreos(pool: pg.Pool) {
  return {
    /**
     * Inserta el correo si su message_id no existe. La unicidad la garantiza
     * el constraint UNIQUE, no una consulta previa: eso hace la operación
     * segura ante reintentos concurrentes de Pub/Sub.
     */
    async registrarSiEsNuevo(c: CorreoCrudo): Promise<{ id: number; nuevo: boolean }> {
      const insertado = await pool.query<{ id: string }>(
        `INSERT INTO correos_procesados
           (message_id, thread_id, remitente, asunto, recibido_en)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (message_id) DO NOTHING
         RETURNING id`,
        [c.messageId, c.threadId, c.remitente, c.asunto, c.recibidoEn])

      if (insertado.rows[0]) return { id: Number(insertado.rows[0].id), nuevo: true }

      const existente = await pool.query<{ id: string }>(
        'SELECT id FROM correos_procesados WHERE message_id=$1', [c.messageId])
      return { id: Number(existente.rows[0]!.id), nuevo: false }
    },

    async marcarProcesado(id: number, clasificacion: string): Promise<void> {
      await pool.query(
        `UPDATE correos_procesados
            SET clasificacion=$2, estado='procesado', procesado_en=now()
          WHERE id=$1`, [id, clasificacion])
    },
  }
}

export type RepoCorreos = ReturnType<typeof crearRepoCorreos>
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/repos.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/dominio/tipos.ts src/repos tests/repos.test.ts
git commit -m "feat: tipos del dominio y repositorios con idempotencia por message_id"
```

---

### Task 4: Resolutor de entidades

Responde la pregunta central del sistema: llega *"la clase de hoy se cancela"*,
¿a cuál de sus compromisos apunta?

**Files:**
- Create: `src/dominio/resolutor.ts`
- Test: `tests/resolutor.test.ts`

**Interfaces:**
- Consumes: `Compromiso` de Task 3, `Intervalo` de Task 2
- Produces:
  - `type Candidato = { compromiso: Compromiso; puntaje: number; senales: string[] }`
  - `type Resolucion = { estado: 'resuelto'; candidato: Candidato; confianza: Confianza } | { estado: 'empate'; candidatos: Candidato[] } | { estado: 'sin_candidatos' }`
  - `resolver(entrada: EntradaResolutor): Resolucion`
  - `type EntradaResolutor = { compromisos: Compromiso[]; remitente: string; texto: string; intervalo: Intervalo | null; ambiguo: boolean; threadCompromisoId: number | null }`

- [ ] **Step 1: Escribir el test que falla**

`tests/resolutor.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { resolverReferente } from '../src/dominio/fechas.ts'
import { resolver } from '../src/dominio/resolutor.ts'
import type { Compromiso } from '../src/dominio/tipos.ts'

const base: Omit<Compromiso, 'id' | 'titulo' | 'alias' | 'remitentesVinculados'> = {
  rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
  tz: 'America/Bogota', googleCalendarId: 'primary',
  googleEventId: 'evt', activo: true,
}

const calculo: Compromiso = {
  ...base, id: 1, titulo: 'Cálculo', alias: ['calculo', 'clase'],
  remitentesVinculados: ['ramirez@uni.edu.co'],
}
const fisica: Compromiso = {
  ...base, id: 2, titulo: 'Física', alias: ['fisica'],
  remitentesVinculados: ['lopez@uni.edu.co'],
}
// mismo profesor, mismo día: el caso tramposo
const calculoTaller: Compromiso = {
  ...base, id: 3, titulo: 'Taller de Cálculo', alias: ['taller'],
  remitentesVinculados: ['ramirez@uni.edu.co'],
}

const martes = new RelojFalso('2026-08-04T14:14:00').ahora()
const hoy = resolverReferente({ tipo: 'hoy' }, martes)!.intervalo

test('remitente vinculado + alias resuelve con confianza alta', () => {
  const r = resolver({
    compromisos: [calculo, fisica], remitente: 'ramirez@uni.edu.co',
    texto: 'La clase de cálculo de hoy se cancela',
    intervalo: hoy, ambiguo: false, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 1)
  assert.equal(r.confianza, 'alta')
})

test('sin remitente vinculado y sin alias no hay candidatos', () => {
  const r = resolver({
    compromisos: [calculo, fisica], remitente: 'promos@tienda.com',
    texto: 'Grandes descuentos esta semana',
    intervalo: hoy, ambiguo: false, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'sin_candidatos')
})

test('dos compromisos del mismo profesor producen empate', () => {
  const r = resolver({
    compromisos: [calculo, calculoTaller], remitente: 'ramirez@uni.edu.co',
    texto: 'Se cancela lo de hoy',
    intervalo: hoy, ambiguo: false, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'empate')
  if (r.estado !== 'empate') return
  assert.equal(r.candidatos.length, 2)
})

test('el alias desempata entre compromisos del mismo profesor', () => {
  const r = resolver({
    compromisos: [calculo, calculoTaller], remitente: 'ramirez@uni.edu.co',
    texto: 'El taller de hoy se cancela',
    intervalo: hoy, ambiguo: false, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 3)
})

test('un referente ambiguo baja la confianza a media', () => {
  const r = resolver({
    compromisos: [calculo], remitente: 'ramirez@uni.edu.co',
    texto: 'La clase de cálculo del próximo miércoles se cancela',
    intervalo: hoy, ambiguo: true, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.confianza, 'media')
})

test('sin intervalo la confianza no puede ser alta', () => {
  const r = resolver({
    compromisos: [calculo], remitente: 'ramirez@uni.edu.co',
    texto: 'La clase de cálculo se cancela',
    intervalo: null, ambiguo: false, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.notEqual(r.confianza, 'alta')
})

test('el hilo conocido aporta puntaje', () => {
  const r = resolver({
    compromisos: [calculo, fisica], remitente: 'desconocido@x.com',
    texto: 'Confirmado, se cancela',
    intervalo: hoy, ambiguo: false, threadCompromisoId: 2,
  })
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 2)
})

test('el emparejamiento de alias ignora tildes y mayúsculas', () => {
  const r = resolver({
    compromisos: [calculo, fisica], remitente: 'otro@uni.edu.co',
    texto: 'La FÍSICA de hoy se cancela',
    intervalo: hoy, ambiguo: false, threadCompromisoId: null,
  })
  assert.equal(r.estado, 'resuelto')
  if (r.estado !== 'resuelto') return
  assert.equal(r.candidato.compromiso.id, 2)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/resolutor.test.ts`
Expected: FAIL — `Cannot find module '../src/dominio/resolutor.ts'`

- [ ] **Step 3: Implementar `src/dominio/resolutor.ts`**

```ts
import type { Compromiso, Confianza } from './tipos.ts'
import type { Intervalo } from './fechas.ts'

const PESOS = {
  remitenteVinculado: 50,
  hiloConocido: 40,
  aliasEnTexto: 20,
  tituloEnTexto: 20,
  ventanaTemporal: 15,
} as const

const UMBRAL_ALTO = 70
const UMBRAL_MINIMO = 20
const MARGEN_EMPATE = 10

export interface Candidato {
  compromiso: Compromiso
  puntaje: number
  senales: string[]
}

export type Resolucion =
  | { estado: 'resuelto'; candidato: Candidato; confianza: Confianza }
  | { estado: 'empate'; candidatos: Candidato[] }
  | { estado: 'sin_candidatos' }

export interface EntradaResolutor {
  compromisos: Compromiso[]
  remitente: string
  texto: string
  intervalo: Intervalo | null
  ambiguo: boolean
  threadCompromisoId: number | null
}

/** Minúsculas sin tildes, para que "FÍSICA" empareje con "fisica". */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function puntuar(c: Compromiso, e: EntradaResolutor): Candidato {
  const senales: string[] = []
  let puntaje = 0
  const texto = normalizar(e.texto)
  const remitente = normalizar(e.remitente)

  if (c.remitentesVinculados.some((r) => normalizar(r) === remitente)) {
    puntaje += PESOS.remitenteVinculado
    senales.push('remitente_vinculado')
  }
  if (e.threadCompromisoId === c.id) {
    puntaje += PESOS.hiloConocido
    senales.push('hilo_conocido')
  }
  if (c.alias.some((a) => a.length > 0 && texto.includes(normalizar(a)))) {
    puntaje += PESOS.aliasEnTexto
    senales.push('alias_en_texto')
  }
  if (texto.includes(normalizar(c.titulo))) {
    puntaje += PESOS.tituloEnTexto
    senales.push('titulo_en_texto')
  }
  if (e.intervalo !== null) {
    puntaje += PESOS.ventanaTemporal
    senales.push('ventana_temporal')
  }

  return { compromiso: c, puntaje, senales }
}

function calcularConfianza(c: Candidato, e: EntradaResolutor): Confianza {
  if (e.ambiguo) return 'media'
  if (e.intervalo === null) return 'media'
  if (c.puntaje >= UMBRAL_ALTO) return 'alta'
  return 'media'
}

export function resolver(e: EntradaResolutor): Resolucion {
  const candidatos = e.compromisos
    .filter((c) => c.activo)
    .map((c) => puntuar(c, e))
    .filter((c) => c.puntaje >= UMBRAL_MINIMO)
    .sort((a, b) => b.puntaje - a.puntaje)

  const mejor = candidatos[0]
  if (!mejor) return { estado: 'sin_candidatos' }

  const empatados = candidatos.filter((c) => mejor.puntaje - c.puntaje < MARGEN_EMPATE)
  if (empatados.length > 1) return { estado: 'empate', candidatos: empatados }

  return { estado: 'resuelto', candidato: mejor, confianza: calcularConfianza(mejor, e) }
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/resolutor.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/dominio/resolutor.ts tests/resolutor.test.ts
git commit -m "feat: resolutor de entidades por cascada de puntaje"
```

---

### Task 5: Política de autonomía

**Files:**
- Create: `src/dominio/politica.ts`
- Test: `tests/politica.test.ts`

**Interfaces:**
- Consumes: `Confianza`, `Origen` de Task 3
- Produces:
  - `type TipoAccion = 'cancelar_instancia' | 'mover_evento' | 'borrar_serie'`
  - `type Decision = 'actuar_callado' | 'actuar_y_avisar' | 'confirmar' | 'preguntar' | 'ignorar'`
  - `decidir(e: EntradaPolitica): Decision`
  - `type EntradaPolitica = { origen: Origen; tipo: TipoAccion; confianza: Confianza; silenciadoPorRegla: boolean }`
  - `ES_DESTRUCTIVA: Record<TipoAccion, boolean>`

- [ ] **Step 1: Escribir el test que falla**

`tests/politica.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidir } from '../src/dominio/politica.ts'

test('correo + confianza alta + cancelar una instancia → actúa callada', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_callado')
})

test('correo + confianza alta + borrar la serie → actúa pero avisa', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'borrar_serie',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_y_avisar')
})

test('correo + confianza media → actúa pero avisa', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'media', silenciadoPorRegla: false,
  }), 'actuar_y_avisar')
})

test('correo + confianza baja → pregunta', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'baja', silenciadoPorRegla: false,
  }), 'preguntar')
})

test('voz + acción destructiva → confirma, aunque la confianza sea alta', () => {
  // La transcripción puede corromper el input: "mañana" → "semana".
  assert.equal(decidir({
    origen: 'voz', tipo: 'borrar_serie',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'confirmar')
})

test('voz + acción no destructiva → actúa', () => {
  assert.equal(decidir({
    origen: 'voz', tipo: 'mover_evento',
    confianza: 'alta', silenciadoPorRegla: false,
  }), 'actuar_y_avisar')
})

test('texto escrito por él → actúa sin fricción', () => {
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

test('una regla de silencio NO puede convertir un "preguntar" en actuar', () => {
  assert.equal(decidir({
    origen: 'correo', tipo: 'cancelar_instancia',
    confianza: 'baja', silenciadoPorRegla: true,
  }), 'preguntar')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/politica.test.ts`
Expected: FAIL — `Cannot find module '../src/dominio/politica.ts'`

- [ ] **Step 3: Implementar `src/dominio/politica.ts`**

```ts
import type { Confianza, Origen } from './tipos.ts'

export type TipoAccion = 'cancelar_instancia' | 'mover_evento' | 'borrar_serie'

export type Decision =
  | 'actuar_callado'
  | 'actuar_y_avisar'
  | 'confirmar'
  | 'preguntar'
  | 'ignorar'

/** Borrar una serie completa no se recupera con un clic del usuario. */
export const ES_DESTRUCTIVA: Record<TipoAccion, boolean> = {
  cancelar_instancia: false,
  mover_evento: false,
  borrar_serie: true,
}

export interface EntradaPolitica {
  origen: Origen
  tipo: TipoAccion
  confianza: Confianza
  silenciadoPorRegla: boolean
}

export function decidir(e: EntradaPolitica): Decision {
  // Él lo escribió: es confiable y no hay riesgo de transcripción.
  if (e.origen === 'texto') return 'actuar_callado'

  // La voz pasa por un transcriptor que puede alterar palabras. Lo
  // destructivo se confirma siempre, sin importar la confianza.
  if (e.origen === 'voz') {
    return ES_DESTRUCTIVA[e.tipo] ? 'confirmar' : 'actuar_y_avisar'
  }

  if (e.confianza === 'baja') return 'preguntar'

  const debeAvisar = e.confianza === 'media' || ES_DESTRUCTIVA[e.tipo]
  if (!debeAvisar) return 'actuar_callado'

  // Una regla de silencio sólo suprime el aviso de algo que ya se iba a
  // hacer. Nunca escala un "preguntar" a una acción.
  return e.silenciadoPorRegla ? 'actuar_callado' : 'actuar_y_avisar'
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/politica.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/dominio/politica.ts tests/politica.test.ts
git commit -m "feat: política de autonomía como tabla de decisión pura"
```

---

### Task 6: Puerto de calendario, adaptador de sombra y cálculo de inversas

**Files:**
- Create: `src/puertos/sumidero-calendario.ts`, `src/adaptadores/calendario-sombra.ts`, `src/dominio/inversas.ts`
- Create: `tests/fakes/calendario-falso.ts`
- Test: `tests/inversas.test.ts`

**Interfaces:**
- Consumes: `TipoAccion` de Task 5
- Produces:
  - `type EventoInstancia = { eventoId: string; instanciaId: string; inicio: string; fin: string; titulo: string; estado: 'confirmado' | 'cancelado' }`
  - `type AccionCalendario = { tipo: 'cancelar_instancia'; calendarId: string; instanciaId: string } | { tipo: 'mover_evento'; calendarId: string; instanciaId: string; nuevoInicio: string; nuevoFin: string } | { tipo: 'borrar_serie'; calendarId: string; eventoId: string }`
  - `interface SumideroCalendario { instanciasEnRango(calendarId, eventoId, desdeIso, hastaIso): Promise<EventoInstancia[]>; aplicar(a: AccionCalendario): Promise<void>; restaurar(inversa: Inversa): Promise<void> }`
  - `type Inversa = { tipo: 'recrear_instancia'; calendarId: string; instancia: EventoInstancia } | { tipo: 'restaurar_horario'; calendarId: string; instanciaId: string; inicio: string; fin: string } | { tipo: 'recrear_serie'; calendarId: string; eventoId: string; rrule: string | null; titulo: string }`
  - `calcularInversa(accion: AccionCalendario, estadoPrevio: EstadoPrevio): Inversa`
  - `class CalendarioSombra implements SumideroCalendario`

- [ ] **Step 1: Escribir el test que falla**

`tests/inversas.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularInversa } from '../src/dominio/inversas.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'

const instancia = {
  eventoId: 'evt_1', instanciaId: 'evt_1_20260806T210000Z',
  inicio: '2026-08-06T16:00:00-05:00', fin: '2026-08-06T17:00:00-05:00',
  titulo: 'Cálculo', estado: 'confirmado' as const,
}

test('la inversa de cancelar una instancia la recrea completa', () => {
  const inv = calcularInversa(
    { tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: instancia.instanciaId },
    { instancia, rrule: 'FREQ=WEEKLY;BYDAY=WE' })
  assert.equal(inv.tipo, 'recrear_instancia')
  if (inv.tipo !== 'recrear_instancia') return
  assert.equal(inv.instancia.inicio, instancia.inicio)
  assert.equal(inv.instancia.titulo, 'Cálculo')
})

test('la inversa de mover guarda el horario ANTERIOR', () => {
  const inv = calcularInversa(
    { tipo: 'mover_evento', calendarId: 'primary', instanciaId: instancia.instanciaId,
      nuevoInicio: '2026-08-06T18:00:00-05:00', nuevoFin: '2026-08-06T19:00:00-05:00' },
    { instancia, rrule: null })
  assert.equal(inv.tipo, 'restaurar_horario')
  if (inv.tipo !== 'restaurar_horario') return
  assert.equal(inv.inicio, '2026-08-06T16:00:00-05:00')
  assert.equal(inv.fin, '2026-08-06T17:00:00-05:00')
})

test('la inversa de borrar la serie conserva la RRULE', () => {
  const inv = calcularInversa(
    { tipo: 'borrar_serie', calendarId: 'primary', eventoId: 'evt_1' },
    { instancia, rrule: 'FREQ=WEEKLY;BYDAY=WE' })
  assert.equal(inv.tipo, 'recrear_serie')
  if (inv.tipo !== 'recrear_serie') return
  assert.equal(inv.rrule, 'FREQ=WEEKLY;BYDAY=WE')
})

test('aplicar y luego restaurar deja el calendario como estaba', async () => {
  const cal = new CalendarioFalso([instancia])
  const antes = await cal.instanciasEnRango('primary', 'evt_1',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')

  const accion = {
    tipo: 'cancelar_instancia' as const,
    calendarId: 'primary', instanciaId: instancia.instanciaId,
  }
  const inv = calcularInversa(accion, { instancia, rrule: null })
  await cal.aplicar(accion)

  const durante = await cal.instanciasEnRango('primary', 'evt_1',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.equal(durante[0]!.estado, 'cancelado')

  await cal.restaurar(inv)
  const despues = await cal.instanciasEnRango('primary', 'evt_1',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.deepEqual(despues, antes)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/inversas.test.ts`
Expected: FAIL — `Cannot find module '../src/dominio/inversas.ts'`

- [ ] **Step 3: Implementar `src/puertos/sumidero-calendario.ts`**

```ts
export interface EventoInstancia {
  eventoId: string
  instanciaId: string
  inicio: string
  fin: string
  titulo: string
  estado: 'confirmado' | 'cancelado'
}

export type AccionCalendario =
  | { tipo: 'cancelar_instancia'; calendarId: string; instanciaId: string }
  | { tipo: 'mover_evento'; calendarId: string; instanciaId: string
      nuevoInicio: string; nuevoFin: string }
  | { tipo: 'borrar_serie'; calendarId: string; eventoId: string }

export type Inversa =
  | { tipo: 'recrear_instancia'; calendarId: string; instancia: EventoInstancia }
  | { tipo: 'restaurar_horario'; calendarId: string; instanciaId: string
      inicio: string; fin: string }
  | { tipo: 'recrear_serie'; calendarId: string; eventoId: string
      rrule: string | null; titulo: string }

export interface SumideroCalendario {
  instanciasEnRango(
    calendarId: string, eventoId: string, desdeIso: string, hastaIso: string
  ): Promise<EventoInstancia[]>
  aplicar(accion: AccionCalendario): Promise<void>
  restaurar(inversa: Inversa): Promise<void>
}
```

- [ ] **Step 4: Implementar `src/dominio/inversas.ts`**

```ts
import type { AccionCalendario, EventoInstancia, Inversa } from '../puertos/sumidero-calendario.ts'

export interface EstadoPrevio {
  instancia: EventoInstancia
  rrule: string | null
}

/**
 * Se llama SIEMPRE antes de aplicar la acción: necesita el estado que está a
 * punto de destruirse. Aplicarla después devolvería la inversa equivocada.
 */
export function calcularInversa(accion: AccionCalendario, previo: EstadoPrevio): Inversa {
  switch (accion.tipo) {
    case 'cancelar_instancia':
      return {
        tipo: 'recrear_instancia',
        calendarId: accion.calendarId,
        instancia: { ...previo.instancia },
      }
    case 'mover_evento':
      return {
        tipo: 'restaurar_horario',
        calendarId: accion.calendarId,
        instanciaId: accion.instanciaId,
        inicio: previo.instancia.inicio,
        fin: previo.instancia.fin,
      }
    case 'borrar_serie':
      return {
        tipo: 'recrear_serie',
        calendarId: accion.calendarId,
        eventoId: accion.eventoId,
        rrule: previo.rrule,
        titulo: previo.instancia.titulo,
      }
  }
}
```

- [ ] **Step 5: Implementar `tests/fakes/calendario-falso.ts`**

```ts
import type {
  AccionCalendario, EventoInstancia, Inversa, SumideroCalendario,
} from '../../src/puertos/sumidero-calendario.ts'

export class CalendarioFalso implements SumideroCalendario {
  public seriesBorradas: string[] = []
  constructor(private instancias: EventoInstancia[] = []) {}

  async instanciasEnRango(
    _calendarId: string, eventoId: string, desdeIso: string, hastaIso: string
  ): Promise<EventoInstancia[]> {
    const desde = Date.parse(desdeIso)
    const hasta = Date.parse(hastaIso)
    return this.instancias
      .filter((i) => i.eventoId === eventoId)
      .filter((i) => Date.parse(i.inicio) >= desde && Date.parse(i.inicio) <= hasta)
      .map((i) => ({ ...i }))
  }

  async aplicar(a: AccionCalendario): Promise<void> {
    if (a.tipo === 'cancelar_instancia') {
      const i = this.instancias.find((x) => x.instanciaId === a.instanciaId)
      if (i) i.estado = 'cancelado'
    } else if (a.tipo === 'mover_evento') {
      const i = this.instancias.find((x) => x.instanciaId === a.instanciaId)
      if (i) { i.inicio = a.nuevoInicio; i.fin = a.nuevoFin }
    } else {
      this.seriesBorradas.push(a.eventoId)
      this.instancias = this.instancias.filter((x) => x.eventoId !== a.eventoId)
    }
  }

  async restaurar(inv: Inversa): Promise<void> {
    if (inv.tipo === 'recrear_instancia') {
      const i = this.instancias.find((x) => x.instanciaId === inv.instancia.instanciaId)
      if (i) Object.assign(i, inv.instancia)
      else this.instancias.push({ ...inv.instancia })
    } else if (inv.tipo === 'restaurar_horario') {
      const i = this.instancias.find((x) => x.instanciaId === inv.instanciaId)
      if (i) { i.inicio = inv.inicio; i.fin = inv.fin }
    } else {
      this.seriesBorradas = this.seriesBorradas.filter((e) => e !== inv.eventoId)
    }
  }
}
```

- [ ] **Step 6: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/inversas.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Implementar `src/adaptadores/calendario-sombra.ts`**

```ts
import type {
  AccionCalendario, EventoInstancia, Inversa, SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'

/**
 * Modo sombra: lee del calendario real pero NUNCA escribe. Envuelve al
 * sumidero real para que la lectura, y por tanto la resolución de entidades,
 * sea idéntica a la de producción. Lo único que cambia es la escritura.
 */
export class CalendarioSombra implements SumideroCalendario {
  public aplicadas: AccionCalendario[] = []
  constructor(private readonly lector: SumideroCalendario) {}

  instanciasEnRango(
    calendarId: string, eventoId: string, desdeIso: string, hastaIso: string
  ): Promise<EventoInstancia[]> {
    return this.lector.instanciasEnRango(calendarId, eventoId, desdeIso, hastaIso)
  }

  async aplicar(accion: AccionCalendario): Promise<void> {
    this.aplicadas.push(accion)
  }

  async restaurar(_inversa: Inversa): Promise<void> {
    // En sombra no se escribió nada, así que no hay nada que restaurar.
  }
}
```

- [ ] **Step 8: Agregar el test del modo sombra**

Agregar al final de `tests/inversas.test.ts`:

```ts
import { CalendarioSombra } from '../src/adaptadores/calendario-sombra.ts'

test('el modo sombra lee igual que el real pero no escribe', async () => {
  const real = new CalendarioFalso([{ ...instancia }])
  const sombra = new CalendarioSombra(real)

  const leidas = await sombra.instanciasEnRango('primary', 'evt_1',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.equal(leidas.length, 1)

  await sombra.aplicar({
    tipo: 'cancelar_instancia', calendarId: 'primary',
    instanciaId: instancia.instanciaId,
  })

  assert.equal(sombra.aplicadas.length, 1)
  const despues = await real.instanciasEnRango('primary', 'evt_1',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.equal(despues[0]!.estado, 'confirmado')
})
```

- [ ] **Step 9: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/inversas.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 10: Commit**

```bash
git add src/puertos/sumidero-calendario.ts src/dominio/inversas.ts src/adaptadores/calendario-sombra.ts tests/fakes/calendario-falso.ts tests/inversas.test.ts
git commit -m "feat: puerto de calendario, cálculo de inversas y modo sombra"
```

---

### Task 7: Puerto ProveedorLLM, clasificador y prefiltro

**Files:**
- Create: `src/puertos/proveedor-llm.ts`, `src/adaptadores/groq.ts`, `src/pipeline/prefiltro.ts`, `src/pipeline/clasificador.ts`
- Create: `tests/fakes/llm-falso.ts`
- Test: `tests/prefiltro.test.ts`, `tests/clasificador.test.ts`

**Interfaces:**
- Consumes: `CorreoCrudo`, `Clasificacion` de Task 3; `config.groq` de Task 1
- Produces:
  - `interface ProveedorLLM { completarJson<T>(p: PeticionJson<T>): Promise<T> }`
  - `type PeticionJson<T> = { modelo: string; sistema: string; usuario: string; esquema: z.ZodType<T>; reintentos?: number }`
  - `class ProveedorGroq implements ProveedorLLM`
  - `esRuidoObvio(correo: CorreoCrudo, remitentesIgnorados: string[]): boolean`
  - `crearClasificador(llm, modelo)` → `{ clasificar(correo): Promise<{ clasificacion: Clasificacion; confianza: Confianza }> }`

- [ ] **Step 1: Escribir el test del prefiltro que falla**

`tests/prefiltro.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esRuidoObvio } from '../src/pipeline/prefiltro.ts'
import type { CorreoCrudo } from '../src/dominio/tipos.ts'

const correo = (over: Partial<CorreoCrudo> = {}): CorreoCrudo => ({
  messageId: 'm', threadId: null, remitente: 'a@b.com', asunto: 'x',
  cuerpo: 'y', recibidoEn: '2026-08-04T10:00:00-05:00', etiquetas: ['INBOX'],
  ...over,
})

test('descarta promociones sin gastar un token', () => {
  assert.equal(esRuidoObvio(correo({ etiquetas: ['CATEGORY_PROMOTIONS'] }), []), true)
})

test('descarta redes sociales', () => {
  assert.equal(esRuidoObvio(correo({ etiquetas: ['CATEGORY_SOCIAL'] }), []), true)
})

test('descarta remitentes que él pidió ignorar', () => {
  assert.equal(esRuidoObvio(correo({ remitente: 'Notificaciones <no-reply@banco.com>' }),
    ['no-reply@banco.com']), true)
})

test('el emparejamiento de remitente ignora mayúsculas y nombre para mostrar', () => {
  assert.equal(esRuidoObvio(correo({ remitente: 'Banco <NO-REPLY@Banco.com>' }),
    ['no-reply@banco.com']), true)
})

test('deja pasar un correo normal de la bandeja', () => {
  assert.equal(esRuidoObvio(correo({ remitente: 'ramirez@uni.edu.co' }), []), false)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/prefiltro.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/prefiltro.ts'`

- [ ] **Step 3: Implementar `src/pipeline/prefiltro.ts`**

```ts
import type { CorreoCrudo } from '../dominio/tipos.ts'

const ETIQUETAS_RUIDO = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'SPAM', 'TRASH']

/** Extrae "a@b.com" de "Nombre Visible <a@b.com>" y lo normaliza. */
export function correoDelRemitente(remitente: string): string {
  const m = remitente.match(/<([^>]+)>/)
  return (m?.[1] ?? remitente).trim().toLowerCase()
}

/**
 * Filtro sin costo: elimina el grueso del volumen antes de gastar un token.
 * Sólo descarta lo que es ruido con certeza; ante la duda, deja pasar.
 */
export function esRuidoObvio(correo: CorreoCrudo, remitentesIgnorados: string[]): boolean {
  if (correo.etiquetas.some((e) => ETIQUETAS_RUIDO.includes(e))) return true
  const de = correoDelRemitente(correo.remitente)
  return remitentesIgnorados.some((r) => r.trim().toLowerCase() === de)
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npm test -- tests/prefiltro.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Implementar `src/puertos/proveedor-llm.ts`**

```ts
import type { z } from 'zod'

export interface PeticionJson<T> {
  modelo: string
  sistema: string
  usuario: string
  esquema: z.ZodType<T>
  reintentos?: number
}

export interface ProveedorLLM {
  completarJson<T>(peticion: PeticionJson<T>): Promise<T>
}

export class ErrorLLM extends Error {
  constructor(mensaje: string, readonly ultimaRespuesta?: string) {
    super(mensaje)
    this.name = 'ErrorLLM'
  }
}
```

- [ ] **Step 6: Implementar `tests/fakes/llm-falso.ts`**

```ts
import type { PeticionJson, ProveedorLLM } from '../../src/puertos/proveedor-llm.ts'

export class LlmFalso implements ProveedorLLM {
  public peticiones: PeticionJson<unknown>[] = []
  constructor(private respuestas: unknown[]) {}

  async completarJson<T>(p: PeticionJson<T>): Promise<T> {
    this.peticiones.push(p as PeticionJson<unknown>)
    const cruda = this.respuestas.shift()
    if (cruda === undefined) throw new Error('LlmFalso sin respuestas restantes')
    return p.esquema.parse(cruda)
  }
}
```

- [ ] **Step 7: Escribir el test del clasificador que falla**

`tests/clasificador.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearClasificador } from '../src/pipeline/clasificador.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import type { CorreoCrudo } from '../src/dominio/tipos.ts'

const correo: CorreoCrudo = {
  messageId: 'm1', threadId: null, remitente: 'ramirez@uni.edu.co',
  asunto: 'Clase de hoy', cuerpo: 'No hay clase hoy, nos vemos la próxima',
  recibidoEn: '2026-08-04T14:14:00-05:00', etiquetas: ['INBOX'],
}

test('devuelve la clasificación validada del modelo', async () => {
  const llm = new LlmFalso([{ clasificacion: 'agenda', confianza: 'alta' }])
  const c = crearClasificador(llm, 'modelo-x')
  const r = await c.clasificar(correo)
  assert.equal(r.clasificacion, 'agenda')
  assert.equal(r.confianza, 'alta')
})

test('el cuerpo se recorta antes de mandarlo al modelo', async () => {
  const llm = new LlmFalso([{ clasificacion: 'ruido', confianza: 'alta' }])
  const c = crearClasificador(llm, 'modelo-x')
  await c.clasificar({ ...correo, cuerpo: 'x'.repeat(10_000) })
  assert.ok(llm.peticiones[0]!.usuario.length < 4_000)
})

test('una clasificación fuera del enum revienta la validación', async () => {
  const llm = new LlmFalso([{ clasificacion: 'inventada', confianza: 'alta' }])
  const c = crearClasificador(llm, 'modelo-x')
  await assert.rejects(() => c.clasificar(correo))
})
```

- [ ] **Step 8: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/clasificador.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/clasificador.ts'`

- [ ] **Step 9: Implementar `src/pipeline/clasificador.ts`**

```ts
import { z } from 'zod'
import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { Clasificacion, Confianza, CorreoCrudo } from '../dominio/tipos.ts'

const MAX_CUERPO = 3_000

export const EsquemaClasificacion = z.object({
  clasificacion: z.enum(['agenda', 'finanzas', 'ruido']),
  confianza: z.enum(['alta', 'media', 'baja']),
})

const SISTEMA = `Clasificas correos de una sola persona en exactamente una categoría.

agenda   — menciona una clase, reunión, cita o compromiso que se cancela,
           se mueve, se agrega o cambia de horario.
finanzas — informa de un movimiento de dinero, un pago, una transferencia,
           un cobro o una factura.
ruido    — cualquier otra cosa.

Ante la duda entre agenda o finanzas y ruido, responde con la categoría
específica y confianza baja: es preferible revisar de más que perder algo.

Responde únicamente con JSON: {"clasificacion": "...", "confianza": "..."}`

export function crearClasificador(llm: ProveedorLLM, modelo: string) {
  return {
    async clasificar(
      correo: CorreoCrudo
    ): Promise<{ clasificacion: Clasificacion; confianza: Confianza }> {
      return llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: [
          `De: ${correo.remitente}`,
          `Asunto: ${correo.asunto ?? '(sin asunto)'}`,
          '',
          correo.cuerpo.slice(0, MAX_CUERPO),
        ].join('\n'),
        esquema: EsquemaClasificacion,
      })
    },
  }
}

export type Clasificador = ReturnType<typeof crearClasificador>
```

- [ ] **Step 10: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/clasificador.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 11: Implementar `src/adaptadores/groq.ts`**

```ts
import OpenAI from 'openai'
import type { PeticionJson, ProveedorLLM } from '../puertos/proveedor-llm.ts'
import { ErrorLLM } from '../puertos/proveedor-llm.ts'

const REINTENTOS_POR_DEFECTO = 3

/**
 * Groq expone una API compatible con OpenAI, así que este mismo adaptador
 * sirve para cualquier proveedor compatible cambiando baseUrl.
 */
export class ProveedorGroq implements ProveedorLLM {
  private cliente: OpenAI

  constructor(apiKey: string, baseURL: string) {
    this.cliente = new OpenAI({ apiKey, baseURL })
  }

  async completarJson<T>(p: PeticionJson<T>): Promise<T> {
    const intentos = p.reintentos ?? REINTENTOS_POR_DEFECTO
    let ultima = ''

    for (let i = 0; i < intentos; i++) {
      const respuesta = await this.cliente.chat.completions.create({
        model: p.modelo,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: p.sistema },
          { role: 'user', content: p.usuario },
        ],
      })

      ultima = respuesta.choices[0]?.message?.content ?? ''
      try {
        return p.esquema.parse(JSON.parse(ultima))
      } catch {
        // Reintento con espera creciente: puede ser JSON mal formado o un
        // campo fuera del esquema. Ambos se corrigen con otra pasada.
        await new Promise((r) => setTimeout(r, 300 * 2 ** i))
      }
    }

    throw new ErrorLLM(`El modelo no produjo JSON válido en ${intentos} intentos`, ultima)
  }
}
```

- [ ] **Step 12: Ejecutar toda la suite y hacer typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS, sin errores de tipos.

- [ ] **Step 13: Commit**

```bash
git add src/puertos/proveedor-llm.ts src/adaptadores/groq.ts src/pipeline/prefiltro.ts src/pipeline/clasificador.ts tests/fakes/llm-falso.ts tests/prefiltro.test.ts tests/clasificador.test.ts
git commit -m "feat: puerto LLM con adaptador Groq, prefiltro sin costo y clasificador"
```

---

### Task 8: Extractor de hechos de agenda

**Files:**
- Create: `src/dominio/esquemas.ts`, `src/pipeline/extractor.ts`
- Test: `tests/extractor.test.ts`

**Interfaces:**
- Consumes: `ProveedorLLM` de Task 7, `Referente` de Task 2
- Produces:
  - `EsquemaHechoAgenda` (Zod)
  - `type HechoAgenda = { intencion: 'cancelar' | 'mover' | 'crear' | 'ninguna'; referente: Referente; nuevoInicio: string | null; nuevoFin: string | null; menciones: string[]; confianza: Confianza }`
  - `crearExtractor(llm, modelo)` → `{ extraer(correo, fechaRecepcionIso): Promise<HechoAgenda> }`

- [ ] **Step 1: Escribir el test que falla**

`tests/extractor.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearExtractor } from '../src/pipeline/extractor.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import type { CorreoCrudo } from '../src/dominio/tipos.ts'

const correo: CorreoCrudo = {
  messageId: 'm1', threadId: null, remitente: 'ramirez@uni.edu.co',
  asunto: 'Clase de hoy', cuerpo: 'No, no, la clase de hoy se cancela',
  recibidoEn: '2026-08-04T14:14:00-05:00', etiquetas: ['INBOX'],
}

test('extrae intención de cancelar con referente "hoy"', async () => {
  const llm = new LlmFalso([{
    intencion: 'cancelar', referente: { tipo: 'hoy' },
    nuevoInicio: null, nuevoFin: null,
    menciones: ['clase'], confianza: 'alta',
  }])
  const r = await crearExtractor(llm, 'modelo-x').extraer(correo, correo.recibidoEn)
  assert.equal(r.intencion, 'cancelar')
  assert.deepEqual(r.referente, { tipo: 'hoy' })
})

test('la fecha de recepción se le entrega al modelo como contexto', async () => {
  const llm = new LlmFalso([{
    intencion: 'ninguna', referente: { tipo: 'desconocido' },
    nuevoInicio: null, nuevoFin: null, menciones: [], confianza: 'baja',
  }])
  await crearExtractor(llm, 'modelo-x').extraer(correo, '2026-08-04T14:14:00-05:00')
  assert.ok(llm.peticiones[0]!.usuario.includes('2026-08-04'))
})

test('rechaza una respuesta donde el modelo calculó la fecha él mismo', async () => {
  // El esquema no admite un campo "fecha": si el modelo lo manda, no valida.
  const llm = new LlmFalso([{
    intencion: 'cancelar', referente: { tipo: 'fecha', iso: 'el miércoles' },
    nuevoInicio: null, nuevoFin: null, menciones: [], confianza: 'alta',
  }])
  await assert.rejects(
    () => crearExtractor(llm, 'modelo-x').extraer(correo, correo.recibidoEn))
})

test('acepta un referente de día de la semana con modificador', async () => {
  const llm = new LlmFalso([{
    intencion: 'cancelar',
    referente: { tipo: 'dia_semana', dia: 3, modificador: 'proximo' },
    nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta',
  }])
  const r = await crearExtractor(llm, 'modelo-x').extraer(correo, correo.recibidoEn)
  assert.equal(r.referente.tipo, 'dia_semana')
})

test('un cambio de horario trae inicio y fin nuevos', async () => {
  const llm = new LlmFalso([{
    intencion: 'mover', referente: { tipo: 'manana' },
    nuevoInicio: '18:00', nuevoFin: '19:00',
    menciones: ['clase'], confianza: 'alta',
  }])
  const r = await crearExtractor(llm, 'modelo-x').extraer(correo, correo.recibidoEn)
  assert.equal(r.intencion, 'mover')
  assert.equal(r.nuevoInicio, '18:00')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/extractor.test.ts`
Expected: FAIL — `Cannot find module '../src/dominio/esquemas.ts'`

- [ ] **Step 3: Implementar `src/dominio/esquemas.ts`**

```ts
import { z } from 'zod'

/**
 * El referente se captura tal como lo dijo el correo. La conversión a una
 * fecha concreta la hace resolverReferente() con Luxon: el modelo no calcula
 * fechas porque es justo lo que peor hace.
 */
export const EsquemaReferente = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('hoy') }),
  z.object({ tipo: z.literal('manana') }),
  z.object({ tipo: z.literal('fecha'), iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({
    tipo: z.literal('dia_semana'),
    dia: z.number().int().min(1).max(7),
    modificador: z.enum(['este', 'proximo']),
  }),
  z.object({ tipo: z.literal('desconocido') }),
])

export const EsquemaHechoAgenda = z.object({
  intencion: z.enum(['cancelar', 'mover', 'crear', 'ninguna']),
  referente: EsquemaReferente,
  nuevoInicio: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  nuevoFin: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  menciones: z.array(z.string()),
  confianza: z.enum(['alta', 'media', 'baja']),
})

export type HechoAgenda = z.infer<typeof EsquemaHechoAgenda>
```

- [ ] **Step 4: Implementar `src/pipeline/extractor.ts`**

```ts
import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { CorreoCrudo } from '../dominio/tipos.ts'
import { EsquemaHechoAgenda, type HechoAgenda } from '../dominio/esquemas.ts'

const MAX_CUERPO = 4_000

const SISTEMA = `Extraes hechos de agenda de un correo. Respondes sólo JSON.

NO CALCULES FECHAS. Devuelve el referente tal como lo expresa el correo:
  "hoy"                      -> {"tipo":"hoy"}
  "mañana"                   -> {"tipo":"manana"}
  "el 6 de agosto"           -> {"tipo":"fecha","iso":"2026-08-06"}
  "este miércoles"           -> {"tipo":"dia_semana","dia":3,"modificador":"este"}
  "el próximo miércoles"     -> {"tipo":"dia_semana","dia":3,"modificador":"proximo"}
  no se puede determinar     -> {"tipo":"desconocido"}

dia: 1=lunes … 7=domingo. Sólo usa "fecha" cuando el correo diga un día y mes
explícitos; en ese caso completa el año con el del contexto que recibes.

intencion:
  cancelar — se suspende o se cancela
  mover    — cambia de hora o de día
  crear    — se agrega algo nuevo
  ninguna  — el correo no cambia la agenda

nuevoInicio y nuevoFin sólo para "mover", en formato "HH:MM" de 24 horas;
null en cualquier otro caso.

menciones: las palabras del correo que nombran el compromiso
(por ejemplo "clase", "cálculo", "taller"). Lista vacía si no hay.

confianza: "alta" si el correo es explícito, "media" si hay que inferir,
"baja" si es dudoso.

Formato: {"intencion":"...","referente":{...},"nuevoInicio":null,
"nuevoFin":null,"menciones":[],"confianza":"..."}`

export function crearExtractor(llm: ProveedorLLM, modelo: string) {
  return {
    extraer(correo: CorreoCrudo, fechaRecepcionIso: string): Promise<HechoAgenda> {
      return llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: [
          `Fecha y hora de recepción: ${fechaRecepcionIso} (zona America/Bogota)`,
          `De: ${correo.remitente}`,
          `Asunto: ${correo.asunto ?? '(sin asunto)'}`,
          '',
          correo.cuerpo.slice(0, MAX_CUERPO),
        ].join('\n'),
        esquema: EsquemaHechoAgenda,
      })
    },
  }
}

export type Extractor = ReturnType<typeof crearExtractor>
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/extractor.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/dominio/esquemas.ts src/pipeline/extractor.ts tests/extractor.test.ts
git commit -m "feat: extractor de hechos de agenda con referentes temporales sin aritmética"
```

---

### Task 9: Desempate con candidatos cerrados

**Files:**
- Create: `src/pipeline/desempate.ts`
- Test: `tests/desempate.test.ts`

**Interfaces:**
- Consumes: `Candidato` de Task 4, `ProveedorLLM` de Task 7
- Produces: `crearDesempate(llm, modelo)` → `{ elegir(candidatos: Candidato[], texto: string): Promise<Candidato | null> }`

- [ ] **Step 1: Escribir el test que falla**

`tests/desempate.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearDesempate } from '../src/pipeline/desempate.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import type { Candidato } from '../src/dominio/resolutor.ts'
import type { Compromiso } from '../src/dominio/tipos.ts'

const base = {
  rrule: null, horaInicio: '16:00', horaFin: '17:00', tz: 'America/Bogota',
  googleCalendarId: 'primary', googleEventId: 'e', activo: true,
  remitentesVinculados: [], alias: [],
}
const cand = (id: number, titulo: string): Candidato => ({
  compromiso: { ...base, id, titulo } as Compromiso,
  puntaje: 50, senales: ['remitente_vinculado'],
})

test('elige el candidato que devuelve el modelo', async () => {
  const llm = new LlmFalso([{ compromisoId: 3, justificacion: 'menciona taller' }])
  const r = await crearDesempate(llm, 'm').elegir(
    [cand(1, 'Cálculo'), cand(3, 'Taller de Cálculo')], 'El taller de hoy se cancela')
  assert.equal(r?.compromiso.id, 3)
})

test('si el modelo inventa un id fuera de la lista, devuelve null', async () => {
  // Ésta es la garantía estructural: una alucinación se vuelve pregunta,
  // nunca un borrado.
  const llm = new LlmFalso([{ compromisoId: 99, justificacion: 'inventado' }])
  const r = await crearDesempate(llm, 'm').elegir(
    [cand(1, 'Cálculo'), cand(3, 'Taller')], 'algo')
  assert.equal(r, null)
})

test('si el modelo dice que no puede decidir, devuelve null', async () => {
  const llm = new LlmFalso([{ compromisoId: null, justificacion: 'ambiguo' }])
  const r = await crearDesempate(llm, 'm').elegir(
    [cand(1, 'Cálculo'), cand(3, 'Taller')], 'algo')
  assert.equal(r, null)
})

test('sólo se le muestran al modelo los candidatos reales', async () => {
  const llm = new LlmFalso([{ compromisoId: 1, justificacion: 'ok' }])
  await crearDesempate(llm, 'm').elegir([cand(1, 'Cálculo'), cand(3, 'Taller')], 'algo')
  const enviado = llm.peticiones[0]!.usuario
  assert.ok(enviado.includes('1'))
  assert.ok(enviado.includes('Cálculo'))
  assert.ok(!enviado.includes('99'))
})

test('con un solo candidato ni siquiera consulta al modelo', async () => {
  const llm = new LlmFalso([])
  const r = await crearDesempate(llm, 'm').elegir([cand(1, 'Cálculo')], 'algo')
  assert.equal(r?.compromiso.id, 1)
  assert.equal(llm.peticiones.length, 0)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/desempate.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/desempate.ts'`

- [ ] **Step 3: Implementar `src/pipeline/desempate.ts`**

```ts
import { z } from 'zod'
import type { ProveedorLLM } from '../puertos/proveedor-llm.ts'
import type { Candidato } from '../dominio/resolutor.ts'

const EsquemaEleccion = z.object({
  compromisoId: z.number().int().nullable(),
  justificacion: z.string(),
})

const SISTEMA = `Te doy un correo y una lista cerrada de compromisos candidatos.
Eliges cuál de ellos menciona el correo.

Responde con el id EXACTO de uno de los candidatos que te di.
Si ninguno encaja con claridad, responde compromisoId: null.
Nunca inventes un id que no esté en la lista.

Formato: {"compromisoId": 3, "justificacion": "..."}`

export function crearDesempate(llm: ProveedorLLM, modelo: string) {
  return {
    async elegir(candidatos: Candidato[], texto: string): Promise<Candidato | null> {
      if (candidatos.length === 0) return null
      if (candidatos.length === 1) return candidatos[0]!

      const lista = candidatos
        .map((c) => `- id ${c.compromiso.id}: ${c.compromiso.titulo}` +
          (c.compromiso.alias.length ? ` (alias: ${c.compromiso.alias.join(', ')})` : ''))
        .join('\n')

      const eleccion = await llm.completarJson({
        modelo,
        sistema: SISTEMA,
        usuario: `Candidatos:\n${lista}\n\nCorreo:\n${texto}`,
        esquema: EsquemaEleccion,
      })

      // Garantía estructural: sólo se acepta un id que esté en la lista que
      // se le mostró. Cualquier otra cosa se descarta y el flujo pregunta.
      return candidatos.find((c) => c.compromiso.id === eleccion.compromisoId) ?? null
    },
  }
}

export type Desempate = ReturnType<typeof crearDesempate>
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/desempate.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/desempate.ts tests/desempate.test.ts
git commit -m "feat: desempate por LLM con lista cerrada de candidatos"
```

---

### Task 10: Repositorio de acciones y servicio de deshacer

**Files:**
- Create: `src/repos/acciones.ts`, `src/servicios/deshacer.ts`
- Test: `tests/deshacer.test.ts`

**Interfaces:**
- Consumes: `Inversa`, `SumideroCalendario` de Task 6; pool de Task 1
- Produces:
  - `crearRepoAcciones(pool)` → `{ registrar(a: NuevaAccion): Promise<number>, porId(id): Promise<AccionGuardada | null>, ultimaDeshacible(): Promise<AccionGuardada | null>, marcarDeshecha(id): Promise<void>, delDia(desdeIso, hastaIso): Promise<AccionGuardada[]> }`
  - `type NuevaAccion = { tipo: string; origen: Origen; correoId: number | null; compromisoId: number | null; confianza: Confianza; payloadAplicado: unknown; payloadInverso: Inversa; estado: 'aplicada' | 'sombra' }`
  - `crearServicioDeshacer(repo, calendario)` → `{ deshacer(id: number): Promise<{ ok: boolean; motivo?: string }> }`

- [ ] **Step 1: Escribir el test que falla**

`tests/deshacer.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { migrar } from '../src/db/migrate.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearServicioDeshacer } from '../src/servicios/deshacer.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'

const url = process.env.DATABASE_URL ??
  'postgres://asistente:cambiame@localhost:5433/asistente'
let pool: pg.Pool

const instancia = {
  eventoId: 'evt_1', instanciaId: 'inst_1',
  inicio: '2026-08-06T16:00:00-05:00', fin: '2026-08-06T17:00:00-05:00',
  titulo: 'Cálculo', estado: 'confirmado' as const,
}

before(async () => { pool = new pg.Pool({ connectionString: url }); await migrar(pool) })
after(async () => { await pool.end() })
beforeEach(async () => {
  await pool.query('TRUNCATE acciones, cola, correos_procesados, compromisos RESTART IDENTITY CASCADE')
})

test('registrar guarda la acción con su inversa', async () => {
  const repo = crearRepoAcciones(pool)
  const id = await repo.registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta',
    payloadAplicado: { instanciaId: 'inst_1' },
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: 'aplicada',
  })
  const guardada = await repo.porId(id)
  assert.equal(guardada?.estado, 'aplicada')
  assert.equal(guardada?.payloadInverso.tipo, 'recrear_instancia')
})

test('deshacer aplica la inversa y deja el calendario como estaba', async () => {
  const repo = crearRepoAcciones(pool)
  const cal = new CalendarioFalso([{ ...instancia }])
  await cal.aplicar({ tipo: 'cancelar_instancia', calendarId: 'primary', instanciaId: 'inst_1' })

  const id = await repo.registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta',
    payloadAplicado: { instanciaId: 'inst_1' },
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: 'aplicada',
  })

  const r = await crearServicioDeshacer(repo, cal).deshacer(id)
  assert.equal(r.ok, true)

  const [restaurada] = await cal.instanciasEnRango('primary', 'evt_1',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.equal(restaurada!.estado, 'confirmado')
})

test('deshacer marca la acción sin borrar el registro', async () => {
  const repo = crearRepoAcciones(pool)
  const cal = new CalendarioFalso([{ ...instancia }])
  const id = await repo.registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta',
    payloadAplicado: {},
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: 'aplicada',
  })
  await crearServicioDeshacer(repo, cal).deshacer(id)

  const guardada = await repo.porId(id)
  assert.equal(guardada?.estado, 'deshecha')
  assert.ok(guardada?.deshechaEn)

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM acciones')
  assert.equal(rows[0]!.n, 1) // append-only: nada se borró
})

test('no se puede deshacer dos veces', async () => {
  const repo = crearRepoAcciones(pool)
  const cal = new CalendarioFalso([{ ...instancia }])
  const servicio = crearServicioDeshacer(repo, cal)
  const id = await repo.registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta', payloadAplicado: {},
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: 'aplicada',
  })
  await servicio.deshacer(id)
  const segundo = await servicio.deshacer(id)
  assert.equal(segundo.ok, false)
  assert.match(segundo.motivo!, /deshecha/)
})

test('una acción en sombra no se puede deshacer', async () => {
  const repo = crearRepoAcciones(pool)
  const cal = new CalendarioFalso([{ ...instancia }])
  const id = await repo.registrar({
    tipo: 'cancelar_instancia', origen: 'correo', correoId: null,
    compromisoId: null, confianza: 'alta', payloadAplicado: {},
    payloadInverso: { tipo: 'recrear_instancia', calendarId: 'primary', instancia },
    estado: 'sombra',
  })
  const r = await crearServicioDeshacer(repo, cal).deshacer(id)
  assert.equal(r.ok, false)
})

test('ultimaDeshacible ignora las acciones en sombra y las ya deshechas', async () => {
  const repo = crearRepoAcciones(pool)
  const comun = {
    tipo: 'cancelar_instancia', origen: 'correo' as const, correoId: null,
    compromisoId: null, confianza: 'alta' as const, payloadAplicado: {},
    payloadInverso: { tipo: 'recrear_instancia' as const, calendarId: 'primary', instancia },
  }
  await repo.registrar({ ...comun, estado: 'sombra' })
  const aplicada = await repo.registrar({ ...comun, estado: 'aplicada' })
  await repo.registrar({ ...comun, estado: 'sombra' })

  const ultima = await repo.ultimaDeshacible()
  assert.equal(ultima?.id, aplicada)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/deshacer.test.ts`
Expected: FAIL — `Cannot find module '../src/repos/acciones.ts'`

- [ ] **Step 3: Implementar `src/repos/acciones.ts`**

```ts
import type pg from 'pg'
import type { Confianza, Origen } from '../dominio/tipos.ts'
import type { Inversa } from '../puertos/sumidero-calendario.ts'

export interface NuevaAccion {
  tipo: string
  origen: Origen
  correoId: number | null
  compromisoId: number | null
  confianza: Confianza
  payloadAplicado: unknown
  payloadInverso: Inversa
  estado: 'aplicada' | 'sombra'
}

export interface AccionGuardada {
  id: number
  tipo: string
  origen: Origen
  confianza: Confianza
  payloadAplicado: unknown
  payloadInverso: Inversa
  estado: 'aplicada' | 'deshecha' | 'sombra' | 'pendiente'
  creadaEn: Date
  deshechaEn: Date | null
}

interface Fila {
  id: string; tipo: string; origen: Origen; confianza: Confianza
  payload_aplicado: unknown; payload_inverso: Inversa
  estado: AccionGuardada['estado']; creada_en: Date; deshecha_en: Date | null
}

const aDominio = (f: Fila): AccionGuardada => ({
  id: Number(f.id), tipo: f.tipo, origen: f.origen, confianza: f.confianza,
  payloadAplicado: f.payload_aplicado, payloadInverso: f.payload_inverso,
  estado: f.estado, creadaEn: f.creada_en, deshechaEn: f.deshecha_en,
})

const COLUMNAS = `id, tipo, origen, confianza, payload_aplicado,
  payload_inverso, estado, creada_en, deshecha_en`

export function crearRepoAcciones(pool: pg.Pool) {
  return {
    async registrar(a: NuevaAccion): Promise<number> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO acciones
           (tipo, origen, correo_id, compromiso_id, confianza,
            payload_aplicado, payload_inverso, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [a.tipo, a.origen, a.correoId, a.compromisoId, a.confianza,
         JSON.stringify(a.payloadAplicado), JSON.stringify(a.payloadInverso), a.estado])
      return Number(rows[0]!.id)
    },

    async porId(id: number): Promise<AccionGuardada | null> {
      const { rows } = await pool.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones WHERE id=$1`, [id])
      return rows[0] ? aDominio(rows[0]) : null
    },

    async ultimaDeshacible(): Promise<AccionGuardada | null> {
      const { rows } = await pool.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones
          WHERE estado='aplicada' ORDER BY creada_en DESC, id DESC LIMIT 1`)
      return rows[0] ? aDominio(rows[0]) : null
    },

    async marcarDeshecha(id: number): Promise<void> {
      await pool.query(
        `UPDATE acciones SET estado='deshecha', deshecha_en=now() WHERE id=$1`, [id])
    },

    async delDia(desdeIso: string, hastaIso: string): Promise<AccionGuardada[]> {
      const { rows } = await pool.query<Fila>(
        `SELECT ${COLUMNAS} FROM acciones
          WHERE creada_en >= $1 AND creada_en <= $2 ORDER BY creada_en`,
        [desdeIso, hastaIso])
      return rows.map(aDominio)
    },
  }
}

export type RepoAcciones = ReturnType<typeof crearRepoAcciones>
```

- [ ] **Step 4: Implementar `src/servicios/deshacer.ts`**

```ts
import type { RepoAcciones } from '../repos/acciones.ts'
import type { SumideroCalendario } from '../puertos/sumidero-calendario.ts'

export function crearServicioDeshacer(
  repo: RepoAcciones, calendario: SumideroCalendario
) {
  return {
    async deshacer(id: number): Promise<{ ok: boolean; motivo?: string }> {
      const accion = await repo.porId(id)
      if (!accion) return { ok: false, motivo: 'La acción no existe' }
      if (accion.estado === 'deshecha') return { ok: false, motivo: 'Ya estaba deshecha' }
      if (accion.estado === 'sombra') {
        return { ok: false, motivo: 'En modo sombra no se aplicó nada' }
      }

      await calendario.restaurar(accion.payloadInverso)
      // La auditoría es append-only: se marca, nunca se borra.
      await repo.marcarDeshecha(id)
      return { ok: true }
    },
  }
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/deshacer.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/repos/acciones.ts src/servicios/deshacer.ts tests/deshacer.test.ts
git commit -m "feat: auditoría append-only y servicio de deshacer por operación inversa"
```

---

### Task 11: Orquestador del pipeline

Une todas las piezas anteriores. Es la tarea que demuestra que el diseño
funciona de punta a punta sin tocar la red.

**Files:**
- Create: `src/pipeline/actuador.ts`, `src/pipeline/procesar-correo.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: todo lo anterior
- Produces:
  - `crearProcesador(deps: DepsProcesador)` → `{ procesar(correo: CorreoCrudo): Promise<ResultadoProceso> }`
  - `type ResultadoProceso = { decision: Decision | 'descartado'; accionId: number | null; motivo: string }`
  - `type DepsProcesador = { reloj, repoCompromisos, repoCorreos, repoAcciones, clasificador, extractor, desempate, calendario, modoSombra: boolean, remitentesIgnorados: string[] }`

- [ ] **Step 1: Escribir el test que falla**

`tests/pipeline.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { migrar } from '../src/db/migrate.ts'
import { RelojFalso } from '../src/puertos/reloj.ts'
import { crearRepoCompromisos } from '../src/repos/compromisos.ts'
import { crearRepoCorreos } from '../src/repos/correos.ts'
import { crearRepoAcciones } from '../src/repos/acciones.ts'
import { crearClasificador } from '../src/pipeline/clasificador.ts'
import { crearExtractor } from '../src/pipeline/extractor.ts'
import { crearDesempate } from '../src/pipeline/desempate.ts'
import { crearProcesador } from '../src/pipeline/procesar-correo.ts'
import { CalendarioFalso } from './fakes/calendario-falso.ts'
import { LlmFalso } from './fakes/llm-falso.ts'
import type { CorreoCrudo } from '../src/dominio/tipos.ts'

const url = process.env.DATABASE_URL ??
  'postgres://asistente:cambiame@localhost:5433/asistente'
let pool: pg.Pool

// El correo llega el martes 4 de agosto; la clase es el miércoles 6.
const reloj = new RelojFalso('2026-08-04T14:14:00')

const correoProfe: CorreoCrudo = {
  messageId: 'm-profe-1', threadId: 't1', remitente: 'ramirez@uni.edu.co',
  asunto: 'Clase', cuerpo: 'No, no, la clase de mañana se cancela',
  recibidoEn: '2026-08-04T14:14:00-05:00', etiquetas: ['INBOX'],
}

const instancia = {
  eventoId: 'evt_calc', instanciaId: 'inst_20260806',
  inicio: '2026-08-06T16:00:00-05:00', fin: '2026-08-06T17:00:00-05:00',
  titulo: 'Cálculo', estado: 'confirmado' as const,
}

before(async () => { pool = new pg.Pool({ connectionString: url }); await migrar(pool) })
after(async () => { await pool.end() })
beforeEach(async () => {
  await pool.query('TRUNCATE acciones, cola, correos_procesados, compromisos RESTART IDENTITY CASCADE')
})

async function armar(respuestasLlm: unknown[], modoSombra: boolean) {
  const repoCompromisos = crearRepoCompromisos(pool)
  await repoCompromisos.crear({
    titulo: 'Cálculo', alias: ['calculo', 'clase'],
    rrule: 'FREQ=WEEKLY;BYDAY=WE', horaInicio: '16:00', horaFin: '17:00',
    tz: 'America/Bogota', googleCalendarId: 'primary',
    googleEventId: 'evt_calc', remitentesVinculados: ['ramirez@uni.edu.co'],
  })
  const llm = new LlmFalso(respuestasLlm)
  const calendario = new CalendarioFalso([{ ...instancia }])
  const procesador = crearProcesador({
    reloj, repoCompromisos, repoCorreos: crearRepoCorreos(pool),
    repoAcciones: crearRepoAcciones(pool),
    clasificador: crearClasificador(llm, 'm'),
    extractor: crearExtractor(llm, 'm'),
    desempate: crearDesempate(llm, 'm'),
    calendario, modoSombra, remitentesIgnorados: [],
  })
  return { procesador, calendario }
}

const RESPUESTAS_CANCELA_MANANA = [
  { clasificacion: 'agenda', confianza: 'alta' },
  { intencion: 'cancelar', referente: { tipo: 'manana' },
    nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta' },
]

test('correo del profe cancela la instancia correcta', async () => {
  const { procesador, calendario } = await armar(RESPUESTAS_CANCELA_MANANA, false)
  const r = await procesador.procesar(correoProfe)

  assert.equal(r.decision, 'actuar_callado')
  const [inst] = await calendario.instanciasEnRango('primary', 'evt_calc',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.equal(inst!.estado, 'cancelado')
})

test('la acción queda auditada con su inversa', async () => {
  const { procesador } = await armar(RESPUESTAS_CANCELA_MANANA, false)
  const r = await procesador.procesar(correoProfe)
  assert.ok(r.accionId)

  const guardada = await crearRepoAcciones(pool).porId(r.accionId!)
  assert.equal(guardada?.estado, 'aplicada')
  assert.equal(guardada?.payloadInverso.tipo, 'recrear_instancia')
})

test('en modo sombra no se toca el calendario pero sí se registra', async () => {
  const { procesador, calendario } = await armar(RESPUESTAS_CANCELA_MANANA, true)
  const r = await procesador.procesar(correoProfe)

  const [inst] = await calendario.instanciasEnRango('primary', 'evt_calc',
    '2026-08-06T00:00:00-05:00', '2026-08-06T23:59:59-05:00')
  assert.equal(inst!.estado, 'confirmado')

  const guardada = await crearRepoAcciones(pool).porId(r.accionId!)
  assert.equal(guardada?.estado, 'sombra')
})

test('el mismo correo dos veces sólo produce una acción', async () => {
  const { procesador } = await armar(RESPUESTAS_CANCELA_MANANA, false)
  await procesador.procesar(correoProfe)
  const segundo = await procesador.procesar(correoProfe)

  assert.equal(segundo.decision, 'descartado')
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM acciones')
  assert.equal(rows[0]!.n, 1)
})

test('un correo de promociones no llega al LLM', async () => {
  const { procesador } = await armar([], false) // sin respuestas: si consulta, revienta
  const r = await procesador.procesar({
    ...correoProfe, messageId: 'm-promo', etiquetas: ['CATEGORY_PROMOTIONS'],
  })
  assert.equal(r.decision, 'descartado')
})

test('clasificado como ruido no produce acción', async () => {
  const { procesador } = await armar([{ clasificacion: 'ruido', confianza: 'alta' }], false)
  const r = await procesador.procesar({ ...correoProfe, messageId: 'm-ruido' })
  assert.equal(r.decision, 'descartado')
  assert.equal(r.accionId, null)
})

test('un referente ambiguo baja a confianza media y avisa', async () => {
  const { procesador } = await armar([
    { clasificacion: 'agenda', confianza: 'alta' },
    { intencion: 'cancelar',
      referente: { tipo: 'dia_semana', dia: 3, modificador: 'proximo' },
      nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta' },
  ], false)
  const r = await procesador.procesar({ ...correoProfe, messageId: 'm-ambiguo' })
  assert.equal(r.decision, 'actuar_y_avisar')
})

test('sin instancia en la ventana no se actúa', async () => {
  const { procesador } = await armar([
    { clasificacion: 'agenda', confianza: 'alta' },
    // "hoy" es martes 4; la clase es el miércoles 6.
    { intencion: 'cancelar', referente: { tipo: 'hoy' },
      nuevoInicio: null, nuevoFin: null, menciones: ['clase'], confianza: 'alta' },
  ], false)
  const r = await procesador.procesar({ ...correoProfe, messageId: 'm-sin-inst' })
  assert.equal(r.accionId, null)
  assert.match(r.motivo, /instancia/i)
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/pipeline.test.ts`
Expected: FAIL — `Cannot find module '../src/pipeline/procesar-correo.ts'`

- [ ] **Step 3: Implementar `src/pipeline/actuador.ts`**

```ts
import type { SumideroCalendario, AccionCalendario, EventoInstancia }
  from '../puertos/sumidero-calendario.ts'
import { calcularInversa } from '../dominio/inversas.ts'
import type { Inversa } from '../puertos/sumidero-calendario.ts'

/**
 * Aplica la acción y devuelve la inversa. La inversa se calcula ANTES de
 * escribir, con el estado que está a punto de cambiar.
 */
export async function aplicarConInversa(
  calendario: SumideroCalendario,
  accion: AccionCalendario,
  instancia: EventoInstancia,
  rrule: string | null
): Promise<Inversa> {
  const inversa = calcularInversa(accion, { instancia, rrule })
  await calendario.aplicar(accion)
  return inversa
}
```

- [ ] **Step 4: Implementar `src/pipeline/procesar-correo.ts`**

```ts
import type { Reloj } from '../puertos/reloj.ts'
import type { SumideroCalendario, AccionCalendario } from '../puertos/sumidero-calendario.ts'
import type { RepoCompromisos } from '../repos/compromisos.ts'
import type { RepoCorreos } from '../repos/correos.ts'
import type { RepoAcciones } from '../repos/acciones.ts'
import type { Clasificador } from './clasificador.ts'
import type { Extractor } from './extractor.ts'
import type { Desempate } from './desempate.ts'
import type { CorreoCrudo } from '../dominio/tipos.ts'
import { esRuidoObvio } from './prefiltro.ts'
import { resolverReferente } from '../dominio/fechas.ts'
import { resolver } from '../dominio/resolutor.ts'
import { decidir, type Decision, type TipoAccion } from '../dominio/politica.ts'
import { aplicarConInversa } from './actuador.ts'

export interface DepsProcesador {
  reloj: Reloj
  repoCompromisos: RepoCompromisos
  repoCorreos: RepoCorreos
  repoAcciones: RepoAcciones
  clasificador: Clasificador
  extractor: Extractor
  desempate: Desempate
  calendario: SumideroCalendario
  modoSombra: boolean
  remitentesIgnorados: string[]
}

export interface ResultadoProceso {
  decision: Decision | 'descartado'
  accionId: number | null
  motivo: string
}

const descartar = (motivo: string): ResultadoProceso =>
  ({ decision: 'descartado', accionId: null, motivo })

export function crearProcesador(d: DepsProcesador) {
  return {
    async procesar(correo: CorreoCrudo): Promise<ResultadoProceso> {
      if (esRuidoObvio(correo, d.remitentesIgnorados)) {
        return descartar('Filtrado antes del LLM')
      }

      const { id: correoId, nuevo } = await d.repoCorreos.registrarSiEsNuevo(correo)
      if (!nuevo) return descartar('Ya procesado')

      const { clasificacion } = await d.clasificador.clasificar(correo)
      await d.repoCorreos.marcarProcesado(correoId, clasificacion)
      if (clasificacion !== 'agenda') return descartar(`Clasificado como ${clasificacion}`)

      const hecho = await d.extractor.extraer(correo, correo.recibidoEn)
      if (hecho.intencion === 'ninguna' || hecho.intencion === 'crear') {
        return descartar(`Intención ${hecho.intencion} sin soporte en esta fase`)
      }

      const resuelto = resolverReferente(hecho.referente, d.reloj.ahora())
      const intervalo = resuelto?.intervalo ?? null
      const ambiguo = resuelto?.ambiguo ?? false

      const compromisos = await d.repoCompromisos.listarActivos()
      const texto = `${correo.asunto ?? ''}\n${correo.cuerpo}`
      const resolucion = resolver({
        compromisos, remitente: correo.remitente, texto,
        intervalo, ambiguo, threadCompromisoId: null,
      })

      let compromisoId: number | null = null
      let confianza = hecho.confianza

      if (resolucion.estado === 'sin_candidatos') {
        return descartar('Ningún compromiso coincide')
      }
      if (resolucion.estado === 'empate') {
        const elegido = await d.desempate.elegir(resolucion.candidatos, texto)
        if (!elegido) return descartar('Empate sin resolver: hay que preguntar')
        compromisoId = elegido.compromiso.id
        confianza = 'media' // hubo que desempatar: nunca es confianza alta
      } else {
        compromisoId = resolucion.candidato.compromiso.id
        confianza = resolucion.confianza
      }

      const compromiso = await d.repoCompromisos.porId(compromisoId)
      if (!compromiso?.googleEventId) return descartar('El compromiso no tiene evento')
      if (!intervalo) return descartar('No se pudo situar la instancia en el tiempo')

      const instancias = await d.calendario.instanciasEnRango(
        compromiso.googleCalendarId, compromiso.googleEventId,
        intervalo.inicio.toISO()!, intervalo.fin.toISO()!)
      const instancia = instancias.find((i) => i.estado === 'confirmado')
      if (!instancia) return descartar('No hay instancia confirmada en esa ventana')

      const tipo: TipoAccion =
        hecho.intencion === 'cancelar' ? 'cancelar_instancia' : 'mover_evento'

      const decision = decidir({
        origen: 'correo', tipo, confianza, silenciadoPorRegla: false,
      })
      if (decision === 'preguntar' || decision === 'confirmar' || decision === 'ignorar') {
        return { decision, accionId: null, motivo: 'Requiere intervención de Marcelo' }
      }

      const accion: AccionCalendario = tipo === 'cancelar_instancia'
        ? { tipo: 'cancelar_instancia', calendarId: compromiso.googleCalendarId,
            instanciaId: instancia.instanciaId }
        : { tipo: 'mover_evento', calendarId: compromiso.googleCalendarId,
            instanciaId: instancia.instanciaId,
            nuevoInicio: `${intervalo.inicio.toISODate()}T${hecho.nuevoInicio ?? compromiso.horaInicio}:00`,
            nuevoFin: `${intervalo.inicio.toISODate()}T${hecho.nuevoFin ?? compromiso.horaFin}:00` }

      const inversa = await aplicarConInversa(
        d.calendario, accion, instancia, compromiso.rrule)

      const accionId = await d.repoAcciones.registrar({
        tipo, origen: 'correo', correoId, compromisoId,
        confianza, payloadAplicado: accion, payloadInverso: inversa,
        estado: d.modoSombra ? 'sombra' : 'aplicada',
      })

      return { decision, accionId, motivo: 'Aplicada' }
    },
  }
}
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/pipeline.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Ejecutar toda la suite y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS en todo, sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/actuador.ts src/pipeline/procesar-correo.ts tests/pipeline.test.ts
git commit -m "feat: orquestador del pipeline de correo a calendario"
```

---

### Task 12: Adaptadores de Google, sincronización y servidor

Última tarea: conecta el núcleo probado con el mundo real.

**Files:**
- Create: `src/adaptadores/google-auth.ts`, `src/adaptadores/gmail.ts`, `src/adaptadores/google-calendar.ts`
- Create: `src/repos/cola.ts`, `src/servicios/sincronizacion.ts`, `src/http/servidor.ts`, `src/index.ts`
- Test: `tests/cola.test.ts`

**Interfaces:**
- Consumes: todo lo anterior
- Produces:
  - `crearClienteGoogle(config)` → `OAuth2Client` con refresco automático
  - `class FuenteGmail` con `mensajesDesde(historyId): Promise<{ correos: CorreoCrudo[]; nuevoHistoryId: string }>`, `mensajeCompleto(messageId)`, `renovarWatch(topico)`
  - `class CalendarioGoogle implements SumideroCalendario`
  - `crearRepoCola(pool)` → `{ encolar(messageId), tomarPendientes(limite), marcarListo(id), marcarError(id, error) }`
  - `crearServidor(deps)` → instancia de Fastify con `POST /webhook/gmail` y `GET /salud`

- [ ] **Step 1: Escribir el test de la cola que falla**

`tests/cola.test.ts`:

```ts
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { migrar } from '../src/db/migrate.ts'
import { crearRepoCola } from '../src/repos/cola.ts'

const url = process.env.DATABASE_URL ??
  'postgres://asistente:cambiame@localhost:5433/asistente'
let pool: pg.Pool

before(async () => { pool = new pg.Pool({ connectionString: url }); await migrar(pool) })
after(async () => { await pool.end() })
beforeEach(async () => { await pool.query('TRUNCATE cola RESTART IDENTITY') })

test('encolar el mismo message_id dos veces deja una sola entrada', async () => {
  const cola = crearRepoCola(pool)
  await cola.encolar('m1')
  await cola.encolar('m1')
  const pendientes = await cola.tomarPendientes(10)
  assert.equal(pendientes.length, 1)
})

test('tomarPendientes marca en procesando para que otro worker no lo tome', async () => {
  const cola = crearRepoCola(pool)
  await cola.encolar('m1')
  const primera = await cola.tomarPendientes(10)
  const segunda = await cola.tomarPendientes(10)
  assert.equal(primera.length, 1)
  assert.equal(segunda.length, 0)
})

test('marcarError incrementa intentos y lo devuelve a pendiente', async () => {
  const cola = crearRepoCola(pool)
  await cola.encolar('m1')
  const [item] = await cola.tomarPendientes(10)
  await cola.marcarError(item!.id, 'timeout')

  const reintento = await cola.tomarPendientes(10)
  assert.equal(reintento.length, 1)
  assert.equal(reintento[0]!.intentos, 1)
})

test('tras 3 intentos fallidos el item queda muerto y no se reintenta', async () => {
  const cola = crearRepoCola(pool)
  await cola.encolar('m1')
  for (let i = 0; i < 3; i++) {
    const [item] = await cola.tomarPendientes(10)
    await cola.marcarError(item!.id, 'falla')
  }
  assert.equal((await cola.tomarPendientes(10)).length, 0)
  const { rows } = await pool.query(`SELECT estado FROM cola WHERE message_id='m1'`)
  assert.equal(rows[0]!.estado, 'muerto')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test -- tests/cola.test.ts`
Expected: FAIL — `Cannot find module '../src/repos/cola.ts'`

- [ ] **Step 3: Implementar `src/repos/cola.ts`**

```ts
import type pg from 'pg'

const MAX_INTENTOS = 3

export interface ItemCola {
  id: number
  messageId: string
  intentos: number
}

export function crearRepoCola(pool: pg.Pool) {
  return {
    async encolar(messageId: string): Promise<void> {
      await pool.query(
        `INSERT INTO cola (message_id) VALUES ($1) ON CONFLICT (message_id) DO NOTHING`,
        [messageId])
    },

    /**
     * SKIP LOCKED permite varios workers sin que se pisen. El estado
     * 'procesando' evita que el mismo correo se tome dos veces.
     */
    async tomarPendientes(limite: number): Promise<ItemCola[]> {
      const { rows } = await pool.query<{ id: string; message_id: string; intentos: number }>(
        `UPDATE cola SET estado='procesando'
          WHERE id IN (
            SELECT id FROM cola WHERE estado='pendiente'
             ORDER BY encolado_en LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING id, message_id, intentos`, [limite])
      return rows.map((r) => ({
        id: Number(r.id), messageId: r.message_id, intentos: r.intentos,
      }))
    },

    async marcarListo(id: number): Promise<void> {
      await pool.query(`UPDATE cola SET estado='listo' WHERE id=$1`, [id])
    },

    async marcarError(id: number, error: string): Promise<void> {
      await pool.query(
        `UPDATE cola
            SET intentos = intentos + 1,
                ultimo_error = $2,
                estado = CASE WHEN intentos + 1 >= $3 THEN 'muerto' ELSE 'pendiente' END
          WHERE id = $1`, [id, error, MAX_INTENTOS])
    },
  }
}

export type RepoCola = ReturnType<typeof crearRepoCola>
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npm test -- tests/cola.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Implementar `src/adaptadores/google-auth.ts`**

```ts
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

export function crearClienteGoogle(
  clientId: string, clientSecret: string, refreshToken: string
): OAuth2Client {
  const cliente = new google.auth.OAuth2(clientId, clientSecret)
  cliente.setCredentials({ refresh_token: refreshToken })
  return cliente
}

export const ALCANCES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
]
```

- [ ] **Step 6: Implementar `src/adaptadores/gmail.ts`**

```ts
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { CorreoCrudo } from '../dominio/tipos.ts'

function extraerCuerpo(payload: unknown): string {
  const p = payload as {
    mimeType?: string
    body?: { data?: string }
    parts?: unknown[]
  } | undefined
  if (!p) return ''
  if (p.body?.data) return Buffer.from(p.body.data, 'base64url').toString('utf8')
  for (const parte of p.parts ?? []) {
    const texto = extraerCuerpo(parte)
    if (texto) return texto
  }
  return ''
}

export class FuenteGmail {
  private gmail
  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth })
  }

  /** Devuelve los ids nuevos desde historyId. Si caducó, devuelve caduco:true. */
  async idsDesde(historyId: string): Promise<
    { ids: string[]; nuevoHistoryId: string; caduco: false } | { caduco: true }
  > {
    try {
      const r = await this.gmail.users.history.list({
        userId: 'me', startHistoryId: historyId, historyTypes: ['messageAdded'],
      })
      const ids = (r.data.history ?? [])
        .flatMap((h) => h.messagesAdded ?? [])
        .map((m) => m.message?.id)
        .filter((id): id is string => Boolean(id))
      return { ids: [...new Set(ids)], nuevoHistoryId: r.data.historyId ?? historyId, caduco: false }
    } catch (e) {
      // 404 significa que el historyId es más viejo que la ventana de Gmail.
      if ((e as { code?: number }).code === 404) return { caduco: true }
      throw e
    }
  }

  /** Respaldo cuando el historyId caducó: los mensajes recientes por consulta. */
  async idsRecientes(consulta: string): Promise<string[]> {
    const r = await this.gmail.users.messages.list({ userId: 'me', q: consulta, maxResults: 100 })
    return (r.data.messages ?? []).map((m) => m.id!).filter(Boolean)
  }

  async mensajeCompleto(messageId: string): Promise<CorreoCrudo> {
    const r = await this.gmail.users.messages.get({
      userId: 'me', id: messageId, format: 'full',
    })
    const cabeceras = r.data.payload?.headers ?? []
    const buscar = (n: string) =>
      cabeceras.find((h) => h.name?.toLowerCase() === n)?.value ?? null

    return {
      messageId,
      threadId: r.data.threadId ?? null,
      remitente: buscar('from') ?? '(desconocido)',
      asunto: buscar('subject'),
      cuerpo: extraerCuerpo(r.data.payload),
      recibidoEn: new Date(Number(r.data.internalDate ?? Date.now())).toISOString(),
      etiquetas: r.data.labelIds ?? [],
    }
  }

  /** El watch caduca a los 7 días: hay que renovarlo con un cron diario. */
  async renovarWatch(topico: string): Promise<string> {
    const r = await this.gmail.users.watch({
      userId: 'me', requestBody: { topicName: topico, labelIds: ['INBOX'] },
    })
    return r.data.historyId ?? ''
  }
}
```

- [ ] **Step 7: Implementar `src/adaptadores/google-calendar.ts`**

```ts
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type {
  AccionCalendario, EventoInstancia, Inversa, SumideroCalendario,
} from '../puertos/sumidero-calendario.ts'

export class CalendarioGoogle implements SumideroCalendario {
  private cal
  constructor(auth: OAuth2Client) {
    this.cal = google.calendar({ version: 'v3', auth })
  }

  async instanciasEnRango(
    calendarId: string, eventoId: string, desdeIso: string, hastaIso: string
  ): Promise<EventoInstancia[]> {
    const r = await this.cal.events.instances({
      calendarId, eventId: eventoId, timeMin: desdeIso, timeMax: hastaIso,
      showDeleted: false,
    })
    return (r.data.items ?? []).map((e) => ({
      eventoId,
      instanciaId: e.id!,
      inicio: e.start?.dateTime ?? e.start?.date ?? '',
      fin: e.end?.dateTime ?? e.end?.date ?? '',
      titulo: e.summary ?? '',
      estado: e.status === 'cancelled' ? 'cancelado' : 'confirmado',
    }))
  }

  async aplicar(a: AccionCalendario): Promise<void> {
    if (a.tipo === 'cancelar_instancia') {
      // Cancelar SÓLO esta instancia: se marca la excepción, la serie sigue viva.
      await this.cal.events.patch({
        calendarId: a.calendarId, eventId: a.instanciaId,
        requestBody: { status: 'cancelled' },
      })
    } else if (a.tipo === 'mover_evento') {
      await this.cal.events.patch({
        calendarId: a.calendarId, eventId: a.instanciaId,
        requestBody: {
          start: { dateTime: a.nuevoInicio, timeZone: 'America/Bogota' },
          end: { dateTime: a.nuevoFin, timeZone: 'America/Bogota' },
        },
      })
    } else {
      await this.cal.events.delete({ calendarId: a.calendarId, eventId: a.eventoId })
    }
  }

  async restaurar(inv: Inversa): Promise<void> {
    if (inv.tipo === 'recrear_instancia') {
      await this.cal.events.patch({
        calendarId: inv.calendarId, eventId: inv.instancia.instanciaId,
        requestBody: {
          status: 'confirmed',
          start: { dateTime: inv.instancia.inicio, timeZone: 'America/Bogota' },
          end: { dateTime: inv.instancia.fin, timeZone: 'America/Bogota' },
        },
      })
    } else if (inv.tipo === 'restaurar_horario') {
      await this.cal.events.patch({
        calendarId: inv.calendarId, eventId: inv.instanciaId,
        requestBody: {
          start: { dateTime: inv.inicio, timeZone: 'America/Bogota' },
          end: { dateTime: inv.fin, timeZone: 'America/Bogota' },
        },
      })
    } else {
      await this.cal.events.insert({
        calendarId: inv.calendarId,
        requestBody: {
          summary: inv.titulo,
          recurrence: inv.rrule ? [`RRULE:${inv.rrule}`] : undefined,
        },
      })
    }
  }
}
```

- [ ] **Step 8: Implementar `src/servicios/sincronizacion.ts`**

```ts
import type pg from 'pg'
import type { FuenteGmail } from '../adaptadores/gmail.ts'
import type { RepoCola } from '../repos/cola.ts'

/** Si el historyId caducó, se recuperan los correos de este rango. */
const CONSULTA_RESPALDO = 'newer_than:3d'

export function crearSincronizacion(pool: pg.Pool, gmail: FuenteGmail, cola: RepoCola) {
  return {
    async historyIdGuardado(): Promise<string | null> {
      const { rows } = await pool.query<{ history_id: string | null }>(
        'SELECT history_id FROM estado_sync WHERE id=1')
      return rows[0]?.history_id ?? null
    },

    async guardarHistoryId(historyId: string): Promise<void> {
      await pool.query('UPDATE estado_sync SET history_id=$1 WHERE id=1', [historyId])
    },

    async latido(): Promise<void> {
      await pool.query('UPDATE estado_sync SET ultimo_latido=now() WHERE id=1')
    },

    /**
     * Se llama al arrancar y en cada webhook. Si la máquina estuvo apagada,
     * esto recupera todo lo perdido; si el historyId caducó (más de 7 días),
     * cae al respaldo por consulta.
     */
    async ponerseAlDia(): Promise<number> {
      const guardado = await this.historyIdGuardado()

      if (guardado) {
        const r = await gmail.idsDesde(guardado)
        if (!r.caduco) {
          for (const id of r.ids) await cola.encolar(id)
          await this.guardarHistoryId(r.nuevoHistoryId)
          return r.ids.length
        }
      }

      const ids = await gmail.idsRecientes(CONSULTA_RESPALDO)
      for (const id of ids) await cola.encolar(id)
      return ids.length
    },

    async renovarWatch(topico: string): Promise<void> {
      const historyId = await gmail.renovarWatch(topico)
      if (historyId) await this.guardarHistoryId(historyId)
      await pool.query('UPDATE estado_sync SET watch_renovado_en=now() WHERE id=1')
    },
  }
}
```

- [ ] **Step 9: Implementar `src/http/servidor.ts`**

```ts
import Fastify from 'fastify'
import type pg from 'pg'

export interface DepsServidor {
  pool: pg.Pool
  alRecibirAviso: () => Promise<void>
}

export function crearServidor(d: DepsServidor) {
  const app = Fastify({ logger: false })

  app.get('/salud', async () => {
    const { rows } = await d.pool.query<{ ultimo_latido: Date | null }>(
      'SELECT ultimo_latido FROM estado_sync WHERE id=1')
    return { ok: true, ultimoLatido: rows[0]?.ultimo_latido ?? null }
  })

  // Pub/Sub reintenta si no recibe 2xx. Se responde de inmediato y el
  // trabajo se hace aparte: la idempotencia por message_id cubre los
  // reintentos, así que responder rápido no pierde nada.
  app.post('/webhook/gmail', async (_peticion, respuesta) => {
    void d.alRecibirAviso().catch(() => {})
    return respuesta.code(204).send()
  })

  return app
}
```

- [ ] **Step 10: Implementar `src/index.ts`**

```ts
import 'dotenv/config'
import cron from 'node-cron'
import pino from 'pino'
import { cargarConfig } from './config.ts'
import { obtenerPool } from './db/pool.ts'
import { migrar } from './db/migrate.ts'
import { RelojReal } from './puertos/reloj.ts'
import { crearClienteGoogle } from './adaptadores/google-auth.ts'
import { FuenteGmail } from './adaptadores/gmail.ts'
import { CalendarioGoogle } from './adaptadores/google-calendar.ts'
import { CalendarioSombra } from './adaptadores/calendario-sombra.ts'
import { ProveedorGroq } from './adaptadores/groq.ts'
import { crearRepoCompromisos } from './repos/compromisos.ts'
import { crearRepoCorreos } from './repos/correos.ts'
import { crearRepoAcciones } from './repos/acciones.ts'
import { crearRepoCola } from './repos/cola.ts'
import { crearClasificador } from './pipeline/clasificador.ts'
import { crearExtractor } from './pipeline/extractor.ts'
import { crearDesempate } from './pipeline/desempate.ts'
import { crearProcesador } from './pipeline/procesar-correo.ts'
import { crearSincronizacion } from './servicios/sincronizacion.ts'
import { crearServidor } from './http/servidor.ts'

const config = cargarConfig(process.env)
const log = pino({ level: config.nivelLog })

const pool = obtenerPool(config.urlBaseDatos)
await migrar(pool)

const auth = crearClienteGoogle(
  config.google.clientId, config.google.clientSecret, config.google.refreshToken)

const gmail = new FuenteGmail(auth)
const calendarioReal = new CalendarioGoogle(auth)
const calendario = config.modoSombra
  ? new CalendarioSombra(calendarioReal)
  : calendarioReal

const llm = new ProveedorGroq(config.groq.apiKey, config.groq.baseUrl)
const cola = crearRepoCola(pool)

const procesador = crearProcesador({
  reloj: new RelojReal(config.zonaHoraria),
  repoCompromisos: crearRepoCompromisos(pool),
  repoCorreos: crearRepoCorreos(pool),
  repoAcciones: crearRepoAcciones(pool),
  clasificador: crearClasificador(llm, config.groq.modeloClasificador),
  extractor: crearExtractor(llm, config.groq.modeloExtractor),
  desempate: crearDesempate(llm, config.groq.modeloExtractor),
  calendario,
  modoSombra: config.modoSombra,
  remitentesIgnorados: [],
})

const sync = crearSincronizacion(pool, gmail, cola)

async function drenarCola(): Promise<void> {
  for (const item of await cola.tomarPendientes(10)) {
    try {
      const correo = await gmail.mensajeCompleto(item.messageId)
      const r = await procesador.procesar(correo)
      log.info({ messageId: item.messageId, ...r }, 'correo procesado')
      await cola.marcarListo(item.id)
    } catch (e) {
      log.error({ err: e, messageId: item.messageId }, 'fallo procesando')
      await cola.marcarError(item.id, String(e))
    }
  }
}

// Recuperación al arrancar: la laptop pudo estar apagada.
log.info({ encolados: await sync.ponerseAlDia() }, 'puesta al día inicial')

const app = crearServidor({
  pool,
  alRecibirAviso: async () => { await sync.ponerseAlDia(); await drenarCola() },
})

cron.schedule('* * * * *', () => { void drenarCola() })
cron.schedule('*/5 * * * *', () => { void sync.latido() })
// El watch de Gmail caduca a los 7 días. Renovarlo a diario evita que el
// sistema deje de recibir avisos de forma silenciosa.
cron.schedule('0 3 * * *', () => {
  void sync.renovarWatch(config.google.topicoPubsub).catch((e) =>
    log.error({ err: e }, 'no se pudo renovar el watch'))
}, { timezone: config.zonaHoraria })

await app.listen({ port: config.puerto, host: '0.0.0.0' })
log.info({ puerto: config.puerto, modoSombra: config.modoSombra }, 'asistente arriba')
```

- [ ] **Step 11: Ejecutar toda la suite y el typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS en todos los tests, sin errores de tipos.

- [ ] **Step 12: Commit**

```bash
git add src/adaptadores src/repos/cola.ts src/servicios/sincronizacion.ts src/http src/index.ts tests/cola.test.ts
git commit -m "feat: adaptadores de Google, cola persistente, sincronización y arranque del servicio"
```

---

## Verificación final del plan

Al terminar la Task 12, estas afirmaciones deben poder demostrarse con comandos:

- [ ] `npm test` pasa completo (≈60 tests) **sin conexión a internet**, salvo Postgres local.
- [ ] `npm run typecheck` no reporta errores.
- [ ] `docker compose up -d db && npm run db:migrate` deja el esquema listo desde cero.
- [ ] Con `MODO_SOMBRA=true`, procesar un correo registra la acción con `estado='sombra'` y **no** modifica Google Calendar.
- [ ] Deshacer una acción aplicada devuelve el calendario a su estado previo y deja el registro con `estado='deshecha'`, sin borrar filas.

## Fuera del alcance de este plan

Van en los planes siguientes: canal de Telegram y voz, resumen diario de las
21:00, módulo financiero, panel web, y el endurecimiento de despliegue
(Cloudflare Tunnel, Tailscale, watchdog, respaldos).

Consecuencia práctica: al terminar este plan el sistema **funciona pero no
habla**. Lo que hace se verifica leyendo la tabla `acciones` o los logs. Eso es
deliberado: el núcleo se prueba antes de construirle una cara.
