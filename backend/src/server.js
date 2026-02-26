import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();

// Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
    );
  });
  next();
});

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});
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

// In-memory data
const DEVICE_OFFLINE_TIMEOUT = 10000;
const devices = [];

// Periodic check for offline devices removed for pure data-driven test.
// We only follow explicit device join/telemetry.

let latestMetrics = {
  throughput: 850,
  latency: 1.2,
  securityScore: 95,
};

// REST: devices list
app.get("/api/devices", (req, res) => {
  try {
    res.json(devices.map((d) => ({ ...d })));
  } catch (err) {
    console.error("[API] /api/devices error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// REST: metrics
app.get("/api/metrics", (req, res) => {
  try {
    res.json(latestMetrics);
  } catch (err) {
    console.error("[API] /api/metrics error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// REST: telemetry push (for gateway reporting)
app.post("/api/telemetry", (req, res) => {
  const payload = req.body || {};
  const now = Date.now();
  // Parameter validation
  if (!payload.deviceId || typeof payload.deviceId !== "string") {
    console.warn("[API] /api/telemetry: deviceId missing or invalid");
    res.status(400).json({ error: "deviceId required" });
    return;
  }
  if (payload.metrics && typeof payload.metrics !== "object") {
    console.warn("[API] /api/telemetry: metrics invalid");
    res.status(400).json({ error: "metrics must be object" });
    return;
  }

  const dev = devices.find((d) => d.id === payload.deviceId);
  if (!dev) {
    // Dynamically register new real devices
    const newDev = {
      id: payload.deviceId,
      name: payload.deviceName || `External Node ${payload.deviceId.slice(-4)}`,
      ip: payload.source || req.ip || "unknown",
      status: "online",
      lastSeen: now,
    };
    devices.push(newDev);
    console.log(`[External] New device registered: ${newDev.name} (${newDev.ip})`);
    broadcast({ type: "device_join", device: newDev });
  } else {
    dev.lastSeen = now;
    dev.status = payload.status || "online";
  }

  if (payload.metrics) {
    latestMetrics = { ...latestMetrics, ...payload.metrics };
  }

  // Fine-grained broadcast message types
  broadcast({ type: "telemetry", ts: now, ...payload });
  res.json({ ok: true });
});

// Platform Statistics
app.get("/api/platform/stats", (req, res) => {
  const onlineCount = devices.filter(d => d.status === 'online').length;
  res.json({
    totalDevices: devices.length,
    onlineDevices: onlineCount,
    totalThroughput: latestMetrics.throughput,
    algorithm: 'SM4 Custom ISA',
    securityLevel: 'High (HW Accelerated)'
  });
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

function broadcastError(errorMsg) {
  const data = JSON.stringify({ type: "error", message: errorMsg });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

// WebSocket connection with message typing and error handling
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "info", message: "connected" }));

  ws.on("message", (data) => {
    try {
      const payload = JSON.parse(data.toString());
      // Handle heartbeats or specific control messages if needed
      if (payload.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
      }

      // Validate deviceId
      if (!payload.deviceId || typeof payload.deviceId !== "string") {
        broadcastError("deviceId required");
        return;
      }

      const now = Date.now();
      const dev = devices.find((d) => d.id === payload.deviceId);
      if (!dev) {
        const newDev = {
          id: payload.deviceId,
          name: payload.deviceName || `WS Node ${payload.deviceId.slice(-4)}`,
          ip: payload.source || "websocket",
          status: "online",
          lastSeen: now,
        };
        devices.push(newDev);
        console.log(`[WS-External] New device registered: ${newDev.name}`);
        broadcast({ type: "device_join", device: newDev });
      } else {
        dev.lastSeen = now;
      }

      broadcast({ type: "telemetry", ts: Date.now(), ...payload });
    } catch (err) {
      broadcastError("Malformed message");
      console.warn("[WS] Malformed message:", err);
    }
  });
});

// System now strictly waits for external data via REST or WebSocket.
const STAGE_IDS = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"];

