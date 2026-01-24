import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();

// 日志中间件
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

// 健康检查接口
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

// In-memory data (replace with DB later)
const DEVICE_OFFLINE_TIMEOUT = 10000; // 10秒未上报视为离线
const devices = Array.from({ length: 20 }, (_, i) => ({
  id: `dev-${String.fromCharCode(97 + (i % 26))}${i > 25 ? i : ""}`,
  name: `IoT Node ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ""}`,
  ip: `192.168.1.${100 + i}`,
  status: "online",
  lastSeen: Date.now(),
}));

// 定时检测设备是否离线
setInterval(() => {
  const now = Date.now();
  devices.forEach((dev) => {
    if (
      dev.status === "online" &&
      now - dev.lastSeen > DEVICE_OFFLINE_TIMEOUT
    ) {
      dev.status = "offline";
      console.log(`[Device] ${dev.name} (${dev.ip}) marked offline`);
    }
    if (
      dev.status === "offline" &&
      now - dev.lastSeen <= DEVICE_OFFLINE_TIMEOUT
    ) {
      dev.status = "online";
      console.log(`[Device] ${dev.name} (${dev.ip}) back online`);
    }
  });
}, 2000);

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
  // 参数校验
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
    console.warn("[API] /api/telemetry: device not found", payload.deviceId);
    res.status(404).json({ error: "device not found" });
    return;
  }
  dev.lastSeen = now;
  dev.status = payload.status || "online";

  if (payload.metrics) {
    latestMetrics = { ...latestMetrics, ...payload.metrics };
  }

  // 广播消息类型细分
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

function broadcastError(errorMsg) {
  const data = JSON.stringify({ type: "error", message: errorMsg });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

// WebSocket连接，细分消息类型和错误处理
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "info", message: "connected" }));

  ws.on("message", (data) => {
    try {
      const payload = JSON.parse(data.toString());
      // 校验deviceId
      if (!payload.deviceId || typeof payload.deviceId !== "string") {
        broadcastError("deviceId required");
        return;
      }
      broadcast({ type: "telemetry", ts: Date.now(), ...payload });
    } catch (err) {
      broadcastError("Malformed message");
      console.warn("[WS] Malformed message:", err);
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
