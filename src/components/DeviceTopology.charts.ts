import * as echarts from 'echarts';
import { type NodeData, THEME } from './DeviceTopology.types';
import { getStageContext, getGatewayColor } from './DeviceTopology.helpers';
import { STAGES } from '../api/stages';

export const buildChartOption = (
    nodes: NodeData[],
    selectedNames: string[],
    viewMode: string,
    stageId: string,
    displayGatewayThroughput: number,
    gatewaySvgRaw: string
): echarts.EChartsOption => {
    const isGlobal = selectedNames.length === 0;
    const isRelayMode = selectedNames.length === 2;
    const nodeCount = nodes.length;
    
    // Performance Optimization: Large Dataset Mode
    const isLargeMode = nodeCount > 500;

    // Pre-calculate node positions map
    const nodeMap: Record<string, [number, number]> = {};
    nodes.forEach(n => nodeMap[n.name] = [n.x, n.y]);

    // Calculate Lines (Flows)
    const stageIds = STAGES.map(s => s.id);
    const linesByStage: Record<string, any[]> = {};
    stageIds.forEach(id => linesByStage[id] = []);

    // Helper to find selected devices
    const nodeA = selectedNames[0] || '';
    const nodeB = selectedNames[1] || '';

    // Only calculate complex lines if not in large mode or if really needed
    // In large mode, we will use WebGL for flows if enabled
    const shouldCalculateFlows = !isGlobal || !isLargeMode || true; // Enable flows for large mode via WebGL

    if (shouldCalculateFlows) {
        nodes.forEach(node => {
            if (node.category === 'gateway') return;

            const isSelected = selectedNames.includes(node.name);
            if (!isGlobal && !isSelected) return;

            // Determine relevant stages
            let stagesToShow: string[] = [];
            if (viewMode === 'all' || isRelayMode) {
                if (!isGlobal) {
                    stagesToShow = stageIds; 
                } else {
                    stagesToShow = [node.stageId];
                }
            } else {
                stagesToShow = [stageId];
            }

            stagesToShow.forEach((sid) => {
                const gatewayNode = nodes.find(n => n.category === 'gateway');
                if (!gatewayNode) return;

                const isActive = node.isBlinking || node.throughput > 0;
                if (isActive && node.stageId !== sid) return;

                let source = node.name;
                let target = gatewayNode.name;

                if (isRelayMode) {
                    const isNodeA = node.name === nodeA;
                    const isNodeB = node.name === nodeB;

                    if (isNodeA) {
                        if (sid === 'AUTH' || sid === 'ENCRYPT') {
                            source = nodeA; target = gatewayNode.name;
                        } else if (sid === 'DECRYPT') {
                            source = gatewayNode.name; target = gatewayNode.name;
                        } else if (sid === 'HASH') {
                            source = gatewayNode.name; target = nodeB;
                        } else return;
                    } else if (isNodeB) {
                        if (sid === 'AUTH' || sid === 'ENCRYPT') {
                            source = nodeB; target = gatewayNode.name;
                        } else if (sid === 'DECRYPT') {
                            source = gatewayNode.name; target = gatewayNode.name;
                        } else if (sid === 'HASH') {
                            source = gatewayNode.name; target = nodeA;
                        } else return;
                    } else return;
                } else {
                    if (sid === 'AUTH') {
                        source = node.name; target = gatewayNode.name;
                    } else if (sid === 'ENCRYPT') {
                        source = node.name; target = gatewayNode.name;
                    } else if (sid === 'HASH' || sid === 'DECRYPT') {
                        source = gatewayNode.name; target = node.name;
                    }
                }

                const sPos = nodeMap[source];
                const tPos = nodeMap[target];

                if (sPos && tPos && linesByStage[sid]) {
                    const tput = node.throughput || 100;
                    const flowOpacity = isActive ? Math.max(0.7, Math.min(1, tput / 600)) : 0.05;
                    const ctx = getStageContext(sid);

                    if (sid === 'DECRYPT' && (isRelayMode || isSelected)) {
                        const gx = gatewayNode.x;
                        const gy = gatewayNode.y;
                        linesByStage[sid].push({
                            coords: [[gx, gy], [gx + 35, gy - 45], [gx + 70, gy], [gx + 35, gy + 45], [gx, gy]],
                            lineStyle: { width: 2, opacity: flowOpacity, color: ctx.color },
                            sourceName: 'Gateway Engine',
                            targetName: 'HW Accelerator',
                            stageName: ctx.text,
                            throughput: tput
                        });
                    } else {
                        const curve = isGlobal ? 0.2 : (0.1 + (stageIds.indexOf(sid) * 0.15));
                        linesByStage[sid].push({
                            coords: [sPos, tPos],
                            lineStyle: {
                                width: 1.8,
                                curveness: isRelayMode ? (node.name === nodeB ? -0.25 : 0.25) : curve,
                                opacity: flowOpacity,
                                color: ctx.color
                            },
                            sourceName: source,
                            targetName: target,
                            stageName: ctx.text,
                            throughput: tput
                        });
                    }
                }
            });
        });
    }

    // --- Series Builders ---

    const buildGatewayLayer = (): any[] => {
        const series: any[] = [];
        const coreGateway = nodes.find(n => n.category === 'gateway');
        if (!coreGateway) return series;

        const maxThroughput = 5000;
        const throughputIntensity = Math.min(1, displayGatewayThroughput / maxThroughput);
        const colorBase = getGatewayColor(displayGatewayThroughput);
        // regex to extract rgb
        const rgb = colorBase.match(/\d+/g)?.map(Number) || [255, 100, 100]; 
        const gatewayColor = colorBase;
        const alphaValue = 0.1 + 0.2 * throughputIntensity;

        // Simplified rendering for large mode
        if (!isLargeMode) {
            series.push({
                type: 'effectScatter',
                coordinateSystem: 'cartesian2d',
                silent: true,
                data: [{ name: 'Gateway Pulse', value: [coreGateway.x, coreGateway.y] }],
                symbolSize: 100 + 40 * throughputIntensity,
                showEffectOn: 'render',
                rippleEffect: { brushType: 'stroke', scale: 1.5, period: 3.5 - 1.5 * throughputIntensity, color: gatewayColor },
                itemStyle: { color: `rgba(${rgb[0]}, ${rgb[1]}, 133, ${alphaValue})`, shadowBlur: 15, shadowColor: gatewayColor },
                z: 0
            });
            series.push({
                type: 'effectScatter',
                coordinateSystem: 'cartesian2d',
                silent: true,
                data: [{ name: 'Gateway Secondary Pulse', value: [coreGateway.x, coreGateway.y] }],
                symbolSize: 140 + 60 * throughputIntensity,
                showEffectOn: 'render',
                rippleEffect: { brushType: 'stroke', scale: 2, period: 5 - 2 * throughputIntensity, color: gatewayColor },
                itemStyle: { color: 'transparent', borderColor: gatewayColor, borderWidth: 1, opacity: 0.2 + 0.2 * throughputIntensity },
                z: 0
            });
        }
        return series;
    };

    const buildBackgroundLayer = (): any[] => {
        if (isLargeMode) return []; // Skip background decorations in large mode
        
        return [{
            type: 'graph',
            coordinateSystem: 'cartesian2d',
            layout: 'none',
            silent: true,
            z: 0,
            data: nodes.map((node, idx) => {
                if (node.category === 'gateway') return null;
                const angle = (idx * 137.5) % 360;
                const distance = 15 + (idx % 5) * 5;
                const x = node.x + Math.cos(angle) * distance;
                const y = node.y + Math.sin(angle) * distance;
                return {
                    x: x, y: y,
                    symbolSize: Math.random() * 1.5 + 0.5,
                    itemStyle: { color: 'rgba(125, 211, 252, 0.2)', shadowBlur: 5, shadowColor: 'rgba(125, 211, 252, 0.4)' }
                };
            }).filter(Boolean),
            links: [],
            itemStyle: { opacity: 0.5 }
        }];
    };

    const buildFlowLayer = (): any[] => {
        if (!shouldCalculateFlows) return [];

        const series: any[] = [];
        stageIds.forEach(sid => {
            const currentLines = linesByStage[sid];
            if (!currentLines || currentLines.length === 0) return;

            const ctx = getStageContext(sid);
            
            // HYBRID RENDERING STRATEGY:
            // For large datasets, we use GL for filtering heavily, but standard Canvas 'lines'
            // specifically for the animation loops because 'linesGL' does not support trail effects.
            // To maintain performance, we limit the number of ANIMATED lines in massive mode.
            
            const MAX_ANIMATED_LINES = isLargeMode ? 200 : Infinity;
            
            // Sort by throughput to prioritize showing significant traffic
            // If in strict single-stage view, show more, otherwise be conservative
            const displayData = isLargeMode 
                ? currentLines.sort((a, b) => b.throughput - a.throughput).slice(0, MAX_ANIMATED_LINES)
                : currentLines;

            if (displayData.length === 0) return;

            // Calculate avg throughput for effect speed
            let avgTput = 0;
            if (isGlobal) {
                const stageNodes = nodes.filter(n => n.stageId === sid || viewMode !== 'all');
                if (stageNodes.length > 0) {
                    avgTput = stageNodes.reduce((acc, n) => acc + n.throughput, 0) / stageNodes.length;
                }
            } else {
                    const activeInStage = nodes.find(n => selectedNames.includes(n.name) && n.stageId === sid && n.isBlinking);
                    avgTput = activeInStage ? activeInStage.throughput : 50;
            }
            const effectPeriod = Math.max(1.5, Math.min(6, 8 - (avgTput / 200)));

            series.push({
                type: 'lines', // Always use Standard Lines for Animation support
                name: `Flow-${sid}`,
                silent: false,
                coordinateSystem: 'cartesian2d',
                effect: {
                    show: true, // Force animation on
                    period: effectPeriod,
                    trailLength: 0.1,
                    symbol: 'arrow',
                    symbolSize: isGlobal ? 3 : 5,
                    color: ctx.color
                },
                lineStyle: {
                    color: ctx.color,
                    width: 1.5,
                    curveness: 0.2,
                    opacity: isGlobal ? 0.3 : 0.7
                },
                data: displayData,
                z: 1
            });
        });
        return series;
    };

    const buildNodeLayer = (): any[] => {
        if (isLargeMode) {
             return [{
                type: 'scatterGL',
                name: 'GLNodes',
                coordinateSystem: 'cartesian2d',
                symbolSize: 6,
                itemStyle: {
                    color: '#7dd3fc',
                    opacity: 0.8
                },
                data: nodes.map(node => {
                    const isGateway = node.name.includes('Gateway');
                    const isSelected = selectedNames.includes(node.name);
                    const isActive = node.isBlinking || node.throughput > 0;
                    
                    const sid = (viewMode === 'all' || isActive) 
                        ? (node.stageId || 'AUTH') 
                        : stageId;
                    
                    const ctx = getStageContext(sid);
                    let color = isGateway ? getGatewayColor(displayGatewayThroughput) : (isSelected ? ctx.color : (isGlobal ? ctx.color : THEME.textMuted));
                    if (node.isBlinking && !isGateway) color = THEME.warning;
                    
                    return {
                        name: node.name,
                        value: [node.x, node.y, 1], // z=1 for GL
                        itemStyle: { color: color }
                    };
                }),
                z: 2
            }];
        }

        return [{
            type: 'graph',
            // Using graph with large: true is the standard ECharts way for many nodes
            large: isLargeMode,
            largeThreshold: 500,
            coordinateSystem: 'cartesian2d',
            layout: 'none',
            silent: true,
            symbolSize: isLargeMode ? 10 : 60, // Smaller symbol in large mode
            roam: false,
            label: {
                show: !isLargeMode, // Hide labels in large mode by default to save rendering
                position: 'bottom',
                color: '#d1d5db',
                formatter: (p: any) => {
                    const isGateway = p.name.includes('Gateway');
                    const deviceNode = nodes.find(n => n.name === p.name);
                    const isActive = deviceNode?.isBlinking || (deviceNode?.throughput || 0) > 0;
                    const isSelected = selectedNames.includes(p.name);
                    if (isGlobal && !isGateway && !isActive) return '';

                    const sid = (viewMode === 'all' || isActive) 
                        ? (deviceNode?.stageId || 'AUTH') 
                        : stageId;
                    
                    const ctx = getStageContext(sid);
                    const tput = deviceNode?.throughput ? `${Math.round(deviceNode.throughput)} Mbps` : '';

                    let prefix = '';
                    if (isRelayMode && isSelected) {
                        prefix = selectedNames.indexOf(p.name) === 0 ? '【SOURCE】' : '【TARGET】';
                    }

                    if (isGateway) {
                        const gtput = Math.round(displayGatewayThroughput);
                        const isHeavy = gtput > 4200;
                        const statusText = isHeavy ? '⚠️ HEAVY' : 'NORMAL';
                        return `{name|${p.name}}\n{tput|Load: ${gtput} Mbps}\n{stage|${statusText}}`;
                    }
                    const ip = Array.isArray(p.value) ? p.value[2] : p.value;
                    return `{name|${prefix}${p.name}}\n{ip|${ip}}\n{tput|${tput}}\n{badge| ${ctx.text} }`;
                },
                rich: {
                    name: { fontSize: 11, fontWeight: 'bold', color: '#e5e7eb', padding: [0, 0, 1, 0], align: 'center' },
                    ip: { fontSize: 9, color: '#9ca3af', align: 'center', padding: [0, 0, 1, 0] },
                    tput: { fontSize: 10, color: '#7dd3fc', align: 'center', padding: [0, 0, 2, 0], fontWeight: 'bold' },
                    stage: { fontSize: 10, color: '#fff', backgroundColor: THEME.danger, padding: [2, 6], borderRadius: 4, fontWeight: 'bold' },
                    badge: { fontSize: 8, color: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'currentColor', borderWidth: 1, padding: [1, 3], borderRadius: 2 }
                }

            },
            data: nodes.map(node => {
                const isGateway = node.name.includes('Gateway');
                const isSelected = selectedNames.includes(node.name);
                const isActive = node.isBlinking || node.throughput > 0;
                const opacity = (isGlobal && !isGateway && !isActive && !isLargeMode) ? 0.2 : 1.0;
                const sid = (viewMode === 'all' || isActive) ? node.stageId : (isSelected ? stageId : node.stageId);
                const ctx = getStageContext(sid);
                let color = isGateway ? getGatewayColor(displayGatewayThroughput) : (isSelected ? ctx.color : (isGlobal ? ctx.color : THEME.textMuted));
                let shadowBlur = isSelected ? 30 : 5;
                const isGatewayProcessing = isGateway && nodes.some(n => n.isBlinking && (n.stageId === 'DECRYPT' || n.stageId === 'HASH'));
                if (isGatewayProcessing) shadowBlur = 45;
                if (node.isBlinking && !isGateway) {
                    color = THEME.warning;
                    shadowBlur = 25;
                }
                
                return {
                    ...node,
                    value: [node.x, node.y, node.value],
                    symbol: isGateway ? 'image://' + gatewaySvgRaw : (isLargeMode ? 'circle' : 'circle'),
                    symbolKeepAspect: isGateway,
                    symbolSize: isGateway ? 55 : (isLargeMode ? 5 : 16),
                    itemStyle: {
                        opacity: 1,
                        color: !isGateway ? '#00eaff' : color,
                        shadowBlur: isLargeMode ? 0 : (isGateway ? shadowBlur : 0),
                        shadowColor: isGateway ? color : undefined
                    },
                    label: {
                        show: !isLargeMode && opacity > 0.3,
                        rich: { badge: { color: color, borderColor: color } }
                    }
                };
            }),
            links: isLargeMode ? [] : nodes
                .filter(node => node.category === 'device' && (isGlobal || selectedNames.includes(node.name)))
                .map(node => ({ source: 'A100 Gateway', target: node.name })),
            lineStyle: { color: 'rgba(255,255,255,0.1)', width: 1, type: 'dashed', curveness: 0.2 },
            z: 2
        }];
    };

    const buildInteractionLayer = (): any[] => {
        if (isLargeMode) return [];
        return [{
            name: 'InteractionLayer',
            type: 'graph',
            coordinateSystem: 'cartesian2d',
            layout: 'none',
            cursor: 'pointer',
            symbolSize: isLargeMode ? 15 : 60, // Match visual size approx
            itemStyle: { opacity: 0 },
            data: nodes.map(node => ({
                name: node.name,
                x: node.x,
                y: node.y,
                // Ensure interaction works
                value: [node.x, node.y, node.value],
                symbol: 'circle'
            })),
            z: 10
        }];
    };

    // Combine all layers
    const series = [
        ...buildGatewayLayer(),
        ...buildBackgroundLayer(),
        ...buildFlowLayer(),
        ...buildNodeLayer(),
        ...buildInteractionLayer()
    ];

    return {
        title: {
            text: isRelayMode ? 'End-to-End Relay Security Inspection' : 'Multi-Flow Security Stage Monitor',
            subtext: isRelayMode ? `Secure Path: ${nodeA} → A100 Gateway → ${nodeB}` : (selectedNames.length ? `Tracking: ${selectedNames.join(', ')}` : 'Global Network Tracking'),
            left: 'center',
            top: 10,
            textStyle: { color: THEME.textMuted, fontSize: 16 }
        },
        graphic: [
            {
                type: 'group',
                left: 20,
                top: 20,
                children: [
                    {
                        type: 'rect',
                        shape: { width: 220, height: 200, r: 4 },
                        style: { fill: 'rgba(15, 23, 42, 0.7)', stroke: 'rgba(125, 211, 252, 0.4)', lineWidth: 2 }
                    },
                    {
                        type: 'circle',
                        shape: { r: 5 },
                        style: { fill: THEME.success },
                        left: 195,
                        top: 16
                    },
                    {
                        type: 'text',
                        style: {
                            text: 'SYSTEM TELEMETRY',
                            fill: '#7dd3fc',
                            font: 'bold 13px sans-serif'
                        },
                        left: 15,
                        top: 15
                    },
                    {
                        type: 'text',
                        style: {
                            text: [
                                `PROTO: SM4-CBC/CTR-V2.0`,
                                `AUTH: SM2-ID-CERT-V1.28`,
                                `IO: ${nodes.filter(n => n.isBlinking).length} Act / ${nodes.length} Node`,
                                `Throughput: ${Math.round(displayGatewayThroughput)} Mbps`,
                                `Processing Rate: ${(displayGatewayThroughput / 8).toFixed(1)} MB/s`,
                                `GATEWAY SPEEDUP: ${(displayGatewayThroughput / 800).toFixed(1)}x`,
                                `STATUS: LIVE-STREAMING`,
                                `RISC-V: HARDWARE-ACCEL`,
                            ].join('\n'),
                            fill: '#94a3b8',
                            font: '12px monospace',
                            lineHeight: 18
                        },
                        left: 15,
                        top: 35
                    },
                ]
            }
        ],
        tooltip: {
            trigger: 'item',
            formatter: (params: any) => {
                if (params.seriesType === 'lines') {
                    const data = params.data;
                    const ctx = getStageContext(stageId);
                    const proto = data.stageName.includes('AUTH') ? 'SM2 / TLS' :
                        (data.stageName.includes('ENCRYPT') ? 'SM4-CBC' :
                            (data.stageName.includes('HASH') ? 'SM3-HMAC' : 'RISC-V ISA'));

                    return `
                        <div class="px-3 py-2 font-mono text-xs">
                            <div class="border-b border-gray-600 pb-1 mb-2 flex justify-between items-center">
                                <b class="text-sky-400">Secure Channel</b>
                                <span class="text-[9px] bg-sky-900/50 text-sky-200 px-1.5 py-0.5 rounded border border-sky-700/50">ACTIVE</span>
                            </div>
                            <div class="space-y-1.5 min-w-[160px]">
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Source:</span>
                                    <span class="text-gray-200">${data.sourceName}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Target:</span>
                                    <span class="text-gray-200">${data.targetName}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Protocol:</span>
                                    <span class="text-sky-300 font-bold">${proto}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Payload:</span>
                                    <span class="text-gray-300">${data.throughput ? (data.throughput / 8).toFixed(1) : 0} MB/s</span>
                                </div>
                                <div class="mt-2 pt-1 border-t border-gray-700 flex items-center justify-between">
                                    <span class="text-[9px] text-gray-500 italic">Current Phase:</span>
                                    <span style="color: ${ctx.color}" class="text-[10px] font-bold uppercase">${data.stageName}</span>
                                </div>
                            </div>
                        `;
                }

                if (params.seriesName === 'InteractionLayer' || params.seriesName === 'GLNodes') {
                    const node = nodes.find(n => n.name === params.name);
                    const sid = (selectedNames.includes(params.name) && viewMode !== 'all') ? stageId : (node?.stageId || 'AUTH');
                    const ctx = getStageContext(sid);
                    const isGateway = params.name.includes('Gateway');

                    return `
                        <div class="px-3 py-2 font-mono text-xs">
                            <div class="border-b border-gray-600 pb-1 mb-2 flex justify-between items-center">
                                <b class="${isGateway ? 'text-rose-400' : 'text-blue-400'}">${params.name}</b>
                                <span class="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">${isGateway ? 'Security Hub' : 'IoT Node'}</span>
                            </div>
                            <div class="space-y-1.5 min-w-[180px]">
                                <div class="flex justify-between">
                                    <span class="text-gray-500">IP Addr:</span>
                                    <span class="text-gray-200 font-bold">${params.value}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-500">Security:</span>
                                    <span style="color: ${ctx.color}" class="font-bold">${ctx.text}</span>
                                </div>
                                ${isGateway ? `
                                    <div class="mt-2 pt-2 border-t border-gray-700">
                                        <div class="text-[10px] text-rose-400/80 mb-1 font-bold">Hardware Engines:</div>
                                        <div class="grid grid-cols-2 gap-1 text-[9px]">
                                            <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>SM2: Active</div>
                                            <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>SM3: IDLE</div>
                                            <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>SM4: Busy</div>
                                            <div class="flex items-center gap-1"><div class="w-1 h-1 rounded-full bg-rose-500"></div>RNG: Active</div>
                                        </div>
                                        <div class="mt-2 flex items-center justify-between text-[9px] text-gray-500 bg-black/20 p-1 rounded">
                                            <span>Core Temp:</span>
                                            <span class="text-emerald-400">42°C</span>
                                        </div>
                                    </div>
                                ` : `
                                    <div class="flex justify-between">
                                        <span class="text-gray-500">Status:</span>
                                        <span class="${node?.isBlinking ? 'text-emerald-400' : 'text-gray-500'} flex items-center gap-1">
                                            <span class="w-1.5 h-1.5 rounded-full ${node?.isBlinking ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}"></span>
                                            ${node?.isBlinking ? 'Processing' : 'Standby'}
                                        </span>
                                    </div>
                                    <div class="mt-2 pt-1 border-t border-gray-700 flex justify-between text-[9px]">
                                        <span class="text-gray-500">Throughput:</span>
                                        <span class="text-sky-400">${Math.round(node?.throughput || 0)} Mbps</span>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
                }
                return '';
            },
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: THEME.grid,
            borderWidth: 1,
            padding: 0,
            textStyle: { color: '#f3f4f6' }
        },
        xAxis: { show: false, min: 0, max: 800, type: 'value' },
        yAxis: { show: false, min: 0, max: 400, type: 'value' },
        grid: { top: 40, bottom: 20, left: 20, right: 20 },
        series: series,
        backgroundColor: 'transparent'
    };
};
