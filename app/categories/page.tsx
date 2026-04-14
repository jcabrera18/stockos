'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import type { Category } from '@/types'
import { Plus, Pencil, Trash2, Tag, Search, X } from 'lucide-react'
import { toast } from 'sonner'

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[]
}

// Construir árbol de categorías
function buildTree(categories: Category[]): CategoryWithChildren[] {
  const map = new Map<string, CategoryWithChildren>()
  const roots: CategoryWithChildren[] = []

  categories.forEach(c => map.set(c.id, { ...c, children: [] }))

  categories.forEach(c => {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Modal crear/editar
  const [modal, setModal] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [formName, setFormName] = useState('')
  const [formParent, setFormParent] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // Búsqueda
  const [search, setSearch] = useState('')

  // Modal eliminar
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteCat, setDeleteCat] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCategories = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api.get<Category[]>('/api/products/categories')
      setCategories(data)
    } catch (err) { console.error(err) }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const [formParentLocked, setFormParentLocked] = useState(false)

  const openCreate = (parentId?: string) => {
    setEditCat(null)
    setFormName('')
    setFormParent(parentId ?? '')
    setFormParentLocked(!!parentId)
    setFormError('')
    setModal(true)
  }

  const openEdit = (cat: Category) => {
    setEditCat(cat)
    setFormName(cat.name)
    setFormParent(cat.parent_id ?? '')
    setFormParentLocked(false)
    setFormError('')
    setModal(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: formName.trim(),
        parent_id: formParent || null,
      }
      if (editCat) {
        // No hay PATCH de categorías en la API, usamos el endpoint de productos
        await api.post('/api/products/categories', payload)
        // Si es edición eliminamos la anterior y creamos nueva
        // Por simplicidad: delete + create
        await api.delete(`/api/products/categories/${editCat.id}`)
        toast.success('Categoría actualizada')
        setModal(false)
      } else {
        await api.post('/api/products/categories', payload)
        toast.success('Categoría creada')
        setModal(false)
      }
      fetchCategories(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteCat) return
    setDeleting(true)
    try {
      await api.delete(`/api/products/categories/${deleteCat.id}`)
      toast.success('Categoría eliminada')
      setDeleteModal(false)
      setDeleteCat(null)
      fetchCategories(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  const tree = buildTree(categories)

  // Mapa id → ruta de nombres (para breadcrumb en búsqueda)
  const pathMap = (() => {
    const map = new Map<string, string[]>()
    const build = (cats: CategoryWithChildren[], ancestors: string[]) => {
      cats.forEach(cat => {
        map.set(cat.id, [...ancestors, cat.name])
        build(cat.children, [...ancestors, cat.name])
      })
    }
    build(tree, [])
    return map
  })()

  // Resultados de búsqueda: lista plana de categorías que coinciden
  const searchResults = search.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  // Resaltar texto coincidente
  const highlight = (text: string, query: string) => {
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return <span>{text}</span>
    return (
      <span>
        {text.slice(0, idx)}
        <mark className="bg-[var(--accent-subtle)] text-[var(--accent)] rounded px-0.5 font-semibold not-italic">
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </span>
    )
  }

  function flattenTree(cats: CategoryWithChildren[], depth = 0): { value: string; label: string }[] {
    return cats.flatMap(cat => [
      {
        value: cat.id,
        label: `${'—'.repeat(depth)} ${cat.name}`.trim(),
      },
      ...flattenTree(cat.children, depth + 1),
    ])
  }

  // Opciones para el select de padre (excluye la categoría que se está editando)
  const parentOptions = flattenTree(
    buildTree(categories.filter(c => c.id !== editCat?.id))
  )

  // Contar productos por categoría no disponible sin join extra — mostramos solo el árbol
  const renderCategory = (cat: CategoryWithChildren, depth = 0) => (
    <div key={cat.id}>
      <div
        className="flex items-center justify-between hover:bg-[var(--surface2)] transition-colors group border-b border-[var(--border)] last:border-0"
        style={{ paddingLeft: `${16 + depth * 20}px`, paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {depth > 0 && (
            <div className="flex items-center flex-shrink-0" style={{ marginLeft: `-4px` }}>
              {/* Línea vertical de conexión */}
              <span className="text-[var(--border)] text-xs select-none">{'└'}</span>
            </div>
          )}
          <Tag
            size={13}
            className="flex-shrink-0"
            style={{ color: depth === 0 ? 'var(--accent)' : `hsl(${200 + depth * 30}, 60%, 55%)` }}
          />
          <span className={`text-sm truncate ${depth === 0 ? 'font-semibold text-[var(--text)]' : 'text-[var(--text2)]'}`}>
            {cat.name}
          </span>
          {cat.children.length > 0 && (
            <span className="text-xs text-[var(--text3)] ml-1 flex-shrink-0">
              ({cat.children.length})
            </span>
          )}
          {/* Badge de nivel */}
          {depth > 0 && (
            <span className="text-xs text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded flex-shrink-0">
              nivel {depth + 1}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Agregar subcategoría — disponible en todos los niveles */}
          <button
            onClick={() => openCreate(cat.id)}
            title="Agregar subcategoría"
            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={() => openEdit(cat)}
            title="Editar"
            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => { setDeleteCat(cat); setDeleteModal(true) }}
            title="Eliminar"
            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Hijos — recursivo sin límite de profundidad */}
      {cat.children.map(child => renderCategory(child, depth + 1))}
    </div>
  )

  return (
    <AppShell>
      <PageHeader
        title="Categorías"
        description={`${categories.length} categorías`}
        action={
          <Button onClick={() => openCreate()}>
            <Plus size={15} /> Nueva categoría
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        {/* Buscador */}
        {!loading && categories.length > 0 && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar categoría..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {loading ? <PageLoader /> : categories.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Sin categorías"
            description="Creá categorías para organizar tus productos."
            action={<Button onClick={() => openCreate()}><Plus size={15} /> Nueva categoría</Button>}
          />
        ) : search.trim() ? (
          /* Vista de búsqueda — lista plana con breadcrumb */
          searchResults.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] py-12 text-center">
              <Search size={28} className="mx-auto mb-3 text-[var(--text3)]" />
              <p className="text-sm text-[var(--text2)]">Sin resultados para <strong>"{search}"</strong></p>
            </div>
          ) : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)]">
                <p className="text-xs text-[var(--text3)]">
                  {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para <strong>"{search}"</strong>
                </p>
              </div>
              {searchResults.map((cat, i) => {
                const path = pathMap.get(cat.id) ?? [cat.name]
                const breadcrumb = path.slice(0, -1) // ancestros sin el nombre actual
                const isLast = i === searchResults.length - 1
                return (
                  <div
                    key={cat.id}
                    className={`flex items-center justify-between px-4 py-3 hover:bg-[var(--surface2)] transition-colors group ${!isLast ? 'border-b border-[var(--border)]' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag size={13} className="flex-shrink-0 text-[var(--accent)]" />
                      <div className="min-w-0">
                        {/* Breadcrumb de ruta */}
                        {breadcrumb.length > 0 && (
                          <p className="text-xs text-[var(--text3)] truncate mb-0.5 flex items-center gap-1">
                            {breadcrumb.map((seg, si) => (
                              <span key={si} className="flex items-center gap-1">
                                {si > 0 && <span className="text-[var(--border)]">›</span>}
                                {seg}
                              </span>
                            ))}
                            <span className="text-[var(--border)]">›</span>
                          </p>
                        )}
                        <span className="text-sm font-medium text-[var(--text)]">
                          {highlight(cat.name, search.trim())}
                        </span>
                      </div>
                      {breadcrumb.length === 0 && (
                        <span className="text-xs text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded flex-shrink-0">
                          nivel 1
                        </span>
                      )}
                      {breadcrumb.length > 0 && (
                        <span className="text-xs text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded flex-shrink-0">
                          nivel {breadcrumb.length + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => openCreate(cat.id)}
                        title="Agregar subcategoría"
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        onClick={() => openEdit(cat)}
                        title="Editar"
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { setDeleteCat(cat); setDeleteModal(true) }}
                        title="Eliminar"
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          /* Vista de árbol normal */
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            {tree.map(cat => renderCategory(cat))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editCat ? 'Editar categoría' : formParentLocked ? 'Nueva subcategoría' : 'Nueva categoría'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={formName}
            onChange={e => { setFormName(e.target.value); setFormError('') }}
            placeholder="Ej: Bebidas, Lácteos, Limpieza..."
            error={formError}
            autoFocus
          />
          {(!editCat && !formParentLocked) ? null : formParentLocked ? (
            <div>
              <p className="text-xs font-medium text-[var(--text2)] mb-1">Categoría padre</p>
              <p className="text-sm text-[var(--text)] bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2">
                {parentOptions.find(o => o.value === formParent)?.label ?? '—'}
              </p>
            </div>
          ) : (
            <Select
              label="Categoría padre"
              options={parentOptions}
              value={formParent}
              onChange={e => setFormParent(e.target.value)}
              placeholder="Sin categoría padre (raíz)"
            />
          )}
          <p className="text-xs text-[var(--text3)]">
            {formParentLocked
              ? 'Esta subcategoría se creará dentro de la categoría seleccionada.'
              : editCat
              ? 'Podés cambiar la categoría padre o dejarla sin padre (raíz).'
              : 'Esta categoría se creará como categoría principal (nivel 1). Para agregar subcategorías, hacé click en el ícono + de la categoría correspondiente.'}
          </p>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>
                {editCat ? 'Guardar cambios' : 'Crear categoría'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteCat(null) }}
        onConfirm={handleDelete}
        title="Eliminar categoría"
        message={`¿Eliminás "${deleteCat?.name}"? Los productos asociados quedarán sin categoría.${deleteCat && categories.some(c => c.parent_id === deleteCat.id) ? ' Las subcategorías también se verán afectadas.' : ''}`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />
    </AppShell>
  )
}
