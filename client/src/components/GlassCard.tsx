import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function GlassCard({ children, className, onClick, hover = true }: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-green-200/30 bg-white/40 backdrop-blur-xl shadow-xl transition-all duration-300",
        hover && "hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Efecto de brillo liquid glass */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent opacity-50" />
      
      {/* Contenido */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
