'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
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

const empty = { customer_code: '', full_name: '', document: '', phone: '', email: '', address: '', credit_limit: '', notes: '' }

export function CustomerModal({ open, onClose, onSaved, customer }: CustomerModalProps) {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = !!customer

  useEffect(() => {
    if (customer) {
      setForm({
        customer_code: customer.customer_code ?? '',
        full_name: customer.full_name,
        document: customer.document ?? '',
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        address: '',
        credit_limit: customer.credit_limit > 0 ? String(customer.credit_limit) : '',
        notes: customer.notes ?? '',
      })
    } else {
      setForm(empty)
    }
    setErrors({})
  }, [customer, open])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) { setErrors({ full_name: 'El nombre es obligatorio' }); return }
    setSaving(true)
    try {
      const payload = {
        customer_code: form.customer_code.trim() || null,
        full_name: form.full_name.trim(),
        document: form.document.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        credit_limit: Number(form.credit_limit) || 0,
        notes: form.notes.trim() || null,
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

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar cliente' : 'Nuevo cliente'} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre y apellido *" value={form.full_name} onChange={set('full_name')}
            placeholder="Ej: Juan García" error={errors.full_name} />
          <Input label="SKU / Código" value={form.customer_code} onChange={set('customer_code')}
            placeholder="Ej: CLI-001" hint="Identificador único opcional" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="CUIT / DNI" value={form.document} onChange={set('document')} placeholder="20-12345678-9" />
          <Input label="Teléfono" value={form.phone} onChange={set('phone')} placeholder="+54 11 1234-5678" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="cliente@email.com" />
          <Input label="Dirección" value={form.address} onChange={set('address')} placeholder="Calle 123" />
        </div>
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
