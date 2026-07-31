/**
 * El asistente de configuración, en una sola página sin dependencias.
 *
 * Sin React ni empaquetador a propósito: esta página tiene que abrirse en
 * una laptop donde todavía no funciona nada, y lo último que se necesita
 * ahí es otra cosa que instalar. Es HTML, CSS y JS a pelo, servidos por el
 * mismo proceso que se está configurando.
 *
 * La estética es la del spec —«Luminoso»: claro, aireado, sombras grandes
 * y difusas, el violeta reservado para la mano de la asistente— y el tema
 * oscuro está trabajado con el mismo cuidado.
 */

export interface DatosPagina {
  /** Lo que hay que pegar como URI de redirección autorizada. */
  redirecciones: { google: string; microsoft: string }
  puertoServicio: number
  urlPropuestaBase: string
}

const ESTILO = `
:root {
  --lienzo:#F5F5FA; --papel:#FFF; --tinta:#16142A; --tinta-suave:#5D5A78;
  --lumen:#5B3DF6; --lumen-2:#2FC9DE; --borde:#E7E6F2;
  --si:#0E9A6C; --no:#D93B50; --ojo:#A96A08;
  --sombra:0 18px 50px -22px rgba(30,20,80,.35);
  --radio:20px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --lienzo:#0C0B15; --papel:#17162B; --tinta:#F2F1F9; --tinta-suave:#A6A2C4;
    --lumen:#9C8BFF; --lumen-2:#5FE1F0; --borde:#272544;
    --si:#40D69A; --no:#FF7086; --ojo:#F0B355;
    --sombra:0 18px 50px -20px rgba(0,0,0,.7);
  }
}
* { box-sizing:border-box; }
body {
  margin:0; padding:0 20px 96px; background:var(--lienzo); color:var(--tinta);
  font:16px/1.6 'Segoe UI Variable Text','Segoe UI',system-ui,-apple-system,sans-serif;
}
.centro { max-width:760px; margin:0 auto; }
header { padding:56px 0 28px; }
.ojal {
  font-size:12px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--lumen); font-weight:600; margin:0 0 10px;
}
h1 { font-size:34px; line-height:1.15; margin:0 0 10px; letter-spacing:-.02em; font-weight:650; }
.sub { color:var(--tinta-suave); margin:0; max-width:56ch; }

.barra { height:6px; border-radius:99px; background:var(--borde); overflow:hidden; margin:26px 0 6px; }
.barra > i { display:block; height:100%; width:0; border-radius:99px;
  background:linear-gradient(90deg,var(--lumen),var(--lumen-2));
  transition:width .6s cubic-bezier(.22,1,.36,1); }
.cuenta { font-size:13px; color:var(--tinta-suave); }

.bloque {
  background:var(--papel); border:1px solid var(--borde); border-radius:var(--radio);
  box-shadow:var(--sombra); margin:14px 0; overflow:hidden;
  transition:border-color .3s ease;
}
.bloque[data-salud="listo"] { border-color:color-mix(in srgb,var(--si) 40%,var(--borde)); }
.cabeza {
  display:flex; align-items:center; gap:14px; padding:18px 22px; cursor:pointer;
  user-select:none; width:100%; background:none; border:0; color:inherit; text-align:left;
  font:inherit;
}
.cabeza:hover { background:color-mix(in srgb,var(--lumen) 5%,transparent); }
.punto { width:11px; height:11px; border-radius:99px; background:var(--borde); flex:none; }
[data-salud="listo"] .punto { background:var(--si); box-shadow:0 0 0 4px color-mix(in srgb,var(--si) 18%,transparent); }
[data-salud="parcial"] .punto { background:var(--ojo); box-shadow:0 0 0 4px color-mix(in srgb,var(--ojo) 18%,transparent); }
[data-salud="pendiente"] .punto { animation:latir 2.4s ease-in-out infinite; }
@keyframes latir { 0%,100%{opacity:.35} 50%{opacity:1} }
.titulo { font-weight:600; flex:1; }
.detalle { color:var(--tinta-suave); font-size:14px; }
.flecha { color:var(--tinta-suave); transition:transform .3s ease; }
.bloque.abierto .flecha { transform:rotate(90deg); }
.cuerpo { display:none; padding:4px 22px 24px; border-top:1px solid var(--borde); }
.bloque.abierto .cuerpo { display:block; animation:entrar .35s cubic-bezier(.22,1,.36,1); }
@keyframes entrar { from{opacity:0; transform:translateY(-6px)} to{opacity:1; transform:none} }

ol.pasos { margin:18px 0; padding:0; list-style:none; counter-reset:p; }
ol.pasos > li {
  counter-increment:p; position:relative; padding:0 0 18px 42px; margin:0;
}
ol.pasos > li::before {
  content:counter(p); position:absolute; left:0; top:-1px;
  width:26px; height:26px; border-radius:99px; display:grid; place-items:center;
  background:color-mix(in srgb,var(--lumen) 14%,transparent); color:var(--lumen);
  font-size:13px; font-weight:700;
}
ol.pasos > li::after {
  content:''; position:absolute; left:13px; top:30px; bottom:2px; width:1px;
  background:var(--borde);
}
ol.pasos > li:last-child::after { display:none; }

a { color:var(--lumen); text-decoration:none; font-weight:550; }
a:hover { text-decoration:underline; }
a.fuera::after { content:' ↗'; font-size:.85em; }

label { display:block; font-size:13px; font-weight:600; margin:14px 0 6px; }
input[type=text], input[type=password] {
  width:100%; padding:12px 14px; border-radius:12px; border:1px solid var(--borde);
  background:var(--lienzo); color:var(--tinta); font:inherit; font-size:15px;
}
input:focus { outline:2px solid var(--lumen); outline-offset:1px; border-color:transparent; }
.mono, code { font-family:'Cascadia Mono',ui-monospace,Menlo,Consolas,monospace; font-size:13px; }

button.accion {
  margin-top:16px; padding:12px 20px; border-radius:12px; border:0; cursor:pointer;
  background:var(--lumen); color:#fff; font:inherit; font-weight:600;
  transition:transform .15s ease, filter .2s ease;
}
button.accion:hover { filter:brightness(1.08); }
button.accion:active { transform:scale(.98); }
button.accion[disabled] { opacity:.55; cursor:progress; }
button.suave { background:transparent; color:var(--lumen); border:1px solid var(--borde); }

.copiar {
  display:flex; align-items:center; gap:10px; margin:10px 0;
  background:var(--lienzo); border:1px dashed var(--borde); border-radius:12px; padding:10px 12px;
}
.copiar .mono { flex:1; overflow:auto; white-space:nowrap; }
.copiar button {
  border:0; background:var(--lumen); color:#fff; border-radius:8px; padding:6px 12px;
  cursor:pointer; font:inherit; font-size:13px; font-weight:600; flex:none;
}

.aviso { margin:14px 0 0; padding:12px 14px; border-radius:12px; font-size:14px; }
.aviso.ok  { background:color-mix(in srgb,var(--si) 12%,transparent); color:var(--si); }
.aviso.mal { background:color-mix(in srgb,var(--no) 12%,transparent); color:var(--no); }
.aviso.ojo { background:color-mix(in srgb,var(--ojo) 12%,transparent); color:var(--ojo); }
.aviso:empty { display:none; }

/* La ventanita animada que enseña dónde hay que hacer clic. */
.demo {
  margin:16px 0; border:1px solid var(--borde); border-radius:14px; overflow:hidden;
  background:var(--lienzo);
}
.demo .marco { display:flex; gap:5px; padding:9px 12px; border-bottom:1px solid var(--borde); }
.demo .marco i { width:9px; height:9px; border-radius:99px; background:var(--borde); }
.demo .lienzo { position:relative; height:132px; padding:14px; font-size:12.5px; }
.demo .fila {
  display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:8px;
  color:var(--tinta-suave); opacity:.45; transition:all .45s ease;
}
.demo .fila.viva { opacity:1; background:color-mix(in srgb,var(--lumen) 12%,transparent); color:var(--tinta); }
.demo .fila b { font-weight:600; }
.demo .cursor {
  position:absolute; width:16px; height:16px; pointer-events:none;
  transition:transform .55s cubic-bezier(.22,1,.36,1);
}
@media (prefers-reduced-motion: reduce) {
  * { animation:none !important; transition:none !important; }
}

.final {
  margin-top:26px; padding:26px; border-radius:var(--radio); text-align:center;
  background:linear-gradient(135deg,color-mix(in srgb,var(--lumen) 14%,var(--papel)),var(--papel));
  border:1px solid var(--borde);
}
.sombra-caja { margin-top:14px; font-size:14px; color:var(--tinta-suave); }
`

/** El script del navegador. Sin plantillas literales: la página ya es una. */
const GUION = `
const $ = (s, d) => (d || document).querySelector(s);
const $$ = (s, d) => Array.from((d || document).querySelectorAll(s));

var tocados = {};

function pintar(revision) {
  var listos = 0, total = revision.bloques.length;
  revision.bloques.forEach(function (b) {
    var caja = $('[data-bloque="' + b.id + '"]');
    if (!caja) return;
    caja.dataset.salud = b.salud;
    $('.detalle', caja).textContent = b.salud === 'listo' ? b.detalle : (b.imprescindible ? 'hace falta' : 'opcional');
    if (b.salud === 'listo') listos++;
  });

  // Rellenar lo que ya se guardó, para que volver aquí no parezca empezar
  // de cero. Nunca se pisa un campo que él esté escribiendo ahora mismo.
  Object.keys(revision.valores || {}).forEach(function (k) {
    var campo = $('input[name="' + k + '"]');
    if (campo && !tocados[k]) campo.value = revision.valores[k];
  });
  (revision.yaGuardados || []).forEach(function (k) {
    var campo = $('input[name="' + k + '"]');
    if (campo && !campo.value) campo.placeholder = 'ya guardado — déjalo vacío para no cambiarlo';
  });

  $('.barra > i').style.width = Math.round((listos / total) * 100) + '%';
  $('.cuenta').textContent = listos + ' de ' + total + ' · ' +
    (revision.listo ? 'ya puede arrancar' : 'faltan ' + revision.faltantes + ' para arrancar');
  $('#final').style.display = revision.listo ? 'block' : 'none';

  var app = revision.app || {};
  $('#app-url').textContent = app.url || '(pon la dirección de tu app arriba)';
  $('#app-codigo').textContent = app.codigo || '(genera los secretos arriba)';
}

document.addEventListener('input', function (e) {
  if (e.target.name) tocados[e.target.name] = true;
});

async function pedir(ruta, cuerpo) {
  var r = await fetch(ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo || {})
  });
  return r.json();
}

function decir(caja, respuesta) {
  var caj = $('.aviso', caja);
  caj.className = 'aviso ' + (respuesta.ok ? 'ok' : 'mal');
  caj.textContent = respuesta.mensaje || '';
  var extra = (respuesta.avisos || []).join(' ');
  if (extra) caj.textContent += ' — ' + extra;
}

async function refrescar() {
  var r = await fetch('/api/estado');
  pintar(await r.json());
}

function valores(caja) {
  var datos = {};
  $$('input[name]', caja).forEach(function (i) { datos[i.name] = i.value.trim(); });
  return datos;
}

document.addEventListener('click', async function (e) {
  var cabeza = e.target.closest('.cabeza');
  if (cabeza) { cabeza.parentElement.classList.toggle('abierto'); return; }

  var copiar = e.target.closest('.copiar button');
  if (copiar) {
    var texto = copiar.parentElement.querySelector('.mono').textContent;
    try { await navigator.clipboard.writeText(texto); } catch (x) {}
    var antes = copiar.textContent;
    copiar.textContent = 'copiado';
    setTimeout(function () { copiar.textContent = antes; }, 1400);
    return;
  }

  var boton = e.target.closest('button.accion');
  if (!boton || !boton.dataset.ruta) return;

  var caja = boton.closest('.bloque');
  var textoAntes = boton.textContent;
  boton.disabled = true;
  boton.textContent = boton.dataset.esperando || 'un momento…';
  try {
    var respuesta = await pedir(boton.dataset.ruta, valores(caja));
    decir(caja, respuesta);
    if (respuesta.ir) { window.location.href = respuesta.ir; return; }
    if (respuesta.rellenar) {
      Object.keys(respuesta.rellenar).forEach(function (k) {
        var campo = $('input[name="' + k + '"]');
        if (campo) campo.value = respuesta.rellenar[k];
      });
    }
    await refrescar();
  } catch (x) {
    decir(caja, { ok: false, mensaje: 'No respondió: ' + x });
  } finally {
    boton.disabled = false;
    boton.textContent = textoAntes;
  }
});

// El paseo del cursor por la ventanita: enseña el orden de los clics.
$$('.demo').forEach(function (demo) {
  var filas = $$('.fila', demo);
  var cursor = $('.cursor', demo);
  var i = 0;
  if (!filas.length) return;
  setInterval(function () {
    filas.forEach(function (f) { f.classList.remove('viva'); });
    var f = filas[i % filas.length];
    f.classList.add('viva');
    if (cursor) cursor.style.transform = 'translate(' + (f.offsetLeft + 26) + 'px,' + (f.offsetTop + 16) + 'px)';
    i++;
  }, 1900);
});

refrescar();
setInterval(refrescar, 15000);
`

const FLECHA = '<span class="flecha">›</span>'
const CURSOR = '<svg class="cursor" viewBox="0 0 16 16" fill="currentColor" style="color:var(--lumen)">'
  + '<path d="M1 1l5.5 13 2-5.5L14 6.5z"/></svg>'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const copiable = (valor: string): string =>
  `<div class="copiar"><span class="mono">${esc(valor)}</span><button type="button">copiar</button></div>`

function demo(filas: Array<[string, string]>): string {
  const cuerpo = filas
    .map(([que, donde]) => `<div class="fila"><b>${esc(que)}</b> ${esc(donde)}</div>`)
    .join('')
  return `<div class="demo"><div class="marco"><i></i><i></i><i></i></div>`
    + `<div class="lienzo">${cuerpo}${CURSOR}</div></div>`
}

function bloque(id: string, titulo: string, cuerpo: string): string {
  return `<section class="bloque" data-bloque="${id}" data-salud="pendiente">
  <button class="cabeza" type="button">
    <span class="punto"></span>
    <span class="titulo">${esc(titulo)}</span>
    <span class="detalle"></span>
    ${FLECHA}
  </button>
  <div class="cuerpo">${cuerpo}<div class="aviso"></div></div>
</section>`
}

export function paginaConfiguracion(d: DatosPagina): string {
  const base = bloque('base', 'Base de datos', `
<p class="sub">Postgres corre en Docker, en esta misma laptop. Si ya levantaste
<code class="mono">docker compose up -d</code>, esto es sólo darle a Probar.</p>
<ol class="pasos">
  <li>Abre una terminal en la carpeta del proyecto.</li>
  <li>Corre <code class="mono">docker compose up -d</code> y espera unos segundos.</li>
  <li>Dale a <b>Probar conexión</b>. Las tablas se crean solas.</li>
</ol>
<label for="DATABASE_URL">Cadena de conexión</label>
<input type="text" id="DATABASE_URL" name="DATABASE_URL" class="mono"
  value="${esc(d.urlPropuestaBase)}" spellcheck="false">
<button class="accion" data-ruta="/api/probar/base" data-esperando="probando…">Probar conexión</button>`)

  const groq = bloque('groq', 'Cerebro (Groq)', `
<p class="sub">Es lo que le permite entender un correo. Gratis, y con
<b>Zero Data Retention</b> no entrenan con lo tuyo.</p>
<ol class="pasos">
  <li>Entra a <a class="fuera" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a> y crea una cuenta.</li>
  <li>Botón <b>Create API Key</b>, ponle cualquier nombre y <b>cópiala ahora</b>: no la vuelve a enseñar.</li>
  <li>Ve a <a class="fuera" href="https://console.groq.com/settings/data-controls" target="_blank" rel="noreferrer">Settings → Data Controls</a> y activa <b>Zero Data Retention</b>.</li>
  <li>Pégala abajo y dale a Probar: <b>yo elijo los modelos solos</b> del catálogo de hoy.</li>
</ol>
${demo([
  ['API Keys', '→ Create API Key'],
  ['Data Controls', '→ Zero Data Retention'],
  ['Listo', '→ pega la clave aquí'],
])}
<label for="GROQ_API_KEY">Clave de Groq</label>
<input type="password" id="GROQ_API_KEY" name="GROQ_API_KEY" class="mono"
  placeholder="gsk_…" spellcheck="false" autocomplete="off">
<button class="accion" data-ruta="/api/probar/groq" data-esperando="mirando el catálogo…">Probar y elegir modelos</button>`)

  const google = bloque('google', 'Google (Gmail + Calendar)', `
<p class="sub">Aquí es donde ella lee tu correo y mueve tu calendario. Es el paso
más largo, pero se hace una sola vez y el permiso te lo pide ella sola al final.</p>
<ol class="pasos">
  <li>Entra a <a class="fuera" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a> y crea un proyecto nuevo.</li>
  <li>Activa las dos APIs:
    <a class="fuera" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API</a> y
    <a class="fuera" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Calendar API</a>.</li>
  <li>En <a class="fuera" href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">Pantalla de consentimiento</a>: tipo <b>Externo</b>, y en <b>Usuarios de prueba</b> añade tu propio correo. Déjalo en modo <b>Prueba</b>: así no hace falta que Google verifique nada.</li>
  <li>En <a class="fuera" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Credenciales</a> → <b>Crear credenciales</b> → <b>ID de cliente de OAuth</b> → tipo <b>Aplicación web</b>.</li>
  <li>En <b>URIs de redirección autorizados</b> pega exactamente esto:
    ${copiable(d.redirecciones.google)}
    <span class="detalle">Si sobra un espacio o falta la barra, Google devuelve <code class="mono">redirect_uri_mismatch</code>. Por eso el botón de copiar.</span></li>
  <li>Copia el <b>ID de cliente</b> y el <b>Secreto</b> aquí abajo y dale a Conectar.</li>
</ol>
${demo([
  ['APIs y servicios', '→ Biblioteca → activa Gmail y Calendar'],
  ['Pantalla de consentimiento', '→ Externo → tú como usuario de prueba'],
  ['Credenciales', '→ ID de cliente OAuth → Aplicación web'],
  ['URIs de redirección', '→ pega la de arriba'],
])}
<label for="GOOGLE_CLIENT_ID">ID de cliente</label>
<input type="text" id="GOOGLE_CLIENT_ID" name="GOOGLE_CLIENT_ID" class="mono"
  placeholder="…apps.googleusercontent.com" spellcheck="false">
<label for="GOOGLE_CLIENT_SECRET">Secreto de cliente</label>
<input type="password" id="GOOGLE_CLIENT_SECRET" name="GOOGLE_CLIENT_SECRET" class="mono"
  placeholder="GOCSPX-…" spellcheck="false" autocomplete="off">
<button class="accion" data-ruta="/api/oauth/google" data-esperando="abriendo Google…">Conectar Google</button>`)

  const outlook = bloque('outlook', 'Outlook (opcional)', `
<p class="sub">Sólo si también recibes correo ahí. Puedes saltártelo y añadirlo después.</p>
<ol class="pasos">
  <li>Entra a <a class="fuera" href="https://entra.microsoft.com" target="_blank" rel="noreferrer">entra.microsoft.com</a> → <b>Registros de aplicaciones</b> → <b>Nuevo registro</b>.</li>
  <li>En cuentas admitidas elige <b>cualquier organización y cuentas personales</b>.</li>
  <li>Como URI de redirección, tipo <b>Web</b>, pega:
    ${copiable(d.redirecciones.microsoft)}</li>
  <li>En <b>Certificados y secretos</b> crea un <b>secreto de cliente</b> y cópialo enseguida.</li>
  <li>En <b>Permisos de API</b> añade <code class="mono">Mail.Read</code> delegado.</li>
</ol>
<label for="MS_CLIENT_ID">ID de aplicación</label>
<input type="text" id="MS_CLIENT_ID" name="MS_CLIENT_ID" class="mono" spellcheck="false">
<label for="MS_CLIENT_SECRET">Secreto</label>
<input type="password" id="MS_CLIENT_SECRET" name="MS_CLIENT_SECRET" class="mono"
  spellcheck="false" autocomplete="off">
<button class="accion" data-ruta="/api/oauth/microsoft" data-esperando="abriendo Microsoft…">Conectar Outlook</button>`)

  const telegram = bloque('telegram', 'Telegram', `
<p class="sub">Por aquí le hablas y por aquí te rinde cuentas a las nueve de la noche.</p>
<ol class="pasos">
  <li>Abre <a class="fuera" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> en Telegram y escribe <code class="mono">/newbot</code>.</li>
  <li>Ponle nombre y usuario. Te devuelve un token largo: pégalo abajo.</li>
  <li>Dale a <b>Probar token</b>.</li>
  <li>Abre el chat de tu bot y <b>escríbele cualquier cosa</b>. Luego dale a <b>Escucharme</b>: yo cojo tu número de chat sola.</li>
</ol>
<label for="TELEGRAM_BOT_TOKEN">Token del bot</label>
<input type="password" id="TELEGRAM_BOT_TOKEN" name="TELEGRAM_BOT_TOKEN" class="mono"
  placeholder="123456:AA…" spellcheck="false" autocomplete="off">
<button class="accion" data-ruta="/api/probar/telegram" data-esperando="preguntando…">Probar token</button>
<button class="accion suave" data-ruta="/api/telegram/emparejar" data-esperando="te escucho… escríbele ya">Escucharme</button>`)

  const tunel = bloque('tunel', 'Túnel — cómo te alcanza la app', `
<p class="sub">La app vive en Vercel para que la uses en la calle; la asistente vive
aquí, donde están tus datos. El túnel es lo que une las dos: <b>cloudflared</b> abre
una conexión de salida y Cloudflare le presta una dirección https. No se abre ningún
puerto de tu casa.</p>
<ol class="pasos">
  <li>Instala <a class="fuera" href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noreferrer">cloudflared</a>. En Windows: <code class="mono">winget install Cloudflare.cloudflared</code>.</li>
  <li>Dale a <b>Abrir túnel</b>. Yo lo levanto y me quedo con la dirección.</li>
</ol>
<div class="aviso ojo">La dirección gratuita <b>cambia cada vez que se reinicia</b> el
túnel. No es un problema si abajo conectas Vercel: cuando cambie, se la vuelvo a
publicar sola. Con un dominio propio en Cloudflare la dirección sería fija.</div>
<label for="TUNEL_NOMBRE">Túnel con nombre (opcional, si tienes dominio)</label>
<input type="text" id="TUNEL_NOMBRE" name="TUNEL_NOMBRE" class="mono" placeholder="dejar vacío para el gratuito">
<label for="URL_PUBLICA">Dirección pública</label>
<input type="text" id="URL_PUBLICA" name="URL_PUBLICA" class="mono" placeholder="la relleno yo" spellcheck="false">
<button class="accion" data-ruta="/api/tunel" data-esperando="levantando el túnel…">Abrir túnel</button>`)

  const app = bloque('app', 'La app en Vercel', `
<p class="sub">Lo último. Aquí genero los secretos y <b>se los escribo a Vercel yo
misma</b>, para que no tengas que copiar nada a mano.</p>
<ol class="pasos">
  <li>Dale a <b>Generar secretos</b>. Salen el token de servicio, tu código de entrada y la firma de la sesión.</li>
  <li>Saca un token en <a class="fuera" href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer">vercel.com → Account Settings → Tokens</a> y pégalo.</li>
  <li>Escribe el <b>nombre del proyecto</b> tal como sale en Vercel.</li>
  <li>En tu proyecto → <b>Settings → Git → Deploy Hooks</b>, crea uno para <code class="mono">main</code> y pega la URL. Sin esto las variables se guardan pero la app sigue con las de antes.</li>
  <li><b>Publicar en Vercel</b>. Escribo las cuatro variables y disparo el redespliegue.</li>
</ol>
${demo([
  ['Account Settings', '→ Tokens → Create'],
  ['Proyecto → Settings', '→ Git → Deploy Hooks'],
  ['Publicar', '→ yo escribo las variables y redesplego'],
])}
<button class="accion suave" data-ruta="/api/generar" data-esperando="generando…">Generar secretos</button>
<label for="API_TOKEN">Token de servicio (backend ↔ app)</label>
<input type="text" id="API_TOKEN" name="API_TOKEN" class="mono" spellcheck="false">
<label for="CODIGO_ACCESO">Tu código para entrar a la app</label>
<input type="text" id="CODIGO_ACCESO" name="CODIGO_ACCESO" class="mono" spellcheck="false">
<label for="SECRETO_SESION">Firma de la sesión</label>
<input type="text" id="SECRETO_SESION" name="SECRETO_SESION" class="mono" spellcheck="false">
<label for="APP_URL">Dirección de la app en Vercel</label>
<input type="text" id="APP_URL" name="APP_URL" class="mono" placeholder="https://algo.vercel.app" spellcheck="false">
<label for="VERCEL_TOKEN">Token de Vercel</label>
<input type="password" id="VERCEL_TOKEN" name="VERCEL_TOKEN" class="mono" spellcheck="false" autocomplete="off">
<label for="VERCEL_PROYECTO">Nombre del proyecto en Vercel</label>
<input type="text" id="VERCEL_PROYECTO" name="VERCEL_PROYECTO" class="mono" spellcheck="false">
<label for="VERCEL_GANCHO">Gancho de despliegue</label>
<input type="text" id="VERCEL_GANCHO" name="VERCEL_GANCHO" class="mono"
  placeholder="https://api.vercel.com/v1/integrations/deploy/…" spellcheck="false">
<button class="accion" data-ruta="/api/vercel" data-esperando="hablando con Vercel…">Publicar en Vercel</button>`)

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mi Segundo Cerebro · configuración</title>
<style>${ESTILO}</style>
</head>
<body>
<div class="centro">
  <header>
    <p class="ojal">mi segundo cerebro</p>
    <h1>Vamos a dejarla lista</h1>
    <p class="sub">Te llevo paso a paso. Cada bloque se prueba de verdad contra el
    servicio antes de darlo por bueno, y lo que sale de la prueba lo guardo yo — tú
    no tienes que escribir ni un identificador de modelo ni un número de chat.</p>
    <div class="barra"><i></i></div>
    <p class="cuenta">cargando…</p>
  </header>

  ${base}
  ${groq}
  ${google}
  ${telegram}
  ${tunel}
  ${app}
  ${outlook}

  <div class="final" id="final" style="display:none">
    <h2 style="margin:0 0 8px">Ya puede arrancar</h2>
    <p class="sub" style="margin:0 auto 18px">Esto es todo lo que necesitas en el
    celular. No hay que volver a tocar nada de esta pantalla ni entrar a Vercel.</p>

    <div style="text-align:left;max-width:30rem;margin:0 auto">
      <label>Abre esto en tu teléfono</label>
      <div class="copiar"><span class="mono" id="app-url">—</span><button type="button">copiar</button></div>
      <label>Y entra con este código</label>
      <div class="copiar"><span class="mono" id="app-codigo">—</span><button type="button">copiar</button></div>
    </div>

    <p class="sub" style="margin:18px auto 0">Arranco en <b>modo sombra</b>: observo y
    anoto todo lo que haría, pero no toco tu calendario hasta que tú lo digas.</p>
    <div class="sombra-caja">Para soltarle la correa, cuando lleve dos semanas
    acertando: pon <code class="mono">MODO_SOMBRA=false</code> en el <code class="mono">.env</code>.</div>
    <form method="post" action="/api/reiniciar">
      <button class="accion" type="submit">Arrancar la asistente</button>
    </form>
  </div>
</div>
<script>${GUION}</script>
</body>
</html>`
}
