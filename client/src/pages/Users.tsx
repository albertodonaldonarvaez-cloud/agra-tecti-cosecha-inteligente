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
import { Users as UsersIcon, Shield, User, UserPlus, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Users() {
  const { user, loading } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  
  const [permissions, setPermissions] = useState({
    canViewDashboard: true,
    canViewBoxes: true,
    canViewAnalytics: true,
    canViewDailyAnalysis: true,
    canViewParcels: false,
    canViewHarvesters: false,
    canViewErrors: false,
  });
  
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
    setPermissions({
      canViewDashboard: u.canViewDashboard ?? true,
      canViewBoxes: u.canViewBoxes ?? true,
      canViewAnalytics: u.canViewAnalytics ?? true,
      canViewDailyAnalysis: u.canViewDailyAnalysis ?? true,
      canViewParcels: u.canViewParcels ?? false,
      canViewHarvesters: u.canViewHarvesters ?? false,
      canViewErrors: u.canViewErrors ?? false,
    });
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

        {/* Dialog para gestionar permisos */}
        <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Permisos de {selectedUser?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Selecciona qué páginas puede ver este usuario
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dashboard"
                    checked={permissions.canViewDashboard}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewDashboard: !!checked })
                    }
                  />
                  <label htmlFor="dashboard" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Dashboard (Inicio)
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="boxes"
                    checked={permissions.canViewBoxes}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewBoxes: !!checked })
                    }
                  />
                  <label htmlFor="boxes" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Cajas Registradas
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="analytics"
                    checked={permissions.canViewAnalytics}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewAnalytics: !!checked })
                    }
                  />
                  <label htmlFor="analytics" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Análisis de Datos
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="daily"
                    checked={permissions.canViewDailyAnalysis}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewDailyAnalysis: !!checked })
                    }
                  />
                  <label htmlFor="daily" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Análisis Diario
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="parcels"
                    checked={permissions.canViewParcels}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewParcels: !!checked })
                    }
                  />
                  <label htmlFor="parcels" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Parcelas
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="harvesters"
                    checked={permissions.canViewHarvesters}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewHarvesters: !!checked })
                    }
                  />
                  <label htmlFor="harvesters" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Cortadoras
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="errors"
                    checked={permissions.canViewErrors}
                    onCheckedChange={(checked) => 
                      setPermissions({ ...permissions, canViewErrors: !!checked })
                    }
                  />
                  <label htmlFor="errors" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Errores de Validación
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
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
