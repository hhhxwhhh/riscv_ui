<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch, computed } from 'vue';
import * as echarts from 'echarts';
import gatewaySvgRaw from '../svgs/gateway.svg?raw';
import deviceSvgRaw from '../svgs/computer.svg?raw';

const props = defineProps<{
    modelValue?: string
}>();

const emit = defineEmits(['update:modelValue', 'node-select', 'ws-status', 'ws-last-message']);

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const selectedNodeName = ref(props.modelValue || 'IoT Dev-A');
let optionBuilder: ((selectedName: string) => echarts.EChartsOption) | null = null;

// Define Nodes Configuration (Made Reactive for Real Data updates)
// We add 'isBlinking' state to track activity
const nodes = ref([
    { name: 'Gateway', x: 400, y: 300, value: '192.168.1.1 (GW)', category: 'gateway', isBlinking: false },
    { name: 'IoT Dev-A', x: 100, y: 100, value: '192.168.1.101', category: 'device', isBlinking: false },
    { name: 'IoT Dev-B', x: 300, y: 100, value: '192.168.1.102', category: 'device', isBlinking: false },
    { name: 'IoT Dev-C', x: 500, y: 100, value: '192.168.1.103', category: 'device', isBlinking: false },
    { name: 'IoT Dev-D', x: 700, y: 100, value: '192.168.1.104', category: 'device', isBlinking: false }
]);

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
    const node = nodes.value.find(n => n.name === name);
    if (!node || node.name === 'Gateway') return;
    selectedNodeName.value = node.name;
    emit('update:modelValue', node.name);
    emit('node-select', node);
    applySelection(node.name);
};

onMounted(() => {
    startDataListener();

    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Initial Emit
        const initialNode = nodes.value.find(n => n.name === selectedNodeName.value);
        if (initialNode) emit('node-select', initialNode);

        // Pre-calculate Maps
        const nodeMap: any = {};
        nodes.value.forEach(n => nodeMap[n.name] = [n.x, n.y]);

        const links = [
            { source: 'Gateway', target: 'IoT Dev-A' },
            { source: 'Gateway', target: 'IoT Dev-B' },
            { source: 'Gateway', target: 'IoT Dev-C' },
            { source: 'Gateway', target: 'IoT Dev-D' }
        ];

        // Lines Data for animation
        const linesData = links.map(link => ({ coords: [nodeMap[link.source], nodeMap[link.target]] }));
        const linesDataReturn = links.map(link => ({ coords: [nodeMap[link.target], nodeMap[link.source]] }));

        const getOption = (selectedName: string): echarts.EChartsOption => ({
            title: {
                text: 'Network Topology & Traffic Monitor',
                subtext: 'Select a device to monitor instruction execution',
                left: 'center',
                top: 10,
                textStyle: { color: theme.textMuted, fontSize: 16 }
            },
            // Tooltip only for the interaction layer
            tooltip: {
                trigger: 'item' as const,
                formatter: (params: any) => {
                    if (params.seriesName === 'InteractionLayer') {
                        return `<div class="font-bold">${params.name}</div><div>IP: ${params.value}</div>`;
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
            series: [
                // 1. Traffic Lines (Background) - Silent
                {
                    type: 'lines',
                    silent: true,
                    coordinateSystem: 'cartesian2d',
                    effect: { show: true, period: 4, trailLength: 0.1, symbol: 'arrow', symbolSize: 6, color: theme.primary },
                    lineStyle: { color: theme.line, width: 0, curveness: 0.2 },
                    data: linesData,
                    z: 1
                },
                // 2. Return Traffic - Silent
                {
                    type: 'lines',
                    silent: true,
                    coordinateSystem: 'cartesian2d',
                    effect: { show: true, period: 3, trailLength: 0.3, symbol: 'circle', symbolSize: 4, color: theme.success },
                    lineStyle: { color: theme.lineReturn, width: 0, curveness: -0.2 },
                    data: linesDataReturn,
                    z: 1
                },
                // 3. Visual Layer (The visible nodes and connections) - Silent to prevent blocking
                {
                    type: 'graph',
                    coordinateSystem: 'cartesian2d',
                    layout: 'none',
                    silent: true, // Make visual layer silent so Interaction Layer takes all events
                    symbolSize: 60,
                    roam: false,
                    label: {
                        show: true,
                        position: 'bottom',
                        color: '#d1d5db',
                        formatter: '{name|{b}}\n{ip|IP: {c}}',
                        rich: {
                            name: { fontSize: 13, fontWeight: 'bold', color: '#e5e7eb', padding: [0, 0, 4, 0], align: 'center' },
                            ip: { fontSize: 11, color: '#9ca3af', align: 'center', backgroundColor: '#1f2937', padding: [2, 4], borderRadius: 4 }
                        }
                    },
                    data: nodes.value.map(node => {
                        const isGateway = node.name === 'Gateway';
                        const isSelected = node.name === selectedName;
                        const isBlinking = node.isBlinking; // Get blink state

                        // Visual Priority: Gateway always Red -> Blinking wins over Selection
                        // If blinking, use Bright Yellow/Orange. If Selected, Green. Default Blue.
                        let color = isGateway ? theme.danger : (isSelected ? theme.success : theme.primary);

                        if (isBlinking && !isGateway) {
                            color = theme.warning; // Highlighting
                        }

                        return {
                            ...node,
                            symbol: toSvgDataUrl(isGateway ? IconsPaths.gateway : IconsPaths.device, color),
                            symbolKeepAspect: true,
                            symbolSize: isGateway ? 50 : (isBlinking ? 45 : 40), // Slight size bump when active
                            itemStyle: {
                                color: color,
                                shadowBlur: isBlinking ? 30 : (isSelected ? 20 : 10),
                                shadowColor: isBlinking ? theme.warning : (isGateway ? 'rgba(239, 68, 68, 0.5)' : (isSelected ? 'rgba(52, 211, 153, 0.8)' : 'rgba(59, 130, 246, 0.5)')),
                                borderWidth: isBlinking ? 2 : 0,
                                borderColor: '#fff'
                            }
                        };
                    }),
                    links: links,
                    lineStyle: { color: theme.grid, width: 2, type: 'dashed', curveness: 0.2 },
                    z: 2
                },
                // 4. Interaction Layer (Transparent but clickable)
                {
                    name: 'InteractionLayer',
                    type: 'graph',
                    coordinateSystem: 'cartesian2d',
                    layout: 'none',
                    cursor: 'pointer',
                    symbolSize: 60, // Consistent larger hit area
                    itemStyle: { opacity: 0 }, // Invisible
                    data: nodes.value.map(node => ({
                        name: node.name,
                        value: node.value,
                        x: node.x,
                        y: node.y,
                        symbol: toSvgDataUrl(node.name === 'Gateway' ? IconsPaths.gateway : IconsPaths.device, theme.textMuted),
                        symbolSize: node.name === 'Gateway' ? 50 : 40 // Keep shape consistent for hitbox
                    })),
                    z: 10 // Topmost
                }
            ],
            backgroundColor: 'transparent'
        });

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
    () => props.modelValue,
    (next) => {
        if (!next || next === selectedNodeName.value) return;
        applySelection(next);
    }
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
                <div class="meta-pill">Selected: <span class="meta-strong">{{ selectedNodeName }}</span></div>
                <div class="meta-pill">Devices: <span class="meta-strong">{{ deviceNodes.length }}</span></div>
            </div>
        </div>

        <div class="topology-body">
            <div class="topology-canvas">
                <div ref="chartRef" class="w-full h-full"></div>
            </div>

            <div class="topology-side">
                <div class="side-card">
                    <div class="side-title">Quick Select</div>
                    <div class="side-list">
                        <button v-for="node in deviceNodes" :key="node.name" @click="selectNode(node.name)"
                            class="side-item" :class="selectedNodeName === node.name ? 'is-active' : ''">
                            <span>{{ node.name }}</span>
                            <span class="side-ip">{{ node.value }}</span>
                        </button>
                    </div>
                </div>

                <div class="side-card">
                    <div class="side-title">Legend</div>
                    <div class="legend-row"><span class="legend-dot legend-primary"></span>Traffic</div>
                    <div class="legend-row"><span class="legend-dot legend-success"></span>Return</div>
                    <div class="legend-row"><span class="legend-dot legend-warning"></span>Activity</div>
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
    min-height: 260px;
}

.topology-canvas {
    position: relative;
    height: 100%;
    min-height: 260px;
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
}

.side-card {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 12px;
    padding: 10px;
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
