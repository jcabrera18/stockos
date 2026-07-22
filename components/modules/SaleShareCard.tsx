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
  cuit?: string | null
  ivaConditionLabel?: string | null
  address?: string | null
  phone?: string | null
}

/**
 * Datos fiscales del comprobante autorizado por ARCA. Cuando se pasa este prop,
 * la tarjeta se renderiza en modo factura (con receptor, CAE y QR) en lugar del
 * comprobante interno de venta. Sigue siendo una tarjeta linda para WhatsApp,
 * NO el ticket térmico (eso va por buildInvoiceTicketHtml/printThermal aparte).
 */
export interface SaleShareInvoice {
  typeLabel: string              // "Factura B"
  invoiceType: string            // "A" | "B" | "C" | ...
  numero?: number
  ptoVenta: number
  cae?: string
  caeVto?: string
  qrDataUrl?: string
  receptorName?: string
  receptorIvaLabel?: string
  receptorCuit?: string
  receptorAddress?: string
  netAmount?: number
  ivaAmount?: number
  /** Ítems tal como salen de la factura (pueden diferir de los de la venta). */
  items?: SaleShareItem[]
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
  /** Si la venta está facturada, la tarjeta muestra los datos fiscales de ARCA. */
  invoice?: SaleShareInvoice
}

// ── Estilos compartidos ──
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
const microLabel: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em',
}
const fieldValue: React.CSSProperties = { fontSize: '13px', fontWeight: 500, color: '#334155', marginTop: '2px' }

function ItemRow({ item }: { item: SaleShareItem }) {
  const lineTotal = item.unit_price * item.quantity - item.discount
  return (
    <div style={{ marginBottom: '13px' }}>
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
}

function PaymentBlock({
  paymentMethod, installments, paymentSplits,
}: Pick<SaleShareCardProps, 'paymentMethod' | 'installments' | 'paymentSplits'> & { installments: number }) {
  if (paymentSplits && paymentSplits.length > 1) {
    return (
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
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
      <span>Forma de pago</span>
      <span style={{ fontWeight: 600, color: '#334155' }}>
        {getPaymentMethodLabel(paymentMethod)}
        {paymentMethod === 'credito' && installments > 1 && ` · ${installments} cuotas`}
      </span>
    </div>
  )
}

/**
 * Tarjeta moderna de comprobante de venta — el nodo que se captura como imagen
 * para compartir por WhatsApp (y que se muestra como preview en el POS).
 * NO es el ticket térmico: eso va por buildSaleTicketHtml/printThermal aparte.
 *
 * Si `invoice` está presente, la tarjeta se renderiza en modo factura ARCA
 * (con receptor, CAE y QR) manteniendo el mismo look lindo para WhatsApp.
 */
export const SaleShareCard = forwardRef<HTMLDivElement, SaleShareCardProps>(function SaleShareCard(
  {
    business, saleId, createdAt, total,
    discount = 0, shippingAmount = 0,
    paymentMethod, installments = 1, paymentSplits,
    items, branchName, sellerName, customerName,
    invoice,
  },
  ref,
) {
  // ── Modo factura ARCA ──
  if (invoice) {
    const invItems = invoice.items && invoice.items.length > 0 ? invoice.items : items
    const numeroStr = invoice.numero !== undefined
      ? `${String(invoice.ptoVenta).padStart(5, '0')}-${String(invoice.numero).padStart(8, '0')}`
      : null
    return (
      <div ref={ref} style={CARD_STYLE}>
        <div style={ACCENT_BAR} />
        <div style={{ padding: '26px 26px 22px' }}>
          {/* Encabezado: negocio + tipo/nº comprobante */}
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
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {invoice.typeLabel}
              </div>
              {numeroStr && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', fontFamily: 'monospace' }}>
                  N° {numeroStr}
                </div>
              )}
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                {formatDateTime(createdAt)}
              </div>
            </div>
          </div>

          {/* Datos fiscales del emisor */}
          {(business?.cuit || business?.ivaConditionLabel || business?.address || business?.phone) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginTop: '16px' }}>
              {business?.cuit && (
                <div><div style={microLabel}>CUIT</div><div style={fieldValue}>{business.cuit}</div></div>
              )}
              {business?.ivaConditionLabel && (
                <div><div style={microLabel}>Cond. IVA</div><div style={fieldValue}>{business.ivaConditionLabel}</div></div>
              )}
              {business?.address && (
                <div><div style={microLabel}>Domicilio</div><div style={fieldValue}>{business.address}</div></div>
              )}
              {business?.phone && (
                <div><div style={microLabel}>Teléfono</div><div style={fieldValue}>{business.phone}</div></div>
              )}
            </div>
          )}

          <div style={{ height: '1px', background: '#eef2f6', margin: '18px 0' }} />

          {/* Receptor */}
          <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '13px 16px', marginBottom: '18px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receptor</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {invoice.receptorName ?? customerName ?? 'Consumidor Final'}
            </div>
            <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
              {[invoice.receptorIvaLabel, invoice.receptorCuit && `CUIT ${invoice.receptorCuit}`, invoice.receptorAddress]
                .filter(Boolean).join(' · ')}
            </div>
          </div>

          {/* Detalle */}
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Detalle
          </div>
          {invItems.map((item, i) => <ItemRow key={i} item={item} />)}

          <div style={{ height: '1px', background: '#eef2f6', margin: '16px 0' }} />

          {/* Neto + IVA (Factura A) */}
          {invoice.invoiceType === 'A' && (
            <div style={{ fontSize: '13px', lineHeight: 1.9, marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Neto gravado</span><span>{formatCurrency(invoice.netAmount ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>IVA 21%</span><span>{formatCurrency(invoice.ivaAmount ?? 0)}</span>
              </div>
            </div>
          )}

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#334155' }}>Total</span>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.02em' }}>{formatCurrency(total)}</span>
          </div>

          {/* Forma de pago */}
          <div style={{ marginTop: '10px' }}>
            <PaymentBlock paymentMethod={paymentMethod} installments={installments} paymentSplits={paymentSplits} />
          </div>

          <div style={{ height: '1px', background: '#eef2f6', margin: '18px 0' }} />

          {/* CAE + QR ARCA */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...microLabel, color: '#94a3b8' }}>Comprobante autorizado por ARCA</div>
            {invoice.cae && (
              <div style={{ fontSize: '13px', color: '#334155', marginTop: '7px' }}>
                CAE: <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{invoice.cae}</span>
              </div>
            )}
            {invoice.caeVto && (
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Vto.: {invoice.caeVto}</div>
            )}
            {invoice.qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={invoice.qrDataUrl} alt="QR ARCA" style={{ width: '116px', height: '116px', display: 'block', margin: '13px auto 4px' }} />
            )}
            <div style={{ fontSize: '10px', color: '#cbd5e1', marginBottom: '10px' }}>Verificar en afip.gob.ar/fe/qr</div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 58" width="94" height="32" style={{ display: 'block', margin: '0 auto' }}>
              <text x="85" y="38" textAnchor="middle" fontFamily="Arial Black,Arial" fontSize="44" fontWeight="900" fill="#0f172a">ARCA</text>
              <text x="85" y="49" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="7.5" fill="#0f172a" letterSpacing="1">AGENCIA DE RECAUDACION</text>
              <text x="85" y="58" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="7.5" fill="#0f172a" letterSpacing="1">Y CONTROL ADUANERO</text>
            </svg>
          </div>

          {/* Footer con logo StockOS */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="16" height="16" aria-hidden>
                <rect width="32" height="32" rx="8" fill="#16a34a" />
                <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white" />
              </svg>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                Generado por <span style={{ fontWeight: 700, color: '#0f172a' }}>Stock<span style={{ color: '#16a34a' }}>OS</span></span>
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '5px', letterSpacing: '0.03em' }}>stockos.digital</div>
          </div>
        </div>
      </div>
    )
  }

  // ── Modo comprobante interno de venta (sin factura) ──
  const itemsSubtotal = items.reduce((a, i) => a + i.unit_price * i.quantity - i.discount, 0)

  return (
    <div ref={ref} style={CARD_STYLE}>
      {/* Barra superior de acento */}
      <div style={ACCENT_BAR} />

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

        {items.map((item, i) => <ItemRow key={i} item={item} />)}

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
          <PaymentBlock paymentMethod={paymentMethod} installments={installments} paymentSplits={paymentSplits} />
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
