# Mi Segundo Cerebro

Una asistente personal que **lee el correo de Marcelo y le mueve el calendario
sola**. Cuando el profesor escribe «la clase de hoy se cancela», ella lo entiende,
lo quita del calendario, y se lo cuenta a las nueve de la noche.

También recibe órdenes habladas o escritas por Telegram y por su propia app, lleva
la cuenta de lo que hace, y deshace cualquier cosa con un botón.

> **Principio rector:** el modelo para entender, el código para decidir y actuar.

---

## Arrancar

```
Doble clic en ARRANCAR.cmd
```

Eso es todo. Si no hay Node, lo instala. Si faltan dependencias, las pone. Y si
falta configuración, abre un **asistente guiado** en `http://localhost:3210` y te
dice a qué dirección ir.

El asistente hace el resto, sin abrir una sola terminal:

| Bloque | Qué hace |
|---|---|
| **Requisitos** | Mira si tienes Docker, cloudflared, ffmpeg y git. Lo que falte, te lo instala con un botón |
| **Que no se duerma** | Apaga la suspensión, deja cerrar la tapa, y la registra para que arranque con Windows |
| **Base de datos** | Abre Docker Desktop y levanta Postgres él mismo |
| **El cerebro** | Eliges proveedor de IA, pega la clave, y **él pregunta qué modelos hay hoy y elige** |
| **Google / Outlook** | Botón «Conectar»: el permiso vuelve a `localhost` y guarda el token solo |
| **Telegram** | Le escribes «hola» al bot y **captura tu número de chat solo** |
| **Túnel** | Levanta `cloudflared` y se queda con la dirección pública |
| **La app** | Genera los secretos y **se los escribe a Vercel por su API**, más el redespliegue |

Para reabrirlo después: `npm run configurar`.

> El asistente **sólo escucha en `127.0.0.1`**, y eso es toda su autenticación.
> Recoge el secreto de cliente de Google y el token del bot: expuesto a internet
> sería una cosechadora de credenciales. Por eso no puede vivir en Vercel ni
> colgar del túnel.

Guía manual, por si quieres entender qué pasa por debajo:
[`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).

---

## Actualizar

Cuando publiques algo nuevo, Marcelo abre el asistente y le da a **Buscar y
traer**. Hace `git pull --ff-only`, pone las dependencias nuevas, corre las
pruebas y se reinicia sola. No necesita saber qué es git ni abrir una terminal.

**No se pierde nada, y no es casualidad:**

| | Dónde vive | Qué le hace una actualización |
|---|---|---|
| Configuración (`.env`) | archivo fuera de git | nada: `pull` ni lo mira |
| Datos | volumen de Docker, fuera del proyecto | nada |
| Esquema de la base | migraciones | se aplican solas al arrancar |
| Código | git | eso es lo único que cambia |

Se usa `--ff-only` a propósito: si hubiera cambios locales, el tirón falla y lo
dice, en vez de abrir un conflicto de merge en la máquina de alguien que no
sabría qué hacer con él.

---

## Cómo funciona

Dos entradas, **un solo lugar que muta estado**:

```
Gmail ──push──┐
Outlook ──────┤──▶ PIPELINE DE CORREO ──┐
                                         │
Telegram ─────┐                          ├──▶ POLÍTICA ──▶ ACTUADOR ──▶ AUDITORÍA ──▶ NOTIFICA
App ──────────┴──▶ INTÉRPRETE ──────────┘
```

Ambas entradas desembocan en la misma política, el mismo actuador, la misma
auditoría y el mismo deshacer. Sólo difiere la parte de *entender*. Si hubiera una
segunda vía de escritura, agenda y auditoría acabarían contando historias
distintas.

### El LLM se usa en cuatro puntos, y en ninguno decide

| Punto | Trabajo | Devuelve |
|---|---|---|
| Clasificar | ¿agenda, finanzas o ruido? | enum + confianza |
| Extraer | leer el texto y sacar hechos | objeto validado con Zod |
| Desempatar | elegir entre candidatos concretos | un id **de la lista** |
| Interpretar | orden hablada → herramienta | llamada acotada |

Dos garantías que no dependen de que el modelo sea bueno:

- **No calcula fechas.** Devuelve el referente en crudo (`"hoy"`, `"el miércoles"`)
  y Luxon lo resuelve contra la hora real de Bogotá.
- **No genera identificadores.** Dice a qué se refiere con palabras («el
  gimnasio»); qué evento es eso lo decide el resolutor. En un empate elige entre
  2 o 3 candidatos concretos, y si responde algo fuera de la lista se descarta.

Es **imposible que borre un evento que no estaba entre los candidatos** — no porque
el modelo acierte, sino porque el código no le da la opción. Una alucinación se
convierte en una pregunta, jamás en un borrado.

### Puertos

| Puerto | Real | Falso |
|---|---|---|
| `FuenteCorreo` | Gmail · Microsoft Graph | fixtures |
| `SumideroCalendario` | Google Calendar | calendario en memoria |
| `Notificador` | Telegram | arreglo de mensajes |
| `Transcriptor` | Whisper | texto fijo |
| `ProveedorLLM` | cualquiera compatible con OpenAI | respuestas guionadas |
| `Reloj` | `Date` | tiempo congelado |

Tres consecuencias que justifican el trabajo:

1. La suite corre **sin red**, en segundos.
2. Se puede probar *«llega el martes a las 11 pm un correo que dice que la clase
   de mañana se cancela»* **sin esperar al martes**.
3. **El modo sombra es un cambio de puerto**, no un flujo aparte — por eso lo que
   mide en sombra predice el comportamiento real.

### Lo que nunca cambia

- **La inversa se guarda ANTES de aplicar.** Nunca existe un instante en que algo
  pasó y nadie sepa deshacerlo.
- **La auditoría es append-only.** Deshacer no borra: agrega.
- **La voz confirma lo destructivo.** Si «cancela la de mañana» se transcribe como
  «de semana», hay una acción destructiva sobre texto corrupto. Por eso devuelve
  lo entendido con dos botones.

---

## Elegir la IA

Sirve **cualquier proveedor que hable la API de OpenAI**, que a estas alturas son
casi todos. Se elige en un desplegable del asistente:

| Proveedor | Precio | ¿Oye? | Nota |
|---|---|---|---|
| **Groq** | gratis, con límites | sí | Lo que trae puesto. Rápido, y el único gratis con Whisper grande |
| **OpenAI** | de pago | sí | Con este volumen, pocos dólares al mes |
| **OpenRouter** | gratis, con límites | no | Una clave para modelos de casi todos, incluidos los `:free`. **La salida si Groq no te deja entrar** |
| **Cloudflare Workers AI** | gratis, con límites | sí | Ya tienes cuenta por el túnel. Trae Whisper. No publica catálogo, así que se verifica hablándole |
| **Hugging Face** | gratis, con límites | no | Se entra con correo y contraseña, sin Google ni GitHub |
| **Google Gemini** | gratis, con límites | no | Capa gratuita generosa — pero en el plan gratis Google puede entrenar con lo que le mandes |
| **DeepSeek** | de pago | no | Barato. Servidores en China |
| **Cerebras** | gratis, con límites | no | Muy rápido, catálogo corto |
| **Ollama / LM Studio** | en tu máquina | no | No sale nada de casa. Con 4 GB de vídeo el techo son modelos de ~4B, justo donde la extracción inventa |
| **Otro** | — | — | Pega la dirección base y la clave |

**No escribes ningún nombre de modelo.** El asistente le pregunta al proveedor qué
tiene *hoy* y elige: uno barato para clasificar, uno bueno para leer. Si mañana
retiran el que usábamos, coge el siguiente en vez de quedarse apuntando a un
nombre muerto.

**El oído puede ir aparte.** Hay servicios buenísimos leyendo que no transcriben;
antes que dejarla muda, se le deja el oído en Groq. Con el acento costeño del
cliente esto no es un detalle: está medido con su audio real, y un modelo pequeño
produjo salida inservible.

```bash
LLM_PROVEEDOR=openrouter
LLM_API_KEY=sk-or-...
LLM_BASE_URL=https://openrouter.ai/api/v1

VOZ_BASE_URL=https://api.groq.com/openai/v1   # el oído, aparte
VOZ_API_KEY=gsk_...
```

Los nombres `GROQ_*` de antes se siguen leyendo como respaldo: un `.env` viejo
arranca igual.

---

## Usarla

### Por Telegram

Háblale o escríbele. Una nota de voz vale igual que un mensaje.

```
«cancélame el gimnasio del viernes»
«los martes tengo laboratorio de 10 a 12 con la profe Cardona»
«anótame estudiar para el parcial, dos horas»
«¿qué me queda hoy?»
«de Bancolombia no me avises»
```

| Comando | Qué hace |
|---|---|
| `/hoy` | Lo que ha hecho hoy por su cuenta |
| `/deshacer` | Devuelve lo último como estaba |
| `/deshacer 42` | Deshace esa acción |
| `/ayuda` | Lo que sabe hacer |

Lo que **toca algo que ya existe** te lo confirma primero, con dos botones. Un
toque, y de paso verificas la transcripción.

### Por la app

Las mismas capacidades, desde el teléfono o el computador.

| Pantalla | Qué es |
|---|---|
| **Jornada** | El día, en lista o en rejilla horaria |
| **Bandeja** | Lo que hay por hacer, listo para caer en un hueco |
| **Crónica** | Cada acción con su correo origen, su confianza y su botón de deshacer |
| **Tesoro** | Saldo del mes, qué hay por pagar, en qué se fue la plata y cada movimiento |
| **Pactos** | Los compromisos que le has enseñado |
| **Invocar** | Botón de voz y campo de texto, siempre a mano |

Lo que ella tocó va **iluminado en violeta**; lo que pusiste tú es mate. El acento
no significa otra cosa nunca.

### El resumen de las 21:00

Sólo si hizo algo. **Si no hizo nada, no manda nada** — una asistente que escribe a
diario «hoy no pasó nada» se vuelve ruido en una semana.

---

## Modo sombra

Arranca en `MODO_SOMBRA=true` y **así se queda**. Todo corre idéntico, pero en vez
de tocar el calendario graba `estado='sombra'` y el resumen cambia de tono a «esto
es lo que habría hecho hoy».

**Criterio para soltarle la correa: ≥95 % de aciertos durante 5 días consecutivos.**
Un número, no una sensación. Entonces —y sólo entonces— `MODO_SOMBRA=false`.

---

## Respaldo

Cada noche a las 3:40: `pg_dump` → gzip → **AES-256-GCM** → se manda por Telegram.

Sale por ahí porque es el único canal fuera de la laptop que ya existe: sin cuenta
nueva, sin credenciales nuevas, sin factura. Va cifrado porque un chat de bot no es
privado y ahí dentro está la agenda entera.

```bash
npm run respaldo:abrir -- respaldos/respaldo-2026-08-07-0340.sql.gz.enc
docker compose exec -T db psql -U asistente -d asistente < respaldo.sql
```

> **`RESPALDO_CLAVE` tiene que vivir fuera de la laptop.** Si el disco muere y la
> clave se fue con él, el respaldo cifrado no sirve de nada. Y **prueba a abrirlo
> el día que lo configuras**, no el día que lo necesitas.

---

## Advertencias de servidor

Esta laptop pasa a ser un servidor. No es una forma de hablar.

**No se puede** — apagarla · cerrar la ventana negra · usarla como computador
personal · y **nunca `docker compose down -v`**: esa `-v` borra la base de datos
entera. Sin ella el comando es inofensivo.

**Sí puede pasar sin drama** — bloquear la pantalla (bloquear no mata procesos) ·
cerrar la tapa · que se vaya la luz (la batería es su UPS) · que se caiga el
internet (al volver se pone al día sin duplicar) · que Windows se reinicie de
madrugada.

**Mirar de vez en cuando** — que el respaldo llegue por Telegram · que la batería
no viva al 100 % durante años · y que la máquina respire, no cerrada encima de una
cama.

---

## Desarrollo

```bash
npm install
npm test          # 410 pruebas, sin red, en segundos
npm run typecheck
npm run dev       # con recarga

cd web
npm install
node scripts/api-de-prueba.mjs   # una asistente de mentira en :4000
npm run dev                      # la app en :3000
```

### Estructura

```
src/
  dominio/      código puro: política, resolutor, fechas, inversas, cifrado
  puertos/      las interfaces: calendario, LLM, transcriptor, notificador, reloj
  adaptadores/  las implementaciones reales: Gmail, Graph, Calendar, Groq, Telegram
  pipeline/     correo → clasificar → extraer → resolver → actuar
  servicios/    jornada, crónica, deshacer, instrucción, conversación, resumen, respaldo
  repos/        acceso a Postgres
  configuracion/ el asistente guiado
  http/         la API que consume la app
web/            la app Next.js (Vercel)
docs/           el spec de diseño y la guía de despliegue
```

### Reglas de la casa

- **Nombres de dominio en español.** El código habla el idioma del problema.
- **Toda la suite sin red**, con puertos falsos y reloj congelado.
- **La inversa antes de aplicar.** Auditoría append-only.
- **El LLM no calcula fechas ni genera identificadores.**
- Los comentarios explican **por qué**, no qué. Si algo es obvio leyendo el
  código, no lleva comentario.

El contrato está en
[`docs/superpowers/specs/2026-07-30-asistente-marcelo-design.md`](docs/superpowers/specs/2026-07-30-asistente-marcelo-design.md).
**Si algo choca con el spec, manda el spec.**

---

## Fuera de alcance (fase 1)

Que responda con voz · multi-usuario · mover dinero o pagar facturas · WhatsApp.
