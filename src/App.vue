<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { fetchJson } from './api/client';
import { STAGES } from './api/stages';
import DeviceTopology from './components/DeviceTopology.vue';
import CodeExecutionViewer from './components/CodeExecutionViewer.vue';
import DataAnalysis from './components/DataAnalysis.vue';

// 持久化选择状态
const savedSelection = localStorage.getItem('selected_devices');
const selectedDevices = ref<string[]>(savedSelection ? JSON.parse(savedSelection) : []);

// 监听选择变化并保存
watch(selectedDevices, (newVal) => {
  localStorage.setItem('selected_devices', JSON.stringify(newVal));
}, { deep: true });

const selectedDeviceIPs = computed(() => {
  return selectedDevices.value.map(name =>
    devices.value.find(d => d.name === name)?.ip || ''
  ).filter(ip => !!ip);
});

const wsStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting');
const lastMessageAt = ref<number | null>(null);
const latestMetrics = ref<{ throughput: number; latency: number; securityScore: number; stdThroughput?: number; stdLatency?: number; stdSecurityScore?: number } | null>(null);

// 去掉固定部分：初始化为空列表，由 API 和 WebSocket 填充
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

// 执行节点选择回调
const handleNodeSelect = (node: any) => {
  if (!node || !node.name) return;
  console.log('Selected Node:', node.name);
};

const handleWsStatus = (status: 'connecting' | 'connected' | 'disconnected') => {
  wsStatus.value = status;
};

const handleWsLastMessage = (timestamp: number) => {
  // Throttle updates to lastMessageAt to avoid excessive re-renders
  if (!lastMessageAt.value || timestamp - lastMessageAt.value > 1000) {
    lastMessageAt.value = timestamp;
  }
};

const handleTelemetry = (packet: any) => {
  if (!packet) return;

  // 补全：处理设备动态加入/退出消息
  if (packet.type === 'device_join' && packet.device) {
    const exists = devices.value.find(d => d.ip === packet.device.ip || d.name === packet.device.name);
    if (!exists) {
      devices.value = [...devices.value, packet.device];
    }
    return;
  }
  if (packet.type === 'device_exit') {
    devices.value = devices.value.filter(d => d.ip !== packet.ip && d.name !== packet.name);
    // 同步更新选中状态
    if (selectedDevices.value.includes(packet.name)) {
      selectedDevices.value = selectedDevices.value.filter(n => n !== packet.name);
    }
    return;
  }

  // Update global metrics or selected device metrics
  if (packet?.metrics) {
    // Filter metrics by any of the selected IPs
    const isTarget = selectedDeviceIPs.value.length === 0 || selectedDeviceIPs.value.includes(packet.source as string);

    if (isTarget) {
      latestMetrics.value = {
        throughput: Number(packet.metrics.throughput ?? 0),
        latency: Number(packet.metrics.latency ?? 0),
        securityScore: Number(packet.metrics.securityScore ?? 0)
      };
    }
  }
};

const loadDevices = async (isBackground = false) => {
  try {
    if (!isBackground) apiStatus.value = 'loading';
    const data = await fetchJson<Array<{ id?: string; name: string; ip: string }>>(`${apiBase}/api/devices`);

    // 修复：确保 API 返回的数据能够被正确合并
    const newDevices = (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      ip: item.ip
    }));

    if (newDevices.length > 0) {
      // Comparison to avoid unnecessary re-assignment
      const sameLength = newDevices.length === devices.value.length;
      if (!sameLength || JSON.stringify(newDevices) !== JSON.stringify(devices.value)) {
        devices.value = newDevices;
      }
    }

    // 同步选择状态：移除已不在列表中的设备
    const validNames = new Set(devices.value.map(d => d.name));
    const nextSelected = selectedDevices.value.filter(name => validNames.has(name));

    // 移除自动选择逻辑，仅在有选中的设备离开时更新状态
    if (nextSelected.length !== selectedDevices.value.length) {
      selectedDevices.value = nextSelected;
    }

    apiStatus.value = 'ready';
  } catch {
    if (!isBackground) apiStatus.value = 'error';
  }
};

const loadMetrics = async () => {
  try {
    const data = await fetchJson<{ throughput?: number; latency?: number; securityScore?: number }>(`${apiBase}/api/metrics`);
    latestMetrics.value = {
      throughput: Number(data.throughput ?? 0),
      latency: Number(data.latency ?? 1.2),
      securityScore: Number(data.securityScore ?? 95)
    };
  } catch {
    // skip
  }
};

onMounted(() => {
  loadDevices();
  loadMetrics();

  // 修复：除了 WS 实时更新，每 10 秒强制全量同步一次，防止 WS 丢包导致的状态不一致
  setInterval(() => {
    loadDevices(true);
    loadMetrics();
  }, 10000);
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
            <div :key="selectedDevices.join(',')" class="panel px-4 py-3">
              <div class="text-xs uppercase subtle-text">Active Device(s)</div>
              <div class="text-lg font-semibold text-sky-200 mt-1 truncate">
                {{ selectedDevices.length ? selectedDevices.join(' & ') : 'All Devices' }}
              </div>
            </div>
          </transition>
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDeviceIPs.join(',')" class="panel px-4 py-3">
              <div class="text-xs uppercase subtle-text">Target IP(s)</div>
              <div class="text-lg font-mono text-slate-200 mt-1 truncate">
                {{ selectedDeviceIPs.length ? selectedDeviceIPs.join(' & ') : 'Global Broadcast' }}
              </div>
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
          @ws-last-message="handleWsLastMessage" @telemetry="handleTelemetry" v-model="selectedDevices"
          :devices="devices" :stage="currentStage" />
      </section>

      <!-- Bottom Section: Execution & Analysis -->
      <section class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4" v-if="currentStage">
        <!-- Left: Code Execution (2/3 width) -->
        <div class="lg:col-span-2 min-h-[420px] panel panel-glow p-3">
          <CodeExecutionViewer :deviceName="selectedDevices[0]" :deviceIP="selectedDeviceIPs[0]"
            :stage="currentStage" />
        </div>

        <!-- Right: Analysis (1/3 width) -->
        <div class="lg:col-span-1 min-h-[420px] panel panel-glow p-3">
          <DataAnalysis :deviceName="selectedDevices[0]" :metrics="latestMetrics" :stage="currentStage" />
        </div>
      </section>
    </div>
  </div>
</template>
