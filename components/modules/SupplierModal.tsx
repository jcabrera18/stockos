'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import type { Supplier } from '@/types'
import { toast } from 'sonner'

interface SupplierModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  supplier?: Supplier | null
}

const emptyForm = { name: '', cuit: '', phone: '', email: '', address: '', notes: '' }

export function SupplierModal({ open, onClose, onSaved, supplier }: SupplierModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = !!supplier

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        cuit: supplier.cuit ?? '',
        phone: supplier.phone ?? '',
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
      })
    } else {
      setForm(emptyForm)
    }
    setErrors({})
  }, [supplier, open])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setErrors({ name: 'El nombre es obligatorio' }); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        cuit: form.cuit.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (isEdit) {
        await api.patch(`/api/purchases/suppliers/${supplier!.id}`, payload)
        toast.success('Proveedor actualizado')
      } else {
        await api.post('/api/purchases/suppliers', payload)
        toast.success('Proveedor creado')
      }
      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar proveedor' : 'Nuevo proveedor'} size="md">
      <div className="space-y-4">
        <Input label="Nombre *" value={form.name} onChange={set('name')} placeholder="Ej: Distribuidora Norte" error={errors.name} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="CUIT" value={form.cuit} onChange={set('cuit')} placeholder="20-12345678-9" />
          <Input label="Teléfono" value={form.phone} onChange={set('phone')} placeholder="+54 11 1234-5678" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="ventas@proveedor.com" />
          <Input label="Dirección" value={form.address} onChange={set('address')} placeholder="Calle 123, Ciudad" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text2)]">Notas</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            placeholder="Condiciones de pago, contacto, etc."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] resize-none"
          />
        </div>
        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>{isEdit ? 'Guardar cambios' : 'Crear proveedor'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
