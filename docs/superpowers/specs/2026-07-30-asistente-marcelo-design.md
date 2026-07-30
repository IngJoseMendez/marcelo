# Mi Segundo Cerebro — Diseño

**Producto:** «Mi Segundo Cerebro» (nombre elegido por el cliente)
**Fecha:** 2026-07-30
**Cliente:** Marcelo (usuario único)
**Origen:** nota de voz de 62 s enviada por el cliente

---

## 1. Origen y transcripción

El cliente envió una nota de voz que arranca a mitad de conversación. Transcrita
localmente con `faster-whisper` (`large-v3-turbo`) tras normalizar volumen con
ffmpeg. Fragmentos clave, textuales:

> "...una parte financiera, que ella misma sea capaz de detectar... son los
> correos que me llegan... que ella misma coja esa información, la transporte,
> la traduzca y la meta en su vaina."

> "Y lo mismo con la agenda. Yo le tengo dicho que todos los miércoles tengo
> clase de 4 a 5, y el profesor nos manda un correo y dice 'no, la clase de hoy
> se cancela'. Que sea capaz de entenderlo... **ella misma cambia la agenda y
> cambia el horario, o lo quita directamente y no tenga que avisarme nada de
> eso**."

Hallazgo medido durante la transcripción, relevante para el diseño: con el
acento costeño del cliente, `whisper-small` produjo salida inservible (3
fragmentos de 62 s), `medium` inventó palabras, y `large-v3-turbo` transcribió
limpio. **La calidad de transcripción no es negociable en este proyecto.**

## 2. Qué se construye

Una asistente personal autónoma que:

1. **Lee el correo de Marcelo** y detecta lo accionable.
2. **Modifica su Google Calendar sola** cuando un correo cancela, mueve o cambia
   un compromiso que ella conoce.
3. **Lleva un libro contable** alimentado de correos bancarios y de pagos, con
   conversión a COP, categorización, cuentas por pagar y alertas de vencimiento.
4. **Recibe órdenes habladas o escritas** por **dos canales equivalentes**:
   Telegram y la propia app. Él le enseña compromisos, consulta, corrige y
   deshace, hablando o escribiendo, desde donde esté.
5. **Rinde cuentas** en un resumen diario y en la app, que muestra la parrilla
   del día y la crónica de todo lo que hizo sola.

## 3. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Alcance | Usuario único (Marcelo) | Evita verificación de Google y auditoría CASA |
| Correo | **Gmail + Outlook, multi-cuenta** | El cliente recibe correo en ambos. Entran como dos adaptadores del mismo puerto `FuenteCorreo` |
| Calendario | Google Calendar (destino único) | Excepciones nativas en series recurrentes: cancelar sólo el miércoles de esta semana sin romper la serie. Un solo calendario evita que agenda y libro se desincronicen |
| Canal de control | Telegram | Sin ventana de 24 h ni plantillas; notas de voz nativas; gratis |
| Autonomía | Graduada + deshacer + resumen diario | Cumple "no me avises" sin dejarlo ciego |
| Arranque | Modo sombra 2 semanas | Medir precisión antes de soltar la correa |
| Finanzas | Libro completo + alertas + cuentas por pagar | Elección explícita del cliente |
| Arquitectura | Núcleo determinista, LLM acotado | Determinismo donde se borra y se cuenta plata |
| Proveedor LLM | **Groq (free tier) con ZDR activado** | No entrena con datos de clientes ni por tier; Zero Data Retention disponible |
| Modelos locales | **Descartados** | 1650 Mobile = 4 GB VRAM → techo ~4B, justo donde falla la extracción |
| Host del servicio | Laptop dedicada de Marcelo | Siempre prendida y sin uso; batería = UPS. Oracle Always Free descartado: reclama instancias con CPU p95 < 20 % en 7 días, que es exactamente nuestro perfil |
| Panel | Next.js en Vercel (PWA) | Móvil, instalable, separado del backend |

**No se reutiliza `angie-secretaria` ni ningún proyecto previo como base.**

## 4. Arquitectura

Dos entradas, un solo motor que muta estado:

```
Gmail ──push (Pub/Sub)──▶ PIPELINE DE CORREO
                          ingesta → clasifica → extrae → resuelve ─┐
                                                                   │
                                                                   ├─▶ POLÍTICA
Telegram ────────────────▶ CANAL DE INSTRUCCIONES                  │   ACTÚA
                          ¿voz? → transcriptor → texto             │   AUDITA
                          texto → intérprete ─────────────────────┘    NOTIFICA
```

Regla estructural: **un solo lugar en todo el sistema muta estado.** Ambas
entradas desembocan en la misma política, el mismo actuador, la misma auditoría
y el mismo deshacer. Sólo difiere la parte de *entender*.

### Principio rector

> **El LLM para entender. El código para decidir y actuar.**

El LLM se usa en exactamente cuatro puntos, todos con entrada y salida tipadas:

| Punto | Trabajo | Salida |
|---|---|---|
| Clasificar | ¿agenda, finanzas o ruido? | enum + confianza |
| Extraer | leer el texto y sacar hechos | objeto validado con Zod |
| Desempatar | elegir entre candidatos concretos | id de la lista + justificación |
| Interpretar | orden hablada → herramienta | llamada a herramienta acotada |

Todo lo demás —deduplicación, resolución de entidades, política de autonomía,
escritura a Calendar, libro contable, auditoría, deshacer— es código puro y
testeable.

### Puertos

| Puerto | Implementación real | Implementación falsa |
|---|---|---|
| `FuenteCorreo` | Gmail API | fixtures JSON |
| `SumideroCalendario` | Google Calendar API | calendario en memoria |
| `LibroContable` | Postgres | en memoria |
| `Notificador` | Telegram | array de mensajes |
| `Transcriptor` | Groq Whisper | texto fijo |
| `ProveedorLLM` | Groq (API compatible con OpenAI) | respuestas guionadas |
| `Reloj` | `Date` real | tiempo congelado |

Tres consecuencias que justifican los puertos:

1. La suite de pruebas corre **sin red**, en segundos.
2. `Reloj` inyectable permite probar *"llega el martes a las 11 pm un correo que
   dice 'la clase de mañana se cancela'"* sin esperar al martes. Sin esto, la
   mitad de los casos de agenda son improbables.
3. **El modo sombra es un cambio de puerto**, no un flujo aparte: se sustituye
   `SumideroCalendario` por uno que sólo graba. Mismo pipeline, misma decisión —
   por eso lo medido en sombra predice el comportamiento real.

### Stack

**Backend:** Node 20 · TypeScript · Fastify · PostgreSQL · Zod · **Luxon** ·
node-cron · pino · `googleapis` · `grammy` (Telegram) · SDK compatible con
OpenAI apuntando a Groq · Docker Compose.

**Panel:** Next.js (App Router) en Vercel · PWA instalable · mobile-first.

Notas no obvias:

- **Luxon con `America/Bogota` en todo el sistema.** "Miércoles de 4 a 5" es hora
  de Bogotá, Google Calendar devuelve UTC, y los correos pueden venir de
  plataformas con horario de verano. Un error de zona horaria en un sistema de
  agenda mueve una clase un día entero.
- **Groq expone API compatible con OpenAI**, así que `ProveedorLLM` funciona con
  cualquier endpoint compatible. Cambiar de proveedor es una variable de entorno.
- Los identificadores de modelo van en configuración
  (`GROQ_MODELO_CLASIFICADOR`, `GROQ_MODELO_EXTRACTOR`,
  `GROQ_MODELO_TRANSCRIPTOR`) y **deben verificarse contra el catálogo vigente de
  Groq el primer día**, no darse por sentados.

## 5. Modelo de datos

```
compromisos            id · titulo · alias[] · rrule · hora_inicio · hora_fin
                       tz · google_calendar_id · google_event_id
                       remitentes_vinculados[] · activo

correos_procesados     message_id UNIQUE · thread_id · remitente · asunto
                       recibido_en · clasificacion · estado · procesado_en

acciones               id · tipo · origen(correo|voz|texto) · correo_id
                       confianza · objetivo · payload_aplicado
                       payload_inverso · estado(aplicada|deshecha|sombra|
                       pendiente) · creada_en · deshecha_en

movimientos            id · fecha · tipo(ingreso|egreso) · monto · moneda
                       monto_cop · trm · contraparte · concepto · categoria
                       correo_id · hash_dedup UNIQUE · estado

cuentas_por_pagar      id · acreedor · monto · moneda · vence_el · estado
                       movimiento_id · avisado_en · correo_id

reglas                 id · tipo · patron · accion · creada_por · creada_en

pendientes_resumen     id · texto · prioridad · enviado_en

cuentas_correo         proveedor(gmail|outlook) · direccion · activa
                       credenciales cifradas

sync_cuenta            cuenta_id · cursor · suscripcion_vence_en
                       ultimo_latido
                       (cursor = historyId en Gmail, deltaLink en Outlook)
```

### Multi-proveedor de correo

Las dos fuentes producen el **mismo** `CorreoCrudo` y de ahí en adelante el
pipeline no sabe ni le importa de dónde vino. Lo que sí difiere y queda dentro
de cada adaptador:

| | Gmail | Outlook (Microsoft Graph) |
|---|---|---|
| Aviso de correo nuevo | `watch()` → Pub/Sub | subscription → webhook |
| Caducidad de la suscripción | 7 días | ~3 días (renovación más frecuente) |
| Cursor incremental | `historyId` | `deltaLink` |
| Prefiltro sin costo | categorías `CATEGORY_PROMOTIONS` / `CATEGORY_SOCIAL` | carpeta y `inferenceClassification: other` |

El prefiltro se define **por adaptador** porque cada proveedor clasifica el ruido
a su manera; el resto del pipeline es idéntico. Añadir un tercer proveedor
después es escribir un adaptador, nada más.

## 6. Pipeline de correo

1. **Prefiltro sin costo.** Categorías nativas de Gmail
   (`CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`), lista de remitentes conocidos y
   reglas del usuario. Elimina ~80 % del volumen sin gastar un token.
2. **Ingesta.** Deduplicación por `message_id`, normalización de texto.
3. **Clasificar.** Modelo barato → `agenda | finanzas | ruido` + confianza.
4. **Extraer.** Modelo bueno + esquema Zod → hechos tipados. **El modelo nunca
   calcula fechas**: devuelve el referente en crudo (`"hoy"`,
   `"próximo miércoles"`, `"el 6"`) y Luxon lo resuelve contra la fecha real de
   Bogotá. Esto le quita al modelo justo lo que peor hace y baja el listón de
   calidad requerido.
5. **Resolver.** Cascada determinista (sección 8).
6. **Política.** Tabla de decisión (sección 9).
7. **Actuar.** Google Calendar / libro contable.
8. **Auditar.** Acción + operación inversa.
9. **Notificar.** Inmediato o al resumen de las 21:00.

## 7. Canal de instrucciones por voz

Telegram por **long polling** — no requiere IP pública ni puertos abiertos.

Audio recibido → descarga → normalización de volumen (las notas de voz llegan
bajas y eso degrada la transcripción; verificado con el audio real del cliente)
→ `Transcriptor` → texto → intérprete.

El intérprete mapea a **herramientas acotadas**, nunca a acciones libres:

`enseñar_compromiso` · `consultar_agenda` · `consultar_finanzas` ·
`crear_recordatorio` · `corregir` · `deshacer` · `crear_regla` ·
`ignorar_remitente`

### Dos reglas que la voz obliga

**El origen decide la desconfianza.** Un correo es input no confiable y pasa por
el filtro de confianza. Una orden escrita por Marcelo es confiable.

**Pero una voz transcrita no es texto confiable.** Si *"cancela la clase de
mañana"* se transcribe como *"cancela la clase de semana"*, hay una acción
destructiva sobre input corrupto. Por eso: **toda acción destructiva originada en
voz confirma**, devolviendo lo entendido:

```
Entendí: cancelar «Reunión con Andrés»
         viernes 8 ago · 3:00 pm
         [ Confirmar ]   [ No, esa no ]
```

Un toque, y de paso él verifica la transcripción. Enseñar un compromiso o
consultar no confirma: actúa y muestra qué entendió.

**Audios malos o divagantes.** El transcriptor devuelve confianza por segmento.
Con confianza baja, la asistente pregunta en vez de adivinar. Si de una nota
salen una instrucción clara y dos vagas, **ejecuta la clara y repregunta sólo por
las vagas** — no descarta el audio entero ni rellena lo que faltó.

## 8. Resolución de entidades

El problema central: llega *"la clase de hoy se cancela"* — ¿a cuál de sus
eventos apunta?

Cuatro señales con peso, **todas calculadas en código**:

| Señal | Ejemplo |
|---|---|
| Remitente vinculado | viene del prof. Ramírez → apunta a Cálculo (peso alto) |
| Ventana temporal | referente `"hoy"` → Luxon lo vuelve rango en Bogotá → qué instancias caen ahí |
| Alias en el texto | "cálculo", "clase", nombre del profesor en asunto o cuerpo |
| Hilo | respuesta de un hilo ya resuelto → mismo compromiso |

Resultado:

```
1 candidato, puntaje alto   → resuelto             → actúa callada
1 candidato, puntaje medio  → resuelto con dudas   → actúa + avisa
2+ empatados                → desempate por LLM
0 candidatos                → pregunta
```

### Garantía estructural

En el desempate **el LLM nunca genera un identificador**: recibe 2 o 3
candidatos concretos y devuelve cuál de ésos. Si responde algo fuera de la lista,
la respuesta se descarta y se pregunta.

Esto convierte una alucinación en una pregunta, jamás en un borrado. Es
**imposible que elimine un evento que no estaba entre los candidatos** — no
porque el modelo sea bueno, sino porque el código no le da la opción.

## 9. Política de autonomía

Entra `{origen, tipo, confianza, reversible}` y sale una decisión. Código puro:

| Origen | Confianza | Acción | Decisión |
|---|---|---|---|
| correo | alta | cancelar/mover **una instancia** | actúa callada → al resumen |
| correo | alta | borrar **la serie completa** | actúa + avisa (destructivo) |
| correo | media | cualquiera | actúa + avisa |
| correo | baja | cualquiera | pregunta |
| correo | — | registrar movimiento | registra callada (es lectura) |
| voz | — | destructiva | confirma |
| voz | — | no destructiva | actúa + eco de lo entendido |
| texto | — | cualquiera | actúa |

Las reglas dictadas por el usuario tienen precedencia: *"de Bancolombia no me
avises"* → registra igual, pero calla.

## 10. Deshacer y auditoría

La operación inversa se guarda **antes** de aplicar la acción:

| Acción | Inversa almacenada |
|---|---|
| cancelar instancia | el evento completo → recrear |
| mover evento | la hora anterior |
| borrar serie | la serie entera con su RRULE |
| registrar movimiento | el id → se **anula**, no se borra |

La auditoría es **append-only**: deshacer no borra el registro, agrega uno nuevo.
Siempre queda el rastro de qué pasó, por cuál correo y con qué confianza.

Vías: botón en Telegram (persiste, es un mensaje), `/deshacer` para la última,
`/deshacer <id>` para una específica, o hablado.

## 11. Resumen diario (21:00)

```
🌙  Hoy hice esto por ti:

📅  Cancelé «Cálculo» del miércoles 6
    correo del prof. Ramírez · 2:14 pm

💰  3 movimientos  +$1.240.000  −$89.900  −$45.000

⏰  Vence en 2 días: arriendo $1.800.000

    [ Ver detalle ]   [ Deshacer algo ]
```

**Si no hizo nada, no manda nada.** Una asistente que escribe a diario "no pasó
nada" se vuelve ruido en una semana.

## 12. Modo sombra

Semanas 1–2: `SumideroCalendario` se sustituye por `SumideroSombra`. Todo corre
idéntico, pero en vez de tocar el calendario graba `estado='sombra'`. El resumen
cambia de tono a *"esto es lo que habría hecho hoy"* y Marcelo marca ✓ o ✗.

**Criterio de graduación: ≥ 95 % de aciertos en agenda durante 5 días
consecutivos.** Un número, no una sensación.

Los ✓/✗ se convierten en el corpus de pruebas de regresión: las dos semanas de
sombra producen el dataset.

## 13. Módulo financiero

El eje es simple: **entra plata a sus cuentas y sale plata.** Extrae de correos
bancarios y de pagos el monto, la fecha, la contraparte y el concepto, lo
categoriza y lo registra. Nada de suponer que el dinero viene del exterior.

**Moneda extranjera: caso borde, no el eje.** Si llega un movimiento en otra
moneda se convierte a COP con la TRM del día de la transacción (fuente pública
consultada a diario y cacheada por fecha; si no responde, se usa la última
conocida y el movimiento queda marcado como TRM aproximada). Se implementa
**después** del flujo en pesos, no antes. *El endpoint concreto de TRM se
verifica cuando toque ese caso.*

Detecta facturas con fecha límite → `cuentas_por_pagar` → alerta antes del
vencimiento. Señala cobros duplicados y cargos atípicos.

**La asistente nunca mueve dinero. Sólo lee y registra.** Riesgo cero por
diseño.

### Deduplicación

`hash_dedup = hash(fecha + monto + moneda + contraparte normalizada)` con
constraint UNIQUE.

El banco reenvía el mismo aviso, Marcelo lo reenvía, o la recuperación tras un
apagón reprocesa un rango. Sin ese hash el libro cuenta dos veces el mismo
ingreso y **queda mintiendo en silencio**, que es la peor forma de fallar en
contabilidad.

## 14. La app «Mi Segundo Cerebro»

**Next.js en Vercel, PWA instalable, mobile-first.**

No es un panel de solo lectura: es el **segundo canal de conversación**, con las
mismas capacidades que Telegram. Desde la app él puede **hablarle o escribirle**
para pedirle cualquier cosa.

### El canal de instrucciones es agnóstico al medio

Telegram y la app son dos entradas del **mismo** intérprete:

```
Telegram (voz | texto) ─┐
                        ├─▶ Transcriptor ─▶ Intérprete ─▶ POLÍTICA ─▶ ACTÚA
App     (voz | texto) ──┘                                             AUDITA
```

Una instrucción lleva `{canal: 'telegram'|'web', origen: 'voz'|'texto'}`. El
`canal` sólo decide por dónde vuelve la respuesta; el `origen` es lo que decide
la desconfianza — y por tanto **el audio grabado en la app confirma las acciones
destructivas exactamente igual que el de Telegram**. La transcripción puede
mentir venga de donde venga.

Consecuencia práctica: una vez existe el canal de Telegram, el de la app es casi
gratis. Comparten transcriptor, intérprete, política, actuador y auditoría.

**Grabación en el navegador:** `MediaRecorder` produce webm/opus, que va por el
BFF al mismo transcriptor. Mientras graba, la app muestra el nivel de audio en
vivo; al soltar, muestra la transcripción **antes** de ejecutar, para que él vea
qué entendió.

### Arquitectura

```
📱 App (Next.js en Vercel)
      │  route handlers = BFF — el token de servicio nunca llega al navegador
      ▼
🔒 Cloudflare Tunnel   ← el mismo que ya se necesita para el push de Gmail
      ▼
💻 Laptop de Marcelo: API Fastify + Postgres
```

**Autenticación: código de un solo uso enviado por el bot de Telegram.** Sin
contraseñas, sin OAuth, sin tabla de usuarios. Está autenticado por poseer el
teléfono. Sesión en cookie `httpOnly` firmada. La app muestra movimientos
bancarios: una URL secreta no es autenticación.

### Pantallas

| Pantalla | Contenido |
|---|---|
| **Jornada** | el día en dos vistas conmutables: **lista** (densa, para leer rápido) y **agenda** (rejilla horaria tipo Google Calendar, para ver dónde hay hueco) |
| **Bandeja** | lo que hay por hacer, con prioridad y duración, listo para caer en un hueco |
| **Crónica** | log de auditoría: cada acción autónoma con su correo origen, confianza y botón deshacer |
| **Tesoro** | balance del mes, gráfica, movimientos, cuentas por pagar y vencimientos |
| **Compromisos** | lo que le ha enseñado, editable |
| **Hablar** | presente en todas: botón de voz y campo de texto siempre a mano |

La **Crónica** es la contraparte visible de la autonomía: convierte "me da miedo
darle permisos" en "ya veo qué hizo y por qué".

Con el backend caído, la app muestra **"sin conexión desde las 14:20"**, no un
spinner eterno.

### Vista de agenda: la rejilla horaria

La lista es buena para leer el día; es **ciega al espacio vacío**. Un hueco de
dos horas entre clases no se ve en una lista, pero salta a la vista en una
rejilla. Por eso la Jornada tiene dos vistas conmutables sobre los mismos datos:

- **Lista** — densa, cronológica, para revisar rápido en el bus.
- **Agenda** — rejilla tipo Google Calendar: horas a la izquierda, cada evento
  como un bloque cuya **altura es su duración**, solapes en columnas paralelas,
  línea de «ahora» cruzando, y los huecos libres explícitamente visibles.

La regla de color se mantiene en las dos: lo que la asistente tocó va iluminado,
lo de Marcelo es mate.

**Por qué importa aquí:** la rejilla es donde aterriza la bandeja. Ver el hueco
y ver lo que cabe en él es la misma operación.

## 15. Bandeja de intenciones

Una **intención** es algo que Marcelo tiene que hacer pero que todavía no está
en el calendario: un taller para entregar, un correo por responder, estudiar
para el parcial. Nace de tres sitios: la asistente la detecta en un correo, él
la dicta por voz, o la escribe.

Cada intención lleva:

| Campo | Para qué |
|---|---|
| **Prioridad** | `urgente · alta · normal · baja` |
| **Duración estimada** | en bloques de 15, 30, 60 o 120 minutos |
| **Vence el** | fecha límite, si la tiene |
| **Estado** | `pendiente · agendada · hecha · descartada` |

**Duración en bloques, no en minutos sueltos.** Nadie sabe si algo toma 37 o 43
minutos, y pedir precisión falsa hace que el usuario deje de estimar. Cuatro
bloques bastan para decidir si algo cabe en un hueco.

**La prioridad la calcula el código, no el modelo.** El LLM propone una base a
partir del texto, pero la fecha límite manda: algo que vence mañana es urgente
aunque el correo suene tranquilo. Es la misma disciplina del resto del sistema —
el modelo lee, el código decide.

### Agendar es una acción como cualquier otra

Meter una intención en un hueco **crea un evento en el calendario**, así que pasa
por el mismo camino que todo lo demás: política de autonomía, auditoría con su
inversa, y deshacer. Una intención agendada por error se revierte igual que una
clase cancelada por error, y el evento se borra al deshacer.

La asistente puede **proponer** el hueco —«tienes dos horas libres el jueves,
¿meto ahí el estudio del parcial?»— pero eso es una acción de calendario y la
política decide si la hace callada, avisando o preguntando. No hay una segunda
vía de escritura: si la hubiera, agenda y auditoría se desincronizarían.

### Dirección estética: «Luminoso»

Se exploraron tres direcciones en paralelo (clara y aireada; oscura acristalada;
táctil y con color saturado) y el cliente eligió la primera. *Una propuesta
previa con estética Dark Souls fue rechazada por completo: no se ve moderna.*

Claro, aireado y suave, con el tema oscuro trabajado con el mismo cuidado. Aire
generoso, sombras grandes y difusas en vez de bordes duros, esquinas redondeadas,
jerarquía por tamaño y peso en vez de por ornamento.

**La firma: la luz de ella.** Todo lo que la asistente toca queda *iluminado* —
hilo encendido, halo de color, nodo lleno. Lo que puso Marcelo es mate. De ahí
sale la regla que ordena toda la paleta:

> **El acento nunca significa otra cosa.** El violeta marca la mano de la
> asistente y nada más. Verde, rojo y ámbar son semánticos y viven aparte.

Así sobrevive la idea central del producto —distinguir de un vistazo lo que ella
tocó— sin depender de ninguna estética en particular.

**Paleta** (tokens CSS con mapeo por tema; el conmutador gana sobre el sistema en
ambos sentidos, verificado):

| Rol | Claro | Oscuro |
|---|---|---|
| Lienzo | `#F5F5FA` | `#0C0B15` |
| Papel | `#FFFFFF` | `#17162B` |
| Tinta | `#16142A` | `#F2F1F9` |
| **Lumen** (la mano de ella) | `#5B3DF6` | `#9C8BFF` |
| Lumen secundario | `#2FC9DE` | `#5FE1F0` |
| Positivo · negativo · aviso | `#0E9A6C` · `#D93B50` · `#A96A08` | `#40D69A` · `#FF7086` · `#F0B355` |

**Tipografía:** pila del sistema (`Segoe UI Variable Display/Text`, `SF Pro`,
`system-ui`) más una mono para horas y montos. Sin webfonts enlazadas: la CSP de
la plataforma las bloquea y fallan en silencio.

**Movimiento:** contexto de app móvil, así que manda el pulido de producción y
en segundo lugar la contención. Resortes con curva `linear()`, entradas
escalonadas cortas, y `prefers-reduced-motion` respetado en todo. Nada se anima
por adorno.

Vocabulario de la interfaz:

| Concepto | Nombre en la app |
|---|---|
| Agenda del día | **Jornada** |
| Registro de acciones autónomas | **Crónica** |
| Finanzas | **Tesoro** |
| Compromisos recurrentes | **Pactos** |
| Hablarle a la asistente | **Invocar** |

```
📱 Vercel (Next.js)
      │  route handlers = BFF — el token de servicio nunca llega al navegador
      ▼
🔒 Cloudflare Tunnel   ← el mismo que ya se necesita para el push de Gmail
      ▼
💻 Laptop de Marcelo: API Fastify + Postgres
```

**Autenticación: código de un solo uso enviado por el bot de Telegram.** Sin
contraseñas, sin OAuth, sin tabla de usuarios. Está autenticado por poseer el
teléfono. Sesión en cookie `httpOnly` firmada. El panel muestra movimientos
bancarios: una URL secreta no es autenticación.

**Pantallas:**

| Pantalla | Contenido |
|---|---|
| Hoy | lo que hizo hoy · próximos eventos · alertas |
| Finanzas | balance del mes · gráfica · movimientos · cuentas por pagar |
| Agenda | compromisos enseñados · semana |
| **Actividad** | log de auditoría: cada acción autónoma con su correo origen, confianza y botón deshacer |

La pantalla de Actividad es la que convierte "me da miedo darle permisos" en
"ya veo qué hizo". Es la contraparte visible de la autonomía.

Con el backend caído, el panel muestra **"asistente sin conexión desde las
14:20"**, no un spinner eterno.

## 15. Despliegue

Docker Compose en la laptop dedicada de Marcelo (siempre encendida, sin uso
personal).

| Riesgo | Mitigación |
|---|---|
| Sin IP pública para el push de Gmail | Cloudflare Tunnel (sólo salida, HTTPS real, sin abrir puertos) |
| Administración sin depender de Marcelo | Tailscale como servicio → SSH/RDP desde cualquier parte |
| Reinicios por Windows Update | `restart: unless-stopped` + arranque automático |
| Caída de internet doméstico | recuperación por `historyId` al reconectar |
| Muerte de la laptop | `pg_dump` cifrado cada noche fuera del equipo |
| Batería enchufada 24/7 durante años | limitar carga al 60–80 % si el fabricante lo permite |
| Servicio muerto sin que nadie lo note | **watchdog**: latido cada 5 min; si falta, alerta a Jose por Telegram |

Como todo va en Compose con respaldo nocturno, **el host no es una apuesta
permanente**: si la laptop muere, el mismo compose levanta en un VPS en minutos.

## 16. Manejo de fallos

| Fallo | Manejo |
|---|---|
| El `watch` de Gmail expira a los 7 días | cron diario de renovación |
| `historyId` caducado (apagón > 7 días) | resync completo de las últimas 72 h |
| Pub/Sub reintenta el mismo mensaje | idempotencia por `message_id` |
| El LLM devuelve JSON inválido | 3 reintentos con backoff → cola de muertos + alerta |
| El LLM inventa un id fuera de los candidatos | se descarta → pregunta |
| Google API 429/403 | backoff exponencial |
| Groq sin cuota | cambio de proveedor por configuración; si no, se encola |
| Laptop apagada | recuperación al arrancar |
| Acción equivocada aplicada | deshacer con la inversa |

**Ningún correo se pierde:** la cola vive en Postgres, no en memoria. Si el
proceso muere a media tanda, al reiniciar retoma donde iba.

## 17. Estrategia de pruebas

Toda la suite corre con puertos falsos y reloj congelado: sin red, en segundos.

| Nivel | Qué verifica |
|---|---|
| Extracción | correo → hechos esperados |
| Resolución | los casos tramposos (abajo) |
| Política | la tabla de decisión completa |
| Deshacer | aplicar → revertir → estado idéntico al original |
| Deduplicación | el mismo correo 3 veces → 1 movimiento |
| Recuperación | apagón simulado → no se pierde ni se duplica nada |

**Casos tramposos obligatorios:**

- *"la clase de la próxima semana se cancela"* enviado un martes
- *"se cancela la de mañana"* llegando a las 11 pm
- dos clases el mismo día con el mismo profesor
- correo reenviado por Marcelo (no debe contar doble)
- correo que menciona dinero pero no es una transacción

Prueba de aceptación en producción: **el modo sombra**.

## 18. Fuera de alcance (fase 1)

- Que la asistente responda con voz (fácil de agregar después)
- Multi-usuario / multi-tenant
- Mover dinero, pagar facturas, cualquier acción financiera de escritura
- Integración con WhatsApp
- Modelos locales

## 19. Riesgos abiertos

1. **La transcripción del audio original tiene tramos confusos en la zona
   financiera.** La interpretación (correos bancarios y de pagos → libro) se
   validó con el desarrollador, no con el cliente. Conviene confirmarla con
   Marcelo antes de cerrar el módulo financiero.
2. **Identificadores de modelo de Groq**: verificar el catálogo vigente el primer
   día en vez de asumirlos.
3. **Endpoint de TRM**: verificar la fuente pública antes de implementarla.
4. **Cuotas del free tier de Groq**: el volumen estimado (~30 llamadas diarias
   tras el prefiltro) cabe con holgura, pero conviene medirlo en la primera
   semana.
