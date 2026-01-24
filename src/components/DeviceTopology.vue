<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch, computed } from 'vue';
import * as echarts from 'echarts';
import type { StageInfo } from '../api/stages';
import gatewaySvgRaw from '../svgs/gateway.svg?raw';
import deviceSvgRaw from '../svgs/computer.svg?raw';

type DeviceInfo = {
    id?: string;
    name: string;
    ip: string;
    status?: string;
};

const props = defineProps<{
    modelValue?: string;
    devices?: DeviceInfo[],
    stage: StageInfo
}>();

const emit = defineEmits(['update:modelValue', 'node-select', 'ws-status', 'ws-last-message', 'telemetry']);

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const selectedNodeName = ref(props.modelValue || '');
const viewMode = ref<'stage' | 'device' | 'all'>('stage'); // stage: global stage for all, etc
let optionBuilder: ((selectedName: string) => echarts.EChartsOption) | null = null;

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
    description?: string;
};
const nodes = ref<NodeData[]>([]);

const calculatePositions = (count: number) => {
    const centerX = 400;
    const centerY = 200; // Shifted slightly for better fit
    const radiusX = 320;
    const radiusY = 160;

    // Generate dozens of points in a responsive arc or circle
    return Array.from({ length: count }, (_, i) => {
        // Adjust angle to create a semi-circle or full circle
        // We use a semi-circle on top for a "fan out" look
        const angle = (i / (count - 1 || 1)) * Math.PI - Math.PI;
        return {
            x: centerX + Math.cos(angle) * radiusX,
            y: centerY + Math.sin(angle) * radiusY
        };
    });
};

const buildNodesFromDevices = (devices?: DeviceInfo[]) => {
    const previousBlink = new Map(nodes.value.map((node) => [node.name, node.isBlinking]));
    const stageIds = ['AUTH', 'ENCRYPT', 'DECRYPT', 'HASH'];

    // If no devices provided, generate 20 demo devices with varied names
    const defaultDevices = Array.from({ length: 20 }, (_, i) => {
        const types = ['Sensor', 'Camera', 'Node', 'Relay', 'Terminal'];
        const type = types[i % types.length];
        return {
            name: `IoT ${type} ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ''}`,
            ip: `192.168.1.${100 + i}`,
            type: 'device'
        };
    });

    const deviceList = (devices && devices.length) ? devices : defaultDevices;
    const positions = calculatePositions(deviceList.length);

    const gateway = {
        name: 'A100 Gateway',
        x: 400,
        y: 200,
        value: '192.168.1.1',
        category: 'gateway',
        isBlinking: false,
        stageId: props.stage.id || 'AUTH',
        description: 'Secure RISC-V Cryptoverse Hub'
    };

    const deviceNodes = deviceList.map((device, index) => {
        const pos = positions[index] || { x: 0, y: 0 };
        return {
            name: device.name,
            x: pos.x,
            y: pos.y,
            value: device.ip,
            category: 'device',
            isBlinking: previousBlink.get(device.name) || false,
            stageId: stageIds[index % stageIds.length] || 'AUTH'
        };
    });

    nodes.value = [gateway, ...deviceNodes];
};

buildNodesFromDevices(props.devices);

// Watch for device list changes from parent/API
watch(() => props.devices, (newDevices) => {
    buildNodesFromDevices(newDevices);
    if (chartInstance && optionBuilder) {
        chartInstance.setOption(optionBuilder(selectedNodeName.value));
    }
}, { deep: true });

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
    if (!chartInstance || !optionBuilder || renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        chartInstance?.setOption(optionBuilder!(selectedNodeName.value));
    });
};

const handleIncomingPacket = (packet: TelemetryPacket) => {
    emit('ws-last-message', Date.now());
    emit('telemetry', packet);
    // Expected packet: { source: '192.168.1.101', status: 'active', ... }
    if (!packet?.source) return;
    const targetNode = nodes.value.find(n => n.value.includes(packet.source));

    if (targetNode) {
        // Activate Blink State
        targetNode.isBlinking = true;

        // Trigger visual update (Highlight ON)
        scheduleRender();

        // Auto-reset after 500ms (replace previous timeout if any)
        const existing = blinkTimeouts.get(targetNode.name);
        if (existing) window.clearTimeout(existing);
        const timeoutId = window.setTimeout(() => {
            if (isDisposed) return;
            targetNode.isBlinking = false;
            scheduleRender();
            blinkTimeouts.delete(targetNode.name);
        }, 500);
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

        socket.onclose = () => {
            if (isDisposed) return;
            emit('ws-status', 'disconnected');
            console.warn('WebSocket closed. Reconnecting...');
            scheduleReconnect();
        };
    } catch (err) {
        emit('ws-status', 'disconnected');
        console.error('Failed to confirm WebSocket connection:', err);
        scheduleReconnect();
    }
};

const IconsPaths = {
    gateway: gatewaySvgRaw,
    device: deviceSvgRaw
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

const toBase64 = (value: string) => window.btoa(unescape(encodeURIComponent(value)));

const toSvgDataUrl = (svg: string, color: string) => {
    const cleaned = svg
        .replace(/<\?xml[^>]*>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const withColor = cleaned
        .replace(/fill="[^"]*"/g, `fill="${color}"`)
        .replace(/stroke="[^"]*"/g, `stroke="${color}"`);
    return `image://data:image/svg+xml;base64,${toBase64(withColor)}`;
};

const deviceNodes = computed(() => nodes.value.filter(node => node.category === 'device'));

const applySelection = (name: string) => {
    if (!chartInstance || !optionBuilder) return;
    selectedNodeName.value = name;
    chartInstance.setOption(optionBuilder(name));
};

const selectNode = (name: string) => {
    // If clicking same node, deselect it to show full topology
    const newSelection = selectedNodeName.value === name ? '' : name;

    if (newSelection === 'Gateway' || newSelection === 'A100 Gateway') return;

    selectedNodeName.value = newSelection;
    emit('update:modelValue', newSelection);

    const node = nodes.value.find(n => n.name === newSelection);
    emit('node-select', node || { name: '', value: '' });
    applySelection(newSelection);
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
        const initialNode = nodes.value.find(n => n.name === selectedNodeName.value);
        if (initialNode) emit('node-select', initialNode);

        const getOption = (selectedName: string): echarts.EChartsOption => {
            const nodeMap: Record<string, [number, number]> = {};
            nodes.value.forEach(n => nodeMap[n.name] = [n.x, n.y]);

            const stageIds = ['AUTH', 'ENCRYPT', 'DECRYPT', 'HASH'];
            const linesByStage: Record<string, any[]> = { AUTH: [], ENCRYPT: [], DECRYPT: [], HASH: [] };

            const isGlobal = !selectedName;

            nodes.value.forEach(node => {
                if (node.category === 'gateway') return;

                // Show all devices in global view, or only selected device in focused view
                if (!isGlobal && node.name !== selectedName) return;

                // LOGIC REFACTORED:
                // If viewMode is 'all' AND node is selected, show all 4 stages.
                // If viewMode is 'all' AND no node selected, show each device's assigned stage.
                // If viewMode is 'stage', show the global props.stage.id for everything.

                let stagesToShow: string[] = [];
                if (viewMode.value === 'all') {
                    if (!isGlobal) {
                        stagesToShow = stageIds; // Show full cycle for selected device
                    } else {
                        stagesToShow = [node.stageId]; // Show distributed stages in global view
                    }
                } else {
                    stagesToShow = [props.stage.id]; // Strict stage sync
                }

                stagesToShow.forEach((sid) => {
                    // Logic mapping for demo flow directions
                    const isReverse = (sid === 'AUTH'); // Device -> Gateway
                    const isInternal = (sid === 'DECRYPT' || sid === 'HASH');

                    const gatewayNode = nodes.value.find(n => n.category === 'gateway');
                    if (!gatewayNode) return;

                    let source = node.name;
                    let target = gatewayNode.name;

                    if (!isReverse) { [source, target] = [target, source]; }

                    const sPos = nodeMap[source];
                    const tPos = nodeMap[target];

                    if (sPos && tPos && linesByStage[sid]) {
                        if (isInternal && !isGlobal) {
                            const gx = gatewayNode.x;
                            const gy = gatewayNode.y;
                            // Loop effect for internal processing at gateway for focused device
                            linesByStage[sid].push({
                                coords: [[gx, gy], [gx + 30, gy - 40], [gx + 60, gy], [gx + 30, gy + 40], [gx, gy]]
                            });
                        } else {
                            // Spread concurrent lines out slightly for visible clarity if many stages
                            const curve = isGlobal ? 0.2 : (0.1 + (stageIds.indexOf(sid) * 0.15));
                            linesByStage[sid].push({
                                coords: [sPos, tPos],
                                lineStyle: { curveness: curve }
                            });
                        }
                    }
                });
            });

            const series: any[] = [];
            const lineWidth = Math.max(1.5, (props.stage.metrics.throughput / 300));

            // 1. Multi-stage Traffic Lines
            stageIds.forEach(sid => {
                const currentLines = linesByStage[sid];
                if (!currentLines || currentLines.length === 0) return;

                const ctx = getStageContext(sid);
                const isSelectedFlow = !isGlobal && selectedName && currentLines.length > 0;

                series.push({
                    type: 'lines',
                    silent: true,
                    coordinateSystem: 'cartesian2d',
                    effect: {
                        show: true,
                        period: 4,
                        trailLength: 0.1,
                        symbol: 'arrow',
                        symbolSize: lineWidth * (isSelectedFlow ? 4 : 3),
                        color: ctx.color
                    },
                    lineStyle: {
                        color: ctx.color,
                        width: isSelectedFlow ? lineWidth * 1.5 : lineWidth,
                        curveness: 0.2, // Default, items might override
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

                        // If in Full Cycle mode and no focus, show node's own stage.
                        // If focused, show global stage (or 'Full Cycle' text).
                        const sid = (viewMode.value === 'all' && isGlobal)
                            ? (deviceNode?.stageId || 'AUTH')
                            : props.stage.id;

                        const ctx = getStageContext(sid);

                        if (isGateway) return `{name|${p.name}}\n{stage|${props.stage.id}}`;
                        return `{name|${p.name}}\n{ip|${p.value}}\n{badge| ${ctx.text} }`;
                    },
                    rich: {
                        name: { fontSize: 12, fontWeight: 'bold', color: '#e5e7eb', padding: [0, 0, 2, 0], align: 'center' },
                        ip: { fontSize: 10, color: '#9ca3af', align: 'center', padding: [0, 0, 4, 0] },
                        stage: { fontSize: 10, color: '#fff', backgroundColor: theme.danger, padding: [2, 4], borderRadius: 4, fontWeight: 'bold' },
                        badge: { fontSize: 9, color: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'currentColor', borderWidth: 1, padding: [2, 4], borderRadius: 2 }
                    }
                },
                data: nodes.value.map(node => {
                    const isGateway = node.name.includes('Gateway');
                    const isSelected = node.name === selectedName;
                    const sid = isSelected ? props.stage.id : node.stageId;
                    const ctx = getStageContext(sid);

                    let color = isGateway ? theme.danger : (isSelected ? ctx.color : (isGlobal ? ctx.color : theme.textMuted));
                    if (node.isBlinking && !isGateway) color = theme.warning;

                    return {
                        ...node,
                        symbol: toSvgDataUrl(isGateway ? IconsPaths.gateway : IconsPaths.device, color),
                        symbolKeepAspect: true,
                        symbolSize: isGateway ? 55 : (isSelected ? 50 : 35),
                        label: {
                            rich: {
                                badge: { color: color, borderColor: color }
                            }
                        },
                        itemStyle: {
                            color: color,
                            shadowBlur: isSelected ? 30 : 5,
                            shadowColor: color + (isSelected ? 'B0' : '40')
                        }
                    };
                }),
                links: nodes.value
                    .filter(node => node.category === 'device' && (!selectedName || node.name === selectedName))
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

            const currentCtx = getStageContext(props.stage.id);

            return {
                title: {
                    text: 'Multi-Flow Security Stage Monitor',
                    subtext: selectedName ? `Focus Flow: ${props.stage.flow.label}` : 'Global Network: Multi-Stage Concurrency View',
                    left: 'center',
                    top: 10,
                    textStyle: { color: theme.textMuted, fontSize: 16 }
                },
                graphic: [
                    {
                        type: 'group',
                        left: 20,
                        bottom: 80,
                        children: [
                            {
                                type: 'rect',
                                shape: { width: 220, height: 50, r: 4 },
                                style: { fill: 'rgba(31, 41, 55, 0.9)', stroke: currentCtx.color, lineWidth: 1 }
                            },
                            {
                                type: 'text',
                                style: {
                                    text: `ACTIVE DEVICE: ${selectedName || 'Global Monitor'}\nCURRENT PHASE: ${props.stage.name}\nFLOW LOGIC: ${props.stage.flow.label}`,
                                    fill: '#f3f4f6',
                                    font: 'bold 10px sans-serif'
                                },
                                left: 10,
                                top: 8
                            }
                        ]
                    }
                ],
                tooltip: {
                    trigger: 'item' as const,
                    formatter: (params: any) => {
                        if (params.seriesName === 'InteractionLayer') {
                            const node = nodes.value.find(n => n.name === params.name);
                            const sid = params.name === selectedName ? props.stage.id : node?.stageId;
                            const ctx = getStageContext(sid || 'AUTH');
                            return `<div class="font-bold">${params.name}</div><div>IP: ${params.value}</div><div class="text-[${ctx.color}] mt-1">Stage: ${ctx.text}</div>`;
                        }
                        return '';
                    },
                    backgroundColor: 'rgba(31, 41, 55, 0.9)',
                    borderColor: theme.grid,
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
        applySelection(selectedNodeName.value);

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
    chartInstance?.dispose();
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
        if (!next || next === selectedNodeName.value) return;
        applySelection(next);
    }
);

watch(
    () => props.devices,
    (next) => {
        buildNodesFromDevices(next);
        const hasSelected = nodes.value.some((node) => node.name === selectedNodeName.value);
        if (!hasSelected) {
            const fallback = nodes.value.find((node) => node.category === 'device');
            if (fallback) {
                selectedNodeName.value = fallback.name;
                emit('update:modelValue', fallback.name);
                emit('node-select', fallback);
            }
        }
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
                <div class="meta-pill">Selected: <span class="meta-strong">{{ selectedNodeName || 'Global' }}</span>
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
                            class="side-item mb-1.5" :class="selectedNodeName === node.name ? 'is-active' : ''">
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
                                <span class="text-[9px] text-gray-500 font-mono">LAT:
                                    {{ (Math.random() * 4 + 1).toFixed(1) }}ms</span>
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
