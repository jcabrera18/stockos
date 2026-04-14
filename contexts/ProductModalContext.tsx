'use client'
import { createContext, useContext, useRef, useState } from 'react'
import type { Product } from '@/types'

interface ProductModalContextValue {
  openProductModal: (product?: Product | null, onSaved?: () => void) => void
  closeProductModal: () => void
  open: boolean
  product: Product | null
  onSaved: () => void
}

const ProductModalContext = createContext<ProductModalContextValue | null>(null)

export function ProductModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const onSavedRef = useRef<(() => void) | undefined>(undefined)

  const openProductModal = (prod?: Product | null, onSaved?: () => void) => {
    setProduct(prod ?? null)
    onSavedRef.current = onSaved
    setOpen(true)
  }

  const closeProductModal = () => {
    setOpen(false)
    setProduct(null)
    onSavedRef.current = undefined
  }

  return (
    <ProductModalContext.Provider value={{
      openProductModal,
      closeProductModal,
      open,
      product,
      onSaved: () => onSavedRef.current?.(),
    }}>
      {children}
    </ProductModalContext.Provider>
  )
}

export function useProductModal() {
  const ctx = useContext(ProductModalContext)
  if (!ctx) throw new Error('useProductModal must be used within ProductModalProvider')
  return ctx
}
