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

## Lo que todavía no hace

- **Hablarle de verdad.** El intérprete (orden hablada → herramienta) vive con
  el canal de voz de Telegram. Por ahora, lo que escribas en la lámina se anota
  en la bandeja; cuando exista el intérprete, el mismo formulario apunta ahí.
- **Tesoro con datos.** La asistente todavía no lleva libro contable, y la
  pantalla no inventa cifras: en cuentas, mentir en silencio es la peor forma
  de fallar.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run typecheck  # tipos, sin emitir
```
