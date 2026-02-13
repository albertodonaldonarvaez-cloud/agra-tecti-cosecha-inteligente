/**
 * Configuración centralizada de páginas y permisos
 * 
 * Este archivo es la ÚNICA FUENTE DE VERDAD para las páginas de la aplicación.
 * Cuando agregues o quites una página, solo modifica este archivo y los permisos
 * se actualizarán automáticamente en:
 * - Navegación (FloatingNav)
 * - Gestión de usuarios (Users.tsx)
 * - Validaciones del servidor
 */

import { 
  BarChart3, 
  Box, 
  Settings, 
  Users, 
  Scissors, 
  TrendingUp, 
  Calendar, 
  MapPin, 
  AlertCircle, 
  Target, 
  Edit, 
  CloudSun,
  Leaf,
  Sprout,
  type LucideIcon
} from "lucide-react";

export interface PageConfig {
  /** Identificador único del permiso (debe coincidir con el campo en la BD) */
  permissionKey: string;
  /** Ruta de la página */
  path: string;
  /** Icono de Lucide */
  icon: LucideIcon;
  /** Nombre corto para la navegación */
  label: string;
  /** Nombre completo para el panel de permisos */
  fullName: string;
  /** Descripción del permiso */
  description: string;
  /** Si es true, solo admins pueden ver esta página */
  adminOnly: boolean;
  /** Valor por defecto del permiso para nuevos usuarios */
  defaultValue: boolean;
  /** Orden de aparición en la navegación */
  order: number;
  /** Si es true, esta página aparece en la navegación */
  showInNav: boolean;
}

/**
 * Lista de todas las páginas de la aplicación
 * IMPORTANTE: El permissionKey debe coincidir con el nombre del campo en la tabla users
 */
export const PAGES_CONFIG: PageConfig[] = [
  {
    permissionKey: "canViewDashboard",
    path: "/",
    icon: BarChart3,
    label: "Dashboard",
    fullName: "Dashboard (Inicio)",
    description: "Página principal con resumen de datos",
    adminOnly: false,
    defaultValue: true,
    order: 1,
    showInNav: true,
  },
  {
    permissionKey: "canViewBoxes",
    path: "/boxes",
    icon: Box,
    label: "Cajas",
    fullName: "Cajas Registradas",
    description: "Lista de todas las cajas cosechadas",
    adminOnly: false,
    defaultValue: true,
    order: 2,
    showInNav: true,
  },
  {
    permissionKey: "canViewAnalytics",
    path: "/analytics",
    icon: TrendingUp,
    label: "Análisis",
    fullName: "Análisis de Datos",
    description: "Gráficas y estadísticas de producción",
    adminOnly: false,
    defaultValue: true,
    order: 3,
    showInNav: true,
  },
  {
    permissionKey: "canViewDailyAnalysis",
    path: "/daily",
    icon: Calendar,
    label: "Diario",
    fullName: "Análisis Diario",
    description: "Resumen de producción por día",
    adminOnly: false,
    defaultValue: true,
    order: 4,
    showInNav: true,
  },
  {
    permissionKey: "canViewClimate",
    path: "/climate",
    icon: CloudSun,
    label: "Clima",
    fullName: "Análisis Climático",
    description: "Correlación clima-cosecha y pronósticos",
    adminOnly: false,
    defaultValue: true,
    order: 5,
    showInNav: true,
  },
  {
    permissionKey: "canViewPerformance",
    path: "/performance",
    icon: Target,
    label: "Rendimiento",
    fullName: "Rendimiento de Cortadoras",
    description: "Métricas de productividad por cortadora",
    adminOnly: false,
    defaultValue: true,
    order: 6,
    showInNav: true,
  },
  {
    permissionKey: "canViewParcelAnalysis",
    path: "/parcel-analysis",
    icon: Leaf,
    label: "Parcela",
    fullName: "Análisis de Parcela",
    description: "Vuelos, ortomosaicos y rendimiento por parcela",
    adminOnly: false,
    defaultValue: true,
    order: 7,
    showInNav: true,
  },
  {
    permissionKey: "canViewHarvesters",
    path: "/harvesters",
    icon: Scissors,
    label: "Cortadoras",
    fullName: "Gestión de Cortadoras",
    description: "Administrar cortadoras y sus nombres",
    adminOnly: true,
    defaultValue: false,
    order: 8,
    showInNav: true,
  },
  {
    permissionKey: "canViewParcels",
    path: "/parcels",
    icon: MapPin,
    label: "Parcelas",
    fullName: "Gestión de Parcelas",
    description: "Administrar parcelas y polígonos",
    adminOnly: true,
    defaultValue: false,
    order: 9,
    showInNav: true,
  },
  {
    permissionKey: "canViewEditor",
    path: "/editor",
    icon: Edit,
    label: "Editor",
    fullName: "Editor de Cajas",
    description: "Editar y corregir datos de cajas",
    adminOnly: true,
    defaultValue: false,
    order: 10,
    showInNav: true,
  },
  {
    permissionKey: "canViewCrops",
    path: "/crops",
    icon: Sprout,
    label: "Cultivos",
    fullName: "Cultivos y Variedades",
    description: "Gestionar cultivos y sus variedades",
    adminOnly: true,
    defaultValue: false,
    order: 11,
    showInNav: true,
  },
  {
    permissionKey: "canViewErrors",
    path: "/errors",
    icon: AlertCircle,
    label: "Errores",
    fullName: "Errores de Validación",
    description: "Ver y resolver errores de sincronización",
    adminOnly: true,
    defaultValue: false,
    order: 12,
    showInNav: false, // No mostrar en nav por ahora
  },
];

// Páginas de administración (no requieren permisos, solo ser admin)
export const ADMIN_ONLY_PAGES = [
  {
    path: "/users",
    icon: Users,
    label: "Usuarios",
    fullName: "Gestión de Usuarios",
    order: 98,
    showInNav: true,
  },
  {
    path: "/settings",
    icon: Settings,
    label: "Configuración",
    fullName: "Configuración del Sistema",
    order: 99,
    showInNav: true,
  },
];

/**
 * Obtener páginas para la navegación
 */
export function getNavPages() {
  return PAGES_CONFIG
    .filter(p => p.showInNav)
    .sort((a, b) => a.order - b.order);
}

/**
 * Obtener páginas que requieren permisos (no adminOnly)
 * Estas son las que aparecen en el panel de permisos de usuario
 */
export function getPermissionPages() {
  return PAGES_CONFIG
    .filter(p => !p.adminOnly)
    .sort((a, b) => a.order - b.order);
}

/**
 * Obtener todas las claves de permisos
 */
export function getAllPermissionKeys(): string[] {
  return PAGES_CONFIG.map(p => p.permissionKey);
}

/**
 * Obtener permisos por defecto para nuevos usuarios
 */
export function getDefaultPermissions(): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  PAGES_CONFIG.forEach(p => {
    defaults[p.permissionKey] = p.defaultValue;
  });
  return defaults;
}

/**
 * Verificar si un usuario tiene permiso para una página
 */
export function hasPermission(user: any, permissionKey: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user[permissionKey] === true;
}

/**
 * Verificar si un usuario puede ver una ruta específica
 */
export function canAccessPath(user: any, path: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  
  const page = PAGES_CONFIG.find(p => p.path === path);
  if (!page) return true; // Rutas no configuradas son accesibles
  if (page.adminOnly) return false;
  
  return user[page.permissionKey] === true;
}
