<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { fetchJson } from './api/client';
import { STAGES } from './api/stages';
import DeviceTopology from './components/DeviceTopology.vue';
import CodeExecutionViewer from './components/CodeExecutionViewer.vue';
import DataAnalysis from './components/DataAnalysis.vue';
import PlatformOverview from './components/PlatformOverview.vue';

// Persist selection state
const savedSelection = localStorage.getItem('selected_devices');
const selectedDevices = ref<string[]>(savedSelection ? JSON.parse(savedSelection) : []);

// Watch for selection changes and save
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

// Initial empty list, populated by API and WebSocket
const devices = ref<{ 
  id?: string; 
  name: string; 
  ip: string; 
  status?: string; 
  metrics?: { throughput: number; latency: number; securityScore: number };
  stageId?: string;
}[]>([]);
const apiStatus = ref<'idle' | 'loading' | 'error' | 'ready'>('idle');

const currentStageIndex = ref(0); // Default to Authentication
const currentStage = computed(() => STAGES[currentStageIndex.value] || STAGES[0]);

// Derived stage index based on selection
const displayStageIndex = computed(() => {
  if (selectedDevices.value.length === 1) {
    const dev = devices.value.find(d => d.name === selectedDevices.value[0]);
    if (dev && dev.stageId) {
      const idx = STAGES.findIndex(s => s.id === dev.stageId);
      if (idx !== -1) return idx;
    }
  }
  return currentStageIndex.value;
});

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

// Execute node selection callback
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

  // Handle dynamic device join/exit messages
  if (packet.type === 'device_join' && packet.device) {
    const exists = devices.value.find(d => d.ip === packet.device.ip || d.name === packet.device.name);
    if (!exists) {
      devices.value = [...devices.value, { ...packet.device, metrics: { throughput: 0, latency: 0, securityScore: 0 } }];
    }
    return;
  }
  if (packet.type === 'device_exit') {
    devices.value = devices.value.filter(d => d.ip !== packet.ip && d.name !== packet.name);
    // Sync selected state
    if (selectedDevices.value.includes(packet.name)) {
      selectedDevices.value = selectedDevices.value.filter(n => n !== packet.name);
    }
    return;
  }

// Update specific device in the list and global metrics
  if (packet.deviceId || packet.source) {
    const deviceIndex = devices.value.findIndex(d => d.id === packet.deviceId || d.ip === packet.source);
    
    if (deviceIndex !== -1) {
      const existingDev = devices.value[deviceIndex];
      
      if (existingDev) {
        // Update the existing object directly to maintain strict type structure
        if (packet.metrics) {
          existingDev.metrics = {
            throughput: Number(packet.metrics.throughput ?? 0),
            latency: Number(packet.metrics.latency ?? 0),
            securityScore: Number(packet.metrics.securityScore ?? 0)
          };
        }
        if (packet.stageId) {
          existingDev.stageId = packet.stageId;
        }
        if (packet.status) {
          existingDev.status = packet.status;
        } else if (!existingDev.status) {
          existingDev.status = 'online';
        }

        // Trigger reactivity for the array
        devices.value = [...devices.value];
      }
    } else if (packet.type === 'telemetry') {
      // Dynamic device creation on first telemetry if not exists
      const newDev: any = {
        id: packet.deviceId || `dev-${Date.now()}`,
        name: packet.deviceName || packet.deviceId || 'Unknown Device',
        ip: packet.source || '0.0.0.0',
        status: packet.status || 'online',
        stageId: packet.stageId || 'AUTH',
        deviceType: packet.deviceType,
        metrics: {
          throughput: Number(packet.metrics?.throughput ?? 0),
          latency: Number(packet.metrics?.latency ?? 0),
          securityScore: Number(packet.metrics?.securityScore ?? 0)
        }
      };
      devices.value.push(newDev);
    }
  }

  // Update global/selected metrics display
  if (packet?.metrics) {
    const isTarget = selectedDeviceIPs.value.length === 0 || selectedDeviceIPs.value.includes(packet.source as string);

    if (isTarget) {
      latestMetrics.value = {
        throughput: Number(packet.metrics.throughput ?? 0),
        latency: Number(packet.metrics.latency ?? 0),
        securityScore: Number(packet.metrics.securityScore ?? 0)
      };

      // Sync stage display if exactly ONE device is selected
      // This prevents the UI from jumping when multiple devices are in different stages
      if (packet.stageId && selectedDevices.value.length === 1) {
        const idx = STAGES.findIndex(s => s.id === packet.stageId);
        // Only sync if not simulating and it's a valid new stage
        if (!isSimulating.value && idx !== -1 && idx !== currentStageIndex.value) {
          currentStageIndex.value = idx;
        }
      }
    }
  }
};

const loadDevices = async (isBackground = false) => {
  try {
    if (!isBackground) apiStatus.value = 'loading';
    const data = await fetchJson<Array<{ id?: string; name: string; ip: string }>>(`${apiBase}/api/devices`);

    // Ensure API data is correctly merged without losing current metrics/stage state
    const mergedDevices = (data || []).map((item) => {
      const existing = devices.value.find(d => d.id === item.id || d.ip === item.ip);
      return {
        id: item.id,
        name: item.name,
        ip: item.ip,
        status: existing?.status || 'online',
        metrics: existing?.metrics || { throughput: 0, latency: 0, securityScore: 0 },
        stageId: existing?.stageId
      };
    });

    if (mergedDevices.length > 0) {
      devices.value = mergedDevices;
    }

    // Sync selection status: remove devices no longer in list
    const validNames = new Set(devices.value.map(d => d.name));
    const nextSelected = selectedDevices.value.filter(name => validNames.has(name));

    // Remove auto-selection logic, only update when selected devices leave
    if (nextSelected.length !== selectedDevices.value.length) {
      selectedDevices.value = nextSelected;
    }

    apiStatus.value = 'ready';
  } catch (error) {
    console.error('Failed to load devices from API:', error);
    apiStatus.value = 'error';
    // No simulation data fallback
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
  } catch (error) {
    console.warn('Failed to load metrics from API, continuing with current values:', error);
    // Keep current values on error
  }
};

onMounted(() => {
  loadDevices();
  loadMetrics();

  // Periodically sync every 10s back-up for WS
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
      <header class="panel panel-glow px-4 py-2.5 flex flex-col gap-2">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center font-bold shadow-md text-sm">
              W7</div>
            <div>
              <h1 class="text-lg font-black tracking-wide bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                RISC-V ADVANCED SECURITY GATEWAY DASHBOARD
              </h1>
              <div class="subtle-text text-[10px] uppercase tracking-widest opacity-70">Advanced Crypto-Gateway Navigation System</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div
              class="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-200 border border-indigo-400/30 text-[10px] font-semibold breathing-glow">
              HARDWARE ACCELERATED</div>
            <div class="px-2 py-0.5 rounded-full text-[10px] font-semibold border" :class="apiStatus === 'ready'
              ? 'bg-emerald-500/10 text-emerald-200 border-emerald-400/30'
              : apiStatus === 'loading'
                ? 'bg-amber-500/10 text-amber-200 border-amber-400/30'
                : apiStatus === 'error'
                  ? 'bg-rose-500/10 text-rose-200 border-rose-400/30'
                  : 'bg-slate-500/10 text-slate-200 border-slate-400/30'">
              API: {{ apiStatus.toUpperCase() }}
            </div>
            <div
              class="px-2 py-0.5 rounded-md bg-slate-800/50 border border-slate-700/50 flex items-center gap-2 text-[10px] subtle-text">
              <span>Status:</span>
              <span class="font-mono font-bold" :class="wsStatus === 'connected'
                ? 'text-emerald-300'
                : wsStatus === 'connecting'
                  ? 'text-amber-300'
                  : 'text-rose-300'">
                {{ wsStatus.toUpperCase() }}
              </span>
            </div>
            <div
              class="px-2 py-0.5 rounded-md bg-slate-800/50 border border-slate-700/50 flex items-center gap-2 text-[10px] subtle-text">
              <span>Last Msg:</span>
              <span class="text-slate-200 font-mono">
                {{ lastMessageAt ? new Date(lastMessageAt).toLocaleTimeString() : '--' }}
              </span>
            </div>
          </div>
        </div>
        
        <!-- Platform Level Summary -->
        <PlatformOverview :devices="devices" class="mt-2" />

        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDevices.join(',')" class="panel px-3 py-2">
              <div class="text-[10px] uppercase subtle-text">Active Device(s)</div>
              <div class="text-base font-semibold text-sky-200 mt-0.5 truncate">
                {{ selectedDevices.length ? selectedDevices.join(' & ') : 'All Devices' }}
              </div>
            </div>
          </transition>
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDeviceIPs.join(',')" class="panel px-3 py-2">
              <div class="text-[10px] uppercase subtle-text">Target IP(s)</div>
              <div class="text-base font-mono text-slate-200 mt-0.5 truncate">
                {{ selectedDeviceIPs.length ? selectedDeviceIPs.join(' & ') : 'Global Broadcast' }}
              </div>
            </div>
          </transition>
          <div class="panel px-3 py-2 border-l-2 border-slate-500/30">
            <div class="text-[10px] uppercase subtle-text mb-1.5">Process Progress</div>
            <div class="flex items-center gap-1 h-5">
              <div v-for="(stage, idx) in STAGES" :key="stage.id"
                class="flex-1 h-1 rounded-full transition-all duration-500"
                :class="idx <= displayStageIndex ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' : 'bg-slate-700'">
              </div>
            </div>
            <div class="text-[9px] text-slate-400 mt-0.5 flex justify-between">
              <span>START</span>
              <span class="text-sky-300 font-bold uppercase">{{ displayStageIndex + 1 }}/{{ STAGES.length }}</span>
              <span>END</span>
            </div>
          </div>
          <div class="panel px-3 py-2 border-l-2 border-teal-500/50" v-if="currentStage">
            <div class="flex items-center justify-between">
              <div class="text-[10px] uppercase subtle-text">Comm Stage</div>
              <button @click="toggleSimulation" class="text-[9px] px-1.5 py-0.5 rounded border transition-colors"
                :class="isSimulating ? 'bg-rose-500/20 border-rose-500/50 text-rose-300' : 'bg-sky-500/20 border-sky-500/50 text-sky-300'">
                {{ isSimulating ? 'STOP' : 'PLAY' }}
              </button>
            </div>
            <select v-model="currentStageIndex"
              class="bg-transparent text-teal-200 font-semibold text-base py-0 mt-0.5 border-none focus:ring-0 w-full cursor-pointer appearance-none">
              <option v-for="(stage, idx) in STAGES" :key="stage.id" :value="idx" class="bg-slate-800 text-teal-200">
                {{ stage.name }}
              </option>
            </select>
          </div>
          <div class="panel px-3 py-2 border-l-2 border-amber-500/50" v-if="currentStage">
            <div class="text-[10px] uppercase subtle-text">Current Status</div>
            <div class="text-base font-semibold text-amber-200 mt-0.5 truncate animate-pulse">{{ currentStage.statusText
              }}</div>
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
            :stage="currentStage" :devices="devices" />
        </div>

        <!-- Right: Analysis (1/3 width) -->
        <div class="lg:col-span-1 min-h-[420px] panel panel-glow p-3">
          <DataAnalysis :deviceName="selectedDevices[0]" :metrics="latestMetrics" :stage="currentStage" :devices="devices" />
        </div>
      </section>
    </div>
  </div>
</template>
