<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
    deviceName: { type: String, default: 'IoT Dev-A' }
});

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const stats = ref({ standard: [120, 0.8, 60], custom: [950, 5.5, 99], latencyStd: '12.5 ms', latencyCust: '0.8 ms' });

const theme = {
    danger: '#fb7185',
    success: '#34d399',
    muted: '#94a3b8',
    grid: '#243047'
};

// Simulate different performance profiles for devices
const getDeviceData = (name: string) => {
    // "Secure" - Highest Performance
    if (name.includes('Dev-C') || name.includes('Secure')) {
        return { standard: [135, 0.9, 65], custom: [980, 5.8, 100], latencyStd: '11.2 ms', latencyCust: '0.6 ms' };
    }
    // "Low Power" / Dev-B - Lowest Performance
    if (name.includes('Dev-B')) {
        return { standard: [75, 0.5, 40], custom: [750, 3.5, 90], latencyStd: '24.5 ms', latencyCust: '1.8 ms' };
    }
    // "Standard" / Dev-A - Mid Performance
    return { standard: [90, 0.6, 50], custom: [850, 4.2, 95], latencyStd: '18.2 ms', latencyCust: '1.2 ms' };
};

const updateChart = () => {
    stats.value = getDeviceData(props.deviceName);
    if (!chartInstance) return;

    chartInstance.setOption({
        series: [
            { data: [stats.value.standard[0]] },  // Top: Throughput Std
            { data: [stats.value.custom[0]] },    // Top: Throughput Cust
            { data: [stats.value.standard[2]] },  // Bottom: Score Std
            { data: [stats.value.custom[2]] }     // Bottom: Score Cust
        ]
    });
};

watch(() => props.deviceName, updateChart);

onMounted(() => {
    stats.value = getDeviceData(props.deviceName);

    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');


        const option = {
            title: [
                { text: 'Throughput (MB/s)', left: 'center', top: '5%', textStyle: { color: theme.muted, fontSize: 12 } },
                { text: 'Security Score', left: 'center', top: '55%', textStyle: { color: theme.muted, fontSize: 12 } }
            ],
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: {
                data: ['Software (Std)', 'RISC-V Crypto (HW)'],
                top: 'bottom',
                textStyle: { color: theme.muted }
            },
            grid: [
                { top: '15%', bottom: '55%', left: '15%', right: '5%' }, // Top Chart (Bar)
                { top: '65%', bottom: '15%', left: '15%', right: '5%' }  // Bottom Chart (Bar)
            ],
            xAxis: [
                { type: 'value', gridIndex: 0, axisLabel: { color: theme.muted }, splitLine: { lineStyle: { color: theme.grid } } },
                { type: 'value', gridIndex: 1, max: 100, axisLabel: { color: theme.muted }, splitLine: { lineStyle: { color: theme.grid } } }
            ],
            yAxis: [
                { type: 'category', gridIndex: 0, data: ['Throughput'], axisLabel: { show: false } },
                { type: 'category', gridIndex: 1, data: ['Security'], axisLabel: { show: false } }
            ],
            series: [
                // Top Chart: Throughput
                {
                    name: 'Software (Std)', type: 'bar', xAxisIndex: 0, yAxisIndex: 0,
                    data: [stats.value.standard[0]],
                    itemStyle: { color: theme.danger },
                    label: { show: true, position: 'right', color: '#fff', formatter: '{c} MB/s' }
                },
                {
                    name: 'RISC-V Crypto (HW)', type: 'bar', xAxisIndex: 0, yAxisIndex: 0,
                    data: [stats.value.custom[0]],
                    itemStyle: { color: theme.success },
                    label: { show: true, position: 'right', color: '#fff', formatter: '{c} MB/s' }
                },
                // Bottom Chart: Security Score
                {
                    name: 'Software (Std)', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
                    data: [stats.value.standard[2]], // Index 2 is Score
                    itemStyle: { color: theme.danger },
                    label: { show: true, position: 'right', color: '#fff', formatter: '{c}/100' }
                },
                {
                    name: 'RISC-V Crypto (HW)', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
                    data: [stats.value.custom[2]],
                    itemStyle: { color: theme.success },
                    label: { show: true, position: 'right', color: '#fff', formatter: '{c}/100' }
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
    <div class="h-full p-4 flex flex-col">
        <div ref="chartRef" class="w-full flex-1 min-h-[300px]"></div>

        <div class="mt-4 grid grid-cols-2 gap-4 text-center">
            <div class="p-3 bg-slate-900/70 rounded border border-slate-700/60">
                <div class="text-xs text-slate-400 uppercase">Avg Latency (Std)</div>
                <div class="text-2xl font-bold text-rose-300">{{ stats.latencyStd }}</div>
            </div>
            <div class="p-3 bg-slate-900/70 rounded border border-slate-700/60">
                <div class="text-xs text-slate-400 uppercase">Avg Latency (Custom)</div>
                <div class="text-2xl font-bold text-teal-300">{{ stats.latencyCust }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped></style>
