# Patch POS

## Archivos NUEVOS a copiar en el FRONTEND (stockos/)

1. `app/pos/page.tsx`                    → nuevo archivo (crear carpeta app/pos/)
2. `components/modules/POSTicket.tsx`    → nuevo archivo

## Cambio en app/sales/page.tsx

Reemplazá el botón "Nueva venta" para que redirija al POS.

Cambiar el import, agregar useRouter y actualizar el botón:

```typescript
// Agregar al inicio del archivo:
import { useRouter } from 'next/navigation'

// Dentro del componente, agregar:
const router = useRouter()

// Cambiar el botón en PageHeader:
action={
  <Button onClick={() => router.push('/pos')}>
    <Plus size={15} /> Nueva venta
  </Button>
}
```

## Deploy

```bash
cd stockos
git add .
git commit -m "feat: POS punto de venta completo"
git push
```
