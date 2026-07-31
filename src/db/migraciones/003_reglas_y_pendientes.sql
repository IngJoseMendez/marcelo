-- ═══════════════════════════════════════════════════════════════
--  003 · Reglas dictadas por Marcelo y acciones a la espera
-- ═══════════════════════════════════════════════════════════════

-- La tabla `reglas` ya existe desde 001. Le falta poder apagar una sin
-- borrarla: "vuelve a avisarme de Bancolombia" no debería perder el rastro
-- de que alguna vez él pidió lo contrario.
ALTER TABLE reglas ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;

-- Una orden hablada que toca el calendario se guarda ANTES de aplicarse y
-- espera confirmación. Vive en `acciones` con estado 'pendiente' para que
-- confirmar y deshacer tiren del mismo hilo; si se rechaza queda
-- 'descartada', que también es historia: sin ese rastro no se puede medir
-- cuántas veces entendió mal.
ALTER TABLE acciones DROP CONSTRAINT IF EXISTS acciones_estado_check;
ALTER TABLE acciones ADD CONSTRAINT acciones_estado_check
  CHECK (estado IN ('aplicada', 'deshecha', 'sombra', 'pendiente', 'descartada'));

-- Lo que entendió, para poder enseñárselo tal cual al confirmar.
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS resumen TEXT;

CREATE INDEX IF NOT EXISTS idx_acciones_pendientes
  ON acciones (estado, creada_en DESC);
