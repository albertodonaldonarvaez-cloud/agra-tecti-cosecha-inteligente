import {
  BookOpen, Calendar, Pause, CheckCircle2, AlertCircle,
  Droplets, FlaskConical, Scissors, Bug, Sprout, Leaf, Shield,
  type LucideIcon,
} from "lucide-react";

// Constantes compartidas de la Libreta de Campo.
// Se usan en FieldNotebook.tsx (formulario/lista) y en Home.tsx (dashboard).

export interface ActivityTypeInfo {
  value: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

export const ACTIVITY_TYPES: ActivityTypeInfo[] = [
  { value: "riego", label: "Riego", icon: Droplets, color: "text-blue-600 bg-blue-50" },
  { value: "fertilizacion", label: "Fertilización", icon: FlaskConical, color: "text-amber-600 bg-amber-50" },
  { value: "nutricion", label: "Nutrición", icon: Leaf, color: "text-green-600 bg-green-50" },
  { value: "poda", label: "Poda", icon: Scissors, color: "text-purple-600 bg-purple-50" },
  { value: "control_maleza", label: "Control Maleza", icon: Sprout, color: "text-lime-600 bg-lime-50" },
  { value: "control_plagas", label: "Control Plagas", icon: Bug, color: "text-red-600 bg-red-50" },
  { value: "aplicacion_fitosanitaria", label: "Fitosanitaria", icon: Shield, color: "text-teal-600 bg-teal-50" },
  { value: "otro", label: "Otro", icon: BookOpen, color: "text-gray-600 bg-gray-50" },
];

export const ACTIVITY_SUBTYPES: Record<string, string[]> = {
  riego: ["Goteo", "Aspersión", "Gravedad", "Microaspersión", "Inundación", "Fertirriego"],
  fertilizacion: ["Granular al suelo", "Líquida", "Foliar", "Orgánica", "Fertirriego", "Enmienda", "Cal agrícola", "Yeso agrícola"],
  nutricion: ["Foliar", "Radicular", "Bioestimulante", "Ácidos húmicos", "Aminoácidos", "Microelementos"],
  poda: ["Formación", "Producción", "Sanitaria", "Rejuvenecimiento", "Despunte", "Aclareo", "Deshoje"],
  control_maleza: ["Herbicida preemergente", "Herbicida postemergente", "Herbicida selectivo", "Herbicida no selectivo", "Mecánico (desbrozadora)", "Mecánico (machete)", "Mecánico (azadón)", "Manual", "Cobertura vegetal"],
  control_plagas: ["Insecticida", "Fungicida", "Acaricida", "Nematicida", "Biológico", "Trampas", "Monitoreo"],
  aplicacion_fitosanitaria: ["Preventiva", "Curativa", "Erradicante", "Protectante"],
};

export const STATUS_OPTIONS = [
  { value: "planificada", label: "Planificada", icon: Calendar, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { value: "en_progreso", label: "En Progreso", icon: Pause, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { value: "completada", label: "Completada", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  { value: "cancelada", label: "Cancelada", icon: AlertCircle, color: "text-red-600 bg-red-50 border-red-200" },
];

export function getActivityTypeInfo(value: string): ActivityTypeInfo {
  return ACTIVITY_TYPES.find((t) => t.value === value) ?? ACTIVITY_TYPES[ACTIVITY_TYPES.length - 1];
}

export function getStatusInfo(value: string) {
  return STATUS_OPTIONS.find((s) => s.value === value) ?? STATUS_OPTIONS[0];
}
