<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Cpu, FileCode, Zap } from 'lucide-vue-next';
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
            <div class="flex items-center gap-4">
                <div class="flex bg-slate-800/80 rounded-lg p-1 border border-slate-700/60 shadow-inner">
                    <button v-for="type in customTypes" :key="type.key" @click="selectedType = type.key"
                        :class="selectedType === type.key ? 'bg-sky-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-200'"
                        class="px-4 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap">
                        {{ type.label }}
                    </button>
                </div>
                <button @click="showFullCode = true"
                    class="flex items-center gap-2 px-4 py-1.5 rounded bg-sky-500/10 text-sky-400 border border-sky-400/30 hover:bg-sky-500/20 transition-colors text-xs font-bold whitespace-nowrap">
                    <FileCode class="w-4 h-4" />
                    Source Code
                </button>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-6 flex-1 overflow-hidden relative group">
            <!-- Terminal Scanline Effect -->
            <div class="absolute inset-0 pointer-events-none z-10 opacity-[0.04] overflow-hidden rounded-xl">
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

            <!-- Left: Standard Instruction Stream (Baseline) -->
            <div class="flex flex-col border-r border-gray-700/50 pr-4">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-[12px] font-black text-gray-400 uppercase tracking-widest">
                        Baseline Stream
                    </h3>
                    <div
                        class="text-[10px] text-rose-400 font-bold font-mono bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        Σ {{ standardInstructions.length * 2 }} CYCLES
                    </div>
                </div>
                <div
                    class="flex-1 font-mono text-sm bg-slate-950/40 border border-white/5 p-0 rounded-xl relative overflow-hidden shadow-inner font-instruction">
                    <!-- Benchmark heatmap background -->
                    <div class="absolute right-0 top-0 bottom-0 w-1 bg-slate-800/10 z-0">
                        <div v-for="(_, sIdx) in standardInstructions" :key="'heat-' + sIdx" class="w-full"
                            :style="{ height: (100 / standardInstructions.length) + '%' }"
                            :class="hoveredCustomIdx !== null && customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx) ? 'bg-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.3)]' : 'bg-transparent'">
                        </div>
                    </div>

                    <div class="absolute inset-0 overflow-y-auto p-3 custom-scrollbar">
                        <div v-for="(inst, sIdx) in standardInstructions" :key="'std-' + sIdx"
                            class="py-1.5 px-3 mb-1 rounded transition-all duration-300 cursor-default flex items-center text-[12px] relative z-10"
                            :class="{
                                'bg-rose-500/10 text-rose-100 border-l-2 border-rose-500 shadow-[2px_0_10px_rgba(244,63,94,0.05)] font-bold': hoveredCustomIdx !== null && customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx),
                                'text-slate-600 opacity-30 grayscale blur-[0.1px]': hoveredCustomIdx !== null && !customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx),
                                'text-slate-400 hover:text-slate-200': hoveredCustomIdx === null
                            }">
                            <div class="w-6 text-[10px] text-gray-700 select-none mr-4 text-right font-mono">{{ (sIdx +
                                1).toString().padStart(2, '0') }}</div>
                            <div
                                class="flex-1 tracking-tight font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                                {{ inst }}</div>
                            <div v-if="hoveredCustomIdx === null || customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx)"
                                class="text-[10px] font-mono opacity-30 ml-4 font-bold">2c</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: HW Accelerated Stream -->
            <div class="flex flex-col pl-4 min-w-0">
                <div class="flex items-center justify-between mb-3 gap-2">
                    <h3 class="text-[12px] font-black text-gray-400 uppercase tracking-widest">
                        HW Accelerated
                    </h3>
                    <div
                        class="text-[10px] font-black font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 whitespace-nowrap">
                        Σ {{customInstructions.filter(i => !i.text.startsWith('#')).length * 5}} CYCLES
                    </div>
                </div>

                <div
                    class="flex-1 font-mono text-sm bg-slate-950/40 border border-white/5 p-0 rounded-xl relative overflow-hidden flex flex-col shadow-inner font-instruction">
                    <div class="flex-1 overflow-y-auto p-3 custom-scrollbar">
                        <div v-for="(item, idx) in customInstructions" :key="'cust-' + idx"
                            class="relative mb-2 rounded-xl border transition-all duration-300 group cursor-pointer overflow-hidden"
                            @mouseenter="handleCustomHover(idx)" @mouseleave="handleCustomHover(null)"
                            @click="selectedCustomIdx = idx" :class="{
                                'bg-teal-500/10 border-teal-500/40 shadow-[0_0_20px_rgba(20,184,166,0.1)]': idx === selectedCustomIdx || hoveredCustomIdx === idx,
                                'bg-slate-900/40 border-slate-800/60 hover:border-slate-700': idx !== selectedCustomIdx && hoveredCustomIdx !== idx,
                                'opacity-40 grayscale-[0.5]': hoveredCustomIdx !== null && hoveredCustomIdx !== idx
                            }">

                            <div class="p-3 relative z-10">
                                <div class="flex items-center justify-between gap-6">
                                    <div class="flex items-center gap-3 min-w-0">
                                        <div class="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-500"
                                            :class="(idx === selectedCustomIdx || hoveredCustomIdx === idx) ? 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)] animate-pulse' : 'bg-slate-700'">
                                        </div>
                                        <div class="font-bold text-[12px] leading-tight tracking-tight truncate transition-colors uppercase"
                                            :class="(idx === selectedCustomIdx || hoveredCustomIdx === idx) ? 'text-teal-300' : 'text-slate-300'">
                                            {{ item.text }}
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-6 flex-shrink-0">
                                        <div class="flex items-center gap-2">
                                            <Zap class="w-3 h-3 text-rose-500/60" />
                                            <span
                                                class="text-[10px] font-mono text-rose-400/80 font-bold tabular-nums">M:{{
                                                    item.mappedStandardIdxs.length }}</span>
                                        </div>
                                        <span
                                            class="text-[10px] font-mono text-slate-500 tabular-nums font-bold">5c</span>
                                    </div>
                                </div>

                                <!-- Expanded detail area -->
                                <transition name="fade">
                                    <div v-if="idx === selectedCustomIdx"
                                        class="mt-3 text-[11px] text-slate-400 border-t border-teal-500/20 pt-3 leading-relaxed">
                                        <p class="mb-3 text-slate-400/90 italic">
                                            {{ item.detail || 'Accelerated cryptographic hardware primitive.' }}
                                        </p>
                                        <div class="grid grid-cols-2 gap-3 mb-3">
                                            <div class="bg-black/40 p-2 rounded-lg border border-white/5">
                                                <div class="text-[9px] text-slate-500 uppercase font-black mb-1">
                                                    Throughput</div>
                                                <div class="text-teal-400 font-mono font-bold">1 Ops/Cyc</div>
                                            </div>
                                            <div class="bg-black/40 p-2 rounded-lg border border-white/5">
                                                <div class="text-[9px] text-slate-500 uppercase font-black mb-1">Area
                                                    Cost</div>
                                                <div class="text-amber-500 font-mono font-bold">Low-Latency</div>
                                            </div>
                                        </div>
                                        <button @click.stop="showFullCode = true"
                                            class="w-full py-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg flex items-center justify-center gap-2 text-[10px] text-sky-400 font-black uppercase tracking-widest transition-all">
                                            <FileCode class="w-4 h-4" />
                                            View Logic
                                        </button>
                                    </div>
                                </transition>
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

.no-scrollbar::-webkit-scrollbar {
    display: none;
}

.no-scrollbar {
    -ms-overflow-style: none;
    /* IE and Edge */
    scrollbar-width: none;
    /* Firefox */
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
