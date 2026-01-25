<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { Play, Pause, RotateCcw, Cpu, FileCode } from 'lucide-vue-next';
import type { StageInfo } from '../api/stages';

const props = defineProps({
    deviceName: { type: String, default: 'All Devices' },
    deviceIP: { type: String, default: 'Global Broadcast' },
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
const activeCodeTab = ref<'c' | 'asm'>('asm');

const cycleCount = ref(0);
const savedCycles = ref(0);

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

    cycleCount.value += Math.floor(Math.random() * 5) + 1;
    // Calculate relative speedup based on stage metrics
    const speedup = (props.stage.metrics.stdLatency / props.stage.metrics.latency) || 1;
    savedCycles.value += Math.floor(speedup * 10);
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
    cycleCount.value = 0;
    savedCycles.value = 0;
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

        <div class="grid grid-cols-2 gap-4 flex-1 overflow-hidden relative group">
            <!-- Terminal Scanline Effect -->
            <div class="absolute inset-0 pointer-events-none z-10 opacity-[0.03] overflow-hidden rounded-lg">
                <div
                    class="w-full h-[200%] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] animate-scan">
                </div>
            </div>

            <!-- Full Code Overlay -->
            <transition name="fade">
                <div v-if="showFullCode"
                    class="absolute inset-0 z-50 bg-slate-900/98 backdrop-blur-md p-6 flex flex-col border border-sky-500/40 rounded-lg shadow-2xl">
                    <div class="flex justify-between items-center mb-6">
                        <div class="flex items-center gap-4">
                            <h3 class="text-xl font-bold text-sky-400 flex items-center gap-2">
                                <FileCode class="w-6 h-6" />
                                Implementation Details
                            </h3>
                            <div class="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                                <button @click="activeCodeTab = 'c'"
                                    :class="activeCodeTab === 'c' ? 'bg-rose-500/20 text-rose-400' : 'text-gray-400 hover:text-gray-200'"
                                    class="px-4 py-1 rounded-md text-sm font-medium transition-all">
                                    Standard C
                                </button>
                                <button @click="activeCodeTab = 'asm'"
                                    :class="activeCodeTab === 'asm' ? 'bg-teal-500/20 text-teal-400' : 'text-gray-400 hover:text-gray-200'"
                                    class="px-4 py-1 rounded-md text-sm font-medium transition-all">
                                    RISC-V ASM
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-[10px] text-gray-500 font-mono italic">
                                READ_ONLY_BUFFER: 0x{{ (Math.random() * 0xFFFFFF).toString(16) }}
                            </div>
                            <button @click="showFullCode = false"
                                class="text-gray-400 hover:text-white px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors text-sm">
                                Close Terminal
                            </button>
                        </div>
                    </div>

                    <div
                        class="flex-1 overflow-hidden flex flex-col bg-black/40 rounded-lg border border-slate-800 relative">
                        <!-- Code Header Info -->
                        <div
                            class="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/50">
                            <div class="flex gap-2">
                                <div class="w-2.5 h-2.5 rounded-full bg-rose-500/50"></div>
                                <div class="w-2.5 h-2.5 rounded-full bg-amber-500/50"></div>
                                <div class="w-2.5 h-2.5 rounded-full bg-teal-500/50"></div>
                            </div>
                            <div class="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                                {{ activeCodeTab === 'c' ? 'legacy_implementation.c' : 'accelerated_kernel.s' }}
                            </div>
                        </div>

                        <div class="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed custom-scrollbar">
                            <div class="flex gap-4">
                                <!-- Line Numbers -->
                                <div
                                    class="flex flex-col text-slate-700 text-right select-none opacity-50 border-r border-slate-800 pr-4 min-w-[3rem]">
                                    <div v-for="n in (activeCodeTab === 'c' ? props.stage.fullCode.c.split('\n').length : props.stage.fullCode.asm.split('\n').length)"
                                        :key="n">
                                        {{ n }}
                                    </div>
                                </div>
                                <!-- Code Content -->
                                <pre v-if="activeCodeTab === 'c'"
                                    class="text-slate-300 w-full whitespace-pre-wrap selection:bg-rose-500/30">{{ props.stage.fullCode.c }}</pre>
                                <pre v-else
                                    class="text-slate-300 w-full whitespace-pre-wrap selection:bg-teal-500/30">{{ props.stage.fullCode.asm }}</pre>
                            </div>
                        </div>

                        <!-- Performance Overlay Badge -->
                        <div v-if="activeCodeTab === 'asm'"
                            class="absolute bottom-6 right-6 px-4 py-2 bg-teal-500/10 border border-teal-500/30 rounded backdrop-blur-sm shadow-xl">
                            <div class="text-[10px] text-teal-500 mb-1">ACCELERATION STATUS</div>
                            <div class="text-xl font-bold text-teal-400 flex items-baseline gap-1">
                                {{ (props.stage.metrics.stdLatency / props.stage.metrics.latency).toFixed(1) }}
                                <span class="text-xs">x FASTER</span>
                            </div>
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
                <div class="flex justify-between items-end mb-2">
                    <h3 class="text-lg font-semibold text-teal-300">RISC-V Crypto Extension</h3>
                    <div class="text-[10px] text-teal-400 font-mono flex items-center gap-1 mb-1">
                        <span class="animate-pulse">●</span>
                        SPEEDUP: {{ (props.stage.metrics.stdLatency / props.stage.metrics.latency).toFixed(1) }}x
                    </div>
                </div>
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
            class="grid grid-cols-5 gap-2 bg-slate-900/70 p-3 rounded border border-slate-700/60 font-mono text-[10px] text-gray-300">
            <div class="flex flex-col border-r border-slate-800 pr-2">
                <span class="text-gray-500 mb-1">INSTR_PTR (PC)</span>
                <span class="text-amber-300 text-xs">{{ registers.pc }}</span>
            </div>
            <div class="flex flex-col border-r border-slate-800 pr-2">
                <span class="text-gray-500 mb-1">REGISTER A0</span>
                <span class="text-sky-300 text-xs">{{ registers.a0 }}</span>
            </div>
            <div class="flex flex-col border-r border-slate-800 pr-2">
                <span class="text-gray-500 mb-1">TOTAL CYCLES</span>
                <span class="text-violet-300 text-xs">{{ cycleCount }}</span>
            </div>
            <div class="flex flex-col border-r border-slate-800 pr-2">
                <span class="text-teal-500/80 mb-1">HW SAVED CYCLES</span>
                <span class="text-teal-400 font-bold text-xs">+{{ savedCycles }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500 mb-1">PIPELINE STATUS</span>
                <span class="text-teal-300 font-bold animate-pulse text-xs">{{ registers.process }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Hide scrollbar for cleaner look */
::-webkit-scrollbar {
    width: 4px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.1);
    border-radius: 10px;
}

.fade-enter-active,
.fade-leave-active {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: scale(0.98);
}

@keyframes scan {
    0% {
        transform: translateY(0);
    }

    100% {
        transform: translateY(-50%);
    }
}

.animate-scan {
    animation: scan 8s linear infinite;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    display: block;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.2);
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.4);
}

/* Simulate phosphor glow on highlted instructions */
.font-bold {
    text-shadow: 0 0 8px currentColor;
}
</style>
