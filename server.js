import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static('public'));
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let config = {
  city: 'Dhaka',
  country: 'Bangladesh',
  lat: 23.8103,
  lon: 90.4125,
  startLevel: 80,
  stopLevel: 20,
  mode: 'auto', 
  manualState: false
};

let latestSensorData = 0;
let motorActive = false;

app.post('/api/esp', (req, res) => {
  latestSensorData = req.body.level;
  motorActive = req.body.motorActive;
  
  io.emit('dashboardUpdate', { 
    sensorLevel: latestSensorData,
    motorActive: motorActive
  });

  res.json({
    mode: config.mode,
    manualState: config.manualState,
    startLevel: config.startLevel,
    stopLevel: config.stopLevel
  });
});

async function fetchEnvironmentalData() {
  const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${config.lat}&longitude=${config.lon}&current_weather=true`);
  const floodRes = await axios.get(`https://flood-api.open-meteo.com/v1/flood?latitude=${config.lat}&longitude=${config.lon}&daily=river_discharge`);
  
  return {
    temperature: weatherRes.data.current_weather.temperature,
    windspeed: weatherRes.data.current_weather.windspeed,
    riverDischarge: floodRes.data.daily.river_discharge[0]
  };
}

io.on('connection', (socket) => {
  socket.emit('configUpdate', config);

  socket.on('updateConfig', async (newConfig) => {
    if (newConfig.city !== config.city) {
      try {
        const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${newConfig.city}&count=1`);
        if (geoRes.data.results && geoRes.data.results.length > 0) {
          newConfig.lat = geoRes.data.results[0].latitude;
          newConfig.lon = geoRes.data.results[0].longitude;
        }
      } catch (error) {
        console.error("Geocoding failed.");
      }
    }
    
    config = { ...config, ...newConfig };
    io.emit('configUpdate', config);
  });

  socket.on('requestAnalysis', async () => {
    try {
      const env = await fetchEnvironmentalData();
      const prompt = `Act as a professional flood management system. 
      Location: ${config.city}, ${config.country}.
      Temp: ${env.temperature}C, Wind: ${env.windspeed}km/h. 
      River Discharge: ${env.riverDischarge} m3/s. 
      Local Water Tank Level: ${latestSensorData}%. 
      Pump Status: ${motorActive ? 'Running' : 'Stopped'}.
      Provide a brief, technical assessment of the flood risk and system status. Limit to 3 sentences. Do not use emojis.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      socket.emit('analysisResult', { text: response.text, env: env });
    } catch (error) {
      socket.emit('analysisResult', { text: 'API analysis request failed.', env: null });
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server executing on port ${PORT}`);
});