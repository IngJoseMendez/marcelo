# web/ — la app «Mi Segundo Cerebro»

Next.js (App Router) en Vercel. PWA instalable, mobile-first, dirección
**«Luminoso»**. Es el segundo canal de la asistente: lo mismo que cuenta por
Telegram, pero mirable.

> Sustituye al prototipo estático que vivía aquí. El original queda en
> `docs/prototipo/v2/a-luminoso.html` como referencia de diseño.

## Las cinco pantallas

| Pantalla | Qué muestra |
|---|---|
| **Jornada** | el día en dos vistas conmutables: **lista** (densa, para leer rápido) y **agenda** (rejilla horaria, para ver dónde hay hueco) |
| **Bandeja** | lo que hay por hacer, con prioridad y duración, y los huecos de hoy para meterlo |
| **Crónica** | cada acción autónoma con su correo origen, su certeza y el botón de deshacer |
| **Tesoro** | reservado al libro contable, que entra con el módulo financiero |
| **Pactos** | los compromisos que le enseñó, y a qué remitente escucha cada uno |

La regla de color se sostiene en todas: **lo que tocó la asistente va
iluminado; lo tuyo es mate.** El violeta no significa ninguna otra cosa — ni
«seleccionado», ni «libre», ni «importante».

## La rejilla de agenda

Una lista es ciega al espacio vacío: un hueco de dos horas entre clases no se
ve. En la rejilla la altura de cada bloque es su duración, los solapes se
reparten en columnas, la línea de «ahora» cruza el día y el tiempo libre está
dibujado. Tocar un hueco lleva a la Bandeja con ese hueco ya elegido: ver el
hueco y ver qué cabe en él es la misma operación.

La aritmética vive aparte del dibujo, en `lib/rejilla.ts`, y se prueba desde la
suite de la raíz (`npm test` en el directorio padre) sin navegador.

## Arquitectura

```
navegador ──▶ Next.js en Vercel ──▶ Cloudflare Tunnel ──▶ Fastify + Postgres
              (route handlers = BFF)                        en la laptop
```

- Las pantallas son componentes de servidor: piden los datos con `lib/api.ts`,
  que añade el `API_TOKEN`. **Ese token nunca llega al navegador** — `lib/api.ts`
  importa `server-only`, así que si alguien lo usara desde un componente de
  cliente, el build falla.
- Lo que muta algo (deshacer, agendar, anotar) pasa por una route handler de
  `app/api/`, que verifica la sesión y reenvía al backend.
- El `origen` de una acción lo pone el servidor, no el navegador: desde la app
  es `texto`. Si lo mandara el cliente, se podría saltar la confirmación que la
  política le exige a la voz.
- Las horas se formatean cortando la cadena ISO que manda el backend, con el
  desfase de Bogotá dentro. Un celular con la zona en otro país no mueve las
  clases de hora.

## Configuración

Copia `.env.example` a `.env.local`:

| Variable | Para qué |
|---|---|
| `API_BASE` | dónde vive la asistente (`http://localhost:3000` o la URL del túnel) |
| `API_TOKEN` | el mismo del `.env` del backend |
| `CODIGO_ACCESO` | el código con el que se entra |
| `SECRETO_SESION` | firma la cookie de sesión |

## Verla sin levantar el backend

```bash
node scripts/api-de-prueba.mjs   # una asistente de mentira en :4000
npm run dev                       # con API_BASE=http://localhost:4000
```

Sirve las mismas rutas con datos de ejemplo. **No se usa en producción.**

## Hablarle

La lámina es el canal de instrucciones, la misma boca que va a tener Telegram.
Lo que escribas pasa por el intérprete: el modelo lo convierte en **una
llamada a herramienta acotada** —consultar la agenda, cancelar, mover, anotar
un pendiente, enseñar un compromiso, deshacer, poner una regla— y de ahí en
adelante decide y actúa el mismo código que atiende los correos.

Mantén pulsado el micrófono y habla: mientras grabas ves el nivel del audio,
y al soltar **aparece la transcripción en el campo antes de ejecutar nada**.
Si no te oyó bien, lo dice en ámbar para que lo leas antes de mandarlo.

Tres cosas que se ven en la pantalla:

- **Siempre enseña lo que entendió**, haya actuado o no.
- **Lo que venga de una transcripción y toque algo que ya está en el
  calendario, se confirma antes.** Un toque, y de paso verificas que no oyó
  «semana» donde dijiste «mañana». Esa confirmación también aparece en la
  Crónica, así que si cierras la lámina no se pierde.
- **Si corriges una palabra de la transcripción, deja de ser voz.** La
  asistente firma lo que transcribe; cambiarlo invalida la firma y pasa a ser
  texto tuyo, que es justo lo que es. El origen no es un campo que mande el
  navegador.

## Lo que todavía no hace

- **Tesoro con datos.** La asistente todavía no lleva libro contable, y la
  pantalla no inventa cifras: en cuentas, mentir en silencio es la peor forma
  de fallar.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run typecheck  # tipos, sin emitir
```
