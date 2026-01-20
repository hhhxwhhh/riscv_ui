<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

onMounted(() => {
    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        const option = {
            title: {
                text: 'Performance Analysis',
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'shadow'
                }
            },
            legend: {
                data: ['Standard', 'Custom RISC-V'],
                top: 30,
                textStyle: { color: "#ccc" }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                boundaryGap: [0, 0.01],
                axisLabel: { color: "#ccc" }
            },
            yAxis: {
                type: 'category',
                data: ['Throughput (MB/s)', 'Efficiency (Ops/Cycle)', 'Security Score'],
                axisLabel: { color: "#ccc" }
            },
            series: [
                {
                    name: 'Standard',
                    type: 'bar',
                    data: [120, 0.8, 60],
                    itemStyle: { color: '#ef4444' }
                },
                {
                    name: 'Custom RISC-V',
                    type: 'bar',
                    data: [850, 4.2, 95],
                    itemStyle: { color: '#22c55e' }
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
    <div class="h-full bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-lg flex flex-col">
        <div ref="chartRef" class="w-full flex-1 min-h-[300px]"></div>

        <div class="mt-4 grid grid-cols-2 gap-4 text-center">
            <div class="p-3 bg-gray-900 rounded">
                <div class="text-xs text-gray-400 uppercase">Avg Latency</div>
                <div class="text-2xl font-bold text-red-400">12.5 ms</div>
            </div>
            <div class="p-3 bg-gray-900 rounded">
                <div class="text-xs text-gray-400 uppercase">Avg Latency (Custom)</div>
                <div class="text-2xl font-bold text-green-400">1.2 ms</div>
            </div>
        </div>
    </div>
</template>
