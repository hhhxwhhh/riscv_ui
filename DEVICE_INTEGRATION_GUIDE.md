# Wi-Fi 7 Security Gateway - External Integration Guide

This guide explains how your physical computers and gateway devices can report data to the management server for real-time visualization.

## 1. System Architecture

```text
[ Physical Computer (Node) ] --(HTTP/JSON)--> [ Management Server ] <--(WebSocket)--> [ Web Dashboard ]
[ Physical Gateway         ] --(HTTP/JSON)--> [ Management Server ]
```

## 2. API Endpoints

The Management Server runs at `http://<SERVER_IP>:8080`.

### A. Device/Gateway Telemetry (上报遥测数据)
Use this endpoint to update real-time status, traffic, and security stages.

**Endpoint:** `POST /api/telemetry`

**JSON Payload Schema:**
```json
{
  "deviceId": "node-pc-01",      // Unique identifier (MAC or ID)
  "deviceName": "Dev MacBook",   // Friendly name for UI (Shown on Topology)
  "source": "192.168.1.15",      // IP address (Used for labeling)
  "stageId": "AUTH",             // Current stage: AUTH, ENCRYPT, DECRYPT, HASH
  "status": "online",            // online / offline
  "metrics": {
    "throughput": 450.5,         // Real-time Mbps (Adjusts line thickness/speed)
    "latency": 1.25,             // Real-time ms
    "securityScore": 98          // Security integrity score 0-100
  }
}
```

## 3. Implementation Example (Python)

Run this snippet on any computer connected to the same network as the server:

```python
import requests
import time
import random

SERVER_IP = "127.0.0.1" # Change to Management Server's IP
SERVER_URL = f"http://{SERVER_IP}:8080/api/telemetry"
DEVICE_ID = "macbook-pro-01"

# The stage IDs defined in the frontend: 
# AUTH: Identity Auth | ENCRYPT: SM4 Enc | DECRYPT: SM4 Dec | HASH: SM3 Integrity
stages = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"]

def report_to_server():
    print(f"Starting telemetry reporting for device {DEVICE_ID}...")
    while True:
        # Choose a stage to simulate process change
        current_stage = random.choice(stages)
        
        payload = {
            "deviceId": DEVICE_ID,
            "deviceName": "Physical Node 01",
            "source": "10.0.0.101",
            "stageId": current_stage,
            "metrics": {
                "throughput": random.uniform(200, 950),
                "latency": random.uniform(0.3, 2.5),
                "securityScore": random.randint(95, 100)
            }
        }
        
        try:
            r = requests.post(SERVER_URL, json=payload, timeout=2)
            if r.status_code == 200:
                print(f"Stage: {current_stage} | Speed: {payload['metrics']['throughput']:.1f} Mbps")
        except Exception as e:
            print(f"Report Failed: {e}")
            
        time.sleep(1) # Frequency: 1Hz

if __name__ == "__main__":
    report_to_server()
```

## 4. UI Visualization Logic (前端展示逻辑)
- **Node Selection**: Clicking the node in the dashboard will open the **Node Inspector**, showing your reported IP and real-time throughput.
- **Stage Color Sync**: 
  - `AUTH` -> Violet/Indigo
  - `ENCRYPT` -> Emerald/Green
  - `DECRYPT` -> Rose/Pink
  - `HASH` -> Amber/Yellow
- **Flow Animation**: The Speed of the animation in the topology between the gateway and device will accelerate as your `metrics.throughput` value increases.
