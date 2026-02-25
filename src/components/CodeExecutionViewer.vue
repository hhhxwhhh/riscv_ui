<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Cpu, FileCode } from 'lucide-vue-next';
import type { StageInfo } from '../api/stages';

const props = defineProps({
    stage: { type: Object as () => StageInfo, required: true },
    devices: { type: Array as () => any[], default: () => [] }
});

const activeInstancesCount = computed(() => {
    return props.devices.filter(d => d.stageId === selectedType.value && d.status === 'online').length;
});

const showFullCode = ref(false);
const activeCodeTab = ref<'c' | 'asm'>('asm');
const codeSearch = ref('');
const copied = ref(false);

// Custom instruction mappings
const customTypes = [
    { key: 'AUTH', label: 'SM2 Identity Auth' },
    { key: 'ENCRYPT', label: 'SM4 Encryption' },
    { key: 'DECRYPT', label: 'SM4 Decryption' },
    { key: 'HASH', label: 'SM3 Integrity Hash' }
];

// Default to current stage ID
const selectedType = ref(props.stage.id);

watch(() => props.stage.id, (newId: string) => {
    selectedType.value = newId;
});

// Get stage for current type
import { STAGES } from '../api/stages';
const stageMap: { [key: string]: StageInfo } = STAGES.reduce(
    (acc, s) => { acc[s.id] = s; return acc; },
    {} as { [key: string]: StageInfo }
);

// Custom instructions for current type
const customInstructions = computed(() => {
    const stage = stageMap[selectedType.value] || props.stage;
    if (stage && stage.customInstructions) return stage.customInstructions;
    return [];
});

// Standard instructions for current type
const standardInstructions = computed(() => {
    const stage = stageMap[selectedType.value] || props.stage;
    if (stage && stage.standardInstructions) return stage.standardInstructions;
    return [];
});

// Get selected custom instruction index
const selectedCustomIdx = ref<number | null>(null);

// Support highlight linkage for custom instructions
const hoveredCustomIdx = ref<number | null>(null);

// Get performance metrics for current type
const reductionRate = computed(() => {
    const stdCount = standardInstructions.value.length;
    const custCount = customInstructions.value.filter(i => !i.text.startsWith('#')).length;
    if (stdCount === 0) return 0;
    return Math.round((1 - custCount / stdCount) * 100);
});

const handleCustomHover = (cIdx: number | null) => {
    hoveredCustomIdx.value = cIdx;
    // Use computed style instead of setting hovered index here
};

const activeCode = computed(() => {
    return activeCodeTab.value === 'c' ? props.stage.fullCode.c : props.stage.fullCode.asm;
});

const activeCodeLines = computed(() => activeCode.value.split('\n'));

const escapeHtml = (input: string) => {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const escapeRegExp = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightedCode = computed(() => {
    const raw = activeCode.value || '';
    const term = codeSearch.value.trim();
    if (!term) return escapeHtml(raw);
    const regex = new RegExp(escapeRegExp(term), 'gi');
    return escapeHtml(raw).replace(regex, (match) => `<mark class="code-mark">${match}</mark>`);
});

const matchCount = computed(() => {
    const term = codeSearch.value.trim();
    if (!term) return 0;
    const regex = new RegExp(escapeRegExp(term), 'gi');
    return (activeCode.value.match(regex) || []).length;
});

const copyCode = async () => {
    try {
        await navigator.clipboard.writeText(activeCode.value);
        copied.value = true;
        window.setTimeout(() => { copied.value = false; }, 1200);
    } catch (err) {
        console.error('Copy failed', err);
    }
};

</script>

<template>
    <div class="h-full flex flex-col p-4 gap-3">
        <div class="flex justify-between items-center">
            <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Cpu class="w-5 h-5 text-sky-400" />
                    Instruction Stream Acceleration
                </h2>
                <div class="flex items-center gap-4 text-[10px] font-mono mt-1 opacity-80">
                    <div class="flex items-center gap-1">
                        <span class="text-gray-500">REDUCTION:</span>
                        <span class="text-rose-400 font-bold">{{ reductionRate }}%</span>
                    </div>
                    <div class="w-px h-3 bg-gray-700"></div>
                    <div class="flex items-center gap-1">
                        <span class="text-gray-500">ACTIVE INSTANCES:</span>
                        <span class="text-teal-400 font-bold font-mono">{{ activeInstancesCount }}</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <div class="flex bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/60">
                    <button v-for="type in customTypes" :key="type.key" @click="selectedType = type.key"
                        :class="selectedType === type.key ? 'bg-sky-500 text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'"
                        class="px-3 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap">
                        {{ type.label }}
                    </button>
                </div>
                <button @click="showFullCode = true"
                    class="flex items-center gap-2 px-3 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-400/30 hover:bg-sky-500/20 transition-colors text-xs font-semibold">
                    <FileCode class="w-4 h-4" />
                    View Source
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
                                    class="toolbar-btn">Standard C</button>
                                <button @click="activeCodeTab = 'asm'"
                                    :class="activeCodeTab === 'asm' ? 'bg-teal-500/20 text-teal-400' : 'text-gray-400 hover:text-gray-200'"
                                    class="toolbar-btn">RISC-V ASM</button>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 flex-nowrap">
                            <div
                                class="flex items-center gap-2 bg-slate-800/70 border border-slate-700 rounded-md px-2 py-1">
                                <span class="text-[10px] text-slate-400">Search</span>
                                <input v-model="codeSearch" type="text" placeholder="keyword"
                                    class="bg-transparent text-[11px] text-slate-200 outline-none w-28" />
                                <span class="text-[10px] text-slate-500">{{ matchCount }}</span>
                            </div>
                            <button @click="copyCode" class="toolbar-btn">
                                {{ copied ? 'Copied' : 'Copy' }}
                            </button>
                            <button @click="showFullCode = false" class="toolbar-btn">Close
                                Terminal</button>
                        </div>
                    </div>
                    <div
                        class="flex-1 overflow-hidden flex flex-col bg-black/40 rounded-lg border border-slate-800 relative">
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
                        <div class="flex-1 overflow-y-auto p-4 font-mono leading-relaxed custom-scrollbar">
                            <div class="flex gap-4">
                                <div
                                    class="flex flex-col text-slate-600 text-right select-none text-[11px] border-r border-slate-800 pr-3 sticky left-0 bg-slate-900/40">
                                    <div v-for="n in activeCodeLines.length" :key="n" class="h-6">{{ n }}</div>
                                </div>
                                <div class="flex-1 text-[13px] relative">
                                    <pre class="whitespace-pre m-0 selection:bg-teal-500/30 text-slate-300"
                                        v-html="highlightedCode"></pre>

                                    <div v-if="matchCount > 0"
                                        class="absolute top-0 right-0 bg-sky-500/10 border border-sky-400/20 px-2 py-1 rounded text-[10px] text-sky-300">
                                        Found {{ matchCount }} occurrences
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div
                            class="px-4 py-2 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-[10px]">
                            <div class="flex items-center gap-4 text-slate-400">
                                <span class="flex items-center gap-1"><span
                                        class="w-1.5 h-1.5 rounded-full bg-teal-400"></span> RISC-V Zk Extension
                                    Active</span>
                                <span class="flex items-center gap-1"><span
                                        class="w-1.5 h-1.5 rounded-full bg-violet-400"></span> SM Crypto Hardware Core
                                    V2.0</span>
                            </div>
                            <div class="text-slate-500">
                                Lines: {{ activeCodeLines.length }} | Optimization: Level 3 (Aggressive)
                            </div>
                        </div>
                    </div>
                </div>
            </transition>

            <!-- Left: Standard Instruction Stream (Legacy) -->
            <div class="flex flex-col border-r border-gray-700/80 pr-2">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-[13px] font-bold text-gray-400 uppercase tracking-wider">
                        Standard RISC-V Stream
                    </h3>
                    <div class="flex gap-2">
                        <span
                            class="text-[10px] text-rose-500 font-mono bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/20">
                            Σ {{ standardInstructions.length * 2 }} CYCLES
                        </span>
                    </div>
                </div>
                <div
                    class="flex-1 font-mono text-sm bg-slate-950/20 border border-white/5 p-0 rounded relative overflow-hidden">
                    <!-- Benchmark heatmap background -->
                    <div class="absolute right-0 top-0 bottom-0 w-1 bg-slate-800/10 z-0">
                        <div v-for="(_, sIdx) in standardInstructions" :key="'heat-' + sIdx" class="w-full"
                            :style="{ height: (100 / standardInstructions.length) + '%' }"
                            :class="hoveredCustomIdx !== null && customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx) ? 'bg-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'bg-transparent'">
                        </div>
                    </div>

                    <div class="absolute inset-0 overflow-y-auto p-2 custom-scrollbar">
                        <div v-for="(inst, sIdx) in standardInstructions" :key="'std-' + sIdx"
                            class="py-0.5 px-2 mb-px rounded transition-all duration-300 cursor-default flex items-center text-[13px] relative z-10"
                            :class="{
                                'bg-rose-500/15 text-rose-200 border-l-2 border-rose-500 shadow-[2px_0_10px_rgba(244,63,94,0.05)]': hoveredCustomIdx !== null && customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx),
                                'text-slate-500 opacity-40 grayscale': hoveredCustomIdx !== null && !customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx),
                                'text-slate-400 hover:text-slate-200': hoveredCustomIdx === null
                            }">
                            <div class="w-6 text-[10px] text-gray-600 select-none mr-2 text-right">{{ (sIdx +
                                1).toString().padStart(2, '0') }}</div>
                            <div class="truncate flex-1">{{ inst }}</div>
                            <div v-if="hoveredCustomIdx === null || customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx)"
                                class="text-[9px] font-mono opacity-30 ml-2">2c</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Custom Instruction Type Selection & List -->
            <div class="flex flex-col pl-2">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex gap-2">
                        <button v-for="type in customTypes" :key="type.key"
                            @click="selectedType = type.key; selectedCustomIdx = null"
                            :class="selectedType === type.key ? 'bg-teal-500/20 text-teal-400 font-bold border-teal-500/40' : 'bg-slate-800/50 text-gray-500 border-transparent hover:text-gray-300'"
                            class="px-2 py-1 rounded border transition-all text-[11px] uppercase tracking-wider">
                            {{ type.label }}
                        </button>
                    </div>
                    <div
                        class="text-[10px] font-mono text-teal-500/70 bg-teal-500/5 px-2 py-0.5 rounded border border-teal-500/20">
                        Σ {{customInstructions.filter(i => !i.text.startsWith('#')).length * 5}} CYCLES
                    </div>
                </div>

                <div
                    class="flex-1 font-mono text-sm bg-slate-950/20 border border-white/5 p-0 rounded relative overflow-hidden flex flex-col">
                    <div class="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        <div v-for="(item, idx) in customInstructions" :key="'cust-' + idx"
                            class="relative p-3 mb-2 rounded border transition-all duration-500 group cursor-pointer overflow-hidden"
                            @mouseenter="handleCustomHover(idx)" @mouseleave="handleCustomHover(null)"
                            @click="selectedCustomIdx = idx" :class="{
                                'bg-teal-500/10 border-teal-500/40 shadow-[0_0_20px_rgba(20,184,166,0.15)] ring-1 ring-teal-500/30': idx === selectedCustomIdx || hoveredCustomIdx === idx,
                                'bg-slate-800/30 border-slate-700/40 hover:bg-slate-800/60': idx !== selectedCustomIdx && hoveredCustomIdx !== idx,
                                'opacity-30 blur-[0.5px] scale-[0.98]': hoveredCustomIdx !== null && hoveredCustomIdx !== idx
                            }">

            <!-- Instruction acceleration scan effect -->
                            <div v-if="hoveredCustomIdx === idx"
                                class="absolute inset-0 bg-gradient-to-r from-transparent via-teal-500/10 to-transparent -translate-x-full animate-pulse-horizontal pointer-events-none">
                            </div>

                            <!-- Badge showing compression ratio -->
                            <div class="absolute top-2 right-2 z-10" v-if="!item.text.startsWith('#')">
                                <div class="flex flex-col items-end gap-1">
                                    <span
                                        class="bg-slate-900/80 text-[9px] text-teal-400 px-1.5 py-0.5 rounded border border-teal-500/30 font-bold">
                                        {{ item.mappedStandardIdxs.length }}:1 MAPPING
                                    </span>
                                    <span class="text-[8px] text-sky-500/50 font-mono">LATENCY: 5c</span>
                                </div>
                            </div>

                            <div class="flex items-start gap-3 relative z-10">
                                <div class="text-[10px] select-none pt-0.5 font-mono"
                                    :class="(idx === selectedCustomIdx || hoveredCustomIdx === idx) ? 'text-teal-400' : 'text-gray-600'">
                                    0x{{ (idx * 4).toString(16).toUpperCase().padStart(2, '0') }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm tracking-tight transition-colors"
                                        :class="(idx === selectedCustomIdx || hoveredCustomIdx === idx) ? 'text-teal-300' : 'text-slate-300 italic opacity-80'">
                                        {{ item.text }}
                                    </div>

                                    <!-- Expanded detail area -->
                                    <div v-if="idx === selectedCustomIdx || hoveredCustomIdx === idx"
                                        class="mt-3 text-[11px] text-slate-400 border-t border-teal-500/20 pt-2 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-300">
                                        <div
                                            class="flex items-center gap-2 mb-2 text-[10px] text-teal-500/70 font-bold letter-spacing-wide">
                                            <div class="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></div>
                                            HARDWARE LOGIC MAPPING
                                        </div>
                                        <p class="mb-2 text-slate-400/90 leading-tight">
                                            {{ item.detail || 'Optimized hardware implementation.' }}
                                        </p>
                                        <div class="grid grid-cols-2 gap-2 text-[10px]">
                                            <div class="bg-black/20 p-1.5 rounded border border-white/5">
                                                <div class="text-gray-500 mb-0.5">Throughput</div>
                                                <div class="text-teal-400 font-bold font-mono">1 Ops/Cycle</div>
                                            </div>
                                            <div class="bg-black/20 p-1.5 rounded border border-white/5">
                                                <div class="text-gray-500 mb-0.5">Area Cost</div>
                                                <div class="text-amber-500 font-bold font-mono">Medium</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Hide scrollbar for cleaner look */
.custom-scrollbar::-webkit-scrollbar {
    width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(15, 23, 42, 0.3);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.4);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(20, 184, 166, 0.5);
}

.fade-enter-active,
.fade-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
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

@keyframes pulse-horizontal {
    0% {
        transform: translateX(-100%);
        opacity: 0;
    }

    50% {
        opacity: 0.5;
    }

    100% {
        transform: translateX(100%);
        opacity: 0;
    }
}

.animate-pulse-horizontal {
    animation: pulse-horizontal 2s ease-in-out infinite;
}

.code-mark {
    background-color: rgba(20, 184, 166, 0.3);
    color: #5eead4;
    border-radius: 2px;
    padding: 0 2px;
}

.toolbar-btn {
    padding: 0.25rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    transition: all 0.2s;
    border: 1px solid #334155;
    background-color: rgba(30, 41, 59, 0.8);
    color: #cbd5e1;
    white-space: nowrap;
}

.toolbar-btn:hover {
    border-color: #475569;
    background-color: rgba(51, 65, 85, 0.5);
    color: white;
}

.letter-spacing-wide {
    letter-spacing: 0.1em;
}
</style>
