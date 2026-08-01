-- ═══════════════════════════════════════════════════════════════
--  004 · El libro contable
-- ═══════════════════════════════════════════════════════════════
--
--  El eje es simple: entra plata a sus cuentas y sale plata. Nada de
--  suponer que el dinero viene del exterior.
--
--  La asistente NUNCA mueve dinero: aquí sólo se lee y se registra. No
--  hay ninguna tabla, ni ningún puerto, por el que pueda pagar nada.

CREATE TABLE IF NOT EXISTS movimientos (
  id           BIGSERIAL PRIMARY KEY,
  fecha        DATE        NOT NULL,
  tipo         TEXT        NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),

  -- En la unidad menor y en entero. Un libro contable con flotantes
  -- pierde centavos, y los pierde en silencio.
  monto        BIGINT      NOT NULL CHECK (monto > 0),
  moneda       TEXT        NOT NULL DEFAULT 'COP',

  -- Moneda extranjera es caso borde, no el eje: mientras no se implemente
  -- la TRM, un movimiento en pesos tiene monto_cop = monto y trm = NULL.
  monto_cop    BIGINT,
  trm          NUMERIC(12, 4),
  -- La TRM no se pudo consultar y se usó la última conocida.
  trm_aprox    BOOLEAN     NOT NULL DEFAULT FALSE,

  contraparte  TEXT        NOT NULL,
  concepto     TEXT,
  categoria    TEXT        NOT NULL DEFAULT 'otros',

  correo_id    BIGINT      REFERENCES correos_procesados(id) ON DELETE SET NULL,

  -- hash(fecha + monto + moneda + contraparte normalizada).
  --
  -- El banco reenvía el mismo aviso, Marcelo lo reenvía, o la recuperación
  -- tras un apagón reprocesa un rango. Sin esta restricción el libro
  -- cuenta dos veces el mismo ingreso y queda mintiendo en silencio, que
  -- es la peor forma de fallar que hay en contabilidad.
  --
  -- Es UNIQUE en la base y no una consulta previa: así aguanta dos avisos
  -- del mismo movimiento llegando a la vez.
  hash_dedup   TEXT        NOT NULL UNIQUE,

  -- 'anulado' y no borrado: la inversa de registrar es anular. La
  -- auditoría es append-only también aquí.
  estado       TEXT        NOT NULL DEFAULT 'registrado'
               CHECK (estado IN ('registrado', 'anulado')),

  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_en   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_movimientos_fecha
  ON movimientos (fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_mes
  ON movimientos (estado, fecha);

-- Facturas con fecha límite. Nacen de un correo que anuncia un cobro
-- futuro, y mueren cuando aparece el movimiento que las paga.
CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
  id            BIGSERIAL PRIMARY KEY,
  acreedor      TEXT        NOT NULL,
  concepto      TEXT,
  monto         BIGINT      NOT NULL CHECK (monto > 0),
  moneda        TEXT        NOT NULL DEFAULT 'COP',
  vence_el      DATE        NOT NULL,

  estado        TEXT        NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'pagada', 'descartada')),

  -- Con qué movimiento se dio por pagada.
  movimiento_id BIGINT      REFERENCES movimientos(id) ON DELETE SET NULL,
  correo_id     BIGINT      REFERENCES correos_procesados(id) ON DELETE SET NULL,

  -- Para no avisar del mismo vencimiento todos los días.
  avisado_en    TIMESTAMPTZ,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- La misma factura anunciada dos veces es una sola cuenta por pagar.
  hash_dedup    TEXT        NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_cuentas_vencimiento
  ON cuentas_por_pagar (estado, vence_el);
