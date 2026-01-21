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
    { name: 'IoT Dev-A', x: 100, y: 100, value: '192.168.1.101', category: 'device' },
    { name: 'IoT Dev-B', x: 300, y: 100, value: '192.168.1.102', category: 'device' },
    { name: 'IoT Dev-C', x: 500, y: 100, value: '192.168.1.103', category: 'device' },
    { name: 'IoT Dev-D', x: 700, y: 100, value: '192.168.1.104', category: 'device' }
];


// Icons (SVG Paths with ViewBox Fix)
// Note: ECharts scales path to symbolSize. If aspect ratio is wide, scaling might look weird.
// These icons are from MDI, standard 24x24 box.
const IconsPaths = {
    // Server / Gateway Icon
    gateway: 'M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z',
    // PC Icon
    device: 'M20,18H4V6H20M20,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6C22,4.89 21.11,4 20,4Z'
};

const getSvgSymbol = (path: string, color: string) => {
    // Encode color to ensure # is handled (though encodeURIComponent handles it)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}"><path d="${path}"/></svg>`;
    return `image://data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

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
                        const isGateway = node.name === 'Gateway';
                        const isSelected = node.name === selectedName;
                        const color = isGateway ? '#ef4444' : (isSelected ? '#34d399' : '#60a5fa');

                        return {
                            ...node,
                            symbol: getSvgSymbol(isGateway ? IconsPaths.gateway : IconsPaths.device, color),
                            symbolKeepAspect: true,
                            symbolSize: isGateway ? 50 : 40,
                            itemStyle: {
                                color: color,
                                shadowBlur: isSelected ? 20 : 10,
                                shadowColor: isGateway ? 'rgba(239, 68, 68, 0.5)' : (isSelected ? 'rgba(52, 211, 153, 0.8)' : 'rgba(59, 130, 246, 0.5)'),
                                borderWidth: 0,
                                borderColor: 'transparent'
                            }
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
                    symbolSize: 60, // Consistent larger hit area
                    itemStyle: { opacity: 0 }, // Invisible
                    data: nodes.map(node => ({
                        name: node.name,
                        value: node.value,
                        x: node.x,
                        y: node.y,
                        symbol: 'path://' + (node.name === 'Gateway' ? IconsPaths.gateway : IconsPaths.device),
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
