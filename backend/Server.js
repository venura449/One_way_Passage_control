import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

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

// Firebase Firestore configuration (used by ESP32 controller)
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'wastemanagement-fc678';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyC26ndJ968-9OL2R9Vw2d-5JbkGn0Ov7ec';
const FIREBASE_GATE_DOC_PATH = process.env.FIREBASE_GATE_DOC_PATH || 'Traffic/Trafficdata';
const FIREBASE_DOCUMENT_NAME = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${FIREBASE_GATE_DOC_PATH}`;
const FIREBASE_DOC_URL = `https://firestore.googleapis.com/v1/${FIREBASE_DOCUMENT_NAME}`;
const FIREBASE_SYNC_INTERVAL = Number(process.env.FIREBASE_SYNC_INTERVAL) || 5000;
const firebaseIntegrationEnabled = Boolean(FIREBASE_PROJECT_ID && FIREBASE_API_KEY);
let firebaseSyncTimer = null;
let firebaseGateMirror = {
  light1: false,
  light2: false,
};

// Server Sent Events (SSE) state streaming
const sseClients = new Set();
const SSE_HEARTBEAT_INTERVAL = 25000;

function createSSEPayload(reason = 'update') {
  return JSON.stringify({
    type: 'traffic-state',
    reason,
    timestamp: Date.now(),
    lights: trafficLights,
    trafficFlow,
    vehicleData,
  });
}

function broadcastStateUpdate(reason = 'update') {
  if (!sseClients.size) {
    return;
  }
  const payload = createSSEPayload(reason);
  sseClients.forEach((client) => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (error) {
      console.warn(`[SSE] Removing client ${client.id} due to write error`);
      clearInterval(client.heartbeatTimer);
      sseClients.delete(client);
    }
  });
}

function registerSSEClient(res) {
  const client = {
    id: randomUUID(),
    res,
    heartbeatTimer: setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
      } catch {
        clearInterval(client.heartbeatTimer);
        sseClients.delete(client);
      }
    }, SSE_HEARTBEAT_INTERVAL),
  };
  sseClients.add(client);
  console.log(`[SSE] Client ${client.id} connected (${sseClients.size} total)`);
  return client;
}

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
          broadcastStateUpdate('mqtt:vehicle-data');
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
          broadcastStateUpdate('mqtt:traffic-light');
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
          broadcastStateUpdate('mqtt:speeds');
        } else {
          // Individual vehicle type counts (car, truck, bus, motorcycle, emergency)
          const vehicleType = topic.split('/').pop();
          if (data.count !== undefined) {
            vehicleData.vehicles_by_type[vehicleType] = data.count;
            vehicleData[`${vehicleType}_count`] = data.count;
            vehicleData.timestamp = new Date().toISOString();
            console.log(`[MQTT] 🚗 Updated ${vehicleType} count: ${data.count}`);
            broadcastStateUpdate(`mqtt:${vehicleType}-count`);
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

function gateFieldName(gateKey) {
  if (gateKey === 'gate1' || gateKey === 'light1') return 'gate01';
  if (gateKey === 'gate2' || gateKey === 'light2') return 'gate02';
  return gateKey;
}

function lightIdToGateKey(lightId) {
  if (lightId === 'gate1' || lightId === 'light1') return 'gate1';
  if (lightId === 'gate2' || lightId === 'light2') return 'gate2';
  return null;
}

function gateKeyToLightId(gateKey) {
  if (gateKey === 'gate1' || gateKey === 'light1') return 'light1';
  if (gateKey === 'gate2' || gateKey === 'light2') return 'light2';
  return null;
}

function booleanToLightState(value) {
  return value ? 'green' : 'red';
}

async function fetchGateStatesFromFirebase() {
  if (!firebaseIntegrationEnabled) return null;
  try {
    const res = await fetch(`${FIREBASE_DOC_URL}?key=${FIREBASE_API_KEY}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const fields = data.fields || {};
    return {
      light1: Boolean(fields.gate01?.booleanValue),
      light2: Boolean(fields.gate02?.booleanValue),
    };
  } catch (error) {
    console.error('[Firebase] ❌ Failed to fetch gate states:', error.message);
    return null;
  }
}

async function updateFirebaseGateState(lightId, isGreen) {
  if (!firebaseIntegrationEnabled) return;
  const gateKey = lightIdToGateKey(lightId);
  if (!gateKey) return;
  const fieldName = gateFieldName(gateKey);
  const url = `${FIREBASE_DOC_URL}?key=${FIREBASE_API_KEY}&updateMask.fieldPaths=${fieldName}`;
  const payload = {
    fields: {
      [fieldName]: {
        booleanValue: !!isGreen,
      },
    },
  };
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} - ${errText}`);
    }
    firebaseGateMirror[gateKeyToLightId(gateKey) ?? gateKey] = !!isGreen;
    console.log(`[Firebase] 🔄 Updated ${gateKey} (${lightId}) to ${isGreen ? 'green' : 'red'}`);
  } catch (error) {
    console.error(`[Firebase] ❌ Failed to update ${gateKey} (${lightId}):`, error.message);
  }
}

function applyFirebaseGateStates(firebaseStates, origin = 'firebase') {
  if (!firebaseStates) return;
  let stateChanged = false;
  Object.entries(firebaseStates).forEach(([key, boolValue]) => {
    const lightId = gateKeyToLightId(key) || key;
    if (!trafficLights[lightId]) return;
    firebaseGateMirror[lightId] = boolValue;
    const desiredState = booleanToLightState(boolValue);
    if (trafficLights[lightId].state !== desiredState) {
      trafficLights[lightId].state = desiredState;
      trafficLights[lightId].lastUpdated = new Date().toISOString();
      console.log(`[Firebase] ↔ ${origin}: ${lightId} set to ${desiredState}`);
      stateChanged = true;
    }
  });
  if (stateChanged) {
    broadcastStateUpdate(`firebase:${origin}`);
  }
}

async function syncGatesFromFirebase(reason = 'poll') {
  if (!firebaseIntegrationEnabled) return;
  const firebaseStates = await fetchGateStatesFromFirebase();
  if (firebaseStates) {
    applyFirebaseGateStates(firebaseStates, reason);
  }
}

function startFirebaseSyncLoop() {
  if (!firebaseIntegrationEnabled) {
    console.log('[Firebase] Skipping Firestore sync (API key or project ID missing)');
    return;
  }
  console.log('[Firebase] 🔄 Syncing traffic light states from Firestore...');
  syncGatesFromFirebase('initial');
  firebaseSyncTimer = setInterval(() => syncGatesFromFirebase('interval'), FIREBASE_SYNC_INTERVAL);
}

// Get all traffic light states
app.get('/api/lights', (req, res) => {
  res.json({ lights: trafficLights, trafficFlow, vehicleData });
});

// Realtime updates stream
app.get('/api/lights/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();
  const client = registerSSEClient(res);
  res.write(`data: ${createSSEPayload('initial')}\n\n`);
  req.on('close', () => {
    clearInterval(client.heartbeatTimer);
    sseClients.delete(client);
    console.log(`[SSE] Client ${client.id} disconnected (${sseClients.size} total)`);
  });
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
  broadcastStateUpdate('vehicles:update');
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
      updateFirebaseGateState(lightId, true);
      updateFirebaseGateState(otherLightId, false);
      broadcastStateUpdate(`control:${lightId}:green`);
    }, 1000);
    broadcastStateUpdate(`control:${lightId}:yellow`);
  } else if (action === 'red') {
    // Transition through yellow first
    light.state = 'yellow';
    light.lastUpdated = new Date().toISOString();
    setTimeout(() => {
      light.state = 'red';
      light.lastUpdated = new Date().toISOString();
      updateFirebaseGateState(lightId, false);
      broadcastStateUpdate(`control:${lightId}:red`);
    }, 1000);
    broadcastStateUpdate(`control:${lightId}:yellow`);
  } else if (action === 'yellow') {
    light.state = 'yellow';
    light.lastUpdated = new Date().toISOString();
    broadcastStateUpdate(`control:${lightId}:yellow`);
  } else if (action === 'toggle') {
    if (light.state === 'green') {
      light.state = 'yellow';
      light.lastUpdated = new Date().toISOString();
      setTimeout(() => {
        light.state = 'red';
        light.lastUpdated = new Date().toISOString();
        updateFirebaseGateState(lightId, false);
        broadcastStateUpdate(`control:${lightId}:red`);
      }, 1000);
      broadcastStateUpdate(`control:${lightId}:yellow`);
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
        updateFirebaseGateState(lightId, true);
        updateFirebaseGateState(otherLightId, false);
        broadcastStateUpdate(`control:${lightId}:green`);
      }, 1000);
      broadcastStateUpdate(`control:${lightId}:yellow`);
    } else {
      // If yellow, go to red
      light.state = 'red';
      light.lastUpdated = new Date().toISOString();
      updateFirebaseGateState(lightId, false);
      broadcastStateUpdate(`control:${lightId}:red`);
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
      updateFirebaseGateState('light1', true);
      updateFirebaseGateState('light2', true);
      broadcastStateUpdate(`traffic-flow:${direction}`);
    }, 1000);
    broadcastStateUpdate('traffic-flow:yellow-phase');
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
    updateFirebaseGateState('light1', false);
    updateFirebaseGateState('light2', false);
    broadcastStateUpdate('emergency-stop:red');
  }, 1000);

  broadcastStateUpdate('emergency-stop:yellow');
  res.json({ lights: trafficLights, trafficFlow });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚦 Traffic Control Server running on http://localhost:${PORT}`);
  console.log(`📡 Setting up MQTT subscriber...`);
  setupMQTTSubscriber();
  startFirebaseSyncLoop();
  broadcastStateUpdate('server-start');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down gracefully...');
  if (mqttClient) {
    mqttClient.end();
    console.log('[MQTT] Disconnected');
  }
  if (firebaseSyncTimer) {
    clearInterval(firebaseSyncTimer);
  }
  process.exit(0);
});

