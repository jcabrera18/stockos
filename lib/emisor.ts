/**
 * Resuelve el EMISOR fiscal con el que se imprime un comprobante.
 *
 * Facturación multi-CUIT por sucursal: al autorizar, el comprobante guarda un
 * snapshot del emisor usado (`emisor_cuit` + `punto_venta`). Si ese snapshot
 * existe, se imprime con él (el CUIT/PtoVta de la sucursal). Si no, se usa el
 * emisor por defecto del negocio.
 *
 * IMPORTANTE (retrocompatibilidad): las facturas históricas tienen
 * `punto_venta` con el DEFAULT de la columna (1) y NINGÚN `emisor_cuit`. Por eso
 * el gate es la presencia de `emisor_cuit`, NO `punto_venta ?? ...`: si usáramos
 * el `??`, esas facturas viejas imprimirían PtoVta 1 en vez del real del negocio.
 */
export interface FiscalSnapshot {
  emisor_cuit?: string | null
  punto_venta?: number | null
}

type Emisor = { cuit?: string | null; afip_punto_venta?: number | null }

export function resolveEmisor<B extends Emisor>(
  business: B | null | undefined,
  invoice: FiscalSnapshot | null | undefined,
): B | undefined {
  if (!business) return undefined
  // Solo confiamos en el snapshot si trae emisor_cuit (facturas nuevas).
  if (!invoice?.emisor_cuit) return business
  return {
    ...business,
    cuit:             invoice.emisor_cuit ?? business.cuit,
    afip_punto_venta: invoice.punto_venta ?? business.afip_punto_venta,
  }
}
