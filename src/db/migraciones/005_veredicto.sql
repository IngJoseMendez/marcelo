-- ═══════════════════════════════════════════════════════════════
--  005 · El veredicto de Marcelo sobre lo que ella hizo
-- ═══════════════════════════════════════════════════════════════
--
--  El spec pone un número, no una sensación, para soltarle la correa:
--  ≥95 % de aciertos durante 5 días consecutivos. Ese número no existía
--  en ninguna parte, así que salir de sombra era una corazonada.
--
--  Aquí es donde se apunta. Un ✓ o un ✗ por acción, puestos por él desde
--  la Crónica o desde Telegram.

ALTER TABLE acciones ADD COLUMN IF NOT EXISTS veredicto TEXT
  CHECK (veredicto IN ('acierto', 'error'));
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS juzgada_en TIMESTAMPTZ;

-- Se consulta por día y sólo lo que ella hizo sola: el índice va por ahí.
CREATE INDEX IF NOT EXISTS idx_acciones_veredicto
  ON acciones (origen, creada_en DESC) WHERE origen = 'correo';

-- Los dos veredicios son el corpus de pruebas de regresión que produce la
-- sombra. Por eso se guardan aunque la acción ya esté deshecha: un error
-- deshecho sigue siendo un error, y contarlo como acierto falsearía el
-- número que decide si puede tocar el calendario de verdad.
COMMENT ON COLUMN acciones.veredicto IS
  'acierto | error, puesto por Marcelo. Alimenta el criterio de graduación.';
