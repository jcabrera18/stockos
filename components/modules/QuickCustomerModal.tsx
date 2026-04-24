// components/modules/QuickCustomerModal.tsx
'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { CustomerSummary } from '@/app/customers/page'

interface QuickCustomerModalProps {
  open: boolean
  onClose: () => void
  onCreated: (customer: CustomerSummary) => void
  initialName?: string  // pre-carga el nombre que escribió el cajero
}

export function QuickCustomerModal({
  open, onClose, onCreated, initialName = ''
}: QuickCustomerModalProps) {
  const [form, setForm] = useState({ full_name: initialName, document: '', phone: '', credit_limit: '' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setForm({ full_name: initialName, document: '', phone: '', credit_limit: '' })
    setErrors({})
  }, [open, initialName])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setErrors({ full_name: 'El nombre es obligatorio' })
      return
    }
    setSaving(true)
    try {
      const customer = await api.post<CustomerSummary>('/api/customers', {
        full_name: form.full_name.trim(),
        document: form.document.trim() || null,
        phone: form.phone.trim() || null,
        credit_limit: Number(form.credit_limit) || 0,
      })
      toast.success(`Cliente "${customer.full_name}" creado`)
      onCreated(customer)
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear el cliente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo cliente" size="sm">
      <div className="space-y-4">

        <div className="px-3 py-2 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)] text-xs text-[var(--accent)]">
          El carrito se mantiene — podés continuar la venta después de crear el cliente.
        </div>

        <Input
          label="Nombre y apellido *"
          value={form.full_name}
          onChange={set('full_name')}
          placeholder="Ej: Juan García"
          error={errors.full_name}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="CUIT / DNI"
            value={form.document}
            onChange={set('document')}
            placeholder="20-12345678-9"
          />
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={set('phone')}
            placeholder="11-1234-5678"
          />
        </div>
        <Input
          label="Límite de crédito"
          type="number"
          min="0"
          step="1000"
          value={form.credit_limit}
          onChange={set('credit_limit')}
          placeholder="0 = sin límite"
          hint="Podés modificarlo después desde Clientes"
        />

        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Crear y seleccionar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
