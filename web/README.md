# web/ — prototipo desplegable

Esto **no es la app**. Es el prototipo visual de «Mi Segundo Cerebro» en un
solo HTML, listo para subir a Vercel como página estática.

## Para qué sirve

Darle a Marcelo una URL que abra en el celular y opine sobre el diseño **antes**
de que construyamos la app de verdad. Cambiar la interfaz ahora cuesta minutos;
cambiarla cuando ya está conectada al backend cuesta días.

## Qué tiene y qué no

| Funciona | No funciona |
|---|---|
| Las cuatro pantallas y el cambio entre ellas | Datos reales — todo es de ejemplo |
| Deshacer, expandir el correo, el panel de voz | Login |
| Tema claro y oscuro | Conexión con el backend |
| Instalable en el celular | La vista de agenda en rejilla (pendiente) |

## Subirlo

```bash
cd web
npx vercel
```

Acepta los valores por defecto. Vercel detecta que es estático y no pregunta
por framework.

Para publicarlo en producción con URL fija:

```bash
npx vercel --prod
```

## Cuando exista la app real

Este `index.html` se reemplaza por el proyecto Next.js. La URL de Vercel se
mantiene; lo que cambia es que las pantallas empiezan a pedirle datos al
backend de la laptop a través del túnel.
