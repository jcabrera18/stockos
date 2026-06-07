import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const nextConfig: NextConfig = {
  // @serwist/next siempre inyecta un `webpack` config (aunque esté disable en dev).
  // En Next 16 Turbopack es el default y se queja si ve webpack sin turbopack config.
  // Declarar un turbopack config vacío silencia el error y deja correr dev en
  // Turbopack (el SW solo se genera en el build con --webpack).
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

// Service Worker (PWA offline-first). El SW se genera solo en el build de
// producción con webpack (Turbopack aún no está soportado por @serwist/next,
// por eso el script `build` usa `--webpack`). En dev se desactiva para no
// pelear con el HMR.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // Cachear rutas al navegar con next/link → toda la app queda disponible offline.
  cacheOnNavigation: true,
  // No recargar la app al volver internet: el POS sincroniza por su cuenta y un
  // reload en medio de una venta sería disruptivo.
  reloadOnOnline: false,
})

export default withSerwist(nextConfig)
