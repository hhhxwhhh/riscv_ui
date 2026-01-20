<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Play, Pause, RotateCcw } from 'lucide-vue-next';

// Mock Data
const standardInstructions = [
    'LD      a0, 0(t0)      # Load data',
    'LI      t1, 0x1234     # Load Key Part 1',
    'XOR     a0, a0, t1     # Basic XOR',
    'SLLI    a1, a0, 4      # Shift Left',
    'SRLI    a2, a0, 2      # Shift Right',
    'OR      a0, a1, a2     # Mix',
    'ADD     t2, t2, 1      # Increment Counter',
    'BNE     t2, t3, loop   # Loop check',
    'SD      a0, 0(t4)      # Store result',
    // Repeat similar pattern to show length
    'LD      a0, 8(t0)      ',
    'XOR     a0, a0, t1     ',
    'SD      a0, 8(t4)      '
];

const customInstructions = [
    'LD      a0, 0(t0)      # Load data',
    'LKEY    k0, 0(t1)      # Load Key to Crypto Reg',
    'RISCV.ENC a0, a0, k0   # Custom Crypto Instruction',
    'SD      a0, 0(t4)      # Store result',
    'ADDI    t0, t0, 8      # Next block',
    'ADDI    t4, t4, 8      # Next destination'
];

// State
const isRunning = ref(false);
const standardIdx = ref(0);
const customIdx = ref(0);
const timer = ref<number | null>(null);

// Simulation Speed (ms per instruction)
const speed = 500;

const startSimulation = () => {
    if (isRunning.value) return;
    isRunning.value = true;

    timer.value = setInterval(() => {
        // Advance Standard
        standardIdx.value = (standardIdx.value + 1) % standardInstructions.length;
        customIdx.value = (customIdx.value + 1) % customInstructions.length;
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
});
</script>

<template>
    <div class="card h-full flex flex-col p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-bold text-gray-100">Instruction Execution Flow</h2>
            <div class="flex space-x-2">
                <button @click="isRunning ? stopSimulation() : startSimulation()"
                    class="p-2 rounded hover:bg-gray-700 text-gray-300 transition-colors">
                    <component :is="isRunning ? Pause : Play" class="w-5 h-5" />
                </button>
                <button @click="resetSimulation" class="p-2 rounded hover:bg-gray-700 text-gray-300 transition-colors">
                    <RotateCcw class="w-5 h-5" />
                </button>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
            <!-- Standard Column -->
            <div class="flex flex-col border-r border-gray-700 pr-2">
                <h3 class="text-lg font-semibold text-red-400 mb-2">Standard Instructions</h3>
                <div class="flex-1 overflow-y-auto font-mono text-sm bg-gray-900 p-2 rounded relative">
                    <div v-for="(line, idx) in standardInstructions" :key="'std-' + idx"
                        class="py-1 px-2 transition-colors duration-200"
                        :class="{ 'bg-red-900/50 text-white font-bold border-l-2 border-red-500': idx === standardIdx, 'text-gray-400': idx !== standardIdx }">
                        <span class="mr-2 text-gray-600 select-none">{{ (idx + 1).toString().padStart(2, '0') }}</span>
                        {{ line }}
                    </div>
                </div>
            </div>

            <!-- Custom Column -->
            <div class="flex flex-col pl-2">
                <h3 class="text-lg font-semibold text-green-400 mb-2">RISC-V Crypto Extension</h3>
                <div class="flex-1 overflow-y-auto font-mono text-sm bg-gray-900 p-2 rounded relative">
                    <div v-for="(line, idx) in customInstructions" :key="'cust-' + idx"
                        class="py-1 px-2 transition-colors duration-200"
                        :class="{ 'bg-green-900/50 text-white font-bold border-l-2 border-green-500': idx === customIdx, 'text-gray-400': idx !== customIdx }">
                        <span class="mr-2 text-gray-600 select-none">{{ (idx + 1).toString().padStart(2, '0') }}</span>
                        {{ line }}
                    </div>
                </div>
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
    background: #4b5563;
    border-radius: 3px;
}
</style>
