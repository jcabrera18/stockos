import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist'

// El precache manifest lo inyecta el plugin de Serwist en build.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Origen del backend (Railway en prod, localhost en dev). Es cross-origin respecto
// del front, así que NO entra en las reglas `sameOrigin` de `defaultCache`: lo
// matcheamos por URL absoluta. NEXT_PUBLIC_* lo inlinea el bundler en build.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// Endpoints que SIEMPRE deben ir frescos a la red (datos en tiempo real). Servir
// cache stale acá daría totales de caja / stock / ventas erróneos. Cache solo como
// fallback offline.
const REALTIME_API = /\/api\/(cash-register|sales|pos|auth)\b/

// Reglas para la API. Se evalúan ANTES que `defaultCache` (cuyo último matcher es
// un catch-all NetworkOnly y antes tiene un `cross-origin` NetworkFirst que si no
// caparía estas requests). El orden de registro define qué regla gana.
const apiCaching: RuntimeCaching[] = [
  // Tiempo real → NetworkFirst: red primero, cache solo si no hay internet.
  {
    matcher: ({ url, request }) =>
      request.method === 'GET' &&
      url.href.startsWith(API_URL) &&
      REALTIME_API.test(url.pathname),
    handler: new NetworkFirst({
      cacheName: 'api-realtime',
      networkTimeoutSeconds: 10,
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 60 * 60 }),
      ],
    }),
  },
  // Resto de la API (listados de lectura: productos, clientes, categorías, etc.) →
  // StaleWhileRevalidate: render instantáneo desde cache + revalidación en background.
  // Esto es el "local-first" real; offline sigue sirviendo lo último cacheado.
  {
    matcher: ({ url, request }) =>
      request.method === 'GET' && url.href.startsWith(API_URL),
    handler: new StaleWhileRevalidate({
      cacheName: 'api-data',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 }),
      ],
    }),
  },
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...apiCaching, ...defaultCache],
  // Si se navega a una ruta nunca visitada estando offline, servir /offline
  // en vez de la pantalla del dino del navegador.
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})

serwist.addEventListeners()
