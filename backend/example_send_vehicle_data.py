"""
Example script to send vehicle tracking data to the backend API.
This simulates the data structure from your YOLO tracking script.
"""

import requests
import time
import json
from datetime import datetime

API_URL = "http://localhost:3001/api/vehicles"

# Example vehicle data matching your YOLO script output
def send_vehicle_data():
    data = {
        "bspeed": 3.566284297591931,
        "cspeed": 4.540149160099617,
        "mspeed": 0.0,
        "tspeed": 2.3529193309909804,
        "total_vehicles_counted": 15,
        "vehicles_by_type": {
            "car": 8,
            "truck": 3,
            "bus": 2,
            "motorcycle": 1,
            "emergency": 1
        },
        "car_count": 8,
        "truck_count": 3,
        "bus_count": 2,
        "motorcycle_count": 1,
        "emergency_count": 1,
        "vehicles_waiting": 5,
        "priority_vehicles": 3,
        "green_light_duration": 25,
        "vehicles_per_minute": 12,
        "anomalies": ["sudden_stop"],
        "timestamp": datetime.now().isoformat()
    }
    
    try:
        response = requests.post(API_URL, json=data)
        if response.status_code == 200:
            print(f"[✓] Data sent successfully at {datetime.now().strftime('%H:%M:%S')}")
            print(f"    Waiting vehicles: {data['vehicles_waiting']}")
            print(f"    Total counted: {data['total_vehicles_counted']}")
        else:
            print(f"[✗] Error: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"[✗] Connection error: {e}")

if __name__ == "__main__":
    print("Sending vehicle data to backend...")
    print("Press Ctrl+C to stop\n")
    
    try:
        while True:
            send_vehicle_data()
            time.sleep(10)  # Send data every 10 seconds
    except KeyboardInterrupt:
        print("\n[!] Stopped sending data")







