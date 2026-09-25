export async function fetchCurrentWeather(): Promise<string> {
  try {
    // 1. Obtener SSID de la red actual desde el backend local de Vite
    let ssid = "Desconocida";
    try {
      const wifiRes = await fetch('/api/wifi');
      if (wifiRes.ok) {
        const wifiData = await wifiRes.json();
        ssid = wifiData.ssid || "Desconocida";
      }
    } catch (e) {
      console.warn("No se pudo obtener el SSID del WiFi", e);
    }

    // 2. Intentar obtener ubicación GPS precisa nativa de Windows
    let lat = null;
    let lon = null;
    let city = "Desconocida";
    let country = "Ubicación";
    let ip = "N/A";
    let locationSource = "Nativa (Windows GPS)";

    try {
      const locRes = await fetch('/api/location');
      if (locRes.ok) {
        const locData = await locRes.json();
        if (locData.lat && locData.lon) {
          lat = locData.lat;
          lon = locData.lon;
          // Reverse geocoding para obtener la ciudad con Open-Meteo
          const reverseRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${lat},${lon}&count=1&format=json`);
          // Nota: El reverse geocoding de open-meteo busca por nombre, no por coords.
          // Es mejor solo usar las coordenadas para el clima.
        }
      }
    } catch (e) {
      console.warn("No se pudo obtener GPS nativo", e);
    }

    // 3. Si no hay GPS nativo, usar IP dinámica como respaldo (ipwho.is es robusto)
    if (!lat || !lon) {
      const ipResponse = await fetch('https://ipwho.is/');
      if (!ipResponse.ok) {
        return `Red actual: ${ssid}. No se pudo obtener la ubicación (GPS nativo devolvió Unknown, revisar Privacidad de Ubicación en Windows).`;
      }
      
      const ipData = await ipResponse.json();
      if (!ipData.success) {
         return `Red actual: ${ssid}. Datos de ubicación por IP incompletos.`;
      }

      lat = ipData.latitude;
      lon = ipData.longitude;
      city = ipData.city;
      country = ipData.country;
      ip = ipData.ip;
      locationSource = "Aproximada por IP";
    }

    // 4. Obtenemos el clima usando las coordenadas
    const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`);
    
    let weatherString = `Ubicación detectada (${city !== "Desconocida" ? city : lat.toFixed(2)+","+lon.toFixed(2)})`;
    
    if (weatherResponse.ok) {
      const weatherData = await weatherResponse.json();
      if (weatherData && weatherData.current_weather) {
        const weather = weatherData.current_weather;
        weatherString = `Clima actual en coordenadas ${lat.toFixed(4)}, ${lon.toFixed(4)}: Temperatura ${weather.temperature}°C, Viento ${weather.windspeed} km/h.`;
      }
    }

    // Retornamos TODO el contexto ambiental
    return `${weatherString} [Fuente GPS: ${locationSource} -> SSID: "${ssid}", IP: ${ip}]`;

  } catch (error) {
    console.error("Error al obtener clima/ubicación:", error);
    return "Error de red al conectar con servicios de clima/ubicación.";
  }
}

