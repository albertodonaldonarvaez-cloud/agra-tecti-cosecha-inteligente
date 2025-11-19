import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Scissors, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Harvesters() {
  const { user, loading } = useAuth();
  const { data: harvesters, refetch } = trpc.harvesters.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const [customNames, setCustomNames] = useState<Record<number, string>>({});

  const updateHarvester = trpc.harvesters.updateName.useMutation({
    onSuccess: () => {
      toast.success("Nombre actualizado correctamente");
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  useEffect(() => {
    if (harvesters) {
      const names: Record<number, string> = {};
      harvesters.forEach((h) => {
        names[h.number] = h.customName || "";
      });
      setCustomNames(names);
    }
  }, [harvesters]);

  if (loading || !user) {
    return null;
  }

  if (user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <GlassCard className="p-8 text-center">
          <h2 className="mb-2 text-2xl font-bold text-green-900">Acceso Denegado</h2>
          <p className="text-green-600">Solo los administradores pueden acceder a esta página</p>
        </GlassCard>
      </div>
    );
  }

  const handleSave = (harvesterId: number, harvesterNumber: number) => {
    updateHarvester.mutate({
      harvesterId: harvesterNumber,  // Usar el número de cortadora, no el ID
      customName: customNames[harvesterNumber] || "",
    });
  };

  const getHarvesterType = (number: number) => {
    if (number === 97) return "Recolecta (Primera Calidad)";
    if (number === 98) return "Segunda Calidad";
    if (number === 99) return "Desperdicio";
    return "Cortadora";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-green-900">Configuración de Cortadoras</h1>
          <p className="text-green-700">Personaliza los nombres de las cortadoras y categorías especiales</p>
        </div>

        {harvesters && harvesters.length > 0 ? (
          <div className="space-y-4">
            {harvesters.map((harvester) => (
              <GlassCard key={harvester.id} className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <Scissors className="h-6 w-6 text-green-600" />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-green-900">#{harvester.number}</span>
                      <span className="text-sm text-green-600">- {getHarvesterType(harvester.number)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label htmlFor={`name-${harvester.number}`} className="sr-only">
                        Nombre personalizado
                      </Label>
                      <Input
                        id={`name-${harvester.number}`}
                        value={customNames[harvester.number] || ""}
                        onChange={(e) =>
                          setCustomNames((prev) => ({
                            ...prev,
                            [harvester.number]: e.target.value,
                          }))
                        }
                        placeholder="Nombre personalizado (opcional)"
                        className="flex-1"
                      />
                      <Button
                        onClick={() => handleSave(harvester.id, harvester.number)}
                        disabled={updateHarvester.isPending}
                        size="sm"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <Scissors className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cortadoras registradas</h3>
            <p className="text-green-600">Las cortadoras aparecerán aquí cuando se sincronicen datos</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
