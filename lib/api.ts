import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>
}

async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new Error('No autenticado')

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

  const makeRequest = (t: string) =>
    fetch(url, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
        ...fetchOptions.headers,
      },
    })

  let res = await makeRequest(token)

  // Si el token expiró (race con auto-refresh), intentar renovar una vez
  if (res.status === 401) {
    const supabase = createClient()
    const { data } = await supabase.auth.refreshSession()
    const newToken = data.session?.access_token
    if (!newToken) throw new Error('No autenticado')
    res = await makeRequest(newToken)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Error en la API')
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Helpers tipados
export const api = {
  get:    <T>(path: string, params?: FetchOptions['params']) =>
    apiFetch<T>(path, { method: 'GET', params }),
  post:   <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),
}
