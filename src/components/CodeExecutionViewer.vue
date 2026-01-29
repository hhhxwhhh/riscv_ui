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

// 当前选中的自定义指令索引
const selectedCustomIdx = ref<number | null>(null);

// 获取当前自定义指令详细内容
const customDetail = computed(() => {
    if (selectedCustomIdx.value === null) return '';
    const item = customInstructions.value[selectedCustomIdx.value];
    return item?.detail || '';
});

// 多选自定义指令支持高亮联动
const hoveredCustomIdx = ref<number | null>(null);
const hoveredStandardIdx = ref<number | null>(null);

// 计算分组展示数据
const groupedStandardInstructions = computed(() => {
    return customInstructions.value.map((item, idx) => ({
        customIdx: idx,
        customText: item.text,
        mappedStandardIdxs: item.mappedStandardIdxs,
    }));
});

// 获取当前类型的性能指标


</script>

<template>
    <div class="h-full flex flex-col p-4 gap-3">
        <div class="flex justify-between items-center">
            <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Cpu class="w-5 h-5 text-sky-400" />
                    指令流与内容展示
                </h2>
            </div>
            <div class="flex items-center gap-2">
                <button @click="showFullCode = true"
                    class="flex items-center gap-2 px-3 py-1 rounded bg-sky-500/10 text-sky-400 border border-sky-400/30 hover:bg-sky-500/20 transition-colors text-xs font-semibold">
                    <FileCode class="w-4 h-4" />
                    查看完整代码
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

            <!-- 左侧：分组展示自定义指令及其标准指令列表，高亮联动 -->
            <div class="flex flex-col border-r border-gray-700/80 pr-2">
                <h3 class="text-lg font-semibold text-rose-300 mb-2">标准指令分组展示</h3>
                <div class="flex-1 font-mono text-sm bg-slate-900/70 p-2 rounded relative custom-scrollbar"
                    style="max-height: 60vh; overflow-y: auto;">
                    <div v-for="group in groupedStandardInstructions" :key="'group-' + group.customIdx" class="mb-4">
                        <div class="font-bold text-teal-400 mb-1 flex items-center">
                            <span @mouseenter="hoveredCustomIdx = group.customIdx" @mouseleave="hoveredCustomIdx = null"
                                :class="{ 'underline': hoveredCustomIdx === group.customIdx }">{{ group.customText
                                }}</span>
                        </div>
                        <div class="pl-4">
                            <div v-for="sIdx in group.mappedStandardIdxs" :key="'std-' + sIdx"
                                class="py-1 px-2 mb-1 rounded transition-colors duration-200 cursor-pointer"
                                @mouseenter="hoveredStandardIdx = sIdx" @mouseleave="hoveredStandardIdx = null" :class="{
                                    'bg-rose-500/20 text-white font-bold border-l-2 border-rose-400':
                                        hoveredCustomIdx === group.customIdx || hoveredStandardIdx === sIdx,
                                    'text-slate-400': hoveredCustomIdx !== group.customIdx && hoveredStandardIdx !== sIdx
                                }">
                                <span class="mr-2 text-gray-600 select-none">{{ (sIdx + 1).toString().padStart(2, '0')
                                }}</span>
                                {{ standardInstructions[sIdx] }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 右侧：自定义指令类型选择区和指令列表，高亮联动 -->
            <div class="flex flex-col pl-2">
                <div class="flex gap-2 mb-2">
                    <button v-for="type in customTypes" :key="type.key"
                        @click="selectedType = type.key; selectedCustomIdx = null"
                        :class="selectedType === type.key ? 'bg-teal-500/20 text-teal-400 font-bold' : 'bg-slate-800 text-gray-400'"
                        class="px-4 py-1 rounded transition-colors text-sm">
                        {{ type.label }}
                    </button>
                </div>
                <div class="flex-1 font-mono text-sm bg-slate-900/70 p-2 rounded relative custom-scrollbar"
                    style="max-height: 60vh; overflow-y: auto;">
                    <div v-for="(item, idx) in customInstructions" :key="'cust-' + idx"
                        class="py-1 px-2 mb-2 rounded cursor-pointer transition-colors duration-200"
                        @mouseenter="hoveredCustomIdx = idx" @mouseleave="hoveredCustomIdx = null"
                        @click="selectedCustomIdx = idx" :class="{
                            'bg-teal-500/10 text-white font-bold border-l-2 border-teal-400': idx === selectedCustomIdx || hoveredCustomIdx === idx || (hoveredStandardIdx !== null && item.mappedStandardIdxs.includes(hoveredStandardIdx)),
                            'text-slate-400': idx !== selectedCustomIdx && hoveredCustomIdx !== idx && !(hoveredStandardIdx !== null && item.mappedStandardIdxs.includes(hoveredStandardIdx))
                        }">
                        <span class="mr-2 text-gray-600 select-none">{{ (idx + 1).toString().padStart(2, '0') }}</span>
                        {{ item.text }}
                    </div>
                    <div v-if="selectedCustomIdx !== null"
                        class="mt-4 p-3 bg-slate-800/60 rounded border border-teal-500/20">
                        <div class="text-teal-400 font-bold mb-2">详细内容：</div>
                        <div class="text-slate-200 whitespace-pre-line">{{ customDetail }}</div>
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
