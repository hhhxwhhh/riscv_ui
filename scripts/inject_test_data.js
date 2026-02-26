import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080/ws/telemetry';
const STAGE_IDS = ["AUTH", "ENCRYPT", "DECRYPT", "HASH"];
const DEVICE_COUNT = 25;
const types = ["Sensor", "Camera", "Node", "Relay", "Terminal"];

console.log(`启动高效真实数据注入测试... (单连接多节点模式)`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log("WebSocket 连接已建立，开始注入数据流...");

    for (let i = 1; i <= DEVICE_COUNT; i++) {
        const type = types[i % types.length];
        const id = `real-dev-${i.toString().padStart(3, '0')}`;
        const name = `${type} ${String.fromCharCode(65 + (i % 26))}-${i}`;
        const ip = `192.168.1.${50 + i}`;

        // 启动每个设备的独立逻辑，但共享同一个 ws 连接
        startDeviceLifecycle(id, name, ip);
    }
});

function startDeviceLifecycle(deviceId, deviceName, ip) {
    let currentStageIdx = 0;

    const sendNext = () => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const stageId = STAGE_IDS[currentStageIdx];
        const isLast = currentStageIdx === STAGE_IDS.length - 1;

        const payload = {
            type: "telemetry",
            deviceId: deviceId,
            deviceName: deviceName,
            source: ip,
            status: "active",
            stageId: stageId,
            isLastStage: isLast,
            metrics: {
                throughput: Math.floor(2000 + Math.random() * 5000),
                latency: Number((0.5 + Math.random() * 0.5).toFixed(2)),
                securityScore: Math.floor(95 + Math.random() * 5)
            }
        };

        ws.send(JSON.stringify(payload));

        // 进入下一阶段或循环回到初始阶段
        if (isLast) {
            currentStageIdx = 0;
            setTimeout(sendNext, 5000 + Math.random() * 5000); 
        } else {
            currentStageIdx++;
            setTimeout(sendNext, 1500 + Math.random() * 1500); 
        }
    };

    // 随机错峰启动
    setTimeout(sendNext, Math.random() * 10000);
}

ws.on('error', (err) => {
    console.error("WebSocket 错误:", err.message);
});

ws.on('close', () => {
    console.warn("WebSocket 连接关闭，正在重新启动测试脚本...");
    process.exit(1); 
});

