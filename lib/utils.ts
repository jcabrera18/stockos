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
