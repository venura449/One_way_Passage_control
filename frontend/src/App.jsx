import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:3001/api';

function App() {
  const [lights, setLights] = useState({
    light1: { id: 'light1', name: 'Traffic Light 1', state: 'red', direction: 'inbound' },
    light2: { id: 'light2', name: 'Traffic Light 2', state: 'red', direction: 'outbound' }
  });
  const [trafficFlow, setTrafficFlow] = useState({
    mode: 'automatic',
    currentDirection: 'inbound'
  });
  const [vehicleData, setVehicleData] = useState({
    vehicles_waiting: 0,
    vehicles_by_type: { car: 0, truck: 0, bus: 0, motorcycle: 0, emergency: 0 },
    car_count: 0,
    truck_count: 0,
    bus_count: 0,
    motorcycle_count: 0,
    emergency_count: 0,
    priority_vehicles: 0,
    green_light_duration: 20,
    vehicles_per_minute: 0,
    anomalies: [],
    bspeed: 0,
    cspeed: 0,
    mspeed: 0,
    tspeed: 0,
    total_vehicles_counted: 0
  });
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  // Fetch initial state plus light polling as a fallback for SSE
  useEffect(() => {
    fetchLightStates();
    fetchVehicleData();
    const fallbackInterval = setInterval(fetchLightStates, 15000);
    const vehicleInterval = setInterval(fetchVehicleData, 15000);
    return () => {
      clearInterval(fallbackInterval);
      clearInterval(vehicleInterval);
    };
  }, []);

  // Subscribe to server-sent events for realtime light/vehicle updates
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/lights/stream`);

    eventSource.onopen = () => {
      setConnectionStatus('connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.lights) {
          setLights(payload.lights);
        }
        if (payload.trafficFlow) {
          setTrafficFlow(payload.trafficFlow);
        }
        if (payload.vehicleData) {
          setVehicleData(payload.vehicleData);
        }
        setConnectionStatus('connected');
      } catch (error) {
        console.error('Error parsing SSE payload:', error);
      }
    };

    eventSource.onerror = () => {
      // Allow the browser to auto-reconnect while showing connecting status
      setConnectionStatus('connecting');
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchLightStates = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/lights`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.lights && data.trafficFlow) {
        setLights(data.lights);
        setTrafficFlow(data.trafficFlow);
        if (data.vehicleData) {
          setVehicleData(data.vehicleData);
        }
      }
    } catch (error) {
      console.error('Error fetching traffic light states:', error);
    }
  };

  const fetchVehicleData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/vehicles`);
      if (response.ok) {
        const data = await response.json();
        setVehicleData(data);
      }
    } catch (error) {
      console.error('Error fetching vehicle data:', error);
    }
  };

  const controlLight = async (lightId, action) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/lights/${lightId}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await response.json();
      if (data.lights) {
        setLights(data.lights);
      }
    } catch (error) {
      console.error('Error controlling traffic light:', error);
    } finally {
      setLoading(false);
    }
  };

  const emergencyStop = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/emergency-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.lights) {
        setLights(data.lights);
      }
    } catch (error) {
      console.error('Error in emergency stop:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      {/* Content */}
      <div className="app-content">
      <header className="app-header">
        <h1 className="app-title">
          <span className="traffic-icon">🚦</span>
          One-Way Traffic Control System
        </h1>
        <p className="app-subtitle">Management Portal</p>
        <div className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connected' ? '🟢 Connected' : connectionStatus === 'connecting' ? '🟡 Connecting...' : '🔴 Disconnected'}
        </div>
      </header>

      <div className="dashboard">
        {/* Traffic Lights Display */}
        <div className="lights-container">
          {lights?.light1 && (
            <TrafficLightCard
              light={lights.light1}
              onControl={controlLight}
              loading={loading}
            />
          )}
          
          {/* Details Between Lights */}
          <div className="lights-details">
            <div className="detail-card">
              <div className="detail-icon">📊</div>
              <div className="detail-content">
                <h4>System Status</h4>
                <p>Real-time monitoring active</p>
              </div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">🔗</div>
              <div className="detail-content">
                <h4>Connection</h4>
                <p className={`connection-text ${connectionStatus}`}>
                  {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </p>
              </div>
            </div>
            <div className="detail-card">
              <div className="detail-icon">⚡</div>
              <div className="detail-content">
                <h4>Response Time</h4>
                <p>&lt; 100ms</p>
              </div>
            </div>
          </div>

          {lights?.light2 && (
            <TrafficLightCard
              light={lights.light2}
              onControl={controlLight}
              loading={loading}
            />
          )}
        </div>

        {/* Vehicle Tracking Panel */}
        <VehicleTrackingPanel vehicleData={vehicleData} />

        {/* System Status */}
        <div className="status-panel">
          <div className="status-item">
            <span className="status-label">Mode:</span>
            <span className={`status-value ${trafficFlow.mode}`}>
              {trafficFlow.mode.charAt(0).toUpperCase() + trafficFlow.mode.slice(1)}
            </span>
          </div>
          <div className="status-item">
            <span className="status-label">Direction:</span>
            <span className={`status-value direction-${trafficFlow.currentDirection}`}>
              {trafficFlow.currentDirection.charAt(0).toUpperCase() + trafficFlow.currentDirection.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Floating Emergency Stop Button */}
      <button 
        className="floating-emergency-btn" 
        onClick={emergencyStop} 
        disabled={loading}
        title="Emergency Stop"
      >
        <span className="emergency-icon">🛑</span>
        <span className="emergency-text">Emergency Stop</span>
      </button>
      </div>
    </div>
  );
}

function TrafficLightCard({ light, onControl, loading }) {
  const getStateColor = (state) => {
    switch (state) {
      case 'green': return '#10b981';
      case 'red': return '#ef4444';
      case 'yellow': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStateText = (state) => {
    switch (state) {
      case 'green': return 'Green';
      case 'red': return 'Red';
      case 'yellow': return 'Yellow';
      default: return 'Unknown';
    }
  };

  return (
    <div className={`traffic-light-card ${light.state}`}>
      <div className="light-header">
        <h3>{light.name}</h3>
        <span className="light-direction">{light.direction}</span>
      </div>
      
      <div className="traffic-light-visual">
        <div className="traffic-light-housing">
          <div 
            className={`light-bulb red ${light.state === 'red' ? 'active' : ''}`}
            style={{ 
              backgroundColor: light.state === 'red' ? '#ef4444' : '#4b5563',
              boxShadow: light.state === 'red' ? '0 0 20px #ef4444, 0 0 40px #ef4444' : 'none'
            }}
          ></div>
          <div 
            className={`light-bulb yellow ${light.state === 'yellow' ? 'active' : ''}`}
            style={{ 
              backgroundColor: light.state === 'yellow' ? '#f59e0b' : '#4b5563',
              boxShadow: light.state === 'yellow' ? '0 0 20px #f59e0b, 0 0 40px #f59e0b' : 'none'
            }}
          ></div>
          <div 
            className={`light-bulb green ${light.state === 'green' ? 'active' : ''}`}
            style={{ 
              backgroundColor: light.state === 'green' ? '#10b981' : '#4b5563',
              boxShadow: light.state === 'green' ? '0 0 20px #10b981, 0 0 40px #10b981' : 'none'
            }}
          ></div>
        </div>
        <div className="light-state-text" style={{ color: getStateColor(light.state) }}>
          {getStateText(light.state)}
        </div>
      </div>

      <div className="light-controls">
        <button
          className="control-btn green"
          onClick={() => onControl(light.id, 'green')}
          disabled={loading || light.state === 'green'}
        >
          Green
        </button>
        <button
          className="control-btn yellow"
          onClick={() => onControl(light.id, 'yellow')}
          disabled={loading || light.state === 'yellow'}
        >
          Yellow
        </button>
        <button
          className="control-btn red"
          onClick={() => onControl(light.id, 'red')}
          disabled={loading || light.state === 'red'}
        >
          Red
        </button>
        <button
          className="control-btn toggle"
          onClick={() => onControl(light.id, 'toggle')}
          disabled={loading}
        >
          Toggle
        </button>
      </div>
    </div>
  );
}

function VehicleTrackingPanel({ vehicleData }) {
  const waitingVehicles = vehicleData.vehicles_waiting || 0;
  const priorityVehicles = vehicleData.priority_vehicles || 0;
  const greenLightDuration = vehicleData.green_light_duration || 20;
  const vehiclesByType = vehicleData.vehicles_by_type || {};
  
  // Track green light duration history for average calculation
  const [greenLightHistory, setGreenLightHistory] = useState([]);
  
  useEffect(() => {
    if (greenLightDuration > 0) {
      setGreenLightHistory(prev => {
        const updated = [...prev, greenLightDuration];
        // Keep last 10 values for average
        return updated.slice(-10);
      });
    }
  }, [greenLightDuration]);
  
  const averageGreenLightTime = greenLightHistory.length > 0
    ? Math.round(greenLightHistory.reduce((a, b) => a + b, 0) / greenLightHistory.length)
    : greenLightDuration;
  
  const vehicleTypes = [
    { type: 'car', icon: '🚗', label: 'Cars', count: vehiclesByType.car || vehicleData.car_count || 0, speed: vehicleData.cspeed || 0 },
    { type: 'truck', icon: '🚚', label: 'Trucks', count: vehiclesByType.truck || vehicleData.truck_count || 0, speed: vehicleData.tspeed || 0 },
    { type: 'bus', icon: '🚌', label: 'Buses', count: vehiclesByType.bus || vehicleData.bus_count || 0, speed: vehicleData.bspeed || 0 },
    { type: 'motorcycle', icon: '🏍️', label: 'Motorcycles', count: vehiclesByType.motorcycle || vehicleData.motorcycle_count || 0, speed: vehicleData.mspeed || 0 },
    { type: 'emergency', icon: '🚨', label: 'Emergency', count: vehiclesByType.emergency || vehicleData.emergency_count || 0, speed: 0 }
  ];

  return (
    <div className="vehicle-tracking-panel">
      <h2>Vehicle Tracking</h2>
      
      {/* Key Metrics Cards */}
      <div className="key-metrics-container">
        <KeyMetricCard
          icon="⏳"
          label="Vehicles Waiting"
          value={waitingVehicles}
          color="#667eea"
          unit="vehicles"
        />
        <KeyMetricCard
          icon="🚨"
          label="Priority Vehicles"
          value={priorityVehicles}
          color="#ef4444"
          unit="vehicles"
          isPriority={true}
        />
        <KeyMetricCard
          icon="⏱️"
          label="Avg Green Light Time"
          value={averageGreenLightTime}
          color="#10b981"
          unit="seconds"
        />
      </div>
      
      {/* Waiting Vehicles Section */}
      <div className="waiting-vehicles-section">
        <div className="waiting-header">
          <span className="waiting-icon">⏳</span>
          <h3>Vehicles Waiting</h3>
          <span className="waiting-count">{waitingVehicles}</span>
        </div>
        <div className="waiting-vehicles-visual">
          {Array.from({ length: Math.min(waitingVehicles, 5) }).map((_, i) => (
            <div key={i} className="waiting-vehicle-icon">
              🚗
            </div>
          ))}
          {waitingVehicles > 5 && (
            <div className="waiting-vehicle-more">+{waitingVehicles - 5}</div>
          )}
        </div>
      </div>

      {/* Vehicle Types Grid */}
      <div className="vehicle-types-grid">
        {vehicleTypes.map((vehicle) => (
          <VehicleTypeCard key={vehicle.type} vehicle={vehicle} />
        ))}
      </div>

      {/* Statistics Section */}
      <div className="vehicle-stats">
        <div className="stat-item">
          <span className="stat-label">Total Counted:</span>
          <span className="stat-value">{vehicleData.total_vehicles_counted || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Vehicles/Min:</span>
          <span className="stat-value">{vehicleData.vehicles_per_minute || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Current Green Duration:</span>
          <span className="stat-value">{greenLightDuration}s</span>
        </div>
      </div>

      {/* Anomalies Section */}
      {vehicleData.anomalies && vehicleData.anomalies.length > 0 && (
        <div className="anomalies-section">
          <h4>⚠️ Anomalies Detected</h4>
          <div className="anomalies-list">
            {vehicleData.anomalies.map((anomaly, idx) => (
              <span key={idx} className="anomaly-badge">{anomaly}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleTypeCard({ vehicle }) {
  return (
    <div className="vehicle-type-card">
      <div className="vehicle-icon-wrapper">
        <span className="vehicle-icon">{vehicle.icon}</span>
        {vehicle.count > 0 && (
          <span className="vehicle-count-badge">{vehicle.count}</span>
        )}
      </div>
      <div className="vehicle-info">
        <div className="vehicle-label">{vehicle.label}</div>
        {vehicle.speed > 0 && (
          <div className="vehicle-speed">{vehicle.speed.toFixed(1)} km/h</div>
        )}
      </div>
    </div>
  );
}

function KeyMetricCard({ icon, label, value, color, unit, isPriority = false }) {
  return (
    <div className={`key-metric-card ${isPriority ? 'priority' : ''}`} style={{ '--card-color': color }}>
      <div className="key-metric-icon">{icon}</div>
      <div className="key-metric-content">
        <div className="key-metric-label">{label}</div>
        <div className="key-metric-value-wrapper">
          <span className="key-metric-value">{value}</span>
          <span className="key-metric-unit">{unit}</span>
        </div>
      </div>
      {isPriority && value > 0 && (
        <div className="priority-indicator">⚠️ Priority</div>
      )}
    </div>
  );
}

export default App;
