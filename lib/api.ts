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
const BASE_TIMEOUT_MS = 15_000
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

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    // status === 0 o name === 'AuthRetryableFetchError' indica fallo de red al
    // intentar refrescar el token (ej. offline). No es un logout real: propagamos
    // como TypeError para que los handlers de red lo detecten y no deslogeen al usuario.
    if (error.status === 0 || (error as { name?: string }).name === 'AuthRetryableFetchError') {
      throw new TypeError(error.message || 'Failed to fetch')
    }
    return null
  }
  return data.session?.access_token ?? null
}

export async function apiFetch<T = unknown>(
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

      // Si el token expiró (race con auto-refresh), intentar renovar una vez
      if (res.status === 401) {
        const supabase = createClient()
        const { data } = await supabase.auth.refreshSession()
        const newToken = data.session?.access_token
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

// Helpers tipados
export const api = {
  get:    <T>(path: string, params?: FetchOptions['params']) =>
    apiFetch<T>(path, { method: 'GET', params }),
  post:   <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
}
