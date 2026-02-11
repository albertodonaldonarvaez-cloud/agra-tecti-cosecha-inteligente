import { Loading } from "@/components/Loading";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  User,
  Key,
  Save,
  Palette,
  Phone,
  Mail,
  Calendar,
  Clock,
  Shield,
  FileText,
  Eye,
  Activity,
  BarChart3,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TIMEZONE = "America/Mexico_City";

const AVATAR_EMOJIS = [
  "🌿", "🌱", "🍃", "🌾", "🌻", "🌺", "🌵", "🍀",
  "🌽", "🍇", "🍊", "🍋", "🍎", "🥑", "🫐", "🍓",
  "👤", "👨‍🌾", "👩‍🌾", "🧑‍🌾", "🤠", "💪", "⭐", "🔥",
  "🐝", "🦋", "🐛", "🌈", "☀️", "🌙", "💧", "🏔️",
];

const AVATAR_COLORS = [
  "#16a34a", "#15803d", "#166534", "#059669",
  "#0d9488", "#0891b2", "#2563eb", "#4f46e5",
  "#7c3aed", "#9333ea", "#c026d3", "#db2777",
  "#e11d48", "#dc2626", "#ea580c", "#d97706",
  "#ca8a04", "#65a30d", "#475569", "#1e293b",
];

function formatDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "Nunca";
  return new Date(dateStr).toLocaleString("es-MX", {
    timeZone: TIMEZONE,
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function Profile() {
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarColor, setAvatarColor] = useState("#16a34a");
  const [avatarEmoji, setAvatarEmoji] = useState("🌿");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  const { data: profile, refetch } = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });

  const isAdmin = user?.role === "admin";

  const { data: myActivity } = trpc.profile.myActivity.useQuery(
    { limit: 20 },
    { enabled: !!user && isAdmin }
  );

  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Perfil actualizado correctamente");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const changePassword = trpc.profile.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Contraseña cambiada correctamente");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setBio(profile.bio || "");
      setPhone(profile.phone || "");
      setAvatarColor(profile.avatarColor || "#16a34a");
      setAvatarEmoji(profile.avatarEmoji || "🌿");
    }
  }, [profile]);

  useEffect(() => {
    if (!loading && !user) window.location.href = getLoginUrl();
  }, [user, loading]);

  if (loading || !user) return <Loading />;

  const handleSaveProfile = () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    updateProfile.mutate({ name, bio, phone, avatarColor, avatarEmoji });
  };

  const handleChangePassword = () => {
    if (!currentPassword) { toast.error("Ingresa tu contraseña actual"); return; }
    if (newPassword.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("Las contraseñas no coinciden"); return; }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 pb-24 pt-8">
      <div className="container max-w-3xl">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold text-green-900">Mi Perfil</h1>
          <p className="text-green-700">Personaliza tu cuenta y cambia tu contraseña</p>
        </div>

        {/* Avatar y datos principales */}
        <GlassCard className="mb-6 p-6">
          <div className="flex items-start gap-6">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-2xl text-5xl flex-shrink-0 shadow-lg"
              style={{ backgroundColor: avatarColor + "25", border: `3px solid ${avatarColor}` }}
            >
              {avatarEmoji}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-green-900">{profile?.name || "Usuario"}</h2>
              <p className="text-green-600 flex items-center gap-1 mt-1">
                <Mail className="h-4 w-4" />
                {profile?.email}
              </p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className={`text-xs px-3 py-1 rounded-full ${profile?.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                  {profile?.role === "admin" ? "Administrador" : "Usuario"}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Registrado: {formatDate(profile?.createdAt)}
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Último acceso: {formatDate(profile?.lastSignedIn)}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Personalización */}
        <GlassCard className="mb-6 p-6">
          <h2 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Personalización
          </h2>

          <div className="space-y-5">
            {/* Nombre */}
            <div>
              <Label htmlFor="profileName" className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Nombre
              </Label>
              <Input id="profileName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="mt-1" />
            </div>

            {/* Bio */}
            <div>
              <Label htmlFor="profileBio" className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Bio / Descripción
              </Label>
              <Input id="profileBio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ej: Encargado de cosecha zona norte" className="mt-1" maxLength={255} />
              <p className="text-xs text-gray-400 mt-1">{bio.length}/255 caracteres</p>
            </div>

            {/* Teléfono */}
            <div>
              <Label htmlFor="profilePhone" className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                Teléfono
              </Label>
              <Input id="profilePhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: +52 777 123 4567" className="mt-1" />
            </div>

            {/* Emoji del avatar */}
            <div>
              <Label className="mb-2 block">Emoji del Avatar</Label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setAvatarEmoji(emoji)}
                    className={`h-10 w-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                      avatarEmoji === emoji
                        ? "ring-2 ring-green-500 bg-green-100 scale-110"
                        : "bg-gray-100 hover:bg-gray-200"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Color del avatar */}
            <div>
              <Label className="mb-2 block">Color del Avatar</Label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setAvatarColor(color)}
                    className={`h-8 w-8 rounded-full transition-all ${
                      avatarColor === color ? "ring-2 ring-offset-2 ring-gray-600 scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-xl text-3xl"
                style={{ backgroundColor: avatarColor + "25", border: `2px solid ${avatarColor}` }}
              >
                {avatarEmoji}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{name || "Tu nombre"}</p>
                <p className="text-sm text-gray-500">{bio || "Sin descripción"}</p>
              </div>
            </div>

            <Button onClick={handleSaveProfile} disabled={updateProfile.isPending} className="w-full">
              <Save className="mr-2 h-4 w-4" />
              {updateProfile.isPending ? "Guardando..." : "Guardar Perfil"}
            </Button>
          </div>
        </GlassCard>

        {/* Cambiar contraseña */}
        <GlassCard className="mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-green-900 flex items-center gap-2">
              <Key className="h-5 w-5" />
              Seguridad
            </h2>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordSection(!showPasswordSection)}>
              {showPasswordSection ? "Cancelar" : "Cambiar Contraseña"}
            </Button>
          </div>

          {showPasswordSection && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="currentPwd">Contraseña actual</Label>
                <Input id="currentPwd" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Tu contraseña actual" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="newPwd2">Nueva contraseña</Label>
                <Input id="newPwd2" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="confirmPwd2">Confirmar nueva contraseña</Label>
                <Input id="confirmPwd2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite la nueva contraseña" className="mt-1" />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-600">Las contraseñas no coinciden</p>
              )}
              <Button
                onClick={handleChangePassword}
                disabled={changePassword.isPending || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                className="w-full"
                variant="outline"
              >
                <Key className="mr-2 h-4 w-4" />
                {changePassword.isPending ? "Cambiando..." : "Cambiar Contraseña"}
              </Button>
            </div>
          )}
        </GlassCard>

        {/* Mi actividad reciente - solo visible para admin */}
        {isAdmin && (
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold text-green-900 mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Mi Actividad Reciente
            </h2>
            {myActivity && myActivity.length > 0 ? (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {myActivity.map((log: any, i: number) => (
                  <div key={log.id || i} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 text-sm">
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                      log.action === "login" ? "text-green-700 bg-green-100" :
                      log.action === "logout" ? "text-red-700 bg-red-100" :
                      log.action === "page_view" ? "text-blue-700 bg-blue-100" :
                      "text-gray-700 bg-gray-100"
                    }`}>
                      {log.action === "login" ? "Inicio" :
                       log.action === "logout" ? "Cierre" :
                       log.action === "page_view" ? "Visita" : "Salida"}
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
              <p className="text-center text-gray-500 py-4">No hay actividad registrada aún</p>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
