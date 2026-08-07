import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist'
import {
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
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
const REALTIME_API = /\/api\/(cash-register|sales|pos|auth|stock|warehouses)\b/

// Reglas para la API. Se evalúan ANTES que `defaultCache` (cuyo último matcher es
// un catch-all NetworkOnly y antes tiene un `cross-origin` NetworkFirst que si no
// caparía estas requests). El orden de registro define qué regla gana.
const apiCaching: RuntimeCaching[] = [
  // Sync masivo del catálogo (grilla /products + cache del POS): estas requests
  // (limit=500 o updated_since) ya tienen su cache persistente en IndexedDB. Pasarlas
  // por StaleWhileRevalidate las duplicaría (doble cache) y le devolvería al sync datos
  // stale, dejando el catálogo un ciclo atrasado. Van siempre a red fresca; si no hay
  // conexión el sync falla y reintenta, y IndexedDB sigue sirviendo lo último guardado.
  {
    matcher: ({ url, request }) =>
      request.method === 'GET' &&
      url.href.startsWith(API_URL) &&
      (url.searchParams.get('limit') === '500' || url.searchParams.has('updated_since')),
    handler: new NetworkOnly(),
  },
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
        // Solo 200: NO cachear status 0 (respuestas opacas / errores de red), que
        // si no se guardan como "vacío" y se sirven stale rompiendo la pantalla.
        new CacheableResponsePlugin({ statuses: [200] }),
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
        // Solo 200: ver nota arriba. Cachear status 0 hacía que una respuesta
        // fallida/vacía quedara servida indefinidamente (catálogo en blanco).
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 }),
      ],
    }),
  },
]

// Navegación interna (App Router). El `defaultCache` de @serwist/next maneja los
// requests RSC/HTML con NetworkFirst pero SIN networkTimeoutSeconds: si la red se
// cuelga en mobile (radio dormido, cambio de celda) el fetch queda esperando
// indefinidamente y la navegación con next/link nunca completa → el nav "deja de
// responder" hasta refrescar a mano. Reemplazamos esas reglas por versiones con
// timeout: si la red no responde en 5s, servimos la última versión cacheada
// (cacheOnNavigation ya la guardó al visitar la ruta). Van antes que defaultCache
// para ganarle en el orden de evaluación.
const navigationCaching: RuntimeCaching[] = [
  // Prefetch de RSC (next/link con prefetch en viewport)
  {
    matcher: ({ request, url, sameOrigin }) =>
      request.headers.get('RSC') === '1' &&
      request.headers.get('Next-Router-Prefetch') === '1' &&
      sameOrigin && !url.pathname.startsWith('/api/'),
    handler: new NetworkFirst({
      cacheName: 'pages-rsc-prefetch',
      networkTimeoutSeconds: 5,
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 1440 * 60 })],
    }),
  },
  // Navegación RSC on-demand (el que se colgaba: al tocar un link)
  {
    matcher: ({ request, url, sameOrigin }) =>
      request.headers.get('RSC') === '1' &&
      sameOrigin && !url.pathname.startsWith('/api/'),
    handler: new NetworkFirst({
      cacheName: 'pages-rsc',
      networkTimeoutSeconds: 5,
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 1440 * 60 })],
    }),
  },
  // Documento HTML (recarga / navegación dura)
  {
    matcher: ({ request, url, sameOrigin }) =>
      request.mode === 'navigate' &&
      sameOrigin && !url.pathname.startsWith('/api/'),
    handler: new NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 5,
      plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 1440 * 60 })],
    }),
  },
]

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...apiCaching, ...navigationCaching, ...defaultCache],
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

// Click en una notificación (ej. "Nuevo pedido web") → enfoca una pestaña abierta
// de la app y navega a Pedidos, o abre una nueva si no hay ninguna.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/orders?status=pending'
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      // Reusar una pestaña ya abierta en el mismo origen.
      await client.focus()
      try { await client.navigate(url) } catch { /* algunos navegadores no permiten navigate */ }
      return
    }
    await self.clients.openWindow(url)
  })())
})
