import { describe, expect, it } from "vitest";
import { cifradoParaElPuerto, diagnosticarSmtp, limpiarServidor, parseRecipients } from "./mailer";
import { diaIso, semanaPasada } from "./reporteSemanal";
import { mensajeDeActividades } from "./telegramSemanal";
import { compararConLaPrevia, documentoDeActividades, documentoDeCosecha } from "./reporteDocumentos";
import { generarPdf } from "./reportePdf";
import type { CosechaSemana } from "./reporteSemanal";

// ============================================================
// El correo semanal
//
// Lo que se prueba aquí es lo que no se ve hasta que falla en producción: que
// la semana que se mide sea la correcta, que un error del servidor de correo
// se traduzca a algo accionable, y que el PDF salga siendo un PDF.
// ============================================================

describe("diagnosticarSmtp", () => {
  const gmail = { host: "smtp.gmail.com", port: 587, secure: false, username: "a@gmail.com", fromEmail: "a@gmail.com" };
  const propio = { host: "mail.finca.mx", port: 465, secure: false, username: "reportes", fromEmail: "reportes@finca.mx" };

  it("reconoce el puerto cifrado con la casilla apagada", () => {
    const err: any = new Error("140...:SSL routines:ssl3_get_record:wrong version number");
    expect(diagnosticarSmtp(err, propio)).toMatch(/465 y el cifrado no cuadran/);
  });

  it("explica que el servidor nunca saludó como un problema de puerto", () => {
    const err: any = new Error("Greeting never received");
    expect(diagnosticarSmtp(err, propio)).toMatch(/465 la casilla de conexión cifrada directa va MARCADA/);
  });

  it("le dice a Gmail que necesita contraseña de aplicación", () => {
    const err: any = new Error("Invalid login: 535-5.7.8 Username and Password not accepted");
    err.code = "EAUTH";
    err.responseCode = 535;
    const texto = diagnosticarSmtp(err, gmail);
    expect(texto).toMatch(/contraseña de aplicación/);
    expect(texto).toMatch(/verificación en dos pasos/);
  });

  it("no culpa a la contraseña cuando el problema es el firewall del servidor", () => {
    const err: any = new Error("Connection timeout");
    err.code = "ETIMEDOUT";
    const texto = diagnosticarSmtp(err, gmail);
    expect(texto).toMatch(/bloqueada la salida de correo/);
    expect(texto).not.toMatch(/contraseña de aplicación/);
  });

  it("señala el remitente cuando el servidor acepta la cuenta pero rechaza el envío", () => {
    const err: any = new Error("Mail from not allowed");
    err.responseCode = 550;
    expect(diagnosticarSmtp(err, propio)).toMatch(/reportes@finca\.mx/);
  });

  it("señala el campo equivocado cuando el servidor trae una arroba", () => {
    const err: any = new Error("queryA EBADNAME no-reply-report@agra.tecti.com.mx");
    err.code = "EBADNAME";
    const texto = diagnosticarSmtp(err, {
      host: "no-reply-report@agra.tecti.com.mx",
      port: 465,
      secure: true,
      username: "no-reply-report@agra.tecti.com.mx",
      fromEmail: "no-reply-report@agra.tecti.com.mx",
    });
    expect(texto).toMatch(/no es un nombre de servidor/);
    expect(texto).toMatch(/agra\.tecti\.com\.mx/);
  });

  it("devuelve el error tal cual cuando no reconoce el caso", () => {
    expect(diagnosticarSmtp(new Error("algo rarísimo"), gmail)).toBe("algo rarísimo");
  });

  it("siempre deja ver lo que dijo el servidor", () => {
    const err: any = new Error("Invalid login: 535 nope");
    err.code = "EAUTH";
    expect(diagnosticarSmtp(err, gmail)).toContain("Invalid login: 535 nope");
  });
});

describe("limpiarServidor", () => {
  it("quita lo que se puede quitar solo", () => {
    expect(limpiarServidor("  https://agra.tecti.com.mx/  ")).toBe("agra.tecti.com.mx");
    expect(limpiarServidor("MAIL.Tecti.com.mx")).toBe("mail.tecti.com.mx");
    expect(limpiarServidor("agra.tecti.com.mx:465")).toBe("agra.tecti.com.mx");
  });

  it("no acepta una dirección de correo como servidor, y dice qué poner", () => {
    // Es el error real: en el panel del proveedor la dirección está justo
    // encima del nombre del servidor. El DNS respondía "EBADNAME", que no
    // señala ningún campo.
    expect(() => limpiarServidor("no-reply-report@agra.tecti.com.mx")).toThrow(/agra\.tecti\.com\.mx/);
    expect(() => limpiarServidor("no-reply-report@agra.tecti.com.mx")).toThrow(/Usuario/);
  });

  it("no acepta algo que no sea un nombre de servidor", () => {
    expect(() => limpiarServidor("localhost")).toThrow();
    expect(() => limpiarServidor("")).toThrow(/Falta el servidor/);
  });
});

describe("cifradoParaElPuerto", () => {
  // Esta es la regla que tuvo el correo de la finca sin salir: puerto 465
  // guardado con el cifrado apagado. El envío se quedaba esperando un saludo
  // que en ese puerto nunca llega en claro.
  it("el 465 va cifrado aunque se haya guardado que no", () => {
    expect(cifradoParaElPuerto(465, false)).toBe(true);
  });

  it("el 587 y el 25 no llevan cifrado directo aunque se haya marcado", () => {
    expect(cifradoParaElPuerto(587, true)).toBe(false);
    expect(cifradoParaElPuerto(25, true)).toBe(false);
  });

  it("un puerto fuera de lo normal respeta lo que se eligió", () => {
    expect(cifradoParaElPuerto(2525, true)).toBe(true);
    expect(cifradoParaElPuerto(2525, false)).toBe(false);
  });
});

describe("parseRecipients", () => {
  it("separa por coma, punto y coma y saltos de línea, y tira lo que no es correo", () => {
    expect(parseRecipients("a@b.com, c@d.com;\ne@f.com\nbasura")).toEqual([
      "a@b.com",
      "c@d.com",
      "e@f.com",
    ]);
  });

  it("una lista vacía no es un destinatario", () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients("  ")).toEqual([]);
  });
});

describe("semanaPasada", () => {
  it("un lunes mide la semana anterior completa, no los últimos siete días", () => {
    // 2026-09-21 es lunes
    expect(semanaPasada("2026-09-21")).toEqual({ desde: "2026-09-14", hasta: "2026-09-20" });
  });

  it("da la misma semana cualquier día que se pregunte", () => {
    const esperado = { desde: "2026-09-14", hasta: "2026-09-20" };
    for (const dia of ["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-27"]) {
      expect(semanaPasada(dia)).toEqual(esperado);
    }
  });

  it("un domingo todavía pertenece a la semana que empezó el lunes anterior", () => {
    // 2026-09-27 es domingo: la semana en curso arrancó el 21
    expect(semanaPasada("2026-09-27").hasta).toBe("2026-09-20");
  });

  it("cruza el cambio de mes sin inventarse días", () => {
    expect(semanaPasada("2026-10-05")).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
  });
});

describe("diaIso", () => {
  it("el lunes es 1 y el domingo es 7", () => {
    expect(diaIso("2026-09-21")).toBe(1);
    expect(diaIso("2026-09-27")).toBe(7);
  });
});

describe("compararConLaPrevia", () => {
  it("no compara contra una semana sin cosecha", () => {
    expect(compararConLaPrevia(1000, 0)).toBeNull();
  });

  it("dice cuánto se subió", () => {
    expect(compararConLaPrevia(1100, 1000)).toMatch(/^\+10\.0%/);
  });

  it("dice cuánto se bajó, con signo", () => {
    expect(compararConLaPrevia(900, 1000)).toMatch(/^-10\.0%/);
  });
});

// ── El PDF ───────────────────────────────────────────────────

const cosechaDePrueba: CosechaSemana = {
  totales: { nombre: "TOTAL", cajas: 100, kg: 800, primera: 700, segunda: 70, desperdicio: 30 },
  porParcela: [
    { nombre: "Parcela norte", cajas: 60, kg: 500, primera: 450, segunda: 35, desperdicio: 15 },
    { nombre: "Parcela sur", cajas: 40, kg: 300, primera: 250, segunda: 35, desperdicio: 15 },
  ],
  porDia: [
    { fecha: "2026-09-14", cajas: 50, kg: 400, primera: 350 },
    { fecha: "2026-09-15", cajas: 50, kg: 400, primera: 350 },
  ],
  porCortadora: [{ numero: 3, nombre: "Ángeles Ñuño", cajas: 30, kg: 240 }],
  avisos: { sinParcela: 2, pesoAlto: 1, sinCiclo: 0 },
  kgSemanaPrevia: 700,
  ciclo: "Cosecha 2026",
};

describe("documentoDeCosecha", () => {
  it("cierra cada tabla con su renglón de totales", () => {
    const doc = documentoDeCosecha({ periodo: { desde: "2026-09-14", hasta: "2026-09-20" }, cosecha: cosechaDePrueba });
    const porParcela = doc.secciones.find((s) => s.titulo === "Por parcela");
    expect(porParcela?.totales?.[0]).toBe("TOTAL");
  });

  it("señala las cajas raras sin sacarlas de los totales", () => {
    const doc = documentoDeCosecha({ periodo: { desde: "2026-09-14", hasta: "2026-09-20" }, cosecha: cosechaDePrueba });
    expect(doc.avisos?.join(" ")).toMatch(/sin parcela/);
    expect(doc.avisos?.join(" ")).toMatch(/más de 15 kg/);
    // Los totales siguen siendo los mismos de la consulta
    expect(doc.kpis.find((k) => k.etiqueta === "Cajas")?.valor).toBe("100");
  });

  it("no inventa un aviso cuando no hay nada que revisar", () => {
    const limpia = { ...cosechaDePrueba, avisos: { sinParcela: 0, pesoAlto: 0, sinCiclo: 0 } };
    const doc = documentoDeCosecha({ periodo: { desde: "2026-09-14", hasta: "2026-09-20" }, cosecha: limpia });
    expect(doc.avisos).toEqual([]);
  });
});

describe("generarPdf", () => {
  it("devuelve un PDF de verdad", async () => {
    const buffer = await generarPdf(
      documentoDeCosecha({ periodo: { desde: "2026-09-14", hasta: "2026-09-20" }, cosecha: cosechaDePrueba }),
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("aguanta un reporte largo sin romperse al paginar", async () => {
    const grande: CosechaSemana = {
      ...cosechaDePrueba,
      porParcela: Array.from({ length: 120 }, (_, i) => ({
        nombre: `Parcela con un nombre bastante largo para forzar el salto ${i}`,
        cajas: 10,
        kg: 80,
        primera: 70,
        segunda: 7,
        desperdicio: 3,
      })),
    };
    const buffer = await generarPdf(
      documentoDeCosecha({ periodo: { desde: "2026-09-14", hasta: "2026-09-20" }, cosecha: grande }),
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("un reporte de actividades vacío sigue saliendo", async () => {
    const buffer = await generarPdf(
      documentoDeActividades({
        period: { from: "2026-09-14", to: "2026-09-20" },
        scopeLabel: "Todas las parcelas",
        ai: null,
        activities: [],
        summary: {
          total: 0, completed: 0, inProgress: 0, planned: 0, cancelled: 0,
          hours: 0, workDays: 0, parcelsWorked: 0, peopleCount: 0, photos: 0,
          byType: [], byParcel: [], byPerson: [], products: [], tools: [],
        } as any,
      }),
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

// ── El mensaje de Telegram ───────────────────────────────────

function resumenFalso(extra: Partial<any> = {}): any {
  return {
    total: 42, completed: 35, inProgress: 4, planned: 3, cancelled: 0,
    hours: 318.5, workDays: 60, parcelsWorked: 9, peopleCount: 14, photos: 0,
    byType: [{ key: "riego", label: "Riego", count: 12, hours: 90 }],
    byParcel: [{ key: "Norte", name: "Norte", count: 5, hours: 30 }],
    byPerson: [],
    products: [{ name: "Urea 46", typeLabel: "Fertilizante granular", unit: "kg", total: 340, times: 4, sinCantidad: 0 }],
    tools: [],
    ...extra,
  };
}

const PERIODO = { desde: "2026-09-14", hasta: "2026-09-20" };

describe("mensajeDeActividades", () => {
  it("trae los números de la semana, que es lo que se lee en el grupo", () => {
    const m = mensajeDeActividades({ periodo: PERIODO, summary: resumenFalso(), ai: null });
    expect(m).toMatch(/42/);
    expect(m).toMatch(/318\.5/);
    expect(m).toMatch(/Riego/);
    expect(m).toMatch(/Urea 46/);
  });

  it("escapa lo que viene de la base, que Telegram lo lee como HTML", () => {
    // Un producto llamado "Fungicida <B> & Co" rompía el mensaje entero:
    // Telegram rechaza el HTML mal formado y no manda nada.
    const m = mensajeDeActividades({
      periodo: PERIODO,
      summary: resumenFalso({
        products: [{ name: "Fungicida <B> & Co", typeLabel: "Fungicida", unit: "L", total: 2, times: 1, sinCantidad: 0 }],
      }),
      ai: null,
    });
    expect(m).toContain("Fungicida &lt;B&gt; &amp; Co");
    expect(m).not.toContain("<B>");
  });

  it("una semana sin labores lo dice, no manda un mensaje vacío", () => {
    const m = mensajeDeActividades({
      periodo: PERIODO,
      summary: resumenFalso({ total: 0, completed: 0, planned: 0, inProgress: 0, byType: [], products: [], byParcel: [] }),
      ai: null,
    });
    expect(m).toMatch(/No se registró ninguna labor/);
  });

  it("nunca se pasa del límite de Telegram, que rechaza el mensaje entero", () => {
    const m = mensajeDeActividades({
      periodo: PERIODO,
      summary: resumenFalso({
        byType: Array.from({ length: 80 }, (_, i) => ({ key: `t${i}`, label: `Tipo de labor con nombre larguísimo ${i}`, count: 9, hours: 12 })),
        products: Array.from({ length: 200 }, (_, i) => ({ name: `Producto de nombre interminable ${i}`, typeLabel: "Fertilizante", unit: "kg", total: 10, times: 2, sinCantidad: 0 })),
        byParcel: Array.from({ length: 200 }, (_, i) => ({ key: `p${i}`, name: `Parcela ${i}`, count: 3, hours: 4 })),
      }),
      ai: { resumen: "Frase larguísima. ".repeat(400), porLabor: [], insumos: null, pendientes: null, recomendaciones: [] },
    });
    expect(m.length).toBeLessThanOrEqual(4096);
    expect(m).toMatch(/y \d+ producto\(s\) más/);
  });

  it("señala lo que quedó sin cerrar", () => {
    const m = mensajeDeActividades({ periodo: PERIODO, summary: resumenFalso(), ai: null });
    expect(m).toMatch(/Pendientes/);
    expect(m).toMatch(/3 planificada\(s\) sin ejecutar/);
  });
});

describe("el encabezado del mensaje de Telegram", () => {
  it("no repite el mes cuando la semana no lo cruza", () => {
    const m = mensajeDeActividades({ periodo: PERIODO, summary: resumenFalso(), ai: null });
    expect(m).toContain("Semana del 14 al 20 de septiembre");
  });

  it("nombra los dos meses cuando la semana los cruza", () => {
    const m = mensajeDeActividades({
      periodo: { desde: "2026-09-28", hasta: "2026-10-04" },
      summary: resumenFalso(),
      ai: null,
    });
    expect(m).toContain("del 28 de septiembre al 4 de octubre");
  });

  it("no pone ceros de relleno en las cantidades", () => {
    const m = mensajeDeActividades({ periodo: PERIODO, summary: resumenFalso(), ai: null });
    expect(m).toContain("340 kg");
    expect(m).not.toContain("340.00");
  });
});
