<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { ArrowUpRight, Zap, ShieldCheck, Timer } from 'lucide-vue-next';
import type { StageInfo } from '../api/stages';

const props = defineProps({
    deviceName: { type: String, default: 'All Devices' },
    metrics: { type: Object as () => { throughput: number; latency: number; securityScore: number } | null, default: null },
    stage: { type: Object as () => StageInfo, required: true }
});

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const stats = ref({
    standard: { throughput: 0, latency: 0, score: 0 },
    custom: { throughput: 0, latency: 0, score: 0 },
    speedup: '1.0'
});

const theme = {
    danger: '#fb7185',
    dangerGlow: 'rgba(251, 113, 133, 0.2)',
    success: '#34d399',
    successGlow: 'rgba(52, 211, 153, 0.2)',
    accent: '#7dd3fc',
    muted: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.1)'
};

// Simulate different performance profiles for devices
const getDeviceData = (name: string, stage: StageInfo) => {
    let multiplier = 1.0;
    if (name.includes('Secure') || name.includes(' A') || name.includes(' C')) multiplier = 1.15;
    if (name.includes('Node') || name.includes(' B') || name.includes(' D')) multiplier = 0.85;

    const stdLatency = stage.metrics.stdLatency / multiplier;
    const custLatency = stage.metrics.latency / multiplier;

    return {
        standard: {
            throughput: stage.metrics.stdThroughput * multiplier,
            latency: stdLatency,
            score: stage.metrics.stdSecurityScore
        },
        custom: {
            throughput: stage.metrics.throughput * multiplier,
            latency: custLatency,
            score: stage.metrics.securityScore
        },
        speedup: (stdLatency / custLatency).toFixed(1)
    };
};

const updateChart = () => {
    const data = props.metrics ? {
        standard: {
            throughput: props.stage.metrics.stdThroughput,
            latency: props.stage.metrics.stdLatency,
            score: props.stage.metrics.stdSecurityScore
        },
        custom: {
            throughput: props.metrics.throughput,
            latency: props.metrics.latency,
            score: props.metrics.securityScore
        },
        speedup: (props.stage.metrics.stdLatency / props.metrics.latency).toFixed(1)
    } : getDeviceData(props.deviceName, props.stage);

    stats.value = data;

    if (!chartInstance) return;

    chartInstance.setOption({
        series: [
            { data: [data.standard.throughput] },
            { data: [data.custom.throughput] },
            { data: [data.standard.score] },
            { data: [data.custom.score] }
        ]
    });
};

watch(() => props.deviceName, updateChart);
watch(() => props.metrics, updateChart);
watch(() => props.stage, updateChart);

onMounted(() => {
    stats.value = getDeviceData(props.deviceName, props.stage);

    if (chartRef.value) {
        chartInstance = echarts.init(chartRef.value, 'dark');

        const option = {
            title: [
                {
                    text: 'THROUGHPUT PERFORMANCE',
                    left: 'center',
                    top: '0%',
                    textStyle: {
                        color: theme.muted,
                        fontSize: 11,
                        fontWeight: 'bold'
                    }
                },
                {
                    text: 'SECURITY INTEGRITY SCORE',
                    left: 'center',
                    top: '52%',
                    textStyle: {
                        color: theme.muted,
                        fontSize: 11,
                        fontWeight: 'bold'
                    }
                }
            ],
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                borderColor: 'rgba(125, 211, 252, 0.2)',
                textStyle: { color: '#fff', fontSize: 12 },
                axisPointer: { type: 'shadow' }
            },
            legend: {
                data: ['Software (Std)', 'RISC-V Crypto (HW)'],
                bottom: '1%',
                textStyle: { color: theme.muted, fontSize: 10 },
                itemWidth: 12,
                itemHeight: 12
            },
            grid: [
                { top: '15%', bottom: '52%', left: '10%', right: '15%' },
                { top: '65%', bottom: '12%', left: '10%', right: '15%' }
            ],
            xAxis: [
                {
                    type: 'value',
                    gridIndex: 0,
                    axisLabel: { show: false },
                    splitLine: { lineStyle: { color: theme.grid, type: 'dashed' } }
                },
                {
                    type: 'value',
                    gridIndex: 1,
                    max: 100,
                    axisLabel: { show: false },
                    splitLine: { lineStyle: { color: theme.grid, type: 'dashed' } }
                }
            ],
            yAxis: [
                { type: 'category', gridIndex: 0, data: [''], axisLine: { show: false }, axisTick: { show: false } },
                { type: 'category', gridIndex: 1, data: [''], axisLine: { show: false }, axisTick: { show: false } }
            ],
            series: [
                {
                    name: 'Software (Std)',
                    type: 'bar',
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    barWidth: '35%',
                    data: [stats.value.standard.throughput],
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: theme.dangerGlow },
                            { offset: 1, color: theme.danger }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    },
                    label: { show: true, position: 'right', color: theme.danger, fontSize: 10, fontWeight: 'bold', formatter: '{c} MB/s' }
                },
                {
                    name: 'RISC-V Crypto (HW)',
                    type: 'bar',
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    barWidth: '35%',
                    data: [stats.value.custom.throughput],
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: theme.successGlow },
                            { offset: 1, color: theme.success }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    },
                    label: { show: true, position: 'right', color: theme.success, fontSize: 10, fontWeight: 'bold', formatter: '{c} MB/s' }
                },
                {
                    name: 'Software (Std)',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    barWidth: '35%',
                    data: [stats.value.standard.score],
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: theme.dangerGlow },
                            { offset: 1, color: theme.danger }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    },
                    label: { show: true, position: 'right', color: theme.danger, fontSize: 10, formatter: '{c}/100' }
                },
                {
                    name: 'RISC-V Crypto (HW)',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    barWidth: '35%',
                    data: [stats.value.custom.score],
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: theme.successGlow },
                            { offset: 1, color: theme.success }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    },
                    label: { show: true, position: 'right', color: theme.success, fontSize: 10, formatter: '{c}/100' }
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
    if (chartInstance) {
        chartInstance.dispose();
        chartInstance = null;
    }
});
</script>

<template>
    <div class="h-full p-4 flex flex-col gap-4">
        <!-- Main Comparison Chart -->
        <div ref="chartRef" class="w-full h-56 min-h-[220px]"></div>

        <!-- Metric Details Cards -->
        <div class="grid grid-cols-2 gap-3">
            <!-- Software Performance -->
            <div class="p-3 bg-slate-900/60 rounded-lg border border-slate-700/40 relative overflow-hidden group">
                <div class="absolute top-0 left-0 w-1 h-full bg-rose-500/50"></div>
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Legacy Software</span>
                    <Timer class="w-3.5 h-3.5 text-rose-400 opacity-50" />
                </div>
                <div class="text-xl font-mono font-bold text-rose-300">{{ stats.standard.latency.toFixed(2) }}<span
                        class="text-[10px] ml-1 opacity-60">ms</span></div>
                <div class="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <Zap class="w-3 h-3" /> Avg Latency
                </div>
            </div>

            <!-- Hardware Performance -->
            <div class="p-3 bg-teal-500/5 rounded-lg border border-teal-500/20 relative overflow-hidden group">
                <div class="absolute top-0 left-0 w-1 h-full bg-teal-500/50"></div>
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-bold text-teal-500 uppercase tracking-wider">RISC-V Accel</span>
                    <Zap class="w-3.5 h-3.5 text-teal-400 animate-pulse" />
                </div>
                <div class="text-xl font-mono font-bold text-teal-300">{{ stats.custom.latency.toFixed(2) }}<span
                        class="text-[10px] ml-1 opacity-60">ms</span></div>
                <div class="text-[10px] text-teal-500/70 mt-1 flex items-center gap-1">
                    <ShieldCheck class="w-3 h-3" /> Verified Secure
                </div>
            </div>
        </div>

        <!-- Acceleration Factor Summary -->
        <div
            class="mt-auto p-3 bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg border border-white/5 flex items-center justify-between">
            <div class="flex flex-col">
                <span class="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Hardware Speedup
                    Index</span>
                <span class="text-[11px] text-teal-500/80 italic">Optimized RISC-V Crypto Kernel</span>
            </div>
            <div class="flex items-baseline gap-1">
                <span class="text-2xl font-mono font-black text-white tracking-tighter">{{ stats.speedup }}</span>
                <span class="text-teal-400 font-bold text-xs">x</span>
                <ArrowUpRight class="w-4 h-4 text-teal-400 ml-1" />
            </div>
        </div>
    </div>
</template>

<style scoped></style>
