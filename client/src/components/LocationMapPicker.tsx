import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat, toLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Circle, Fill, Stroke } from "ol/style";
import "../styles/openlayers.css";

interface LocationMapPickerProps {
  latitude: string;
  longitude: string;
  onLocationChange: (lat: string, lng: string) => void;
}

export default function LocationMapPicker({
  latitude,
  longitude,
  onLocationChange,
}: LocationMapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const markerLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;

    // Coordenadas iniciales (México central por defecto)
    const defaultLat = parseFloat(latitude) || 19.4326;
    const defaultLng = parseFloat(longitude) || -99.1332;

    // Crear capa de marcador
    const markerSource = new VectorSource();
    const markerLayer = new VectorLayer({
      source: markerSource,
      style: new Style({
        image: new Circle({
          radius: 8,
          fill: new Fill({ color: "#ef4444" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      }),
    });
    markerLayerRef.current = markerLayer;

    // Crear marcador inicial si hay coordenadas
    if (latitude && longitude) {
      const marker = new Feature({
        geometry: new Point(fromLonLat([defaultLng, defaultLat])),
      });
      markerSource.addFeature(marker);
    }

    // Crear mapa
    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        markerLayer,
      ],
      view: new View({
        center: fromLonLat([defaultLng, defaultLat]),
        zoom: 13,
      }),
    });

    mapInstanceRef.current = map;

    // Agregar evento de click en el mapa
    map.on("click", (event) => {
      const coords = toLonLat(event.coordinate);
      const [lng, lat] = coords;

      // Actualizar marcador
      markerSource.clear();
      const marker = new Feature({
        geometry: new Point(fromLonLat([lng, lat])),
      });
      markerSource.addFeature(marker);

      // Notificar cambio de ubicación
      onLocationChange(lat.toFixed(6), lng.toFixed(6));
    });

    setTimeout(() => {
      map.updateSize();
      setMapReady(true);
    }, 100);

    return () => {
      map.setTarget(undefined);
      mapInstanceRef.current = null;
    };
  }, []);

  // Actualizar marcador cuando cambian las coordenadas externamente
  useEffect(() => {
    if (!mapInstanceRef.current || !markerLayerRef.current) return;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) return;

    const markerSource = markerLayerRef.current.getSource();
    if (!markerSource) return;

    markerSource.clear();
    const marker = new Feature({
      geometry: new Point(fromLonLat([lng, lat])),
    });
    markerSource.addFeature(marker);

    // Centrar mapa en la nueva ubicación
    mapInstanceRef.current.getView().setCenter(fromLonLat([lng, lat]));
  }, [latitude, longitude]);

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-blue-50 p-3">
        <p className="text-sm text-blue-800">
          🗺️ <strong>Click en el mapa</strong> para seleccionar la ubicación exacta de tu zona
        </p>
      </div>
      
      <div
        ref={mapRef}
        className="h-[400px] w-full rounded-lg border-2 border-gray-300 bg-gray-100"
        style={{ minHeight: "400px" }}
      >
        {!mapReady && (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">Cargando mapa...</p>
          </div>
        )}
      </div>

      {latitude && longitude && (
        <div className="rounded-lg bg-green-50 p-3">
          <p className="text-sm text-green-800">
            📍 <strong>Ubicación seleccionada:</strong> {parseFloat(latitude).toFixed(6)}, {parseFloat(longitude).toFixed(6)}
          </p>
        </div>
      )}
    </div>
  );
}
