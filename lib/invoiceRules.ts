// Reglas de qué tipo de factura puede emitir el comercio según SU condición IVA.
// Códigos del negocio (businesses.iva_condition): 'RI' | 'MO' | 'EX' (default MO).
//   - Monotributo (MO):          solo Factura C
//   - Responsable Inscripto (RI): Factura A (a RI) y B (a consumidor final)
//   - Exento (EX):                Factura B y C
//   - Cualquier otro / sin dato:  todos (fallback permisivo)
export type InvoiceLetter = 'A' | 'B' | 'C'

export function allowedInvoiceTypes(ivaCondition?: string | null): InvoiceLetter[] {
  switch (ivaCondition) {
    case 'MO': return ['C']
    case 'RI': return ['A', 'B']
    case 'EX': return ['B', 'C']
    default:   return ['A', 'B', 'C']
  }
}

export const IVA_CONDITION_LABELS: Record<string, string> = {
  RI: 'Responsable Inscripto',
  MO: 'Monotributo',
  EX: 'Exento',
}
