/**
 * Cola offline de ventas.
 * Cuando no hay conexión, las ventas se guardan en IndexedDB y se
 * sincronizan automáticamente al recuperar la red.
 */
import { posDB, type PendingSale } from './pos-db'
import { api } from './api'

export function isNetworkError(err: unknown): boolean {
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
 * Intenta enviar todas las ventas pendientes al servidor.
 * Retorna cuántas se sincronizaron y cuántas fallaron.
 */
export async function syncPendingSales(): Promise<{ synced: number; failed: number }> {
  const pending = await posDB.pendingSales.toArray()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const sale of pending) {
    try {
      let apiSaleId: string

      if (sale.customer_charge) {
        const apiSale = await api.post<{ id: string }>('/api/sales', {
          ...sale.payload,
          payment_method: 'cuenta_corriente',
          installments: 1,
        })
        apiSaleId = apiSale.id
        await api.post(`/api/customers/${sale.customer_charge.customer_id}/charge`, {
          sale_id: apiSaleId,
          amount: sale.customer_charge.amount,
        })
      } else {
        const apiSale = await api.post<{ id: string }>('/api/sales', sale.payload)
        apiSaleId = apiSale.id
      }

      // Comprobante: fire and forget
      api
        .post('/api/invoices', {
          sale_id: apiSaleId,
          customer_id: sale.payload.customer_id ?? null,
        })
        .catch(() => {})

      await posDB.pendingSales.delete(sale.id)
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
