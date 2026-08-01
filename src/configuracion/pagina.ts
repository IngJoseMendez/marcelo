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
input[type=text], input[type=password], select {
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

/* Saber si algo se hace aquí o en la web del otro es la mitad de la confusión. */
.donde {
  display:inline-block; font-size:11px; font-weight:700; letter-spacing:.06em;
  text-transform:uppercase; border-radius:99px; padding:2px 9px;
  margin:0 8px 4px 0; vertical-align:2px;
}
.donde.aqui { background:color-mix(in srgb,var(--lumen) 16%,transparent); color:var(--lumen); }
.donde.vercel { background:color-mix(in srgb,var(--tinta) 10%,transparent); color:var(--tinta-suave); }

details.tecnico {
  margin:16px 0; padding:0 14px; border:1px solid var(--borde); border-radius:12px;
  background:var(--lienzo);
}
details.tecnico > summary {
  cursor:pointer; padding:12px 0; font-size:14px; color:var(--tinta-suave);
  font-weight:600;
}
details.tecnico[open] > summary { border-bottom:1px solid var(--borde); }
details.tecnico > label:first-of-type { margin-top:10px; }
details.tecnico > input:last-child { margin-bottom:16px; }

/* Lo que se pierde por saltarse un bloque. Va arriba del cuerpo, no
   escondido al final: es lo que decide si vale la pena hacerlo ahora. */
.pierde {
  margin:16px 0 0; padding:11px 13px; border-radius:11px; font-size:13.5px;
  background:color-mix(in srgb,var(--ojo) 10%,transparent); color:var(--ojo);
}
.pierde:empty { display:none; }

ul.lista { margin:10px 0 0; padding:0; list-style:none; }
ul.lista > li {
  position:relative; padding:0 0 12px 20px; color:var(--tinta-suave); font-size:15px;
}
ul.lista > li::before {
  content:''; position:absolute; left:4px; top:11px;
  width:5px; height:5px; border-radius:99px; background:var(--lumen);
}
ul.lista b { color:var(--tinta); }
h3.ojal { font-size:12px; }

.requisito {
  display:flex; align-items:flex-start; gap:14px; padding:14px 0;
  border-bottom:1px solid var(--borde);
}
.requisito:last-child { border-bottom:0; }
.req-icono { font-size:18px; line-height:1.4; flex:none; width:24px; }
.req-texto { flex:1; min-width:0; }
.req-op {
  font-size:11px; text-transform:uppercase; letter-spacing:.08em;
  color:var(--tinta-suave); border:1px solid var(--borde);
  border-radius:99px; padding:1px 7px; vertical-align:1px;
}
.req-porque { color:var(--tinta-suave); font-size:14px; margin-top:2px; }
.req-estado { font-size:13px; margin-top:4px; color:var(--tinta-suave); }
.r-listo .req-estado { color:var(--si); }
.r-falta .req-estado, .r-viejo .req-estado { color:var(--ojo); }
.r-apagado .req-estado { color:var(--ojo); }
.req-boton { margin:0; flex:none; align-self:center; padding:8px 16px; font-size:14px; }
a.req-boton {
  border:1px solid var(--borde); border-radius:12px; color:var(--lumen);
  text-decoration:none; padding:8px 16px; font-weight:600; font-size:14px;
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
    $('.detalle', caja).textContent = b.salud === 'listo'
      ? b.detalle
      : (b.imprescindible ? 'hace falta' : 'puedes dejarlo para después');
    if (b.salud === 'listo') listos++;

    // Qué deja de funcionar si se salta. Decir sólo «opcional» es no decir
    // nada: quien lo lee no sabe si se salta un adorno o media asistente.
    var nota = $('.pierde', caja);
    if (nota) {
      nota.textContent = b.salud === 'listo' ? '' : (b.pierde || '');
      nota.style.display = b.salud === 'listo' || !b.pierde ? 'none' : '';
    }
  });

  // Lo que quedó sin hacer, en la tarjeta final. Arrancar sin esto es una
  // decisión legítima; no saber qué se está dejando, no.
  var pendientes = revision.bloques.filter(function (b) {
    return b.salud !== 'listo' && b.pierde;
  });
  var caja = $('#pendientes');
  if (caja) {
    caja.innerHTML = pendientes.length === 0
      ? ''
      : '<p class="sub" style="margin:0 0 10px"><b>Te faltan '
        + pendientes.length + ' cosas.</b> Puedes arrancar igual y volver aquí '
        + 'cuando quieras: esta pantalla sigue abierta en '
        + '<span class="mono">localhost:' + (revision.puerto || location.port) + '</span> '
        + 'mientras ella trabaje.</p>'
        + '<ul class="lista">' + pendientes.map(function (b) {
            return '<li><b>' + b.titulo + '</b> — ' + b.pierde + '</li>';
          }).join('') + '</ul>';
  }

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
    if (boton.dataset.ruta.indexOf('/vigilia') === 0 || boton.dataset.ruta.indexOf('/api/vigilia') === 0) {
      await refrescarVigilia();
    }
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

// ── requisitos de la máquina ──────────────────────────────────
var instalando = false;

function pintarRequisitos(r) {
  var lista = $('#requisitos-lista');
  var caja = $('[data-bloque="requisitos"]');
  caja.dataset.salud = r.listo ? (r.faltan ? 'parcial' : 'listo') : 'pendiente';
  $('.detalle', caja).textContent = r.listo
    ? (r.faltan ? 'lo esencial está' : 'todo puesto')
    : 'falta lo esencial';

  instalando = false;
  lista.innerHTML = '';
  r.requisitos.forEach(function (q) {
    var marcha = (r.instalando || {})[q.id];
    if (marcha && !marcha.hecho) instalando = true;

    var fila = document.createElement('div');
    fila.className = 'requisito r-' + q.salud;

    var icono = q.salud === 'listo' ? '✅' : q.salud === 'apagado' ? '🟡' : q.salud === 'viejo' ? '🟠' : '⬜';
    var cuerpo = '<div class="req-icono">' + icono + '</div><div class="req-texto">'
      + '<b>' + q.nombre + '</b>'
      + (q.imprescindible ? '' : ' <span class="req-op">opcional</span>')
      + '<div class="req-porque">' + q.porque + '</div>'
      // Recién instalado y todavía sin verse: el PATH de este proceso es el
      // de antes de la instalación, así que hasta reiniciar no aparece.
      + '<div class="req-estado">' + (
          marcha && !marcha.hecho
            ? 'instalando… ' + (marcha.ultima || '')
            : marcha && marcha.ok && q.salud === 'falta'
              ? 'Instalado. Cierra esta ventana y vuelve a lanzar ARRANCAR.cmd para que lo vea.'
              : q.mensaje
        ) + '</div>'
      + '</div>';

    if (q.salud !== 'listo' && q.instalable && !(marcha && !marcha.hecho)) {
      cuerpo += '<button class="accion req-boton" data-instalar="' + q.id + '">Instalar</button>';
    } else if (q.salud !== 'listo' && !q.instalable) {
      cuerpo += '<a class="fuera req-boton" href="' + q.manual + '" target="_blank" rel="noreferrer">Cómo</a>';
    }

    fila.innerHTML = cuerpo;
    lista.appendChild(fila);
  });

  $('#requisitos-gestor').textContent = r.gestor
    ? 'Instalo con ' + r.gestor + ', el gestor de paquetes de tu sistema.'
    : 'En este sistema no puedo instalar solo: te dejo el enlace de cada uno.';
}

async function refrescarRequisitos() {
  var r = await fetch('/api/requisitos');
  pintarRequisitos(await r.json());
}

// ── el catálogo de proveedores ────────────────────────────────
var proveedores = [];

function pintarProveedor() {
  var sel = $('#LLM_PROVEEDOR');
  var p = proveedores.filter(function (x) { return x.id === sel.value; })[0];
  if (!p) return;
  $('#prov-nota').textContent = p.nota;

  // Los pasos del elegido, y sólo los del elegido: quien va a usar
  // OpenRouter no tiene por qué leerse los de Google.
  $('#prov-pasos').innerHTML = (p.pasos || []).length === 0
    ? ''
    : '<ol class="pasos">' + p.pasos.map(function (x) {
        return '<li>' + x + '</li>';
      }).join('') + '</ol>';

  // Si el elegido no transcribe, el oído deja de ser un detalle escondido
  // en un desplegable y se abre solo. Enterarse de que no hay voz el día
  // que se manda la primera nota es enterarse tarde.
  var oido = $('#oido');
  if (oido) {
    oido.open = !p.voz;
    $('#oido-aviso').innerHTML = p.voz
      ? '<b>' + p.nombre + ' también oye</b>, así que aquí no tienes que tocar nada.'
      : '<b>' + p.nombre + ' no transcribe voz.</b> Sin esto, las notas de voz no '
        + 'sirven. Pon Groq o Cloudflare aquí abajo, sólo para el oído.';
  }

  // La dirección se rellena sola, pero si él ya escribió una, manda la suya.
  var url = $('#LLM_BASE_URL');
  if (!tocados.LLM_BASE_URL) url.value = p.baseUrl;
}

async function cargarProveedores() {
  var r = await (await fetch('/api/proveedores')).json();
  proveedores = r.proveedores;
  var sel = $('#LLM_PROVEEDOR');
  sel.innerHTML = proveedores.map(function (p) {
    return '<option value="' + p.id + '">' + p.nombre + ' — ' + p.precioTexto
      + (p.voz ? ' · también oye' : '') + '</option>';
  }).join('');
  sel.value = r.elegido;
  sel.addEventListener('change', function () { tocados.LLM_BASE_URL = false; pintarProveedor(); });
  pintarProveedor();
}

async function refrescarVersion() {
  var v = await (await fetch("/api/version")).json();
  var caja = $("[data-bloque=\"actualizar\"]");
  if (!caja) return;
  caja.dataset.salud = !v.esRepo ? "pendiente" : v.hayQueActualizar ? "parcial" : "listo";
  $(".detalle", caja).textContent = !v.esRepo ? "no se sabe"
    : v.hayQueActualizar ? v.detras + " por traer" : "al día";

  var texto;
  if (v.corriendo) texto = "Actualizando… " + (v.ultima || "");
  else if (!v.esRepo) texto = "Esto no se bajó con git, así que no me sé actualizar sola.";
  else if (v.sucio) texto = "Hay archivos cambiados a mano aquí. No voy a pisarlos: avísale a Jose.";
  else if (v.hayQueActualizar) texto = "Tienes la " + v.version + " y hay " + v.detras
    + " cambio" + (v.detras === 1 ? "" : "s") + " nuevo" + (v.detras === 1 ? "" : "s") + ". Lo último: “" + v.novedad + "”";
  else texto = "Estás en lo último (" + v.version + ").";
  $("#version-estado").innerHTML = '<div class="req-estado" style="font-size:14px">' + texto + "</div>";
}

async function refrescarVigilia() {
  var r = await (await fetch('/api/vigilia')).json();
  var caja = $('[data-bloque="vigilia"]');
  caja.dataset.salud = r.listo ? 'listo' : (r.siempreDespierta || r.arrancaSola) ? 'parcial' : 'pendiente';
  $('.detalle', caja).textContent = r.listo ? 'siempre despierta' : 'se puede dormir';
  $('#vigilia-estado').innerHTML = (r.dichos || [])
    .map(function (d) { return '<div class="req-estado" style="font-size:14px">' + d + '</div>'; })
    .join('');
}

document.addEventListener('click', async function (e) {
  var boton = e.target.closest('[data-instalar]');
  if (!boton) return;
  var id = boton.dataset.instalar;
  if (!confirm('Voy a instalar ' + id + ' en esta máquina. Puede tardar varios minutos. ¿Sigo?')) return;
  boton.disabled = true;
  boton.textContent = 'lanzando…';
  var r = await pedir('/api/requisitos/instalar', { id: id });
  decir($('[data-bloque="requisitos"]'), r);
  await refrescarRequisitos();
});

refrescar();
refrescarRequisitos();
refrescarVigilia();
refrescarVersion();
cargarProveedores();
setInterval(refrescar, 15000);
setInterval(refrescarVigilia, 20000);
setInterval(refrescarVersion, 12000);
// Mientras algo se instala hay que mirar más seguido, para poder contarlo.
setInterval(function () { refrescarRequisitos(); }, 4000);
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
  <div class="cuerpo"><p class="pierde"></p>${cuerpo}<div class="aviso"></div></div>
</section>`
}

export function paginaConfiguracion(d: DatosPagina): string {
  const actualizar = bloque('actualizar', 'Traerme las mejoras', `
<p class="sub">Cuando Jose publique algo nuevo, esto lo trae. No hay que abrir
ninguna terminal ni saber qué es git.</p>
<div id="version-estado" style="margin:16px 0"></div>
<button class="accion" data-ruta="/api/actualizar" data-esperando="actualizando…">Buscar y traer</button>
<div class="aviso ojo" style="margin-top:16px"><b>No se pierde nada.</b> Tu
configuración vive en un archivo que no está en el repositorio, y tus datos en un
disco de Docker aparte del proyecto. Actualizar sólo cambia el código; las claves,
los permisos de Google, tu chat de Telegram y todo lo que ella ha aprendido siguen
donde estaban.</div>`)

  const requisitos = bloque('requisitos', 'Lo que necesita esta máquina', `
<p class="sub">Antes de nada, miro qué hay instalado y qué no. Lo que falte te lo
pongo yo desde aquí — <b>pero te pregunto cada vez</b>: instalar cosas en tu
máquina no debería pasar por descuido.</p>
<div id="requisitos-lista"></div>
<p class="detalle" id="requisitos-gestor" style="margin-top:14px"></p>
<div class="aviso ojo">Postgres <b>no</b> se instala aparte: vive dentro de Docker,
que es lo que instalo arriba. Y Python no hace falta para nada en este proyecto.</div>`)

  const vigilia = bloque('vigilia', 'Que no se duerma nunca', `
<p class="sub">Un portátil de fábrica hace tres cosas que matan a una asistente como
ésta, y ninguna se ve venir.</p>
<ol class="pasos">
  <li><b>Se suspende sola</b> a los pocos minutos. Dormida no va «más lenta»: se
    congela entera. No lee correo, no contesta, y el resumen de las 9 de la noche
    no sale.</li>
  <li><b>Se suspende al cerrar la tapa</b> — que es justo lo que uno hace con un
    portátil que va a dejar prendido en un rincón.</li>
  <li><b>Tras un reinicio de Windows, nadie la vuelve a abrir.</b></li>
</ol>
<div class="aviso ojo"><b>La pantalla de bloqueo no importa.</b> Bloquear la pantalla
no apaga nada: sigue trabajando igual. Lo que la mata es dormirse y cerrar la sesión.</div>
<div id="vigilia-estado" style="margin:16px 0"></div>
<button class="accion" data-ruta="/api/vigilia/despierta" data-esperando="cambiando…">No dormir nunca</button>
<button class="accion" data-ruta="/api/vigilia/arrancar-con-windows" data-esperando="registrando…">Arrancar con Windows</button>
<button class="accion suave" data-ruta="/api/vigilia/inicio-automatico" data-esperando="abriendo…">Entrar solo a Windows</button>
<p class="detalle" style="margin-top:12px">Lo último abre una ventana de Windows: si
la máquina se reinicia de madrugada y se queda pidiendo contraseña, nada arranca
hasta que alguien vaya y la escriba.</p>`)

  const base = bloque('base', 'Base de datos', `
<p class="sub">Aquí se guarda todo lo que ella aprende: tus compromisos, lo que hizo
y por qué. Corre dentro de Docker, en esta misma laptop — no sale a internet.</p>
<ol class="pasos">
  <li>Si Docker Desktop está cerrado, <b>ábrelo</b> con el botón. Tarda como un
    minuto: espera a que el icono de la ballena deje de moverse.</li>
  <li><b>Levantar la base de datos.</b> Lo hago yo, no tienes que abrir ninguna
    terminal.</li>
  <li><b>Probar conexión.</b> Las tablas se crean solas la primera vez.</li>
</ol>
<button class="accion suave" data-ruta="/api/base/abrir-docker" data-esperando="abriendo…">Abrir Docker Desktop</button>
<button class="accion" data-ruta="/api/base/levantar" data-esperando="levantando…">Levantar la base de datos</button>
<label for="DATABASE_URL">Dónde vive (esto ya viene puesto, no lo toques)</label>
<input type="text" id="DATABASE_URL" name="DATABASE_URL" class="mono"
  value="${esc(d.urlPropuestaBase)}" spellcheck="false">
<button class="accion" data-ruta="/api/probar/base" data-esperando="probando…">Probar conexión</button>`)

  const groq = bloque('groq', 'El cerebro', `
<p class="sub">Es lo que le permite <b>entender</b> un correo: leerlo y sacar que la
clase del miércoles se canceló. Puedes usar el que quieras — sólo tiene que hablar
la API de OpenAI, que a estas alturas la habla casi todo el mundo.</p>

<div class="aviso ojo"><b>¿Cuál elijo?</b> Si no tienes preferencia, deja
<b>Groq</b>: es gratis y además transcribe voz. <b>Si Groq no te deja crear la
cuenta</b> —pasa— usa <b>OpenRouter</b> para leer y <b>Cloudflare</b> sólo para
el oído; de Cloudflare vas a necesitar cuenta igual, por el túnel.</div>

<label for="LLM_PROVEEDOR">¿Con cuál?</label>
<select id="LLM_PROVEEDOR" name="LLM_PROVEEDOR"></select>
<p class="detalle" id="prov-nota" style="margin-top:8px"></p>
<div id="prov-pasos"></div>

<label for="LLM_API_KEY">La clave</label>
<input type="password" id="LLM_API_KEY" name="LLM_API_KEY" class="mono"
  placeholder="pégala aquí" spellcheck="false" autocomplete="off">
<label for="LLM_BASE_URL">Dirección (la relleno yo según el que elijas)</label>
<input type="text" id="LLM_BASE_URL" name="LLM_BASE_URL" class="mono" spellcheck="false">
<button class="accion" data-ruta="/api/probar/llm" data-esperando="mirando el catálogo…">Probar y elegir modelos</button>

<div class="aviso ojo" style="margin-top:18px"><b>No escribes ningún nombre de
modelo.</b> Le pregunto al proveedor cuáles tiene <i>hoy</i> y elijo: uno barato
para clasificar y uno bueno para leer. Si mañana retiran el que usábamos, coge el
siguiente en vez de quedarse apuntando a un nombre muerto.</div>

<details class="tecnico" id="oido">
  <summary>El oído — para las notas de voz</summary>
  <p class="detalle" id="oido-aviso" style="margin:10px 0"></p>
  <p class="detalle" style="margin:10px 0">Hay servicios buenísimos leyendo que no
  saben oír. Antes que dejarla muda, déjale el oído en <b>Groq</b>: da Whisper
  grande gratis, y con el acento costeño de Marcelo un modelo pequeño produce
  basura — está medido con su audio de verdad.</p>
  <label for="VOZ_API_KEY">Clave para la voz (una de Groq sirve)</label>
  <input type="password" id="VOZ_API_KEY" name="VOZ_API_KEY" class="mono"
    spellcheck="false" autocomplete="off">
  <label for="VOZ_BASE_URL">Dirección</label>
  <input type="text" id="VOZ_BASE_URL" name="VOZ_BASE_URL" class="mono"
    placeholder="https://api.groq.com/openai/v1" spellcheck="false">
  <button class="accion suave" data-ruta="/api/probar/voz" data-esperando="probando…">Probar el oído</button>
</details>`)

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
<p class="sub">Lo último, y lo que hace que no tengas que entrar nunca al panel de
Vercel: me das permiso una vez y <b>yo le escribo la configuración por ti</b>, hoy
y cada vez que la dirección del túnel cambie.</p>

<div class="aviso ojo">La página ya desplegada <b>no sabe</b> dónde está esta
laptop. Lo que hago aquí es decírselo. Sin este paso, la app abre pero dice
«sin conexión» en todas las pantallas.</div>

<ol class="pasos">
  <li><span class="donde aqui">aquí mismo</span>
    <b>Dale al botón «Generar secretos» de aquí abajo.</b>
    Son contraseñas que <b>me invento yo en esta laptop</b> — en Vercel no hay que
    generar nada, ni son cuentas de ningún sitio.
    <div class="detalle" style="margin-top:6px">De las cuatro que salen, sólo dos
    te importan: <b>tu código para entrar a la app</b> (el que teclearás en el
    celular) y <b>la clave del respaldo</b>, que hay que copiar a otro sitio. Las
    otras dos son mías y no las tienes que tocar ni entender.</div></li>

  <li><span class="donde vercel">en vercel.com</span>
    <b>El token.</b> Entra a
    <a class="fuera" href="https://vercel.com/account/settings/tokens" target="_blank" rel="noreferrer">vercel.com/account/settings/tokens</a>
    → <b>Create Token</b>. Nombre cualquiera, ámbito tu cuenta, caducidad
    <b>No Expiration</b> — si caduca, dejo de poder actualizar la app sola.
    Cópialo <b>en ese momento</b>: no se vuelve a mostrar.</li>

  <li><span class="donde vercel">en vercel.com</span>
    <b>El nombre del proyecto.</b> El que sale en tu panel, el de la URL
    <code class="mono">vercel.com/&lt;tu-usuario&gt;/<b>este-nombre</b></code>.
    No es la dirección de la app: es el nombre a secas.</li>

  <li><span class="donde vercel">en vercel.com</span>
    <b>El gancho de despliegue.</b> Tu proyecto →
    <b>Settings → Git → Deploy Hooks</b> → nombre cualquiera, rama
    <code class="mono">main</code> → <b>Create Hook</b> → copia la URL.
    <div class="detalle" style="margin-top:6px">Hace falta porque Vercel sólo
    aplica las variables cuando despliega. Sin el gancho se guardan, pero la app
    sigue con las de ayer — es la trampa clásica de esto.</div></li>

  <li><span class="donde aqui">aquí mismo</span>
    Pega esos tres, pon la <b>dirección de tu app</b> y dale a
    <b>Publicar en Vercel</b>. Yo escribo las variables en los tres entornos y
    disparo el redespliegue.</li>
</ol>
${demo([
  ['vercel.com → Account Settings', '→ Tokens → Create Token'],
  ['Tu proyecto → Settings', '→ Git → Deploy Hooks → Create Hook'],
  ['Aquí abajo', '→ pega los tres y dale a Publicar'],
])}
<button class="accion suave" data-ruta="/api/generar" data-esperando="generando…">Generar secretos</button>

<label for="CODIGO_ACCESO">Tu código para entrar a la app — el que teclearás en el celular</label>
<input type="text" id="CODIGO_ACCESO" name="CODIGO_ACCESO" class="mono" spellcheck="false">

<label for="RESPALDO_CLAVE">Clave del respaldo — cópiala FUERA de esta laptop</label>
<input type="text" id="RESPALDO_CLAVE" name="RESPALDO_CLAVE" class="mono" spellcheck="false">
<p class="detalle">Al gestor de contraseñas, o a un papel. Si el disco se muere y
esta clave se fue con él, los respaldos cifrados no sirven de nada.</p>

<details class="tecnico">
  <summary>Las otras dos, que son mías (no hay que tocarlas)</summary>
  <label for="API_TOKEN">Con esto la app me demuestra que es ella y no un extraño</label>
  <input type="text" id="API_TOKEN" name="API_TOKEN" class="mono" spellcheck="false">
  <label for="SECRETO_SESION">Con esto firmo tu sesión, para que nadie pueda falsificarla</label>
  <input type="text" id="SECRETO_SESION" name="SECRETO_SESION" class="mono" spellcheck="false">
</details>

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

  ${requisitos}
  ${vigilia}
  ${actualizar}
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

    <div id="pendientes" style="text-align:left;max-width:34rem;margin:22px auto 0"></div>

    <p class="sub" style="margin:18px auto 0">Arranco en <b>modo sombra</b>: observo y
    anoto todo lo que haría, pero no toco tu calendario hasta que tú lo digas.</p>
    <div class="sombra-caja">Para soltarle la correa, cuando lleve dos semanas
    acertando: pon <code class="mono">MODO_SOMBRA=false</code> en el <code class="mono">.env</code>.</div>
    <form method="post" action="/api/reiniciar">
      <button class="accion" type="submit">Aplicar y arrancar</button>
    </form>
    <p class="detalle" style="margin-top:10px">Se reinicia sola. Un cambio de
    configuración sólo entra al reiniciar, así que este botón es lo que lo aplica.</p>
  </div>

  <section class="bloque" data-bloque="manual" data-salud="listo">
    <button class="cabeza" type="button">
      <span class="punto"></span>
      <span class="titulo">Cómo vivir con esto</span>
      <span class="detalle">léelo una vez</span>
      <span class="flecha">›</span>
    </button>
    <div class="cuerpo">
      <p class="sub">Esta laptop pasa a ser un servidor. No es una forma de hablar:
      hay cosas que dejan de poderse hacer con ella, y conviene saberlas antes que
      descubrirlas.</p>

      <h3 class="ojal" style="margin-top:22px">Lo que no se puede hacer</h3>
      <ul class="lista">
        <li><b>No la apagues.</b> Apagada no lee correo, no contesta por Telegram, no
          manda el resumen de las 9 y no hace el respaldo. Nada se pierde para
          siempre —al encenderla se pone al día— pero mientras está apagada, no está.</li>
        <li><b>No cierres la ventana negra.</b> Ahí vive. Minimizarla no pasa nada;
          cerrarla la apaga.</li>
        <li><b>No la uses como computador personal.</b> Un juego o un editor de video
          se comen la memoria y la vuelven lenta. Para eso está tu otro equipo.</li>
        <li><b>Nunca corras <code class="mono">docker compose down -v</code>.</b> Esa
          <code class="mono">-v</code> borra la base de datos entera. Sin ella el
          comando es inofensivo.</li>
      </ul>

      <h3 class="ojal" style="margin-top:22px">Lo que sí puede pasar sin drama</h3>
      <ul class="lista">
        <li><b>Bloquear la pantalla.</b> Bloqueada sigue trabajando igual.</li>
        <li><b>Cerrar la tapa</b>, si le diste al botón de no dormir. Puedes dejarla
          cerrada en un rincón.</li>
        <li><b>Que se vaya la luz.</b> La batería es su UPS: aguanta el rato que
          aguante, y al volver la corriente sigue como si nada.</li>
        <li><b>Que se caiga el internet.</b> Al volver se pone al día sola y no
          duplica nada.</li>
        <li><b>Que Windows se reinicie de madrugada.</b> Vuelve sola, si registraste
          el arranque automático.</li>
      </ul>

      <h3 class="ojal" style="margin-top:22px">Lo que hay que mirar de vez en cuando</h3>
      <ul class="lista">
        <li><b>Que llegue el respaldo por Telegram</b> de madrugada. Si un día no
          llega, algo se rompió — y de eso uno se entera el día que lo necesita.</li>
        <li><b>Que la batería no viva al 100 %.</b> Si tu portátil deja limitar la
          carga al 80 %, hazlo: enchufada años al 100 % la batería se hincha.</li>
        <li><b>Ponla donde respire.</b> Cerrada y encima de una cama se cocina.
          Una mesa dura y con aire.</li>
      </ul>

      <h3 class="ojal" style="margin-top:22px">Si algo se ve raro</h3>
      <ul class="lista">
        <li>La app dice <b>«sin conexión»</b> → la laptop está apagada, sin internet,
          o el túnel cambió de dirección. Con <code class="mono">npm run configurar</code>
          se vuelve a abrir esta pantalla y se arregla desde el bloque del túnel.</li>
        <li><b>Ella no contesta por Telegram</b> → mira que la ventana negra siga
          abierta.</li>
        <li><b>Hizo algo que no era</b> → botón Deshacer en el mensaje, o
          <code class="mono">/deshacer</code>. Todo lo que hace se puede revertir, y
          queda anotado en la Crónica con el correo que lo causó.</li>
      </ul>
    </div>
  </section>
</div>
<script>${GUION}</script>
</body>
</html>`
}
