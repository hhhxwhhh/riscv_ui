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
      message: "Connected to Mock Lifecycle Server (Simulation Disabled)",
    }),
  );

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(HTTP_PORT);
