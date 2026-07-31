# Despliegue paso a paso

> **Atajo: no hagas esto a mano.**
>
> ```bash
> npm install
> npm start
> ```
>
> Si falta configuración, en vez de caerse abre un **asistente** y te dice a
> qué dirección ir (`http://localhost:3210`). Ahí está todo lo de abajo en
> forma de guía con enlaces y formularios: pega cada dato, él lo **prueba
> contra el servicio de verdad** y se guarda lo que salga bien. Los modelos
> de Groq, el número de chat de Telegram y los `refresh_token` de Google y
> Outlook **no se escriben a mano** — salen de la propia prueba.
>
> Para volver a abrirlo después: `npm run configurar`.
>
> El asistente **sólo escucha en `127.0.0.1`**. Eso es toda su autenticación,
> y por eso no puede vivir en Vercel ni colgar del túnel: recoge el secreto
> de cliente de Google y el token del bot. Quien lo abre ya está sentado
> frente a la laptop.
>
> Lo que sigue es la misma puesta en marcha explicada a mano, por si algo
> falla o prefieres entender qué está pasando por debajo.

## 0. Dónde va cada cosa (y por qué)

```
📱 Vercel — la app Next.js          (gratis de verdad, sin asteriscos)
      │
      │  el navegador nunca ve el token: los route handlers hacen de puente
      ▼
🔒 Cloudflare Tunnel                 (gratis, sin abrir puertos del router)
      ▼
💻 Laptop de Marcelo — API + Postgres
```

### ¿Se puede el backend gratis en otro lado?

Respuesta honesta: **no, en ninguna forma en la que yo pondría a un cliente.**
Los tiers gratuitos de backend siempre pagan con una de estas tres cosas:

| Opción | El asterisco |
|---|---|
| **Render** free | El servicio **se duerme** por inactividad. Un webhook que despierta con arranque en frío pierde correos, y el resumen de las 9pm simplemente no sale. La Postgres gratis además caduca a los 90 días |
| **Oracle Always Free** | Reclama instancias con CPU p95 bajo 20% en 7 días. Nuestro servicio usa 1-2%: **somos exactamente el perfil que reclaman**. Para sobrevivir habría que quemar CPU falsa 24/7 |
| **Fly.io / Railway / Koyeb** | Créditos de prueba y después se cobra. Sirven, pero no son gratis |
| **Cloud Run + Neon** | Técnicamente viable y casi gratis, pero escala a cero: hay que meter Cloud Scheduler para los crons y aceptar arranques en frío. Más piezas móviles que la laptop |

**Por eso la laptop gana**: es gratis de verdad, siempre prendida, y tiene una
ventaja que nadie menciona — **la batería es un UPS integrado**. En Colombia se
va la luz; un escritorio se cae, la laptop ni se entera.

Y como todo va en Docker Compose con respaldo nocturno, el host no es una
apuesta permanente: si la laptop muere, el mismo compose levanta en un VPS de
5 USD en veinte minutos.

---

## 1. Credenciales (hazlo primero, toma lo suyo)

### 1.1 Google — Gmail + Calendar

1. Entra a **console.cloud.google.com** y crea un proyecto.
2. **APIs y servicios → Biblioteca** → habilita **Gmail API** y **Google Calendar API**.
3. **Pantalla de consentimiento OAuth** → tipo **Externo** → déjala en
   **modo Prueba**. Agrega el correo de Marcelo en *Usuarios de prueba*.
   > En modo Prueba **no necesitas verificación de Google ni auditoría de
   > seguridad**. Es la razón por la que este proyecto es viable: verificar una
   > app que lee Gmail toma semanas y cuesta plata.
4. **Credenciales → Crear → ID de cliente de OAuth → App de escritorio**.
   Guarda `client_id` y `client_secret`.
5. Alcances que vas a pedir, y solo estos:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
6. Consigue el `refresh_token` con el flujo de consentimiento una sola vez.

### 1.2 Microsoft — Outlook

1. Entra a **entra.microsoft.com** → **Registros de aplicaciones → Nuevo registro**.
2. Tipo de cuenta: **cuentas personales y de organización**.
3. **Permisos de API → Microsoft Graph → Delegados**: `Mail.Read` y `offline_access`.
4. **Certificados y secretos → Nuevo secreto de cliente**. Cópialo **ya**:
   no se vuelve a mostrar.
5. Anota `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`.

### 1.3 Groq — el cerebro

1. **console.groq.com** → crea una API key.
2. **Entra a Data Controls y activa Zero Data Retention.** No es opcional:
   este sistema le manda al modelo los correos bancarios de una persona real.
3. Mira el catálogo vigente y anota los identificadores de modelo en
   `GROQ_MODELO_CLASIFICADOR` (uno rápido y barato) y `GROQ_MODELO_EXTRACTOR`
   (uno bueno). **Verifícalos, no los asumas: cambian.**

### 1.4 Telegram

1. Habla con **@BotFather** → `/newbot` → guarda el token en
   `TELEGRAM_BOT_TOKEN`.
2. Deja `TELEGRAM_CHAT_ID` vacío, arranca el backend y escríbele «hola» al bot
   desde el celular de Marcelo: contesta con el número que va en esa variable.
   Ponlo y reinicia.

Mientras `TELEGRAM_CHAT_ID` esté vacío el bot no obedece a nadie, y una vez
puesto ignora en silencio a cualquier otro chat. Es el único candado que hay:
quien conozca el token del bot puede escribirle, pero no es Marcelo.

El bot trabaja por **long polling** — sale a preguntar en vez de esperar a que
le toquen— así que no necesita IP pública, ni webhook, ni un puerto abierto.
El túnel del paso 2.3 es sólo para el push de Gmail y para la app.

---

## 2. Backend en la laptop

### 2.1 Preparar la máquina

```bash
# Node 20 o superior
node --version

# Docker Desktop instalado y con arranque automático activado
docker --version
```

En Docker Desktop: **Settings → General → Start Docker Desktop when you log in**.
Y en Windows, configura inicio de sesión automático para que un reinicio por
actualización no deje la máquina en la pantalla de login.

### 2.2 Levantar

```bash
git clone <tu-repo> mi-segundo-cerebro
cd mi-segundo-cerebro
npm install

cp .env.example .env
# llena .env con todo lo del paso 1

docker compose up -d db
npm run db:migrate
npm test          # 135 pruebas, sin red
npm run dev
```

> **`MODO_SOMBRA=true` se queda así.** No lo toques hasta que la sombra
> reporte ≥95% de aciertos durante 5 días seguidos. Ese número no es
> burocracia: es lo que separa "parece que funciona" de "funciona".

### 2.3 Exponer el webhook — Cloudflare Tunnel

La laptop no tiene IP pública. El túnel resuelve eso **sin abrir puertos en el
router**, porque la conexión sale desde adentro.

```bash
winget install Cloudflare.cloudflared

cloudflared tunnel login
cloudflared tunnel create segundo-cerebro
cloudflared tunnel route dns segundo-cerebro api.tudominio.com

# Apuntar el túnel al servicio local
cloudflared tunnel run --url http://localhost:3000 segundo-cerebro

# Que arranque solo con Windows
cloudflared service install
```

Esa URL `https://api.tudominio.com` es la que va en Google Pub/Sub y en la
suscripción de Microsoft Graph.

### 2.4 Acceso remoto — Tailscale

Para administrarla sin depender de que Marcelo esté disponible:

```bash
winget install tailscale.tailscale
tailscale up
```

Corre como servicio y te da SSH/RDP desde donde sea, atravesando el NAT.

### 2.5 Watchdog y respaldos

Dos cosas que el hosting casero **obliga** a tener:

- **Latido**: el servicio reporta cada 5 minutos. Si deja de llegar, **tú**
  recibes alerta por Telegram. Te enteras antes que el cliente — sin esto, un
  hosting en casa se descubre cuando el usuario reclama.
- **Respaldo nocturno**: `pg_dump` cifrado a la nube. Son pocos MB.

```bash
docker compose exec -T db pg_dump -U asistente asistente | gzip > respaldo.sql.gz
```

Programa eso con el Programador de tareas de Windows.

### 2.6 Batería

La laptop va a vivir enchufada durante años. Si el fabricante lo permite,
**limita la carga al 60–80%**: alarga bastante la vida de la batería, que es
justamente el UPS del que depende todo.

---

## 3. La app en Vercel

El proyecto Next.js vive en `web/`. Antes de desplegar, el backend tiene que
tener `API_TOKEN` en su `.env` (el mismo valor va en Vercel):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
cd web
npm install
npx vercel        # y luego  npx vercel --prod
```

Variables de entorno en Vercel:

| Variable | Valor |
|---|---|
| `API_BASE` | `https://api.tudominio.com` (el túnel) |
| `API_TOKEN` | el mismo `API_TOKEN` del backend |
| `CODIGO_ACCESO` | el código con el que entra Marcelo |
| `SECRETO_SESION` | otra cadena aleatoria larga, para firmar la cookie |

**El `API_TOKEN` nunca llega al navegador.** Los route handlers de Next.js
hacen de puente: el navegador habla con Vercel, y Vercel habla con tu backend.
Si el token estuviera en el cliente, cualquiera con la URL leería las finanzas
de Marcelo.

**Login por código.** Sin contraseñas ni OAuth: entra quien sabe el código, y
la sesión queda en una cookie firmada `httpOnly` por 30 días. Cuando exista el
bot de Telegram, el código pasa a ser de un solo uso y lo manda ella; la cookie
no cambia. Una URL secreta **no es** autenticación cuando la página muestra
movimientos bancarios.

**Para ver la app sin levantar el backend** (útil para revisar el diseño en el
celular antes de conectar Google):

```bash
cd web
node scripts/api-de-prueba.mjs      # asistente de mentira en :4000
npm run dev                          # con API_BASE=http://localhost:4000
```

---

## 4. Verificar que quedó bien

- [ ] `npm test` pasa completo (298 pruebas)
- [ ] **Abre un respaldo antes de necesitarlo**: `npm run respaldo:abrir -- respaldos/<archivo>`.
      Un respaldo que nadie ha probado a abrir no es un respaldo
- [ ] `RESPALDO_CLAVE` guardada FUERA de la laptop. Si se muere el disco y
      la clave se fue con él, el respaldo cifrado no sirve de nada
- [ ] `GROQ_MODELO_TRANSCRIPTOR` puesto (si no, el micrófono de la app responde
      503 y lo dice, y el bot contesta que todavía no sabe oír); y `FFMPEG_RUTA`
      si quieres que normalice el volumen
- [ ] Le escribes al bot «¿qué me queda hoy?» y contesta
- [ ] Le mandas una **nota de voz** diciendo «cancélame X del viernes»: responde
      con lo que oyó, lo que entendió y dos botones. **Sin tocar nada hasta que
      toques Confirmar** — eso es la política de la voz funcionando
- [ ] `curl https://api.tudominio.com/salud` responde desde fuera de la casa
- [ ] `curl -H "Authorization: Bearer $API_TOKEN" https://api.tudominio.com/api/jornada`
      devuelve el día — y sin la cabecera responde 401
- [ ] Llega un correo de prueba y aparece una fila en `acciones` con `estado='sombra'`
- [ ] **Google Calendar NO cambió** — eso confirma que la sombra funciona
- [ ] A las 21:00 llega el resumen **sólo si ella hizo algo por su cuenta**. Un
      día en que no tocó nada no debe llegar nada: si llega un «hoy no pasó
      nada», está mal
- [ ] Apagar la laptop 30 minutos, prenderla: los correos de ese rato se procesan solos
- [ ] Cortar el internet y devolverlo: se pone al día sin duplicar nada

---

## 5. La trampa que mata estos sistemas

**El `watch` de Gmail caduca a los 7 días.** La suscripción de Microsoft Graph,
a los 3.

Si el cron de renovación falla, el sistema **deja de recibir avisos sin dar
ningún error**. Todo se ve bien en los logs, no hay excepciones, y simplemente
nunca vuelve a pasar nada. Es el error clásico que hace que estos asistentes
"dejen de funcionar solos" a la semana y media, y es dificilísimo de
diagnosticar después.

Por eso el watchdog no es opcional: si no llega un correo procesado en 24 horas,
eso ya es una señal de alarma.
