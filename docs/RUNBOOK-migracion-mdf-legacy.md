# RUNBOOK — Migrar base legacy (SQL Server .mdf) a StockOS

Guía reproducible para cuando llega un backup de un sistema viejo (Windows/VB/Delphi con
SQL Server) y hay que analizarlo y traer los datos a StockOS. Probado en Mac Intel (x86_64).

> Contexto real donde se armó: cliente "profit.rar" (ferretería/repuestos, SQL Server 2014).
> Ver memoria `project_legacy_migration_profit`.

---

## 0. Identificar el archivo

```bash
file archivo.rar            # RAR/ZIP/7z…
bsdtar -tvf archivo.rar     # listar contenido SIN extraer (bsdtar viene en macOS)
bsdtar -xvf archivo.rar -C /tmp/extract   # extraer
```

Pistas de qué motor es:
- `.mdf` + `.ldf` → **Microsoft SQL Server** (lo más común en estos sistemas).
- `.bak` → backup nativo de SQL Server (se restaura con `RESTORE DATABASE`).
- `.dbf` (+ `.cdx`/`.fpt`) → **Visual FoxPro** / dBase.
- `.gdb`/`.fdb` → Firebird/Interbase (típico de Delphi).
- `.mdb`/`.accdb` → Microsoft Access.

Detectar versión del MDF (para saber a qué SQL Server adjuntarlo — se puede adjuntar a una
versión **igual o mayor**, nunca menor):

```python
python3 - <<'PY'
import struct
data=open('Sistema.mdf','rb').read()
boot=data[9*8192:9*8192+8192]          # boot page = página 9
known={539:'2000',611:'2005',612:'2005',655:'2008',661:'2008R2',706:'2012',
       782:'2014',852:'2016',869:'2017',895:'2019',904:'2022'}
v=struct.unpack_from('<H',boot,100)[0] # dbi_version en offset 100
print("SQL Server version:", known.get(v, v))
PY
```

Reconocimiento rápido de tablas sin motor (aproximado, con strings):
```python
python3 - <<'PY'
import re
d=open('Sistema.mdf','rb').read()
u=set()
for m in re.findall(rb'(?:[\x20-\x7e]\x00){3,}',d):   # UTF-16LE (nombres de objetos)
    try:u.add(m.decode('utf-16le'))
    except:pass
for t in ['articul','cliente','proveed','stock','venta','marca','rubro','precio']:
    print(t, sorted({s for s in u if t in s.lower() and len(s)<40})[:6])
PY
```

---

## 1. Levantar SQL Server local (Docker vía Colima) y adjuntar el MDF

macOS no corre SQL Server nativo. Se usa la imagen Linux en Docker. En Mac Intel funciona
directo; en Apple Silicon habría que probar `azure-sql-edge` (soporta menos T-SQL).

```bash
# 1) Instalar Docker CLI + VM Colima (una sola vez)
brew install colima docker
colima start --cpu 2 --memory 4 --disk 20     # SQL Server necesita >=2GB RAM

# 2) Contenedor SQL Server 2019 (adjunta MDF de 2014/2016/2017/2019)
docker pull mcr.microsoft.com/mssql/server:2019-latest
docker rm -f stockos-mssql 2>/dev/null
docker run -d --name stockos-mssql \
  -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=Stockos!Migr2026" \
  -e "MSSQL_PID=Developer" \
  -p 1433:1433 mcr.microsoft.com/mssql/server:2019-latest

# esperar a que arranque (reintentar SELECT @@VERSION)
for i in $(seq 1 30); do
  docker exec stockos-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa \
    -P 'Stockos!Migr2026' -C -Q "SELECT 1" 2>/dev/null | grep -q 1 && { echo LISTO; break; }
  sleep 3
done

# 3) Copiar archivos al contenedor y dar permisos al usuario mssql
docker exec stockos-mssql mkdir -p /var/opt/mssql/data
docker cp Sistema.mdf     stockos-mssql:/var/opt/mssql/data/
docker cp Sistema_log.LDF stockos-mssql:/var/opt/mssql/data/
docker exec -u root stockos-mssql chown mssql:root /var/opt/mssql/data/Sistema.*
docker exec -u root stockos-mssql chmod 660        /var/opt/mssql/data/Sistema.*

# 4) Adjuntar (auto-upgradea la versión del archivo)
docker exec stockos-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Stockos!Migr2026' -C -Q "
CREATE DATABASE Sistema ON
 (FILENAME='/var/opt/mssql/data/Sistema.mdf'),
 (FILENAME='/var/opt/mssql/data/Sistema_log.LDF') FOR ATTACH;"
```

Si en vez de `.mdf` viene un `.bak`:
```bash
docker exec ... sqlcmd ... -Q "RESTORE FILELISTONLY FROM DISK='/var/opt/mssql/data/x.bak'"
# luego RESTORE DATABASE ... FROM DISK=... WITH MOVE 'logical' TO '/var/opt/mssql/data/...'
```

Conexión resultante: `localhost:1433`, user `sa`, pass `Stockos!Migr2026`, DB `Sistema`.

---

## 2. Explorar el esquema

Helper (fuera del heredoc, ojo con zsh — ver Gotchas):
```bash
SAPW='Stockos!Migr2026'
Q(){ docker exec stockos-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SAPW" -C -d Sistema -Y 40 -Q "SET NOCOUNT ON;$1"; }

# Tablas + nº de filas (ordena por volumen: así se ve dónde están los datos reales)
Q "SELECT t.name, p.rows FROM sys.tables t
   JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
   ORDER BY p.rows DESC;"

# Columnas de una tabla
Q "SELECT c.name, ty.name FROM sys.columns c
   JOIN sys.types ty ON ty.user_type_id=c.user_type_id
   WHERE c.object_id=OBJECT_ID('Articulo') ORDER BY c.column_id;"
```

---

## 3. Exportar a CSV/TSV (bcp)

```bash
SAPW='Stockos!Migr2026'
OUT=~/Downloads/export; mkdir -p "$OUT"
TABLES=(Articulo Marcas Clientes Proveedores Stock ...)   # array (zsh no splitea strings!)
for t in "${TABLES[@]}"; do
  docker exec stockos-mssql /opt/mssql-tools18/bin/bcp "Sistema.dbo.$t" out "/tmp/$t.dat" \
    -S localhost -U sa -P "$SAPW" -u -c -t$'\t' -r'\n' -C 65001   # -u trust cert, -C 65001 UTF-8
  docker cp "stockos-mssql:/tmp/$t.dat" "$OUT/$t.tsv"
done
```

`bcp` también acepta un query completo con `queryout` (para joins / reconstrucciones):
```bash
docker exec stockos-mssql /opt/mssql-tools18/bin/bcp "SELECT ... FROM ... " queryout /tmp/x.dat \
  -S localhost -U sa -P "$SAPW" -u -c -t'|' -r'\n' -C 65001
```

Limpiar los CSV en Python (quita NUL de campos `nchar`, agrega header, quoting correcto):
```python
python3 - <<'PY'
import csv
data=open('x.psv','rb').read().replace(b'\x00',b'').decode('utf-8','replace')
h=['col1','col2',...]
rows=[l.split('|') for l in data.split('\n') if l.strip()]
with open('x.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(h)
    for r in rows: w.writerow([c.strip() for c in (r+['']*len(h))[:len(h)]])
PY
```

---

## 4. Mapeo típico legacy → StockOS

Los sistemas de retail LATAM repiten este modelo. Nombres varían, la forma no:

| Concepto legacy | Tabla típica | → StockOS |
|---|---|---|
| Productos/artículos | Articulo(s) | `products` (guardar `legacy_id`) |
| Marcas | Marcas | `brands` |
| Categorías (árbol) | Departamentos/Rubros/Subrubros | `categories` (usar la hoja) |
| Clientes | Clientes | `customers` (CUIT, condición IVA) |
| Proveedores | Proveedores | `suppliers` |
| Stock por depósito | Stock/Depositos | `warehouse_stock` + `warehouses` |
| Ventas / comprobantes | comprobantes_emitidos + detalle | `sales`/`invoices` (opcional) |
| Formas de pago | Formas_de_pago | `payment_method` |

Orden de carga: **categorías → marcas → productos → clientes → stock (conteo físico)**.
Guardar siempre el `legacy_id` para resolver FKs y para soporte post-migración.

---

## 5. Auditoría de calidad — HACERLA SIEMPRE antes de migrar

No confiar en que los datos están completos. Chequear:

```bash
# ¿Cuántos productos tienen realmente precio / costo / ean?
Q "SELECT COUNT(*) tot,
   SUM(CASE WHEN precio>0 THEN 1 ELSE 0 END) con_precio,
   SUM(CASE WHEN costo>0 THEN 1 ELSE 0 END) con_costo,
   SUM(CASE WHEN ean<>'' THEN 1 ELSE 0 END) con_ean FROM Articulo;"
```

Aprendizajes del caso profit.rar (cosas que sí o sí hay que verificar):
- **Precios**: el maestro puede tener casi todo en 0 (el POS tipeaba el precio en cada venta).
  El precio real puede estar en el **detalle de ventas** (`preciounitario`).
- **Stock**: muchos de estos sistemas NO llevaban stock → en StockOS arranca en 0, hace falta
  conteo físico.
- **Reconstruir precio desde ventas**: última `preciounitario` por producto. PERO verificar el
  join real primero: en profit, `detalle.idcomprobante` apuntaba a `comprobantes_emitidos.id`
  (NO a `.idcomprobante`). Y la integridad estaba rota (muchas líneas sin cabecera).
- **Contaminación por códigos coincidentes**: al matchear detalle↔maestro por número de código,
  VALIDAR comparando nombres (`descripcion` vs `descarticulo`). Si no coinciden, el precio
  reconstruido es de otro producto → basura.
- **Códigos internos que el cliente usa a diario** (ej. "3148"): pueden NO estar en el maestro
  (`CodAlt`/`PLU` vacíos) y solo sobrevivir en el historial de ventas — o directamente faltar
  si el backup es viejo/recortado. Antes de migrar, **confirmar con el cliente en qué pantalla
  ven ese código** y pedir un **backup actual** si no cuadra.
- **Catálogo recortado/mezclado**: el maestro puede tener menos productos que el histórico
  (renumerado 1..N), o mezclar rubros de un uso anterior de la misma base. Cruzar rangos de
  código con nombres para detectarlo.

---

## 6. Gotchas (los que me hicieron perder tiempo)

- **zsh no hace word-splitting** de variables sin comillas → usar arrays `("${A[@]}")`
  o `${=VAR}`. Un `for t in $TABLES` con string NO itera.
- **bcp / sqlcmd (tools18) y TLS**: el server usa cert autofirmado. `sqlcmd` necesita `-C`
  (trust) y `bcp` necesita `-u`. Sin eso: `SSL Provider ... certificate verify failed`.
- **bcp `-C 65001`** = code page UTF-8 (no confundir con el `-C` de sqlcmd que es trust cert).
- **Campos `nchar`** dejan **bytes NUL** en el CSV → `_csv.Error: line contains NUL`.
  Limpiar con `.replace(b'\x00',b'')` antes de parsear.
- **`docker cp` falla silencioso** si el archivo no se generó dentro del contenedor (p.ej. bcp
  falló por TLS). Verificar el output del bcp ("N rows copied").
- **Adjuntar MDF**: solo a versión de SQL Server **igual o superior**. 2019 sirve para 2008–2019.

---

## 7. Limpieza del entorno

```bash
docker rm -f stockos-mssql   # borra el contenedor (los CSV ya exportados quedan)
colima stop                  # apaga la VM (libera RAM/CPU)
# colima delete              # borrar del todo la VM si no se va a usar más
```
