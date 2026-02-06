import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import "../styles/openlayers.css";
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import CircleGeom from "ol/geom/Circle";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Circle, Fill, Stroke } from "ol/style";

interface BoxLocationMapProps {
  latitude: string | null;
  longitude: string | null;
  boxCode: string;
}

export function BoxLocationMap({ latitude, longitude, boxCode }: BoxLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<OlMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!latitude || !longitude || !mapRef.current) return;

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) return;

    // Limpiar mapa anterior si existe
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setTarget(undefined);
      mapInstanceRef.current = null;
    }

    // Crear marcador
    const marker = new Feature({
      geometry: new Point(fromLonLat([lon, lat])),
    });

    marker.setStyle(
      new Style({
        image: new Circle({
          radius: 8,
          fill: new Fill({ color: "#22c55e" }),
          stroke: new Stroke({
            color: "#ffffff",
            width: 2,
          }),
        }),
      })
    );

    // Crear círculo de precisión (~5 metros)
    const accuracyCircle = new Feature({
      geometry: new CircleGeom(fromLonLat([lon, lat]), 5),
    });

    accuracyCircle.setStyle(
      new Style({
        stroke: new Stroke({
          color: "#22c55e",
          width: 2,
        }),
        fill: new Fill({
          color: "rgba(34, 197, 94, 0.15)",
        }),
      })
    );

    const vectorSource = new VectorSource({
      features: [marker, accuracyCircle],
    });

    const vectorLayer = new VectorLayer({
      source: vectorSource,
    });

    // Crear mapa con OpenLayers
    const map = new OlMap({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        vectorLayer,
      ],
      view: new View({
        center: fromLonLat([lon, lat]),
        zoom: 16,
      }),
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    // Forzar actualización del tamaño
    setTimeout(() => {
      map.updateSize();
    }, 100);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, boxCode]);

  if (!latitude || !longitude) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <div className="text-center text-gray-500">
          <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin coordenadas GPS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={mapRef} className="w-full h-64 rounded-lg overflow-hidden border border-gray-200">
        {!mapReady && (
          <div className="flex items-center justify-center h-full bg-gray-100">
            <div className="text-sm text-gray-500">Cargando mapa...</div>
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 text-center">
        {parseFloat(latitude).toFixed(6)}, {parseFloat(longitude).toFixed(6)}
      </div>
    </div>
  );
}
