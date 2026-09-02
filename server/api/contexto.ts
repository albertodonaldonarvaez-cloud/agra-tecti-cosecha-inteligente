/**
 * El estado de la finca en una sola llamada.
 *
 * Es el endpoint que más le ahorra a un agente. Para responder "¿cómo va la
 * cosecha?" antes hacían falta unas diez llamadas encadenadas —ciclo activo,
 * cosecha del día, calidad, parcelas, clima, labores abiertas, notas— y cada
 * agente armaba la historia a su manera.
 *
 * Se arma con allSettled a propósito: si el servicio de clima está caído, el
 * resto del contexto debe llegar igual, con ese apartado marcado como no
 * disponible. Un agente puede trabajar con información incompleta si sabe qué
 * le falta; con un 500 no puede hacer nada.
 */
import type { DefinicionRuta } from "./index";
import { hoyMx, sumarDias } from "./util";
import { cosechaPorParcela, rendimientoCortadoras } from "./consultas";

/** Envuelve una promesa para que un fallo se vuelva dato, no excepción */
async function intentar<T>(etiqueta: string, promesa: Promise<T>): Promise<T | { noDisponible: string }> {
  try {
    return await promesa;
  } catch (e: any) {
    console.error(`[API v1] contexto/${etiqueta}:`, e?.message);
    return { noDisponible: e?.message || "No se pudo consultar" };
  }
}

export const rutasContexto: DefinicionRuta[] = [
  {
    ruta: "/contexto",
    resumen: "Todo el estado de la finca en una llamada: cosecha, calidad, clima, labores y alertas",
    descripcion:
      "Pensado como primera llamada de cualquier análisis. Trae el ciclo en curso, la cosecha " +
      "de hoy y de los últimos 7 y 30 días, las parcelas más y menos productivas, el clima, " +
      "las labores abiertas y las notas críticas. Si alguna parte falla, ese apartado llega " +
      "como {noDisponible: motivo} y el resto sigue sirviendo.",
    ejemplo: "/api/v1/contexto",
    async manejador({ caller }) {
      const hoy = hoyMx();
      const hace7 = sumarDias(hoy, -6);
      const hace30 = sumarDias(hoy, -29);

      const [
        hoyStats,
        semana,
        mes,
        historico,
        ciclos,
        porParcela,
        cortadoras,
        clima,
        labores,
        notas,
        almacen,
        sinc,
      ] = await Promise.all([
        intentar("cosecha_hoy", caller.boxes.dashboardStats({ startDate: hoy, endDate: hoy })),
        intentar("cosecha_semana", caller.boxes.dashboardStats({ startDate: hace7, endDate: hoy })),
        intentar("cosecha_mes", caller.boxes.dashboardStats({ startDate: hace30, endDate: hoy })),
        intentar("cosecha_historico", caller.boxes.dashboardStats(undefined)),
        intentar("ciclos", caller.cycles.overview()),
        intentar("parcelas", cosechaPorParcela(hace30, hoy)),
        intentar("cortadoras", rendimientoCortadoras(hace7, hoy, 5)),
        intentar("clima", caller.weather.getCurrent()),
        intentar("labores", caller.fieldNotebook.dashboard({ pendingLimit: 10, recentLimit: 5 })),
        intentar("notas", caller.fieldNotes.summary()),
        intentar("almacen", caller.warehouse.summary()),
        intentar("sincronizacion", estadoSincronizacion(caller)),
      ]);

      const parcelas = Array.isArray(porParcela) ? porParcela : [];
      const conRendimiento = parcelas.filter((p) => p.rendimientoKgPorHectarea !== null);

      return {
        fecha: hoy,
        cosecha: {
          hoy: resumirCosecha(hoyStats),
          ultimos7Dias: resumirCosecha(semana),
          ultimos30Dias: resumirCosecha(mes),
          historico: resumirCosecha(historico),
        },
        ciclos,
        parcelas: {
          periodo: { desde: hace30, hasta: hoy },
          activas: parcelas.length,
          masProductivas: parcelas.slice(0, 5).map(resumirParcela),
          // Solo tiene sentido rankear por rendimiento a las que sí tienen hectáreas
          mejorRendimiento: [...conRendimiento]
            .sort((a, b) => (b.rendimientoKgPorHectarea ?? 0) - (a.rendimientoKgPorHectarea ?? 0))
            .slice(0, 5)
            .map(resumirParcela),
          peorRendimiento: [...conRendimiento]
            .sort((a, b) => (a.rendimientoKgPorHectarea ?? 0) - (b.rendimientoKgPorHectarea ?? 0))
            .slice(0, 5)
            .map(resumirParcela),
          sinHectareasRegistradas: parcelas.length - conRendimiento.length,
        },
        cortadorasDestacadas: cortadoras,
        clima,
        labores,
        notas,
        almacen,
        sincronizacion: sinc,
      };
    },
  },

  {
    ruta: "/estado-sincronizacion",
    resumen: "Si Kobo, las fotos y el satélite van al día",
    descripcion:
      "Antes esto solo se veía en los logs del contenedor. Sirve para que un agente sepa si " +
      "los datos que está analizando están completos o si la última sincronización falló.",
    ejemplo: "/api/v1/estado-sincronizacion",
    async manejador({ caller }) {
      return estadoSincronizacion(caller);
    },
  },
];

async function estadoSincronizacion(caller: any) {
  const [kobo, fotos, satelite, odm] = await Promise.all([
    intentar("kobo", caller.autoSync.status()),
    intentar("fotos", caller.koboPhotos.status()),
    intentar("satelite", caller.copernicus.syncStatus()),
    intentar("odm", caller.odmSync.status()),
  ]);
  return { kobo, fotos, satelite, odm };
}

function resumirCosecha(s: any) {
  if (!s || s.noDisponible) return s?.noDisponible ? s : { cajas: 0, pesoKg: 0, hayDatos: false };
  return {
    hayDatos: true,
    cajas: s.total,
    pesoKg: Number(Number(s.totalWeight).toFixed(2)),
    pesoToneladas: Number((Number(s.totalWeight) / 1000).toFixed(3)),
    primeraPorcentaje: s.firstQualityPercent,
    segundaPorcentaje: s.secondQualityPercent,
    desperdicioPorcentaje: s.wastePercent,
  };
}

function resumirParcela(p: any) {
  return {
    codigo: p.codigo,
    nombre: p.nombre,
    cajas: p.cajas,
    pesoKg: p.pesoKg,
    rendimientoKgPorHectarea: p.rendimientoKgPorHectarea,
    primeraPorcentaje: p.primera.porcentaje,
  };
}
