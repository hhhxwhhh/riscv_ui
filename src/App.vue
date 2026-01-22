<script setup lang="ts">
import { ref } from 'vue';
import DeviceTopology from './components/DeviceTopology.vue';
import CodeExecutionViewer from './components/CodeExecutionViewer.vue';
import DataAnalysis from './components/DataAnalysis.vue';

const selectedDevice = ref('IoT Dev-A');
const selectedDeviceIP = ref('192.168.1.101');
const wsStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting');
const lastMessageAt = ref<number | null>(null);
const handleNodeSelect = (node: any) => {
  if (node.name !== 'Gateway') {
    selectedDevice.value = node.name;
    selectedDeviceIP.value = node.value;
  }
};

const handleWsStatus = (status: 'connecting' | 'connected' | 'disconnected') => {
  wsStatus.value = status;
};

const handleWsLastMessage = (timestamp: number) => {
  lastMessageAt.value = timestamp;
};
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
              <h1 class="text-2xl font-bold tracking-wide">RISC-V Security Instruction Demo</h1>
              <div class="subtle-text text-sm mt-0.5">实时监控安全指令执行与性能差异</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="px-3 py-1 rounded-full bg-teal-500/10 text-teal-200 border border-teal-400/30 text-xs font-semibold breathing-glow">
              LIVE</div>
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDevice" class="panel px-4 py-3">
              <div class="text-xs uppercase subtle-text">Active Device</div>
              <div class="text-lg font-semibold text-sky-200 mt-1">{{ selectedDevice }}</div>
            </div>
          </transition>
          <transition name="fade-slide" mode="out-in">
            <div :key="selectedDeviceIP" class="panel px-4 py-3">
              <div class="text-xs uppercase subtle-text">Target IP</div>
              <div class="text-lg font-mono text-slate-200 mt-1">{{ selectedDeviceIP }}</div>
            </div>
          </transition>
          <div class="panel px-4 py-3">
            <div class="text-xs uppercase subtle-text">Security Mode</div>
            <div class="text-lg font-semibold text-teal-200 mt-1">Crypto Extension Active</div>
          </div>
        </div>
      </header>

      <!-- Top Section: Topology -->
      <section class="flex-none panel panel-glow p-4">
        <DeviceTopology @node-select="handleNodeSelect" @ws-status="handleWsStatus"
          @ws-last-message="handleWsLastMessage" v-model="selectedDevice" />
      </section>

      <!-- Bottom Section: Execution & Analysis -->
      <section class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Left: Code Execution (2/3 width) -->
        <div class="lg:col-span-2 min-h-[420px] panel panel-glow p-3">
          <CodeExecutionViewer :deviceName="selectedDevice" :deviceIP="selectedDeviceIP" />
        </div>

        <!-- Right: Analysis (1/3 width) -->
        <div class="lg:col-span-1 min-h-[420px] panel panel-glow p-3">
          <DataAnalysis :deviceName="selectedDevice" />
        </div>
      </section>
    </div>
  </div>
</template>
