/**
 * Cola offline de pedidos.
 * Cuando no hay conexión, los pedidos se guardan en IndexedDB y se
 * sincronizan automáticamente al recuperar la red.
 */
import { posDB, type PendingOrder } from './pos-db'
import { api } from './api'
import { isNetworkError } from './sales-queue'

export async function queueOrder(
  data: Omit<PendingOrder, 'status' | 'retry_count'>
): Promise<PendingOrder> {
  const record: PendingOrder = { ...data, status: 'pending', retry_count: 0 }
  await posDB.pendingOrders.put(record)
  return record
}

export async function getPendingOrdersCount(): Promise<number> {
  return posDB.pendingOrders.count()
}

/**
 * Intenta enviar todos los pedidos pendientes al servidor.
 * Retorna cuántos se sincronizaron y cuántos fallaron.
 */
export async function syncPendingOrders(): Promise<{ synced: number; failed: number }> {
  const pending = await posDB.pendingOrders.toArray()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const order of pending) {
    try {
      await api.post('/api/orders', order.payload)
      await posDB.pendingOrders.delete(order.id)
      synced++
    } catch (err) {
      // Si sigue sin red, dejar para el próximo intento
      if (!isNetworkError(err)) {
        // Error de negocio → marcar como fallido para no reintentar infinitamente
        await posDB.pendingOrders.update(order.id, {
          status: 'failed',
          retry_count: order.retry_count + 1,
          last_error: err instanceof Error ? err.message : 'Error desconocido',
        })
      }
      failed++
    }
  }

  return { synced, failed }
}
