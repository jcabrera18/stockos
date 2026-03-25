'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { Tag, Plus, Pencil, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'

interface Brand {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal
  const [modal, setModal] = useState(false)
  const [editBrand, setEditBrand] = useState<Brand | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Confirm delete
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteBrand, setDeleteBrand] = useState<Brand | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchBrands = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Brand[]>('/api/brands', search ? { search } : {})
      setBrands(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchBrands() }, [fetchBrands])

  const openCreate = () => {
    setEditBrand(null)
    setName('')
    setModal(true)
  }

  const openEdit = (brand: Brand) => {
    setEditBrand(brand)
    setName(brand.name)
    setModal(true)
  }

  const handleSave = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      if (editBrand) {
        await api.patch(`/api/brands/${editBrand.id}`, { name: name.trim() })
        toast.success('Marca actualizada')
      } else {
        await api.post('/api/brands', { name: name.trim() })
        toast.success('Marca creada')
      }
      setModal(false)
      fetchBrands()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteBrand) return
    setDeleting(true)
    try {
      await api.delete(`/api/brands/${deleteBrand.id}`)
      toast.success('Marca eliminada')
      setDeleteModal(false)
      setDeleteBrand(null)
      fetchBrands()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  return (
    <AppShell>
      <PageHeader
        title="Marcas"
        description={`${brands.length} marcas`}
        action={
          <Button onClick={openCreate}><Plus size={15} /> Nueva marca</Button>
        }
      />

      <div className="p-5 space-y-4">

        {/* Buscador */}
        <div className="relative max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar marca..."
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {loading ? <PageLoader /> : brands.length === 0 ? (
          <EmptyState icon={Tag} title="Sin marcas"
            description="Creá tu primera marca para organizarla en productos."
            action={<Button onClick={openCreate}><Plus size={15} /> Nueva marca</Button>}
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Nombre</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {brands.map(brand => (
                  <tr key={brand.id} className="hover:bg-[var(--surface2)] transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-[var(--surface2)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--accent-subtle)]">
                          <Tag size={13} className="text-[var(--text3)] group-hover:text-[var(--accent)]" />
                        </div>
                        <span className="font-medium text-[var(--text)]">{brand.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(brand)}
                          className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => { setDeleteBrand(brand); setDeleteModal(true) }}
                          className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editBrand ? 'Editar marca' : 'Nueva marca'} size="sm">
        <div className="space-y-4">
          <Input label="Nombre *" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Coca Cola, Unilever, La Serenísima..."
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
          />
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>
                {editBrand ? 'Guardar' : 'Crear marca'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteBrand(null) }}
        onConfirm={handleDelete}
        title="Eliminar marca"
        message={`¿Eliminás "${deleteBrand?.name}"? Si tiene productos asociados no se podrá eliminar.`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />
    </AppShell>
  )
}
