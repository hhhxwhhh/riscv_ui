<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { fetchJson } from './api/client';
import { STAGES } from './api/stages';
import DeviceTopology from './components/DeviceTopology.vue';
import CodeExecutionViewer from './components/CodeExecutionViewer.vue';
import DataAnalysis from './components/DataAnalysis.vue';

const selectedDevice = ref('IoT Dev-A');
const selectedDeviceIP = ref('192.168.1.101');
const wsStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting');
const lastMessageAt = ref<number | null>(null);
const latestMetrics = ref<{ throughput: number; latency: number; securityScore: number; stdThroughput?: number; stdLatency?: number; stdSecurityScore?: number } | null>(null);
const devices = ref<{ id?: string; name: string; ip: string }[]>([]);
const apiStatus = ref<'idle' | 'loading' | 'error' | 'ready'>('idle');

const currentStageIndex = ref(0); // Default to Authentication
const currentStage = computed(() => STAGES[currentStageIndex.value] || STAGES[0]);

const isSimulating = ref(false);
let simTimer: any = null;

const toggleSimulation = () => {
  if (isSimulating.value) {
    clearInterval(simTimer);
    isSimulating.value = false;
  } else {
    isSimulating.value = true;
    currentStageIndex.value = 0;
    simTimer = setInterval(() => {
      if (currentStageIndex.value < STAGES.length - 1) {
        currentStageIndex.value++;
      } else {
        clearInterval(simTimer);
        isSimulating.value = false;
      }
    }, 4000);
  }
};

const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
const handleNodeSelect = (node: any) => {
  if (!node || !node.name) {
    selectedDevice.value = '';
    selectedDeviceIP.value = '';
    return;
  }

  if (node.name !== 'Gateway' && node.name !== 'A100 Gateway') {
    selectedDevice.value = node.name;
    selectedDeviceIP.value = node.value || '';
  }
};

const handleWsStatus = (status: 'connecting' | 'connected' | 'disconnected') => {
  wsStatus.value = status;
};

const handleWsLastMessage = (timestamp: number) => {
  lastMessageAt.value = timestamp;
};

const handleTelemetry = (packet: any) => {
  if (packet?.metrics) {
    latestMetrics.value = {
      throughput: Number(packet.metrics.throughput ?? 0),
      latency: Number(packet.metrics.latency ?? 0),
      securityScore: Number(packet.metrics.securityScore ?? 0)
    };
  }
};

const loadDevices = async () => {
  try {
    apiStatus.value = 'loading';
    const data = await fetchJson<Array<{ id?: string; name: string; ip: string }>>(`${apiBase}/api/devices`);
    devices.value = (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      ip: item.ip
    }));
    if (devices.value.length && !devices.value.find((d) => d.name === selectedDevice.value)) {
      const firstDevice = devices.value[0];
      if (firstDevice) {
        selectedDevice.value = firstDevice.name;
        selectedDeviceIP.value = firstDevice.ip;
      }
    }
    apiStatus.value = 'ready';
  } catch {
    apiStatus.value = 'error';
  }
};

const loadMetrics = async () => {
  try {
    const data = await fetchJson<{ throughput?: number; latency?: number; securityScore?: number }>(`${apiBase}/api/metrics`);
    latestMetrics.value = {
      throughput: Number(data.throughput ?? 0),
      latency: Number(data.latency ?? 0),
      securityScore: Number(data.securityScore ?? 0)
    };
  } catch {
    // ignore
  }
};

onMounted(() => {
  loadDevices();
  loadMetrics();
});
</script>

<template>
  <div class="app-shell text-gray-100">
    <div class="mx-auto max-w-[1400px] px-6 py-6 flex flex-col gap-6">
      <!-- Header -->
      <header class="panel panel-glow px-6 py-4 flex flex-col gap-3">
        <div class="flex items-center justify-between flex-wrap gap-4">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center font-bold shadow-lg">
              R</div>
            <div>
              <h1 class="text-2xl font-bold tracking-wide">RISC-V 全架构安全网关演示系统</h1>
              <div class="subtle-text text-sm mt-0.5">面向物联网的全生命周期加解密与身份认证监控</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="px-3 py-1 rounded-full bg-teal-500/10 text-teal-200 border border-teal-400/30 text-xs font-semibold breathing-glow">
              LIVE</div>
            <div class="px-3 py-1 rounded-full text-xs font-semibold border" :class="apiStatus === 'ready'
              ? 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30'
              : apiStatus === 'loading'
                ? 'bg-amber-500/10 text-amber-200 border-amber-400/30'
                : apiStatus === 'error'
                  ? 'bg-rose-500/10 text-rose-200 border-rose-400/30'
                  : 'bg-slate-500/10 text-slate-200 border-slate-400/30'">
              API: {{ apiStatus.toUpperCase() }}
            </div>
            <div class="text-sm subtle-text">
              Status:
              <span class="font-mono" :class="wsStatus === 'connected'
                ? 'text-emerald-300'
                : wsStatus === 'connecting'
                  ? 'text-amber-300'
                  : 'text-rose-300'">
                {{ wsStatus.toUpperCase() }}
              </span>
            </div>
            <div class="text-sm subtle-text">
              Last Msg:
              <span class="text-slate-200 font-mono">
                {{ lastMessageAt ? new Date(lastMessageAt).toLocaleTimeString() : '--' }}
              </span>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDevice" class="panel px-4 py-3">
              <div class="text-xs uppercase subtle-text">Active Device</div>
              <div class="text-lg font-semibold text-sky-200 mt-1">{{ selectedDevice || 'All Devices' }}</div>
            </div>
          </transition>
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDeviceIP" class="panel px-4 py-3">
              <div class="text-xs uppercase subtle-text">Target IP</div>
              <div class="text-lg font-mono text-slate-200 mt-1">{{ selectedDeviceIP || 'Global Broadcast' }}</div>
            </div>
          </transition>
          <div class="panel px-4 py-3 border-l-4 border-slate-500/30">
            <div class="text-xs uppercase subtle-text mb-2">Process Progress</div>
            <div class="flex items-center gap-1.5 h-7">
              <div v-for="(stage, idx) in STAGES" :key="stage.id"
                class="flex-1 h-1.5 rounded-full transition-all duration-500"
                :class="idx <= currentStageIndex ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'bg-slate-700'">
              </div>
            </div>
            <div class="text-[10px] text-slate-400 mt-1 flex justify-between">
              <span>START</span>
              <span class="text-sky-300 font-bold uppercase">{{ currentStageIndex + 1 }} / {{ STAGES.length }}</span>
              <span>END</span>
            </div>
          </div>
          <div class="panel px-4 py-3 border-l-4 border-teal-500/50" v-if="currentStage">
            <div class="flex items-center justify-between">
              <div class="text-xs uppercase subtle-text">Communication Stage</div>
              <button @click="toggleSimulation" class="text-[10px] px-2 py-0.5 rounded border transition-colors"
                :class="isSimulating ? 'bg-rose-500/20 border-rose-500/50 text-rose-300' : 'bg-sky-500/20 border-sky-500/50 text-sky-300'">
                {{ isSimulating ? 'STOP SIM' : 'PLAY PROCESS' }}
              </button>
            </div>
            <select v-model="currentStageIndex"
              class="bg-transparent text-teal-200 font-semibold text-lg border-none focus:ring-0 w-full cursor-pointer appearance-none">
              <option v-for="(stage, idx) in STAGES" :key="stage.id" :value="idx" class="bg-slate-800 text-teal-200">
                {{ stage.name }}
              </option>
            </select>
          </div>
          <div class="panel px-4 py-3" v-if="currentStage">
            <div class="text-xs uppercase subtle-text">Current Status</div>
            <div class="text-lg font-semibold text-amber-200 mt-1 animate-pulse">{{ currentStage.statusText }}</div>
          </div>
        </div>
      </header>

      <!-- Top Section: Topology -->
      <section class="flex-none panel panel-glow p-4" v-if="currentStage">
        <DeviceTopology @node-select="handleNodeSelect" @ws-status="handleWsStatus"
          @ws-last-message="handleWsLastMessage" @telemetry="handleTelemetry" v-model="selectedDevice"
          :devices="devices" :stage="currentStage" />
      </section>

      <!-- Bottom Section: Execution & Analysis -->
      <section class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4" v-if="currentStage">
        <!-- Left: Code Execution (2/3 width) -->
        <div class="lg:col-span-2 min-h-[420px] panel panel-glow p-3">
          <CodeExecutionViewer :deviceName="selectedDevice" :deviceIP="selectedDeviceIP" :stage="currentStage" />
        </div>

        <!-- Right: Analysis (1/3 width) -->
        <div class="lg:col-span-1 min-h-[420px] panel panel-glow p-3">
          <DataAnalysis :deviceName="selectedDevice" :metrics="latestMetrics" :stage="currentStage" />
        </div>
      </section>
    </div>
  </div>
</template>
