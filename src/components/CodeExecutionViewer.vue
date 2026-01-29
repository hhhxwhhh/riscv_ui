<script setup lang="ts">
import { ref, computed } from 'vue';
import { Cpu, FileCode } from 'lucide-vue-next';
import type { StageInfo } from '../api/stages';

const props = defineProps({
    stage: { type: Object as () => StageInfo, required: true }
});

const showFullCode = ref(false);
const activeCodeTab = ref<'c' | 'asm'>('asm');

// 自定义指令类型映射（加密、解密、哈希、认证）
const customTypes = [
    { key: 'ENCRYPT', label: '加密指令' },
    { key: 'DECRYPT', label: '解密指令' },
    { key: 'HASH', label: '哈希指令' },
    { key: 'AUTH', label: '认证指令' }
];

// 当前选中的类型
const selectedType = ref('ENCRYPT');

// 获取当前类型对应的stage
import { STAGES } from '../api/stages';
const stageMap: { [key: string]: StageInfo } = STAGES.reduce(
    (acc, s) => { acc[s.id] = s; return acc; },
    {} as { [key: string]: StageInfo }
);

// 当前类型对应的自定义指令
const customInstructions = computed(() => {
    const stage = stageMap[selectedType.value] || props.stage;
    if (stage && stage.customInstructions) return stage.customInstructions;
    return [];
});

// 当前类型对应的标准指令
const standardInstructions = computed(() => {
    const stage = stageMap[selectedType.value] || props.stage;
    if (stage && stage.standardInstructions) return stage.standardInstructions;
    return [];
});

// 获取当前选中的自定义指令索引
const selectedCustomIdx = ref<number | null>(null);

// 多选自定义指令支持高亮联动
const hoveredCustomIdx = ref<number | null>(null);

// 计算分组展示数据
// const groupedStandardInstructions = computed(() => {
//     return customInstructions.value.map((item, idx) => ({
//         customIdx: idx,
//         customText: item.text,
//         mappedStandardIdxs: item.mappedStandardIdxs,
//     }));
// });

// 获取当前类型的性能指标
const reductionRate = computed(() => {
    const stdCount = standardInstructions.value.length;
    const custCount = customInstructions.value.filter(i => !i.text.startsWith('#')).length;
    if (stdCount === 0) return 0;
    return Math.round((1 - custCount / stdCount) * 100);
});

const handleCustomHover = (cIdx: number | null) => {
    hoveredCustomIdx.value = cIdx;
    // 不再在这里设置 hoveredStandardIdx，而是通过 computed 样式判断
};
</script>

<template>
    <div class="h-full flex flex-col p-4 gap-3">
        <div class="flex justify-between items-center">
            <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Cpu class="w-5 h-5 text-sky-400" />
                    指令流对比与加速展示
                </h2>
                <div class="flex items-center gap-4 text-[10px] font-mono mt-1 opacity-80">
                    <div class="flex items-center gap-1">
                        <span class="text-gray-500">REDUCTION:</span>
                        <span class="text-rose-400 font-bold">{{ reductionRate }}%</span>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button @click="showFullCode = true"
                    class="flex items-center gap-2 px-3 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-400/30 hover:bg-sky-500/20 transition-colors text-xs font-semibold">
                    <FileCode class="w-4 h-4" />
                    查看完整源码
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
                                    class="px-4 py-1 rounded-md text-sm font-medium transition-all">Standard C</button>
                                <button @click="activeCodeTab = 'asm'"
                                    :class="activeCodeTab === 'asm' ? 'bg-teal-500/20 text-teal-400' : 'text-gray-400 hover:text-gray-200'"
                                    class="px-4 py-1 rounded-md text-sm font-medium transition-all">RISC-V ASM</button>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-[10px] text-gray-500 font-mono italic">READ_ONLY_BUFFER: 0x{{
                                (Math.random() * 0xFFFFFF).toString(16) }}</div>
                            <button @click="showFullCode = false"
                                class="text-gray-400 hover:text-white px-4 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors text-sm">Close
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
                        <div class="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed custom-scrollbar">
                            <div class="flex gap-4">
                                <div
                                    class="flex flex-col text-slate-700 text-right select-none opacity-50 border-r border-slate-800 pr-4 min-w-[3rem]">
                                    <div v-for="n in (activeCodeTab === 'c' ? props.stage.fullCode.c.split('\n').length : props.stage.fullCode.asm.split('\n').length)"
                                        :key="n">{{ n }}</div>
                                </div>
                                <pre v-if="activeCodeTab === 'c'"
                                    class="text-slate-300 w-full whitespace-pre-wrap selection:bg-rose-500/30">{{ props.stage.fullCode.c }}</pre>
                                <pre v-else
                                    class="text-slate-300 w-full whitespace-pre-wrap selection:bg-teal-500/30">{{ props.stage.fullCode.asm }}</pre>
                            </div>
                        </div>
                        <div v-if="activeCodeTab === 'asm'"
                            class="absolute bottom-6 right-6 px-4 py-2 bg-teal-500/10 border border-teal-500/30 rounded backdrop-blur-sm shadow-xl">
                            <div class="text-[10px] text-teal-500 mb-1">ACCELERATION STATUS</div>
                            <div class="text-xl font-bold text-teal-400 flex items-baseline gap-1">
                                {{ (props.stage.metrics.stdLatency / props.stage.metrics.latency).toFixed(1) }}<span
                                    class="text-xs">x FASTER</span>
                            </div>
                        </div>
                    </div>
                </div>
            </transition>

            <!-- 左侧：标准指令流（Legacy） -->
            <div class="flex flex-col border-r border-gray-700/80 pr-2">
                <h3
                    class="text-[13px] font-bold text-gray-400 mb-2 uppercase tracking-wider flex items-center justify-between">
                    Standard RISC-V Stream
                    <span class="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{{
                        standardInstructions.length }} OPS</span>
                </h3>
                <div
                    class="flex-1 font-mono text-sm bg-slate-900/40 border border-white/5 p-0 rounded relative custom-scrollbar overflow-hidden">
                    <div class="absolute inset-0 overflow-y-auto p-2">
                        <div v-for="(inst, sIdx) in standardInstructions" :key="'std-' + sIdx"
                            class="py-0.5 px-2 mb-px rounded transition-all duration-200 cursor-default flex items-center text-[13px]"
                            :class="{
                                'bg-rose-500/10 text-rose-200': hoveredCustomIdx !== null && customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx),
                                'text-slate-500 hover:text-slate-300': hoveredCustomIdx === null || !customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx),
                                'opacity-40': hoveredCustomIdx !== null && !customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx)
                            }">
                            <div class="w-6 text-[10px] text-gray-600 select-none mr-2 text-right">{{ (sIdx +
                                1).toString().padStart(2, '0') }}</div>
                            <div class="truncate">{{ inst }}</div>

                            <!-- 连接线指示器 -->
                            <div v-if="hoveredCustomIdx !== null && customInstructions[hoveredCustomIdx]?.mappedStandardIdxs.includes(sIdx)"
                                class="ml-auto w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 右侧：自定义指令类型选择区和指令列表 -->
            <div class="flex flex-col pl-2">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex gap-2">
                        <button v-for="type in customTypes" :key="type.key"
                            @click="selectedType = type.key; selectedCustomIdx = null"
                            :class="selectedType === type.key ? 'bg-teal-500/20 text-teal-400 font-bold border-teal-500/40' : 'bg-slate-800 text-gray-500 border-transparent hover:text-gray-300'"
                            class="px-2 py-1 rounded border transition-all text-[11px] uppercase tracking-wider">
                            {{ type.label }}
                        </button>
                    </div>
                    <div class="text-[10px] font-mono text-teal-500/50">CUSTOM EXTENSION</div>
                </div>

                <div
                    class="flex-1 font-mono text-sm bg-slate-900/40 border border-white/5 p-0 rounded relative custom-scrollbar overflow-hidden flex flex-col">
                    <div class="flex-1 overflow-y-auto p-2">
                        <div v-for="(item, idx) in customInstructions" :key="'cust-' + idx"
                            class="relative p-3 mb-2 rounded border transition-all duration-200 group cursor-pointer"
                            @mouseenter="handleCustomHover(idx)" @mouseleave="handleCustomHover(null)"
                            @click="selectedCustomIdx = idx" :class="{
                                'bg-teal-500/10 border-teal-500/40 shadow-[0_0_15px_rgba(20,184,166,0.15)]': idx === selectedCustomIdx || hoveredCustomIdx === idx,
                                'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600': idx !== selectedCustomIdx && hoveredCustomIdx !== idx,
                                'opacity-50 blur-[1px] grayscale': hoveredCustomIdx !== null && hoveredCustomIdx !== idx
                            }">
                            <!-- Badge showing compression ratio -->
                            <div class="absolute -top-1.5 -right-1.5 z-10" v-if="!item.text.startsWith('#')">
                                <span
                                    class="bg-slate-900 text-[9px] text-teal-400 px-1.5 py-0.5 rounded border border-teal-500/30 font-bold shadow-sm">
                                    {{ item.mappedStandardIdxs.length }} OPS
                                </span>
                            </div>

                            <div class="flex items-start gap-3">
                                <div class="text-[10px] select-none pt-0.5 transition-colors"
                                    :class="(idx === selectedCustomIdx || hoveredCustomIdx === idx) ? 'text-teal-400' : 'text-gray-600'">
                                    {{ (idx + 1).toString().padStart(2, '0') }}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-sm truncate transition-colors"
                                        :class="(idx === selectedCustomIdx || hoveredCustomIdx === idx) ? 'text-teal-300' : 'text-slate-300'">
                                        {{ item.text }}
                                    </div>

                                    <!-- 展开后的详情区域 -->
                                    <transition name="fade">
                                        <div v-if="idx === selectedCustomIdx || hoveredCustomIdx === idx"
                                            class="mt-2 text-xs text-slate-400 border-t border-teal-500/20 pt-2 leading-relaxed">
                                            <div
                                                class="flex items-center gap-1 mb-1 text-[10px] text-teal-500/70 uppercase font-bold tracking-wider">
                                                FUNCTION
                                            </div>
                                            {{ item.detail }}
                                        </div>
                                    </transition>
                                </div>
                            </div>

                            <!-- Connecting line indicator (Left side) -->
                            <div class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[5px]"
                                v-if="idx === selectedCustomIdx || hoveredCustomIdx === idx">
                                <div class="w-2 h-8 bg-teal-500 rounded-r shadow-[0_0_10px_teal]"></div>
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
