import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();

// Logger Middleware with better formatting
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const logMsg = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
    if (res.statusCode >= 400) {
      console.error(logMsg);
    } else {
      console.log(logMsg);
    }
  });
  next();
});

// Health Check API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
});
const frontendOriginEnv =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://localhost:5174";
const allowedOrigins = frontendOriginEnv.split(",").map((item) => item.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "cache-control", "pragma"],
  }),
);
app.use(express.json());

const PORT = process.env.PORT || 8080;

// In-memory data
const DEVICE_OFFLINE_TIMEOUT = 8000; // 缩短超时判定时间
const devices = [];
const telemetryHistory = []; // Track historical data for trend analysis
const MAX_HISTORY_LENGTH = 100;

// Periodic check for offline devices with broadcast
setInterval(() => {
  const now = Date.now();
  let changed = false;
  devices.forEach((d) => {
    if (d.status === "online" && now - d.lastSeen > DEVICE_OFFLINE_TIMEOUT) {
      d.status = "offline";
      changed = true;
      console.log(`[Status] Node went offline: ${d.name} (${d.id})`);
      // 主动广播设备离线状态，确保前端同步
      broadcast({
        type: "device_status_change",
        deviceId: d.id,
        status: "offline",
        ts: now,
      });
    }
  });

  // 如果状态发生变化，广播最新的设备列表快照
  if (changed) {
    broadcast({
      type: "device_list_update",
      devices: devices.map((d) => ({ ...d })),
    });
  }
}, 2000); // 增加检查频率

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

// Trend Analysis API
app.get("/api/analysis/trends", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, MAX_HISTORY_LENGTH);
    res.json(telemetryHistory.slice(-limit));
  } catch (err) {
    console.error("[API] /api/analysis/trends error:", err);
    res.status(500).json({ error: "Failed to fetch trends" });
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

  // 1. Enhanced Validation for external computers/devices
  if (!payload.deviceId || typeof payload.deviceId !== "string") {
    console.warn("[API] /api/telemetry: deviceId missing or invalid");
    return res.status(400).json({
      error: "deviceId required",
      example: {
        deviceId: "node-01",
        metrics: { throughput: 500, latency: 1.5 },
      },
    });
  }

  // 2. Data Persistence & Device Discovery
  let dev = devices.find((d) => d.id === payload.deviceId);
  if (!dev) {
    dev = {
      id: payload.deviceId,
      name: payload.deviceName || `External Node ${payload.deviceId.slice(-4)}`,
      ip: payload.source || req.ip || "unknown",
      status: "online",
      lastSeen: now,
      stageId: payload.stageId || "AUTH",
    };
    devices.push(dev);
    console.log(`[Discovery] New node connected: ${dev.name} from ${dev.ip}`);
    broadcast({ type: "device_join", device: dev });
  } else {
    dev.lastSeen = now;
    dev.status = "online";
    if (payload.stageId) dev.stageId = payload.stageId;
  }

  // 3. Traffic Analysis & Trend Injection
  if (payload.metrics) {
    const entry = {
      ts: now,
      deviceId: payload.deviceId,
      ...payload.metrics,
    };
    telemetryHistory.push(entry);
    if (telemetryHistory.length > MAX_HISTORY_LENGTH) telemetryHistory.shift();

    // Update global aggregate if it's a gateway-level report
    latestMetrics = { ...latestMetrics, ...payload.metrics };
  }

  // 4. Real-time Delivery & NetFlow Tracking
  broadcast({ type: "telemetry", ts: now, ...payload });

  // Update device count for summary metrics
  const activeNodes = devices.filter((d) => d.status === "online");
  const totalTput = activeNodes.reduce(
    (sum, d) => sum + (d.metrics?.throughput || 0),
    0,
  );

  // 定期广播当前活跃节点统计
  if (Math.random() < 0.2) {
    broadcast({
      type: "stats_update",
      onlineDevices: activeNodes.length,
      totalThroughput: totalTput,
    });
  }

  console.log(
    `[NetFlow] Nodes: ${activeNodes.length} | Load: ${totalTput.toFixed(1)} Mbps | Gateway: RISC-V Zk`,
  );

  res.json({
    ok: true,
    serverTime: now,
    nodeCount: activeNodes.length,
    netLoad: totalTput,
  });
});

// REST: Multi-device Traffic Snapshot (NEW)
app.get("/api/analysis/traffic-map", (req, res) => {
  const onlineDevices = devices.filter((d) => d.status === "online");
  const total = onlineDevices.reduce(
    (sum, d) => sum + (d.metrics?.throughput || 0),
    0,
  );

  const nodeTraffic = onlineDevices.map((d) => ({
    id: d.id,
    name: d.name,
    throughput: d.metrics?.throughput || 0,
    stage: d.stageId || "IDLE",
    contribution:
      total > 0
        ? (((d.metrics?.throughput || 0) / total) * 100).toFixed(1) + "%"
        : "0%",
  }));

  res.json({
    timestamp: Date.now(),
    totalThroughput: total,
    activeNodes: onlineDevices.length,
    distribution: nodeTraffic,
  });
});

// REST: Analysis API for traffic trends (NEW)
app.get("/api/analysis/trends", (req, res) => {
  const windowSize = parseInt(req.query.limit) || 20;
  res.json(telemetryHistory.slice(-windowSize));
});

// REST: Performance Benchmarks (NEW)
app.get("/api/analysis/benchmarks", (req, res) => {
  res.json({
    isa_speedup: latestMetrics.latency
      ? (5.0 / latestMetrics.latency).toFixed(2)
      : 0,
    throughput_gain: latestMetrics.throughput
      ? (latestMetrics.throughput / 100).toFixed(2)
      : 0,
    security_level: "High (RISC-V Zk Extension)",
  });
});

// Platform Statistics
app.get("/api/platform/stats", (req, res) => {
  const onlineCount = devices.filter((d) => d.status === "online").length;
  res.json({
    totalDevices: devices.length,
    onlineDevices: onlineCount,
    totalThroughput: latestMetrics.throughput,
    algorithm: "SM4 Custom ISA",
    securityLevel: "High (HW Accelerated)",
  });
});

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

// WebSocket server (same port)
const wss = new WebSocketServer({ server, path: "/ws/telemetry" });

// 心跳机制：定期清理死连接
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(interval);
});

function heartbeat() {
  this.isAlive = true;
}

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
      if (payload.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
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
          metrics: payload.metrics || {
            throughput: 0,
            latency: 0,
            securityScore: 0,
          },
          stageId: payload.stageId || "AUTH",
          linkType: payload.linkType || "Standard",
        };
        devices.push(newDev);
        console.log(`[WS-External] New device registered: ${newDev.name}`);
        broadcast({ type: "device_join", device: newDev });
      } else {
        dev.lastSeen = now;
        dev.status = "online";
        // 关键：同步设备实时指标状态
        if (payload.metrics)
          dev.metrics = { ...dev.metrics, ...payload.metrics };
        if (payload.stageId) dev.stageId = payload.stageId;
        if (payload.linkType) dev.linkType = payload.linkType;

        // Security Level Check
        if (payload.metrics?.securityScore < 60) {
          broadcast({
            type: "alert",
            level: "danger",
            title: "SECURITY THRESHOLD VOID",
            message: `Node ${dev.name} security integrity dropped to ${payload.metrics.securityScore}%`,
            ts: now,
          });
        }
      }

      // Add to history
      if (payload.metrics) {
        telemetryHistory.push({
          ts: now,
          deviceId: payload.deviceId,
          metrics: payload.metrics,
        });
        if (telemetryHistory.length > MAX_HISTORY_LENGTH) {
          telemetryHistory.shift();
        }
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
