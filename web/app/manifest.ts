import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mi Segundo Cerebro',
    short_name: 'Segundo Cerebro',
    description: 'La agenda y las cuentas, atendidas solas.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F5FA',
    theme_color: '#F5F5FA',
    lang: 'es-CO',
    dir: 'ltr',
    icons: [
      { src: '/icono.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
