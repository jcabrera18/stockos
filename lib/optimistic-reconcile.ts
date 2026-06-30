// Reconciliación optimista para listas paginadas.
//
// El backend lee de un replica que puede ir "una atrás" respecto de la escritura
// (lag read-after-write). Por eso, tras crear o cambiar de estado una fila, el
// re-fetch inmediato a veces NO incluye el cambio y pisaría el update optimista,
// haciendo que el ítem "desaparezca" hasta recargar la página.
//
// Este helper mantiene las filas optimistas aplicadas sobre la respuesta del
// server hasta que el server las refleja, e indica si conviene reintentar.
//
// Mismo espíritu que el seed reconciliado de CustomerDetailModal.

export interface OptimisticState<T> {
  /** Filas recién creadas que el server todavía no devuelve (se prependean). */
  created: T[]
  /** Cambios por id (status, paid_amount, …) que el server aún no refleja. */
  patches: Map<string, Partial<T>>
}

export function makeOptimisticState<T>(): OptimisticState<T> {
  return { created: [], patches: new Map() }
}

export function clearOptimisticState<T>(state: OptimisticState<T>): void {
  state.created = []
  state.patches.clear()
}

// Aplica el estado optimista sobre la lista del server.
// - Descarta patches/creaciones que el server ya reconcilió.
// - Devuelve `pending: true` si algo sigue sin reflejarse (→ reintentar).
export function reconcileList<T extends { id: string }>(
  serverData: T[],
  state: OptimisticState<T>,
): { data: T[]; pending: boolean } {
  let pending = false
  let data = serverData

  if (state.patches.size > 0) {
    data = data.map(row => {
      const patch = state.patches.get(row.id)
      if (!patch) return row
      // ¿El server ya refleja el cambio? Comparamos solo los campos parcheados.
      const matched = Object.keys(patch).every(
        k => (row as Record<string, unknown>)[k] === (patch as Record<string, unknown>)[k],
      )
      if (matched) { state.patches.delete(row.id); return row }
      pending = true
      return { ...row, ...patch }
    })
  }

  if (state.created.length > 0) {
    const present = new Set(data.map(r => r.id))
    const missing = state.created.filter(r => !present.has(r.id))
    state.created = missing
    if (missing.length > 0) {
      data = [...missing, ...data]
      pending = true
    }
  }

  return { data, pending }
}
