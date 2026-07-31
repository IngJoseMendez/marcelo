import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// A mano y no con `import.meta.dirname`: eso existe desde Node 20.11, y en un
// Node anterior vale `undefined` en silencio. Entonces Next infiere la raíz
// sola, encuentra el package-lock del backend un nivel arriba, decide que la
// raíz del proyecto es el repo entero, y el despliegue se cae buscando un
// `.next` que quedó en otro sitio. Esto funciona en cualquier Node con ESM.
const aqui = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El repo tiene dos package-lock (el backend y la app). Sin esto, el
  // rastreo de archivos toma la raíz del repo y se lleva medio backend al
  // despliegue.
  outputFileTracingRoot: aqui,
  // La app no sirve imágenes remotas ni tipografías enlazadas: todo el peso
  // está en el HTML y el CSS. Una cabecera de más aquí no compra nada.
  poweredByHeader: false,
}

export default nextConfig
