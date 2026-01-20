<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
    modelValue?: string
}>();

const emit = defineEmits(['update:modelValue', 'node-select']);

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const selectedNodeName = ref(props.modelValue || 'IoT Dev-A');

onMounted(() => {
    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Setup Nodes Data
        const nodes = [
            { name: 'Gateway', symbol: 'roundRect', x: 400, y: 300, value: '192.168.1.1 (GW)', category: 'gateway' },
            { name: 'IoT Dev-A', x: 150, y: 100, value: '192.168.1.101', speed: 'High', category: 'device' },
            { name: 'IoT Dev-B', x: 400, y: 100, value: '192.168.1.102', speed: 'Low', category: 'device' },
            { name: 'IoT Dev-C', x: 650, y: 100, value: '192.168.1.103', speed: 'Secure', category: 'device' }
        ];

        // Emit initial selection
        const initialNode = nodes.find(n => n.name === selectedNodeName.value);
        if (initialNode) emit('node-select', initialNode);

        // Helper to map names to coords
        const nodeMap: any = {};
        nodes.forEach(n => nodeMap[n.name] = [n.x, n.y]);

        const links = [
            { source: 'Gateway', target: 'IoT Dev-A' },
            { source: 'Gateway', target: 'IoT Dev-B' },
            { source: 'Gateway', target: 'IoT Dev-C' }
        ];

        // Lines data
        const linesData = links.map(link => ({ coords: [nodeMap[link.source], nodeMap[link.target]] }));
        const linesDataReturn = links.map(link => ({ coords: [nodeMap[link.target], nodeMap[link.source]] }));

        const getOption = (selectedName: string) => ({
            title: {
                text: 'Network Topology & Traffic Monitor',
                subtext: 'Select a device to monitor instruction execution',
                left: 'center',
                top: 10,
                textStyle: { color: '#9ca3af', fontSize: 16 }
            },
            tooltip: {
                trigger: 'item',
                formatter: (params: any) => {
                    if (params.dataType === 'node') {
                        return `<div class="font-bold">${params.name}</div><div>IP: ${params.value}</div>`;
                    }
                    return '';
                },
                backgroundColor: 'rgba(31, 41, 55, 0.9)',
                borderColor: '#374151',
                textStyle: { color: '#f3f4f6' }
            },
            xAxis: { show: false, min: 0, max: 800, type: 'value' },
            yAxis: { show: false, min: 0, max: 400, type: 'value' },
            grid: { top: 40, bottom: 20, left: 20, right: 20 },
            series: [
                {
                    type: 'lines',
                    coordinateSystem: 'cartesian2d',
                    effect: { show: true, period: 4, trailLength: 0.1, symbol: 'arrow', symbolSize: 6, color: '#60a5fa' },
                    lineStyle: { color: '#1e3a8a', width: 0, curveness: 0.2 },
                    data: linesData
                },
                {
                    type: 'lines',
                    coordinateSystem: 'cartesian2d',
                    effect: { show: true, period: 3, trailLength: 0.3, symbol: 'circle', symbolSize: 4, color: '#34d399' },
                    lineStyle: { color: '#064e3b', width: 0, curveness: -0.2 },
                    data: linesDataReturn
                },
                {
                    type: 'graph',
                    coordinateSystem: 'cartesian2d',
                    layout: 'none',
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
                    z: 10
                }
            ],
            backgroundColor: 'transparent'
        });

        chartInstance.setOption(getOption(selectedNodeName.value));

        // Click Handler
        chartInstance.on('click', (params: any) => {
            if (params.dataType === 'node' && params.data.name !== 'Gateway') {
                selectedNodeName.value = params.data.name;
                emit('update:modelValue', params.data.name);
                emit('node-select', params.data);
                chartInstance?.setOption(getOption(params.data.name));
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
</script>

<template>
    <div ref="chartRef" class="w-full h-64 bg-gray-800 rounded-lg shadow-lg border border-gray-700"></div>
</template>
