import { WebSocketServer } from "ws";
import http from "http";

const HTTP_PORT = 8080;
const devices = Array.from({ length: 60 }, (_, i) => {
  const types = ["Sensor", "Camera", "Node", "Relay", "Terminal"];
  const type = types[i % types.length];
  
  // Base capabilities based on device type
  let baseTp = 100;
  if (type === "Camera") baseTp = 800;
  if (type === "Relay") baseTp = 1200;
  if (type === "Terminal") baseTp = 400;

  return {
    id: `dev-${i}`,
    name: `IoT ${type} ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ""}`,
    type,
    ip: `192.168.1.${100 + i}`,
    baseTp
  };
});

// Create a simple HTTP server to handle /api/devices since Vite/Frontend expects it
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/api/devices") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(devices.map(({id, name, ip, type}) => ({id, name, ip, type}))));
  } else if (req.url === "/api/metrics") {
    res.writeHead(200, { "Content-Type": "application/json" });
    
    // Aggregating mock metrics for global display
    const activeStates = Array.from(deviceStates.values());
    const avgTput = activeStates.reduce((s, m) => s + m.currentTp, 0) / (activeStates.length || 1);
    
    res.end(
      JSON.stringify({ 
          throughput: jitter(avgTput, 5), 
          latency: jitter(0.85, 10), 
          securityScore: jitter(98.2, 1) 
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

console.log(`Mock Suite V3.1 started on http/ws://localhost:${HTTP_PORT}`);

const STAGE_IDS = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"];
const LINK_TYPES = ["2.4GHz", "5GHz", "6GHz", "MLO-Aggregated"];

// Advanced Mock Logic: Simulation Lifecycle for Each Device
const deviceStates = new Map(devices.map(d => [d.id, { 
    stageIdx: Math.floor(Math.random() * 4),
    trafficTrend: Math.random() > 0.5 ? 1 : -1,
    baseTp: d.baseTp,
    currentTp: d.baseTp,
    linkType: LINK_TYPES[Math.floor(Math.random() * LINK_TYPES.length)]
}]));

// Centralized Stage Physics for Consistent Simulation
const STAGE_PHYSICS = {
    "AUTH": { tputMult: 0.05, latBase: 4.5, secBase: 88, msg: "SAE Handshake" },
    "ENCRYPT": { tputMult: 2.8, latBase: 0.5, secBase: 99, msg: "Zkn AES/SM4" },
    "DECRYPT": { tputMult: 2.6, latBase: 0.6, secBase: 99, msg: "Zkn Vector-Dec" },
    "HASH": { tputMult: 1.8, latBase: 0.9, secBase: 99.9, msg: "Zksh SM3-Digest" }
};

const jitter = (base, percent) => {
  const range = base * (percent / 100);
  return base + (Math.random() * range * 2 - range);
};

// Variable pool for dynamic devices
let deviceIdCounter = 1000;
let ipCounter = 200;

const createNewDevice = () => {
  const types = ["Sensor", "Camera", "Node", "Relay", "Terminal"];
  const type = types[Math.floor(Math.random() * types.length)];
  const nameCode = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 100);
  const idValue =  `dev-dyn-${deviceIdCounter++}`;
  const ipValue = `192.168.1.${ipCounter++}`;
  if (ipCounter > 254) ipCounter = 100;

  // Base capabilities based on device type
  let baseTp = 100;
  if (type === "Camera") baseTp = 800;
  if (type === "Relay") baseTp = 1200;
  if (type === "Terminal") baseTp = 400;

  const newDev = {
    id: idValue,
    name: `IoT ${type} ${nameCode}`,
    type: type,
    ip: ipValue,
    baseTp
  };

  deviceStates.set(newDev.id, { 
    stageIdx: 0,
    trafficTrend: Math.random() > 0.5 ? 1 : -1,
    baseTp: newDev.baseTp,
    currentTp: 0,
    linkType: LINK_TYPES[0]
  });

  return newDev;
};

const broadcastState = () => {
    // 5. Dynamic Device Lifecycle Simulation
    // 5.1 Device Exit (Occasionally remove a device)
    if (Math.random() > 0.985 && devices.length > 25) {
        const exitIdx = Math.floor(Math.random() * devices.length);
        const exitDevice = devices[exitIdx];
        devices.splice(exitIdx, 1);
        deviceStates.delete(exitDevice.id);

        wss.clients.forEach(c => {
            if (c.readyState === 1) {
                c.send(JSON.stringify({
                    type: "device_exit",
                    id: exitDevice.id,
                    name: exitDevice.name,
                    ip: exitDevice.ip,
                    timestamp: Date.now()
                }));
                const reason = Math.random() > 0.5 ? "Link Loss Timeout" : "User De-authentication";
                c.send(JSON.stringify({
                    type: "log",
                    message: `ALERT: Device ${exitDevice.name} [${exitDevice.ip}] detached. Reason: ${reason}`,
                    level: "warning",
                    timestamp: Date.now()
                }));
            }
        });
    }

    // 5.2 Device Join (Occasionally add a device)
    if (Math.random() > 0.98 && devices.length < 85) {
        const newDevice = createNewDevice();
        devices.push(newDevice);

        wss.clients.forEach(c => {
            if (c.readyState === 1) {
                c.send(JSON.stringify({
                    type: "device_join",
                    device: {
                        id: newDevice.id,
                        name: newDevice.name,
                        ip: newDevice.ip,
                        type: newDevice.type,
                        status: "online"
                    },
                    timestamp: Date.now()
                }));
                c.send(JSON.stringify({
                    type: "log",
                    message: `SYSTEM: New Node ${newDevice.name} [${newDevice.ip}] requesting entry. Initiating SAE Handshake...`,
                    level: "info",
                    timestamp: Date.now()
                }));
            }
        });
    }

    wss.clients.forEach((client) => {
        if (client.readyState === 1) { // OPEN
            // Pick subset of active reporters + prioritize NEW devices in AUTH stage
            const reporters = devices.filter((d) => {
                const state = deviceStates.get(d.id);
                if (!state) return false;
                // If it's a new device in AUTH, report more frequently (80% chance)
                if (state.stageIdx === 0) return Math.random() > 0.2;
                // Otherwise normal 35% report chance
                return Math.random() > 0.65;
            });
            
            reporters.forEach(device => {
                const state = deviceStates.get(device.id);
                if (!state) return;

                // Cycle stages: slower transition during AUTH to show process
                const transitionProb = state.stageIdx === 0 ? 0.08 : 0.15;
                if (Math.random() > (1 - transitionProb)) {
                  state.stageIdx = (state.stageIdx + 1) % 4;
                  
                  // Log stage change for specific devices to show lifecycle
                  if (Math.random() > 0.7) {
                    client.send(JSON.stringify({
                        type: "log",
                        message: `Node ${device.name}: Transitioning to ${STAGE_IDS[state.stageIdx]} stage`,
                        level: "info",
                        timestamp: Date.now()
                    }));
                  }
                }
                
                if (Math.random() > 0.95) state.linkType = LINK_TYPES[Math.floor(Math.random() * LINK_TYPES.length)];
                
                // Fluctuating traffic
                state.baseTp += state.trafficTrend * (Math.random() * 15);
                if (state.baseTp > device.baseTp * 1.5) state.trafficTrend = -1;
                if (state.baseTp < device.baseTp * 0.5) state.trafficTrend = 1;

                const stage = STAGE_IDS[state.stageIdx];
                const physics = STAGE_PHYSICS[stage];
                
                // MLO Benefit: Lower latency and higher throughput stability
                const isMLO = state.linkType === 'MLO-Aggregated';
                let mloLatBoost = isMLO ? 0.75 : 1.0;
                let mloTpBoost = isMLO ? 1.4 : 1.0;

                state.currentTp = jitter(state.baseTp * physics.tputMult * mloTpBoost, 5);
                const latFinal = jitter(physics.latBase * mloLatBoost, 8);

                client.send(JSON.stringify({
                    type: "telemetry",
                    source: device.ip,
                    deviceName: device.name,
                    deviceId: device.id,
                    deviceType: device.type,
                    status: Math.random() > 0.995 ? "warning" : "online",
                    stageId: stage,
                    linkType: state.linkType,
                    metrics: {
                        throughput: state.currentTp,
                        latency: latFinal,
                        securityScore: jitter(physics.secBase, 0.4)
                    },
                    timestamp: Date.now()
                }));
            });

            // System-wide Event Log with higher technical density
            if (Math.random() > 0.88) {
                const events = [
                    "SM2 Identity handshake successful: Device key verified",
                    "A100 Gateway: Custom ISA ENCRYPT kernel optimization (Zkn) active",
                    "Integrity verified for all mesh nodes via SM3 HASH (Zksh)",
                    "Throughput spike: Dynamic resource scaling for 4K/8K stream",
                    "MLO: High-priority traffic switched to 6GHz (STR mode) link",
                    "Wi-Fi 7: Preamble Puncturing active on 320MHz channel (DFS detection)",
                    "4096-QAM Modulation stabilized - EVM: -41.2dB",
                    "RISC-V Vector Cryptographic Extension (Zkv) utilizing 256-bit VLEN",
                    "WPA3-SAE: Simultaneous Authentication of Equals completed",
                    "Packet loss mitigation: HARQ soft-combining active",
                    "802.11be EHT PPDU format validated by Gateway PHY",
                    "BSS Coloring: Co-channel interference mitigation [BSSID: 0x42]",
                    "TWT: Power-save wake-up schedule optimized for Sensor nodes",
                    "Targeted-RU: Spectral efficiency increased by +22% for OFDMA"
                ];
                client.send(JSON.stringify({
                    type: "log",
                    message: events[Math.floor(Math.random() * events.length)],
                    level: Math.random() > 0.95 ? "warning" : "info",
                    timestamp: Date.now()
                }));
            }
        }
    });
};

setInterval(broadcastState, 800);

wss.on("connection", function connection(ws) {
  console.log("Client connected via WebSocket");

  ws.send(JSON.stringify({
      type: "info",
      message: "Connected to RISC-V Secure Mesh Virtual Engine (V3.0)",
  }));

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(HTTP_PORT);
