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

wss.on("connection", function connection(ws) {
  console.log("Client connected via WebSocket");

  // Pick all IPs for telemetry simulation
  const deviceIps = devices.map((d) => d.ip);

  // Send a welcome message
  ws.send(
    JSON.stringify({
      type: "info",
      message: "Connected to Mock Telemetry Server",
    }),
  );

  // Simulate device traffic
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      // Pick a random device
      const deviceIp = deviceIps[Math.floor(Math.random() * deviceIps.length)];

      // Create a packet
      const packet = {
        source: deviceIp,
        timestamp: Date.now(),
        status: "active",
        metrics: {
          throughput: 800 + Math.random() * 200,
          latency: 0.5 + Math.random() * 2,
          securityScore: 90 + Math.random() * 10,
        },
      };

      ws.send(JSON.stringify(packet));
    }
  }, 1500); // Slightly faster

  ws.on("close", () => {
    console.log("Client disconnected");
    clearInterval(interval);
  });
});

server.listen(HTTP_PORT);
