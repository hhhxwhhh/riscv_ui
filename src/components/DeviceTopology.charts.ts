import * as echarts from 'echarts';
import { type NodeData, THEME } from './DeviceTopology.types';
import { getStageContext, getGatewayColor } from './DeviceTopology.helpers';
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
            // Stage 模式下，核心关注点始终是当前顶部的全局阶段
            stagesToShow = [currentStageId];
        }

        stagesToShow.forEach((sid) => {
            const gatewayNode = nodes.find(n => n.category === 'gateway');
            if (!gatewayNode) return;

            // 过滤逻辑：在单阶段视图模式下，如果节点活跃但活跃阶段不匹配，则不显示流量线
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
                // 更动态的不透明度：低流量时几乎透明，高流量时非常亮
                const activeOpacity = Math.max(0.6, Math.min(1.0, tput / 800));
                const flowOpacity = isActive ? activeOpacity : 0.05;
                
                const ctx = getStageContext(sid);
                const stageLines = linesByStage[sid] || (linesByStage[sid] = []);
                
                // 线条粗细随流量变化：1.2 到 4.5 之间
                const lineWidth = isActive ? Math.max(1.5, Math.min(4.5, 1.2 + (tput / 250))) : 1.2;

                // Special "Internal Processing" Loop for Decrypt stage
                if (sid === 'DECRYPT' && (isRelayMode || isSelected)) {
                    const gx = gatewayNode.x, gy = gatewayNode.y; 
                    stageLines.push({
                        coords: [[gx, gy], [gx + 35, gy - 45], [gx + 70, gy], [gx + 35, gy + 45], [gx, gy]],
                        lineStyle: { width: lineWidth, opacity: flowOpacity, color: ctx.color },
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
                            color: ctx.color
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

    const maxTput = 5000;
    const intensity = Math.min(1.2, throughput / maxTput); // Allow slight over-intensity for visual impact
    const color = getGatewayColor(throughput);
    
    // Extract RGB for rgba construction
    const rgb = color.match(/\d+/g)?.map(Number) || [255, 100, 100];
    const alpha = 0.15 + 0.25 * intensity;

    return [
        {
            type: 'effectScatter',
            name: 'GatewayPulse',
            coordinateSystem: 'cartesian2d',
            silent: true,
            data: [{ value: [gateway.x, gateway.y] }],
            symbolSize: 80 + 40 * intensity,
            rippleEffect: { 
                brushType: 'stroke', 
                scale: 2.2 + 0.8 * intensity, 
                period: Math.max(1.5, 4 - 2.5 * intensity), 
                color: color 
            },
            itemStyle: { 
                color: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`, 
                shadowBlur: 30 + 30 * intensity, 
                shadowColor: color 
            },
            z: 0
        },
        {
            type: 'effectScatter',
            name: 'GatewayPulseOuter',
            coordinateSystem: 'cartesian2d',
            silent: true,
            data: [{ value: [gateway.x, gateway.y] }],
            symbolSize: 110 + 50 * intensity,
            rippleEffect: { 
                brushType: 'stroke', 
                scale: 3.2 + 1.2 * intensity, 
                period: Math.max(2, 6 - 3 * intensity), 
                color: color 
            },
            itemStyle: { 
                color: 'transparent', 
                borderColor: color, 
                borderWidth: 1.5, 
                opacity: 0.2 + (0.2 * intensity) 
            },
            z: 0
        }
    ];
};

const buildFlowLayer = (
    linesByStage: Record<string, any[]>,
    isLargeMode: boolean,
    isGlobal: boolean,
    nodes: NodeData[]
) => {
    const series: any[] = [];
    Object.keys(linesByStage).forEach(sid => {
        const lines = linesByStage[sid];
        if (!lines || lines.length === 0) return;

        const ctx = getStageContext(sid);
        
        // Optimize for large datasets
        const MAX_LINES = isLargeMode ? 200 : Infinity;
        const displayData = isLargeMode 
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
             avgTput = lines[0]?.throughput || 50; 
        }
        
        const period = Math.max(1.5, Math.min(6, 8 - (avgTput / 200)));
        const symbolSize = isGlobal ? Math.max(4, Math.min(8, 3 + (avgTput / 300))) : Math.max(6, Math.min(12, 5 + (avgTput / 200)));
        const trailLength = Math.max(0.3, Math.min(0.8, 0.4 + (avgTput / 1200)));

        series.push({
            type: 'lines',
            name: `Flow-${sid}`,
            coordinateSystem: 'cartesian2d',
            effect: {
                show: true,
                period: period,
                trailLength: trailLength,
                symbol: 'arrow',
                symbolSize: symbolSize,
                color: ctx.color
            },
            lineStyle: {
                color: ctx.color,
                width: isGlobal ? 1 : 2,
                curveness: 0.2, // Must match generated coords curveness if possible, but here we use coords directly so this is default
                opacity: isGlobal ? 0.05 : 0.3
            },
            data: displayData,
            z: 1
        });
    });
    return series;
};

const buildNodeLayer = (
    nodes: NodeData[], 
    selectedNames: string[], 
    viewMode: string, 
    currentStageId: string, 
    gatewayThroughput: number, 
    gatewaySvg: string, 
    isLargeMode: boolean,
    isRelayMode: boolean
) => {
    const isGlobal = selectedNames.length === 0;

    // Use GL for massive datasets
    if (isLargeMode) {
        return [{
            type: 'scatterGL',
            name: 'GLNodes',
            coordinateSystem: 'cartesian2d',
            symbolSize: 6,
            itemStyle: { color: '#7dd3fc', opacity: 0.8 },
            data: nodes.map(node => {
                const isGateway = node.category === 'gateway';
                const isActive = node.isBlinking || node.throughput > 0;
                const sid = (viewMode === 'all' || isActive) ? (node.stageId || 'AUTH') : currentStageId;
                const ctx = getStageContext(sid);
                const color = isGateway ? getGatewayColor(gatewayThroughput) : (isActive || selectedNames.includes(node.name) ? ctx.color : THEME.textMuted);
                return { name: node.name, value: [node.x, node.y, 1], itemStyle: { color }};
            }),
            z: 2
        }];
    }

    // Standard Graph Component
    return [{
        type: 'graph',
        coordinateSystem: 'cartesian2d',
        layout: 'none',
        silent: true,
        symbolSize: (_value: any, params: any) => {
            const name = params?.name || '';
            const data = params?.data || {};
            const isGateway = name.includes('Gateway');
            const isActive = !!data.isBlinking;
            const isDense = nodes.length > 40;
            if (isGateway) return isDense ? 58 : 65;
            const base = isDense ? 16 : 22;
            const active = isDense ? 22 : 28;
            const size = isActive ? active : base;
            return [Math.round(size * 1.4), size];
        },
        label: {
            show: false,
            position: 'bottom',
            distance: 8,
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            borderRadius: 6,
            padding: [8, 10],
            shadowColor: 'rgba(0, 0, 0, 0.6)',
            shadowBlur: 10,
            color: '#d1d5db',
            formatter: (p: any) => {
                const node = p.data;
                const isGateway = node.category === 'gateway';
                
                if (isGateway) {
                    return `{gatewayName|${p.name}}\n{gatewayBadge|${Math.round(gatewayThroughput)} Mbps}`;
                }

                // Filtering labels to avoid clutter
                const isActive = node.isBlinking || node.throughput > 0;
                const isSelected = selectedNames.includes(node.name);
                const isDense = nodes.length > 20;

                if (isDense && !isActive && !isSelected) return '';

                let prefix = '';
                if (isRelayMode && isSelected) {
                    prefix = selectedNames.indexOf(node.name) === 0 ? 'SRC ' : 'DST ';
                }

                const statusDot = isActive ? '{activeDot|●} ' : '';
                const tputStr = `\n{tput|${Math.round(node.throughput || 0)} Mbps}`;
                const stageText = getStageContext(node.stageId || 'AUTH').text;
                const stageStr = `\n{stage|${stageText}}`;

                return `{name|${prefix}${p.name}}\n${statusDot}{ip|${node.value}}${stageStr}${tputStr}`;
            },
            rich: {
                name: { fontSize: 11, fontWeight: 'bold', color: '#f8fafc', align: 'center', lineHeight: 16 },
                ip: { fontSize: 9, color: '#94a3b8', align: 'center', padding: [0, 2] },
                stage: { fontSize: 9, color: '#cbd5f5', align: 'center', padding: [2, 0, 0, 0] },
                tput: { fontSize: 10, color: '#38bdf8', align: 'center', fontWeight: 'bold', padding: [2, 0, 0, 0] },
                activeDot: { fontSize: 9, color: '#34d399' },
                gatewayName: { fontSize: 13, fontWeight: 'bold', color: '#fff', align: 'center', padding: [0, 0, 6, 0] },
                gatewayBadge: { fontSize: 11, color: '#fff', backgroundColor: THEME.primary, padding: [3, 8], borderRadius: 4, fontWeight: 'bold' }
            }
        },
        emphasis: {
            label: {
                show: true
            }
        },
        data: nodes.map(node => {
            const isGateway = node.category === 'gateway';
            const isSelected = selectedNames.includes(node.name);
            const isActive = node.isBlinking || node.throughput > 0;

            // 修复点线颜色同步与全局阶段过滤
            // 逻辑：如果活跃则显示其实际阶段，否则显示当前顶部的全局阶段
            const sid = isActive ? node.stageId : currentStageId;
            const ctx = getStageContext(sid);
            
            let color = isGateway ? getGatewayColor(gatewayThroughput) : (isSelected || isGlobal ? ctx.color : THEME.textMuted);
            let shadowBlur = isSelected ? 30 : 10;
            
            if (isActive && !isGateway) {
                color = ctx.color;
                shadowBlur = 40;
            }

            // Dim outline for inactive nodes in dense mode
            const opacity = (nodes.length > 20 && !isGateway && !isActive && !isSelected) ? 0.4 : 1.0;

            return {
                ...node,
                value: [node.x, node.y, node.value], // Cartesian coordinate requires value array
                symbol: isGateway ? 'image://' + gatewaySvg : 'circle',
                symbolKeepAspect: isGateway,
                symbolSize: isGateway ? undefined : [Math.round((nodes.length > 40 ? 16 : 22) * 1.4), (nodes.length > 40 ? 16 : 22)],
                itemStyle: {
                    color: !isGateway ? '#020617' : color,
                    borderColor: color,
                    borderWidth: isGateway ? 0 : (isActive ? 3 : 2),
                    shadowBlur: shadowBlur,
                    shadowColor: color,
                    opacity
                }
            };
        }),
        z: 2
    }];
};

const buildInteractionLayer = (nodes: NodeData[], isLargeMode: boolean) => {
    if (isLargeMode) return [];
    
    return [{
        name: 'InteractionLayer',
        type: 'graph',
        coordinateSystem: 'cartesian2d',
        layout: 'none',
        cursor: 'pointer',
        symbolSize: 60, // Large hit area
        itemStyle: { opacity: 0 }, // Invisible
        data: nodes.map(n => ({
            name: n.name,
            value: [n.x, n.y, n.value]
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
    const isLargeMode = nodes.length > 500;

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
        ...buildGatewayLayer(nodes, displayGatewayThroughput, isLargeMode),
        // buildBackgroundLayer removed for cleanliness/simplicity in redraw
        ...buildFlowLayer(linesByStage, isLargeMode, isGlobal, nodes),
        ...buildNodeLayer(nodes, selectedNames, viewMode, stageId, displayGatewayThroughput, gatewaySvgRaw, isLargeMode, isRelayMode),
        ...buildInteractionLayer(nodes, isLargeMode)
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
                                `STATUS: LIVE-STREAMING`,
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
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: THEME.grid,
            textStyle: { color: '#f3f4f6' },
            formatter: (params: any) => {
                if (params.seriesType === 'lines') {
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
                        const statusText = isActive ? 'Active' : 'Idle';
                        const statusColor = isActive ? '#34d399' : '#94a3b8';

                        return `
                        <div class="px-3 py-2 font-mono text-xs">
                            <div class="border-b border-gray-600 pb-1 mb-2 font-bold text-sky-400">${node.name}</div>
                            <div>IP: ${node.value}</div>
                            <div>Stage: <span style="color:${ctx.color}">${ctx.text}</span></div>
                            <div>Status: <span style="color:${statusColor}">${statusText}</span></div>
                            <div>Throughput: ${Math.round(tput || 0)} Mbps</div>
                        </div>`;
                    }

                    return `<div class="px-3 py-2 font-mono text-xs font-bold">${params.name}</div>`;  
                }
                return '';
            }
        },
        xAxis: { show: false, min: 0, max: width },
        yAxis: { show: false, min: 0, max: height },
        grid: { top: 0, bottom: 0, left: 0, right: 0 },
        series: series,
        backgroundColor: 'transparent'
    };
};
