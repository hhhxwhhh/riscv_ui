<script setup lang="ts">
import DeviceTopology from './components/DeviceTopology.vue';
import CodeExecutionViewer from './components/CodeExecutionViewer.vue';
import DataAnalysis from './components/DataAnalysis.vue';
</script>

<template>
  <div class="bg-gray-900 text-gray-100 min-h-screen flex flex-col p-4 gap-4">
    <!-- Header -->
    <header class="flex items-center justify-between pb-2 border-b border-gray-700">
      <div class="flex items-center gap-2">
        <!-- Simple Icon placeholder -->
        <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold">R</div>
        <h1 class="text-2xl font-bold tracking-wide">RISC-V Security Instruction Demo</h1>
      </div>
      <div class="text-sm text-gray-400">
        Status: <span class="text-green-400 font-mono">CONNECTED</span>
      </div>
    </header>

    <!-- Top Section: Topology -->
    <section class="flex-none">
      <DeviceTopology />
    </section>

    <!-- Bottom Section: Execution & Analysis -->
    <section class="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left: Code Execution (2/3 width) -->
      <div class="lg:col-span-2 min-h-[400px]">
        <CodeExecutionViewer />
      </div>

      <!-- Right: Analysis (1/3 width) -->
      <div class="lg:col-span-1 min-h-[400px]">
        <DataAnalysis />
      </div>
    </section>
  </div>
</template>
