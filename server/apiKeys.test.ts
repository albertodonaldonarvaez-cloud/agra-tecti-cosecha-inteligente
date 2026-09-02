/**
 * Pruebas de las llaves de API y de sus topes.
 *
 * Son la parte del sistema donde un error no se ve: un límite de peticiones mal
 * hecho no falla, simplemente deja pasar todo, y nadie se entera hasta que llega
 * la factura de DeepSeek o el MySQL de producción se pone lento. Por eso lo que
 * se prueba aquí es que el límite de verdad limite, y que la llave no se pueda
 * adivinar ni reconstruir desde lo que se guarda.
 */
import { describe, it, expect } from "vitest";
import {
  KEY_PREFIX,
  consumirFicha,
  generateKey,
  hashKey,
  looksLikeKey,
  maskKey,
  type Cubeta,
} from "./apiKeys";

describe("formato de la llave", () => {
  it("genera llaves distintas cada vez", () => {
    const llaves = new Set(Array.from({ length: 200 }, () => generateKey().plain));
    expect(llaves.size).toBe(200);
  });

  it("el prefijo que se guarda no alcanza para reconstruir la llave", () => {
    const { plain, prefix } = generateKey();
    expect(plain.startsWith(prefix)).toBe(true);
    // Lo guardado en claro es una fracción de lo que hace falta para autenticar
    expect(prefix.length).toBeLessThan(plain.length / 2);
    expect(maskKey(prefix)).not.toContain(plain.slice(prefix.length));
  });

  it("el hash es estable y no depende de espacios sobrantes", () => {
    const { plain, hash } = generateKey();
    expect(hashKey(plain)).toBe(hash);
    // Al pegar una llave en una variable de entorno se cuela un salto de línea
    expect(hashKey(`  ${plain}\n`)).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("descarta lo que ni siquiera tiene forma de llave, sin tocar la base", () => {
    expect(looksLikeKey(generateKey().plain)).toBe(true);
    expect(looksLikeKey("")).toBe(false);
    expect(looksLikeKey(undefined)).toBe(false);
    expect(looksLikeKey("Bearer eyJhbGciOiJIUzI1NiJ9.abc")).toBe(false);
    // Una llave cortada al copiarla no debe pasar el filtro
    expect(looksLikeKey(`${KEY_PREFIX}abc`)).toBe(false);
  });
});

describe("límite de peticiones por minuto", () => {
  const T0 = 1_700_000_000_000;

  function gastar(veces: number, porMinuto: number, ahora = T0) {
    let cubeta: Cubeta | undefined;
    let permitidas = 0;
    let ultimaEspera = 0;
    for (let i = 0; i < veces; i++) {
      const r = consumirFicha(cubeta, porMinuto, ahora);
      cubeta = r.cubeta;
      if (r.permitido) permitidas++;
      else ultimaEspera = r.esperaSegundos;
    }
    return { permitidas, cubeta: cubeta!, ultimaEspera };
  }

  it("deja pasar exactamente el límite en una ráfaga y frena el resto", () => {
    const { permitidas } = gastar(100, 60);
    expect(permitidas).toBe(60);
  });

  it("dice en cuántos segundos habrá otra ficha, en vez de solo negar", () => {
    const { ultimaEspera } = gastar(70, 60);
    // A 60 por minuto se repone una por segundo
    expect(ultimaEspera).toBe(1);

    // Con un límite chico la espera es proporcional: 6 por minuto = una cada 10 s
    const lento = gastar(10, 6);
    expect(lento.permitidas).toBe(6);
    expect(lento.ultimaEspera).toBe(10);
  });

  it("repone fichas con el paso del tiempo", () => {
    const agotada = gastar(60, 60);
    expect(consumirFicha(agotada.cubeta, 60, T0).permitido).toBe(false);
    // Un segundo después ya hay una
    expect(consumirFicha(agotada.cubeta, 60, T0 + 1000).permitido).toBe(true);
    // Diez segundos después hay diez, no más
    let cubeta = agotada.cubeta;
    let pasan = 0;
    for (let i = 0; i < 20; i++) {
      const r = consumirFicha(cubeta, 60, T0 + 10_000);
      cubeta = r.cubeta;
      if (r.permitido) pasan++;
    }
    expect(pasan).toBe(10);
  });

  it("no deja pasar el doble del límite en el cambio de minuto", () => {
    // Esta es la razón de usar cubeta y no un contador que se reinicia cada
    // minuto: con contador, 60 peticiones en el segundo 59 y otras 60 en el 61
    // pasarían las 120, que es el doble de lo contratado.
    const primera = gastar(60, 60, T0);
    expect(primera.permitidas).toBe(60);

    let cubeta = primera.cubeta;
    let permitidas = 0;
    for (let i = 0; i < 60; i++) {
      const r = consumirFicha(cubeta, 60, T0 + 2000); // dos segundos después
      cubeta = r.cubeta;
      if (r.permitido) permitidas++;
    }
    // En dos segundos solo se repusieron dos fichas
    expect(permitidas).toBe(2);
  });

  it("nunca acumula más fichas que la capacidad, aunque lleve horas sin usarse", () => {
    const agotada = gastar(60, 60);
    let cubeta = agotada.cubeta;
    let permitidas = 0;
    for (let i = 0; i < 200; i++) {
      const r = consumirFicha(cubeta, 60, T0 + 6 * 60 * 60 * 1000); // seis horas
      cubeta = r.cubeta;
      if (r.permitido) permitidas++;
    }
    expect(permitidas).toBe(60);
  });

  it("una llave nueva empieza con la cubeta llena", () => {
    const r = consumirFicha(undefined, 30, T0);
    expect(r.permitido).toBe(true);
    expect(r.cubeta.fichas).toBe(29);
  });
});
