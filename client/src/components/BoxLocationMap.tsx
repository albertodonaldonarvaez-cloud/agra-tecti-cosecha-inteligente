import { useEffect, useRef } from "react";
import { MapPin } from "lucide-react";

interface BoxLocationMapProps {
  latitude: string | null;
  longitude: string | null;
  boxCode: string;
}

export function BoxLocationMap({ latitude, longitude, boxCode }: BoxLocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (!latitude || !longitude || !mapRef.current) return;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) return;

    // Inicializar el mapa
    const map = new google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: 16,
      mapTypeId: google.maps.MapTypeId.HYBRID,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
    });

    // Agregar marcador
    new google.maps.Marker({
      position: { lat, lng },
      map,
      title: `Caja ${boxCode}`,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#22c55e",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });

    // Agregar círculo de precisión (aproximadamente 5 metros)
    new google.maps.Circle({
      strokeColor: "#22c55e",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.15,
      map,
      center: { lat, lng },
      radius: 5, // 5 metros
    });

    mapInstanceRef.current = map;

    return () => {
      // Cleanup si es necesario
      mapInstanceRef.current = null;
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
      <div ref={mapRef} className="w-full h-64 rounded-lg overflow-hidden border border-gray-200" />
      <div className="text-xs text-gray-500 text-center">
        📍 {parseFloat(latitude).toFixed(6)}, {parseFloat(longitude).toFixed(6)}
      </div>
    </div>
  );
}
