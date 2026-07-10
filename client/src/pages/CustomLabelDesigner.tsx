import { useState, useRef, useEffect, useCallback } from "react";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Type, QrCode, BarChart3, ImageIcon, Printer, Save, FolderOpen,
  Trash2, Plus, Copy, ChevronUp, ChevronDown, GripVertical, X,
} from "lucide-react";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

// ══════════════════════════════════════════
// Types
// ══════════════════════════════════════════
type ElementType = "text" | "barcode" | "qr" | "image";

interface LabelElement {
  id: string;
  type: ElementType;
  content: string;
  x: number; // mm
  y: number; // mm
  width: number; // mm
  height: number; // mm
  fontSize?: number; // pt
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
  imageData?: string; // base64 data URL
}

interface LabelTemplate {
  name: string;
  width: number; // mm
  height: number; // mm
  elements: LabelElement[];
  createdAt: string;
}

const LABEL_SIZES = [
  { label: "38mm × 25mm (Térmica estándar)", w: 38, h: 25 },
  { label: "50mm × 25mm", w: 50, h: 25 },
  { label: "50mm × 30mm", w: 50, h: 30 },
  { label: "60mm × 40mm", w: 60, h: 40 },
  { label: "80mm × 50mm", w: 80, h: 50 },
  { label: "100mm × 60mm", w: 100, h: 60 },
  { label: "Personalizado", w: 0, h: 0 },
];

const STORAGE_KEY = "agratec_label_templates";

// ══════════════════════════════════════════
// Helper: generate unique ID
// ══════════════════════════════════════════
let idCounter = 0;
function uid() { return `el_${Date.now()}_${idCounter++}`; }

// ══════════════════════════════════════════
// Component
// ══════════════════════════════════════════
export default function CustomLabelDesigner() {
  // Label size
  const [labelW, setLabelW] = useState(38);
  const [labelH, setLabelH] = useState(25);
  const [sizePreset, setSizePreset] = useState("38mm × 25mm (Térmica estándar)");

  // Elements
  const [elements, setElements] = useState<LabelElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  // Print
  const [printQty, setPrintQty] = useState(1);

  // QR data URLs cache
  const [qrCache, setQrCache] = useState<Record<string, string>>({});

  // Load templates from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTemplates(JSON.parse(saved));
    } catch {}
  }, []);

  // Save templates to localStorage
  const saveTemplates = useCallback((t: LabelTemplate[]) => {
    setTemplates(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  }, []);

  // Generate QR data URLs
  useEffect(() => {
    const qrElements = elements.filter(e => e.type === "qr" && e.content);
    qrElements.forEach(async (el) => {
      if (!qrCache[el.content]) {
        try {
          const url = await QRCode.toDataURL(el.content, { width: 200, margin: 1 });
          setQrCache(prev => ({ ...prev, [el.content]: url }));
        } catch {}
      }
    });
  }, [elements]);

  // Scale: mm to pixels for preview (3.78 px/mm at 96dpi, but we use a multiplier for visibility)
  const SCALE = 6; // 6px per mm for comfortable editing
  const previewW = labelW * SCALE;
  const previewH = labelH * SCALE;

  const selectedEl = elements.find(e => e.id === selectedId) || null;

  // ── Element CRUD ──
  const addElement = (type: ElementType) => {
    const base: LabelElement = {
      id: uid(),
      type,
      content: type === "text" ? "Texto" : type === "barcode" ? "12345" : type === "qr" ? "https://agratec.com" : "",
      x: 2, y: 2,
      width: type === "image" ? 10 : type === "qr" ? 12 : labelW - 4,
      height: type === "text" ? 5 : type === "qr" ? 12 : type === "image" ? 10 : 10,
      fontSize: type === "text" ? 9 : 7,
      fontWeight: "bold",
      textAlign: "center",
      fontFamily: "Arial",
    };
    setElements(prev => [...prev, base]);
    setSelectedId(base.id);
  };

  const updateElement = (id: string, patch: Partial<LabelElement>) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const removeElement = (id: string) => {
    setElements(prev => prev.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const dup = { ...el, id: uid(), x: el.x + 2, y: el.y + 2 };
    setElements(prev => [...prev, dup]);
    setSelectedId(dup.id);
  };

  const moveElement = (id: string, dir: "up" | "down") => {
    const idx = elements.findIndex(e => e.id === id);
    if (idx < 0) return;
    const arr = [...elements];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setElements(arr);
  };

  // ── Image upload ──
  const handleImageUpload = (id: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      updateElement(id, { imageData: e.target?.result as string, content: file.name });
    };
    reader.readAsDataURL(file);
  };

  // ── Templates ──
  const saveTemplate = () => {
    if (!templateName.trim()) { toast.error("Escribe un nombre"); return; }
    const t: LabelTemplate = {
      name: templateName, width: labelW, height: labelH,
      elements: [...elements], createdAt: new Date().toISOString(),
    };
    const existing = templates.filter(x => x.name !== templateName);
    saveTemplates([t, ...existing]);
    toast.success(`Plantilla "${templateName}" guardada`);
  };

  const loadTemplate = (t: LabelTemplate) => {
    setLabelW(t.width);
    setLabelH(t.height);
    setElements(t.elements.map(e => ({ ...e, id: uid() })));
    setTemplateName(t.name);
    setShowTemplates(false);
    toast.success(`Plantilla "${t.name}" cargada`);
  };

  const deleteTemplate = (name: string) => {
    saveTemplates(templates.filter(t => t.name !== name));
    toast.success("Plantilla eliminada");
  };

  // ── Print ──
  const handlePrint = async () => {
    if (elements.length === 0) { toast.error("Agrega al menos un elemento"); return; }

    const pw = window.open("", "_blank", "width=500,height=600");
    if (!pw) { toast.error("No se pudo abrir ventana de impresión"); return; }

    // Generate QR data URLs for print
    const qrDataUrls: Record<string, string> = {};
    for (const el of elements.filter(e => e.type === "qr")) {
      try { qrDataUrls[el.id] = await QRCode.toDataURL(el.content, { width: 300, margin: 1 }); } catch {}
    }

    // Generate barcode SVGs
    const barcodeSvgs: Record<string, string> = {};
    for (const el of elements.filter(e => e.type === "barcode")) {
      try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, el.content, {
          format: "CODE128", width: 1.5, height: 30,
          fontSize: el.fontSize || 7, margin: 0, displayValue: true,
          textMargin: 1, font: "Arial", fontOptions: "bold",
        });
        barcodeSvgs[el.id] = svg.outerHTML;
      } catch {}
    }

    let labelsHtml = "";
    for (let i = 0; i < printQty; i++) {
      let elHtml = "";
      for (const el of elements) {
        const style = `position:absolute;left:${el.x}mm;top:${el.y}mm;width:${el.width}mm;height:${el.height}mm;overflow:hidden;`;
        if (el.type === "text") {
          elHtml += `<div style="${style}font-size:${el.fontSize || 9}pt;font-weight:${el.fontWeight || 'normal'};text-align:${el.textAlign || 'left'};font-family:${el.fontFamily || 'Arial'},sans-serif;line-height:1.2;display:flex;align-items:center;justify-content:${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start'};">${el.content}</div>`;
        } else if (el.type === "barcode") {
          elHtml += `<div style="${style}display:flex;align-items:center;justify-content:center;">${barcodeSvgs[el.id] || ''}</div>`;
        } else if (el.type === "qr") {
          elHtml += `<div style="${style}display:flex;align-items:center;justify-content:center;"><img src="${qrDataUrls[el.id] || ''}" style="width:100%;height:100%;object-fit:contain;"/></div>`;
        } else if (el.type === "image" && el.imageData) {
          elHtml += `<div style="${style}display:flex;align-items:center;justify-content:center;"><img src="${el.imageData}" style="width:100%;height:100%;object-fit:contain;"/></div>`;
        }
      }
      labelsHtml += `<div class="label">${elHtml}</div>`;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas Personalizadas</title>
<style>
@page { size: ${labelW}mm ${labelH}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.label { width: ${labelW}mm; height: ${labelH}mm; position: relative; page-break-after: always; overflow: hidden; }
.label:last-child { page-break-after: auto; }
@media screen { body { background: #f5f5f5; padding: 10px; } .label { background: white; border: 1px dashed #ccc; margin: 5px auto; box-shadow: 0 1px 3px rgba(0,0,0,.1); } }
</style></head><body>${labelsHtml}
<script>setTimeout(()=>{window.print();},300);<\/script></body></html>`;

    pw.document.write(html);
    pw.document.close();
    toast.success(`${printQty} etiqueta(s) enviadas a impresión`);
  };

  // ── Render element in preview ──
  const renderPreviewElement = (el: LabelElement) => {
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      left: el.x * SCALE, top: el.y * SCALE,
      width: el.width * SCALE, height: el.height * SCALE,
      overflow: "hidden",
      border: selectedId === el.id ? "2px solid #10b981" : "1px dashed transparent",
      cursor: "pointer",
      borderRadius: 2,
      transition: "border-color 0.15s",
    };

    if (el.type === "text") {
      return (
        <div key={el.id} style={{
          ...baseStyle,
          fontSize: (el.fontSize || 9) * (SCALE / 3.78),
          fontWeight: el.fontWeight || "normal",
          textAlign: el.textAlign || "left",
          fontFamily: `${el.fontFamily || 'Arial'}, sans-serif`,
          lineHeight: 1.2,
          display: "flex", alignItems: "center",
          justifyContent: el.textAlign === "center" ? "center" : el.textAlign === "right" ? "flex-end" : "flex-start",
          color: "#000",
        }} onClick={() => setSelectedId(el.id)}>
          {el.content}
        </div>
      );
    }

    if (el.type === "barcode") {
      return (
        <div key={el.id} style={{...baseStyle, display: "flex", alignItems: "center", justifyContent: "center"}}
          onClick={() => setSelectedId(el.id)}>
          <BarcodePreview value={el.content} width={el.width * SCALE} height={el.height * SCALE} fontSize={el.fontSize} />
        </div>
      );
    }

    if (el.type === "qr") {
      return (
        <div key={el.id} style={{...baseStyle, display: "flex", alignItems: "center", justifyContent: "center"}}
          onClick={() => setSelectedId(el.id)}>
          {qrCache[el.content] ? (
            <img src={qrCache[el.content]} alt="QR" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: 10, color: "#999" }}>QR</div>
          )}
        </div>
      );
    }

    if (el.type === "image") {
      return (
        <div key={el.id} style={{...baseStyle, display: "flex", alignItems: "center", justifyContent: "center"}}
          onClick={() => setSelectedId(el.id)}>
          {el.imageData ? (
            <img src={el.imageData} alt={el.content} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ fontSize: 10, color: "#999", textAlign: "center" }}>
              <ImageIcon size={16} /><br />Imagen
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // ── Type icon & label ──
  const typeIcon = (t: ElementType) => {
    switch (t) {
      case "text": return <Type className="h-3.5 w-3.5" />;
      case "barcode": return <BarChart3 className="h-3.5 w-3.5" />;
      case "qr": return <QrCode className="h-3.5 w-3.5" />;
      case "image": return <ImageIcon className="h-3.5 w-3.5" />;
    }
  };
  const typeLabel = (t: ElementType) => {
    switch (t) {
      case "text": return "Texto";
      case "barcode": return "Código de barras";
      case "qr": return "QR";
      case "image": return "Imagen";
    }
  };

  return (
    <div className="space-y-4">
      {/* Top bar: Size + Templates + Print */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Size */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-green-700 uppercase tracking-wider">Tamaño</label>
          <Select value={sizePreset} onValueChange={(v) => {
            setSizePreset(v);
            const s = LABEL_SIZES.find(s => s.label === v);
            if (s && s.w > 0) { setLabelW(s.w); setLabelH(s.h); }
          }}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LABEL_SIZES.map(s => <SelectItem key={s.label} value={s.label}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {sizePreset === "Personalizado" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Ancho (mm)</label>
              <Input type="number" min={10} max={300} value={labelW} onChange={e => setLabelW(Number(e.target.value) || 38)} className="w-20" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Alto (mm)</label>
              <Input type="number" min={10} max={300} value={labelH} onChange={e => setLabelH(Number(e.target.value) || 25)} className="w-20" />
            </div>
          </>
        )}

        {/* Templates */}
        <div className="flex gap-2 ml-auto">
          <div className="flex gap-1">
            <Input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Nombre plantilla..." className="w-40 text-sm" />
            <Button variant="outline" size="sm" onClick={saveTemplate} disabled={!templateName.trim()} className="gap-1">
              <Save className="h-3.5 w-3.5" /> Guardar
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(!showTemplates)} className="gap-1">
            <FolderOpen className="h-3.5 w-3.5" /> Plantillas ({templates.length})
          </Button>
        </div>
      </div>

      {/* Templates list */}
      {showTemplates && templates.length > 0 && (
        <GlassCard className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.name} className="flex items-center justify-between p-2 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors">
                <button className="text-left flex-1" onClick={() => loadTemplate(t)}>
                  <p className="text-sm font-medium text-green-800">{t.name}</p>
                  <p className="text-xs text-green-600">{t.width}×{t.height}mm · {t.elements.length} elementos</p>
                </button>
                <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.name)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Element list + properties */}
        <div className="space-y-3">
          {/* Add buttons */}
          <GlassCard className="p-3">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Agregar Elemento</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => addElement("text")} className="gap-1.5 text-xs justify-start border-green-200 hover:bg-green-50">
                <Type className="h-4 w-4 text-blue-500" /> Texto
              </Button>
              <Button variant="outline" size="sm" onClick={() => addElement("barcode")} className="gap-1.5 text-xs justify-start border-green-200 hover:bg-green-50">
                <BarChart3 className="h-4 w-4 text-purple-500" /> Código Barras
              </Button>
              <Button variant="outline" size="sm" onClick={() => addElement("qr")} className="gap-1.5 text-xs justify-start border-green-200 hover:bg-green-50">
                <QrCode className="h-4 w-4 text-emerald-500" /> Código QR
              </Button>
              <Button variant="outline" size="sm" onClick={() => addElement("image")} className="gap-1.5 text-xs justify-start border-green-200 hover:bg-green-50">
                <ImageIcon className="h-4 w-4 text-amber-500" /> Imagen
              </Button>
            </div>
          </GlassCard>

          {/* Element list */}
          <GlassCard className="p-3">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Elementos ({elements.length})</p>
            {elements.length === 0 && (
              <p className="text-xs text-gray-400 py-4 text-center">Agrega elementos con los botones de arriba</p>
            )}
            <div className="space-y-1">
              {elements.map((el, idx) => (
                <div
                  key={el.id}
                  className={`flex items-center gap-1.5 p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    selectedId === el.id ? "bg-emerald-100 border border-emerald-300" : "hover:bg-gray-50 border border-transparent"
                  }`}
                  onClick={() => setSelectedId(el.id)}
                >
                  <GripVertical className="h-3 w-3 text-gray-300" />
                  {typeIcon(el.type)}
                  <span className="flex-1 truncate font-medium">{el.content || typeLabel(el.type)}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); moveElement(el.id, "up"); }}>
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); moveElement(el.id, "down"); }}>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); duplicateElement(el.id); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={e => { e.stopPropagation(); removeElement(el.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Properties panel */}
          {selectedEl && (
            <GlassCard className="p-3">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">
                Propiedades: {typeLabel(selectedEl.type)}
              </p>
              <div className="space-y-2">
                {/* Content */}
                {selectedEl.type !== "image" && (
                  <div>
                    <label className="text-xs text-gray-500">{selectedEl.type === "text" ? "Texto" : selectedEl.type === "barcode" ? "Valor código" : "Contenido QR"}</label>
                    <Input value={selectedEl.content} onChange={e => updateElement(selectedEl.id, { content: e.target.value })} className="text-sm h-8" />
                  </div>
                )}

                {/* Image upload */}
                {selectedEl.type === "image" && (
                  <div>
                    <label className="text-xs text-gray-500">Imagen</label>
                    <Input type="file" accept="image/*" className="text-xs h-8"
                      onChange={e => { if (e.target.files?.[0]) handleImageUpload(selectedEl.id, e.target.files[0]); }} />
                  </div>
                )}

                {/* Position */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">X (mm)</label>
                    <Input type="number" step={0.5} value={selectedEl.x} onChange={e => updateElement(selectedEl.id, { x: Number(e.target.value) })} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Y (mm)</label>
                    <Input type="number" step={0.5} value={selectedEl.y} onChange={e => updateElement(selectedEl.id, { y: Number(e.target.value) })} className="text-sm h-8" />
                  </div>
                </div>

                {/* Size */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Ancho (mm)</label>
                    <Input type="number" step={0.5} min={1} value={selectedEl.width} onChange={e => updateElement(selectedEl.id, { width: Number(e.target.value) })} className="text-sm h-8" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Alto (mm)</label>
                    <Input type="number" step={0.5} min={1} value={selectedEl.height} onChange={e => updateElement(selectedEl.id, { height: Number(e.target.value) })} className="text-sm h-8" />
                  </div>
                </div>

                {/* Text-specific */}
                {selectedEl.type === "text" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Tamaño fuente (pt)</label>
                        <Input type="number" min={4} max={72} value={selectedEl.fontSize || 9} onChange={e => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })} className="text-sm h-8" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Peso</label>
                        <Select value={selectedEl.fontWeight || "normal"} onValueChange={v => updateElement(selectedEl.id, { fontWeight: v as any })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="bold">Negrita</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Alineación</label>
                        <Select value={selectedEl.textAlign || "left"} onValueChange={v => updateElement(selectedEl.id, { textAlign: v as any })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">Izquierda</SelectItem>
                            <SelectItem value="center">Centro</SelectItem>
                            <SelectItem value="right">Derecha</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Fuente</label>
                        <Select value={selectedEl.fontFamily || "Arial"} onValueChange={v => updateElement(selectedEl.id, { fontFamily: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Arial">Arial</SelectItem>
                            <SelectItem value="Courier New">Monospace</SelectItem>
                            <SelectItem value="Georgia">Georgia</SelectItem>
                            <SelectItem value="Times New Roman">Times</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right: Preview (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <GlassCard className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">
                Vista Previa — {labelW}mm × {labelH}mm (escala {SCALE}x)
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Cantidad:</label>
                <Input type="number" min={1} max={5000} value={printQty} onChange={e => setPrintQty(Math.max(1, Number(e.target.value) || 1))} className="w-20 h-8 text-sm" />
                <Button onClick={handlePrint} disabled={elements.length === 0}
                  className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg">
                  <Printer className="h-4 w-4" /> Imprimir {printQty > 1 ? `${printQty}x` : ""}
                </Button>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex justify-center overflow-auto">
              <div
                style={{
                  width: previewW, height: previewH,
                  position: "relative", background: "white",
                  border: "2px solid #10b981", borderRadius: 4,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  backgroundImage: `radial-gradient(circle, #e5e7eb 0.5px, transparent 0.5px)`,
                  backgroundSize: `${SCALE * 2}px ${SCALE * 2}px`,
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedId(null);
                }}
              >
                {elements.map(el => renderPreviewElement(el))}
              </div>
            </div>

            {/* Quick tips */}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span>💡 Clic en un elemento para seleccionarlo</span>
              <span>📐 Ajusta posición y tamaño en el panel izquierdo</span>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// Barcode preview sub-component
// ══════════════════════════════════════════
function BarcodePreview({ value, width, height, fontSize }: { value: string; width: number; height: number; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128", width: 1.5, height: Math.max(15, height * 0.6),
          fontSize: fontSize || 7, margin: 0, displayValue: true, textMargin: 1,
        });
      } catch {}
    }
  }, [value, width, height, fontSize]);
  return <svg ref={ref} style={{ width: "100%", height: "100%" }} />;
}
