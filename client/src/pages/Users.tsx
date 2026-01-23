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
import { Users as UsersIcon, Shield, User, UserPlus, Settings, Info } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { getPermissionPages, getDefaultPermissions, type PageConfig } from "@/config/pages";

export default function Users() {
  const { user, loading } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  
  // Obtener páginas con permisos desde la configuración centralizada
  const permissionPages = useMemo(() => getPermissionPages(), []);
  
  // Estado dinámico de permisos basado en la configuración
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => getDefaultPermissions());
  
  const { data: users, refetch } = trpc.usersAdmin.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const updateRole = trpc.usersAdmin.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Rol actualizado correctamente");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updatePermissions = trpc.usersAdmin.updatePermissions.useMutation({
    onSuccess: () => {
      toast.success("Permisos actualizados correctamente");
      setShowPermissionsDialog(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const createUser = trpc.usersAdmin.create.useMutation({
    onSuccess: () => {
      toast.success("Usuario creado correctamente");
      setShowAddDialog(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("user");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

  if (loading || !user) {
    return <Loading />;
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

  const handleRoleChange = (userId: number, newRole: "user" | "admin") => {
    updateRole.mutate({ userId, role: newRole });
  };

  const handleOpenPermissions = (u: any) => {
    setSelectedUser(u);
    // Cargar permisos actuales del usuario
    const currentPermissions: Record<string, boolean> = {};
    permissionPages.forEach(page => {
      currentPermissions[page.permissionKey] = u[page.permissionKey] ?? page.defaultValue;
    });
    setPermissions(currentPermissions);
    setShowPermissionsDialog(true);
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;
    updatePermissions.mutate({
      userId: selectedUser.id,
      permissions,
    });
  };

  const handleCreateUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error("Por favor completa todos los campos");
      return;
    }
    if (newUserPassword.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    createUser.mutate({
      name: newUserName,
      email: newUserEmail,
      password: newUserPassword,
      role: newUserRole,
    });
  };

  const handlePermissionChange = (permissionKey: string, checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [permissionKey]: checked
    }));
  };

  const handleSelectAll = () => {
    const allSelected: Record<string, boolean> = {};
    permissionPages.forEach(page => {
      allSelected[page.permissionKey] = true;
    });
    setPermissions(allSelected);
  };

  const handleDeselectAll = () => {
    const allDeselected: Record<string, boolean> = {};
    permissionPages.forEach(page => {
      allDeselected[page.permissionKey] = false;
    });
    setPermissions(allDeselected);
  };

  // Contar permisos activos
  const activePermissionsCount = Object.values(permissions).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold text-green-900">Gestión de Usuarios</h1>
            <p className="text-green-700">Administra los roles y permisos de los usuarios</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Agregar Usuario
          </Button>
        </div>

        {/* Info sobre permisos dinámicos */}
        <GlassCard className="mb-6 p-4 bg-blue-50/50 border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-blue-800 font-medium">Sistema de Permisos Dinámico</p>
              <p className="text-xs text-blue-600 mt-1">
                Los permisos se actualizan automáticamente cuando se agregan nuevas páginas al sistema. 
                Actualmente hay <strong>{permissionPages.length} páginas</strong> con permisos configurables.
              </p>
            </div>
          </div>
        </GlassCard>

        {users && users.length > 0 ? (
          <div className="space-y-4">
            {users.map((u) => (
              <GlassCard key={u.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                      {u.role === "admin" ? (
                        <Shield className="h-6 w-6 text-green-600" />
                      ) : (
                        <User className="h-6 w-6 text-green-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-green-900">{u.name || "Usuario sin nombre"}</h3>
                      <p className="text-sm text-green-600">{u.email || "Sin email"}</p>
                      <p className="text-xs text-green-500">
                        Último acceso: {new Date(u.lastSignedIn).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Select
                      value={u.role}
                      onValueChange={(value) => handleRoleChange(u.id, value as "user" | "admin")}
                      disabled={updateRole.isPending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Usuario</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {u.role === "user" && (
                      <Button
                        onClick={() => handleOpenPermissions(u)}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Permisos
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-12 text-center">
            <UsersIcon className="mx-auto mb-4 h-16 w-16 text-green-300" />
            <h3 className="mb-2 text-xl font-semibold text-green-900">No hay usuarios registrados</h3>
            <p className="text-green-600">Los usuarios aparecerán aquí cuando inicien sesión</p>
          </GlassCard>
        )}

        {/* Dialog para agregar usuario */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Nuevo Usuario</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="userName">Nombre</Label>
                <Input
                  id="userName"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nombre del usuario"
                />
              </div>
              <div>
                <Label htmlFor="userEmail">Email</Label>
                <Input
                  id="userEmail"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                />
              </div>
              <div>
                <Label htmlFor="userPassword">Contraseña</Label>
                <Input
                  id="userPassword"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <Label htmlFor="userRole">Rol</Label>
                <Select value={newUserRole} onValueChange={(value: any) => setNewUserRole(value)}>
                  <SelectTrigger id="userRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateUser} disabled={createUser.isPending}>
                  Crear Usuario
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog para gestionar permisos - Ahora dinámico */}
        <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Permisos de {selectedUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Selecciona qué páginas puede ver este usuario
                </p>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                  {activePermissionsCount}/{permissionPages.length} activos
                </span>
              </div>
              
              {/* Botones de selección rápida */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>
                  Seleccionar todo
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                  Deseleccionar todo
                </Button>
              </div>
              
              {/* Lista de permisos generada dinámicamente */}
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {permissionPages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <div 
                      key={page.permissionKey} 
                      className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Checkbox
                        id={page.permissionKey}
                        checked={permissions[page.permissionKey] ?? page.defaultValue}
                        onCheckedChange={(checked) => 
                          handlePermissionChange(page.permissionKey, !!checked)
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <label 
                          htmlFor={page.permissionKey} 
                          className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                        >
                          <Icon className="h-4 w-4 text-green-600" />
                          {page.fullName}
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          {page.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSavePermissions} disabled={updatePermissions.isPending}>
                  Guardar Permisos
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
