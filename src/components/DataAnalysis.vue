<script setup lang="ts">
import { onMounted, ref, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { ArrowUpRight, Zap, ShieldCheck, Timer } from 'lucide-vue-next';
import type { StageInfo } from '../api/stages';

const props = defineProps({
    deviceName: { type: String, default: 'All Devices' },
    metrics: { type: Object as () => { throughput: number; latency: number; securityScore: number } | null, default: null },
    stage: { type: Object as () => StageInfo, required: true },
    devices: { type: Array as () => any[], default: () => [] }
});

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const stats = ref({
    standard: { throughput: 0, latency: 0, score: 0 },
    custom: { throughput: 0, latency: 0, score: 0 },
    speedup: '1.0',
    history: [] as any[]
});

const theme = {
    danger: '#f43f5e',
    dangerGlow: 'rgba(244, 63, 94, 0.4)',
    success: '#10b981',
    successGlow: 'rgba(16, 185, 129, 0.4)',
    accent: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.4)',
    muted: '#64748b',
    grid: 'rgba(148, 163, 184, 0.05)'
};

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

// Aggregate data for the whole group or specific device
const getAggregatedData = (deviceName: string | string[], stage: StageInfo, allDevices: any[]) => {
    // If multiple devices are selected (Relay Mode)
    if (Array.isArray(deviceName) && deviceName.length === 2) {
        const devs = allDevices.filter(d => deviceName.includes(d.name));
        if (devs.length === 2 && devs[0].metrics && devs[1].metrics) {
            const combinedTput = devs[0].metrics.throughput + devs[1].metrics.throughput;
            const avgLat = (devs[0].metrics.latency + devs[1].metrics.latency) / 2;
            const avgScore = (devs[0].metrics.securityScore + devs[1].metrics.securityScore) / 2;

            return {
                standard: {
                    throughput: stage.metrics.stdThroughput * 2, // Compare double-stream baseline
                    latency: stage.metrics.stdLatency,
                    score: stage.metrics.stdSecurityScore
                },
                custom: {
                    throughput: combinedTput,
                    latency: avgLat,
                    score: avgScore
                },
                speedup: (stage.metrics.stdLatency / avgLat).toFixed(1),
                history: [] as any[]
            };
        }
    }

    // If single device is selected
    const targetName = Array.isArray(deviceName) ? deviceName[0] : deviceName;
    if (targetName && targetName !== 'All Devices') {
        const dev = allDevices.find(d => d.name === targetName);
        if (dev && dev.metrics) {
            return {
                standard: {
                    throughput: stage.metrics.stdThroughput,
                    latency: stage.metrics.stdLatency,
                    score: stage.metrics.stdSecurityScore
                },
                custom: {
                    throughput: dev.metrics.throughput,
                    latency: dev.metrics.latency,
                    score: dev.metrics.securityScore
                },
                speedup: (stage.metrics.stdLatency / dev.metrics.latency).toFixed(1),
                history: [] as any[]
            };
        }
    }

    // Otherwise, calculate averages for all devices currently in this stage
    const devicesInStage = allDevices.filter(d => d.stageId === stage.id && d.metrics);

    if (devicesInStage.length === 0) {
        // Fallback to baseline
        return {
            standard: { throughput: stage.metrics.stdThroughput, latency: stage.metrics.stdLatency, score: stage.metrics.stdSecurityScore },
            custom: { throughput: stage.metrics.throughput, latency: stage.metrics.latency, score: stage.metrics.securityScore },
            speedup: (stage.metrics.stdLatency / stage.metrics.latency).toFixed(1),
            history: [] as any[]
        };
    }

    const avgTput = devicesInStage.reduce((sum, d) => sum + d.metrics!.throughput, 0) / devicesInStage.length;
    const avgLat = devicesInStage.reduce((sum, d) => sum + d.metrics!.latency, 0) / devicesInStage.length;
    const avgScore = devicesInStage.reduce((sum, d) => sum + d.metrics!.securityScore, 0) / devicesInStage.length;

    return {
        standard: {
            throughput: stage.metrics.stdThroughput,
            latency: stage.metrics.stdLatency,
            score: stage.metrics.stdSecurityScore
        },
        custom: {
            throughput: avgTput,
            latency: avgLat,
            score: avgScore
        },
        speedup: (stage.metrics.stdLatency / avgLat).toFixed(1),
        history: [] as any[]
    };
};

const updateChart = () => {
    const data = getAggregatedData(props.deviceName, props.stage, props.devices);
    stats.value = data;

    if (!chartInstance) return;

    // Fetch history from backend API
    fetch(`${apiBase}/api/analysis/trends?limit=15`).then(r => r.json()).then(history => {
        if (Array.isArray(history)) {
            stats.value.history = history;
        }
    }).catch(e => console.warn('Failed to fetch trends:', e));

    chartInstance.setOption({
        series: [
            {
                data: [data.standard.throughput],
                label: { formatter: '{c} MB/s' }
            },
            {
                data: [data.custom.throughput],
                label: {
                    formatter: (params: any) => `{val|${params.value}} {unit|MB/s}`,
                    rich: {
                        val: { fontWeight: 'bold' },
                        unit: { fontSize: 8, opacity: 0.6 }
                    }
                }
            },
            { data: [data.standard.score] },
            { data: [data.custom.score] }
        ]
    });
};

let updateRequested = false;
const scheduleUpdate = () => {
    if (updateRequested) return;
    updateRequested = true;
    requestAnimationFrame(() => {
        updateChart();
        updateRequested = false;
    });
};

watch(() => props.deviceName, scheduleUpdate);
watch(() => props.metrics, scheduleUpdate);
watch(() => props.stage, scheduleUpdate);
watch(() => props.devices, scheduleUpdate, { deep: true });

onMounted(() => {
    scheduleUpdate();

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
                    label: { show: true, position: 'right', color: theme.success, fontSize: 10, fontWeight: 'bold', formatter: '{c} MB/s' },
                    showBackground: true,
                    backgroundStyle: {
                        color: 'rgba(56, 189, 248, 0.03)',
                        borderRadius: [0, 4, 4, 0]
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 15,
                            shadowColor: theme.successGlow
                        }
                    }
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
                            { offset: 0, color: theme.accentGlow },
                            { offset: 1, color: theme.accent }
                        ]),
                        borderRadius: [0, 4, 4, 0]
                    },
                    label: { show: true, position: 'right', color: theme.accent, fontSize: 10, formatter: '{c}/100' }
                }
            ],
            animationDuration: 800,
            animationDurationUpdate: 500,
            animationThreshold: 2000,
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
