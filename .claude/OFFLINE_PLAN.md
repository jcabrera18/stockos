# StockOS — Plan de robustez Offline

> **Objetivo:** que el comerciante pueda **operar sin internet de punta a punta** — arrancar el día sin conexión, navegar, refrescar, vender, y no perder ni duplicar ventas.

---

## 📌 Estado actual (al 2026-06-06)

- ✅ **Service Worker (PWA offline-first) implementado** con Serwist → navegar, refrescar y abrir la app en frío offline ya **no caen al dino** (siempre que haya habido una primera carga online).
- ✅ **Login / sesión offline (P1):** el día se puede arrancar sin internet usando el perfil + sesión de Supabase cacheados de una sesión previa.
- ✅ **Quick-win:** el POS no te expulsa al dino al tocar la X sin internet.
- ⏳ **Falta lo más sensible que queda:** endurecer la **cola de ventas** (no duplicar, no perder, visibilidad de fallidas) y los controles de negocio offline.

**Todos los CRÍTICOS (C1–C4) están resueltos.** Pendiente: ALTOS/MEDIOS (cola, CC, stock, facturación).

**Punto de partida original:** el POS funcionaba offline solo si ya estaba vivo en memoria (SPA). No había SW, así que cualquier navegación/refresh/arranque en frío sin internet rompía la app.

**Causa raíz (resuelta):** en Next.js App Router cada `router.push` pide a la red el RSC payload de la ruta destino; sin SW que lo cachee, el fetch falla → *hard navigation* → `ERR_INTERNET_DISCONNECTED` (dino). El SW ahora precachea el shell y cachea los RSC al navegar.

---

## ✅ HECHO

### Fix #1 — Service Worker + app-shell cache (2026-06-05)
**Decisiones:** Serwist + cachear **toda la app**.

Resuelve: **C1** (navegación interna), **C2** (hard refresh), **C3** (arranque en frío de la PWA). **C4 solo parcial** (ver pendientes).

Cambios:
- `npm i serwist @serwist/next` (v9.5.11).
- `next.config.ts` — `withSerwistInit`: `swSrc: app/sw.ts`, `swDest: public/sw.js`, `disable` en dev, `cacheOnNavigation: true`, `reloadOnOnline: false` (no interrumpir venta en curso). Además `turbopack: {}` para silenciar el conflicto webpack/Turbopack de Next 16.
- `app/sw.ts` — worker con `defaultCache` (estrategias Next: RSC/HTML/estáticos) + `fallbacks` a `/offline` para documentos. `skipWaiting` + `clientsClaim`.
- `app/offline/page.tsx` — pantalla de fallback (reemplaza el dino) con "Ir al POS" y "Reintentar".
- `tsconfig.json` — `lib: webworker`, `types: @serwist/next/typings`, excluye `public/sw.js`.
- `package.json` — `build` ahora usa `next build --webpack`.
- `vercel.json` — fija `buildCommand: next build --webpack` (tiene prioridad sobre el dashboard).
- `.gitignore` — ignora `public/sw.js`, `.map` y `swe-worker-*.js` (generados en build).

Verificado: `tsc` limpio · `npm run build` OK (`/offline` prerenderizada, `public/sw.js` con precache manifest, registro del SW en el bundle cliente) · `npm run dev` arranca en Turbopack sin warnings.

⚠️ **No olvidar:**
- El build **debe** correr con webpack (`next build --webpack`). @serwist/next NO soporta Turbopack; si se fuerza Turbopack, el SW deja de generarse **en silencio**. El `vercel.json` lo blinda.
- El SW se instala/precachea recién en la **primera carga online**. Equipo que nunca abrió la app con internet → sigue sin SW (esto es justamente C4 / Fix #4).
- Una ruta se cachea cuando se visita online al menos una vez; rutas nunca visitadas caen a `/offline` (no al dino, pero sin datos).

### Fix P1 — Login / sesión offline (2026-06-06)
**Decisión:** confiar en la sesión de Supabase + perfil cacheados de una sesión previa, sin tope de tiempo explícito (la sesión de Supabase ya gestiona su propia expiración; offline operamos con lo último conocido).

Resuelve: **C4** (arrancar el día sin internet).

Cambios:
- `contexts/AuthContext.tsx` — tras cada `loadProfile` OK se guarda el perfil en `localStorage` (`stockos_profile`). Si `/api/auth/me` falla por red (offline / Supabase / Railway caído) y hay perfil cacheado, se usa ese perfil en vez de mandar a `/login`. `signOut` limpia el caché. Se inlineó `isNetworkError` para no arrastrar Dexie al bundle global.
- `app/page.tsx` — pasó a client component: online lo redirige el middleware, pero offline (que no corre el middleware) hace el redirect por rol con el perfil cacheado (`owner/admin→/dashboard`, `cashier→/pos`, `stocker→/warehouses`, `seller→/orders`), evitando que `/` quede en blanco.

Cómo funciona offline: `supabase.auth.getSession()` lee la sesión de `localStorage` sin red (aunque el token esté expirado, igual se opera con el perfil cacheado); las rutas home por rol están en el precache del SW, así que el arranque en frío offline sirve la pantalla correcta.

Limitación: un equipo que **nunca** abrió la app con internet (sin sesión ni perfil cacheado) no puede loguearse offline — eso es irreducible.

Verificado: `tsc` limpio, `npm run build` OK (`/` sigue estático, rutas home por rol en el precache manifest del SW).
Pendiente de probar en navegador real: loguear online una vez → cortar red → cerrar/reabrir la PWA → debe entrar directo sin pedir login.

### UX — Banner global de modo offline (2026-06-06)
`components/layout/OfflineBanner.tsx`, montado en `app/layout.tsx` (fuera del shell, así aparece también en el POS). Pill fija arriba al centro que se muestra cuando `!navigator.onLine`: "Sin conexión · los datos pueden no estar actualizados". Avisa al comerciante que puede estar viendo data vieja (mitiga la confusión de M11). Usa los eventos `online`/`offline`; cuando se endurezca la detección real (P5) conviene engancharlo al mismo health-check.

### Quick-win — No salir del POS sin internet (2026-06-05)
Helper `leavePOS(path)` en `app/pos/page.tsx`: si `!navigator.onLine` muestra `toast.warning` y no navega. Aplicado al botón X, "Abrir caja →" y al cierre del `POSTicket`.
Nota: Sidebar/BottomNav globales no tienen guard propio, pero ya los cubre el SW.

### Pendiente de probar en navegador real
Build de prod (`npm run build && npm run start`) o preview de Vercel: cargar online → navegar rutas → cortar red → navegar/refrescar y confirmar que no aparece el dino.

---

## ⏳ PENDIENTE — en orden de prioridad

> **P1 (login offline) ✅ HECHO** — ver sección "✅ HECHO". El siguiente en la cola es **P2**.

### P2 · Idempotencia + persistencia de la cola  → resuelve **A7, B16** (ALTO) ← **SIGUIENTE**
**Problema:** (A7) si `POST /api/sales` llega al server pero la respuesta se pierde, la venta se crea pero no se borra de `pendingSales` → reintento → **duplicado**. (B16) sin `navigator.storage.persist()`, el browser puede desalojar IndexedDB y **perder ventas en cola**.
**Idea:** enviar el UUID local como **idempotency key** (requiere cambio en `stockos-api`) + llamar `navigator.storage.persist()` al iniciar el POS.
**Dónde:** `lib/sales-queue.ts` (`syncPendingSales`), `lib/pos-db.ts`, backend `stockos-api`.
**Esfuerzo:** Bajo.

### P3 · UI de ventas pendientes/fallidas  → resuelve **A8** (ALTO)
**Problema:** una venta que falla al sincronizar por error de negocio (caja cerrada, producto borrado, stock negativo) queda `status:'failed'` y **nadie se entera**. El cajero cobró y la venta nunca quedó registrada.
**Idea:** panel en el POS que liste pendientes/fallidas, con detalle del error, reintentar y resolver manualmente.
**Dónde:** `app/pos/page.tsx`, `lib/sales-queue.ts`.
**Esfuerzo:** Medio.

### P4 · Controles de negocio offline (CC + promos)  → resuelve **A6, M12** (ALTO/MEDIO)
**Problema:** (A6) en venta offline se **saltea** el chequeo de `credit_limit` e `is_active` del cliente → se puede fiar de más o a un cliente dado de baja. (M12) las promos se evalúan desde caché sin respetar vencimiento ni tope de usos.
**Idea:** validar contra la data cacheada (límite CC, vigencia de promo) y, si no se puede verificar, mostrar aviso "offline — sin verificar" y registrar para revisar al sincronizar.
**Dónde:** `app/pos/page.tsx` (~línea 983 flujo CC), `lib/promoUtils.ts`.
**Esfuerzo:** Medio.

### P5 · Health-check real en lugar de `navigator.onLine`  → resuelve **M15** (MEDIO)
**Problema:** `navigator.onLine` da `true` con router conectado pero ISP caído / portal cautivo → cada acción se cuelga ~45s (15s × 3 reintentos) antes del fallback.
**Idea:** ping liviano a un endpoint propio para decidir online/offline real; usarlo en el flujo de venta y en el banner.
**Dónde:** `lib/api.ts` (`BASE_TIMEOUT_MS`/`MAX_ATTEMPTS`), `app/pos/page.tsx` (handler `online`).
**Esfuerzo:** Bajo.

### P6 · Sync ordenado + lock multi-pestaña  → resuelve **B17, B18** (BAJO)
**Problema:** (B18) las ventas se sincronizan en orden de iteración, no por `created_at` → numeración de tickets desordenada. (B17) dos pestañas pueden disparar `syncPendingSales` a la vez sin lock.
**Idea:** ordenar la cola por `created_at` antes de sincronizar + lock (Web Locks API / flag en IndexedDB).
**Dónde:** `lib/sales-queue.ts`.
**Esfuerzo:** Bajo.

### P7 · Estrategia de stock offline  → resuelve **A5** (ALTO, pero requiere diseño)
**Problema:** ventas offline no descuentan stock real; dos cajas offline venden la misma última unidad → al sincronizar puede quedar stock negativo o fallar `process_sale`.
**Idea (a definir):** advertir sobreventa con stock cacheado, reconciliar al sync, o política de bloqueo. **Decisión abierta:** ¿bloquear venta si stock cacheado = 0, solo advertir, o permitir siempre?
**Dónde:** `app/pos/page.tsx`, `process_sale` (backend).
**Esfuerzo:** Medio.

### P8 · Facturación offline correcta  → resuelve **A9, A10** (MEDIO)
**Problema:** (A9) facturar requiere ARCA online y en el sync `POST /api/invoices` se lanza fire-and-forget (`.catch(() => {})`) → si ARCA rechaza, no hay CAE y nadie se entera. (A10) la venta offline usa un UUID local como id; el ticket impreso/WhatsApp muestra ese id, que no coincide con el número real asignado al sincronizar.
**Idea:** cola explícita de facturación (no fire-and-forget) con estados y reintentos; diferir/numerar el ticket de forma consistente con el número definitivo.
**Dónde:** `lib/sales-queue.ts`, `app/pos/page.tsx`, `components/modules/POSTicket.tsx`.
**Esfuerzo:** Medio.

### Otros pendientes menores (no priorizados aún)
- **M11. Catálogo/precios congelados:** data de otro dispositivo no aparece hasta el próximo sync online. (Mitigable mejorando la frecuencia/feedback de sync del caché POS.)
- **M13. Caja depende del server:** abrir/cerrar caja y totales RT son endpoints online; offline no se puede abrir/cerrar caja.
- **M14. Cliente nuevo / QuickCustomer offline:** crear cliente pega a la API → falla offline; no se puede fiar a alguien nuevo.

---

## 📋 Inventario completo de escenarios (referencia)

### 🔴 CRÍTICOS — sin internet no se puede operar
- [x] **C1.** Navegación interna mata la app → ✅ Fix #1.
- [x] **C2.** Hard refresh / F5 = muerte total → ✅ Fix #1.
- [x] **C3.** Abrir/instalar PWA en frío sin internet → ✅ Fix #1.
- [x] **C4.** "Abrí el local y no había internet" → no se puede ni loguear → ✅ Fix P1 (perfil + sesión cacheados; redirect por rol offline).

### 🟠 ALTOS — se opera, pero con riesgo de datos/plata
- [ ] **A5.** Sobreventa de stock → ⏳ P7.
- [ ] **A6.** Cuenta corriente sin control de límite (`app/pos/page.tsx` ~línea 983) → ⏳ P4.
- [ ] **A7.** Ventas duplicadas al sincronizar (falta idempotencia) → ⏳ P2.
- [ ] **A8.** Ventas "failed" que se tragan plata en silencio (sin UI) → ⏳ P3.
- [ ] **A9.** Facturación AFIP imposible offline + sync silencioso (`.catch(() => {})`) → ⏳ P8.
- [ ] **A10.** Número de ticket falso (UUID local vs número real) → ⏳ P8.

### 🟡 MEDIOS — correctitud / frescura de datos
- [ ] **M11.** Catálogo y precios congelados → otros pendientes.
- [ ] **M12.** Promos sin tope de uso → ⏳ P4.
- [ ] **M13.** Caja depende del server → otros pendientes.
- [ ] **M14.** Cliente nuevo / QuickCustomer offline → otros pendientes.
- [ ] **M15.** `navigator.onLine` miente (cuelgue de ~45s) → ⏳ P5.

### 🟢 BAJOS — resiliencia / borde
- [ ] **B16.** Eviction de IndexedDB → pérdida de ventas en cola → ⏳ P2.
- [ ] **B17.** Multi-pestaña / multi-dispositivo (sin lock de sync) → ⏳ P6.
- [ ] **B18.** Orden de sincronización arbitrario → ⏳ P6.

---

## 🔍 Archivos clave (referencia)

- `app/pos/page.tsx` — lógica POS, flujo de venta offline (`offline = !navigator.onLine` ~`:955`), helper `leavePOS`, banner offline, handler `online` (~`:191-205`).
- `lib/sales-queue.ts` — `queueSale`, `syncPendingSales`, `isNetworkError`.
- `lib/pos-db.ts` — Dexie `stockos_pos`: `products`, `barcodes`, `priceLists`, `priceRules`, `priceOverrides`, `promotions`, `syncMeta`, `pendingSales`.
- `lib/pos-cache.ts` — carga/refresh del caché POS.
- `lib/api.ts` — `apiFetch`, timeouts/reintentos, `getAccessToken` (maneja `AuthRetryableFetchError` para no desloguear offline).
- `contexts/AuthContext.tsx` — `loadProfile`, conserva usuario ante errores de red transitorios.
- `middleware.ts` — corre server-side; offline no se alcanza.
- `app/sw.ts`, `next.config.ts`, `app/offline/page.tsx`, `vercel.json` — infraestructura del Service Worker.

---

## 🧩 Decisiones tomadas
- **Librería SW:** Serwist (sucesor de next-pwa, mejor soporte App Router).
- **Alcance del shell cacheado:** toda la app.
- **Reload al volver online:** desactivado (`reloadOnOnline: false`) para no interrumpir una venta.

## ❓ Decisiones abiertas (definir al encarar cada fix)
- **P2 (idempotencia):** ¿UUID local como idempotency key enviado al backend (requiere cambio en `stockos-api`)?
- **P7 (stock):** ¿bloquear venta si stock cacheado = 0, solo advertir, o permitir siempre?
