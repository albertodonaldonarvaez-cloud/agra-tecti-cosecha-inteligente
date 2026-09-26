# Correo y reportes automáticos

Cómo se configura el correo saliente, qué manda el sistema solo cada semana y
qué hacer cuando la prueba de SMTP falla.

---

## 1. La cuenta de correo (Ajustes → Correo (SMTP))

| Campo | Qué va | Ojo |
|---|---|---|
| Servidor | Lo que el proveedor llame *Outgoing Server* | Sin `https://` ni barras |
| Tipo de conexión | **465 · SSL/TLS** casi siempre | El puerto y el cifrado se eligen juntos |
| Usuario | Casi siempre el correo completo | No solo la parte de antes de la arroba |
| Contraseña | La de la cuenta, o la **de aplicación** | Gmail y Microsoft ya no aceptan la normal |
| Correo remitente | El mismo de la cuenta, o un alias autorizado | Si no, el servidor rechaza el envío |

El puerto y el cifrado son **un solo campo** a propósito. El 465 habla cifrado
desde el primer byte y el 587 empieza en claro y sube con STARTTLS: son dos
protocolos distintos y ningún servidor los cruza. Cuando eran dos campos
sueltos se podían contradecir, y el envío se quedaba colgado esperando un
saludo que nunca llegaba. Si tu proveedor usa un puerto raro, la opción
*Otro puerto* devuelve los dos campos por separado.

### cPanel (Neubox, Hostgator, y la mayoría del hosting compartido)

En cPanel, *Correo electrónico → Cuentas de correo → Conectar dispositivos*
sale el recuadro **Secure SSL/TLS Settings (Recommended)**. De ahí:

- **Servidor** = lo que diga *Outgoing Server* (el dominio, no el nombre del
  servidor físico tipo `svgrNNN.serverneubox.com.mx`)
- **Tipo de conexión** = Puerto 465 · SSL/TLS
- **Usuario** = la dirección completa
- **Contraseña** = la de esa cuenta de correo, no la de cPanel

El puerto **25 suele estar cerrado** en este tipo de hosting. No lo uses.

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

El puerto y el cifrado van al revés. Desde que se eligen juntos esto ya no
debería pasar, y una configuración vieja mal guardada se corrige sola al
leerla. Si aparece, es que el puerto es uno raro y el cifrado se eligió a
mano.

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

El correo es corto a propósito: el logo, una línea con lo esencial y el
periodo. El reporte entero va en el **PDF adjunto**, dibujado por el servidor
—no hace falta que haya un navegador abierto—. Antes el cuerpo del correo
repetía el reporte y el adjunto lo repetía otra vez; ahora el correo avisa y
el documento informa.

La semana que se mide es siempre la **última completa, de lunes a domingo** —
nunca "los últimos siete días", que contaría dos veces el día del envío.

### El grupo de Telegram

La casilla *Publicarlo también en el grupo de Telegram de cosecha* manda el
reporte de **actividades** al mismo grupo que ya recibe el resumen diario de
cosecha, el mismo día y a la misma hora que el correo.

Ese **resumen diario de cosecha no cambia**: sigue saliendo cada mañana con
sus reglas de siempre. Esto se suma, no lo sustituye. Y el reporte semanal de
cosecha se queda solo en el correo.

En el grupo el mensaje sí trae los números, al revés que el correo. Son dos
sitios distintos: el correo llega con un PDF que se abre de un toque, pero en
un grupo nadie abre el adjunto en pleno campo — se lee el mensaje y se sigue
trabajando. El PDF va detrás, para quien lo quiera archivar.

La casilla está apagada de fábrica y solo se puede encender si el bot y el
chat del resumen de cosecha ya están configurados en la tarjeta de Telegram.

### A quién le llega

- Todas las **cuentas activas** con correo, si la casilla está marcada.
- Más los **destinatarios predeterminados** de la tarjeta del SMTP, siempre.

Van en **copia oculta**: nadie ve el correo de los demás. Las cuentas
desactivadas nunca lo reciben.

### Los dos botones

- **Mandarme una prueba** → manda ambos reportes a una sola dirección. No
  cuenta como el envío de la semana y **no se publica en el grupo**: sería
  mandarle al equipo entero el ensayo de alguien.
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
| `server/logo.ts` | El logo del membrete y del correo |
| `server/telegramSemanal.ts` | El mensaje semanal al grupo de Telegram |
| `server/harvestNotifier.ts` | El resumen DIARIO de cosecha; esto no se tocó |
| `server/reporteDocumentos.ts` | Qué secciones lleva cada reporte |
| `server/correoSemanal.test.ts` | Las pruebas de todo lo anterior |

La configuración vive en columnas de la tabla `smtpConfig` (migración 0029),
salvo la casilla de Telegram, que está en `apiConfig` junto al bot y al chat
(migración 0030). La bitácora de envíos está en `sentEmails`.
