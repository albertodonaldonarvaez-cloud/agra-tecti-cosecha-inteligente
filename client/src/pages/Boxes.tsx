import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { ProtectedPage } from "@/components/ProtectedPage";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getBoxPhotoUrl } from "@/lib/imageProxy";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_LOGO, getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Package, X, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";

import { useEffect, useState, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";

interface Box {
  id: number;
  boxCode: string;
  harvesterId: number;
  parcelCode: string;
  parcelName: string;
  weight: number;
  photoUrl: string | null;
  photoLocalPath?: string | null; // Copia guardada en el servidor
  submissionTime: Date;
  // El ciclo lo deduce el servidor de la fecha de la caja (server/ciclos.ts).
  // No se lee de boxes.cycleId: lo que entra por Kobo deja esa columna en nulo.
  cycleId?: number | null;
  cycleName?: string | null;
}

interface CicloOpcion {
  id: number;
  name: string;
  desde: string;
  hasta: string;
  esElDeHoy: boolean;
  cajas: number;
}

// Un día suelto "YYYY-MM-DD" en palabras, sin que la zona horaria lo recorra
const diaEnPalabras = (fecha: string, opts?: Intl.DateTimeFormatOptions) =>
  new Date(fecha + "T12:00:00").toLocaleDateString("es-MX", opts ?? { day: "numeric", month: "short", year: "numeric" });

/**
 * A qué cosecha pertenece un renglón.
 *
 * "Sin ciclo" no es un hueco que haya que rellenar con el ciclo actual: es una
 * fecha que no cae en ninguno de los ciclos capturados, casi siempre por un
 * error de captura. Marcarla en ámbar es la única forma de que se note.
 */
function CicloChip({ nombre, actual, className = "" }: { nombre?: string | null; actual?: boolean; className?: string }) {
  if (!nombre) {
    return (
      <span
        title="La fecha de esta caja no cae dentro de ningún ciclo registrado"
        className={`inline-flex items-center gap-1 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300/60 ${className}`}
      >
        Sin ciclo
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        actual
          ? "bg-emerald-100/80 text-emerald-800 ring-emerald-300/60"
          : "bg-slate-100/80 text-slate-600 ring-slate-300/60"
      } ${className}`}
    >
      {actual && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {nombre}
    </span>
  );
}

export default function Boxes() {
  return (
    <ProtectedPage permission="canViewBoxes">
      <BoxesContent />
    </ProtectedPage>
  );
}

// Skeleton para tabla
function TableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-green-100">
            <div className="h-4 bg-green-200 rounded w-24"></div>
            <div className="h-4 bg-green-200 rounded w-20"></div>
            <div className="h-4 bg-green-200 rounded w-32"></div>
            <div className="h-4 bg-green-200 rounded w-16"></div>
            <div className="h-4 bg-green-200 rounded w-24"></div>
            <div className="h-4 bg-green-200 rounded w-8"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Un ciclo como botón: nombre arriba, cuántas cajas y qué rango de fechas
 * abajo. El rango va escrito porque es lo que de verdad define al ciclo — la
 * caja no dice a cuál pertenece, se sabe por su fecha.
 */
function CicloBoton({
  activo,
  onClick,
  titulo,
  detalle,
  actual,
  aviso,
}: {
  activo: boolean;
  onClick: () => void;
  titulo: string;
  detalle: string;
  actual?: boolean;
  aviso?: boolean;
}) {
  const base = "rounded-2xl border px-4 py-2.5 text-left transition-all duration-200 backdrop-blur-sm";
  const estado = activo
    ? aviso
      ? "border-amber-400 bg-amber-50 shadow-md ring-1 ring-amber-300"
      : "border-green-500 bg-green-50 shadow-md ring-1 ring-green-400"
    : "border-green-200/70 bg-white/50 hover:border-green-400 hover:bg-white/80";

  return (
    <button type="button" onClick={onClick} className={`${base} ${estado}`}>
      <div className="flex items-center gap-2">
        {actual && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />}
        <span className={`text-sm font-semibold ${aviso ? "text-amber-900" : "text-green-900"}`}>{titulo}</span>
        {actual && <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">en curso</span>}
      </div>
      <div className={`mt-0.5 text-[11px] ${aviso ? "text-amber-700" : "text-green-600"}`}>{detalle}</div>
    </button>
  );
}

/** Un dato del modal: rótulo chico, valor, y una línea de contexto abajo. */
function DatoDelModal({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string | null }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/60 p-4 backdrop-blur-sm">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-600/80">{titulo}</p>
      <p className="font-semibold text-green-900">{valor}</p>
      {pie && <p className="mt-0.5 text-xs text-gray-500">{pie}</p>}
    </div>
  );
}

function BoxesContent() {
  const { user, loading } = useAuth();
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [page, setPage] = useState(1);
  // Reducir pageSize en móvil para mejor rendimiento
  const [pageSize] = useState(window.innerWidth < 768 ? 25 : 50);
  const [filterDate, setFilterDate] = useState<string>("all");
  // "all" = toda la historia. Se arranca así a propósito: la pantalla siempre
  // mostró todo y cambiarle el default de golpe le escondería cajas a alguien
  // que ni se enteró de que ahora hay ciclos.
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const [filterParcel, setFilterParcel] = useState<string>("all");
  const [filterHarvester, setFilterHarvester] = useState<string>("all");
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Debounce para búsqueda (espera 300ms después de dejar de escribir)
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
    setPage(1);
  }, 300);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedSearch(value);
  };
  
  // Obtener opciones de filtro (carga rápida)
  const { data: filterOptions } = trpc.boxes.filterOptions.useQuery(undefined, {
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  // Obtener datos paginados
  const { data: paginatedData, isLoading, isFetching } = trpc.boxes.listPaginated.useQuery(
    {
      page,
      pageSize,
      filterDate: filterDate !== "all" ? filterDate : undefined,
      filterCycle: filterCycle !== "all" ? filterCycle : undefined,
      filterParcel: filterParcel !== "all" ? filterParcel : undefined,
      filterHarvester: filterHarvester !== "all" ? parseInt(filterHarvester) : undefined,
      search: searchQuery || undefined,
    },
    {
      enabled: !!user,
      placeholderData: (prev) => prev, // Mantener datos anteriores mientras carga
    }
  );

  const { data: harvesters } = trpc.harvesters.list.useQuery(undefined, {
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // Cache por 10 minutos
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  // Reset página cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [filterDate, filterCycle, filterParcel, filterHarvester]);

  if (loading || !user) {
    return <Loading />;
  }

  const getHarvesterName = (harvesterId: number) => {
    const harvester = harvesters?.find(h => h.number === harvesterId);
    if (harvester?.customName) return harvester.customName;
    
    if (harvesterId === 97) return "Recolecta (1ra Calidad)";
    if (harvesterId === 98) return "Segunda Calidad";
    if (harvesterId === 99) return "Desperdicio";
    return `Cortadora #${harvesterId}`;
  };

  const getQualityType = (harvesterId: number) => {
    if (harvesterId === 97) return { label: "Recolecta", color: "text-green-600" };
    if (harvesterId === 98) return { label: "2da Calidad", color: "text-yellow-600" };
    if (harvesterId === 99) return { label: "Desperdicio", color: "text-red-600" };
    return { label: "1ra Calidad", color: "text-green-600" };
  };

  const handleClearFilters = () => {
    setFilterDate("all");
    setFilterCycle("all");
    setFilterParcel("all");
    setFilterHarvester("all");
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  };

  const boxes = paginatedData?.boxes || [];
  const total = paginatedData?.total || 0;
  const totalPages = paginatedData?.totalPages || 0;

  const ciclos: CicloOpcion[] = filterOptions?.cycles ?? [];
  const sinCiclo = filterOptions?.sinCiclo ?? 0;
  const cicloDeHoy = ciclos.find((c) => c.esElDeHoy) ?? null;

  // Los días que se ofrecen en el filtro de fecha son los del ciclo escogido.
  // Antes salían los mismos siempre —y solo los últimos 60— así que escoger un
  // ciclo pasado dejaba el filtro de fecha sin una sola opción que sirviera.
  const dias = (filterOptions?.days ?? []).filter((d: { cycleId: number | null }) => {
    if (filterCycle === "all") return true;
    if (filterCycle === "sin") return d.cycleId === null;
    return String(d.cycleId) === filterCycle;
  });

  // Cambiar de ciclo tira la fecha escogida: es de otra cosecha y juntas no
  // devuelven nada, que se ve igual que "no hay cajas".
  const cambiarCiclo = (valor: string) => {
    setFilterCycle(valor);
    setFilterDate("all");
  };

  // Formatear fecha para mostrar
  const formatDateDisplay = (dateStr: string) => diaEnPalabras(dateStr);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container px-3 md:px-6">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-center gap-3 md:gap-4">
          <img src={APP_LOGO} alt="Agratec" className="h-12 w-12 md:h-16 md:w-16" />
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-green-900">Cajas Registradas</h1>
            <p className="text-xs md:text-base text-green-700">
              {total.toLocaleString()} cajas
              {/* Qué se está viendo: sin esto "12,400 cajas" no dice de qué cosecha son */}
              {filterCycle === "all"
                ? cicloDeHoy && <span className="text-green-600"> · todas las cosechas, la de hoy es {cicloDeHoy.name}</span>
                : filterCycle === "sin"
                  ? <span className="text-amber-700"> · con fecha fuera de todo ciclo</span>
                  : <span className="text-green-600"> · {ciclos.find((c) => String(c.id) === filterCycle)?.name}</span>}
              {isFetching && !isLoading && (
                <span className="ml-2 text-sm text-green-500">Actualizando...</span>
              )}
            </p>
          </div>
        </div>

        {/* Buscador y Filtros */}
        <GlassCard className="mb-4 md:mb-6 p-3 md:p-6">
          {/* Buscador */}
          <div className="mb-4 md:mb-6">
            <label className="mb-2 block text-sm font-medium text-green-900">Buscar por código de caja</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-green-500" />
              <Input
                type="text"
                placeholder="Ej: 01-123456"
                value={searchInput}
                onChange={handleSearchChange}
                className="pl-10 border-green-200 focus:border-green-500 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Ciclos: la cosecha se parte por rango de fechas, que es el único
              dato que traen todas las cajas vengan de Kobo, de Excel o de la
              báscula. Van como botones y no como lista desplegable para que el
              reparto de cajas entre cosechas se vea sin abrir nada. */}
          {ciclos.length > 0 && (
            <div className="mb-4 md:mb-6">
              <label className="mb-2 block text-sm font-medium text-green-900">Ciclo de producción</label>
              <div className="flex flex-wrap gap-2">
                <CicloBoton
                  activo={filterCycle === "all"}
                  onClick={() => cambiarCiclo("all")}
                  titulo="Todos los ciclos"
                  detalle={`${(filterOptions?.dates.length ?? 0).toLocaleString()} días con cosecha`}
                />
                {ciclos.map((c) => (
                  <CicloBoton
                    key={c.id}
                    activo={filterCycle === String(c.id)}
                    onClick={() => cambiarCiclo(String(c.id))}
                    titulo={c.name}
                    detalle={`${c.cajas.toLocaleString()} cajas · ${diaEnPalabras(c.desde, { day: "numeric", month: "short" })} a ${diaEnPalabras(c.hasta, { day: "numeric", month: "short", year: "numeric" })}`}
                    actual={c.esElDeHoy}
                  />
                ))}
                {sinCiclo > 0 && (
                  <CicloBoton
                    activo={filterCycle === "sin"}
                    onClick={() => cambiarCiclo("sin")}
                    titulo="Sin ciclo"
                    detalle={`${sinCiclo.toLocaleString()} cajas con fecha fuera de todo ciclo`}
                    aviso
                  />
                )}
              </div>
            </div>
          )}

          <div className="mb-4 flex items-center gap-2">
            <Filter className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-green-900">Filtros</h2>
          </div>
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-green-900">Fecha</label>
              <Select value={filterDate} onValueChange={setFilterDate}>
                <SelectTrigger className="border-green-200">
                  <SelectValue placeholder="Todas las fechas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fechas</SelectItem>
                  {dias.map((d: { fecha: string; cajas: number }) => (
                    <SelectItem key={d.fecha} value={d.fecha}>
                      {formatDateDisplay(d.fecha)} · {d.cajas} cajas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-green-900">Parcela</label>
              <Select value={filterParcel} onValueChange={setFilterParcel}>
                <SelectTrigger className="border-green-200">
                  <SelectValue placeholder="Todas las parcelas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las parcelas</SelectItem>
                  {filterOptions?.parcels.map((p: { code: string; name: string }) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.code} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-green-900">Cortadora</label>
              <Select value={filterHarvester} onValueChange={setFilterHarvester}>
                <SelectTrigger className="border-green-200">
                  <SelectValue placeholder="Todas las cortadoras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cortadoras</SelectItem>
                  {filterOptions?.harvesters.map((id: number) => (
                    <SelectItem key={id} value={id.toString()}>
                      #{id} - {getHarvesterName(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleClearFilters}
                variant="outline"
                className="w-full border-green-600 text-green-700 hover:bg-green-50"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </GlassCard>

        {/* Tabla con datos */}
        <GlassCard className="overflow-hidden p-6" hover={false}>
          {isLoading ? (
            <TableSkeleton />
          ) : boxes.length > 0 ? (
            <>
              {/* Vista de tarjetas para móvil */}
              <div className="block md:hidden space-y-3">
                {boxes.map((box) => {
                  const quality = getQualityType(box.harvesterId);
                  return (
                    <div
                      key={box.id}
                      className="cursor-pointer rounded-lg border border-green-200 p-4 transition-colors hover:bg-green-50/50 active:bg-green-100/50"
                      onClick={() => setSelectedBox(box as Box)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-green-900">{box.boxCode}</span>
                        <span className="font-semibold text-green-900">{box.weight ? (box.weight / 1000).toFixed(2) : '0.00'} kg</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className={`${quality.color} font-medium`}>#{box.harvesterId} - {quality.label}</span>
                        <span className="text-green-600">{new Date(box.submissionTime).toLocaleDateString('es-MX')}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-green-600">{box.parcelName} ({box.parcelCode})</span>
                        <CicloChip nombre={box.cycleName} actual={box.cycleId === cicloDeHoy?.id} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vista de tabla para desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-green-200">
                      <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Código</th>
                      <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Cortadora</th>
                      <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Parcela</th>
                      <th className="pb-3 pr-8 text-right text-sm font-semibold text-green-900">Peso</th>
                      <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Fecha</th>
                      <th className="pb-3 pr-8 text-left text-sm font-semibold text-green-900">Ciclo</th>
                      <th className="pb-3 text-center text-sm font-semibold text-green-900">Foto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((box) => {
                      const quality = getQualityType(box.harvesterId);
                      return (
                        <tr
                          key={box.id}
                          className="cursor-pointer border-b border-green-100 transition-colors hover:bg-green-50/50"
                          onClick={() => setSelectedBox(box as Box)}
                        >
                          <td className="py-3 pr-8 text-sm font-semibold text-green-900">{box.boxCode}</td>
                          <td className="py-3 pr-8 text-sm text-green-900">
                            <div>
                              <div className="font-semibold">#{box.harvesterId}</div>
                              <div className={`text-xs ${quality.color}`}>{quality.label}</div>
                            </div>
                          </td>
                          <td className="py-3 pr-8 text-sm text-green-900">
                            <div>
                              <div className="font-semibold">{box.parcelName}</div>
                              <div className="text-xs text-green-600">{box.parcelCode}</div>
                            </div>
                          </td>
                          <td className="py-3 pr-8 text-right text-sm font-semibold text-green-900">
                            {box.weight ? (box.weight / 1000).toFixed(2) : '0.00'} kg
                          </td>
                          <td className="py-3 pr-8 text-sm text-green-900">
                            {new Date(box.submissionTime).toLocaleDateString('es-MX')}
                          </td>
                          <td className="py-3 pr-8 whitespace-nowrap">
                            <CicloChip nombre={box.cycleName} actual={box.cycleId === cicloDeHoy?.id} />
                          </td>
                          <td className="py-3 text-center">
                            {box.photoUrl ? (
                              <Package className="mx-auto h-5 w-5 text-green-600" />
                            ) : (
                              <X className="mx-auto h-5 w-5 text-gray-300" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-green-200 pt-4">
                <div className="text-sm text-green-700">
                  Mostrando {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} de {total.toLocaleString()} cajas
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(1)}
                    disabled={page === 1 || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm font-medium text-green-900">
                      Página {page} de {totalPages}
                    </span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages || isFetching}
                    className="border-green-300 hover:bg-green-50"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center">
              <Package className="mx-auto mb-4 h-16 w-16 text-green-300" />
              <h3 className="mb-2 text-xl font-semibold text-green-900">No hay cajas que coincidan</h3>
              <p className="text-green-600">Intenta ajustar los filtros o la búsqueda</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Modal de Detalles */}
      <Dialog open={!!selectedBox} onOpenChange={() => setSelectedBox(null)}>
        <DialogContent
          showCloseButton={false}
          /* El velo se desenfoca: la tabla de atrás tiene mucho texto chico y
             sin blur compite con la foto de la caja. */
          overlayClassName="bg-green-950/50 backdrop-blur-md"
          className="max-w-6xl gap-0 overflow-hidden rounded-3xl border border-white/50 bg-white/70 p-0 shadow-2xl backdrop-blur-2xl"
        >
          {selectedBox && (
            <div className="flex max-h-[90vh] flex-col lg:flex-row">
              {/* Cerrar: propio y no el de la librería, que se pierde encima de la foto */}
              <button
                type="button"
                onClick={() => setSelectedBox(null)}
                aria-label="Cerrar"
                className="absolute right-4 top-4 z-20 rounded-full bg-white/70 p-2 text-green-900 shadow-lg ring-1 ring-white/60 backdrop-blur-md transition hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Foto */}
              <div className="relative flex min-h-[35vh] flex-1 items-center justify-center overflow-hidden bg-green-950/90 p-4 lg:min-h-[70vh] lg:p-6">
                {selectedBox.photoUrl ? (
                  <>
                    {/* La misma foto, ampliada y desenfocada, rellena las orillas
                        en vez de dejar dos franjas negras a los lados. */}
                    <img
                      src={getBoxPhotoUrl(selectedBox) || ""}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
                    />
                    <img
                      src={getBoxPhotoUrl(selectedBox) || ""}
                      alt={`Caja ${selectedBox.boxCode}`}
                      className="relative max-h-[45vh] w-full rounded-2xl object-contain shadow-2xl lg:max-h-[78vh]"
                    />
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-green-200/70">
                    <Package className="h-16 w-16" />
                    <p className="text-sm">Esta caja se registró sin foto</p>
                  </div>
                )}
              </div>

              {/* Información */}
              <div className="flex-1 overflow-y-auto bg-white/80 p-6 backdrop-blur-xl lg:p-8">
                <DialogHeader className="mb-6">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <CicloChip nombre={selectedBox.cycleName} actual={selectedBox.cycleId === cicloDeHoy?.id} />
                    <span className={`inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-green-200 ${getQualityType(selectedBox.harvesterId).color}`}>
                      {getQualityType(selectedBox.harvesterId).label}
                    </span>
                  </div>
                  <DialogTitle className="text-3xl font-bold tracking-tight text-green-900">
                    {selectedBox.boxCode}
                  </DialogTitle>
                </DialogHeader>

                {/* Peso: es el dato por el que se abre este modal, va solo y grande */}
                <div className="mb-6 rounded-2xl border border-green-200/60 bg-gradient-to-br from-green-50/90 to-emerald-50/60 p-5 backdrop-blur-sm">
                  <p className="mb-1 text-sm text-green-600">Peso neto</p>
                  <p className="text-4xl font-bold tracking-tight text-green-900">
                    {selectedBox.weight ? (selectedBox.weight / 1000).toFixed(2) : "0.00"}
                    <span className="ml-1 text-xl font-semibold">kg</span>
                  </p>
                  <p className="mt-1 text-xs text-green-700/70">{(selectedBox.weight || 0).toLocaleString()} gramos, ya sin tara</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DatoDelModal titulo="Parcela" valor={selectedBox.parcelCode} pie={selectedBox.parcelName} />
                  <DatoDelModal
                    titulo="Cortadora"
                    valor={`#${selectedBox.harvesterId}`}
                    pie={getHarvesterName(selectedBox.harvesterId)}
                  />
                  <DatoDelModal
                    titulo="Fecha de registro"
                    valor={new Date(selectedBox.submissionTime).toLocaleDateString("es-MX", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    pie={new Date(selectedBox.submissionTime).toLocaleTimeString("es-MX")}
                  />
                  <DatoDelModal
                    titulo="Ciclo"
                    valor={selectedBox.cycleName ?? "Sin ciclo"}
                    pie={
                      selectedBox.cycleName
                        ? "Por la fecha en que se registró"
                        : "Su fecha no cae en ningún ciclo capturado"
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
