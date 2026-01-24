import { WebSocketServer } from "ws";
import http from "http";

const HTTP_PORT = 8080;
const devices = Array.from({ length: 20 }, (_, i) => {
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
    res.end(
      JSON.stringify({ throughput: 850, latency: 1.2, securityScore: 95 }),
    );
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

console.log(`Mock Suite started on http/ws://localhost:${HTTP_PORT}`);

const STAGE_IDS = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"];

// Track active transaction state for devices
const activeTransactions = new Map();

wss.on("connection", function connection(ws) {
  console.log("Client connected via WebSocket");

  // Send a welcome message
  ws.send(
    JSON.stringify({
      type: "info",
      message: "Connected to Mock Lifecycle Server",
    }),
  );

  // Simulate device traffic with lifecycle logic
  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;

    // Pick a device that doesn't have an active transaction, or progress an existing one
    const randomDevice = devices[Math.floor(Math.random() * devices.length)];
    const deviceIp = randomDevice.ip;

    let transaction = activeTransactions.get(deviceIp);

    if (!transaction) {
      // Start a new transaction for this device
      transaction = {
        deviceId: randomDevice.id,
        deviceName: randomDevice.name,
        deviceIp: deviceIp,
        stageIndex: 0,
        lastUpdate: Date.now(),
      };
      activeTransactions.set(deviceIp, transaction);
    } else {
      // Progress existing transaction
      transaction.stageIndex++;
      transaction.lastUpdate = Date.now();
    }

    const currentStageId = STAGE_IDS[transaction.stageIndex];

    // Create a packet
    const packet = {
      source: deviceIp,
      timestamp: Date.now(),
      status: "active",
      stageId: currentStageId,
      isLastStage: transaction.stageIndex === STAGE_IDS.length - 1,
      metrics: {
        throughput: 400 + Math.random() * 800,
        latency: 0.1 + Math.random() * 2,
        securityScore: 90 + Math.random() * 10,
      },
    };

    ws.send(JSON.stringify(packet));

    // If it was the last stage, remove it after a short delay so the UI can show completion
    if (transaction.stageIndex >= STAGE_IDS.length - 1) {
      activeTransactions.delete(deviceIp);
    }
  }, 1200);

  ws.on("close", () => {
    console.log("Client disconnected");
    clearInterval(interval);
  });
});

server.listen(HTTP_PORT);
