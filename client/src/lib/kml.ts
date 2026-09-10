/**
 * Leer un archivo de parcelas (KML o KMZ) para mandarlo al servidor.
 *
 * Vive aparte porque lo usan dos pantallas —la de parcelas y la de
 * configuración— y es la clase de código que se copia y luego se arregla en un
 * solo lado.
 *
 * El KMZ es un zip, así que va en base64; el KML es texto y va tal cual.
 */

export interface ArchivoDeParcelas {
  fileContent: string;
  fileType: "kml" | "kmz";
}

/**
 * Un KMZ de parcelas puede pesar varios megas.
 *
 * Convertirlo byte por byte con `reduce` arma un string nuevo en cada vuelta:
 * son millones de concatenaciones y la pestaña se queda pensando. De 32 mil en
 * 32 mil son unos cientos de vueltas, y el tamaño del bloque es para no pasarse
 * del límite de argumentos de `apply`.
 */
function aBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const bloque = 0x8000;
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += bloque) {
    partes.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + bloque))));
  }
  return btoa(partes.join(""));
}

export function leerArchivoDeParcelas(archivo: File): Promise<ArchivoDeParcelas> {
  const fileType: "kml" | "kmz" = archivo.name.toLowerCase().endsWith(".kmz") ? "kmz" : "kml";

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    // Sin este `onerror`, un archivo que no se puede leer —se desmontó la USB,
    // se quedó a medias— no avisaba nada: la pantalla se quedaba esperando.
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));

    reader.onload = (e) => {
      const contenido = e.target?.result;
      if (!contenido) {
        reject(new Error("El archivo llegó vacío"));
        return;
      }
      try {
        resolve({
          fileType,
          fileContent: fileType === "kmz" ? aBase64(contenido as ArrayBuffer) : (contenido as string),
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("No se pudo preparar el archivo"));
      }
    };

    if (fileType === "kmz") {
      reader.readAsArrayBuffer(archivo);
    } else {
      reader.readAsText(archivo);
    }
  });
}
