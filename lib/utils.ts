import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number | string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(Number(amount))
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

// Formatea una fecha "pura" (sin hora) evitando corrimientos por timezone.
// Acepta 'YYYY-MM-DD' o un ISO completo ('2026-07-07T00:00:00.000Z') y toma
// solo la parte de fecha, interpretándola como local (no UTC). Devuelve ''
// para valores nulos/inválidos en vez de "Invalid Date".
export function formatDateOnly(date?: string | Date | null): string {
  if (!date) return ''
  const s = typeof date === 'string' ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatNumber(n: number | string): string {
  return new Intl.NumberFormat('es-AR').format(Number(n))
}

// Moneda compacta para KPIs/charts — solo abrevia en millones (donde rompe el
// layout). Los miles se muestran completos: un comerciante piensa en "mil", no "k".
// $15.847.392 → "$15,8M" · $980.500 → "$980.500" · $4.300 → "$4.300"
// El valor exacto siempre se preserva con formatCurrency() en tooltips/title.
export function formatCompactCurrency(amount: number | string): string {
  const n = Number(amount)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
  return `${sign}$${Math.round(abs).toLocaleString('es-AR')}`
}

// Moneda entera para KPIs: número completo sin abreviar y sin decimales.
// $1.003.764 → "$1.003.764" · $282.857 → "$282.857"
// El valor exacto siempre se preserva con formatCurrency() en tooltips/title.
export function formatIntCurrency(amount: number | string): string {
  const n = Math.round(Number(amount))
  return `$${n.toLocaleString('es-AR')}`
}

// Solo para ejes de gráficos: brevedad máxima (k/M es convención universal en charts).
// No usar en KPIs/headlines — ahí va formatCompactCurrency().
export function formatAxisCurrency(amount: number | string): string {
  const n = Number(amount)
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000)     return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export function getStockStatusColor(status: string): string {
  switch (status) {
    case 'sin_stock': return 'var(--danger)'
    case 'critico':   return 'var(--danger)'
    case 'bajo':      return 'var(--warning)'
    case 'ok':        return 'var(--accent)'
    default:          return 'var(--text3)'
  }
}

export function getStockStatusLabel(status: string): string {
  switch (status) {
    case 'sin_stock': return 'Sin stock'
    case 'critico':   return 'Crítico'
    case 'bajo':      return 'Bajo'
    case 'ok':        return 'OK'
    default:          return status
  }
}

export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    efectivo:      'Efectivo',
    transferencia: 'Transferencia',
    debito:        'Débito',
    credito:       'Crédito',
    qr:               'QR',
    mixto:            'Mixto',
    cuenta_corriente: 'Cuenta corriente',
  }
  return labels[method] ?? method
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner:     'Dueño',
    admin:     'Administrador',
    cashier:   'Cajero',
    stocker:   'Repositor',
    seller:    'Vendedor',
    cajero:    'Cajero',
    repositor: 'Repositor',
  }
  return labels[role] ?? role
}

// Día 1 del mes actual 00:00:00 en hora local del browser (para month-comparison)
export function getLocalMonthStart(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// Lunes 00:00:00 en hora local del browser (para week-comparison)
export function getLocalWeekStart(): string {
  const now = new Date()
  const day = now.getDay() // 0=dom, 1=lun, ..., 6=sab
  const daysFromMonday = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysFromMonday)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString()
}

// Períodos para filtros de fecha
export function getPeriodDates(period: 'today' | 'week' | 'month' | 'year') {
  const now = new Date()
  const from = new Date()

  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      break
    case 'week':
      from.setDate(now.getDate() - 7)
      break
    case 'month':
      from.setMonth(now.getMonth() - 1)
      break
    case 'year':
      from.setFullYear(now.getFullYear() - 1)
      break
  }

  return {
    from: from.toISOString(),
    to:   now.toISOString(),
  }
}
