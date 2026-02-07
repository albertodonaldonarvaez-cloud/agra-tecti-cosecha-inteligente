/**
 * Servicio para obtener datos meteorológicos de Open-Meteo API
 * Optimizado con:
 * - Promise.all para peticiones paralelas (forecast + archive)
 * - Caché en memoria con TTL para reducir llamadas a la API
 * - Timeout en peticiones para evitar bloqueos
 * - Manejo robusto de errores parciales
 */

// ===== CACHÉ EN MEMORIA =====
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  // Limpiar entradas expiradas periódicamente (max 100 entradas)
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > v.ttl) cache.delete(k);
    }
  }
}

// ===== FETCH CON TIMEOUT =====
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ===== INTERFACES =====
export interface WeatherData {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  temperatureMean: number;
}

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  cloudCover: number;
  windSpeed: number;
  weatherCode: number;
  isDay: boolean;
  condition: "sunny" | "cloudy" | "rainy" | "stormy" | "clear";
  conditionText: string;
}

export interface ExtendedForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  temperatureMean: number;
  precipitation: number;
  precipitationProbability: number;
  cloudCover: number;
  windSpeed: number;
  weatherCode: number;
  condition: "sunny" | "cloudy" | "rainy" | "stormy" | "clear";
  conditionText: string;
}

// ===== UTILIDADES =====
function weatherCodeToCondition(code: number, isDay: boolean): { condition: CurrentWeather["condition"]; text: string } {
  if (code === 0) return { condition: isDay ? "sunny" : "clear", text: isDay ? "Despejado" : "Noche despejada" };
  if (code === 1) return { condition: isDay ? "sunny" : "clear", text: "Mayormente despejado" };
  if (code === 2) return { condition: "cloudy", text: "Parcialmente nublado" };
  if (code === 3) return { condition: "cloudy", text: "Nublado" };
  if (code >= 45 && code <= 48) return { condition: "cloudy", text: "Neblina" };
  if (code >= 51 && code <= 55) return { condition: "rainy", text: "Llovizna" };
  if (code >= 56 && code <= 57) return { condition: "rainy", text: "Llovizna helada" };
  if (code >= 61 && code <= 65) return { condition: "rainy", text: code === 61 ? "Lluvia ligera" : code === 63 ? "Lluvia moderada" : "Lluvia fuerte" };
  if (code >= 66 && code <= 67) return { condition: "rainy", text: "Lluvia helada" };
  if (code >= 71 && code <= 77) return { condition: "cloudy", text: "Nieve" };
  if (code >= 80 && code <= 82) return { condition: "rainy", text: "Chubascos" };
  if (code >= 85 && code <= 86) return { condition: "cloudy", text: "Chubascos de nieve" };
  if (code >= 95 && code <= 99) return { condition: "stormy", text: "Tormenta eléctrica" };
  return { condition: isDay ? "sunny" : "clear", text: "Desconocido" };
}

// ===== FUNCIONES PRINCIPALES =====

/**
 * Obtiene datos meteorológicos para un rango de fechas
 * OPTIMIZADO: Usa Promise.all para ejecutar forecast + archive en paralelo
 */
export async function getWeatherData(
  latitude: string,
  longitude: string,
  startDate: string,
  endDate: string,
  timezone: string = "America/Mexico_City"
): Promise<WeatherData[]> {
  const cacheKey = `weather:${latitude}:${longitude}:${startDate}:${endDate}`;
  const cached = getCached<WeatherData[]>(cacheKey);
  if (cached) {
    console.log(`[Weather] Cache hit para ${startDate} a ${endDate} (${cached.length} registros)`);
    return cached;
  }

  try {
    console.log(`[Weather] Obteniendo datos para ${startDate} a ${endDate}`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sixteenDaysAgo = new Date(today);
    sixteenDaysAgo.setDate(sixteenDaysAgo.getDate() - 16);
    
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // Preparar peticiones en paralelo
    const promises: Promise<WeatherData[]>[] = [];
    
    // 1. Forecast API (últimos 16 días + próximos 16 días)
    if (endDateObj >= sixteenDaysAgo) {
      promises.push(
        (async (): Promise<WeatherData[]> => {
          try {
            const forecastUrl = `https://api.open-meteo.com/v1/forecast?` +
              `latitude=${latitude}&longitude=${longitude}&` +
              `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
              `past_days=16&forecast_days=16&` +
              `timezone=${encodeURIComponent(timezone)}`;
            
            const response = await fetchWithTimeout(forecastUrl, 8000);
            if (!response.ok) return [];
            
            const data = await response.json();
            if (!data.daily) return [];
            
            const results: WeatherData[] = [];
            for (let i = 0; i < data.daily.time.length; i++) {
              const date = data.daily.time[i];
              if (date >= startDate && date <= endDate) {
                results.push({
                  date,
                  temperatureMax: data.daily.temperature_2m_max[i],
                  temperatureMin: data.daily.temperature_2m_min[i],
                  temperatureMean: data.daily.temperature_2m_mean[i],
                });
              }
            }
            console.log(`[Weather] Forecast API: ${results.length} registros`);
            return results;
          } catch (error) {
            console.error('[Weather] Error en forecast API:', error);
            return [];
          }
        })()
      );
    }
    
    // 2. Archive API (datos históricos más de 16 días atrás)
    if (startDateObj < sixteenDaysAgo) {
      promises.push(
        (async (): Promise<WeatherData[]> => {
          try {
            const archiveEndDate = endDateObj < sixteenDaysAgo 
              ? endDate 
              : sixteenDaysAgo.toISOString().split('T')[0];
            
            const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?` +
              `latitude=${latitude}&longitude=${longitude}&` +
              `start_date=${startDate}&end_date=${archiveEndDate}&` +
              `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
              `timezone=${encodeURIComponent(timezone)}`;
            
            const response = await fetchWithTimeout(archiveUrl, 15000);
            if (!response.ok) return [];
            
            const data = await response.json();
            if (!data.daily) return [];
            
            const results: WeatherData[] = [];
            for (let i = 0; i < data.daily.time.length; i++) {
              results.push({
                date: data.daily.time[i],
                temperatureMax: data.daily.temperature_2m_max[i],
                temperatureMin: data.daily.temperature_2m_min[i],
                temperatureMean: data.daily.temperature_2m_mean[i],
              });
            }
            console.log(`[Weather] Archive API: ${results.length} registros`);
            return results;
          } catch (error) {
            console.error('[Weather] Error en archive API:', error);
            return [];
          }
        })()
      );
    }
    
    // Ejecutar en PARALELO
    const allResults = await Promise.all(promises);
    const allData = allResults.flat();
    
    // Deduplicar y ordenar
    const uniqueData = new Map<string, WeatherData>();
    allData.forEach(item => uniqueData.set(item.date, item));
    
    const result = Array.from(uniqueData.values()).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`[Weather] Total: ${result.length} registros únicos (paralelo)`);
    
    // Cachear por 10 minutos
    setCache(cacheKey, result, 10 * 60 * 1000);
    
    return result;
  } catch (error) {
    console.error('[Weather] Error general:', error);
    return [];
  }
}

/**
 * Obtiene datos meteorológicos para una fecha específica
 */
export async function getWeatherForDate(
  latitude: string,
  longitude: string,
  date: string,
  timezone: string = "America/Mexico_City"
): Promise<WeatherData | null> {
  const data = await getWeatherData(latitude, longitude, date, date, timezone);
  return data.length > 0 ? data[0] : null;
}

/**
 * Obtiene pronóstico del tiempo para los próximos días
 */
export async function getWeatherForecast(
  latitude: string,
  longitude: string,
  days: number = 2,
  timezone: string = "America/Mexico_City"
): Promise<WeatherData[]> {
  const cacheKey = `forecast:${latitude}:${longitude}:${days}`;
  const cached = getCached<WeatherData[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${latitude}&longitude=${longitude}&` +
      `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
      `forecast_days=${days}&timezone=${encodeURIComponent(timezone)}`;
    
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) throw new Error(`Open-Meteo API error: ${response.statusText}`);
    
    const data = await response.json();
    if (!data.daily) return [];
    
    const forecastData: WeatherData[] = [];
    for (let i = 0; i < data.daily.time.length; i++) {
      forecastData.push({
        date: data.daily.time[i],
        temperatureMax: data.daily.temperature_2m_max[i],
        temperatureMin: data.daily.temperature_2m_min[i],
        temperatureMean: data.daily.temperature_2m_mean[i],
      });
    }
    
    setCache(cacheKey, forecastData, 5 * 60 * 1000);
    return forecastData;
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    return [];
  }
}

/**
 * Obtiene el clima actual
 * OPTIMIZADO: Caché de 2 minutos
 */
export async function getCurrentWeather(
  latitude: string,
  longitude: string,
  timezone: string = "America/Mexico_City"
): Promise<CurrentWeather | null> {
  const cacheKey = `current:${latitude}:${longitude}`;
  const cached = getCached<CurrentWeather>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${latitude}&longitude=${longitude}&` +
      `current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m,weather_code,is_day&` +
      `timezone=${encodeURIComponent(timezone)}`;
    
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) throw new Error(`Open-Meteo API error: ${response.statusText}`);
    
    const data = await response.json();
    if (!data.current) return null;
    
    const isDay = data.current.is_day === 1;
    const { condition, text } = weatherCodeToCondition(data.current.weather_code, isDay);
    
    const result: CurrentWeather = {
      temperature: data.current.temperature_2m,
      apparentTemperature: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      cloudCover: data.current.cloud_cover,
      windSpeed: data.current.wind_speed_10m,
      weatherCode: data.current.weather_code,
      isDay,
      condition,
      conditionText: text,
    };
    
    setCache(cacheKey, result, 2 * 60 * 1000);
    return result;
  } catch (error) {
    console.error('Error fetching current weather:', error);
    return null;
  }
}

/**
 * Obtiene pronóstico extendido con más detalles
 * OPTIMIZADO: Caché de 10 minutos
 */
export async function getExtendedForecast(
  latitude: string,
  longitude: string,
  days: number = 7,
  timezone: string = "America/Mexico_City"
): Promise<ExtendedForecast[]> {
  const cacheKey = `extForecast:${latitude}:${longitude}:${days}`;
  const cached = getCached<ExtendedForecast[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${latitude}&longitude=${longitude}&` +
      `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,weather_code&` +
      `forecast_days=${days}&timezone=${encodeURIComponent(timezone)}`;
    
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) throw new Error(`Open-Meteo API error: ${response.statusText}`);
    
    const data = await response.json();
    if (!data.daily) return [];
    
    const forecast: ExtendedForecast[] = [];
    for (let i = 0; i < data.daily.time.length; i++) {
      const { condition, text } = weatherCodeToCondition(data.daily.weather_code[i], true);
      forecast.push({
        date: data.daily.time[i],
        temperatureMax: data.daily.temperature_2m_max[i],
        temperatureMin: data.daily.temperature_2m_min[i],
        temperatureMean: data.daily.temperature_2m_mean[i],
        precipitation: data.daily.precipitation_sum[i],
        precipitationProbability: data.daily.precipitation_probability_max[i],
        cloudCover: data.daily.cloud_cover_mean[i],
        windSpeed: data.daily.wind_speed_10m_max[i],
        weatherCode: data.daily.weather_code[i],
        condition,
        conditionText: text,
      });
    }
    
    setCache(cacheKey, forecast, 10 * 60 * 1000);
    return forecast;
  } catch (error) {
    console.error('Error fetching extended forecast:', error);
    return [];
  }
}

/**
 * Obtiene datos históricos de clima con detalles adicionales
 * OPTIMIZADO: Promise.all para forecast + archive en paralelo, caché de 15 minutos
 */
export async function getHistoricalWeatherDetailed(
  latitude: string,
  longitude: string,
  startDate: string,
  endDate: string,
  timezone: string = "America/Mexico_City"
): Promise<ExtendedForecast[]> {
  const cacheKey = `historical:${latitude}:${longitude}:${startDate}:${endDate}`;
  const cached = getCached<ExtendedForecast[]>(cacheKey);
  if (cached) {
    console.log(`[Weather] Cache hit historical (${cached.length} registros)`);
    return cached;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    const dailyParams = `temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,cloud_cover_mean,wind_speed_10m_max,weather_code`;
    
    // Preparar peticiones en paralelo
    const promises: Promise<ExtendedForecast[]>[] = [];
    
    // 1. Forecast API para datos recientes (últimos 16 días)
    const sixteenDaysAgo = new Date(today);
    sixteenDaysAgo.setDate(sixteenDaysAgo.getDate() - 16);
    
    if (endDateObj >= sixteenDaysAgo) {
      promises.push(
        (async (): Promise<ExtendedForecast[]> => {
          try {
            const url = `https://api.open-meteo.com/v1/forecast?` +
              `latitude=${latitude}&longitude=${longitude}&` +
              `daily=${dailyParams}&past_days=16&forecast_days=1&` +
              `timezone=${encodeURIComponent(timezone)}`;
            
            const response = await fetchWithTimeout(url, 8000);
            if (!response.ok) return [];
            
            const data = await response.json();
            if (!data.daily) return [];
            
            const results: ExtendedForecast[] = [];
            for (let i = 0; i < data.daily.time.length; i++) {
              const date = data.daily.time[i];
              if (date >= startDate && date <= endDate) {
                const { condition, text } = weatherCodeToCondition(data.daily.weather_code[i], true);
                results.push({
                  date,
                  temperatureMax: data.daily.temperature_2m_max[i],
                  temperatureMin: data.daily.temperature_2m_min[i],
                  temperatureMean: data.daily.temperature_2m_mean[i],
                  precipitation: data.daily.precipitation_sum[i] ?? 0,
                  precipitationProbability: 0,
                  cloudCover: data.daily.cloud_cover_mean[i] ?? 0,
                  windSpeed: data.daily.wind_speed_10m_max[i] ?? 0,
                  weatherCode: data.daily.weather_code[i],
                  condition,
                  conditionText: text,
                });
              }
            }
            console.log(`[Weather] Historical forecast: ${results.length} registros`);
            return results;
          } catch (error) {
            console.error('[Weather] Error en historical forecast:', error);
            return [];
          }
        })()
      );
    }
    
    // 2. Archive API para datos más antiguos
    if (startDateObj < sixteenDaysAgo) {
      promises.push(
        (async (): Promise<ExtendedForecast[]> => {
          try {
            const archiveEndDate = endDateObj < sixteenDaysAgo 
              ? endDate 
              : sixteenDaysAgo.toISOString().split('T')[0];
            
            const url = `https://archive-api.open-meteo.com/v1/archive?` +
              `latitude=${latitude}&longitude=${longitude}&` +
              `start_date=${startDate}&end_date=${archiveEndDate}&` +
              `daily=${dailyParams}&` +
              `timezone=${encodeURIComponent(timezone)}`;
            
            const response = await fetchWithTimeout(url, 15000);
            if (!response.ok) return [];
            
            const data = await response.json();
            if (!data.daily) return [];
            
            const results: ExtendedForecast[] = [];
            for (let i = 0; i < data.daily.time.length; i++) {
              const { condition, text } = weatherCodeToCondition(data.daily.weather_code[i], true);
              results.push({
                date: data.daily.time[i],
                temperatureMax: data.daily.temperature_2m_max[i],
                temperatureMin: data.daily.temperature_2m_min[i],
                temperatureMean: data.daily.temperature_2m_mean[i],
                precipitation: data.daily.precipitation_sum[i] ?? 0,
                precipitationProbability: 0,
                cloudCover: data.daily.cloud_cover_mean[i] ?? 0,
                windSpeed: data.daily.wind_speed_10m_max[i] ?? 0,
                weatherCode: data.daily.weather_code[i],
                condition,
                conditionText: text,
              });
            }
            console.log(`[Weather] Historical archive: ${results.length} registros`);
            return results;
          } catch (error) {
            console.error('[Weather] Error en historical archive:', error);
            return [];
          }
        })()
      );
    }
    
    // Ejecutar en PARALELO
    const allResults = await Promise.all(promises);
    const allData = allResults.flat();
    
    // Deduplicar (forecast tiene prioridad sobre archive)
    const uniqueData = new Map<string, ExtendedForecast>();
    // Primero archive, luego forecast (forecast sobreescribe)
    allData.sort((a, b) => {
      // Archive primero para que forecast lo sobreescriba
      if (a.precipitationProbability === 0 && b.precipitationProbability !== 0) return -1;
      return 0;
    });
    allData.forEach(item => uniqueData.set(item.date, item));
    
    const result = Array.from(uniqueData.values()).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`[Weather] Historical total: ${result.length} registros únicos (paralelo)`);
    
    // Cachear por 15 minutos
    setCache(cacheKey, result, 15 * 60 * 1000);
    
    return result;
  } catch (error) {
    console.error('Error fetching historical weather:', error);
    return [];
  }
}
