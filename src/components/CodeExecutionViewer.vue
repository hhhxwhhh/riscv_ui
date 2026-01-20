<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Play, Pause, RotateCcw, Cpu } from 'lucide-vue-next';

const props = defineProps({
    deviceName: { type: String, default: 'IoT Dev-A' },
    deviceIP: { type: String, default: '192.168.1.101' }
});

// Watch for device changes to simulate context switching
watch(() => props.deviceName, () => {
    // Optional: flash effect or briefly pause
    startSimulation();
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
