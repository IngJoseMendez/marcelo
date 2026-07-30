-- ═══════════════════════════════════════════════════════════════
--  001 · Núcleo: cuentas de correo, compromisos, auditoría y cola
-- ═══════════════════════════════════════════════════════════════

-- Marcelo recibe correo en Gmail y en Outlook. Cada cuenta es una fuente
-- independiente con su propio cursor de sincronización.
CREATE TABLE IF NOT EXISTS cuentas_correo (
  id         BIGSERIAL PRIMARY KEY,
  proveedor  TEXT NOT NULL CHECK (proveedor IN ('gmail', 'outlook')),
  direccion  TEXT NOT NULL,
  activa     BOOLEAN NOT NULL DEFAULT TRUE,
  creada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proveedor, direccion)
);

-- Un cursor por cuenta: historyId en Gmail, deltaLink en Outlook.
CREATE TABLE IF NOT EXISTS sync_cuenta (
  cuenta_id             BIGINT PRIMARY KEY REFERENCES cuentas_correo(id) ON DELETE CASCADE,
  cursor                TEXT,
  suscripcion_vence_en  TIMESTAMPTZ,
  ultimo_latido         TIMESTAMPTZ
);

-- Lo que Marcelo le enseña hablando: "los miércoles tengo cálculo de 4 a 5".
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

-- La idempotencia vive aquí. Los identificadores de mensaje sólo son
-- únicos dentro de su proveedor, así que la llave incluye la cuenta.
CREATE TABLE IF NOT EXISTS correos_procesados (
  id             BIGSERIAL PRIMARY KEY,
  cuenta_id      BIGINT NOT NULL REFERENCES cuentas_correo(id) ON DELETE CASCADE,
  message_id     TEXT NOT NULL,
  thread_id      TEXT,
  remitente      TEXT NOT NULL,
  asunto         TEXT,
  recibido_en    TIMESTAMPTZ NOT NULL,
  clasificacion  TEXT,
  estado         TEXT NOT NULL DEFAULT 'pendiente',
  procesado_en   TIMESTAMPTZ,
  UNIQUE (cuenta_id, message_id)
);

-- Auditoría append-only. payload_inverso se calcula ANTES de actuar y es
-- lo que permite deshacer. Deshacer agrega estado, nunca borra la fila.
CREATE TABLE IF NOT EXISTS acciones (
  id                BIGSERIAL PRIMARY KEY,
  tipo              TEXT NOT NULL,
  origen            TEXT NOT NULL CHECK (origen IN ('correo', 'voz', 'texto')),
  correo_id         BIGINT REFERENCES correos_procesados(id) ON DELETE SET NULL,
  compromiso_id     BIGINT REFERENCES compromisos(id) ON DELETE SET NULL,
  confianza         TEXT NOT NULL CHECK (confianza IN ('alta', 'media', 'baja')),
  payload_aplicado  JSONB NOT NULL,
  payload_inverso   JSONB NOT NULL,
  estado            TEXT NOT NULL
                    CHECK (estado IN ('aplicada', 'deshecha', 'sombra', 'pendiente')),
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deshecha_en       TIMESTAMPTZ
);

-- La cola vive en la base, no en memoria: si el proceso muere a media
-- tanda, al reiniciar retoma donde iba y ningún correo se pierde.
CREATE TABLE IF NOT EXISTS cola (
  id            BIGSERIAL PRIMARY KEY,
  cuenta_id     BIGINT NOT NULL REFERENCES cuentas_correo(id) ON DELETE CASCADE,
  message_id    TEXT NOT NULL,
  intentos      INT NOT NULL DEFAULT 0,
  ultimo_error  TEXT,
  estado        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'procesando', 'listo', 'muerto')),
  encolado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, message_id)
);

-- "De Bancolombia no me avises nada."
CREATE TABLE IF NOT EXISTS reglas (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL CHECK (tipo IN ('ignorar_remitente', 'silenciar_remitente')),
  patron      TEXT NOT NULL,
  creada_por  TEXT NOT NULL DEFAULT 'usuario',
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo, patron)
);

CREATE INDEX IF NOT EXISTS idx_acciones_creada ON acciones (creada_en DESC);
CREATE INDEX IF NOT EXISTS idx_cola_estado ON cola (estado, encolado_en);
CREATE INDEX IF NOT EXISTS idx_correos_recibido ON correos_procesados (recibido_en DESC);
