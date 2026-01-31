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
let chartInstance: echarts.ECharts | null = null;
let renderQueued = false;
let triggerRenderFn: (() => void) | null = null;

const geographyStageId = computed(() => props.stage.id);
const topology = useTopologyData(
    toRef(props, 'devices'),
    geographyStageId,
    toRef(props, 'modelValue'),
    emit,
    () => { if (triggerRenderFn) triggerRenderFn() }
);

const { nodes, deviceNodes, selectedNodeNames, viewMode, displayGatewayThroughput, selectNode, startDataListener } = topology;

let optionBuilder: ((selectedNames: string[]) => echarts.EChartsOption) | null = null;

// Gateway animation handled by composable
// Nodes handled by composable

const scheduleRender = () => {
    if (!chartInstance || !optionBuilder || renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        if (!chartInstance) return; // Note: isDisposed check handled by component unmount mostly
        try {
            chartInstance.setOption(optionBuilder!(selectedNodeNames.value));
        } catch (err) {
            console.error('Error during ECharts render:', err);
        }
    });
};
triggerRenderFn = scheduleRender;

const theme = THEME;

onMounted(() => {
    startDataListener();

    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Initial Emit
        const initialNode = nodes.value.find(n => selectedNodeNames.value.includes(n.name));
        if (initialNode) emit('node-select', initialNode);

        optionBuilder = (selectedNames: string[]) => buildChartOption(
            nodes.value,
            selectedNames,
            viewMode.value,
            props.stage.id,
            displayGatewayThroughput.value,
            gatewaySvgRaw
        );

        scheduleRender();

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
    if (!document.hidden) {
        startDataListener();
    }
};

onUnmounted(() => {
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
