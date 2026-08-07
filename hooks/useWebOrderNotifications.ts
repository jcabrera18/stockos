'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

// Roles que pueden actuar sobre un pedido web (confirmarlo / cobrarlo).
const AUDIENCE = ['owner', 'admin', 'cashier']

// Polling suave: los pedidos web no son urgentes al segundo, pero sí queremos
// enterarnos sin refrescar. Además refrescamos al volver a la pestaña (focus /
// visibilitychange) y cuando /orders avisa que cambió algo ('orders-changed').
const POLL_MS = 60_000
// Throttle corto al volver a la pestaña: suficiente para deduplicar un alt-tab con
// focus+visibilitychange casi simultáneos, pero permite refrescar al reentrar (el
// caso "tenía el POS en otra pestaña y no vi el 2º pedido").
const REENTER_THROTTLE_MS = 4_000
// Canal para sincronizar el conteo entre pestañas autenticadas del mismo navegador.
const CHANNEL_NAME = 'stockos-web-orders'

export interface WebOrder {
  id:            string
  customer_name: string | null
  total:         number
  created_at:    string
}

interface State { count: number; orders: WebOrder[] }

// ── Store singleton ──────────────────────────────────────────────
// La campanita se monta en varios lugares a la vez (sidebar desktop + bottom nav
// móvil, ambos con CSS `hidden` según el breakpoint). Un store compartido con
// ref-count garantiza UN solo polling y un estado único para todas las instancias.
let state: State = { count: 0, orders: [] }
const listeners = new Set<() => void>()
let refCount = 0
let intervalId: ReturnType<typeof setInterval> | null = null
let lastCheckAt = 0
let channel: BroadcastChannel | null = null

// Config que depende del usuario (se setea desde el provider).
let audience = false
let seenKey: string | null = null
let lastSeen: number | null = null

function emit() { for (const l of listeners) l() }

async function maybePush(orders: WebOrder[], count: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  const prev = lastSeen
  // Solo notificamos cuando el conteo SUBIÓ respecto de lo último visto (no en la
  // primera carga, para no spamear al abrir la app).
  if (prev == null || count <= prev) return

  const nuevos = count - prev
  const latest = orders[0]
  const title = nuevos === 1 ? 'Nuevo pedido web' : `${nuevos} pedidos web nuevos`
  const body = nuevos === 1 && latest
    ? `${latest.customer_name || 'Cliente'} · $${latest.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
    : 'Tenés pedidos web sin confirmar'
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: 'stockos-web-orders',
    renotify: true,
    data: { url: '/orders?status=pending' },
  }
  // Preferir el Service Worker: `registration.showNotification()` funciona con la
  // pestaña en segundo plano y en navegadores donde `new Notification()` está
  // bloqueado (Chrome mobile, etc.). El click lo maneja el `notificationclick` del SW.
  try {
    // `controller` no-null = hay un SW activo controlando la página (prod). En dev
    // el SW está desactivado y `controller` es null → evitamos que `.ready` cuelgue
    // y usamos el fallback `new Notification()` directo.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, options)
      return
    }
  } catch { /* cae al fallback */ }
  try {
    const n = new Notification(title, options)
    n.onclick = () => { window.focus(); window.location.assign('/orders?status=pending'); n.close() }
  } catch { /* algunos navegadores exigen SW; ya lo intentamos arriba */ }
}

async function poll() {
  if (!audience) return
  lastCheckAt = Date.now()
  try {
    const data = await api.get<State>('/api/orders/notifications')
    const count = data?.count ?? 0
    maybePush(data?.orders ?? [], count)
    state = { count, orders: data?.orders ?? [] }
    lastSeen = count
    if (seenKey) localStorage.setItem(seenKey, String(count))
    emit()
    // Sincronizar con las otras pestañas para que no tengan que hacer su propio
    // fetch (ni esperar al próximo poll) para ver el conteo actualizado.
    channel?.postMessage({ count, orders: state.orders })
  } catch { /* silencioso: la campanita no debe romper la app */ }
}

// Volver a la pestaña (focus o visibilitychange). Throttle corto para deduplicar
// ambos eventos disparándose casi juntos, pero permitiendo refrescar al reentrar.
const onReenter = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (Date.now() - lastCheckAt > REENTER_THROTTLE_MS) poll()
}

// Estado empujado por otra pestaña: lo adoptamos sin re-pushear (la pestaña origen
// ya disparó el aviso) y sin refetch.
function onBroadcast(e: MessageEvent) {
  const msg = e.data as State | undefined
  if (!msg || typeof msg.count !== 'number') return
  state = { count: msg.count, orders: msg.orders ?? [] }
  lastSeen = msg.count
  emit()
}

function startPolling() {
  if (intervalId != null) return
  poll()
  intervalId = setInterval(poll, POLL_MS)
  window.addEventListener('focus', onReenter)
  document.addEventListener('visibilitychange', onReenter)
  window.addEventListener('orders-changed', poll)
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener('message', onBroadcast)
  }
}

function stopPolling() {
  if (intervalId != null) { clearInterval(intervalId); intervalId = null }
  window.removeEventListener('focus', onReenter)
  document.removeEventListener('visibilitychange', onReenter)
  window.removeEventListener('orders-changed', poll)
  if (channel) { channel.removeEventListener('message', onBroadcast); channel.close(); channel = null }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  refCount++
  if (refCount === 1 && audience) startPolling()
  return () => {
    listeners.delete(cb)
    refCount--
    if (refCount === 0) stopPolling()
  }
}

const getSnapshot = () => state
const getServerSnapshot = () => state

/**
 * Estado de pedidos web sin confirmar, compartido por todas las campanitas.
 * Devuelve `{ count, orders, isAudience, refresh }`.
 */
export function useWebOrderNotifications() {
  const { user } = useAuth()
  const role = (user?.role as string) ?? ''
  const businessId = user?.business_id ?? null
  // La campanita solo aplica a negocios que USAN el módulo de pedidos web: tienen
  // un catálogo público activo aceptando pedidos (flag desde /api/auth/me). Para
  // el resto se oculta por completo y ni siquiera hace polling.
  const acceptsWebOrders = user?.business?.accepts_web_orders ?? false
  const isAudience = AUDIENCE.includes(role) && acceptsWebOrders

  // Configurar el store cuando cambia el usuario. Sembramos `lastSeen` desde
  // localStorage para no disparar un push por pedidos que ya existían al abrir.
  useEffect(() => {
    audience = isAudience
    seenKey = businessId ? `stockos_notif_seen_${businessId}` : null
    if (seenKey) {
      const saved = localStorage.getItem(seenKey)
      lastSeen = saved != null ? Number(saved) : null
    } else {
      lastSeen = null
    }
    if (isAudience && refCount > 0) startPolling()
    if (!isAudience) { stopPolling(); state = { count: 0, orders: [] }; emit() }
  }, [isAudience, businessId])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return { count: snapshot.count, orders: snapshot.orders, isAudience, refresh: poll }
}

/** Estado del permiso de notificaciones del navegador + acción para pedirlo. */
export function useBrowserPushPermission() {
  const [granted, setGranted] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setGranted(Notification.permission === 'granted')
  }, [])
  const request = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setGranted(perm === 'granted')
  }
  const supported = typeof window !== 'undefined' && 'Notification' in window
  return { granted, supported, request }
}
