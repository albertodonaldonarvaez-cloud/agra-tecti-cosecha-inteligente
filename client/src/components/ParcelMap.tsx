import { useEffect, useRef, useState } from "react";
import "../styles/openlayers.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Fill, Stroke, Text } from "ol/style";
import Feature from "ol/Feature";
import Polygon from "ol/geom/Polygon";

interface Parcel {
  code: string;
  name: string;
  coordinates: number[][][]; // [[[lon, lat], [lon, lat], ...]]
}

interface ParcelMapProps {
  parcels: Parcel[];
  height?: string;
}

export function ParcelMap({ parcels, height = "600px" }: ParcelMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    console.log('ParcelMap useEffect - parcels:', parcels.length, parcels);
    if (!mapRef.current || parcels.length === 0) {
      console.log('Saliendo: mapRef o parcels vacío');
      return;
    }

    // Limpiar mapa anterior si existe
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setTarget(undefined);
      mapInstanceRef.current = null;
    }

    // Esperar a que el DOM esté listo
    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      // Crear features de polígonos para cada parcela
      const features = parcels.map((parcel, index) => {
        console.log(`Procesando parcela ${parcel.code}:`, parcel.coordinates);
        
        // Validar que coordinates sea un array
        if (!Array.isArray(parcel.coordinates) || parcel.coordinates.length === 0) {
          console.error(`Parcela ${parcel.code} tiene coordenadas inválidas`);
          return null;
        }
        
        // Convertir coordenadas a formato OpenLayers
        const coordinates = parcel.coordinates.map(ring =>
          ring.map(coord => fromLonLat([coord[0], coord[1]]))
        );

        const polygon = new Polygon(coordinates);
        const feature = new Feature({
          geometry: polygon,
          name: parcel.name,
          code: parcel.code,
        });

        // Colores alternados para distinguir parcelas
        const colors = [
          'rgba(34, 197, 94, 0.3)',   // verde
          'rgba(59, 130, 246, 0.3)',  // azul
          'rgba(251, 146, 60, 0.3)',  // naranja
          'rgba(168, 85, 247, 0.3)',  // morado
          'rgba(236, 72, 153, 0.3)',  // rosa
          'rgba(234, 179, 8, 0.3)',   // amarillo
        ];

        feature.setStyle(
          new Style({
            fill: new Fill({
              color: colors[index % colors.length],
            }),
            stroke: new Stroke({
              color: '#16a34a',
              width: 2,
            }),
            text: new Text({
              text: parcel.name,
              font: 'bold 12px sans-serif',
              fill: new Fill({ color: '#000' }),
              stroke: new Stroke({ color: '#fff', width: 3 }),
              offsetY: 0,
            }),
          })
        );

        return feature;
      }).filter(f => f !== null);

      console.log('Features creados:', features.length);

      if (features.length === 0) {
        console.error('No se crearon features válidos');
        return;
      }

      const vectorSource = new VectorSource({
        features: features,
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
      });

      // Calcular el centro y extent de todas las parcelas
      const extent = vectorSource.getExtent();
      console.log('Extent calculado:', extent);

      // Crear mapa
      const map = new Map({
        target: mapRef.current,
        layers: [
          new TileLayer({
            source: new OSM(),
          }),
          vectorLayer,
        ],
        view: new View({
          center: fromLonLat([-99.18, 18.693]), // Centro aproximado de tus parcelas
          zoom: 14,
        }),
      });

      // Ajustar vista para mostrar todas las parcelas
      map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        duration: 1000,
      });

      mapInstanceRef.current = map;
      setMapReady(true);

      // Forzar actualización del tamaño del mapa
      setTimeout(() => {
        map.updateSize();
      }, 100);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, [parcels]);

  return (
    <div
      ref={mapRef}
      className="w-full rounded-lg border border-border bg-gray-100"
      style={{ height, minHeight: height }}
    >
      {!mapReady && (
        <div className="flex items-center justify-center h-full">
          <div className="text-sm text-muted-foreground">Cargando mapa de parcelas...</div>
        </div>
      )}
    </div>
  );
}
