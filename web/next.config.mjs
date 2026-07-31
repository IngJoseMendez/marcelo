/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // La app no sirve imágenes remotas ni tipografías enlazadas: todo el peso
  // está en el HTML y el CSS. Una cabecera de más aquí no compra nada.
  poweredByHeader: false,
}

export default nextConfig
