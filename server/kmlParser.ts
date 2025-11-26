import { parseStringPromise } from 'xml2js';
import AdmZip from 'adm-zip';

interface Coordinate {
  lat: number;
  lng: number;
}

interface ParcelPolygon {
  name: string;
  code: string;
  coordinates: number[][][]; // GeoJSON format: [[[lon, lat], [lon, lat], ...]]
}

/**
 * Extrae coordenadas de un string de coordenadas KML
 * Formato KML: "lng,lat,alt lng,lat,alt ..."
 * Retorna formato GeoJSON: [[lon, lat], [lon, lat], ...]
 */
function parseCoordinates(coordString: string): number[][] {
  const coords = coordString.trim().split(/\s+/);
  return coords
    .map(coord => {
      const [lng, lat] = coord.split(',').map(Number);
      if (isNaN(lat) || isNaN(lng)) return null;
      return [lng, lat]; // GeoJSON format
    })
    .filter((c): c is number[] => c !== null);
}

/**
 * Extrae polígonos de un documento KML parseado
 */
function extractPolygonsFromKML(kmlData: any): ParcelPolygon[] {
  const polygons: ParcelPolygon[] = [];

  function traverse(obj: any, parentName = '') {
    if (!obj) return;

    // Buscar Placemarks (tags normalizados a minúsculas)
    if (obj.placemark) {
      const placemarks = Array.isArray(obj.placemark) ? obj.placemark : [obj.placemark];
      
      for (const placemark of placemarks) {
        const name = placemark.name?.[0] || parentName || 'Sin nombre';
        
        // Buscar polígonos
        if (placemark.polygon) {
          const polygon = placemark.polygon[0];
          const outerBoundary = polygon.outerboundaryis?.[0]?.linearring?.[0]?.coordinates?.[0];
          
          if (outerBoundary) {
            const coordinates = parseCoordinates(outerBoundary);
            if (coordinates.length >= 3) {
              // Extraer código de parcela del nombre (asume formato "CODIGO - NOMBRE" o similar)
              const codeParts = name.split(/[-–]/);
              const code = codeParts[0]?.trim() || name.trim();
              
              polygons.push({
                name: name.trim(),
                code: code,
                coordinates: [coordinates] // GeoJSON Polygon format: [[[lon, lat], ...]]
              });
            }
          }
        }

        // Buscar MultiGeometry
        if (placemark.multigeometry) {
          const multiGeom = placemark.multigeometry[0];
          if (multiGeom.polygon) {
            const polygonList = Array.isArray(multiGeom.polygon) ? multiGeom.polygon : [multiGeom.polygon];
            
            for (const polygon of polygonList) {
              const outerBoundary = polygon.outerboundaryis?.[0]?.linearring?.[0]?.coordinates?.[0];
              
              if (outerBoundary) {
                const coordinates = parseCoordinates(outerBoundary);
                if (coordinates.length >= 3) {
                  const codeParts = name.split(/[-–]/);
                  const code = codeParts[0]?.trim() || name.trim();
                  
                  polygons.push({
                    name: name.trim(),
                    code: code,
                    coordinates: [coordinates] // GeoJSON Polygon format
                  });
                }
              }
            }
          }
        }
      }
    }

    // Buscar Document y Folder recursivamente
    if (obj.document) {
      const docs = Array.isArray(obj.document) ? obj.document : [obj.document];
      docs.forEach((doc: any) => traverse(doc, parentName));
    }
    
    if (obj.folder) {
      const folders = Array.isArray(obj.folder) ? obj.folder : [obj.folder];
      folders.forEach((folder: any) => {
        const folderName = folder.name?.[0] || parentName;
        traverse(folder, folderName);
      });
    }
  }

  if (kmlData.kml) {
    traverse(kmlData.kml);
  }

  return polygons;
}

/**
 * Parsea un archivo KML y extrae los polígonos de parcelas
 */
export async function parseKML(kmlContent: string): Promise<ParcelPolygon[]> {
  try {
    const kmlData = await parseStringPromise(kmlContent, {
      explicitArray: true,
      mergeAttrs: true,
      normalize: true,
      normalizeTags: true,
      trim: true
    });

    return extractPolygonsFromKML(kmlData);
  } catch (error) {
    throw new Error(`Error parsing KML: ${error}`);
  }
}

/**
 * Parsea un archivo KMZ (KML comprimido) y extrae los polígonos
 */
export async function parseKMZ(kmzBuffer: Buffer): Promise<ParcelPolygon[]> {
  try {
    const zip = new AdmZip(kmzBuffer);
    const zipEntries = zip.getEntries();

    // Buscar el archivo KML principal (usualmente doc.kml)
    let kmlEntry = zipEntries.find(entry => entry.entryName === 'doc.kml');
    if (!kmlEntry) {
      // Buscar cualquier archivo .kml
      kmlEntry = zipEntries.find(entry => entry.entryName.endsWith('.kml'));
    }

    if (!kmlEntry) {
      throw new Error('No se encontró archivo KML dentro del KMZ');
    }

    const kmlContent = kmlEntry.getData().toString('utf8');
    return await parseKML(kmlContent);
  } catch (error) {
    throw new Error(`Error parsing KMZ: ${error}`);
  }
}

/**
 * Verifica si un punto está dentro de un polígono usando el algoritmo Ray Casting
 */
export function isPointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Encuentra la parcela que contiene un punto dado
 */
export function findParcelByCoordinates(
  lat: number,
  lng: number,
  parcels: Array<{ code: string; name: string; polygon: string | null }>
): { code: string; name: string } | null {
  const point: Coordinate = { lat, lng };

  for (const parcel of parcels) {
    if (!parcel.polygon) continue;

    try {
      const polygon: Coordinate[] = JSON.parse(parcel.polygon);
      if (isPointInPolygon(point, polygon)) {
        return { code: parcel.code, name: parcel.name };
      }
    } catch (error) {
      console.error(`Error parsing polygon for parcel ${parcel.code}:`, error);
    }
  }

  return null;
}
