import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>
}

// Error de la API que conserva el status HTTP y el body completo de la respuesta,
// para que los callers puedan recuperar datos estructurados (ej. invoice_id en un 409).
export type ApiError = Error & {
  status?: number
  body?: Record<string, unknown>
}

// Timeout base por intento. Tras una inactividad larga (ej. POS abierto horas)
// la primera request puede tardar más por el cold start del backend en Railway
// y/o por el refresh del token de Supabase, así que damos margen y reintentamos.
// Se subió de 15s a 22s: en prod vimos TTFB de hasta ~17s con el server vivo
// pero lento; con 15s la 1ª intento abortaba y reintentaba, duplicando la carga
// sobre una instancia ya saturada (death spiral). 22s deja completar el intento 1.
const BASE_TIMEOUT_MS = 22_000
// Máximo de intentos ante timeouts / errores de red transitorios.
const MAX_ATTEMPTS = 3

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Detecta fallos transitorios (no de aplicación) que conviene reintentar:
// timeout del AbortSignal o error de red (fetch lanza TypeError "Failed to fetch").
function isTransientError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'TimeoutError') return true
  if (err instanceof Error && err.name === 'TimeoutError') return true
  if (err instanceof TypeError) return true
  return false
}

// Cache en memoria del access token. `getSession()` adquiere el Web Lock de gotrue
// ("lock:sb-...-auth-token") para leer/refrescar la sesión de forma segura entre
// pestañas. Ante un burst de requests en paralelo (ej. la página de productos +
// sidebar disparando N llamadas a la vez), cada `getSession()` pelea por ese lock y
// uno se lo "roba" a otro → NavigatorLockAcquireTimeoutError. Cacheando el token y
// deduplicando el getSession en vuelo, un burst de N requests hace 1 sola
// adquisición de lock en lugar de N.
let cachedToken: string | null = null
let cachedTokenExp = 0 // unix seconds (session.expires_at)
let inFlightSession: Promise<string | null> | null = null
let authListenerSet = false

// Refrescamos con 30s de margen antes del vencimiento real.
const TOKEN_SKEW_S = 30

// `getSession()` puede colgarse indefinidamente si el Web Lock de gotrue quedó
// tomado por una pestaña colgada/crasheada. Como ese await ocurre ANTES del fetch,
// un cuelgue acá congela la UI sin que corra ningún timeout de red (síntoma: la
// página de productos con skeleton infinito y "0 productos" que nunca resuelve).
// Lo corremos con un techo de tiempo y caemos al token cacheado o fallamos rápido.
const SESSION_TIMEOUT_MS = 8_000

// Corre getSession() con un timeout. Preserva el manejo de error de red existente
// (status 0 / AuthRetryableFetchError → TypeError para no deslogear) y rechaza con
// TimeoutError si el lock no responde a tiempo.
function getSessionWithTimeout(): Promise<{ access_token: string; expires_at?: number } | null> {
  const supabase = createClient()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DOMException('getSession lock timeout', 'TimeoutError')),
      SESSION_TIMEOUT_MS,
    )
    supabase.auth.getSession().then(
      ({ data, error }) => {
        clearTimeout(timer)
        if (error) {
          if (error.status === 0 || (error as { name?: string }).name === 'AuthRetryableFetchError') {
            reject(new TypeError(error.message || 'Failed to fetch'))
          } else {
            resolve(null)
          }
          return
        }
        resolve(data.session ?? null)
      },
      err => { clearTimeout(timer); reject(err) },
    )
  })
}

// Mantiene el cache sincronizado con gotrue: el auto-refresh interno, login y
// logout emiten eventos acá, así getAccessToken casi siempre acierta el fast-path
// y nunca toca el lock.
function ensureAuthListener() {
  if (authListenerSet || typeof window === 'undefined') return
  authListenerSet = true
  createClient().auth.onAuthStateChange((_event, session) => {
    cachedToken = session?.access_token ?? null
    cachedTokenExp = session?.expires_at ?? 0
  })
}

// Lee la sesión real (con lock), deduplicando llamadas concurrentes en una sola promesa.
function readSession(): Promise<string | null> {
  if (inFlightSession) return inFlightSession
  inFlightSession = (async () => {
    try {
      const session = await getSessionWithTimeout()
      cachedToken = session?.access_token ?? null
      cachedTokenExp = session?.expires_at ?? 0
      return cachedToken
    } catch (err) {
      // Lock trabado: si tenemos un token cacheado (aunque sea de un request previo)
      // lo usamos en vez de congelar la UI. Sin token, fallamos rápido como error
      // transitorio para que el caller reintente o muestre estado vacío recuperable
      // en vez de quedar con el skeleton colgado para siempre.
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        if (cachedToken) return cachedToken
        throw new TypeError('Auth lock timeout')
      }
      throw err
    }
  })().finally(() => { inFlightSession = null })
  return inFlightSession
}

async function getAccessToken(): Promise<string | null> {
  ensureAuthListener()
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && now < cachedTokenExp - TOKEN_SKEW_S) return cachedToken
  return readSession()
}

// Renueva el token tras un 401. El refresh token es de un solo uso con rotación: si
// forzamos `refreshSession()` con un token que otra pestaña (o el auto-refresh de
// gotrue, o el resto del burst) ya rotó, el server responde
// 400 "Invalid Refresh Token: Refresh Token Not Found".
//
// Para evitarlo: primero releemos la sesión con `getSession()` (deduplicado por
// inFlightSession), que lee de storage y toma el token ya rotado sin reusar el viejo,
// y solo auto-refresca si realmente venció. Solo si el token sigue igual (el cliente
// lo cree vigente pero el server lo rechazó: clock skew / revocado) forzamos un
// `refreshSession()`, tolerando que otra pestaña ya lo haya rotado.
async function refreshAccessToken(prevToken: string): Promise<string | null> {
  cachedToken = null
  cachedTokenExp = 0
  const token = await readSession()
  if (token && token !== prevToken) return token

  try {
    const { data, error } = await createClient().auth.refreshSession()
    if (error) {
      // refresh_token_not_found u otro: otra pestaña ya rotó. Releer la sesión vigente.
      const { data: current } = await createClient().auth.getSession()
      cachedToken = current.session?.access_token ?? null
      cachedTokenExp = current.session?.expires_at ?? 0
      return cachedToken
    }
    cachedToken = data.session?.access_token ?? null
    cachedTokenExp = data.session?.expires_at ?? 0
    return cachedToken
  } catch {
    return null
  }
}

// ── Indicador global de carga ──────────────────────────────────────────────
// Contador de requests en vuelo para que la UI pueda mostrar una barra de
// progreso global. Centralizado acá porque TODA la app pasa por apiFetch, así
// no hace falta instrumentar página por página. El caso que cubre: navegás en
// mobile, la ruta cambia al instante pero el fetch de datos tarda (cold start
// de Railway, ~20s) y la pantalla quedaba en blanco sin ninguna señal de vida.
let activeRequests = 0
const loadingListeners = new Set<(active: number) => void>()

export function subscribeLoading(listener: (active: number) => void): () => void {
  loadingListeners.add(listener)
  listener(activeRequests)
  return () => { loadingListeners.delete(listener) }
}

function setActiveRequests(n: number) {
  activeRequests = n < 0 ? 0 : n
  for (const l of loadingListeners) l(activeRequests)
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  setActiveRequests(activeRequests + 1)
  try {
    return await apiFetchImpl<T>(path, options)
  } finally {
    setActiveRequests(activeRequests - 1)
  }
}

async function apiFetchImpl<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options

  let url = `${API_URL}${path}`
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString()
    if (qs) url += `?${qs}`
  }

  // Si el caller pasa su propio signal (ej. para cancelar), respetamos su control
  // total y no aplicamos timeout ni reintentos automáticos.
  const callerControlsSignal = fetchOptions.signal != null

  const makeRequest = (t: string, timeoutMs: number) =>
    fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
        ...fetchOptions.headers,
      },
    })

  const maxAttempts = callerControlsSignal ? 1 : MAX_ATTEMPTS
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // El token se resuelve en cada intento: tras horas inactivo el primer intento
    // puede traer un token expirado y el siguiente uno ya refrescado.
    const token = await getAccessToken()
    if (!token) throw new Error('No autenticado')

    // Damos más margen en los reintentos para absorber el cold start del backend.
    const timeoutMs = BASE_TIMEOUT_MS * attempt

    try {
      let res = await makeRequest(token, timeoutMs)

      // Si el token expiró (race con auto-refresh), renovar una vez sin reusar un
      // refresh token ya rotado (ver refreshAccessToken).
      if (res.status === 401) {
        const newToken = await refreshAccessToken(token)
        if (!newToken) throw new Error('No autenticado')
        res = await makeRequest(newToken, timeoutMs)
      }

      // 5xx: el server respondió pero falló (ej. todavía levantando). Reintentable.
      if (res.status >= 500 && attempt < maxAttempts) {
        lastError = new Error(`Server error ${res.status}`)
        await sleep(500 * attempt)
        continue
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const error = new Error(body.error ?? 'Error en la API') as ApiError
        error.status = res.status
        error.body = body
        throw error
      }

      if (res.status === 204) return undefined as T
      return res.json() as Promise<T>
    } catch (err) {
      // Solo reintentamos fallos transitorios (timeout / red). Los errores de
      // aplicación (Error con mensaje del backend) se propagan de inmediato.
      if (isTransientError(err) && attempt < maxAttempts) {
        lastError = err
        await sleep(500 * attempt)
        continue
      }
      throw err
    }
  }

  throw lastError ?? new Error('Error en la API')
}

// Deduplicación de GETs en vuelo: si dos componentes piden el mismo recurso al
// mismo tiempo (ej. varios consumidores de auth/me, o el poller de caja), comparten
// la misma promesa en lugar de abrir N requests idénticas contra el backend.
const inFlightGets = new Map<string, Promise<unknown>>()

function dedupedGet<T>(path: string, params?: FetchOptions['params']): Promise<T> {
  const key = params ? `${path}?${JSON.stringify(params)}` : path
  const existing = inFlightGets.get(key)
  if (existing) return existing as Promise<T>

  const p = apiFetch<T>(path, { method: 'GET', params })
    .finally(() => { inFlightGets.delete(key) })
  inFlightGets.set(key, p)
  return p
}

// Helpers tipados
export const api = {
  get:    <T>(path: string, params?: FetchOptions['params']) =>
    dedupedGet<T>(path, params),
  post:   <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
}
