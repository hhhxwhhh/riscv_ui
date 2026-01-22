import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
const frontendOriginEnv =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://localhost:5174";
const allowedOrigins = frontendOriginEnv.split(",").map((item) => item.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());

const PORT = process.env.PORT || 8080;

// In-memory data (replace with DB later)
const devices = [
  {
    id: "dev-a",
    name: "IoT Dev-A",
    ip: "192.168.1.101",
    status: "online",
    lastSeen: Date.now(),
  },
  {
    id: "dev-b",
    name: "IoT Dev-B",
    ip: "192.168.1.102",
    status: "online",
    lastSeen: Date.now(),
  },
  {
    id: "dev-c",
    name: "IoT Dev-C",
    ip: "192.168.1.103",
    status: "online",
    lastSeen: Date.now(),
  },
  {
    id: "dev-d",
    name: "IoT Dev-D",
    ip: "192.168.1.104",
    status: "online",
    lastSeen: Date.now(),
  },
];

let latestMetrics = {
  throughput: 850,
  latency: 1.2,
  securityScore: 95,
};

// REST: devices list
app.get("/api/devices", (req, res) => {
  res.json(devices);
});

// REST: metrics
app.get("/api/metrics", (req, res) => {
  res.json(latestMetrics);
});

// REST: telemetry push (for gateway reporting)
app.post("/api/telemetry", (req, res) => {
  const payload = req.body || {};
  const now = Date.now();

  if (payload.deviceId) {
    const dev = devices.find((d) => d.id === payload.deviceId);
    if (dev) {
      dev.lastSeen = now;
      dev.status = payload.status || "online";
    }
  }

  if (payload.metrics) {
    latestMetrics = { ...latestMetrics, ...payload.metrics };
  }

  // Broadcast to all websocket clients
  broadcast({ type: "telemetry", ts: now, ...payload });

  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

// WebSocket server (same port)
const wss = new WebSocketServer({ server, path: "/ws/telemetry" });

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "info", message: "connected" }));

  ws.on("message", (data) => {
    // optional: allow gateway to push via WS
    try {
      const payload = JSON.parse(data.toString());
      broadcast({ type: "telemetry", ts: Date.now(), ...payload });
    } catch {
      // ignore malformed
    }
  });
});

// Demo stream: emit telemetry every 2s for testing
setInterval(() => {
  const dev = devices[Math.floor(Math.random() * devices.length)];
  const payload = {
    deviceId: dev.id,
    source: dev.ip,
    status: "active",
    metrics: {
      throughput: Math.floor(600 + Math.random() * 300),
      latency: Number((0.8 + Math.random() * 1.6).toFixed(2)),
      securityScore: Math.floor(85 + Math.random() * 10),
    },
  };
  broadcast({ type: "telemetry", ts: Date.now(), ...payload });
}, 2000);
