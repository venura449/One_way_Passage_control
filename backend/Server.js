import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Traffic light states
let trafficLights = {
  light1: {
    id: 'light1',
    name: 'Traffic Light 1',
    state: 'red', // 'red', 'yellow', 'green'
    direction: 'inbound', // 'inbound', 'outbound'
    lastUpdated: new Date().toISOString()
  },
  light2: {
    id: 'light2',
    name: 'Traffic Light 2',
    state: 'red',
    direction: 'outbound',
    lastUpdated: new Date().toISOString()
  }
};

// Traffic flow state
let trafficFlow = {
  mode: 'automatic', // 'automatic', 'manual'
  currentDirection: 'inbound', // 'inbound', 'outbound'
  lastChanged: new Date().toISOString()
};

// Vehicle tracking data
let vehicleData = {
  bspeed: 0,
  cspeed: 0,
  mspeed: 0,
  tspeed: 0,
  total_vehicles_counted: 0,
  vehicles_by_type: { car: 0, truck: 0, bus: 0, motorcycle: 0, emergency: 0 },
  car_count: 0,
  truck_count: 0,
  bus_count: 0,
  motorcycle_count: 0,
  emergency_count: 0,
  vehicles_waiting: 0,
  priority_vehicles: 0,
  green_light_duration: 20,
  vehicles_per_minute: 0,
  anomalies: [],
  timestamp: new Date().toISOString()
};

// MQTT Configuration (matching Python script)
const MQTT_BROKER_HOST = process.env.MQTT_BROKER_HOST || "broker.hivemq.com";
const MQTT_BROKER_PORT = process.env.MQTT_BROKER_PORT || 1883;
const MQTT_TOPIC_BASE = "traffic/vehicles";
const MQTT_CLIENT_ID = "traffic_control_backend_001";

// MQTT Client
let mqttClient = null;

// Setup MQTT Subscriber
function setupMQTTSubscriber() {
  try {
    const brokerUrl = `mqtt://${MQTT_BROKER_HOST}:${MQTT_BROKER_PORT}`;
    
    mqttClient = mqtt.connect(brokerUrl, {
      clientId: MQTT_CLIENT_ID,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 30 * 1000,
    });

    mqttClient.on('connect', () => {
      console.log(`[MQTT] ✅ Connected to broker at ${MQTT_BROKER_HOST}:${MQTT_BROKER_PORT}`);
      
      // Subscribe to main topic and all subtopics
      const topics = [
        `${MQTT_TOPIC_BASE}`,           // Main vehicle data
        `${MQTT_TOPIC_BASE}/car`,      // Car count
        `${MQTT_TOPIC_BASE}/truck`,    // Truck count
        `${MQTT_TOPIC_BASE}/bus`,      // Bus count
        `${MQTT_TOPIC_BASE}/motorcycle`, // Motorcycle count
        `${MQTT_TOPIC_BASE}/emergency`,  // Emergency count
        `${MQTT_TOPIC_BASE}/traffic_light`, // Traffic light data
        `${MQTT_TOPIC_BASE}/speeds`,   // Speed data
      ];

      topics.forEach(topic => {
        mqttClient.subscribe(topic, { qos: 1 }, (err) => {
          if (err) {
            console.error(`[MQTT] ❌ Failed to subscribe to ${topic}:`, err);
          } else {
            console.log(`[MQTT] 📡 Subscribed to ${topic}`);
          }
        });
      });
    });

    mqttClient.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Update vehicle data based on topic
        if (topic === MQTT_TOPIC_BASE) {
          // Main vehicle data - update all fields
          vehicleData = {
            ...vehicleData,
            ...data,
            timestamp: new Date().toISOString()
          };
          console.log(`[MQTT] 📊 Updated vehicle data from main topic`);
        } else if (topic === `${MQTT_TOPIC_BASE}/traffic_light`) {
          // Traffic light specific data
          vehicleData = {
            ...vehicleData,
            green_light_duration: data.green_light_duration || vehicleData.green_light_duration,
            vehicles_waiting: data.vehicles_waiting || vehicleData.vehicles_waiting,
            priority_vehicles: data.priority_vehicles || vehicleData.priority_vehicles,
            timestamp: new Date().toISOString()
          };
          console.log(`[MQTT] 🚦 Updated traffic light data`);
        } else if (topic === `${MQTT_TOPIC_BASE}/speeds`) {
          // Speed data
          vehicleData = {
            ...vehicleData,
            bspeed: data.bspeed || vehicleData.bspeed,
            cspeed: data.cspeed || vehicleData.cspeed,
            mspeed: data.mspeed || vehicleData.mspeed,
            tspeed: data.tspeed || vehicleData.tspeed,
            timestamp: new Date().toISOString()
          };
          console.log(`[MQTT] ⚡ Updated speed data`);
        } else {
          // Individual vehicle type counts (car, truck, bus, motorcycle, emergency)
          const vehicleType = topic.split('/').pop();
          if (data.count !== undefined) {
            vehicleData.vehicles_by_type[vehicleType] = data.count;
            vehicleData[`${vehicleType}_count`] = data.count;
            vehicleData.timestamp = new Date().toISOString();
            console.log(`[MQTT] 🚗 Updated ${vehicleType} count: ${data.count}`);
          }
        }
      } catch (error) {
        console.error(`[MQTT] ❌ Error parsing message from ${topic}:`, error);
      }
    });

    mqttClient.on('error', (error) => {
      console.error(`[MQTT] ❌ Error:`, error);
    });

    mqttClient.on('close', () => {
      console.log(`[MQTT] ⚠️ Connection closed`);
    });

    mqttClient.on('reconnect', () => {
      console.log(`[MQTT] 🔄 Reconnecting...`);
    });

    mqttClient.on('offline', () => {
      console.log(`[MQTT] ⚠️ Client went offline`);
    });

  } catch (error) {
    console.error(`[MQTT] ❌ Failed to setup MQTT subscriber:`, error);
  }
}

// Get all traffic light states
app.get('/api/lights', (req, res) => {
  res.json({ lights: trafficLights, trafficFlow, vehicleData });
});

// Get vehicle data
app.get('/api/vehicles', (req, res) => {
  res.json(vehicleData);
});

// Update vehicle data (from Python script)
app.post('/api/vehicles', (req, res) => {
  const data = req.body;
  vehicleData = {
    ...vehicleData,
    ...data,
    timestamp: new Date().toISOString()
  };
  res.json({ success: true, vehicleData });
});

// Get single traffic light state
app.get('/api/lights/:lightId', (req, res) => {
  const { lightId } = req.params;
  if (trafficLights[lightId]) {
    res.json({ light: trafficLights[lightId], trafficFlow });
  } else {
    res.status(404).json({ error: 'Traffic light not found' });
  }
});

// Control traffic light
app.post('/api/lights/:lightId/control', (req, res) => {
  const { lightId } = req.params;
  const { action } = req.body; // 'green', 'red', 'yellow', 'toggle'

  if (!trafficLights[lightId]) {
    return res.status(404).json({ error: 'Traffic light not found' });
  }

  const light = trafficLights[lightId];
  // Get the other light
  const otherLightId = lightId === 'light1' ? 'light2' : 'light1';
  const otherLight = trafficLights[otherLightId];
  
  if (action === 'green') {
    // Transition through yellow first
    light.state = 'yellow';
    light.lastUpdated = new Date().toISOString();
    
    // If other light is green, transition it to red
    if (otherLight.state === 'green') {
      otherLight.state = 'yellow';
      otherLight.lastUpdated = new Date().toISOString();
    }
    
    setTimeout(() => {
      light.state = 'green';
      light.lastUpdated = new Date().toISOString();
      
      // Set other light to red if it's not already red
      if (otherLight.state !== 'red') {
        otherLight.state = 'red';
        otherLight.lastUpdated = new Date().toISOString();
      }
    }, 1000);
  } else if (action === 'red') {
    // Transition through yellow first
    light.state = 'yellow';
    light.lastUpdated = new Date().toISOString();
    setTimeout(() => {
      light.state = 'red';
      light.lastUpdated = new Date().toISOString();
    }, 1000);
  } else if (action === 'yellow') {
    light.state = 'yellow';
    light.lastUpdated = new Date().toISOString();
  } else if (action === 'toggle') {
    if (light.state === 'green') {
      light.state = 'yellow';
      light.lastUpdated = new Date().toISOString();
      setTimeout(() => {
        light.state = 'red';
        light.lastUpdated = new Date().toISOString();
      }, 1000);
    } else if (light.state === 'red') {
      light.state = 'yellow';
      light.lastUpdated = new Date().toISOString();
      
      // If other light is green, transition it to red
      if (otherLight.state === 'green') {
        otherLight.state = 'yellow';
        otherLight.lastUpdated = new Date().toISOString();
      }
      
      setTimeout(() => {
        light.state = 'green';
        light.lastUpdated = new Date().toISOString();
        
        // Set other light to red if it's not already red
        if (otherLight.state !== 'red') {
          otherLight.state = 'red';
          otherLight.lastUpdated = new Date().toISOString();
        }
      }, 1000);
    } else {
      // If yellow, go to red
      light.state = 'red';
      light.lastUpdated = new Date().toISOString();
    }
  }

  res.json({ lights: trafficLights, trafficFlow });
});

// Set traffic flow direction
app.post('/api/traffic-flow', (req, res) => {
  const { mode, direction } = req.body;

  if (mode) {
    trafficFlow.mode = mode;
  }

  if (direction) {
    trafficFlow.currentDirection = direction;
    trafficFlow.lastChanged = new Date().toISOString();
    
    // Both traffic lights turn green simultaneously when direction is set
    // Direction controls traffic flow, not which light is green
    trafficLights.light1.state = 'yellow';
    trafficLights.light2.state = 'yellow';
    trafficLights.light1.lastUpdated = new Date().toISOString();
    trafficLights.light2.lastUpdated = new Date().toISOString();
    setTimeout(() => {
      trafficLights.light1.state = 'green';
      trafficLights.light2.state = 'green';
      trafficLights.light1.lastUpdated = new Date().toISOString();
      trafficLights.light2.lastUpdated = new Date().toISOString();
    }, 1000);
  }

  res.json({ lights: trafficLights, trafficFlow });
});

// Emergency stop - set all lights to red
app.post('/api/emergency-stop', (req, res) => {
  trafficLights.light1.state = 'yellow';
  trafficLights.light2.state = 'yellow';
  trafficLights.light1.lastUpdated = new Date().toISOString();
  trafficLights.light2.lastUpdated = new Date().toISOString();
  
  setTimeout(() => {
    trafficLights.light1.state = 'red';
    trafficLights.light2.state = 'red';
    trafficLights.light1.lastUpdated = new Date().toISOString();
    trafficLights.light2.lastUpdated = new Date().toISOString();
  }, 1000);

  res.json({ lights: trafficLights, trafficFlow });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚦 Traffic Control Server running on http://localhost:${PORT}`);
  console.log(`📡 Setting up MQTT subscriber...`);
  setupMQTTSubscriber();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  if (mqttClient) {
    mqttClient.end();
    console.log('[MQTT] Disconnected');
  }
  process.exit(0);
});

