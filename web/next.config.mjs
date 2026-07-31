import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // La RAÍZ DEL REPO, no esta carpeta.
  //
  // Esto no decide qué se despliega —eso lo deciden los imports— sino
  // desde dónde se escriben las rutas de los archivos rastreados. Con
  // «Root Directory = web» en Vercel, el builder clona el repo entero en
  // /vercel/path0 y resuelve esas rutas contra ahí. Si el rastreo se
  // enraíza en web/, Next escribe «.next/…», Vercel busca
  // /vercel/path0/.next/… y el despliegue muere con:
  //
  //   ENOENT: lstat '/vercel/path0/.next/package.json'
  //
  // Enraizado en el repo, Next escribe «web/.next/…» y cuadra. Se pone
  // explícito en vez de dejar que Next lo deduzca porque hay dos
  // package-lock (el del backend y el de la app) y la deducción avisa por
  // consola de que podría equivocarse.
  outputFileTracingRoot: dirname(aqui),

  // La app no sirve imágenes remotas ni tipografías enlazadas: todo el peso
  // está en el HTML y el CSS. Una cabecera de más aquí no compra nada.
  poweredByHeader: false,
}

export default nextConfig
