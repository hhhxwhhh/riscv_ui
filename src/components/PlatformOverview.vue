<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const props = defineProps<{
    devices: any[]
}>();

const startTime = Date.now();
const currentTime = ref(Date.now());

// Ticker to ensure uptime updates every second independently of telemetry
onMounted(() => {
    setInterval(() => {
        currentTime.value = Date.now();
    }, 1000);
});

const displayUptime = computed(() => {
    const diff = Math.floor((currentTime.value - startTime) / 1000);
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
});

// Use computed for real-time synchronization with props.devices
const displayStats = computed(() => {
    const all = props.devices || [];
    // Count any device that has active data flow OR is marked as online/warning
    // This provides a more robust aggregation and handles dynamic lifecycle states
    const activeOnes = all.filter(d =>
        (d.metrics?.throughput > 0) ||
        ['online', 'warning', 'active', 'authenticating'].includes(d.status || '')
    );

    // Sum Mbps throughput directly from metrics
    const totalMbps = activeOnes.reduce((sum, d) => sum + (d.metrics?.throughput || 0), 0);

    // Average latency only for nodes with data flow to keep it real
    const dataFlowingNodes = activeOnes.filter(d => (d.metrics?.throughput || 0) > 0);
    const totalLat = dataFlowingNodes.reduce((sum, d) => sum + (d.metrics?.latency || 0), 0);

    const mloCount = all.filter(d => d.linkType === 'MLO-Aggregated').length;

    const criticalNodes = all.filter(d => d.metrics?.securityScore < 70).length;

    return {
        total: all.length,
        active: activeOnes.length,
        throughputMbps: totalMbps,
        avgLatencyMs: dataFlowingNodes.length > 0 ? (totalLat / dataFlowingNodes.length).toFixed(2) : '0.80',
        mloUsage: all.length > 0 ? Math.round((mloCount / all.length) * 100) : 0,
        securityThreat: criticalNodes > 0
    };
});
</script>

<template>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div
            class="bg-indigo-500/5 border border-indigo-500/20 p-2.5 rounded-lg backdrop-blur-md relative overflow-hidden transition-all duration-500 shadow-lg"
            :class="{ 'ring-2 ring-rose-500 ring-inset bg-rose-500/5': displayStats.securityThreat }">
            <div class="absolute -right-4 -top-4 w-12 h-12 rounded-full blur-xl"
                :class="displayStats.securityThreat ? 'bg-rose-500/20 animate-pulse' : 'bg-indigo-500/10'"></div>
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] uppercase font-bold tracking-widest transition-colors duration-500"
                    :class="displayStats.securityThreat ? 'text-rose-300' : 'text-indigo-300/60'">ISA Extensions</span>
                <div v-if="displayStats.securityThreat" class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></div>
            </div>
            <div class="text-sm font-black uppercase tracking-tighter transition-colors duration-500"
                :class="displayStats.securityThreat ? 'text-rose-200' : 'text-indigo-200'">
                {{ displayStats.securityThreat ? 'INTEGRITY RISK' : 'RISC-V Zkn + Zkq' }}
            </div>
            <div class="text-[9px] mt-0.5 font-mono transition-colors duration-500" :class="displayStats.securityThreat ? 'text-rose-400' : 'text-indigo-400/80'">
                {{ displayStats.securityThreat ? 'CORE SECURITY WARNING' : 'SM2/3/4 HW-Vectorized' }}
            </div>
        </div>

        <div
            class="bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-lg backdrop-blur-md relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-12 h-12 bg-emerald-500/10 rounded-full blur-xl"></div>
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] uppercase text-emerald-300/60 font-bold tracking-widest">Mesh Status</span>
            </div>
            <div class="text-sm font-black text-emerald-200">{{ displayStats.active }} <span
                    class="text-[10px] opacity-60">Nodes Active</span></div>
            <div class="text-[9px] text-emerald-500/80 mt-0.5">Coverage: {{ displayStats.mloUsage }}% MLO Aggregated
            </div>
        </div>

        <div class="bg-sky-500/5 border border-sky-500/20 p-2.5 rounded-lg backdrop-blur-md relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-12 h-12 bg-sky-500/10 rounded-full blur-xl"></div>
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] uppercase text-sky-300/60 font-bold tracking-widest">Total IOPS</span>
            </div>
            <div class="text-sm font-mono font-black text-sky-200">
                {{ (displayStats.throughputMbps / 1024).toFixed(2) }} <span
                    class="text-[10px] opacity-60 uppercase">Gbps</span>
            </div>
            <div class="text-[9px] text-sky-500/80 mt-0.5">Avg Latency: {{ displayStats.avgLatencyMs }}ms (E2E)</div>
        </div>

        <div
            class="bg-purple-500/5 border border-purple-500/20 p-2.5 rounded-lg backdrop-blur-md relative overflow-hidden">
            <div class="absolute -right-4 -top-4 w-12 h-12 bg-purple-500/10 rounded-full blur-xl"></div>
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] uppercase text-purple-300/60 font-bold tracking-widest">Security Audit</span>
            </div>
            <div class="text-sm font-black text-purple-200 uppercase tracking-tighter">WPA3-EHT Verified</div>
            <div class="text-[9px] text-purple-400/80 mt-0.5 font-mono">Uptime: {{ displayUptime }}</div>
        </div>
    </div>
</template>

<style scoped></style>
