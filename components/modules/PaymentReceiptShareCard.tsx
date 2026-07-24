'use client'
import { forwardRef } from 'react'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export interface PaymentReceiptShareBusiness {
  name?: string | null
  cuit?: string | null
  address?: string | null
  phone?: string | null
}

export interface PaymentReceiptShareCardProps {
  business?: PaymentReceiptShareBusiness
  customerName: string
  customerDoc?: string
  amount: number
  methodLabel: string
  description?: string
  balanceBefore: number
  balanceAfter: number
  paidAt: string
}

// Mismo look que SaleShareCard: tarjeta linda para WhatsApp, NO el ticket térmico.
const CARD_STYLE: React.CSSProperties = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  color: '#0f172a',
  background: '#fff',
  width: '360px',
  borderRadius: '18px',
  overflow: 'hidden',
  boxShadow: '0 8px 30px rgba(0,0,0,0.16)',
}
const ACCENT_BAR: React.CSSProperties = { height: '6px', background: 'linear-gradient(90deg, #16a34a, #22c55e)' }

/**
 * Tarjeta moderna del recibo de pago de cuenta corriente — el nodo que se captura
 * como imagen para compartir por WhatsApp. Mismo diseño que SaleShareCard pero con
 * la info del ticket de recibo (monto pagado + saldos). NO es el ticket térmico.
 */
export const PaymentReceiptShareCard = forwardRef<HTMLDivElement, PaymentReceiptShareCardProps>(
  function PaymentReceiptShareCard(
    { business, customerName, customerDoc, amount, methodLabel, description, balanceBefore, balanceAfter, paidAt },
    ref,
  ) {
    const balanceLabel = balanceAfter === 0
      ? 'Saldo cancelado'
      : balanceAfter < 0 ? 'Saldo a favor' : 'Saldo restante'
    const showDescription = description && description !== 'Pago de cuenta corriente'

    return (
      <div ref={ref} style={CARD_STYLE}>
        <div style={ACCENT_BAR} />

        <div style={{ padding: '26px 26px 22px' }}>
          {/* Encabezado: negocio + tipo/fecha */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                {business?.name}
              </div>
              {(business?.cuit || business?.phone) && (
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                  {[business?.cuit && `CUIT ${business.cuit}`, business?.phone && `Tel: ${business.phone}`].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Recibo de pago
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
                {formatDateTime(paidAt)}
              </div>
            </div>
          </div>

          <div style={{ height: '1px', background: '#eef2f6', margin: '18px 0' }} />

          {/* Cliente destacado */}
          <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '13px 16px', marginBottom: '18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cliente</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{customerName}</div>
            {customerDoc && (
              <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>Doc: {customerDoc}</div>
            )}
          </div>

          {/* Monto pagado destacado */}
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monto pagado</div>
            <div style={{ fontSize: '34px', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.02em', marginTop: '2px' }}>
              {formatCurrency(amount)}
            </div>
            <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>{methodLabel}</div>
          </div>

          {showDescription && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
              <span>Concepto</span>
              <span style={{ fontWeight: 600, color: '#334155', textAlign: 'right', maxWidth: '200px' }}>{description}</span>
            </div>
          )}

          <div style={{ height: '1px', background: '#eef2f6', margin: '16px 0' }} />

          {/* Saldos */}
          <div style={{ fontSize: '13px', lineHeight: 1.9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>Saldo anterior</span><span>{formatCurrency(balanceBefore)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
              <span>Pago aplicado</span><span>− {formatCurrency(amount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #eef2f6' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>{balanceLabel}</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: balanceAfter > 0 ? '#dc2626' : '#16a34a', letterSpacing: '-0.02em' }}>
                {formatCurrency(balanceAfter)}
              </span>
            </div>
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
              stockos.digital · ¡Gracias por su pago!
            </div>
          </div>
        </div>
      </div>
    )
  },
)
