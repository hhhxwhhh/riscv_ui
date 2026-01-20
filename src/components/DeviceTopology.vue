<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

onMounted(() => {
    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        // Mock Data for Topology
        const nodes = [
            { name: 'Gateway', symbol: 'rect', x: 300, y: 50, value: '192.168.1.1' },
            { name: 'Device A', x: 100, y: 200, value: '192.168.1.101' },
            { name: 'Device B', x: 300, y: 200, value: '192.168.1.102' },
            { name: 'Device C', x: 500, y: 200, value: '192.168.1.103' }
        ];

        const links = [
            { source: 'Gateway', target: 'Device A' },
            { source: 'Gateway', target: 'Device B' },
            { source: 'Gateway', target: 'Device C' }
        ];

        const option = {
            title: {
                text: 'Device Topology',
                left: 'center',
                textStyle: { color: '#eee' }
            },
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c}'
            },
            series: [
                {
                    type: 'graph',
                    layout: 'none',
                    symbolSize: 50,
                    roam: true,
                    label: {
                        show: true,
                        position: 'bottom',
                        color: '#fff'
                    },
                    edgeSymbol: ['circle', 'arrow'],
                    edgeSymbolSize: [4, 10],
                    edgeLabel: {
                        fontSize: 20
                    },
                    data: nodes.map(node => ({
                        ...node,
                        itemStyle: { color: node.name === 'Gateway' ? '#ef4444' : '#3b82f6' }
                    })),
                    links: links,
                    lineStyle: {
                        opacity: 0.9,
                        width: 2,
                        curveness: 0
                    }
                }
            ],
            backgroundColor: 'transparent'
        };

        chartInstance.setOption(option);

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
