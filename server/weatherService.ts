/**
 * Servicio para obtener datos meteorológicos de Open-Meteo API
 */

export interface WeatherData {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  temperatureMean: number;
}

/**
 * Obtiene datos meteorológicos para un rango de fechas
 * Combina forecast API (últimos 16 días) y archive API (datos históricos)
 */
export async function getWeatherData(
  latitude: string,
  longitude: string,
  startDate: string,
  endDate: string,
  timezone: string = "America/Mexico_City"
): Promise<WeatherData[]> {
  try {
    console.log(`[Weather] Obteniendo datos para ${startDate} a ${endDate}`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Forecast API tiene datos de los últimos 16 días + próximos 16 días
    const sixteenDaysAgo = new Date(today);
    sixteenDaysAgo.setDate(sixteenDaysAgo.getDate() - 16);
    
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    let allData: WeatherData[] = [];
    
    // 1. Usar forecast API si el rango incluye fechas recientes (últimos 16 días)
    if (endDateObj >= sixteenDaysAgo) {
      console.log('[Weather] Usando forecast API para datos recientes');
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?` +
        `latitude=${latitude}&` +
        `longitude=${longitude}&` +
        `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
        `past_days=16&` +
        `forecast_days=16&` +
        `timezone=${encodeURIComponent(timezone)}`;
      
      try {
        const forecastResponse = await fetch(forecastUrl);
        if (forecastResponse.ok) {
          const forecastData = await forecastResponse.json();
          if (forecastData.daily) {
            for (let i = 0; i < forecastData.daily.time.length; i++) {
              const date = forecastData.daily.time[i];
              if (date >= startDate && date <= endDate) {
                allData.push({
                  date,
                  temperatureMax: forecastData.daily.temperature_2m_max[i],
                  temperatureMin: forecastData.daily.temperature_2m_min[i],
                  temperatureMean: forecastData.daily.temperature_2m_mean[i],
                });
              }
            }
            console.log(`[Weather] Forecast API retornó ${allData.length} registros`);
          }
        }
      } catch (error) {
        console.error('[Weather] Error en forecast API:', error);
      }
    }
    
    // 2. Usar archive API si el rango incluye fechas antiguas (más de 16 días atrás)
    if (startDateObj < sixteenDaysAgo) {
      console.log('[Weather] Usando archive API para datos históricos');
      const archiveEndDate = endDateObj < sixteenDaysAgo 
        ? endDate 
        : sixteenDaysAgo.toISOString().split('T')[0];
      
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?` +
        `latitude=${latitude}&` +
        `longitude=${longitude}&` +
        `start_date=${startDate}&` +
        `end_date=${archiveEndDate}&` +
        `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
        `timezone=${encodeURIComponent(timezone)}`;
      
      try {
        const archiveResponse = await fetch(archiveUrl);
        if (archiveResponse.ok) {
          const archiveData = await archiveResponse.json();
          if (archiveData.daily) {
            const archiveCount = archiveData.daily.time.length;
            for (let i = 0; i < archiveCount; i++) {
              allData.push({
                date: archiveData.daily.time[i],
                temperatureMax: archiveData.daily.temperature_2m_max[i],
                temperatureMin: archiveData.daily.temperature_2m_min[i],
                temperatureMean: archiveData.daily.temperature_2m_mean[i],
              });
            }
            console.log(`[Weather] Archive API retornó ${archiveCount} registros`);
          }
        }
      } catch (error) {
        console.error('[Weather] Error en archive API:', error);
      }
    }
    
    // 3. Ordenar por fecha y eliminar duplicados
    const uniqueData = new Map<string, WeatherData>();
    allData.forEach(item => {
      uniqueData.set(item.date, item);
    });
    
    const result = Array.from(uniqueData.values()).sort((a, b) => a.date.localeCompare(b.date));
    console.log(`[Weather] Total final: ${result.length} registros únicos`);
    
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
  try {
    const url = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${latitude}&` +
      `longitude=${longitude}&` +
      `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
      `forecast_days=${days}&` +
      `timezone=${encodeURIComponent(timezone)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.daily) {
      return [];
    }
    
    const forecastData: WeatherData[] = [];
    for (let i = 0; i < data.daily.time.length; i++) {
      forecastData.push({
        date: data.daily.time[i],
        temperatureMax: data.daily.temperature_2m_max[i],
        temperatureMin: data.daily.temperature_2m_min[i],
        temperatureMean: data.daily.temperature_2m_mean[i],
      });
    }
    
    return forecastData;
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    return [];
  }
}
