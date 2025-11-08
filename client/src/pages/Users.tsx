import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Users as UsersIcon, Shield, User } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

export default function Users() {
  const { user, loading } = useAuth();
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

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = getLoginUrl();
    }
  }, [user, loading]);

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

  const handleRoleChange = (userId: number, newRole: "user" | "admin") => {
    updateRole.mutate({ userId, role: newRole });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-4xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-green-900">Gestión de Usuarios</h1>
          <p className="text-green-700">Administra los roles y permisos de los usuarios</p>
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
      </div>
    </div>
  );
}
