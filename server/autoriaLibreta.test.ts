/**
 * La autoría de las actividades de la libreta de campo.
 *
 * Lo que se prueba aquí es la parte que decide de quién es un registro y de
 * dónde salió. Equivocarse le atribuye el trabajo de una persona a otra, que
 * es peor que no mostrar nada: la pantalla se ve igual de convincente en los
 * dos casos.
 */
import { describe, it, expect } from "vitest";
import { autoriaDe, cuentasPorId, origenDeActividad, type CuentaQueRegistra } from "./autoriaLibreta";

/** Un drizzle de mentiras: solo necesita devolver las filas del select encadenado */
function baseFalsa(filas: any[], espia?: { ids?: any }) {
  return {
    select: () => ({
      from: () => ({
        where: (condicion: any) => {
          if (espia) espia.ids = condicion;
          return Promise.resolve(filas);
        },
      }),
    }),
  };
}

const CUENTA: CuentaQueRegistra = {
  id: 4, nombre: "Rosa", correo: "rosa@agra.mx", emoji: "🌻", color: "#f59e0b", rol: "user", activa: true,
};

describe("origenDeActividad", () => {
  it("con clientUuid viene de la app", () => {
    expect(origenDeActividad("7f1c-…-aa")).toBe("app");
  });

  it("sin clientUuid viene de la web", () => {
    expect(origenDeActividad(null)).toBe("web");
    expect(origenDeActividad(undefined)).toBe("web");
  });

  it("un uuid vacío no cuenta como app", () => {
    // Un string en blanco en la columna sería un registro de la web mal
    // guardado; marcarlo como "app" mentiría sobre de dónde salió.
    expect(origenDeActividad("")).toBe("web");
    expect(origenDeActividad("   ")).toBe("web");
  });
});

describe("cuentasPorId", () => {
  it("traduce las filas de usuarios a lo que ve la pantalla", async () => {
    const db = baseFalsa([
      { id: 4, name: "Rosa", email: "rosa@agra.mx", role: "user", isActive: 1, avatarColor: "#f59e0b", avatarEmoji: "🌻" },
    ]);
    const mapa = await cuentasPorId(db, [4, 4]);
    expect(mapa.get(4)).toEqual(CUENTA);
  });

  it("sin cuentas válidas no consulta la base", async () => {
    let consultada = false;
    const db = {
      select: () => { consultada = true; return { from: () => ({ where: () => Promise.resolve([]) }) }; },
    };
    // El 0 es el relleno de las actividades viejas: no es un usuario
    const mapa = await cuentasPorId(db, [0, null, undefined]);
    expect(mapa.size).toBe(0);
    expect(consultada).toBe(false);
  });

  it("una cuenta sin nombre cae al correo", async () => {
    const db = baseFalsa([
      { id: 9, name: "   ", email: "bascula2@agra.mx", role: "user", isActive: 1, avatarColor: null, avatarEmoji: null },
    ]);
    const mapa = await cuentasPorId(db, [9]);
    expect(mapa.get(9)?.nombre).toBe("bascula2@agra.mx");
    expect(mapa.get(9)?.emoji).toBe("👤");
    expect(mapa.get(9)?.color).toBe("#16a34a");
  });

  it("al admin sin emoji se le pone el escudo", async () => {
    const db = baseFalsa([
      { id: 1, name: "Donaldo", email: "d@agra.mx", role: "admin", isActive: 1, avatarColor: null, avatarEmoji: null },
    ]);
    expect((await cuentasPorId(db, [1])).get(1)?.emoji).toBe("🛡️");
  });
});

describe("autoriaDe", () => {
  const cuentas = new Map([[4, CUENTA]]);

  it("una actividad de la app trae cuenta y origen", () => {
    const a = autoriaDe({ clientUuid: "abc", createdByUserId: 4 }, cuentas);
    expect(a.origen).toBe("app");
    expect(a.registradoPor?.nombre).toBe("Rosa");
  });

  it("una actividad de la web trae cuenta y dice web", () => {
    const a = autoriaDe({ clientUuid: null, createdByUserId: 4 }, cuentas);
    expect(a.origen).toBe("web");
    expect(a.registradoPor?.correo).toBe("rosa@agra.mx");
  });

  it("si la cuenta ya no existe queda en null, no en un nombre inventado", () => {
    const a = autoriaDe({ clientUuid: "abc", createdByUserId: 77 }, cuentas);
    expect(a.registradoPor).toBeNull();
    expect(a.origen).toBe("app");
  });

  it("las actividades viejas sin cuenta guardada no se le achacan a nadie", () => {
    expect(autoriaDe({ createdByUserId: 0 }, cuentas).registradoPor).toBeNull();
    expect(autoriaDe({ createdByUserId: null }, cuentas).registradoPor).toBeNull();
  });
});
