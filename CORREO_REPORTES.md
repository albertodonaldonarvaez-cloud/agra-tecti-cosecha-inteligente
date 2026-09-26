# Correo y reportes automáticos

Cómo se configura el correo saliente, qué manda el sistema solo cada semana y
qué hacer cuando la prueba de SMTP falla.

---

## 1. La cuenta de correo (Ajustes → Correo (SMTP))

| Campo | Qué va | Ojo |
|---|---|---|
| Servidor | `smtp.gmail.com`, `mail.tudominio.com`… | Sin `https://` ni barras |
| Puerto | `587` o `465` | Tiene que cuadrar con la casilla de abajo |
| Conexión cifrada directa | **Marcada** con el 465, **desmarcada** con el 587 | Es el error más común |
| Usuario | Casi siempre el correo completo | No solo la parte de antes de la arroba |
| Contraseña | La de la cuenta, o la **de aplicación** | Gmail y Microsoft ya no aceptan la normal |
| Correo remitente | El mismo de la cuenta, o un alias autorizado | Si no, el servidor rechaza el envío |

La contraseña se guarda cifrada con `JWT_SECRET` y nunca vuelve al navegador.
**Si cambia `JWT_SECRET` hay que volver a escribirla**, porque deja de poder
descifrarse.

### Prueba

El botón **Probar conexión** abre la sesión con el servidor sin mandar nada. Si
además escribes un correo al lado, manda uno de prueba. El resultado queda
guardado y se muestra debajo.

Hazla **desde el sistema**, no desde tu computadora: el que tiene que poder
salir es el servidor, y muchas veces uno puede y el otro no.

---

## 2. Cuando la prueba falla

El sistema ya no muestra el error crudo: lo traduce. Estas son las causas, de
más a menos frecuente.

### "El puerto y el cifrado no cuadran" / "El servidor nunca saludó"

La casilla de conexión cifrada y el puerto van al revés. **465 → marcada.
587 → desmarcada.** Es la mitad de los casos.

### "No se pudo llegar al servidor" (tiempo agotado)

El proveedor del servidor tiene **bloqueada la salida de correo**. AWS, Oracle
Cloud y Google Cloud bloquean el puerto 25 de fábrica, y varios bloquean
también el 465 y el 587 hasta que se pide que los abran.

Para confirmarlo, desde el servidor:

```bash
docker compose exec app node -e "const n=require('net');const s=n.createConnection(587,'smtp.gmail.com');s.on('connect',()=>{console.log('ABIERTO');s.end()});s.on('error',e=>console.log('BLOQUEADO',e.code));s.setTimeout(8000,()=>{console.log('BLOQUEADO timeout');s.destroy()})"
```

Si dice `BLOQUEADO`, no hay nada que arreglar en el sistema: hay que pedirle al
proveedor que abra el puerto, o usar un servicio de envío por HTTPS.

### "El servidor rechazó el usuario o la contraseña"

- **Gmail**: activa la verificación en dos pasos y genera una *contraseña de
  aplicación* de 16 letras. La contraseña normal de la cuenta no sirve.
- **Microsoft 365**: hay que habilitar SMTP AUTH para ese buzón; la
  autenticación básica está apagada por omisión.
- El usuario casi siempre tiene que ser el **correo completo**.

### "El servidor aceptó la cuenta pero no el envío"

El **correo remitente** no es el de la cuenta con la que te conectas. Ponlo
igual, o registra el alias en el proveedor.

---

## 3. El reporte semanal automático

Debajo de la tarjeta del SMTP. Nace **apagado**: desplegar no le manda correo a
nadie hasta que alguien lo encienda.

Cuando está encendido, el día y la hora que se elijan (hora de México) manda:

1. **Actividades de campo** — siempre, aunque la semana haya estado tranquila.
   Que no llegue nada es indistinguible de que el sistema se cayó.
2. **Cosecha** — solo si esa semana hubo cajas. Fuera de temporada no se manda
   nada, para no tener cinco meses de correos en cero.

Los dos llevan **el reporte completo en PDF adjunto**, dibujado por el
servidor. No hace falta que haya un navegador abierto.

La semana que se mide es siempre la **última completa, de lunes a domingo** —
nunca "los últimos siete días", que contaría dos veces el día del envío.

### A quién le llega

- Todas las **cuentas activas** con correo, si la casilla está marcada.
- Más los **destinatarios predeterminados** de la tarjeta del SMTP, siempre.

Van en **copia oculta**: nadie ve el correo de los demás. Las cuentas
desactivadas nunca lo reciben.

### Los dos botones

- **Mandarme una prueba** → manda ambos reportes a una sola dirección. No
  cuenta como el envío de la semana.
- **Mandar el de esta semana a todos ahora** → sale de verdad. Pide
  confirmación y sí marca la semana como enviada, así que el envío automático
  ya no la repite.

### Si el envío automático falla

Se anota el error y se reintenta cada dos horas mientras siga siendo el día
indicado o después. En cuanto se corrija la configuración, sale solo. El error
se muestra en la misma tarjeta.

Si el servidor estuvo caído el día del envío, el reporte sale con retraso en
cuanto vuelva, dentro de la misma semana; no se pierde.

---

## 4. Dónde está cada cosa en el código

| Archivo | Qué hace |
|---|---|
| `server/mailer.ts` | La cuenta, el envío y la traducción de los errores del servidor de correo |
| `server/emailLayout.ts` | El aspecto de **todos** los correos: cabecera, tablas, avisos, pie |
| `server/reporteSemanal.ts` | Qué semana se mide, la consulta de cosecha, el reloj y el envío |
| `server/reportePdf.ts` | Dibuja el PDF (pdfkit; sin navegador ni Chromium) |
| `server/reporteDocumentos.ts` | Qué secciones lleva cada reporte |
| `server/correoSemanal.test.ts` | Las pruebas de todo lo anterior |

La configuración vive en columnas de la tabla `smtpConfig` (migración 0029) y
la bitácora de envíos en `sentEmails`.
