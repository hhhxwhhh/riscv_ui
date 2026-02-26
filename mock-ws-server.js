import { WebSocketServer } from "ws";
import http from "http";

const HTTP_PORT = 8080;
const devices = Array.from({ length: 60 }, (_, i) => {
  const types = ["Sensor", "Camera", "Node", "Relay", "Terminal"];
  return {
    id: `dev-${i}`,
    name: `IoT ${types[i % types.length]} ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ""}`,
    ip: `192.168.1.${100 + i}`,
  };
});

// Create a simple HTTP server to handle /api/devices since Vite/Frontend expects it
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/api/devices") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(devices));
  } else if (req.url === "/api/metrics") {
    res.writeHead(200, { "Content-Type": "application/json" });
    
    // Aggregating mock metrics for global display
    const activeMetrics = Array.from(deviceStates.values()).filter(() => Math.random() > 0.5);
    const avgTput = activeMetrics.reduce((s, m) => s + m.baseTp, 0) / (activeMetrics.length || 1);
    
    res.end(
      JSON.stringify({ 
          throughput: jitter(avgTput, 10), 
          latency: jitter(1.2, 20), 
          securityScore: jitter(96, 2) 
      }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

console.log(`Mock Suite started on http/ws://localhost:${HTTP_PORT}`);

const STAGE_IDS = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"];

// Advanced Mock Logic: Simulation Lifecycle for Each Device
const deviceStates = new Map(devices.map(d => [d.id, { 
    stageIdx: Math.floor(Math.random() * 4),
    trafficTrend: Math.random() > 0.5 ? 1 : -1,
    baseTp: 400 + Math.random() * 400 
}]));

const jitter = (base, percent) => {
  const range = base * (percent / 100);
  return base + (Math.random() * range * 2 - range);
};

const broadcastState = () => {
    wss.clients.forEach((client) => {
        if (client.readyState === 1) { // OPEN
            // Pick subset of active reporters
            const reporters = devices.filter(() => Math.random() > 0.7);
            
            reporters.forEach(device => {
                const state = deviceStates.get(device.id);
                // Cycle stages
                if (Math.random() > 0.9) state.stageIdx = (state.stageIdx + 1) % 4;
                
                // Fluctuating traffic
                state.baseTp += state.trafficTrend * (Math.random() * 20);
                if (state.baseTp > 1200) state.trafficTrend = -1;
                if (state.baseTp < 300) state.trafficTrend = 1;

                const stage = STAGE_IDS[state.stageIdx];
                
                // Realistic performance metrics based on hardware acceleration
                let throughputMultiplier = 1.0;
                let latencyBase = 1.8;
                let securityBase = 92;

                if (stage === 'AUTH') { throughputMultiplier = 0.8; latencyBase = 2.4; securityBase = 90; }
                if (stage === 'ENCRYPT') { throughputMultiplier = 2.4; latencyBase = 0.6; securityBase = 98; }
                if (stage === 'DECRYPT') { throughputMultiplier = 2.2; latencyBase = 0.7; securityBase = 98; }
                if (stage === 'HASH') { throughputMultiplier = 1.5; latencyBase = 1.1; securityBase = 99.8; }

                client.send(JSON.stringify({
                    type: "telemetry",
                    source: device.ip,
                    deviceName: device.name,
                    deviceId: device.id,
                    status: Math.random() > 0.99 ? "warning" : "online",
                    stageId: stage,
                    metrics: {
                        throughput: jitter(state.baseTp * throughputMultiplier, 5),
                        latency: jitter(latencyBase, 10),
                        securityScore: jitter(securityBase, 0.5)
                    },
                    timestamp: Date.now()
                }));
            });

            // System-wide Event Log
            if (Math.random() > 0.9) {
                const events = [
                    "SM2 Identity handshake successful",
                    "A100 Gateway: Custom ISA ENCRYPT kernel optimization active",
                    "Integrity verified for all nodes via SM3 HASH",
                    "Throughput spike detected: Scaling hardware compute resources",
                    "TEE: Security enclave report generated successfully",
                    "Memory isolation verified via RISC-V PMP (Physical Memory Protection)"
                ];
                client.send(JSON.stringify({
                    type: "log",
                    message: events[Math.floor(Math.random() * events.length)],
                    level: "info",
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
