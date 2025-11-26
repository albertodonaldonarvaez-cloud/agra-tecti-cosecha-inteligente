import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Icon } from "ol/style";

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

  useEffect(() => {
    if (!open || !mapRef.current || !latitude || !longitude) return;

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
        image: new Icon({
          anchor: [0.5, 1],
          src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSI0MCI+PHBhdGggZmlsbD0iIzIyOGIyMiIgZD0iTTE2IDAgQzguMjggMCAyIDcuMjggMiAxNWMwIDEyIDE0IDI1IDE0IDI1czE0LTEzIDE0LTI1YzAtNy43Mi02LjI4LTE1LTE0LTE1em0wIDIwYy0yLjc2IDAtNS0yLjI0LTUtNXMyLjI0LTUgNS01IDUgMi4yNCA1IDUtMi4yNCA1LTUgNXoiLz48L3N2Zz4=",
          scale: 1,
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
        zoom: 18, // Zoom cercano para ver detalles
      }),
    });

    mapInstanceRef.current = map;

    // Limpiar al desmontar
    return () => {
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
              className="w-full h-[500px] rounded-lg border border-border"
            />
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
