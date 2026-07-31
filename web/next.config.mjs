/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El repo tiene dos package-lock (el backend y la app). Sin esto, el
  // rastreo de archivos toma la raíz del repo y se lleva medio backend al
  // despliegue.
  outputFileTracingRoot: import.meta.dirname,
  // La app no sirve imágenes remotas ni tipografías enlazadas: todo el peso
  // está en el HTML y el CSS. Una cabecera de más aquí no compra nada.
  poweredByHeader: false,
}

export default nextConfig
