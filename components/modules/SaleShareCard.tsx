'use client'
import { forwardRef } from 'react'
import { formatCurrency, formatDateTime, getPaymentMethodLabel } from '@/lib/utils'

export interface SaleShareItem {
  name: string
  quantity: number
  unit_price: number
  discount: number
}

export interface SaleShareBusiness {
  name?: string | null
}

export interface SaleShareCardProps {
  business?: SaleShareBusiness
  saleId: string
  createdAt: string
  total: number
  discount?: number
  shippingAmount?: number
  paymentMethod: string
  installments?: number
  paymentSplits?: Array<{ method: string; amount: number; installments?: number }>
  items: SaleShareItem[]
  branchName?: string
  sellerName?: string
  customerName?: string
}

/**
 * Tarjeta moderna de comprobante de venta — el nodo que se captura como imagen
 * para compartir por WhatsApp (y que se muestra como preview en el POS).
 * NO es el ticket térmico: eso va por buildSaleTicketHtml/printThermal aparte.
 */
export const SaleShareCard = forwardRef<HTMLDivElement, SaleShareCardProps>(function SaleShareCard(
  {
    business, saleId, createdAt, total,
    discount = 0, shippingAmount = 0,
    paymentMethod, installments = 1, paymentSplits,
    items, branchName, sellerName, customerName,
  },
  ref,
) {
  const itemsSubtotal = items.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)

  return (
    <div
      ref={ref}
      style={{
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: '#0f172a',
        background: '#fff',
        width: '360px',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.16)',
      }}
    >
      {/* Barra superior de acento */}
      <div style={{ height: '6px', background: 'linear-gradient(90deg, #16a34a, #22c55e)' }} />

      <div style={{ padding: '26px 26px 22px' }}>
        {/* Encabezado: negocio + comprobante/fecha */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              {business?.name}
            </div>
            {(branchName || sellerName) && (
              <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                {[branchName, sellerName].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Comprobante
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
              {formatDateTime(createdAt)}
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px', fontFamily: 'monospace' }}>
              #{saleId.slice(-8).toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ height: '1px', background: '#eef2f6', margin: '18px 0' }} />

        {/* Cliente destacado */}
        {customerName && (
          <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '13px 16px', marginBottom: '18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cliente</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{customerName}</div>
          </div>
        )}

        {/* Detalle */}
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Detalle
        </div>

        {items.map((item, i) => {
          const lineTotal = item.unit_price * item.quantity - item.discount
          return (
            <div key={i} style={{ marginBottom: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ flex: 1, fontSize: '15px', fontWeight: 600, color: '#0f172a', lineHeight: 1.25 }}>
                  {item.name}
                </span>
                <span style={{ flexShrink: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: 1.25 }}>{formatCurrency(lineTotal)}</span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                {item.quantity} × {formatCurrency(item.unit_price)}
                {item.discount > 0 && <span> · dto -{formatCurrency(item.discount)}</span>}
              </div>
            </div>
          )
        })}

        <div style={{ height: '1px', background: '#eef2f6', margin: '16px 0' }} />

        {/* Subtotales opcionales */}
        {(discount > 0 || shippingAmount > 0) && (
          <div style={{ fontSize: '13px', lineHeight: 1.9, marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>Subtotal</span><span>{formatCurrency(itemsSubtotal)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>Descuento</span><span>-{formatCurrency(discount)}</span>
              </div>
            )}
            {shippingAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Envío</span><span>+{formatCurrency(shippingAmount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>Total</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.02em' }}>{formatCurrency(total)}</span>
        </div>

        {/* Forma de pago */}
        <div style={{ marginTop: '10px' }}>
          {paymentSplits && paymentSplits.length > 1 ? (
            <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.9 }}>
              {paymentSplits.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{getPaymentMethodLabel(s.method)}</span>
                  <span style={{ fontWeight: 600, color: '#334155' }}>
                    {formatCurrency(s.amount)}
                    {s.method === 'credito' && (s.installments ?? 1) > 1 && ` (${s.installments} ctas)`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
              <span>Forma de pago</span>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                {getPaymentMethodLabel(paymentMethod)}
                {paymentMethod === 'credito' && installments > 1 && ` · ${installments} cuotas`}
              </span>
            </div>
          )}
        </div>

        {/* Footer con logo StockOS */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#16a34a" />
              <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white" />
            </svg>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              Generado por <span style={{ fontWeight: 700, color: '#0f172a' }}>Stock<span style={{ color: '#16a34a' }}>OS</span></span>
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '5px', letterSpacing: '0.03em' }}>
            stockos.digital · No válido como factura
          </div>
        </div>
      </div>
    </div>
  )
})
