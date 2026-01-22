/**
 * Servicio para obtener datos meteorológicos de Open-Meteo API
 * API gratuita y open source: https://open-meteo.com/
 */

interface WeatherData {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  temperatureMean: number;
}

/**
 * Obtiene datos meteorológicos históricos para un rango de fechas
 * @param latitude Latitud de la ubicación
 * @param longitude Longitud de la ubicación
 * @param startDate Fecha de inicio (YYYY-MM-DD)
 * @param endDate Fecha de fin (YYYY-MM-DD)
 * @param timezone Zona horaria (ej: "America/Mexico_City")
 */
export async function getWeatherData(
  latitude: string,
  longitude: string,
  startDate: string,
  endDate: string,
  timezone: string = "America/Mexico_City"
): Promise<WeatherData[]> {
  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?` +
      `latitude=${latitude}&` +
      `longitude=${longitude}&` +
      `start_date=${startDate}&` +
      `end_date=${endDate}&` +
      `daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean&` +
      `timezone=${encodeURIComponent(timezone)}`;

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.daily) {
      return [];
    }

    // Convertir respuesta a formato más manejable
    const weatherData: WeatherData[] = [];
    for (let i = 0; i < data.daily.time.length; i++) {
      weatherData.push({
        date: data.daily.time[i],
        temperatureMax: data.daily.temperature_2m_max[i],
        temperatureMin: data.daily.temperature_2m_min[i],
        temperatureMean: data.daily.temperature_2m_mean[i],
      });
    }

    return weatherData;
  } catch (error) {
    console.error('Error fetching weather data:', error);
    throw error;
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
 * @param latitude Latitud de la ubicación
 * @param longitude Longitud de la ubicación
 * @param days Número de días a pronosticar (por defecto 2)
 * @param timezone Zona horaria (ej: "America/Mexico_City")
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

    // Convertir respuesta a formato más manejable
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
    throw error;
  }
}
