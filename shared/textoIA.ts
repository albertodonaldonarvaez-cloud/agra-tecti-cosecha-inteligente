/**
 * El texto que redacta la IA, listo para mostrarse.
 *
 * DeepSeek responde con Markdown a medias: a veces títulos con "###", a veces
 * una línea en negritas que hace de título, viñetas con "*", "•" o "-",
 * números, espacios dobles al final de la línea para forzar el salto… y la
 * pantalla lo pintaba tal cual, con los asteriscos y los gatos a la vista. En
 * el reporte se borraban con una expresión regular y el texto quedaba en un
 * solo bloque sin estructura.
 *
 * Aquí se hace las dos cosas con el mismo criterio:
 *   · `limpiarTextoIA` deja el texto en un Markdown mínimo y predecible
 *     (títulos "### ", viñetas "- ", listas "1. ", **negritas**);
 *   · `bloquesDeTextoIA` lo parte en títulos, párrafos y listas, que es lo que
 *     dibuja la pantalla, el reporte impreso y el mensaje de Telegram.
 *
 * Vive en shared/ porque lo usan el navegador (pantallas y reportes que se
 * imprimen ahí) y el servidor (correo, Telegram, documentos). Si cada lado
 * tuviera su versión, el mismo análisis se vería distinto en cada salida.
 */

export interface Fragmento {
  texto: string;
  negrita?: boolean;
}

export type BloqueIA =
  | { tipo: "titulo"; fragmentos: Fragmento[] }
  | { tipo: "parrafo"; lineas: Fragmento[][] }
  | { tipo: "lista"; numerada: boolean; items: Fragmento[][] };

/** Frases de cortesía con las que a veces arranca la respuesta */
const PREAMBULO = /^(claro|por supuesto|desde luego|con gusto|aquí (tienes|está|va)|a continuación|este es|éste es)\b/i;

/**
 * Una línea corta que termina en dos puntos y no trae nada más ("Acciones:",
 * "Diagnóstico:") la usa el modelo como título. Se limita a pocas palabras
 * para no convertir en título una frase que presenta una lista.
 */
function esTituloImplicito(linea: string): boolean {
  if (!linea.endsWith(":")) return false;
  const sinDosPuntos = linea.slice(0, -1).trim();
  if (!sinDosPuntos || sinDosPuntos.length > 48) return false;
  if (/[.;!?]/.test(sinDosPuntos)) return false;
  return sinDosPuntos.split(/\s+/).length <= 5;
}

/**
 * Normaliza lo que mande la IA a un Markdown mínimo.
 *
 * No se trata de soportar Markdown completo sino de lo contrario: reducir las
 * mil maneras en que el modelo escribe lo mismo a una sola, para que dibujarlo
 * sea trivial y no dependa de cómo amaneció el modelo ese día.
 */
export function limpiarTextoIA(texto: unknown): string {
  if (typeof texto !== "string") return "";

  const t = texto
    // El razonamiento no debería venir aquí, pero si un modelo lo mezcla con
    // la respuesta no tiene por qué verlo el productor
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\r\n?/g, "\n")
    // Bloques de código: el texto de adentro sí sirve, las cercas no
    .replace(/^\s*```[a-z]*\s*$/gim, "");

  const lineas: string[] = [];
  let hayContenido = false;
  for (const cruda of t.split("\n")) {
    // Los dos espacios al final son el salto de línea de Markdown: sobran
    const linea = cruda.replace(/\s+$/, "");
    const recortada = linea.trim();

    // La frase de cortesía del arranque se va antes de que algo la confunda
    // con un título ("Claro, aquí tienes el análisis:")
    if (!hayContenido && recortada !== "") {
      hayContenido = true;
      if (PREAMBULO.test(recortada) && recortada.length <= 140) continue;
    }

    // Líneas separadoras (---, ***, ___)
    if (/^([-*_])(\s*\1){2,}$/.test(recortada)) { lineas.push(""); continue; }

    // Tablas: la fila separadora se va y cada fila queda como una viñeta
    if (/^\|.*\|$/.test(recortada)) {
      if (/^\|[\s:|-]+\|$/.test(recortada)) continue;
      const celdas = recortada.slice(1, -1).split("|").map((c) => c.trim()).filter(Boolean);
      if (celdas.length > 0) lineas.push(`- ${celdas.join(" · ")}`);
      continue;
    }

    // Títulos de cualquier nivel → "### "
    const titulo = recortada.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (titulo) { lineas.push(`### ${titulo[1].replace(/\*\*/g, "").replace(/:$/, "")}`); continue; }

    // Una línea que es toda negritas ("**Diagnóstico**", "**Acciones:**")
    const todaNegrita = recortada.match(/^\*\*([^*]+?)\*\*:?$/);
    if (todaNegrita && todaNegrita[1].length <= 60) {
      lineas.push(`### ${todaNegrita[1].replace(/:$/, "").trim()}`);
      continue;
    }

    // Viñetas con *, •, +, · o guiones largos, con o sin sangría → "- "
    const vineta = linea.match(/^\s*(?:[-*•+·–—])\s+(.*)$/);
    if (vineta) { lineas.push(`- ${vineta[1].trim()}`); continue; }

    // Listas numeradas "1)" o "1." → "1. "
    const numero = linea.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
    if (numero) { lineas.push(`${numero[1]}. ${numero[2].trim()}`); continue; }

    if (esTituloImplicito(recortada)) { lineas.push(`### ${recortada.slice(0, -1).trim()}`); continue; }

    lineas.push(recortada);
  }

  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Parte una línea en pedazos normales y en negritas.
 *
 * Las cursivas, los acentos graves y los asteriscos sueltos se quitan: en un
 * informe de campo no aportan, y dejarlos a medias es justo lo que se veía mal.
 */
export function fragmentosDe(linea: string): Fragmento[] {
  const fragmentos: Fragmento[] = [];
  const patron = /\*\*(.+?)\*\*|__(.+?)__/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;

  const limpiar = (s: string) =>
    s
      .replace(/`([^`]*)`/g, "$1")
      // *cursiva* o _cursiva_ solo cuando abraza palabras completas, para no
      // tocar nombres como control_maleza
      .replace(/(^|[\s(¿¡"])[*_]([^*_\n]+?)[*_](?=[\s).,;:!?"]|$)/g, "$1$2")
      .replace(/\*+/g, "");

  while ((m = patron.exec(linea)) !== null) {
    if (m.index > ultimo) fragmentos.push({ texto: limpiar(linea.slice(ultimo, m.index)) });
    const dentro = limpiar(m[1] ?? m[2] ?? "");
    if (dentro) fragmentos.push({ texto: dentro, negrita: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < linea.length) fragmentos.push({ texto: limpiar(linea.slice(ultimo)) });

  return fragmentos.filter((f) => f.texto !== "");
}

/** El texto de la IA en bloques: títulos, párrafos y listas */
export function bloquesDeTextoIA(texto: unknown): BloqueIA[] {
  const lineas = limpiarTextoIA(texto).split("\n");
  const bloques: BloqueIA[] = [];
  let parrafo: Fragmento[][] | null = null;
  let lista: { numerada: boolean; items: Fragmento[][] } | null = null;

  const cerrarParrafo = () => {
    if (parrafo && parrafo.length > 0) bloques.push({ tipo: "parrafo", lineas: parrafo });
    parrafo = null;
  };
  const cerrarLista = () => {
    if (lista && lista.items.length > 0) bloques.push({ tipo: "lista", ...lista });
    lista = null;
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();

    if (linea === "") {
      cerrarParrafo();
      // Una línea en blanco entre viñetas no corta la lista: el modelo suele
      // separar cada punto con un renglón vacío
      if (lista) {
        const siguiente = lineas.slice(i + 1).find((l) => l.trim() !== "")?.trim() ?? "";
        const sigueLaLista = lista.numerada ? /^\d+\.\s/.test(siguiente) : siguiente.startsWith("- ");
        if (!sigueLaLista) cerrarLista();
      }
      continue;
    }

    if (linea.startsWith("### ")) {
      cerrarParrafo();
      cerrarLista();
      const fragmentos = fragmentosDe(linea.slice(4)).map((f) => ({ texto: f.texto }));
      if (fragmentos.length > 0) bloques.push({ tipo: "titulo", fragmentos });
      continue;
    }

    const vineta = linea.match(/^- (.*)$/);
    const numero = linea.match(/^\d+\. (.*)$/);
    if (vineta || numero) {
      cerrarParrafo();
      const numerada = !!numero;
      if (lista && lista.numerada !== numerada) cerrarLista();
      if (!lista) lista = { numerada, items: [] };
      const item = fragmentosDe((vineta ?? numero)![1]);
      if (item.length > 0) lista.items.push(item);
      continue;
    }

    cerrarLista();
    if (!parrafo) parrafo = [];
    const fragmentos = fragmentosDe(linea);
    if (fragmentos.length > 0) parrafo.push(fragmentos);
  }
  cerrarParrafo();
  cerrarLista();

  return bloques;
}

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fragmentosAHtml(fragmentos: Fragmento[]): string {
  return fragmentos
    .map((f) => (f.negrita ? `<strong>${escaparHtml(f.texto)}</strong>` : escaparHtml(f.texto)))
    .join("");
}

/**
 * El texto como HTML, para los reportes que se imprimen y el correo.
 *
 * Sale en una sola línea a propósito: el contenedor de la tarjeta de IA usa
 * `white-space: pre-wrap`, y cualquier salto entre etiquetas se vería como un
 * renglón en blanco.
 */
export function textoIAComoHtml(texto: unknown): string {
  return bloquesDeTextoIA(texto)
    .map((b) => {
      if (b.tipo === "titulo") return `<h4>${fragmentosAHtml(b.fragmentos)}</h4>`;
      if (b.tipo === "parrafo") return `<p>${b.lineas.map(fragmentosAHtml).join("<br>")}</p>`;
      const etiqueta = b.numerada ? "ol" : "ul";
      return `<${etiqueta}>${b.items.map((it) => `<li>${fragmentosAHtml(it)}</li>`).join("")}</${etiqueta}>`;
    })
    .join("");
}

/**
 * El texto sin ninguna marca, para donde no hay formato: Telegram, los campos
 * cortos del reporte de actividades, un PDF que solo sabe de texto.
 *
 * Conserva la estructura con renglones y viñetas "•" en vez de pegarlo todo
 * en un solo bloque.
 */
export function textoIAPlano(texto: unknown): string {
  const plano = (fs: Fragmento[]) => fs.map((f) => f.texto).join("");
  return bloquesDeTextoIA(texto)
    .map((b) => {
      if (b.tipo === "titulo") return plano(b.fragmentos);
      if (b.tipo === "parrafo") return b.lineas.map(plano).join("\n");
      return b.items.map((it, i) => `${b.numerada ? `${i + 1}.` : "•"} ${plano(it)}`).join("\n");
    })
    .join("\n\n");
}
