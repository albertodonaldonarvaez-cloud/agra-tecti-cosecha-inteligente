# API para agentes de IA y scripts

API de **solo lectura** para consultar Agra Tec-Ti sin entrar al sistema gráfico.
Vive en `/api/v1`, devuelve JSON plano y se autentica con una llave propia, no con
la cuenta de una persona.

No reemplaza a `/api/trpc`, que es lo que usan la web y la app de campo. Es una
capa encima: cada endpoint llama a la misma función que ya usa la pantalla, así
que la cifra que ve el agente y la que ve el productor son la misma.

---

## 1. Conseguir una llave

En el sistema: **Configuración → Llaves de API → Crear llave**.

Al crearla se define:

| Campo | Para qué sirve |
|---|---|
| **Nombre** | Es lo único que verás después para saber cuál revocar |
| **Alcance** | `lectura` (todo lo que no cuesta dinero) o `lectura + IA` (además puede pedir reportes redactados por DeepSeek) |
| **Peticiones por minuto** | Protege la base de datos de un script con un bucle mal cerrado |
| **Peticiones por día** | Tope general |
| **Llamadas de IA por día** | Tope de lo que le cuesta dinero al negocio |
| **Vigencia** | Días hasta que caduca sola. En blanco, no caduca |

> La llave completa se muestra **una sola vez**. En el servidor solo queda su
> hash: si se pierde, no se puede recuperar, hay que crear otra.

Empieza con alcance `lectura`. Solo sube a `lectura + IA` si el agente de verdad
necesita los reportes redactados, y déjale una cuota baja: cada llamada consume
tokens de DeepSeek.

---

## 2. Primera consulta

```bash
curl -H "X-API-Key: agt_live_..." https://TU-SERVIDOR/api/v1/contexto
```

También se acepta `Authorization: Bearer agt_live_...` para clientes que solo
saben mandar Bearer.

Toda respuesta tiene la misma forma:

```json
{
  "ok": true,
  "datos": { },
  "meta": { "generado": "...", "zonaHoraria": "America/Mexico_City", "cuota": { } }
}
```

Y los errores también:

```json
{
  "ok": false,
  "error": {
    "codigo": "fecha_invalida",
    "mensaje": "\"desde\" no es una fecha válida: 31/08/2026",
    "ayuda": "Usa el formato YYYY-MM-DD, por ejemplo 2026-08-31"
  }
}
```

El campo **`ayuda` dice qué hacer** para que la petición funcione. Un agente puede
leerlo y corregirse solo.

---

## 3. Los tres endpoints que hacen innecesaria esta documentación

| Endpoint | Qué responde |
|---|---|
| `GET /api/v1/catalogo` | Todos los endpoints con sus parámetros y un ejemplo de cada uno |
| `GET /api/v1/diccionario` | Unidades, códigos y trampas de los datos |
| `GET /api/v1/openapi.json` | Esquema OpenAPI 3.1, para generar clientes |

El catálogo y el OpenAPI **se generan de la misma lista de rutas que monta el
servidor**. No son un documento aparte que haya que acordarse de actualizar: si un
endpoint existe, aparece documentado.

---

## 4. Lo que hay que saber antes de interpretar una cifra

Esto es lo que un programa no puede deducir leyendo el JSON. Está también en
`/api/v1/diccionario`.

**El peso ya viene en kilos.** En la base de datos está en gramos, pero la API
convierte. Por eso los campos se llaman `pesoKg` y `pesoToneladas`, nunca `peso` a
secas. Si consultas la base directamente, acuérdate de dividir entre 1000.

**Las cortadoras 98 y 99 no son personas.** El número de cortadora identifica a la
persona que cortó la caja, con dos excepciones: la `98` marca las cajas de
**segunda calidad** y la `99` las de **desperdicio**. `/api/v1/cortadoras` ya las
excluye; si sumas por tu cuenta desde la exportación, exclúyelas o el ranking
saldrá con dos "personas" inexistentes en los primeros lugares.

**El responsable de una labor puede ser una cuadrilla entera** en un solo texto
separado por comas. Si vas a contar gente, sepáralo primero. Y ojo: esa columna
admite 255 caracteres, así que en cuadrillas grandes el último nombre puede venir
cortado a media palabra. Es un límite de la captura, no un error de la API.

**Las fechas son días de calendario en hora de México** (`America/Mexico_City`),
formato `YYYY-MM-DD`. Una fecha en otro formato se rechaza en vez de ignorarse: un
rango vacío se parecería demasiado a "no hubo cosecha".

**Las cajas archivadas** (duplicados y errores de captura ya corregidos) quedan
fuera de todos los conteos, igual que en las pantallas.

**`rendimientoKgPorHectarea` llega en `null`** cuando la parcela no tiene hectáreas
productivas registradas. No es cero: es que no se puede calcular.

---

## 5. Endpoints

### Descubrimiento
| Ruta | Qué responde |
|---|---|
| `/catalogo` | Lista de endpoints con parámetros |
| `/diccionario` | Unidades y códigos |
| `/openapi.json` | Esquema OpenAPI 3.1 |

### Panorama
| Ruta | Qué responde |
|---|---|
| `/contexto` | **Todo el estado de la finca en una llamada** |
| `/estado-sincronizacion` | Si Kobo, las fotos y el satélite van al día |

### Cosecha
| Ruta | Parámetros |
|---|---|
| `/cosecha/resumen` | `desde`, `hasta` |
| `/cosecha/diaria` | `desde`, `hasta`, `mes` |
| `/cosecha/por-parcela` | `desde`, `hasta` |
| `/cosecha/fechas` | — |
| `/cortadoras` | `desde`, `hasta`, `limite` |
| `/series` | `metrica`, `granularidad`, `desde`, `hasta`, `parcela` |
| `/cajas` | `pagina`, `porPagina`, `fecha`, `parcela`, `cortadora`, `buscar` |
| `/exportar/cajas` | `cursor`, `limite`, `desde`, `hasta`, `parcela` |

`/series` acepta las métricas `cajas`, `kg`, `primera_kg`, `segunda_kg`,
`desperdicio_kg`, `calidad_pct` y `peso_promedio_kg`, con granularidad `dia`,
`semana` o `mes`. Siempre devuelve `{periodo, valor, cajas}`, para poder cruzar dos
series sin normalizar nada. En granularidad semanal el periodo es el lunes de esa
semana.

### Campo
| Ruta | Parámetros |
|---|---|
| `/parcelas` | `activas` |
| `/parcelas/:id` | `poligono` |
| `/parcelas/:id/telemetria` | `porCiclo` |
| `/ciclos` · `/ciclos/comparacion` | `limite` |
| `/labores` | `desde`, `hasta`, `tipo`, `estado`, `parcela` |
| `/labores/resumen` | — |
| `/labores/reporte` ⚠️ | `desde`, `hasta`, `parcela`, `ia` |
| `/notas` · `/notas/resumen` | `estado`, `categoria`, `gravedad`, `parcela` |
| `/almacen/resumen` · `/almacen/productos` | `categoria`, `buscar`, `porAgotarse` |
| `/clima` · `/clima/pronostico` | `desde`, `hasta`, `dias` |
| `/colaboradores` | — |
| `/resumen-semanal` | `limite` |

⚠️ `/labores/reporte?ia=true` es el único endpoint que cuesta dinero: llama a
DeepSeek. Necesita una llave con alcance `lectura_ia` y consume cuota de IA. Con
`ia=false` salen las mismas cifras sin costo.

---

## 6. Bajar el histórico completo

`/exportar/cajas` devuelve **NDJSON**: una caja por línea, para leerlo de corrido
sin cargar todo en memoria.

Va por cursor y no por página a propósito: la sincronización con Kobo mete cajas
nuevas dos veces al día, y con paginado por desplazamiento las filas se recorren —
terminarías con registros repetidos y otros que nunca viste.

```bash
curl -H "X-API-Key: agt_live_..." \
  "https://TU-SERVIDOR/api/v1/exportar/cajas?limite=2000&desde=2026-01-01" \
  -D encabezados.txt -o lote1.ndjson

# X-Siguiente-Cursor dice por dónde seguir. Cuando no viene, se acabó.
grep -i "X-Siguiente-Cursor" encabezados.txt
```

En Python, `agente_agra.py` ya lo recorre solo:

```python
for caja in agra.todas_las_cajas(desde="2026-01-01"):
    ...
```

---

## 7. Topes y qué hacer cuando se llega a ellos

| Respuesta | Qué pasó | Qué hacer |
|---|---|---|
| `429 demasiadas_peticiones` | Se pasó del límite por minuto | Esperar los segundos que dice `Retry-After` y reintentar |
| `429 cuota_diaria` | Se acabaron las peticiones del día | **No reintentar.** Se reinicia a medianoche, hora de México |
| `429 cuota_ia` | Se acabaron las llamadas de IA del día | No reintentar. Usar `ia=false` mientras tanto |
| `403 alcance_insuficiente` | La llave es de solo lectura y se pidió IA | Usar `ia=false` o pedir una llave con alcance `lectura_ia` |
| `400 rango_muy_amplio` | El rango pedido es demasiado grande | Partirlo en tramos, o usar `/exportar/cajas` |
| `401` | Llave ausente, desconocida, revocada o caducada | El mensaje distingue cuál de las cuatro |

El cliente de Python reintenta solo cuando tiene sentido: un `400` no se
reintenta, porque volver a mandar la misma fecha mal escrita da el mismo error.

---

## 8. Cliente de Python

En [`ejemplos/agente_agra.py`](ejemplos/agente_agra.py). Un archivo suelto, sin más
dependencia que `requests`.

```bash
pip install requests
export AGRA_API_URL="https://TU-SERVIDOR/api/v1"
export AGRA_API_KEY="agt_live_..."
python ejemplos/agente_agra.py
```

```python
from agente_agra import Agra

agra = Agra()

ctx = agra.contexto()
print(ctx["cosecha"]["ultimos30Dias"]["pesoToneladas"], "toneladas en 30 días")

for p in agra.por_parcela(desde="2026-08-01", hasta="2026-08-31")["parcelas"][:5]:
    print(p["nombre"], p["pesoKg"], "kg", p["primera"]["porcentaje"], "% primera")
```

---

## 9. Notas para quien opere el servidor

- **La API sale a internet.** Ponla detrás de HTTPS; el `Retry-After` y los topes
  por llave ya vienen implementados, pero un proxy delante no sobra.
- **Nada de `/api/v1` escribe en la base.** No hay una sola ruta que modifique
  datos.
- **La llave actúa en nombre de un usuario** y hereda sus permisos. Lígala a un
  usuario con acceso solo a lo que el agente deba ver.
- **Revocar es inmediato**: la llave deja de funcionar en la siguiente petición.
- **El consumo queda registrado** por llave y por día, visible en la misma
  pantalla de Configuración.
