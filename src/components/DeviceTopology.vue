<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch, computed, toRef } from 'vue';
import * as echarts from 'echarts';
import { type StageInfo } from '../api/stages';
import { type DeviceInfo, THEME } from './DeviceTopology.types';
import gatewaySvgRaw from '../svgs/gateway.svg?raw';
import { useTopologyData } from '../composables/useTopologyData';
import { buildChartOption } from './DeviceTopology.charts';
import { getStageContext } from './DeviceTopology.helpers';

const props = defineProps<{
    modelValue?: string | string[]; // Support array for multi-track
    devices?: DeviceInfo[],
    stage: StageInfo
}>();

const emit = defineEmits(['update:modelValue', 'node-select', 'ws-status', 'ws-last-message', 'telemetry']);

const chartRef = ref<HTMLElement | null>(null);
const chartSize = ref<{ width: number; height: number } | null>(null);
let chartInstance: echarts.ECharts | null = null;
let renderQueued = false;
let triggerRenderFn: (() => void) | null = null;

const geographyStageId = computed(() => props.stage.id);
const topology = useTopologyData(
    toRef(props, 'devices'),
    geographyStageId,
    toRef(props, 'modelValue'),
    emit,
    () => { if (triggerRenderFn) triggerRenderFn() },
    chartSize
);

const { nodes, deviceNodes, selectedNodeNames, inspectedNode, viewMode, displayGatewayThroughput, selectNode, hoverNode, blurNode, startDataListener } = topology;

const activeNode = computed(() => {
    if (inspectedNode.value) return inspectedNode.value;
    if (selectedNodeNames.value.length === 1) {
        return nodes.value.find(n => n.name === selectedNodeNames.value[0]);
    }
    return null;
});

let optionBuilder: ((selectedNames: string[]) => echarts.EChartsOption) | null = null;

// Gateway animation handled by composable
// Nodes handled by composable

const scheduleRender = () => {
    if (!chartInstance || !optionBuilder || renderQueued || !chartSize.value) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        if (!chartInstance) return; // Note: isDisposed check handled by component unmount mostly
        try {
            chartInstance.setOption(optionBuilder!(selectedNodeNames.value), { notMerge: true });
        } catch (err) {
            console.error('Error during ECharts render:', err);
        }
    });
};
triggerRenderFn = scheduleRender;

const theme = THEME;

const clearSelection = () => {
    selectedNodeNames.value = [];
    emit('update:modelValue', []);
    emit('node-select', { name: '', value: '' });
    if (triggerRenderFn) triggerRenderFn();
};

const handleResize = () => {
    if (!chartRef.value || !chartInstance) return;
    const width = chartRef.value.clientWidth;
    const height = chartRef.value.clientHeight;
    
    // Only update and re-render if dimensions are valid and changed
    if (width > 0 && height > 0) {
        // If dimensions change significantly, clear the previous instance to avoid GL ghosts
        if (chartSize.value && (Math.abs(chartSize.value.width - width) > 10 || Math.abs(chartSize.value.height - height) > 10)) {
            chartInstance.clear();
        }
        
        chartInstance.resize();
        chartSize.value = { width, height };
        scheduleRender();
    }
};

let resizeObserver: ResizeObserver | null = null;

const handleVisibilityChange = () => {
    if (!document.hidden) {
        startDataListener();
    }
};

onMounted(() => {
    if (chartRef.value) {
        // Ensure no leftovers from HMR or previous sessions
        echarts.dispose(chartRef.value);
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Initial setup
        handleResize();

        // Use ResizeObserver for more reliable layout tracking
        resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(chartRef.value);

        // Initial Emit
        const initialNode = nodes.value.find(n => selectedNodeNames.value.includes(n.name));
        if (initialNode) emit('node-select', initialNode);

        optionBuilder = (selectedNames: string[]) => buildChartOption(
            nodes.value,
            selectedNames,
            viewMode.value,
            props.stage.id,
            displayGatewayThroughput.value,
            gatewaySvgRaw,
            chartSize.value?.width || 800, // Should be superseded by not rendering without chartSize
            chartSize.value?.height || 400
        );

        // Final layout sync after DOM settling (e.g. after transitions/animations)
        setTimeout(() => {
            handleResize();
            startDataListener(); // Start listening ONLY after initial layout is stable
        }, 150);

        // Interaction Handlers
        chartInstance.on('click', (params: any) => {
            if (params.componentType === 'series' && (params.seriesName === 'InteractionLayer' || params.seriesName === 'GLNodes')) {
                selectNode(params.name);
            } else {
                clearSelection();
            }
        });

        chartInstance.on('mouseover', (params: any) => {
            if (params.componentType === 'series' && (params.seriesName === 'InteractionLayer' || params.seriesName === 'GLNodes')) {
                hoverNode(params.name);
            }
        });

        chartInstance.on('mouseout', () => {
            blurNode();
        });

        window.addEventListener('resize', handleResize);
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }
});

onUnmounted(() => {
    resizeObserver?.disconnect();
    window.removeEventListener('resize', handleResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
    }
    optionBuilder = null;
    // Socket cleanup handled by composable
});

watch(
    () => props.stage,
    () => {
        scheduleRender();
    },
    { deep: true }
);
</script>

<template>
    <div class="topology-shell">
        <div class="topology-header">
            <div>
                <div class="topology-title text-sky-400">Wi-Fi 7 Security Gateway Real-time Topology</div>
                <div class="topology-subtitle">Distributed IoT Terminal & RISC-V Core Exchange Monitor</div>
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
                <button v-if="selectedNodeNames.length" @click="clearSelection"
                    class="px-2.5 py-1 rounded-md text-[10px] font-bold border border-rose-400/30 text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 transition">
                    Clear Selection
                </button>
                <div class="meta-pill">Selected: <span class="meta-strong">{{ selectedNodeNames.length ?
                    selectedNodeNames.join(' & ') : 'Global' }}</span>
                </div>
                <div class="meta-pill">Devices: <span class="meta-strong">{{ deviceNodes.length }}</span></div>
            </div>
        </div>

        <div class="topology-body">
            <div class="topology-canvas relative overflow-hidden bg-slate-900/40 rounded-xl border border-white/5">
                <!-- Data Flow Legend Overlay -->
                <div class="absolute bottom-4 left-4 flex flex-wrap gap-2 z-10 pointer-events-none">
                    <div class="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-700/40 backdrop-blur-md">
                        <div class="w-2.5 h-2.5 rounded-sm bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]"></div>
                        <span class="text-[10px] text-slate-300 font-black uppercase tracking-widest px-1">IoT Sensor</span>
                    </div>
                    <div class="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-700/40 backdrop-blur-md">
                        <div class="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                        <span class="text-[10px] text-slate-300 font-black uppercase tracking-widest px-1">4K Camera</span>
                    </div>
                    <div class="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-700/40 backdrop-blur-md">
                        <div class="w-3 h-3 rotate-45 border-2 border-amber-400 bg-amber-400/20 shadow-[0_0_8px_rgba(fbbf24,0.5)]"></div>
                        <span class="text-[10px] text-slate-300 font-black uppercase tracking-widest px-1">Mesh Relay</span>
                    </div>
                    <div class="flex items-center gap-2 p-2 bg-slate-950/60 rounded-lg border border-slate-700/40 backdrop-blur-md">
                        <div class="w-3 h-3 rounded-sm border-2 border-indigo-400 bg-indigo-500/20"></div>
                        <span class="text-[10px] text-slate-300 font-black uppercase tracking-widest px-1">User Terminal</span>
                    </div>
                </div>
                
                <div ref="chartRef" class="w-full h-full"></div>
                
                <div class="absolute bottom-4 right-4 flex items-center gap-2 z-10">
                    <div class="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded border border-emerald-500/30 backdrop-blur-sm">
                        <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></div>
                        <span class="text-[9px] text-emerald-400 font-mono font-bold tracking-tighter">WPA3-EHT ACTIVE</span>
                    </div>
                </div>
                
                <div class="canvas-hint">Network Architecture: Select a Node to Inspect Real-time Telemetry & Security Analysis</div>

                <!-- Persistent Selected Node Inspector (Alternative to Hover) -->
                <transition name="fade">
                    <div v-if="activeNode" 
                        class="absolute top-4 right-4 z-20 w-64 p-4 bg-slate-900/95 border border-sky-500/40 rounded-xl shadow-2xl backdrop-blur-xl">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-sm font-black text-sky-400 tracking-tight uppercase">Node Inspector</h3>
                            <button @click="clearSelection" v-if="!inspectedNode" class="text-slate-500 hover:text-rose-400 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                        
                        <div class="space-y-4">
                            <div class="flex flex-col gap-1">
                                <div class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Identity</div>
                                <div class="text-lg font-bold text-slate-200 truncate leading-tight">
                                    {{ activeNode.name }}
                                </div>
                                <div class="text-[11px] font-mono text-slate-400">
                                    IP: 192.168.1.{{ activeNode.name.split('-').pop() || '1' }}
                                </div>
                            </div>

                            <div class="grid grid-cols-2 gap-3">
                                <div class="p-2 bg-slate-950/40 rounded-lg border border-white/5">
                                    <div class="text-[9px] text-slate-500 uppercase mb-1">Status</div>
                                    <div class="flex items-center gap-1.5">
                                        <div class="w-1.5 h-1.5 rounded-full" 
                                            :class="activeNode.throughput ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"></div>
                                        <span class="text-[10px] font-bold" :class="activeNode.throughput ? 'text-emerald-400' : 'text-slate-500'">
                                            {{ activeNode.throughput ? 'ACTIVE' : 'IDLE' }}
                                        </span>
                                    </div>
                                </div>
                                <div class="p-2 bg-slate-950/40 rounded-lg border border-white/5">
                                    <div class="text-[9px] text-slate-500 uppercase mb-1">Stage</div>
                                    <div class="text-[10px] font-bold text-amber-400">
                                        {{ getStageContext(activeNode.stageId || '').text }}
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-3 pt-2 border-t border-white/5">
                                <div class="flex justify-between items-end">
                                    <div class="text-[10px] text-slate-500 uppercase">Throughput</div>
                                    <div class="text-sm font-black font-mono text-sky-400">
                                        {{ Math.round(activeNode.throughput || 0) }} Mbps
                                    </div>
                                </div>
                                <div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div class="h-full bg-sky-500 transition-all duration-700" 
                                        :style="{ width: Math.min(100, (activeNode.throughput || 0) / 100) + '%' }"></div>
                                </div>

                                <div v-if="activeNode.latency" class="flex justify-between items-center text-[11px]">
                                    <span class="text-slate-500">LATENCY</span>
                                    <span class="text-amber-400 font-mono font-bold">{{ activeNode.latency?.toFixed(2) }}ms</span>
                                </div>
                                <div v-if="activeNode.securityScore" class="flex justify-between items-center text-[11px]">
                                    <span class="text-slate-500">SECURITY</span>
                                    <span class="text-emerald-400 font-mono font-bold">{{ activeNode.securityScore }}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </transition>
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
                        <div v-if="deviceNodes.length === 0" class="empty-state">
                            No device data available
                        </div>
                        <button v-for="node in deviceNodes" :key="node.name" @click="selectNode(node.name)"
                            class="side-item mb-1.5 transition-all duration-300"
                            :class="selectedNodeNames.includes(node.name) ? 'is-active ring-1 ring-sky-500/50' : ''">
                            <div class="item-header">
                                <span class="item-name flex items-center gap-1.5">
                                    <span v-if="node.throughput > 100"
                                        class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    {{ node.name }}
                                </span>
                                <span class="status-badge" :style="{
                                    color: getStageContext(node.stageId).color,
                                    borderColor: getStageContext(node.stageId).color + '40',
                                    backgroundColor: getStageContext(node.stageId).color + '10'
                                }">
                                    {{ getStageContext(node.stageId).text }}
                                </span>
                            </div>
                            <div class="flex items-center justify-between pointer-events-none mt-1">
                                <span class="side-ip opacity-60">{{ node.value }}</span>
                                <div class="flex items-center gap-2">
                                    <span class="text-[9px] text-sky-400 font-bold" v-if="node.throughput > 0">
                                        {{ Math.round(node.throughput) }} Mbps
                                    </span>
                                    <span class="text-[9px] text-gray-500 font-mono" v-else>IDLE</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                <div class="side-card">
                    <div class="side-title">Security Domain Legend</div>
                    <div class="grid grid-cols-1 gap-3">
                        <div class="legend-row bg-slate-800/40 p-1.5 rounded border border-slate-700/50">
                            <span class="legend-dot" :style="{ background: theme.accent }"></span>
                            <div class="flex flex-col">
                                <span class="text-[11px] font-bold text-gray-200">SM2 Identity Mutual Auth</span>
                                <span class="text-[9px] text-gray-500">Device access validation cycle</span>
                            </div>
                        </div>
                        <div class="legend-row bg-slate-800/40 p-1.5 rounded border border-slate-700/50">
                            <span class="legend-dot" :style="{ background: theme.success }"></span>
                            <div class="flex flex-col">
                                <span class="text-[11px] font-bold text-gray-200">SM4 Traffic Encryption</span>
                                <span class="text-[9px] text-gray-500">End-to-end data payload security</span>
                            </div>
                        </div>
                        <div class="legend-row bg-slate-800/40 p-1.5 rounded border border-slate-700/50">
                            <span class="legend-dot" style="background: #f472b6"></span>
                            <div class="flex flex-col">
                                <span class="text-[11px] font-bold text-gray-200">Gateway HW Decryption</span>
                                <span class="text-[9px] text-gray-500">RISC-V Custom ISA Acceleration</span>
                            </div>
                        </div>
                        <div class="legend-row bg-slate-800/40 p-1.5 rounded border border-slate-700/50">
                            <span class="legend-dot" :style="{ background: theme.warning }"></span>
                            <div class="flex flex-col">
                                <span class="text-[11px] font-bold text-gray-200">SM3 Integrity Verification</span>
                                <span class="text-[9px] text-gray-500">Anti-tamper & link sync</span>
                            </div>
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

.topology-canvas::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(148, 163, 184, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
    background-size: 48px 48px;
    opacity: 0.35;
    pointer-events: none;
}

.canvas-hint {
    position: absolute;
    right: 12px;
    bottom: 10px;
    padding: 4px 8px;
    font-size: 10px;
    color: #94a3b8;
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 999px;
    pointer-events: none;
    z-index: 2;
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

.empty-state {
    font-size: 12px;
    color: #64748b;
    background: rgba(2, 6, 23, 0.4);
    border: 1px dashed rgba(148, 163, 184, 0.2);
    border-radius: 10px;
    padding: 16px 12px;
    text-align: center;
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
