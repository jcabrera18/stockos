# Gestión manual de suscripciones — StockOS

Guía operativa para administrar los estados de suscripción de cada negocio
directamente en Supabase mientras no hay un proveedor de pagos integrado.

---

## Estados posibles

| Estado | Qué significa | Qué ve el cliente |
|---|---|---|
| `trialing` | Período de prueba activo | Nada (si faltan > 3 días) o banner amarillo |
| `active` | Suscripción paga y vigente | Nada |
| `grace` | Prueba vencida, extensión automática de 5 días | Modal dismissible una vez por día |
| `past_due` | Sin pago, sistema pausado | Modal bloqueante con WhatsApp |
| `canceled` | Cancelado explícitamente | Nada (acceso depende de lo que decidas) |

---

## Ciclo de vida de un cliente nuevo

```
Registro
   ↓
trialing (10 días automáticos)
   ↓ vence sin pagar
grace (5 días automáticos — se activa al hacer login)
   ↓ vence sin pagar
past_due (modal bloqueante)
   ↓ paga
active
   ↓ vence current_period_end sin pagar
past_due
   ↓ paga
active  ← loop mensual/anual
```

---

## Dónde ejecutar las queries

1. Ir a [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**
2. Pegar la query correspondiente y ejecutar
3. Verificar que diga `1 row affected` (o el número que corresponda)

---

## Paso a paso por situación

---

### 1. Cliente nuevo se registra

No hay que hacer nada. El sistema lo crea automáticamente como `trialing` por 10 días.

Si querés verificar su estado:

```sql
SELECT id, name, subscription_status, plan, trial_ends_at
FROM businesses
WHERE name ILIKE '%nombre del cliente%';
```

---

### 2. Cliente decide pagar durante el trial (antes de que venza)

Ejecutar según el plan que contrató:

**Plan Local — mensual**
```sql
UPDATE businesses
SET subscription_status = 'active',
    plan                = 'local',
    billing_cycle       = 'monthly',
    current_period_end  = NOW() + INTERVAL '1 month'
WHERE id = 'uuid-del-negocio';
```

**Plan Negocio — mensual**
```sql
UPDATE businesses
SET subscription_status = 'active',
    plan                = 'negocio',
    billing_cycle       = 'monthly',
    current_period_end  = NOW() + INTERVAL '1 month'
WHERE id = 'uuid-del-negocio';
```

**Plan Cadena — mensual**
```sql
UPDATE businesses
SET subscription_status = 'active',
    plan                = 'cadena',
    billing_cycle       = 'monthly',
    current_period_end  = NOW() + INTERVAL '1 month'
WHERE id = 'uuid-del-negocio';
```

**Cualquier plan — anual**
```sql
UPDATE businesses
SET subscription_status = 'active',
    plan                = 'negocio',   -- cambiá al plan que corresponda
    billing_cycle       = 'annual',
    current_period_end  = NOW() + INTERVAL '1 year'
WHERE id = 'uuid-del-negocio';
```

---

### 3. Cliente paga la renovación mensual (estaba active, venció o está por vencer)

```sql
UPDATE businesses
SET subscription_status = 'active',
    current_period_end  = current_period_end + INTERVAL '1 month'
WHERE id = 'uuid-del-negocio';
```

> Esto suma un mes a partir de la fecha de vencimiento anterior,
> no desde hoy. Así no se pierde ningún día pagado.

Para anual:
```sql
UPDATE businesses
SET subscription_status = 'active',
    current_period_end  = current_period_end + INTERVAL '1 year'
WHERE id = 'uuid-del-negocio';
```

---

### 4. Cliente no pagó y hay que pausarlo

```sql
UPDATE businesses
SET subscription_status = 'past_due'
WHERE id = 'uuid-del-negocio';
```

El cliente verá el modal bloqueante al intentar ingresar.

---

### 5. Cliente paga después de haber estado pausado (past_due)

```sql
UPDATE businesses
SET subscription_status = 'active',
    current_period_end  = NOW() + INTERVAL '1 month'
WHERE id = 'uuid-del-negocio';
```

> En este caso usamos NOW() porque el período anterior ya venció.

---

### 6. Cliente cambia de plan

**Ejemplo: sube de Local a Negocio**
```sql
UPDATE businesses
SET plan               = 'negocio',
    current_period_end = NOW() + INTERVAL '1 month'
WHERE id = 'uuid-del-negocio';
```

El `subscription_status` no cambia si ya está `active`.

---

### 7. Cliente cancela

```sql
UPDATE businesses
SET subscription_status = 'canceled'
WHERE id = 'uuid-del-negocio';
```

---

### 8. Extender el trial manualmente (cliente pide más tiempo)

```sql
UPDATE businesses
SET trial_ends_at      = NOW() + INTERVAL '7 days',
    subscription_status = 'trialing'
WHERE id = 'uuid-del-negocio';
```

---

## Cómo encontrar el UUID de un negocio

```sql
SELECT id, name, subscription_status, plan, billing_cycle, trial_ends_at, current_period_end
FROM businesses
ORDER BY created_at DESC;
```

O buscar por nombre:
```sql
SELECT id, name, subscription_status, plan, current_period_end
FROM businesses
WHERE name ILIKE '%parte del nombre%';
```

---

## Vista rápida de todos los clientes y su estado

```sql
SELECT
  name,
  plan,
  billing_cycle,
  subscription_status,
  trial_ends_at::date        AS trial_vence,
  current_period_end::date   AS renovacion,
  created_at::date           AS registro
FROM businesses
ORDER BY
  CASE subscription_status
    WHEN 'past_due'  THEN 1
    WHEN 'grace'     THEN 2
    WHEN 'trialing'  THEN 3
    WHEN 'active'    THEN 4
    WHEN 'canceled'  THEN 5
  END,
  current_period_end ASC;
```

Esto muestra primero los que necesitan atención (pausados y por vencer).

---

## Checklist operativo semanal

- [ ] Correr la vista de estado general
- [ ] Identificar `past_due` y hacer seguimiento por WhatsApp
- [ ] Verificar `active` con `current_period_end` próximo (< 7 días)
- [ ] Actualizar `current_period_end` de los que renovaron

---

## Precios de referencia (para registro propio)

| Plan | Mensual | Anual (−20%) |
|---|---|---|
| Local | $49.999 | $39.999/mes |
| Negocio | $109.999 | $87.999/mes |
| Cadena | $189.999 | $151.999/mes |
