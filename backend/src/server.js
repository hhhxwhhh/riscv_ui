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
const devices = Array.from({ length: 60 }, (_, i) => ({
  id: `dev-${String.fromCharCode(97 + (i % 26))}${i > 25 ? i : ""}`,
  name: `IoT Node ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ""}`,
  ip: `192.168.1.${100 + i}`,
  status: "online",
  lastSeen: Date.now(),
}));

// 动态加入和退出设备模拟 (模拟真实环境活跃度)
setInterval(() => {
  if (Math.random() > 0.5) return; // 50% 概率动作降低抖动

  const action = Math.random() > 0.4 ? "add" : "remove"; // 略微倾向于增加，直到达到上限

  if (action === "add" && devices.length < 80) {
    const nextSuffix = devices.length + 100;
    const newDev = {
      id: `dev-dyn-${nextSuffix}`,
      name: `IoT Node D-${nextSuffix}`,
      ip: `192.168.2.${nextSuffix % 254}`,
      status: "online",
      lastSeen: Date.now(),
    };
    devices.push(newDev);
    console.log(`[Dynamic] Device joined: ${newDev.name} (${newDev.ip})`);
    // 修复：确保 broadcast 函数已定义再调用
    if (typeof broadcast === "function") {
      broadcast({ type: "device_join", device: newDev });
    }
  } else if (action === "remove" && devices.length > 45) {
    // 随机移除一个，但不移除前10个核心节点
    const index = 10 + Math.floor(Math.random() * (devices.length - 10));
    const removed = devices.splice(index, 1)[0];
    // 清理该设备的活跃交易（如果正在进行）
    activeTransactions.delete(removed.ip);
    console.log(`[Dynamic] Device exited: ${removed.name} (${removed.ip})`);
    // 修复：确保 broadcast 函数已定义再调用
    if (typeof broadcast === "function") {
      broadcast({ type: "device_exit", ip: removed.ip, name: removed.name });
    }
  }
}, 8000);

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

// Demo stream: emit telemetry more frequently for testing with 60 devices
const STAGE_IDS = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"];
const activeTransactions = new Map();

setInterval(() => {
  // Progress existing transactions or start new ones
  const activeIps = Array.from(activeTransactions.keys());

  // Decide whether to start a new transaction or progress one
  // Aggressive traffic mode: Try to keep 80% of devices active
  if (activeIps.length < devices.length * 0.8) {
    // Attempt to start multiple transactions per tick to fill up bandwidth
    const newTransactionsCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < newTransactionsCount; i++) {
      const availableLinks = devices.filter(
        (d) => !activeTransactions.has(d.ip),
      );
      if (availableLinks.length > 0) {
        const randomDevice =
          availableLinks[Math.floor(Math.random() * availableLinks.length)];
        activeTransactions.set(randomDevice.ip, {
          deviceId: randomDevice.id,
          deviceName: randomDevice.name,
          deviceIp: randomDevice.ip,
          stageIndex: 0,
          ticksInStage: 0, // Initial delay or status
        });
      }
    }
  }

  // Progress all active transactions
  activeTransactions.forEach((transaction, ip) => {
    // Stage logic with variable duration (staggered effect)
    // Some stages take longer (e.g., DECRYPT on complex hardware)
    if (transaction.ticksInStage > 0) {
      transaction.ticksInStage--;
    } else {
      // Logic to determine how long the NEXT stage should last
      const stageDurations = {
        AUTH: Math.floor(Math.random() * 2), // 0-1 extra ticks
        ENCRYPT: Math.floor(Math.random() * 2) + 1, // 1-2 extra ticks (data transfer)
        DECRYPT: Math.floor(Math.random() * 3) + 1, // 1-3 extra ticks (heavy computation)
        HASH: 0, // Quick finish
      };

      const currentStageId = STAGE_IDS[transaction.stageIndex];
      transaction.ticksInStage = stageDurations[currentStageId] || 0;

      // Only move to next stage if we are NOT at the start of current delay
      // Or simply progress after ticks reach zero (which is handled by this else block)
      // We will actually progress the index AFTER the payload is sent or during this tick
    }

    const currentStageId = STAGE_IDS[transaction.stageIndex];
    const isLast = transaction.stageIndex === STAGE_IDS.length - 1;

    // Simulate different traffic patterns based on device characteristics
    // Some devices are high-performance (multipliers), some are low-power
    const deviceHash = transaction.deviceName.charCodeAt(
      transaction.deviceName.length - 1,
    );
    const trafficProfile = deviceHash % 3; // 0: Low, 1: Normal, 2: High/Burst

    let baseTp, rangeTp;
    if (trafficProfile === 0) {
      baseTp = 50;
      rangeTp = 150; // Low power sensor
    } else if (trafficProfile === 1) {
      baseTp = 400;
      rangeTp = 400; // Normal node
    } else {
      baseTp = 800;
      rangeTp = 800; // High speed terminal or camera
    }

    // Add random noise and stage-specific variations
    // Encryption/Decryption might be slightly slower/heavier in some contexts
    const stageMultiplier =
      currentStageId === "ENCRYPT" || currentStageId === "DECRYPT" ? 0.9 : 1.1;
    const finalThroughput = Math.floor(
      (baseTp + Math.random() * rangeTp) * stageMultiplier,
    );

    const payload = {
      type: "telemetry",
      deviceId: transaction.deviceId,
      source: transaction.deviceIp,
      status: "active",
      stageId: currentStageId,
      isLastStage: isLast,
      metrics: {
        throughput: finalThroughput,
        latency: Number((0.4 + Math.random() * 2.5).toFixed(2)),
        securityScore: Math.floor(88 + Math.random() * 12),
      },
      ts: Date.now(),
    };

    // Update the latest global metrics for REST API consistency
    latestMetrics = {
      throughput: payload.metrics.throughput,
      latency: payload.metrics.latency,
      securityScore: payload.metrics.securityScore,
    };

    broadcast(payload);

    // Only progress to next stage or finish if the wait time for current stage is over
    if (transaction.ticksInStage === 0) {
      if (isLast) {
        activeTransactions.delete(ip);
      } else {
        transaction.stageIndex++;
      }
    }
  });
}, 500);
