# Generación de Certificado ARCA (ex-AFIP) para Facturación Electrónica

Guía paso a paso para cada cliente que quiera habilitar facturación electrónica en StockOS.

---

## Requisitos previos

- CUIT del negocio
- Clave Fiscal nivel 3 en ARCA
- OpenSSL instalado (viene por defecto en Mac/Linux; en Windows usar Git Bash o WSL)

---

## Paso 1 — Generar la clave privada (.key)

```bash
openssl genrsa -out private.key 2048
```

Esto crea el archivo `private.key`. **Nunca compartir este archivo con nadie.** Es el secreto del cliente.

---

## Paso 2 — Generar el CSR (Certificate Signing Request)

Reemplazar `RAZON_SOCIAL` por la razón social del negocio y `CUIT` por el CUIT sin guiones:

```bash
openssl req -new -key private.key \
  -subj "/C=AR/O=RAZON_SOCIAL/CN=CUIT" \
  -out request.csr
```

Ejemplo real:
```bash
openssl req -new -key private.key \
  -subj "/C=AR/O=El Economico SRL/CN=20123456789" \
  -out request.csr
```

Esto genera el archivo `request.csr` que se sube a ARCA.

---

## Paso 3 — Ingresar al portal de ARCA

1. Ir a **https://auth.afip.gob.ar/contribuyente_/**
2. Ingresar con el CUIT y clave fiscal del cliente

---

## Paso 4 — Acceder al Administrador de Certificados

1. En el menú principal buscar **"Administrador de Relaciones de Clave Fiscal"**
   *(también puede aparecer como "Gestión de Certificados" en algunos contribuyentes)*
2. Si no lo tienen habilitado: ir a **"Administrador de Relaciones"** → **"Nueva relación"** → buscar **"WSASS"** → habilitar para el CUIT propio

---

## Paso 5 — Crear el certificado

1. Dentro del Administrador de Certificados, click en **"Agregar alias"** o **"Nueva solicitud"**
2. Ingresar un nombre descriptivo, por ejemplo: `stockos`
3. Pegar el contenido del archivo `request.csr` en el campo de texto
   *(abrir el .csr con cualquier editor de texto y copiar todo, incluyendo `-----BEGIN CERTIFICATE REQUEST-----`)*
4. Confirmar y **descargar el certificado generado** → guardar como `certificate.crt`

---

## Paso 6 — Asociar el certificado al servicio de Facturación

1. Volver al **Administrador de Relaciones de Clave Fiscal**
2. Click en **"Nueva relación"**
3. Buscar el servicio: **"wsfe"** (Facturación Electrónica - Monotributistas y Responsables Inscriptos)
   También puede llamarse **"WSFE — Web Service de Facturación Electrónica"**
4. Seleccionar el certificado recién creado (`stockos` o el alias elegido)
5. Confirmar la relación

> Si el cliente factura A/B/C y también tiene monotributo, puede necesitar habilitar tanto **wsfe** (personas jurídicas / RI) como **wsmtxca** (monotributistas con comprobantes clase C detallados). En la mayoría de los casos solo se necesita **wsfe**.

---

## Paso 7 — Cargar en StockOS

Entregarle al cliente (o cargar vos desde Settings):

| Archivo | Descripción |
|---|---|
| `private.key` | Clave privada generada en Paso 1 |
| `certificate.crt` | Certificado descargado en Paso 5 |

En el panel de StockOS → **Configuración** → sección AFIP/ARCA:
- Pegar el contenido del `.crt` en el campo "Certificado"
- Pegar el contenido del `.key` en el campo "Clave privada"
- Ingresar el CUIT sin guiones

---

## Notas importantes

- Los certificados de ARCA tienen **vigencia de 2 años**. Hay que renovarlos antes de que venzan o la facturación se cae.
- El `.key` nunca viaja por el mismo canal que el `.crt`. Compartirlos por separado.
- En ambiente de **homologación** (testing), el portal es distinto: `https://wswhomo.afip.gov.ar/` — se genera un certificado aparte solo para pruebas.
- Si el cliente ya usaba otro software de facturación, puede tener un certificado vigente. En ese caso solo hay que reutilizarlo (pedir el `.key` y `.crt` del sistema anterior) sin crear uno nuevo.

---

## Troubleshooting frecuente

| Error | Causa probable | Solución |
|---|---|---|
| `"Certificado no válido"` | CSR generado con datos incorrectos | Regenerar CSR con CUIT y razón social exactos |
| `"Servicio no habilitado"` | wsfe no asociado al certificado | Volver al Paso 6 y verificar la relación |
| `"Clave expirada"` | Certificado vencido (>2 años) | Repetir desde Paso 1 |
| `"CUIT no autorizado"` | Nivel de clave fiscal insuficiente | El cliente necesita nivel 3 en ARCA |
