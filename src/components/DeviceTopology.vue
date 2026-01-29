<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch, computed } from 'vue';
import * as echarts from 'echarts';
import type { StageInfo } from '../api/stages';
import gatewaySvgRaw from '../svgs/gateway.svg?raw';

type DeviceInfo = {
    id?: string;
    name: string;
    ip: string;
    status?: string;
};

const props = defineProps<{
    modelValue?: string | string[]; // Support array for multi-track
    devices?: DeviceInfo[],
    stage: StageInfo
}>();

const emit = defineEmits(['update:modelValue', 'node-select', 'ws-status', 'ws-last-message', 'telemetry']);

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

// Track multiple selections
const selectedNodeNames = ref<string[]>(
    Array.isArray(props.modelValue) ? props.modelValue : (props.modelValue ? [props.modelValue] : [])
);

const viewMode = ref<'stage' | 'device' | 'all'>('stage');
let optionBuilder: ((selectedNames: string[]) => echarts.EChartsOption) | null = null;

// 计算网关实时吞吐量
const gatewayThroughput = computed(() => {
    return deviceNodes.value.reduce((sum, node) => sum + (node.throughput || 0), 0);
});

// 根据吞吐量计算网关颜色（从浅红到深红）
const getGatewayColor = (throughput: number) => {
    // 定义最大吞吐量阈值，用于确定颜色深度
    const maxExpectedThroughput = 5000; // 可根据实际情况调整
    const intensity = Math.min(1, throughput / maxExpectedThroughput); // 确保强度不超过1

    // 计算从浅红到深红的变化
    const red = 255;
    const green = Math.floor(255 * (1 - intensity * 0.7)); // 绿色随吞吐量增加而减少
    const blue = Math.floor(255 * (1 - intensity * 0.7)); // 蓝色随吞吐量增加而减少
    return `rgb(${red}, ${green}, ${blue})`;
};


// Define Nodes Configuration (Made Reactive for Real Data updates)
// We add 'isBlinking' state to track activity and stageId for individual flow status
type NodeData = {
    name: string;
    x: number;
    y: number;
    value: string;
    category: string;
    isBlinking: boolean;
    stageId: string;
    throughput: number; // For traffic variation
    description?: string;
};
const nodes = ref<NodeData[]>([]);

const calculatePositions = (count: number) => {
    const centerX = 400;
    const centerY = 200; // Shifted slightly for better fit
    const radiusX = 350;
    const radiusY = 175;

    // Generate dozens of points in a responsive arc or circle
    return Array.from({ length: count }, (_, i) => {
        // Use full circle if count is high, otherwise arc
        const isHighCount = count > 30;
        const angle = isHighCount
            ? (i / count) * 2 * Math.PI
            : (i / (count - 1 || 1)) * Math.PI - Math.PI;

        return {
            x: centerX + Math.cos(angle) * (isHighCount ? radiusX * 0.9 : radiusX),
            y: centerY + Math.sin(angle) * (isHighCount ? radiusY * 0.9 : radiusY)
        };
    });
};

const buildNodesFromDevices = (devices?: DeviceInfo[]) => {
    const previousState = new Map(nodes.value.map((node) => [node.name, {
        isBlinking: node.isBlinking,
        throughput: node.throughput,
        stageId: node.stageId
    }]));
    const stageIds = ['AUTH', 'ENCRYPT', 'DECRYPT', 'HASH'];

    // If no devices provided, generate 60 demo devices with varied names
    const defaultDevices = Array.from({ length: 60 }, (_, i) => {
        const types = ['Sensor', 'Camera', 'Node', 'Relay', 'Terminal'];
        const type = types[i % types.length];
        return {
            name: `IoT ${type} ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ''}`,
            ip: `192.168.1.${100 + i}`,
            type: 'device'
        };
    });

    const gatewayName = 'A100 Gateway';
    // Filter and deduplicate: Remove any device that matches the gateway name or has a duplicate name
    const seenNames = new Set([gatewayName]);
    const deviceList = ((devices && devices.length) ? devices : defaultDevices)
        .filter(device => {
            if (!device.name || seenNames.has(device.name)) return false;
            seenNames.add(device.name);
            return true;
        });

    const positions = calculatePositions(deviceList.length);

    const gateway = {
        name: gatewayName,
        x: 400,
        y: 200,
        value: '192.168.1.1',
        category: 'gateway',
        isBlinking: previousState.get(gatewayName)?.isBlinking || false,
        stageId: props.stage.id || 'AUTH',
        throughput: previousState.get(gatewayName)?.throughput || 100,
        description: 'Secure RISC-V Cryptoverse Hub'
    };

    const deviceNodes = deviceList.map((device, index) => {
        const pos = positions[index] || { x: 0, y: 0 };
        const prevState = previousState.get(device.name);
        return {
            name: device.name,
            x: pos.x,
            y: pos.y,
            value: device.ip,
            category: 'device',
            isBlinking: prevState?.isBlinking || false,
            stageId: prevState?.stageId || stageIds[index % stageIds.length] || 'AUTH',
            throughput: prevState?.throughput || 0 // Default to 0 for devices
        };
    });

    nodes.value = [gateway, ...deviceNodes];
};

buildNodesFromDevices(props.devices);

// ----------------------------------------------------------------------
// Real Data Interface
// ----------------------------------------------------------------------

// WebSocket Configuration
// Use environment variable VITE_WS_URL if available, otherwise fallback to local mock server
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
let socket: WebSocket | null = null;

type TelemetryPacket = {
    source: string;
    status?: string;
    [key: string]: unknown;
};

const blinkTimeouts = new Map<string, number>();
let renderQueued = false;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let isDisposed = false;

const scheduleRender = () => {
    if (!chartInstance || !optionBuilder || renderQueued || isDisposed) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        if (isDisposed || !chartInstance) return;
        try {
            chartInstance.setOption(optionBuilder!(selectedNodeNames.value));
        } catch (err) {
            console.error('Error during ECharts render:', err);
        }
    });
};

const handleIncomingPacket = (packet: TelemetryPacket) => {
    if (isDisposed) return;
    emit('ws-last-message', Date.now());
    emit('telemetry', packet);

    // 修复：如果不是普通的遥测数据（例如设备加入/退出消息），则跳过后续的节点更新逻辑
    if (!packet?.source || packet.type === 'device_join' || packet.type === 'device_exit') return;

    // Use value (IP) to find node
    const targetNode = nodes.value.find(n => n.value === packet.source || n.value.includes(packet.source));

    if (targetNode) {
        // Update stage if provided (lifecycle logic)
        if (packet.stageId && typeof packet.stageId === 'string') {
            targetNode.stageId = packet.stageId;
        }

        // Update traffic metrics
        if (packet.metrics && typeof packet.metrics === 'object') {
            const m = packet.metrics as any;
            if (m.throughput) {
                targetNode.throughput = Number(m.throughput);
            }
        }

        // Activate Blink State
        targetNode.isBlinking = true;

        // Trigger visual update
        scheduleRender();

        // If it's the last stage, clear its active status after a longer period to show completion
        // Otherwise, standard 1100ms blink (matches mock-server 1200ms cycle)
        const clearDelay = packet.isLastStage ? 3000 : 1100;

        const existing = blinkTimeouts.get(targetNode.name);
        if (existing) window.clearTimeout(existing);

        const timeoutId = window.setTimeout(() => {
            if (isDisposed) return;
            targetNode.isBlinking = false;
            // Optionally reset throughput to 0 or low value when inactive
            targetNode.throughput = 0;
            scheduleRender();
            blinkTimeouts.delete(targetNode.name);
        }, clearDelay);
        blinkTimeouts.set(targetNode.name, timeoutId);
    }
};

const scheduleReconnect = () => {
    if (isDisposed) return;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    const jitter = Math.floor(Math.random() * 250);
    const delay = baseDelay + jitter;
    reconnectTimer = window.setTimeout(() => {
        reconnectAttempts += 1;
        startDataListener();
    }, delay);
};

const startDataListener = () => {
    if (isDisposed) return;
    emit('ws-status', 'connecting');
    // Clean up existing socket if any
    if (socket) {
        socket.close();
    }

    try {
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            reconnectAttempts = 0;
            emit('ws-status', 'connected');
            console.log(`Connected to Telemetry Server at ${WS_URL}`);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleIncomingPacket(data);
            } catch (err) {
                console.error('Error parsing telemetry data:', err);
            }
        };

        socket.onerror = (err) => {
            emit('ws-status', 'disconnected');
            console.error('WebSocket error:', err);
        };

        socket.onclose = (event) => {
            if (isDisposed) return;
            emit('ws-status', 'disconnected');
            console.warn('WebSocket closed. Code:', event.code, 'Reason:', event.reason, 'Reconnecting...');
            scheduleReconnect();
        };
    } catch (err) {
        emit('ws-status', 'disconnected');
        console.error('Failed to establish WebSocket connection:', err);
        // 即使连接失败也要尝试重连
        scheduleReconnect();
    }
};

const theme = {
    primary: '#7dd3fc',
    success: '#34d399',
    danger: '#fb7185',
    accent: '#a78bfa',
    warning: '#fbbf24',
    grid: '#243047',
    line: '#1f3b72',
    lineReturn: '#0f4c3a',
    textMuted: '#94a3b8'
};

const deviceNodes = computed(() => nodes.value.filter(node => node.category === 'device'));

const applySelection = (names: string[]) => {
    if (!chartInstance || !optionBuilder || isDisposed) return;
    selectedNodeNames.value = names;
    scheduleRender();
};

const selectNode = (name: string) => {
    if (name === 'Gateway' || name === 'A100 Gateway') return;

    let newSelections = [...selectedNodeNames.value];
    const index = newSelections.indexOf(name);

    if (index > -1) {
        newSelections.splice(index, 1);
    } else {
        // Limit to 2 for direct "A to B" tracking, or 3 for general monitoring
        if (newSelections.length >= 2) {
            newSelections.shift(); // Remove oldest
        }
        newSelections.push(name);
    }

    selectedNodeNames.value = newSelections;
    emit('update:modelValue', newSelections);

    const firstNode = nodes.value.find(n => n.name === newSelections[0]);
    emit('node-select', firstNode || { name: '', value: '' });
    applySelection(newSelections);
};

const getStageContext = (stageId: string) => {
    let color = theme.primary;
    let text = 'PENDING';
    switch (stageId) {
        case 'AUTH': color = theme.accent; text = 'IDENTITY AUTH'; break;
        case 'ENCRYPT': color = theme.success; text = 'ENCRYPTED'; break;
        case 'DECRYPT': color = '#f472b6'; text = 'DECRYPTION'; break;
        case 'HASH': color = theme.warning; text = 'SM3 HASHING'; break;
    }
    return { color, text };
};

onMounted(() => {
    startDataListener();

    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Initial Emit
        const initialNode = nodes.value.find(n => selectedNodeNames.value.includes(n.name));
        if (initialNode) emit('node-select', initialNode);

        const getOption = (selectedNames: string[]): echarts.EChartsOption => {
            const nodeMap: Record<string, [number, number]> = {};
            nodes.value.forEach(n => nodeMap[n.name] = [n.x, n.y]);

            const stageIds = ['AUTH', 'ENCRYPT', 'DECRYPT', 'HASH'];
            const linesByStage: Record<string, any[]> = { AUTH: [], ENCRYPT: [], DECRYPT: [], HASH: [] };

            const isGlobal = selectedNames.length === 0;
            const isRelayMode = selectedNames.length === 2; // Tracking A to B

            nodes.value.forEach(node => {
                if (node.category === 'gateway') return;

                // Lifecycle filter: In global view, only show flows for active/blinking devices
                const isActive = node.isBlinking || node.throughput > 0;
                const isSelected = selectedNames.includes(node.name);

                if (isGlobal && !isActive) return;
                if (!isGlobal && !isSelected) return;

                let stagesToShow: string[] = [];
                if (viewMode.value === 'all' || isRelayMode) {
                    if (!isGlobal) {
                        stagesToShow = stageIds; // Show full cycle for selected devices or relay mode
                    } else {
                        stagesToShow = [node.stageId]; // Show distributed stages in global view
                    }
                } else {
                    stagesToShow = [props.stage.id]; // Strict stage sync
                }

                const nodeA = selectedNames[0] || '';
                const nodeB = selectedNames[1] || '';

                stagesToShow.forEach((sid) => {
                    const gatewayNode = nodes.value.find(n => n.category === 'gateway');
                    if (!gatewayNode) return;

                    const isActive = node.isBlinking || node.throughput > 0;
                    if (isActive && node.stageId !== sid) return;

                    let source = node.name;
                    let target = gatewayNode.name;

                    // Realistic Flow Logic based on stage definitions
                    // AUTH: Device <-> Gateway (Bidirectional pulse)
                    // ENCRYPT: Device -> Gateway (Upload)
                    // DECRYPT: Gateway (Internal Processing)
                    // HASH: Gateway -> Target (Relay/Forward)

                    if (isRelayMode) {
                        const isNodeA = node.name === nodeA;
                        const isNodeB = node.name === nodeB;

                        // In Relay Mode, the ACTIVE node drives the flow animation for the entire chain
                        // If Node A is active: A->GW (Auth/Enc) -> GW (Decrypt) -> GW->B (Hash)
                        // If Node B is active: B->GW (Auth/Enc) -> GW (Decrypt) -> GW->A (Hash)

                        if (isNodeA) {
                            if (sid === 'AUTH' || sid === 'ENCRYPT') {
                                source = nodeA; target = gatewayNode.name;
                            } else if (sid === 'DECRYPT') {
                                // Handled by Internal Loop logic below (target irrelevant but set to GW for safety)
                                source = gatewayNode.name; target = gatewayNode.name;
                            } else if (sid === 'HASH') {
                                // Final leg: Gateway delivers to the OTHER node
                                source = gatewayNode.name; target = nodeB;
                            } else {
                                return;
                            }
                        } else if (isNodeB) {
                            if (sid === 'AUTH' || sid === 'ENCRYPT') {
                                source = nodeB; target = gatewayNode.name;
                            } else if (sid === 'DECRYPT') {
                                source = gatewayNode.name; target = gatewayNode.name;
                            } else if (sid === 'HASH') {
                                source = gatewayNode.name; target = nodeA;
                            } else {
                                return;
                            }
                        } else {
                            return; // Not part of relay
                        }
                    } else {
                        // Standard Single Node View
                        if (sid === 'AUTH') {
                            // Handshake: often shown as bi-directional or Device->Gateway initiator
                            source = node.name; target = gatewayNode.name;
                        } else if (sid === 'ENCRYPT') {
                            source = node.name; target = gatewayNode.name;
                        } else if (sid === 'HASH' || sid === 'DECRYPT') {
                            // After processing, data is "accepted" or "confirmed" (Gateway->Device response)
                            source = gatewayNode.name; target = node.name;
                        }
                    }

                    const sPos = nodeMap[source];
                    const tPos = nodeMap[target];

                    if (sPos && tPos && linesByStage[sid]) {
                        const tput = node.throughput || 100;
                        const flowOpacity = isActive ? Math.max(0.7, Math.min(1, tput / 600)) : 0.05;
                        const ctx = getStageContext(sid);

                        // Internal Loop for DECRYPT stage (Processing inside RISC-V)
                        // In Relay mode, highlight gateway internal activity
                        if (sid === 'DECRYPT' && (isRelayMode || isSelected)) {
                            const gx = gatewayNode.x;
                            const gy = gatewayNode.y;
                            linesByStage[sid].push({
                                coords: [[gx, gy], [gx + 35, gy - 45], [gx + 70, gy], [gx + 35, gy + 45], [gx, gy]],
                                lineStyle: { width: 2, opacity: flowOpacity, color: ctx.color },
                                // Added for tooltip
                                sourceName: 'Gateway Engine',
                                targetName: 'HW Accelerator',
                                stageName: ctx.text,
                                throughput: tput
                            });
                        } else {
                            const curve = isGlobal ? 0.2 : (0.1 + (stageIds.indexOf(sid) * 0.15));

                            linesByStage[sid].push({
                                coords: [sPos, tPos],
                                lineStyle: {
                                    width: 1.8,
                                    curveness: isRelayMode ? (node.name === nodeB ? -0.25 : 0.25) : curve,
                                    opacity: flowOpacity,
                                    color: ctx.color
                                },
                                // Added for tooltip
                                sourceName: source,
                                targetName: target,
                                stageName: ctx.text,
                                throughput: tput
                            });
                        }
                    }
                });
            });

            const series: any[] = [];

            const coreGateway = nodes.value.find(n => n.category === 'gateway');
            if (coreGateway) {
                // Core Pulse Rings - 根据吞吐量调整颜色和脉冲频率
                const maxThroughput = 3000;
                const throughputIntensity = Math.min(1, gatewayThroughput.value / maxThroughput);
                const redValue = Math.floor(255 * (0.6 + 0.4 * throughputIntensity));
                const greenValue = Math.floor(113 * (1 - 0.6 * throughputIntensity));
                const gatewayColor = `rgb(${redValue}, ${greenValue}, 133)`;
                const alphaValue = 0.1 + 0.2 * throughputIntensity; // 基础透明度随负载增加

                // 主要脉冲环 - 颜色、大小和周期都随吞吐量变化
                series.push({
                    type: 'effectScatter',
                    coordinateSystem: 'cartesian2d',
                    silent: true,
                    data: [{
                        name: 'Gateway Pulse',
                        value: [coreGateway.x, coreGateway.y]
                    }],
                    symbolSize: 100 + 40 * throughputIntensity, // 负载越高，脉冲环越大
                    showEffectOn: 'render',
                    rippleEffect: {
                        brushType: 'stroke',
                        scale: 1.5,
                        period: 3.5 - 1.5 * throughputIntensity, // 负载越高，脉冲越快
                        color: gatewayColor
                    },
                    itemStyle: {
                        color: `rgba(${redValue}, ${greenValue}, 133, ${alphaValue})`,
                        shadowBlur: 15,
                        shadowColor: gatewayColor
                    },
                    z: 0
                });

                // 添加额外的脉冲环，以增强视觉效果 - 也随吞吐量变化
                series.push({
                    type: 'effectScatter',
                    coordinateSystem: 'cartesian2d',
                    silent: true,
                    data: [{
                        name: 'Gateway Secondary Pulse',
                        value: [coreGateway.x, coreGateway.y]
                    }],
                    symbolSize: 140 + 60 * throughputIntensity, // 大小随负载变化
                    showEffectOn: 'render',
                    rippleEffect: {
                        brushType: 'stroke',
                        scale: 2,
                        period: 5 - 2 * throughputIntensity, // 周期随负载变化
                        color: gatewayColor
                    },
                    itemStyle: {
                        color: 'transparent',
                        borderColor: gatewayColor,
                        borderWidth: 1,
                        opacity: 0.2 + 0.2 * throughputIntensity // 透明度随负载增加
                    },
                    z: 0
                });
            }

            // 0. Background Decorative Layer (Space filler)
            series.push({
                type: 'graph',
                coordinateSystem: 'cartesian2d',
                layout: 'none',
                silent: true,
                z: 0,
                // 为每个节点添加脉冲效果
                data: nodes.value.map((node, idx) => {
                    if (node.category === 'gateway') return null; // 不为网关添加装饰节点

                    // 计算围绕每个节点的装饰点
                    const angle = (idx * 137.5) % 360; // 黄金角度，避免重叠
                    const distance = 15 + (idx % 5) * 5; // 随机距离
                    const x = node.x + Math.cos(angle) * distance;
                    const y = node.y + Math.sin(angle) * distance;

                    return {
                        x: x,
                        y: y,
                        symbolSize: Math.random() * 1.5 + 0.5,
                        itemStyle: {
                            color: 'rgba(125, 211, 252, 0.2)',
                            // 添加脉冲动画
                            shadowBlur: 5,
                            shadowColor: 'rgba(125, 211, 252, 0.4)'
                        }
                    };
                }).filter(Boolean), // 过滤掉null值
                links: [],
                itemStyle: {
                    opacity: 0.5
                }
            });

            // 1. Multi-stage Traffic Lines
            stageIds.forEach(sid => {
                const currentLines = linesByStage[sid];
                if (!currentLines || currentLines.length === 0) return;

                const ctx = getStageContext(sid);

                let avgTput = 0;
                if (isGlobal) {
                    const stageNodes = nodes.value.filter(n => n.stageId === sid || viewMode.value !== 'all');
                    if (stageNodes.length > 0) {
                        avgTput = stageNodes.reduce((acc, n) => acc + n.throughput, 0) / stageNodes.length;
                    }
                } else {
                    // 修复：寻找当前正在该阶段活跃的节点来决定流动速度
                    const activeInStage = nodes.value.find(n => selectedNames.includes(n.name) && n.stageId === sid && n.isBlinking);
                    avgTput = activeInStage ? activeInStage.throughput : 50;
                }

                // Speed calculation: high throughput = faster particles
                // Period 2s (fast) to 6s (slow)
                const effectPeriod = Math.max(1.5, Math.min(6, 8 - (avgTput / 200)));

                series.push({
                    type: 'lines',
                    name: `Flow-${sid}`,
                    silent: false,
                    coordinateSystem: 'cartesian2d',
                    effect: {
                        show: true,
                        period: effectPeriod,
                        trailLength: 0.1,
                        symbol: 'arrow',
                        symbolSize: isGlobal ? 3 : 5,
                        color: ctx.color
                    },
                    lineStyle: {
                        color: ctx.color,
                        width: 1.5,
                        curveness: 0.2,
                        opacity: isGlobal ? 0.3 : 0.7
                    },
                    data: currentLines,
                    z: 1
                });
            });

            // 3. Visual Layer
            series.push({
                type: 'graph',
                coordinateSystem: 'cartesian2d',
                layout: 'none',
                silent: true,
                symbolSize: 60,
                roam: false,
                label: {
                    show: true,
                    position: 'bottom',
                    color: '#d1d5db',
                    formatter: (p: any) => {
                        const isGateway = p.name.includes('Gateway');
                        const deviceNode = nodes.value.find(n => n.name === p.name);

                        // Lifecycle: In global view, labels might be hidden for non-active devices to focus on active ones
                        const isActive = deviceNode?.isBlinking || (deviceNode?.throughput || 0) > 0;
                        const isSelected = selectedNames.includes(p.name);

                        if (isGlobal && !isGateway && !isActive) return '';

                        // Determine which stage to display in the label
                        // Priority: Node's actual reported stage if it's active or if we're in 'Full Cycle' mode
                        const sid = (viewMode.value === 'all' || isActive)
                            ? (deviceNode?.stageId || 'AUTH')
                            : props.stage.id;

                        const ctx = getStageContext(sid);
                        const tput = deviceNode?.throughput ? `${Math.round(deviceNode.throughput)} Mbps` : '';

                        let prefix = '';
                        if (isRelayMode && isSelected) {
                            prefix = selectedNames.indexOf(p.name) === 0 ? '【SOURCE】' : '【TARGET】';
                        }

                        if (isGateway) return `{name|${p.name}}\n{tput|Total Throughput: ${Math.round(gatewayThroughput.value)} Mbps}\n{stage|${props.stage.id}}`;
                        return `{name|${prefix}${p.name}}\n{ip|${p.value}}\n{tput|${tput}}\n{badge| ${ctx.text} }`;
                    },
                    rich: {
                        name: { fontSize: 11, fontWeight: 'bold', color: '#e5e7eb', padding: [0, 0, 1, 0], align: 'center' },
                        ip: { fontSize: 9, color: '#9ca3af', align: 'center', padding: [0, 0, 1, 0] },
                        tput: { fontSize: 9, color: '#7dd3fc', align: 'center', padding: [0, 0, 2, 0], fontWeight: 'bold' },
                        stage: { fontSize: 10, color: '#fff', backgroundColor: theme.danger, padding: [2, 4], borderRadius: 4, fontWeight: 'bold' },
                        badge: { fontSize: 8, color: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'currentColor', borderWidth: 1, padding: [1, 3], borderRadius: 2 }
                    }
                },
                data: nodes.value.map(node => {
                    const isGateway = node.name.includes('Gateway');
                    const isSelected = selectedNames.includes(node.name);

                    const isActive = node.isBlinking || node.throughput > 0;
                    // In global view, dim or hide inactive node icons
                    const opacity = (isGlobal && !isGateway && !isActive) ? 0.2 : 1.0;

                    // Icon color and state should reflect real-time stage if active
                    const sid = (viewMode.value === 'all' || isActive) ? node.stageId : (isSelected ? props.stage.id : node.stageId);
                    const ctx = getStageContext(sid);

                    let color = isGateway ? getGatewayColor(gatewayThroughput.value) : (isSelected ? ctx.color : (isGlobal ? ctx.color : theme.textMuted));

                    // Realistic Touch: Gateway breathes intensely when RISC-V Crypto acceleration is active
                    let shadowBlur = isSelected ? 30 : 5;
                    const isGatewayProcessing = isGateway && nodes.value.some(n => n.isBlinking && (n.stageId === 'DECRYPT' || n.stageId === 'HASH'));
                    if (isGatewayProcessing) {
                        shadowBlur = 45; // Enhanced glow for hardware active
                    }

                    if (node.isBlinking && !isGateway) {
                        color = theme.warning;
                        shadowBlur = 25;
                    }

                    return {
                        ...node,
                        symbol: isGateway ? 'image://' + gatewaySvgRaw : 'circle', // 对于非网关节点使用圆形
                        symbolKeepAspect: false,
                        symbolSize: isGateway ? 55 : (isSelected ? 12 : 8), // 调整符号大小
                        itemStyle: {
                            opacity: opacity,
                            color: color,
                            shadowBlur: shadowBlur,
                            shadowColor: `${color}${isSelected || isGatewayProcessing || node.isBlinking ? 'B0' : '40'})`
                        },
                        label: {
                            show: opacity > 0.3,
                            rich: {
                                badge: { color: color, borderColor: color }
                            }
                        }
                    };
                }),
                links: nodes.value
                    .filter(node => node.category === 'device' && (isGlobal || selectedNames.includes(node.name)))
                    .map(node => ({ source: 'A100 Gateway', target: node.name })),
                lineStyle: { color: 'rgba(255,255,255,0.1)', width: 1, type: 'dashed', curveness: 0.2 },
                z: 2
            });

            // 4. Interaction Layer
            series.push({
                name: 'InteractionLayer',
                type: 'graph',
                coordinateSystem: 'cartesian2d',
                layout: 'none',
                cursor: 'pointer',
                symbolSize: 60,
                itemStyle: { opacity: 0 },
                data: nodes.value.map(node => ({
                    name: node.name,
                    value: node.value,
                    x: node.x,
                    y: node.y,
                    symbol: 'circle'
                })),
                z: 10
            });

            return {
                title: {
                    text: isRelayMode ? 'End-to-End Relay Security Inspection' : 'Multi-Flow Security Stage Monitor',
                    subtext: isRelayMode ? `Secure Path: ${selectedNames[0]} → A100 Gateway → ${selectedNames[1]}` : (selectedNames.length ? `Tracking: ${selectedNames.join(', ')}` : 'Global Network Tracking'),
                    left: 'center',
                    top: 10,
                    textStyle: { color: theme.textMuted, fontSize: 16 }
                },
                graphic: [
                    {
                        type: 'group',
                        left: 20,
                        top: 20,
                        children: [
                            {
                                type: 'rect',
                                shape: { width: 220, height: 200, r: 4 }, // 增加高度以容纳新内容
                                style: { fill: 'rgba(15, 23, 42, 0.7)', stroke: 'rgba(125, 211, 252, 0.4)', lineWidth: 2 }
                            },
                            {
                                type: 'circle',
                                shape: { r: 5 },
                                style: { fill: theme.success },
                                left: 195,
                                top: 16
                            },
                            {
                                type: 'text',
                                style: {
                                    text: 'SYSTEM TELEMETRY',
                                    fill: '#7dd3fc',
                                    font: 'bold 13px sans-serif'
                                },
                                left: 15,
                                top: 15
                            },
                            {
                                type: 'text',
                                style: {
                                    text: [
                                        `PROTO: SM4-CBC/CTR-V2.0`,
                                        `AUTH: SM2-ID-CERT-V1.28`,
                                        `IO: ${nodes.value.filter(n => n.isBlinking).length} Act / ${nodes.value.length} Node`,
                                        `Throughput: ${Math.round(gatewayThroughput.value)} Mbps`,
                                        `Processing Rate: ${(gatewayThroughput.value / 8).toFixed(1)} MB/s`,
                                        `GATEWAY SPEEDUP: ${(gatewayThroughput.value / 300).toFixed(1)}x`,
                                        `STATUS: LIVE-STREAMING`,
                                        `RISC-V: HARDWARE-ACCEL`,
                                    ].join('\n'),
                                    fill: '#94a3b8',
                                    font: '12px monospace',
                                    lineHeight: 18
                                },
                                left: 15,
                                top: 35
                            },
                        ]
                    }
                ],
                tooltip: {
                    trigger: 'item' as const,
                    formatter: (params: any) => {
                        if (params.seriesType === 'lines') {
                            const data = params.data;
                            const ctx = getStageContext(props.stage.id);
                            const proto = data.stageName.includes('AUTH') ? 'SM2 / TLS' :
                                (data.stageName.includes('ENCRYPT') ? 'SM4-CBC' :
                                    (data.stageName.includes('HASH') ? 'SM3-HMAC' : 'RISC-V ISA'));

                            return `
                                <div class="px-3 py-2 font-mono text-xs">
                                    <div class="border-b border-gray-600 pb-1 mb-2 flex justify-between items-center">
                                        <b class="text-sky-400">Secure Channel</b>
                                        <span class="text-[9px] bg-sky-900/50 text-sky-200 px-1.5 py-0.5 rounded border border-sky-700/50">ACTIVE</span>
                                    </div>
                                    <div class="space-y-1.5 min-w-[160px]">
                                        <div class="flex justify-between">
                                            <span class="text-gray-500">Source:</span>
                                            <span class="text-gray-200">${data.sourceName}</span>
                                        </div>
                                        <div class="flex justify-between">
                                            <span class="text-gray-500">Target:</span>
                                            <span class="text-gray-200">${data.targetName}</span>
                                        </div>
                                        <div class="flex justify-between">
                                            <span class="text-gray-500">Protocol:</span>
                                            <span class="text-sky-300 font-bold">${proto}</span>
                                        </div>
                                        <div class="flex justify-between">
                                            <span class="text-gray-500">Payload:</span>
                                            <span class="text-gray-300">${data.throughput ? (data.throughput / 8).toFixed(1) : 0} MB/s</span>
                                        </div>
                                        <div class="mt-2 pt-1 border-t border-gray-700 flex items-center justify-between">
                                            <span class="text-[9px] text-gray-500 italic">Current Phase:</span>
                                            <span style="color: ${ctx.color}" class="text-[10px] font-bold uppercase">${data.stageName}</span>
                                        </div>
                                    </div>
                                `;
                        }

                        if (params.seriesName === 'InteractionLayer') {
                            const node = nodes.value.find(n => n.name === params.name);
                            const sid = (selectedNames.includes(params.name) && viewMode.value !== 'all') ? props.stage.id : (node?.stageId || 'AUTH');
                            const ctx = getStageContext(sid);
                            const isGateway = params.name.includes('Gateway');

                            return `
                                <div class="px-3 py-2 font-mono text-xs">
                                    <div class="border-b border-gray-600 pb-1 mb-2 flex justify-between items-center">
                                        <b class="${isGateway ? 'text-rose-400' : 'text-blue-400'}">${params.name}</b>
                                        <span class="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">${isGateway ? 'Security Hub' : 'IoT Node'}</span>
                                    </div>
                                    <div class="space-y-1.5 min-w-[180px]">
                                        <div class="flex justify-between">
                                            <span class="text-gray-500">IP Addr:</span>
                                            <span class="text-gray-200 font-bold">${params.value}</span>
                                        </div>
                                        <div class="flex justify-between">
                                            <span class="text-gray-500">Security:</span>
                                            <span style="color: ${ctx.color}" class="font-bold">${ctx.text}</span>
                                        </div>
                                        ${isGateway ? `
                                            <div class="mt-2 pt-2 border-t border-gray-700">
                                                <div class="text-[10px] text-rose-400/80 mb-1 font-bold">Hardware Engines:</div>
                                                <div class="grid grid-cols-2 gap-1 text-[9px]">
                                                    <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>SM2: Active</div>
                                                    <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>SM3: IDLE</div>
                                                    <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>SM4: Busy</div>
                                                    <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>RNG: Active</div>
                                                </div>
                                                <div class="mt-2 flex items-center justify-between text-[9px] text-gray-500 bg-black/20 p-1 rounded">
                                                    <span>Core Temp:</span>
                                                    <span class="text-emerald-400">42°C</span>
                                                </div>
                                            </div>
                                        ` : `
                                            <div class="flex justify-between">
                                                <span class="text-gray-500">Status:</span>
                                                <span class="${node?.isBlinking ? 'text-emerald-400' : 'text-gray-500'} flex items-center gap-1">
                                                    <span class="w-1.5 h-1.5 rounded-full ${node?.isBlinking ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}"></span>
                                                    ${node?.isBlinking ? 'Processing' : 'Standby'}
                                                </span>
                                            </div>
                                            <div class="mt-2 pt-1 border-t border-gray-700 flex justify-between text-[9px]">
                                                <span class="text-gray-500">Throughput:</span>
                                                <span class="text-sky-400">${Math.round(node?.throughput || 0)} Mbps</span>
                                            </div>
                                        `}
                                    </div>
                                </div>
                            `;
                        }
                        return '';
                    },
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    borderColor: theme.grid,
                    borderWidth: 1,
                    padding: 0,
                    textStyle: { color: '#f3f4f6' }
                },
                xAxis: { show: false, min: 0, max: 800, type: 'value' as const },
                yAxis: { show: false, min: 0, max: 400, type: 'value' as const },
                grid: { top: 40, bottom: 20, left: 20, right: 20 },
                series: series,
                backgroundColor: 'transparent'
            };
        };

        optionBuilder = getOption;
        applySelection(selectedNodeNames.value);

        // Robust Click Handler on the transparent Interaction Layer
        chartInstance.on('click', (params: any) => {
            if (params.componentType === 'series' && params.seriesName === 'InteractionLayer') {
                selectNode(params.name);
            }
        });

        window.addEventListener('resize', handleResize);
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }
});

const handleResize = () => {
    chartInstance?.resize();
};

const handleVisibilityChange = () => {
    if (document.hidden) {
        if (socket) socket.close();
        return;
    }
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        startDataListener();
    }
};

onUnmounted(() => {
    isDisposed = true;
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
    }
    optionBuilder = null;

    if (socket) {
        socket.close();
        socket = null;
    }
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    blinkTimeouts.forEach((id) => window.clearTimeout(id));
    blinkTimeouts.clear();
    emit('ws-status', 'disconnected');
});

watch(
    () => props.stage,
    () => {
        scheduleRender();
    },
    { deep: true }
);

watch(
    () => props.modelValue,
    (next) => {
        if (!next) return;
        const nextArr = Array.isArray(next) ? next : [next];
        // Check if content is different
        if (JSON.stringify(nextArr) === JSON.stringify(selectedNodeNames.value)) return;
        applySelection(nextArr);
    }
);

watch(
    () => props.devices,
    (next) => {
        buildNodesFromDevices(next);
        // 修复：移除自动选中首个节点的逻辑，允许初始状态保持为空（即展示 All Devices / 全局模式）
        scheduleRender();
    },
    { deep: true }
);
</script>

<template>
    <div class="topology-shell">
        <div class="topology-header">
            <div>
                <div class="topology-title">Network Topology</div>
                <div class="topology-subtitle">实时拓扑与流量脉冲</div>
            </div>
            <div class="topology-meta">
                <div class="flex bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60 mr-2">
                    <button @click="viewMode = 'stage'"
                        :class="viewMode === 'stage' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-gray-200'"
                        class="px-3 py-1 rounded-md text-[10px] font-bold transition-all">Stage Sync</button>
                    <button @click="viewMode = 'all'"
                        :class="viewMode === 'all' ? 'bg-teal-500 text-white' : 'text-gray-400 hover:text-gray-200'"
                        class="px-3 py-1 rounded-md text-[10px] font-bold transition-all">Full Cycle</button>
                </div>
                <div class="meta-pill">Selected: <span class="meta-strong">{{ selectedNodeNames.length ?
                    selectedNodeNames.join(' & ') : 'Global' }}</span>
                </div>
                <div class="meta-pill">Devices: <span class="meta-strong">{{ deviceNodes.length }}</span></div>
            </div>
        </div>

        <div class="topology-body">
            <div class="topology-canvas">
                <div ref="chartRef" class="w-full h-full"></div>
            </div>

            <div class="topology-side">
                <div class="side-card device-manager flex flex-col h-full max-h-[500px]">
                    <div class="flex items-center justify-between mb-3 px-1">
                        <div class="side-title !mb-0">Device Management</div>
                        <div
                            class="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/30">
                            {{ deviceNodes.length }} Units
                        </div>
                    </div>
                    <div class="side-list overflow-y-auto pr-1 custom-scrollbar flex-1">
                        <button v-for="node in deviceNodes" :key="node.name" @click="selectNode(node.name)"
                            class="side-item mb-1.5" :class="selectedNodeNames.includes(node.name) ? 'is-active' : ''">
                            <div class="item-header">
                                <span class="item-name">{{ node.name }}</span>
                                <span class="status-badge" :style="{
                                    color: getStageContext(node.stageId).color,
                                    borderColor: getStageContext(node.stageId).color + '40',
                                    backgroundColor: getStageContext(node.stageId).color + '10'
                                }">
                                    {{ getStageContext(node.stageId).text }}
                                </span>
                            </div>
                            <div class="flex items-center justify-between pointer-events-none">
                                <span class="side-ip">{{ node.value }}</span>
                                <span class="text-[9px] text-sky-400 font-bold" v-if="node.throughput > 100">
                                    {{ Math.round(node.throughput) }} Mbps
                                </span>
                                <span class="text-[9px] text-gray-500 font-mono" v-else>STABLE</span>
                            </div>
                        </button>
                    </div>
                </div>

                <div class="side-card">
                    <div class="side-title">Security State Legend</div>
                    <div class="space-y-2">
                        <div class="legend-row">
                            <span class="legend-dot" :style="{ background: theme.accent }"></span>
                            <span class="text-[11px]">SM2 Identity Authentication</span>
                        </div>
                        <div class="legend-row">
                            <span class="legend-dot" :style="{ background: theme.success }"></span>
                            <span class="text-[11px]">SM4 Secure Communication</span>
                        </div>
                        <div class="legend-row">
                            <span class="legend-dot" style="background: #f472b6"></span>
                            <span class="text-[11px]">Internal Hardware Decryption</span>
                        </div>
                        <div class="legend-row">
                            <span class="legend-dot" :style="{ background: theme.warning }"></span>
                            <span class="text-[11px]">SM3 Integrity Protection</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.topology-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 320px;
}

.topology-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.topology-title {
    font-size: 16px;
    font-weight: 700;
    color: #e2e8f0;
}

.topology-subtitle {
    font-size: 12px;
    color: #94a3b8;
}

.topology-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.meta-pill {
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: #94a3b8;
}

.meta-strong {
    color: #e2e8f0;
    font-weight: 600;
}

.topology-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 12px;
    flex: 1;
    height: 100%;
    min-height: 400px;
}

.topology-canvas {
    position: relative;
    height: 100%;
    min-height: 400px;
    border-radius: 12px;
    background: radial-gradient(800px 260px at 50% -40%, rgba(125, 211, 252, 0.12), transparent 60%),
        rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(148, 163, 184, 0.12);
    overflow: hidden;
}

.topology-side {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
}

.device-manager {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.scrollable-area {
    overflow-y: auto;
    overflow-x: hidden;
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(15, 23, 42, 0.1);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.3);
    border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.5);
}

.side-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    padding: 10px;
}

.side-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}

.side-counter {
    font-size: 10px;
    color: #7dd3fc;
    background: rgba(125, 211, 252, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
}

.side-title {
    font-size: 12px;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 8px;
}

.side-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.side-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(2, 6, 23, 0.5);
    border: 1px solid rgba(148, 163, 184, 0.1);
    color: #cbd5f5;
    text-align: left;
    transition: all 180ms ease;
}

.side-item:hover {
    border-color: rgba(125, 211, 252, 0.4);
    transform: translateY(-1px);
}

.side-item.is-active {
    border-color: rgba(45, 212, 191, 0.6);
    background: rgba(15, 23, 42, 0.8);
    box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.2);
}

.item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
}

.item-name {
    font-weight: 700;
}

.status-badge {
    font-size: 9px;
    font-weight: 900;
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid transparent;
    text-transform: uppercase;
}

.side-ip {
    font-size: 11px;
    color: #94a3b8;
}

.legend-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #94a3b8;
    margin-bottom: 6px;
}

.legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
}

.legend-primary {
    background: #7dd3fc;
}

.legend-success {
    background: #34d399;
}

.legend-warning {
    background: #fbbf24;
}

@media (max-width: 1024px) {
    .topology-body {
        grid-template-columns: 1fr;
    }

    .topology-side {
        flex-direction: row;
    }

    .side-card {
        flex: 1;
    }

    .topology-canvas {
        min-height: 240px;
    }
}

@media (max-width: 640px) {
    .topology-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .topology-side {
        flex-direction: column;
    }

    .topology-canvas {
        min-height: 220px;
    }
}
</style>
