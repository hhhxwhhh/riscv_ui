<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
    modelValue?: string
}>();

const emit = defineEmits(['update:modelValue', 'node-select']);

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const selectedNodeName = ref(props.modelValue || 'IoT Dev-A');
let optionBuilder: ((selectedName: string) => echarts.EChartsOption) | null = null;

// Define Nodes Configuration
const nodes = [
    { name: 'Gateway', x: 400, y: 300, value: '192.168.1.1 (GW)', category: 'gateway' },
    { name: 'IoT Dev-A', x: 150, y: 100, value: '192.168.1.101', category: 'device' },
    { name: 'IoT Dev-B', x: 400, y: 100, value: '192.168.1.102', category: 'device' },
    { name: 'IoT Dev-C', x: 650, y: 100, value: '192.168.1.103', category: 'device' }
];

const deviceNodes = nodes.filter(node => node.category === 'device');

const applySelection = (name: string) => {
    if (!chartInstance || !optionBuilder) return;
    selectedNodeName.value = name;
    chartInstance.setOption(optionBuilder(name));
};

const selectNode = (name: string) => {
    const node = nodes.find(n => n.name === name);
    if (!node || node.name === 'Gateway') return;
    selectedNodeName.value = node.name;
    emit('update:modelValue', node.name);
    emit('node-select', node);
    applySelection(node.name);
};

onMounted(() => {
    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Initial Emit
        const initialNode = nodes.find(n => n.name === selectedNodeName.value);
        if (initialNode) emit('node-select', initialNode);

        // Pre-calculate Maps
        const nodeMap: any = {};
        nodes.forEach(n => nodeMap[n.name] = [n.x, n.y]);

        const links = [
            { source: 'Gateway', target: 'IoT Dev-A' },
            { source: 'Gateway', target: 'IoT Dev-B' },
            { source: 'Gateway', target: 'IoT Dev-C' }
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
                textStyle: { color: '#9ca3af', fontSize: 16 }
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
                borderColor: '#374151',
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
                    effect: { show: true, period: 4, trailLength: 0.1, symbol: 'arrow', symbolSize: 6, color: '#60a5fa' },
                    lineStyle: { color: '#1e3a8a', width: 0, curveness: 0.2 },
                    data: linesData,
                    z: 1
                },
                // 2. Return Traffic - Silent
                {
                    type: 'lines',
                    silent: true,
                    coordinateSystem: 'cartesian2d',
                    effect: { show: true, period: 3, trailLength: 0.3, symbol: 'circle', symbolSize: 4, color: '#34d399' },
                    lineStyle: { color: '#064e3b', width: 0, curveness: -0.2 },
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
                    data: nodes.map(node => {
                        const isSelected = node.name === selectedName;
                        const isGateway = node.name === 'Gateway';
                        return {
                            ...node,
                            itemStyle: {
                                color: isGateway ?
                                    { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [{ offset: 0, color: '#f87171' }, { offset: 1, color: '#991b1b' }] } :
                                    { type: 'radial', x: 0.5, y: 0.5, r: 0.5, colorStops: [{ offset: 0, color: isSelected ? '#34d399' : '#60a5fa' }, { offset: 1, color: isSelected ? '#059669' : '#1e3a8a' }] },
                                shadowBlur: isSelected ? 25 : 15,
                                shadowColor: isGateway ? 'rgba(239, 68, 68, 0.5)' : (isSelected ? 'rgba(52, 211, 153, 0.8)' : 'rgba(59, 130, 246, 0.5)'),
                                borderWidth: isSelected ? 2 : 0,
                                borderColor: '#fff'
                            },
                            symbol: isGateway ? 'roundRect' : 'circle',
                            symbolSize: isGateway ? [80, 50] : (isSelected ? 55 : 45)
                        };
                    }),
                    links: links,
                    lineStyle: { color: '#374151', width: 2, type: 'dashed', curveness: 0.2 },
                    z: 2
                },
                // 4. Interaction Layer (Transparent but clickable)
                {
                    name: 'InteractionLayer',
                    type: 'graph',
                    coordinateSystem: 'cartesian2d',
                    layout: 'none',
                    cursor: 'pointer',
                    symbolSize: 70, // Slightly larger hit area
                    itemStyle: { opacity: 0 }, // Invisible
                    data: nodes.map(node => ({
                        name: node.name,
                        value: node.value,
                        x: node.x,
                        y: node.y,
                        symbol: node.name === 'Gateway' ? 'roundRect' : 'circle',
                        symbolSize: node.name === 'Gateway' ? [80, 50] : 60
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
    }
});

const handleResize = () => {
    chartInstance?.resize();
};

onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    chartInstance?.dispose();
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
    <div class="relative w-full h-64 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        <!-- Quick Select Buttons (Optional, but kept for accessibility) -->
        <div
            class="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1 rounded-full bg-gray-900/70 border border-gray-700 shadow z-20">
            <button v-for="node in deviceNodes" :key="node.name" @click="selectNode(node.name)"
                class="px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer" :class="selectedNodeName === node.name
                    ? 'bg-green-500/20 border-green-400 text-green-200'
                    : 'bg-gray-900/60 border-gray-600 text-gray-300 hover:border-gray-400'">
                {{ node.name }}
            </button>
        </div>

        <div ref="chartRef" class="w-full h-full z-10"></div>
    </div>
</template>
