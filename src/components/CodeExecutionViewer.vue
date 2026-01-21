<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Play, Pause, RotateCcw, Cpu } from 'lucide-vue-next';

const props = defineProps({
    deviceName: { type: String, default: 'IoT Dev-A' },
    deviceIP: { type: String, default: '192.168.1.101' }
});

let switchTimer: number | null = null;

// Watch for device changes to simulate context switching
watch(() => props.deviceName, () => {
    // Reset and restart to give visual feedback of switching context
    resetSimulation();
    if (switchTimer) window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => startSimulation(), 100);
});

// Mock Data
const standardInstructions = [
    'LD      a0, 0(packet_limit) # Load Packet Header',
    'LI      t1, 0x1234          # Load IV Checksum',
    'XOR     a0, a0, t1          # Decrypt Header Byte',
    'SLLI    a1, a0, 4           # Align Offset',
    'SRLI    a2, a0, 2           # Mask Bits',
    'OR      a0, a1, a2          # Extract Length',
    'ADD     t2, t2, 1           # Increment Byte Ptr',
    'BNE     t2, payload_len, L1 # Loop Payload',
    'SD      a0, 0(buffer)       # Store Decrypted Data',
    // Repeat similar pattern to show length
    'LD      a0, 8(packet_limit) ',
    'XOR     a0, a0, t1          ',
    'SD      a0, 8(buffer)       '
];

const customInstructions = [
    'LD      a0, 0(packet_base)  # Load 64-bit Packet Chunk',
    'LKEY    k0, 0(secure_mem)   # Load Hardware Key',
    'RISCV.ENC a0, a0, k0        # HW Decrypt (Single Cycle)',
    'SD      a0, 0(dma_buffer)   # Direct Store to DMA',
    'ADDI    t0, t0, 8           # Next Chunk',
    'ADDI    t4, t4, 8           # Update Buffer Ptr'
];

// State
const isRunning = ref(false);
const standardIdx = ref(0);
const customIdx = ref(0);
const timer = ref<number | null>(null);

// Simulation Speed (ms per instruction)
const speed = 500;

// Mock Registers
const registers = ref({
    pc: '0x80000000',
    a0: '0x00000000',
    t1: '0x12340000',
    process: 'ENCRYPTION'
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
        standardIdx.value = (standardIdx.value + 1) % standardInstructions.length;
        customIdx.value = (customIdx.value + 1) % customInstructions.length;
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
    <div class="h-full flex flex-col p-4">
        <div class="flex justify-between items-center mb-4">
            <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Cpu class="w-5 h-5 text-blue-400" />
                    Instruction Execution Flow
                </h2>
                <div class="text-xs text-gray-400 mt-1">
                    Monitoring: <span class="text-blue-300 font-bold">{{ deviceName }}</span>
                    <span class="mx-1">|</span>
                    Target IP: <span class="text-gray-500 font-mono">{{ deviceIP }}</span>
                    <span class="mx-1">|</span>
                    Source: <span class="text-red-400">Gateway</span>
                </div>
            </div>
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
                        :class="{ 'bg-red-500/10 text-white font-bold border-l-2 border-red-400': idx === standardIdx, 'text-gray-400': idx !== standardIdx }">
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
                        :class="{ 'bg-emerald-500/10 text-white font-bold border-l-2 border-emerald-400': idx === customIdx, 'text-gray-400': idx !== customIdx }">
                        <span class="mr-2 text-gray-600 select-none">{{ (idx + 1).toString().padStart(2, '0') }}</span>
                        {{ line }}
                    </div>
                </div>
            </div>
        </div>

        <!-- CPU Registers Info Panel -->
        <div
            class="mt-4 grid grid-cols-4 gap-2 bg-gray-900 p-2 rounded border border-gray-700 font-mono text-xs text-gray-300">
            <div class="flex flex-col">
                <span class="text-gray-500">PC (Prog Ctr)</span>
                <span class="text-yellow-400">{{ registers.pc }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500">A0 (Accum)</span>
                <span class="text-blue-400">{{ registers.a0 }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500">T1 (Temp)</span>
                <span class="text-purple-400">{{ registers.t1 }}</span>
            </div>
            <div class="flex flex-col">
                <span class="text-gray-500">STATUS</span>
                <span class="text-green-500 font-bold animate-pulse">{{ registers.process }}</span>
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
