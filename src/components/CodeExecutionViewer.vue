<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { Play, Pause, RotateCcw, Cpu, FileCode } from 'lucide-vue-next';
import type { StageInfo } from '../api/stages';

const props = defineProps({
    deviceName: { type: String, default: 'IoT Dev-A' },
    deviceIP: { type: String, default: '192.168.1.101' },
    stage: { type: Object as () => StageInfo, required: true }
});

let switchTimer: number | null = null;

// Watch for device or stage changes to simulate context switching
watch([() => props.deviceName, () => props.stage], () => {
    // Reset and restart to give visual feedback of switching context
    resetSimulation();
    if (switchTimer) window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => startSimulation(), 100);
});

const standardInstructions = computed(() => props.stage.standardInstructions);
const customInstructions = computed(() => props.stage.customInstructions);

// State
const isRunning = ref(false);
const standardIdx = ref(0);
const customIdx = ref(0);
const timer = ref<number | null>(null);
const showFullCode = ref(false);

// Simulation Speed (ms per instruction)
const speed = 500;

// Mock Registers
const registers = ref({
    pc: '0x80000000',
    a0: '0x00000000',
    t1: '0x12340000',
    process: computed(() => props.stage.statusText)
});

const updateRegisters = () => {
    registers.value.pc = '0x' + (0x80000000 + standardIdx.value * 4).toString(16).padEnd(8, '0');
    registers.value.a0 = '0x' + Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    registers.value.t1 = '0x' + Math.floor(Math.random() * 0xffff).toString(16).padStart(8, '0');
};

const startSimulation = () => {
    if (isRunning.value) return;
    isRunning.value = true;

    timer.value = setInterval(() => {
        // Advance Standard
        standardIdx.value = (standardIdx.value + 1) % standardInstructions.value.length;
        customIdx.value = (customIdx.value + 1) % customInstructions.value.length;
        updateRegisters();
    }, speed);
};

const stopSimulation = () => {
    if (timer.value) clearInterval(timer.value);
    isRunning.value = false;
    timer.value = null;
};

const resetSimulation = () => {
    stopSimulation();
    standardIdx.value = 0;
    customIdx.value = 0;
};

onMounted(() => {
    startSimulation();
});

onUnmounted(() => {
    stopSimulation();
    if (switchTimer) window.clearTimeout(switchTimer);
});
</script>

<template>
    <div class="h-full flex flex-col p-4 gap-3">
        <div class="flex justify-between items-center">
            <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Cpu class="w-5 h-5 text-sky-400" />
                    Instruction Execution Flow
                </h2>
                <div class="text-xs text-gray-400 mt-1">
                    Monitoring: <span class="text-sky-300 font-bold">{{ deviceName }}</span>
                    <span class="mx-1">|</span>
                    Target IP: <span class="text-slate-300 font-mono">{{ deviceIP }}</span>
                    <span class="mx-1">|</span>
                    Source: <span class="text-rose-300">Gateway</span>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button @click="showFullCode = true" 
                    class="flex items-center gap-2 px-3 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-400/30 hover:bg-sky-500/20 transition-colors text-xs font-semibold">
                    <FileCode class="w-4 h-4" />
                    查看完整代码
                </button>
                <div class="px-3 py-1 rounded-full text-xs bg-slate-800/60 border border-slate-700/60 text-slate-300">
                    Speed: {{ speed }}ms
                </div>
                <button @click="isRunning ? stopSimulation() : startSimulation()"
                    class="p-2 rounded hover:bg-gray-700 text-gray-300 transition-colors">
                    <component :is="isRunning ? Pause : Play" class="w-5 h-5" />
                </button>
                <button @click="resetSimulation" class="p-2 rounded hover:bg-gray-700 text-gray-300 transition-colors">
                    <RotateCcw class="w-5 h-5" />
                </button>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4 flex-1 overflow-hidden relative">
            <!-- Full Code Overlay -->
            <transition name="fade">
                <div v-if="showFullCode" class="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-sm p-6 flex flex-col border border-sky-500/30 rounded-lg">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-sky-400 flex items-center gap-2">
                            <FileCode class="w-6 h-6" />
                            Security Logic - Full Implementation
                        </h3>
                        <button @click="showFullCode = false" class="text-gray-400 hover:text-white px-3 py-1 bg-gray-800 rounded">Close</button>
                    </div>
                    <div class="flex-1 overflow-y-auto font-mono text-sm grid grid-cols-2 gap-6 p-4 bg-black/40 rounded border border-gray-800">
                        <div>
                            <div class="text-rose-400 font-bold mb-2 border-b border-rose-400/20 pb-1">Legacy C Implementation</div>
                            <pre class="text-slate-300 whitespace-pre-wrap">{{ props.stage.fullCode.c }}</pre>
                        </div>
                        <div>
                            <div class="text-teal-400 font-bold mb-2 border-b border-teal-400/20 pb-1">RISC-V Crypto Extension (ASM)</div>
                            <pre class="text-slate-300 whitespace-pre-wrap">{{ props.stage.fullCode.asm }}</pre>
                        </div>
                    </div>
                </div>
            </transition>

            <!-- Standard Column -->
            <div class="flex flex-col border-r border-gray-700/80 pr-2">
                <h3 class="text-lg font-semibold text-rose-300 mb-2">Standard Instructions</h3>
                <div class="flex-1 overflow-y-auto font-mono text-sm bg-slate-900/70 p-2 rounded relative">
                    <div v-for="(line, idx) in standardInstructions" :key="'std-' + idx"
                        class="py-1 px-2 transition-colors duration-200"
                        :class="{ 'bg-rose-500/10 text-white font-bold border-l-2 border-rose-400': idx === standardIdx, 'text-slate-400': idx !== standardIdx }">
                        <span class="mr-2 text-gray-600 select-none">{{ (idx + 1).toString().padStart(2, '0') }}</span>
                        {{ line }}
                    </div>
                </div>
            </div>

            <!-- Custom Column -->
            <div class="flex flex-col pl-2">
                <h3 class="text-lg font-semibold text-teal-300 mb-2">RISC-V Crypto Extension</h3>
                <div class="flex-1 overflow-y-auto font-mono text-sm bg-slate-900/70 p-2 rounded relative">
                    <div v-for="(line, idx) in customInstructions" :key="'cust-' + idx"
                        class="py-1 px-2 transition-colors duration-200"
                        :class="{ 'bg-teal-500/10 text-white font-bold border-l-2 border-teal-400': idx === customIdx, 'text-slate-400': idx !== customIdx }">
                        <span class="mr-2 text-gray-600 select-none">{{ (idx + 1).toString().padStart(2, '0') }}</span>
                        {{ line }}
                    </div>
                </div>
            </div>
        </div>

        <!-- CPU Registers Info Panel -->
        <div
            class="grid grid-cols-4 gap-2 bg-slate-900/70 p-2 rounded border border-slate-700/60 font-mono text-xs text-gray-300">
            <div class="flex flex-col">
                <span class="text-gray-500">PC (Prog Ctr)</span>
                <span class="text-amber-300">{{ registers.pc }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500">A0 (Accum)</span>
                <span class="text-sky-300">{{ registers.a0 }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500">T1 (Temp)</span>
                <span class="text-violet-300">{{ registers.t1 }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500">STATUS</span>
                <span class="text-teal-300 font-bold animate-pulse">{{ registers.process }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Hide scrollbar for cleaner look */
::-webkit-scrollbar {
    width: 6px;
}

::-webkit-scrollbar-track {
    background: #1f2937;
}

::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 3px;
}
</style>
