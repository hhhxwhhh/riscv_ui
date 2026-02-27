import * as echarts from 'echarts';
import { type NodeData, THEME } from './DeviceTopology.types';
import { getStageContext, getGatewayColor, getNodeSymbol } from './DeviceTopology.helpers';
import { STAGES } from '../api/stages';

// --- Helper Functions for Data Preparation ---

const calculateFlowLines = (
    nodes: NodeData[],
    selectedNames: string[],
    viewMode: string,
    currentStageId: string,
    nodeMap: Record<string, [number, number]>
) => {
    const stageIds = STAGES.map(s => s.id);
    const linesByStage: Record<string, any[]> = {};
    stageIds.forEach(id => linesByStage[id] = []);

    const isGlobal = selectedNames.length === 0;
    const isRelayMode = selectedNames.length === 2;
    const nodeA = selectedNames[0] || '';
    const nodeB = selectedNames[1] || '';

    // Logic for determining which flows to draw
    nodes.forEach(node => {
        if (node.category === 'gateway') return;

        const isSelected = selectedNames.includes(node.name);
        if (!isGlobal && !isSelected) return;

        const isActive = node.isBlinking || node.throughput > 0;
        let stagesToShow: string[] = [];
        if (viewMode === 'all' || isRelayMode) {
            stagesToShow = (!isGlobal) ? stageIds : [node.stageId];
        } else {
            // In Stage mode, the focus is always on the current global stage
            stagesToShow = [currentStageId];
        }

        stagesToShow.forEach((sid) => {
            const gatewayNode = nodes.find(n => n.category === 'gateway');
            if (!gatewayNode) return;

            // Filter logic: In single stage view mode, if node is active but stage doesn't match, don't show lines
            const isLogicalMatch = (viewMode === 'stage' && isActive) ? (node.stageId === sid) : true;
            if (!isLogicalMatch) return;

            let source = node.name;
            let target = gatewayNode.name;

            // Handle Relay Mode Complex Paths
            if (isRelayMode) {
                if (node.name === nodeA) {
                    if (['AUTH', 'ENCRYPT'].includes(sid)) target = gatewayNode.name;
                    else if (sid === 'DECRYPT') { source = gatewayNode.name; target = gatewayNode.name; }
                    else if (sid === 'HASH') { source = gatewayNode.name; target = nodeB; }
                    else return;
                } else if (node.name === nodeB) {
                    if (['AUTH', 'ENCRYPT'].includes(sid)) { source = nodeB; target = gatewayNode.name; }
                    else if (sid === 'DECRYPT') { source = gatewayNode.name; target = gatewayNode.name; }
                    else if (sid === 'HASH') { source = gatewayNode.name; target = nodeA; }
                    else return;
                } else return;
            } else {
                // Standard Star Topology Flow
                if (['AUTH', 'ENCRYPT'].includes(sid)) {
                    source = node.name; target = gatewayNode.name;
                } else {
                    source = gatewayNode.name; target = node.name;
                }
            }

            const sPos = nodeMap[source];
            const tPos = nodeMap[target];

            if (sPos && tPos) {
                const tput = node.throughput || 100;
                // Dynamic opacity: near transparent on low traffic, bright on high
                const activeOpacity = Math.max(0.6, Math.min(1.0, 0.4 + (tput / 1200)));
                const flowOpacity = isActive ? activeOpacity : 0.08;
                
                const ctx = getStageContext(sid);
                const stageLines = linesByStage[sid] || (linesByStage[sid] = []);
                
                // Line width varies with throughput: between 1.2 and 4.5
                const lineWidth = isActive ? Math.max(1.5, Math.min(4.5, 1.2 + (tput / 250))) : 1.2;

                // Special "Internal Processing" Loop for Decrypt stage
                if (sid === 'DECRYPT' && (isRelayMode || isSelected)) {
                    const gx = gatewayNode.x, gy = gatewayNode.y; 
                    stageLines.push({
                        coords: [[gx, gy], [gx + 35, gy - 45], [gx + 70, gy], [gx + 35, gy + 45], [gx, gy]],
                        lineStyle: { 
                            width: lineWidth, 
                            opacity: flowOpacity, 
                            color: ctx.color, 
                            shadowBlur: 10,
                            shadowColor: ctx.color 
                        },
                        sourceName: 'Gateway Engine', targetName: 'HW Accelerator',
                        stageName: ctx.text, throughput: tput
                    });
                } else {
                    const curve = isGlobal ? 0.2 : (0.1 + (stageIds.indexOf(sid) * 0.15));
                    stageLines.push({
                        coords: [sPos, tPos],
                        lineStyle: {
                            width: lineWidth,
                            curveness: isRelayMode ? (node.name === nodeB ? -0.25 : 0.25) : curve,
                            opacity: flowOpacity,
                            color: ctx.color,
                            shadowBlur: isActive ? 6 : 0,
                            shadowColor: ctx.color
                        },
                        sourceName: source, targetName: target,
                        stageName: ctx.text, throughput: tput
                    });
                }
            }
        });
    });

    return linesByStage;
};

// --- Series Builders ---

const buildGatewayLayer = (nodes: NodeData[], throughput: number, isLargeMode: boolean) => {
    const gateway = nodes.find(n => n.category === 'gateway');
    if (!gateway || isLargeMode) return [];

    const color = getGatewayColor(throughput);
    
    // Extract RGB for rgba construction
    const rgb = color.match(/\d+/g)?.map(Number) || [125, 211, 252];
    const intensity = Math.min(1.0, throughput / 5000);
    const alpha = 0.2 + 0.3 * intensity;

    return [
        {
            type: 'effectScatter',
            name: 'GatewayPulse',
            coordinateSystem: 'cartesian2d',
            silent: true,
            data: [{ value: [gateway.x, gateway.y] }],
            symbolSize: 75 + 35 * intensity,
            rippleEffect: { 
                brushType: 'fill', 
                scale: 2.5 + 1.0 * intensity, 
                period: Math.max(1.8, 4.5 - 3 * intensity), 
                color: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.4)` 
            },
            itemStyle: { 
                color: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`, 
                shadowBlur: 40 + 40 * intensity, 
                shadowColor: color 
            },
            z: 0
        },
        {
            type: 'effectScatter',
            name: 'GatewayPulseInner',
            coordinateSystem: 'cartesian2d',
            silent: true,
            data: [{ value: [gateway.x, gateway.y] }],
            symbolSize: 30 + 15 * intensity,
            rippleEffect: { 
                brushType: 'stroke', 
                scale: 4 + 2 * intensity, 
                period: 3, 
                color: color 
            },
            itemStyle: { 
                color: color, 
                opacity: 0.8 
            },
            z: 0
        }
    ];
};

const buildFlowLayer = (
    linesByStage: Record<string, any[]>,
    useGpuRendering: boolean,
    isGlobal: boolean,
    nodes: NodeData[]
) => {
    const series: any[] = [];
    Object.keys(linesByStage).forEach(sid => {
        const lines = linesByStage[sid];
        if (!lines || lines.length === 0) return;

        const ctx = getStageContext(sid);
        
        // Optimize for large datasets
        const MAX_LINES = useGpuRendering ? 600 : Infinity;
        const displayData = useGpuRendering 
            ? lines.sort((a, b) => b.throughput - a.throughput).slice(0, MAX_LINES)
            : lines;

        if (displayData.length === 0) return;

        // Calculate animation speed
        let avgTput = 0;
        if (isGlobal) {
            const activeNodes = nodes.filter(n => n.stageId === sid && n.throughput > 0);
            if (activeNodes.length > 0) {
                avgTput = activeNodes.reduce((sum, n) => sum + n.throughput, 0) / activeNodes.length;
            }
        } else {
             // Use throughput for individual link speed
             avgTput = lines[0]?.throughput || 50; 
        }
        
        // Scale animation parameters based on Mbps (up to ~3000-4000 Mbps)
        const period = Math.max(0.2, Math.min(6, 6 - (avgTput / 800)));
        const symbolSize = isGlobal ? Math.max(4, Math.min(10, 3 + (avgTput / 1200))) : Math.max(6, Math.min(14, 5 + (avgTput / 1000)));
        const trailLength = Math.max(0.1, Math.min(0.9, 0.2 + (avgTput / 4000)));

        const lineBase = {
            type: useGpuRendering ? 'linesGL' : 'lines',
            name: `Flow-${sid}`,
            coordinateSystem: 'cartesian2d',
            lineStyle: {
                color: ctx.color,
                width: isGlobal ? 1 : 2,
                curveness: 0.2, // Must match generated coords curveness if possible, but here we use coords directly so this is default
                opacity: isGlobal ? 0.05 : 0.3
            },
            data: displayData,
            z: 1
        } as any;

        if (!useGpuRendering) {
            lineBase.effect = {
                show: true,
                period: period,
                trailLength: trailLength,
                symbol: 'arrow',
                symbolSize: symbolSize,
                color: ctx.color
            };
        }

        series.push(lineBase);
    });
    return series;
};

const buildNodeLayer = (
    nodes: NodeData[], 
    selectedNames: string[], 
    _viewMode: string, 
    currentStageId: string, 
    gatewayThroughput: number, 
    _gatewaySvg: string, 
    _isLargeMode: boolean,
    _isRelayMode: boolean
) => {
    return [{
        type: 'scatter',
        name: 'GLNodes',
        coordinateSystem: 'cartesian2d',
        
        symbol: (_value: any, params: any) => {
            const node = params?.data || {};
            return getNodeSymbol(node.name || '');
        },

        symbolSize: (value: number[], params: any) => {
            const node = params?.data || {};
            if (node.category === 'gateway') return 32;
            const isSelected = selectedNames.includes(node.name);
            const isActive = !!node.isBlinking || (value?.[2] || 0) > 0;
            if (isSelected) return 18;
            return isActive ? 14 : 10;
        },

        label: {
            show: false,
        },

        data: nodes.map(node => {
            const isGateway = node.category === 'gateway';
            const isSelected = selectedNames.includes(node.name);
            const isActive = node.isBlinking || node.throughput > 0;
            const sid = isActive ? node.stageId : currentStageId;
            const ctx = getStageContext(sid);
            
            let color = isGateway ? getGatewayColor(gatewayThroughput) : (isSelected ? ctx.color : THEME.textMuted);
            
            if (isActive && !isGateway) {
                color = ctx.color;
            }

            return {
                ...node,
                value: [node.x, node.y, node.throughput || 0],
                itemStyle: {
                    color,
                    opacity: isGateway ? 1.0 : (isActive || isSelected ? 0.95 : 0.4),
                    shadowBlur: (isActive || isSelected) ? 12 : 0,
                    shadowColor: color,
                    borderColor: isSelected ? '#fff' : 'transparent',
                    borderWidth: isSelected ? 1 : 0
                }
            };
        }),
        z: 2
    }];
};

const buildInteractionLayer = (nodes: NodeData[], gatewayThroughput: number, currentStageId: string) => {
    return [{
        name: 'InteractionLayer',
        type: 'scatter',
        coordinateSystem: 'cartesian2d',
        silent: false,
        cursor: 'pointer',
        symbolSize: 40,
        itemStyle: { color: 'transparent' }, 
        data: nodes.map(n => ({
            ...n,
            name: n.name,
            value: [n.x, n.y, n.throughput || 0]
        })),
        z: 10
    }];
};

// --- Main Build Function ---

export const buildChartOption = (
    nodes: NodeData[],
    selectedNames: string[],
    viewMode: string,
    stageId: string,
    displayGatewayThroughput: number,
    gatewaySvgRaw: string,
    width: number = 800,
    height: number = 400
): echarts.EChartsOption => {
    const isRelayMode = selectedNames.length === 2;
    const isGlobal = selectedNames.length === 0;
    const useGpuRendering = false;


    // 1. Prepare Layout Map
    const nodeMap: Record<string, [number, number]> = {};
    nodes.forEach(n => nodeMap[n.name] = [n.x, n.y]);

    // 2. Prepare Flow Lines
    const shouldCalculateFlows = true;
    const linesByStage = shouldCalculateFlows 
        ? calculateFlowLines(nodes, selectedNames, viewMode, stageId, nodeMap)
        : {};

    // 3. Assemble Series
    const series = [
        ...buildGatewayLayer(nodes, displayGatewayThroughput, false),
        // buildBackgroundLayer removed for cleanliness/simplicity in redraw
        ...buildFlowLayer(linesByStage, useGpuRendering, isGlobal, nodes),
        ...buildNodeLayer(nodes, selectedNames, viewMode, stageId, displayGatewayThroughput, gatewaySvgRaw, useGpuRendering, isRelayMode),
        ...buildInteractionLayer(nodes, displayGatewayThroughput, stageId)
    ];

    // 4. Construct Option
    return {
        title: {
            text: isRelayMode ? 'End-to-End Relay Security Inspection' : 'Multi-Flow Security Stage Monitor',
            subtext: isRelayMode 
                ? `Secure Path: ${selectedNames[0]} → A100 Gateway → ${selectedNames[1]}` 
                : (selectedNames.length ? `Tracking: ${selectedNames.join(', ')}` : 'Global Network Tracking'),
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
                        left: 195, top: 16
                    },
                    {
                        type: 'text',
                        style: { text: 'SYSTEM TELEMETRY', fill: '#7dd3fc', font: 'bold 13px sans-serif' },
                        left: 15, top: 15
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
                                `MODE: SECURITY-${stageId}`,
                                `RISC-V: HARDWARE-ACCEL`,
                            ].join('\n'),
                            fill: '#94a3b8', font: '12px monospace', lineHeight: 18
                        },
                        left: 15, top: 35
                    },
                ]
            }
        ],
        tooltip: {
            trigger: 'item',
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            padding: 0,
            shadowBlur: 0,
            textStyle: { color: '#f3f4f6' },
            formatter: (params: any) => {
                if (params.seriesType === 'lines' || params.seriesType === 'linesGL') {
                    const data = params.data;
                    return `
                    <div class="px-3 py-2 font-mono text-xs">
                         <div class="border-b border-gray-600 pb-1 mb-2 font-bold text-sky-400">Secure Flow</div>
                         <div>Source: ${data.sourceName}</div>
                         <div>Target: ${data.targetName}</div>
                         <div>Stage: ${data.stageName}</div>
                         <div>Speed: ${Math.round(data.throughput)} Mbps</div>
                    </div>`;
                }
                if (params.componentType === 'series') {
                    const node = params?.data?.category
                        ? params.data
                        : nodes.find(n => n.name === params.name);

                    if (node) {
                        const isGateway = node.category === 'gateway' || node.name.includes('Gateway');
                        const ctx = getStageContext(node.stageId || 'AUTH');
                        const isActive = node.isBlinking || node.throughput > 0;
                        const tput = isGateway ? displayGatewayThroughput : node.throughput;
                        const statusText = isActive ? 'ACTIVE' : 'IDLE';
                        const statusColor = isActive ? '#34d399' : '#94a3b8';

                        let html = `
                        <div class="px-4 py-3 font-mono text-xs bg-slate-900/90 border border-sky-500/30 rounded-lg shadow-xl backdrop-blur-md">
                            <div class="border-b border-sky-500/20 pb-2 mb-2 flex justify-between items-center gap-4">
                                <span class="font-bold text-sky-400 text-sm tracking-tight">${node.name}</span>
                                <span class="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400 border border-slate-700">NODE</span>
                            </div>
                            <div class="space-y-1.5">
                                <div class="flex justify-between gap-6">
                                    <span class="text-slate-500">IP ADDRESS</span>
                                    <span class="text-slate-300">192.168.1.${node.name.split('-').pop()}</span>
                                </div>
                                <div class="flex justify-between gap-6">
                                    <span class="text-slate-500">SECURITY STAGE</span>
                                    <span style="color:${ctx.color}" class="font-bold">${ctx.text}</span>
                                </div>
                                <div class="flex justify-between gap-6">
                                    <span class="text-slate-500">STATE</span>
                                    <span style="color:${statusColor}" class="font-bold tracking-widest">${statusText}</span>
                                </div>
                                <div class="flex justify-between gap-6 pt-1 border-t border-slate-800">
                                    <span class="text-slate-500 uppercase">Throughput</span>
                                    <span class="text-teal-400 font-bold">${Math.round(tput || 0)} Mbps</span>
                                </div>`;
                                
                        if (isActive && node.latency) {
                            html += `
                                <div class="flex justify-between gap-6">
                                    <span class="text-slate-500 uppercase">Latency</span>
                                    <span class="text-amber-400 font-bold">${node.latency.toFixed(2)} ms</span>
                                </div>
                                <div class="flex justify-between gap-6">
                                    <span class="text-slate-500 uppercase">Security</span>
                                    <span class="text-emerald-400 font-bold">${node.securityScore || 100}%</span>
                                </div>`;
                        }

                        html += `</div></div>`;
                        return html;
                    }

                    return `<div class="px-3 py-2 font-mono text-xs font-bold">${params.name}</div>`;  
                }
                return '';
            }
        },
        xAxis: { type: 'value', show: false, min: 0, max: width },
        yAxis: { type: 'value', show: false, min: 0, max: height },
        grid: { top: 0, bottom: 0, left: 0, right: 0 },
        series: series,
        backgroundColor: 'transparent',
        animation: false // Disable global animation to prevent ghosting during rapid state changes
    };
};
