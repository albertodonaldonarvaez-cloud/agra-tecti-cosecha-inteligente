/**
 * El texto que redacta la IA, con su estructura: títulos, párrafos, viñetas y
 * negritas.
 *
 * Antes cada pantalla lo pintaba con `whitespace-pre-line` y se veían los
 * "###" y los "**" tal cual, o se borraban a lo bruto y el análisis quedaba en
 * un solo bloque. El reparto en bloques lo hace shared/textoIA.ts, el mismo que
 * usa el reporte impreso, para que se vea igual en todos lados.
 *
 * El color y el tamaño los hereda del contenedor: así sirve igual en la
 * tarjeta morada de la parcela que en la verde del reporte.
 */
import { useMemo } from "react";
import { bloquesDeTextoIA, type Fragmento } from "@shared/textoIA";

function Linea({ fragmentos }: { fragmentos: Fragmento[] }) {
  return (
    <>
      {fragmentos.map((f, i) =>
        f.negrita ? (
          <strong key={i} className="font-semibold">{f.texto}</strong>
        ) : (
          <span key={i}>{f.texto}</span>
        )
      )}
    </>
  );
}

export function TextoIA({ texto, className = "" }: { texto: string | null | undefined; className?: string }) {
  const bloques = useMemo(() => bloquesDeTextoIA(texto ?? ""), [texto]);
  if (bloques.length === 0) return null;

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {bloques.map((b, i) => {
        if (b.tipo === "titulo") {
          return (
            <h4 key={i} className="pt-1 text-[0.95em] font-bold first:pt-0">
              <Linea fragmentos={b.fragmentos} />
            </h4>
          );
        }
        if (b.tipo === "parrafo") {
          return (
            <p key={i}>
              {b.lineas.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  <Linea fragmentos={l} />
                </span>
              ))}
            </p>
          );
        }
        const Lista = b.numerada ? "ol" : "ul";
        return (
          <Lista key={i} className={`space-y-1 pl-5 ${b.numerada ? "list-decimal" : "list-disc"}`}>
            {b.items.map((item, j) => (
              <li key={j} className="pl-0.5">
                <Linea fragmentos={item} />
              </li>
            ))}
          </Lista>
        );
      })}
    </div>
  );
}
