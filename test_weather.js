async function testAPI() {
  try {
    const ipResponse = await fetch('https://ipapi.co/json/');
    const ipData = await ipResponse.json();
    console.log("IP Data:", ipData);
    
    if (ipData.latitude) {
      const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${ipData.latitude}&longitude=${ipData.longitude}&current_weather=true&timezone=auto`);
      const weatherData = await weatherResponse.json();
      console.log("Weather Data:", weatherData);
    }
  } catch (e) {
    console.error(e);
  }
}
testAPI();
