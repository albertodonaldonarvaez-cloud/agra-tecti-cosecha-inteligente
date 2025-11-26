import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import "../styles/openlayers.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Circle, Fill, Stroke } from "ol/style";

interface MapModalProps {
  open: boolean;
  onClose: () => void;
  latitude: string | null;
  longitude: string | null;
  boxCode: string;
}

export function MapModal({ open, onClose, latitude, longitude, boxCode }: MapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setMapReady(false);
      return;
    }

    if (!latitude || !longitude) return;

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon)) return;

    // Esperar a que el DOM esté listo
    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      // Limpiar mapa anterior si existe
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }

      // Crear marcador con estilo simple
      const marker = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
      });

      marker.setStyle(
        new Style({
          image: new Circle({
            radius: 8,
            fill: new Fill({ color: '#22c55e' }),
            stroke: new Stroke({
              color: '#16a34a',
              width: 3,
            }),
          }),
        })
      );

      const vectorSource = new VectorSource({
        features: [marker],
      });

      const vectorLayer = new VectorLayer({
        source: vectorSource,
      });

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
          center: fromLonLat([lon, lat]),
          zoom: 18,
        }),
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
  }, [open, latitude, longitude]);

  const hasCoordinates = latitude && longitude && !isNaN(parseFloat(latitude)) && !isNaN(parseFloat(longitude));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Ubicación de Cosecha - {boxCode}</DialogTitle>
        </DialogHeader>
        {hasCoordinates ? (
          <div>
            <div className="mb-2 text-sm text-muted-foreground">
              Coordenadas: {parseFloat(latitude!).toFixed(6)}, {parseFloat(longitude!).toFixed(6)}
            </div>
            <div
              ref={mapRef}
              className="w-full h-[500px] rounded-lg border border-border bg-gray-100"
              style={{ minHeight: '500px' }}
            >
              {!mapReady && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-muted-foreground">Cargando mapa...</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No hay coordenadas disponibles para esta caja
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
