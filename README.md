# One-Way Traffic Control System - Management Portal

A beautiful, animated management portal for controlling a one-way traffic system with two traffic lights. Features real-time traffic light control, traffic flow management, and an intuitive user interface.

## Features

- 🚦 **Two Traffic Light Control**: Independently control Traffic Light 1 (Inbound) and Traffic Light 2 (Outbound)
- 🎯 **Traffic Flow Management**: Switch between inbound and outbound traffic directions
- 🎨 **Beautiful Animated UI**: Modern, responsive design with smooth animations and realistic traffic light visualization
- ⚡ **Real-time Updates**: Automatic polling for traffic light state updates
- 🛑 **Emergency Stop**: Instantly set all traffic lights to red in emergency situations
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack

### Backend
- Node.js
- Express.js
- MQTT Client (for real-time vehicle data)
- CORS enabled for frontend communication

### Frontend
- React 19
- Vite
- Modern CSS with animations

## Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

The backend server will run on `http://localhost:3001`

**MQTT Configuration:**
The backend automatically subscribes to MQTT topics from your Python tracking script:
- Broker: `broker.hivemq.com:1883` (default)
- Base Topic: `traffic/vehicles`
- The server subscribes to all vehicle data topics and updates in real-time

You can configure the MQTT broker by setting environment variables:
```bash
MQTT_BROKER_HOST=your-broker.com MQTT_BROKER_PORT=1883 npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm dev
```

The frontend will run on `http://localhost:5173` (or another port if 5173 is busy)

## Usage

1. **Start the backend server** first (port 3001)
2. **Start the frontend** development server
3. Open your browser and navigate to the frontend URL
4. Use the portal to:
   - Control individual traffic lights (Red/Yellow/Green/Toggle)
   - Switch traffic direction (Inbound/Outbound) - turns both lights green simultaneously
   - Use emergency stop to set all traffic lights to red instantly

## API Endpoints

### GET `/api/lights`
Get all traffic light states and traffic flow information

### GET `/api/lights/:lightId`
Get specific traffic light state

### POST `/api/lights/:lightId/control`
Control a specific traffic light
- Body: `{ "action": "red" | "yellow" | "green" | "toggle" }`

### POST `/api/traffic-flow`
Set traffic flow direction
- Body: `{ "direction": "inbound" | "outbound", "mode": "automatic" | "manual" }`
- Note: Setting direction turns both traffic lights green simultaneously

### POST `/api/emergency-stop`
Set all traffic lights to red immediately

## Traffic Light States

- **red**: Stop - Traffic is not allowed
- **yellow**: Caution - Transition state
- **green**: Go - Traffic is allowed

## Project Structure

```
One_way_Passage_control/
├── backend/
│   ├── Server.js          # Express server with API endpoints
│   └── package.json       # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── App.css        # Styling and animations
│   │   ├── index.css      # Global styles
│   │   └── main.jsx       # React entry point
│   └── package.json       # Frontend dependencies
└── README.md
```

## Features in Detail

### Traffic Light Control
- Each traffic light can be controlled independently
- Visual feedback shows traffic light state with realistic 3-bulb display (red, yellow, green)
- Smooth animations and glowing effects for active lights
- Transitions through yellow when changing between red and green

### Traffic Flow Control
- Switch between inbound and outbound directions
- Both traffic lights turn green simultaneously when direction is set
- Direction controls traffic flow, not individual light states
- Visual indicators for current traffic direction

### Emergency Stop
- One-click emergency stop button
- Sets all traffic lights to red immediately (transitions through yellow)
- Visual feedback with shake animation

## MQTT Integration

The backend automatically subscribes to MQTT topics published by your Python YOLO tracking script:

### Topics Subscribed:
- `traffic/vehicles` - Main vehicle data (all metrics)
- `traffic/vehicles/car` - Car count updates
- `traffic/vehicles/truck` - Truck count updates
- `traffic/vehicles/bus` - Bus count updates
- `traffic/vehicles/motorcycle` - Motorcycle count updates
- `traffic/vehicles/emergency` - Emergency vehicle count updates
- `traffic/vehicles/traffic_light` - Traffic light control data
- `traffic/vehicles/speeds` - Speed data for all vehicle types

### Data Flow:
1. Python script (YOLO) detects vehicles and publishes to MQTT
2. Backend MQTT subscriber receives data in real-time
3. Backend updates vehicle data state
4. Frontend polls backend every 2 seconds to display updated data

### MQTT Broker:
- Default: `broker.hivemq.com:1883` (public MQTT broker)
- You can use any MQTT broker by setting environment variables
- No authentication required for HiveMQ public broker

## Development

The frontend polls the backend every 2 seconds for status updates. The backend receives real-time vehicle data via MQTT from your Python tracking script. Traffic lights transition through yellow when changing between red and green states.

## License

See LICENSE file for details.
