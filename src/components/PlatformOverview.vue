<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Cpu, Activity, Database, Shield } from 'lucide-vue-next';

interface PlatformStats {
  totalDevices: number;
  onlineDevices: number;
  totalThroughput: number;
  algorithm: string;
  uptime: string;
}

const props = defineProps<{
    devices: any[]
}>();

const stats = ref<PlatformStats>({
  totalDevices: 0,
  onlineDevices: 0,
  totalThroughput: 0,
  algorithm: 'SM4 Custom ISA',
  uptime: '00:00:00'
});

const avgLatency = ref(1.2);

const startTime = Date.now();

const formatUptime = () => {
    const diff = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

let timer: any = null;

onMounted(() => {
    timer = setInterval(() => {
        stats.value.uptime = formatUptime();
        stats.value.totalDevices = props.devices.length;
        
        const onlineOnes = props.devices.filter(d => d.status === 'online');
        stats.value.onlineDevices = onlineOnes.length;
        
        // Dynamic aggregation of metrics
        const totalTp = onlineOnes.reduce((sum, d) => sum + (d.metrics?.throughput || 0), 0);
        stats.value.totalThroughput = totalTp;

        const totalLat = onlineOnes.reduce((sum, d) => sum + (d.metrics?.latency || 0), 0);
        if (onlineOnes.length > 0) {
            avgLatency.value = Number((totalLat / onlineOnes.length).toFixed(2));
        }
    }, 1000);
});

onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="bg-slate-800/40 border border-slate-700/50 p-2.5 rounded-lg backdrop-blur-sm">
        <div class="flex items-center gap-2 mb-1">
            <Cpu class="w-4 h-4 text-sky-400" />
            <span class="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Gateway Engine</span>
        </div>
        <div class="text-sm font-bold text-sky-200">{{ stats.algorithm }}</div>
        <div class="text-[9px] text-emerald-400 mt-0.5">Hardware Accelerated</div>
    </div>
    
    <div class="bg-slate-800/40 border border-slate-700/50 p-2.5 rounded-lg backdrop-blur-sm">
        <div class="flex items-center gap-2 mb-1">
            <Activity class="w-4 h-4 text-emerald-400" />
            <span class="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Active Nodes</span>
        </div>
        <div class="text-sm font-bold text-emerald-200">{{ stats.onlineDevices }} / {{ stats.totalDevices }}</div>
        <div class="text-[9px] text-slate-400 mt-0.5">Real-time Connection</div>
    </div>

    <div class="bg-slate-800/40 border border-slate-700/50 p-2.5 rounded-lg backdrop-blur-sm">
        <div class="flex items-center gap-2 mb-1">
            <Database class="w-4 h-4 text-amber-400" />
            <span class="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Aggregated Load</span>
        </div>
        <div class="text-sm font-mono font-bold text-amber-200">
            {{ Math.round(stats.totalThroughput) }} <span class="text-[10px] opacity-60">Mbps</span>
        </div>
        <div class="text-[9px] text-slate-400 mt-0.5">Avg Latency: {{ avgLatency }}ms</div>
    </div>

    <div class="bg-slate-800/40 border border-slate-700/50 p-2.5 rounded-lg backdrop-blur-sm">
        <div class="flex items-center gap-2 mb-1">
            <Shield class="w-4 h-4 text-purple-400" />
            <span class="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Security State</span>
        </div>
        <div class="text-sm font-bold text-purple-200">Active ({{ stats.onlineDevices }} Nodes)</div>
        <div class="text-[9px] text-purple-400 mt-0.5">Uptime: {{ stats.uptime }}</div>
    </div>
  </div>
</template>

<style scoped>
</style>
