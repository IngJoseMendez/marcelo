-- ═══════════════════════════════════════════════════════════════
--  002 · Bandeja de intenciones
--  Cosas por hacer que todavía no están en el calendario.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intenciones (
  id               BIGSERIAL PRIMARY KEY,
  titulo           TEXT NOT NULL,
  detalle          TEXT,
  prioridad        TEXT NOT NULL
                   CHECK (prioridad IN ('urgente', 'alta', 'normal', 'baja')),
  -- Bloques, no minutos sueltos: nadie sabe si algo toma 37 o 43 minutos,
  -- y pedir precisión falsa hace que uno deje de estimar.
  duracion_min     INT NOT NULL CHECK (duracion_min IN (15, 30, 60, 120)),
  vence_el         TIMESTAMPTZ,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'agendada', 'hecha', 'descartada')),
  origen           TEXT NOT NULL CHECK (origen IN ('correo', 'voz', 'texto')),
  correo_id        BIGINT REFERENCES correos_procesados(id) ON DELETE SET NULL,
  -- Agendar crea un evento, y eso es una acción auditada como cualquier
  -- otra: aquí queda el vínculo para poder deshacerla.
  accion_id        BIGINT REFERENCES acciones(id) ON DELETE SET NULL,
  google_event_id  TEXT,
  creada_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  agendada_en      TIMESTAMPTZ,
  cerrada_en       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_intenciones_bandeja
  ON intenciones (estado, vence_el);
