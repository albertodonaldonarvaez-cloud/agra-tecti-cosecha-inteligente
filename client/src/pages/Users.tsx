import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  Users as UsersIcon,
  Shield,
  User,
  UserPlus,
  Settings,
  Info,
  Trash2,
  Key,
  Activity,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { getPermissionPages, getDefaultPermissions } from "@/config/pages";

const TIMEZONE = "America/Mexico_City";

function formatDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "Nunca";
  const date = new Date(dateStr);
  return date.toLocaleString("es-MX", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function getActionLabel(action: string) {
  switch (action) {
    case "login": return "Inicio de sesión";
    case "logout": return "Cierre de sesión";
    case "page_view": return "Visitó página";
    case "page_leave": return "Salió de página";
    default: return action;
  }
}

function getActionColor(action: string) {
  switch (action) {
    case "login": return "text-green-700 bg-green-100";
    case "logout": return "text-red-700 bg-red-100";
    case "page_view": return "text-blue-700 bg-blue-100";
    case "page_leave": return "text-gray-700 bg-gray-100";
    default: return "text-gray-700 bg-gray-100";
  }
}

export default function Users() {
  const { user, loading } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "activity">("users");

  const permissionPages = useMemo(() => getPermissionPages(), []);
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => getDefaultPermissions());

  const { data: usersList, refetch } = trpc.usersAdmin.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const { data: activitySummary, refetch: refetchSummary } = trpc.usersAdmin.activitySummary.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const { data: userLogs } = trpc.usersAdmin.activityLogs.useQuery(
    { userId: selectedUser?.id, limit: 100 },
    { enabled: !!selectedUser && showLogsDialog }
  );

  const { data: userTopPages } = trpc.usersAdmin.userTopPages.useQuery(
    { userId: selectedUser?.id },
    { enabled: !!selectedUser && showLogsDialog }
  );

  const { data: allLogs } = trpc.usersAdmin.activityLogs.useQuery(
    { limit: 200 },
    { enabled: activeTab === "activity" && !!user && user.role === "admin" }
  );

  const updateRole = trpc.usersAdmin.updateRole.useMutation({
    onSuccess: () => { toast.success("Rol actualizado"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updatePermissions = trpc.usersAdmin.updatePermissions.useMutation({
    onSuccess: () => { toast.success("Permisos actualizados"); setShowPermissionsDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createUser = trpc.usersAdmin.create.useMutation({
    onSuccess: () => {
      toast.success("Usuario creado");
      setShowAddDialog(false);
      setNewUserName(""); setNewUserEmail(""); setNewUserPassword(""); setNewUserRole("user");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteUserMut = trpc.usersAdmin.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuario eliminado");
      setShowDeleteDialog(false); setSelectedUser(null);
      refetch(); refetchSummary();
    },
    onError: (e) => toast.error(e.message),
  });

  const changePasswordMut = trpc.usersAdmin.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Contraseña cambiada");
      setShowPasswordDialog(false); setNewPassword(""); setConfirmPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!loading && !user) window.location.href = getLoginUrl();
  }, [user, loading]);

  if (loading || !user) return <Loading />;

  if (user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <GlassCard className="p-6 md:p-8 text-center">
          <h2 className="mb-2 text-xl md:text-2xl font-bold text-green-900">Acceso Denegado</h2>
          <p className="text-green-600">Solo los administradores pueden acceder a esta página</p>
        </GlassCard>
      </div>
    );
  }

  const handleCreateUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error("Completa todos los campos"); return;
    }
    if (newUserPassword.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    createUser.mutate({ name: newUserName, email: newUserEmail, password: newUserPassword, role: newUserRole });
  };

  const handleDeleteUser = () => {
    if (!selectedUser) return;
    deleteUserMut.mutate({ userId: selectedUser.id });
  };

  const handleChangePassword = () => {
    if (!selectedUser) return;
    if (newPassword.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("Las contraseñas no coinciden"); return; }
    changePasswordMut.mutate({ userId: selectedUser.id, newPassword });
  };

  const handleOpenPermissions = (u: any) => {
    setSelectedUser(u);
    const cur: Record<string, boolean> = {};
    permissionPages.forEach(p => { cur[p.permissionKey] = u[p.permissionKey] ?? p.defaultValue; });
    setPermissions(cur);
    setShowPermissionsDialog(true);
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;
    updatePermissions.mutate({ userId: selectedUser.id, permissions });
  };

  const activePermissionsCount = Object.values(permissions).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-5xl px-3 md:px-6">
        <div className="mb-6 md:mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-1 md:mb-2 text-2xl md:text-4xl font-bold text-green-900">Gestión de Usuarios</h1>
            <p className="text-xs md:text-base text-green-700">Administra usuarios, roles y permisos</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm" size="sm">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Agregar Usuario</span>
            <span className="sm:hidden">Agregar</span>
          </Button>
        </div>

        {/* Tabs */}
        <div className="mb-4 md:mb-6 flex gap-2">
          <Button variant={activeTab === "users" ? "default" : "outline"} onClick={() => setActiveTab("users")} className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm" size="sm">
            <UsersIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
            Usuarios ({usersList?.length || 0})
          </Button>
          <Button variant={activeTab === "activity" ? "default" : "outline"} onClick={() => setActiveTab("activity")} className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm" size="sm">
            <Activity className="h-4 w-4" />
            Actividad Global
          </Button>
        </div>

        {/* ==================== TAB: USUARIOS ==================== */}
        {activeTab === "users" && (
          <>
            <GlassCard className="mb-6 p-4 bg-blue-50/50 border-blue-200">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-blue-800 font-medium">Sistema de Permisos Dinámico</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Actualmente hay <strong>{permissionPages.length} páginas</strong> con permisos configurables.
                  </p>
                </div>
              </div>
            </GlassCard>

            {usersList && usersList.length > 0 ? (
              <div className="space-y-4">
                {usersList.map((u) => {
                  const summary = activitySummary?.find((s: any) => s.id === u.id);
                  const isExpanded = expandedUser === u.id;
                  const isCurrentUser = user?.id === u.id;

                  return (
                    <GlassCard key={u.id} className="overflow-hidden">
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-full text-xl flex-shrink-0"
                              style={{ backgroundColor: ((u as any).avatarColor || "#16a34a") + "20" }}
                            >
                              {(u as any).avatarEmoji || (u.role === "admin" ? "🛡️" : "👤")}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold text-green-900 truncate">{u.name || "Sin nombre"}</h3>
                                {isCurrentUser && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Tú</span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                                  {u.role === "admin" ? "Admin" : "Usuario"}
                                </span>
                              </div>
                              <p className="text-sm text-green-600 truncate">{u.email}</p>
                              <div className="flex items-center gap-4 mt-1 flex-wrap">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Último acceso: {formatDate(u.lastSignedIn)}
                                </span>
                                {summary && (
                                  <>
                                    <span className="text-xs text-blue-500 flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      {summary.totalPageViews || 0} páginas
                                    </span>
                                    <span className="text-xs text-purple-500 flex items-center gap-1">
                                      <Activity className="h-3 w-3" />
                                      {formatDuration(Number(summary.totalDurationSeconds) || 0)} total
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                              className="text-gray-500"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        {/* Acciones expandidas */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {/* Cambiar rol */}
                              <div className="space-y-1">
                                <Label className="text-xs text-gray-500">Rol</Label>
                                <Select
                                  value={u.role}
                                  onValueChange={(v) => updateRole.mutate({ userId: u.id, role: v as "user" | "admin" })}
                                  disabled={updateRole.isPending || isCurrentUser}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="user">Usuario</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Permisos */}
                              {u.role === "user" && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-gray-500">Permisos</Label>
                                  <Button onClick={() => handleOpenPermissions(u)} variant="outline" size="sm" className="w-full h-9 flex items-center gap-1">
                                    <Settings className="h-3.5 w-3.5" />
                                    Configurar
                                  </Button>
                                </div>
                              )}

                              {/* Cambiar contraseña */}
                              <div className="space-y-1">
                                <Label className="text-xs text-gray-500">Contraseña</Label>
                                <Button
                                  onClick={() => { setSelectedUser(u); setNewPassword(""); setConfirmPassword(""); setShowPasswordDialog(true); }}
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-9 flex items-center gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                                >
                                  <Key className="h-3.5 w-3.5" />
                                  Cambiar
                                </Button>
                              </div>

                              {/* Ver actividad */}
                              <div className="space-y-1">
                                <Label className="text-xs text-gray-500">Actividad</Label>
                                <Button
                                  onClick={() => { setSelectedUser(u); setShowLogsDialog(true); }}
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-9 flex items-center gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                                >
                                  <BarChart3 className="h-3.5 w-3.5" />
                                  Ver Logs
                                </Button>
                              </div>

                              {/* Eliminar */}
                              {!isCurrentUser && (
                                <div className="space-y-1 col-span-2 sm:col-span-4">
                                  <Button
                                    onClick={() => { setSelectedUser(u); setShowDeleteDialog(true); }}
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-9 flex items-center gap-1 border-red-300 text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Eliminar Usuario
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            ) : (
              <GlassCard className="p-12 text-center">
                <UsersIcon className="mx-auto mb-4 h-16 w-16 text-green-300" />
                <h3 className="mb-2 text-xl font-semibold text-green-900">No hay usuarios</h3>
                <p className="text-green-600">Los usuarios aparecerán aquí cuando se registren</p>
              </GlassCard>
            )}
          </>
        )}

        {/* ==================== TAB: ACTIVIDAD GLOBAL ==================== */}
        {activeTab === "activity" && (
          <>
            {/* Resumen por usuario */}
            {activitySummary && activitySummary.length > 0 && (
              <GlassCard className="mb-6 p-6">
                <h2 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Resumen de Actividad por Usuario
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-gray-600 font-medium">Usuario</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Inicios</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Páginas</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Tiempo Total</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Última Actividad</th>
                        <th className="text-center py-2 px-3 text-gray-600 font-medium">Última Página</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitySummary.map((s: any) => (
                        <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{s.avatarEmoji || "👤"}</span>
                              <div>
                                <p className="font-medium text-gray-800">{s.name}</p>
                                <p className="text-xs text-gray-500">{s.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-center py-2 px-3 text-green-700 font-medium">{s.totalLogins || 0}</td>
                          <td className="text-center py-2 px-3 text-blue-700 font-medium">{s.totalPageViews || 0}</td>
                          <td className="text-center py-2 px-3 text-purple-700 font-medium">{formatDuration(Number(s.totalDurationSeconds) || 0)}</td>
                          <td className="text-center py-2 px-3 text-gray-600 text-xs">{formatDate(s.lastActivity)}</td>
                          <td className="text-center py-2 px-3 text-gray-600 text-xs">{s.lastPage || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}

            {/* Timeline de actividad global */}
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Timeline de Actividad Reciente
              </h2>
              {allLogs && allLogs.length > 0 ? (
                <div className="max-h-[600px] overflow-y-auto space-y-2">
                  {allLogs.map((log: any, i: number) => (
                    <div key={log.id || i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50">
                      <span className="text-lg flex-shrink-0">{log.avatarEmoji || "👤"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-800">{log.userName || "Usuario"}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getActionColor(log.action)}`}>
                            {getActionLabel(log.action)}
                          </span>
                          {log.pageName && (
                            <span className="text-xs text-gray-500">{log.pageName}</span>
                          )}
                          {log.durationSeconds > 0 && (
                            <span className="text-xs text-purple-600">({formatDuration(log.durationSeconds)})</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">No hay actividad registrada aún</p>
              )}
            </GlassCard>
          </>
        )}

        {/* ==================== DIÁLOGOS ==================== */}

        {/* Dialog: Agregar usuario */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Nuevo Usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="userName">Nombre</Label>
                <Input id="userName" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Nombre del usuario" />
              </div>
              <div>
                <Label htmlFor="userEmail">Email</Label>
                <Input id="userEmail" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="email@ejemplo.com" />
              </div>
              <div>
                <Label htmlFor="userPassword">Contraseña</Label>
                <Input id="userPassword" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <Label htmlFor="userRole">Rol</Label>
                <Select value={newUserRole} onValueChange={(v: any) => setNewUserRole(v)}>
                  <SelectTrigger id="userRole"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
                <Button onClick={handleCreateUser} disabled={createUser.isPending}>Crear Usuario</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Permisos */}
        <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Permisos de {selectedUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">Selecciona qué páginas puede ver</p>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  {activePermissionsCount}/{permissionPages.length} activos
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  const all: Record<string, boolean> = {};
                  permissionPages.forEach(p => { all[p.permissionKey] = true; });
                  setPermissions(all);
                }}>Seleccionar todo</Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const none: Record<string, boolean> = {};
                  permissionPages.forEach(p => { none[p.permissionKey] = false; });
                  setPermissions(none);
                }}>Deseleccionar todo</Button>
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {permissionPages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <div key={page.permissionKey} className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                      <Checkbox
                        id={page.permissionKey}
                        checked={permissions[page.permissionKey] ?? page.defaultValue}
                        onCheckedChange={(checked) => setPermissions(prev => ({ ...prev, [page.permissionKey]: !!checked }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <label htmlFor={page.permissionKey} className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                          <Icon className="h-4 w-4 text-green-600" />
                          {page.fullName}
                        </label>
                        <p className="text-xs text-gray-500 mt-1">{page.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>Cancelar</Button>
                <Button onClick={handleSavePermissions} disabled={updatePermissions.isPending}>Guardar Permisos</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Eliminar usuario */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                Eliminar Usuario
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">
                  ¿Estás seguro de que deseas eliminar al usuario <strong>{selectedUser?.name}</strong> ({selectedUser?.email})?
                </p>
                <p className="text-xs text-red-600 mt-2">
                  Esta acción es irreversible. Se eliminarán todos los datos del usuario incluyendo su historial de actividad.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={handleDeleteUser} disabled={deleteUserMut.isPending}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleteUserMut.isPending ? "Eliminando..." : "Eliminar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Cambiar contraseña */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-amber-600" />
                Cambiar Contraseña
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Cambiar contraseña de <strong>{selectedUser?.name}</strong>
              </p>
              <div>
                <Label htmlFor="newPwd">Nueva contraseña</Label>
                <Input id="newPwd" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <Label htmlFor="confirmPwd">Confirmar contraseña</Label>
                <Input id="confirmPwd" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite la contraseña" />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600">Las contraseñas no coinciden</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancelar</Button>
                <Button onClick={handleChangePassword} disabled={changePasswordMut.isPending || newPassword !== confirmPassword || newPassword.length < 6}>
                  {changePasswordMut.isPending ? "Cambiando..." : "Cambiar Contraseña"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Logs de actividad de un usuario */}
        <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Actividad de {selectedUser?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Páginas más visitadas */}
              {userTopPages && userTopPages.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Páginas Más Visitadas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {userTopPages.map((p: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800">{p.pageName || p.page}</span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{p.visits} visitas</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-purple-600">Tiempo total: {formatDuration(Number(p.totalDuration) || 0)}</span>
                          <span className="text-xs text-gray-500">Promedio: {formatDuration(Math.round(Number(p.avgDuration) || 0))}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Última visita: {formatDate(p.lastVisit)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline de actividad */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Historial de Actividad
                </h3>
                {userLogs && userLogs.length > 0 ? (
                  <div className="max-h-[400px] overflow-y-auto space-y-1">
                    {userLogs.map((log: any, i: number) => (
                      <div key={log.id || i} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 text-sm">
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                        <span className="text-gray-700 truncate flex-1">{log.pageName || log.page || "-"}</span>
                        {log.durationSeconds > 0 && (
                          <span className="text-xs text-purple-600 whitespace-nowrap">{formatDuration(log.durationSeconds)}</span>
                        )}
                        <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(log.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-4">No hay actividad registrada</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
