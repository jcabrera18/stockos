/**
 * Cola de ventas del POS.
 * Toda venta se guarda primero en IndexedDB y luego se envía al servidor
 * en segundo plano. Esto hace que el POS no espere al backend para mostrar
 * el ticket y, de paso, soporta venta sin conexión: si falla la red, la
 * venta queda pendiente y se sincroniza automáticamente al recuperarla.
 */
import { posDB, type PendingSale } from './pos-db'
import { api } from './api'

export function isNetworkError(err: unknown): boolean {
  // Timeout del AbortSignal (sin red, el fetch nunca responde)
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true
  if (!(err instanceof TypeError)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('fetch') ||
    msg.includes('network')
  )
}

export interface PushResult {
  saleId: string
  ticketCode: string | null
  invoiceId: string | null
}

export async function queueSale(
  data: Omit<PendingSale, 'status' | 'retry_count'>
): Promise<PendingSale> {
  const record: PendingSale = { ...data, status: 'pending', retry_count: 0 }
  await posDB.pendingSales.put(record)
  return record
}

export async function getPendingSalesCount(): Promise<number> {
  return posDB.pendingSales.count()
}

/**
 * Envía una venta pendiente al servidor y la borra de la cola si tiene éxito.
 * Retorna los ids reales (venta + comprobante) para que el ticket optimista
 * pueda actualizarse. Lanza el error si falla (la venta queda en la cola).
 */
async function pushOne(sale: PendingSale): Promise<PushResult> {
  let apiSaleId: string
  let ticketCode: string | null = null

  if (sale.customer_charge) {
    const apiSale = await api.post<{ id: string; ticket_code?: string | null }>('/api/sales', {
      ...sale.payload,
      payment_method: 'cuenta_corriente',
      installments: 1,
      created_at: sale.created_at,
    })
    apiSaleId = apiSale.id
    ticketCode = apiSale.ticket_code ?? null
    await api.post(`/api/customers/${sale.customer_charge.customer_id}/charge`, {
      sale_id: apiSaleId,
      amount: sale.customer_charge.amount,
      ticket_code: ticketCode,
    })
  } else {
    const apiSale = await api.post<{ id: string; ticket_code?: string | null }>('/api/sales', {
      ...sale.payload,
      created_at: sale.created_at,
    })
    apiSaleId = apiSale.id
    ticketCode = apiSale.ticket_code ?? null
  }

  // Comprobante: best-effort, no bloquea el alta de la venta
  let invoiceId: string | null = null
  try {
    const inv = await api.post<{ id: string }>('/api/invoices', {
      sale_id: apiSaleId,
      customer_id: sale.payload.customer_id ?? null,
    })
    invoiceId = inv.id
  } catch {
    /* el comprobante se puede generar después desde el ticket o ventas */
  }

  await posDB.pendingSales.delete(sale.id)
  return { saleId: apiSaleId, ticketCode, invoiceId }
}

/**
 * Sincroniza una venta puntual (la recién encolada) inmediatamente.
 * Devuelve los ids reales si tuvo éxito, o null si quedó pendiente.
 */
export async function pushSale(id: string): Promise<PushResult | null> {
  const sale = await posDB.pendingSales.get(id)
  if (!sale) return null
  try {
    return await pushOne(sale)
  } catch (err) {
    if (!isNetworkError(err)) {
      await posDB.pendingSales.update(id, {
        status: 'failed',
        retry_count: sale.retry_count + 1,
        last_error: err instanceof Error ? err.message : 'Error desconocido',
      })
    }
    throw err
  }
}

/**
 * Intenta enviar las ventas pendientes al servidor.
 * Retorna cuántas se sincronizaron y cuántas fallaron.
 *
 * Por defecto solo reintenta las que están en estado `pending` (caída de red /
 * backend). Las marcadas `failed` son errores de negocio que no se resuelven
 * reintentando, así que se omiten salvo que se pida `includeFailed` — eso lo usa
 * el botón "Reintentar" manual.
 */
export async function syncPendingSales(
  opts: { includeFailed?: boolean } = {}
): Promise<{ synced: number; failed: number }> {
  const all = await posDB.pendingSales.toArray()
  const pending = opts.includeFailed ? all : all.filter(s => s.status === 'pending')
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const sale of pending) {
    try {
      await pushOne(sale)
      synced++
    } catch (err) {
      // Si sigue sin red, dejar para el próximo intento
      if (!isNetworkError(err)) {
        // Error de negocio → marcar como fallida para no reintentar infinitamente
        await posDB.pendingSales.update(sale.id, {
          status: 'failed',
          retry_count: sale.retry_count + 1,
          last_error: err instanceof Error ? err.message : 'Error desconocido',
        })
      }
      failed++
    }
  }

  return { synced, failed }
}
