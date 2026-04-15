'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { CustomerSummary } from '@/app/customers/page'

interface CustomerModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  customer?: CustomerSummary | null
}

const DOCUMENT_TYPES = [
  { value: 'DNI',       label: 'DNI' },
  { value: 'CUIT',      label: 'CUIT' },
  { value: 'CUIL',      label: 'CUIL' },
  { value: 'RUT',       label: 'RUT' },
  { value: 'CI',        label: 'CI' },
  { value: 'Pasaporte', label: 'Pasaporte' },
  { value: 'Otro',      label: 'Otro' },
]

const LATAM_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia',
  'Ecuador', 'México', 'Paraguay', 'Perú', 'Uruguay', 'Venezuela',
].map(c => ({ value: c, label: c }))

const AR_PROVINCES = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
].map(p => ({ value: p, label: p }))

const empty = {
  customer_code: '',
  full_name:     '',
  document_type: '',
  document:      '',
  phone:         '',
  email:         '',
  address:       '',
  locality:      '',
  province:      '',
  postal_code:   '',
  country:       'Argentina',
  birthdate:     '',
  credit_limit:  '',
  notes:         '',
}

export function CustomerModal({ open, onClose, onSaved, customer }: CustomerModalProps) {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = !!customer

  useEffect(() => {
    if (!open) return
    if (!customer) { setForm(empty); setErrors({}); return }

    // Fetch fresco para garantizar que los nuevos campos estén disponibles
    api.get<CustomerSummary>(`/api/customers/${customer.id}`)
      .then(data => {
        setForm({
          customer_code: data.customer_code ?? '',
          full_name:     data.full_name,
          document_type: data.document_type ?? '',
          document:      data.document ?? '',
          phone:         data.phone ?? '',
          email:         data.email ?? '',
          address:       data.address ?? '',
          locality:      data.locality ?? '',
          province:      data.province ?? '',
          postal_code:   data.postal_code ?? '',
          country:       data.country ?? 'Argentina',
          birthdate:     data.birthdate ?? '',
          credit_limit:  data.credit_limit > 0 ? String(data.credit_limit) : '',
          notes:         data.notes ?? '',
        })
      })
      .catch(() => toast.error('Error al cargar datos del cliente'))
    setErrors({})
  }, [customer, open])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { setErrors({ full_name: 'El nombre es obligatorio' }); return }
    setSaving(true)
    try {
      const payload = {
        customer_code: form.customer_code.trim() || null,
        full_name:     form.full_name.trim(),
        document_type: form.document_type || null,
        document:      form.document.trim() || null,
        phone:         form.phone.trim() || null,
        email:         form.email.trim() || null,
        address:       form.address.trim() || null,
        locality:      form.locality.trim() || null,
        province:      form.province.trim() || null,
        postal_code:   form.postal_code.trim() || null,
        country:       form.country || null,
        birthdate:     form.birthdate || null,
        credit_limit:  Number(form.credit_limit) || 0,
        notes:         form.notes.trim() || null,
      }
      if (isEdit) {
        await api.patch(`/api/customers/${customer!.id}`, payload)
        toast.success('Cliente actualizado')
      } else {
        await api.post('/api/customers', payload)
        toast.success('Cliente creado')
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const isArgentina = form.country === 'Argentina'

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar cliente' : 'Nuevo cliente'} size="lg">
      <div className="space-y-5">

        {/* Datos básicos */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider">Datos básicos</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Nombre y apellido *" value={form.full_name} onChange={set('full_name')}
              placeholder="Ej: Juan García" error={errors.full_name} />
            <Input label="SKU / Código" value={form.customer_code} onChange={set('customer_code')}
              placeholder="Ej: CLI-001" hint="Identificador único opcional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Tipo de documento"
              value={form.document_type}
              onChange={set('document_type')}
              options={DOCUMENT_TYPES}
              placeholder="Seleccionar..."
            />
            <Input label="Número de documento" value={form.document} onChange={set('document')}
              placeholder="Ej: 20-12345678-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Teléfono" value={form.phone} onChange={set('phone')} placeholder="+54 11 1234-5678" />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="cliente@email.com" />
          </div>
        </section>

        {/* Ubicación */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider">Ubicación</p>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="País"
              value={form.country}
              onChange={set('country')}
              options={LATAM_COUNTRIES}
              placeholder="Seleccionar..."
            />
            {isArgentina ? (
              <Select
                label="Provincia"
                value={form.province}
                onChange={set('province')}
                options={AR_PROVINCES}
                placeholder="Seleccionar..."
              />
            ) : (
              <Input label="Provincia / Estado" value={form.province} onChange={set('province')}
                placeholder="Ej: São Paulo" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Localidad" value={form.locality} onChange={set('locality')}
              placeholder="Ej: Palermo" />
            <Input label="Código postal" value={form.postal_code} onChange={set('postal_code')}
              placeholder="Ej: 1425" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Dirección" value={form.address} onChange={set('address')}
              placeholder="Calle, número, piso..." />
            <Input label="Fecha de nacimiento" type="date" value={form.birthdate} onChange={set('birthdate')} />
          </div>
        </section>

        {/* Cuenta corriente */}
        <section className="space-y-3">
          <p className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wider">Cuenta corriente</p>
          <Input
            label="Límite de crédito"
            type="number" min="0" step="0.01"
            value={form.credit_limit}
            onChange={set('credit_limit')}
            placeholder="0 = sin límite"
            hint="Dejá en 0 para no aplicar límite de crédito"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Notas</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              placeholder="Observaciones del cliente..."
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] resize-none" />
          </div>
        </section>

        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{isEdit ? 'Guardar cambios' : 'Crear cliente'}</Button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
