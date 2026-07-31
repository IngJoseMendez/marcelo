import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Marco } from '@/componentes/Marco'
import { pedir } from '@/lib/api'
import { haySesion } from '@/lib/sesion'
import type { Estado } from '@/lib/tipos'

export const metadata: Metadata = {
  title: 'Mi Segundo Cerebro',
  description: 'La agenda y las cuentas, atendidas solas.',
  applicationName: 'Mi Segundo Cerebro',
  appleWebApp: { capable: true, title: 'Segundo Cerebro', statusBarStyle: 'default' },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icono.svg', apple: '/icono-180.png' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F5FA' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0B15' },
  ],
}

// El tema elegido tiene que estar puesto ANTES del primer pintado, o la app
// parpadea en blanco al abrirla de noche.
const TEMA_TEMPRANO = `try{var t=localStorage.getItem('sc-tema');
if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`

export default async function Raiz({ children }: { children: React.ReactNode }) {
  const sesion = await haySesion()
  const estado = sesion ? await pedir<Estado>('/estado') : null

  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: TEMA_TEMPRANO }} />
        <Marco sesion={sesion} estado={estado?.ok ? estado.datos : null}>
          {children}
        </Marco>
      </body>
    </html>
  )
}
