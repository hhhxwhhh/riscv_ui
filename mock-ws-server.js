import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });

console.log("Mock Telemetry Server started on ws://localhost:8080");

const devices = [
  "192.168.1.101",
  "192.168.1.102",
  "192.168.1.103",
  "192.168.1.104",
];

wss.on("connection", function connection(ws) {
  console.log("Client connected");

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
      const deviceIp = devices[Math.floor(Math.random() * devices.length)];

      // Create a packet
      const packet = {
        source: deviceIp,
        timestamp: Date.now(),
        status: "active",
        metrics: {
          cpu: Math.floor(Math.random() * 100),
          memory: Math.floor(Math.random() * 1024),
        },
      };

      console.log(`Sending update for ${deviceIp}`);
      ws.send(JSON.stringify(packet));
    }
  }, 2000); // Every 2 seconds

  ws.on("close", () => {
    console.log("Client disconnected");
    clearInterval(interval);
  });

  ws.on("error", console.error);
});
