import { ref, computed, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { DeviceInfo, NodeData } from '../components/DeviceTopology.types';
import { calculateTopologyLayout } from '../components/DeviceTopology.helpers';

export function useTopologyData(
    devicesSource: Ref<DeviceInfo[] | undefined>,
    currentStageId: Ref<string>,
    modelValue: Ref<string | string[] | undefined>,
    emit: (event: any, ...args: any[]) => void,
    triggerRender: () => void,
    chartSizeRef?: Ref<{ width: number; height: number } | null | undefined>
) {
    const nodes = ref<NodeData[]>([]);
    
    // Normalize initial selection
    const initialSel = Array.isArray(modelValue.value) 
        ? modelValue.value 
        : (modelValue.value ? [modelValue.value] : []);
        
    const selectedNodeNames = ref<string[]>(initialSel);
    const viewMode = ref<'stage' | 'device' | 'all'>('stage');
    let isDisposed = false;

    // Gateway Throughput Logic
    const deviceNodes = computed(() => nodes.value.filter(node => node.category === 'device'));
    
    const rawGatewayThroughput = computed(() => {
        return deviceNodes.value.reduce((sum, node) => sum + (node.throughput || 0), 0);
    });

    const displayGatewayThroughput = ref(0);

    const animateGatewayThroughput = () => {
        if (isDisposed) return;
        const diff = rawGatewayThroughput.value - displayGatewayThroughput.value;
        if (Math.abs(diff) > 0.5) {
            displayGatewayThroughput.value += diff * 0.08;
            triggerRender();
        }
        requestAnimationFrame(animateGatewayThroughput);
    };

    requestAnimationFrame(animateGatewayThroughput);

    // Node Building Logic
    const buildNodesFromDevices = (devices?: DeviceInfo[]) => {
        const previousState = new Map(nodes.value.map((node) => [node.name, {
            isBlinking: node.isBlinking,
            throughput: node.throughput,
            stageId: node.stageId
        }]));

        const gatewayName = 'A100 Gateway';
        const seenNames = new Set([gatewayName]);
        
        const sourceList = (devices || []);
        
        const deviceList = sourceList
            .filter(device => {
                if (!device.name || seenNames.has(device.name)) return false;
                seenNames.add(device.name);
                return true;
            });

        // determine chart size if provided - STRICTLY use chartSizeRef if available to avoid coordinate mismatch
        if (!chartSizeRef?.value) return; 

        const w = chartSizeRef.value.width;
        const h = chartSizeRef.value.height;
        
        const layout = calculateTopologyLayout(w, h, deviceList.length);

        const gateway = {
            name: gatewayName,
            x: layout.gateway.x,
            y: layout.gateway.y,
            value: '192.168.1.1',
            category: 'gateway',
            isBlinking: previousState.get(gatewayName)?.isBlinking || false,
            stageId: currentStageId.value || 'AUTH',
            throughput: previousState.get(gatewayName)?.throughput || 100,
            description: 'Secure RISC-V Cryptoverse Hub'
        };

        const newDeviceNodes = deviceList.map((device, index) => {
            const pos = layout.nodes[index] || { x: 0, y: 0 };
            const prevState = previousState.get(device.name);
            // Default to 0 throughput if no previous state, avoid random fake data
            const defaultTput = 0; 
            return {
                name: device.name,
                x: pos.x,
                y: pos.y,
                value: device.ip,
                category: 'device',
                isBlinking: prevState?.isBlinking || false,
                // Default to 'AUTH' if no previous state, avoid assigning random stages
                stageId: prevState?.stageId || 'AUTH',
                throughput: prevState?.throughput || defaultTput
            };
        });

        nodes.value = [gateway, ...newDeviceNodes];
    };

    // WebSocket Logic
    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    const blinkTimeouts = new Map<string, number>();
    
    // Throttle rendering to ~60fps maximum to prevent CPU spike during high-frequency telemetry
    let renderRequested = false;
    const throttledTriggerRender = () => {
        if (renderRequested) return;
        renderRequested = true;
        requestAnimationFrame(() => {
            triggerRender();
            renderRequested = false;
        });
    };

    const handleIncomingPacket = (packet: any) => {
        if (isDisposed) return;
        emit('ws-last-message', Date.now());
        emit('telemetry', packet);

        if (!packet?.source || packet.type === 'device_join' || packet.type === 'device_exit') return;

        // Try to find by deviceId first, then by IP
        const targetNode = nodes.value.find(n => 
            (packet.deviceId && (n.name.includes(packet.deviceId) || n.name === packet.deviceId)) || 
            n.value === packet.source || 
            n.value.includes(packet.source)
        );

        if (targetNode) {
            if (packet.stageId && typeof packet.stageId === 'string') {
                targetNode.stageId = packet.stageId;
            }

            if (packet.metrics && typeof packet.metrics === 'object') {
                const m = packet.metrics as any;
                if (m.throughput) {
                    targetNode.throughput = Number(m.throughput) / 10;
                }
            }

            targetNode.isBlinking = true;
            throttledTriggerRender();

            const clearDelay = packet.isLastStage ? 3000 : 1100;
            const existing = blinkTimeouts.get(targetNode.name);
            if (existing) window.clearTimeout(existing);

            const timeoutId = window.setTimeout(() => {
                if (isDisposed) return;
                targetNode.isBlinking = false;
                targetNode.throughput = 0;
                throttledTriggerRender();
                blinkTimeouts.delete(targetNode.name);
            }, clearDelay);
            blinkTimeouts.set(targetNode.name, timeoutId);
        }
    };

    const scheduleReconnect = () => {
        if (isDisposed) return;
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        const jitter = Math.floor(Math.random() * 250);
        const delay = baseDelay + jitter;
        reconnectTimer = window.setTimeout(() => {
            reconnectAttempts += 1;
            startDataListener();
        }, delay);
    };

    const startDataListener = () => {
        if (isDisposed) return;
        
        // If already connected or connecting, don't start a new one unless it's a forced restart
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        emit('ws-status', 'connecting');
        if (socket) {
            socket.onclose = null; // Prevent recursion
            socket.close();
        }

        try {
            socket = new WebSocket(WS_URL);

            socket.onopen = () => {
                reconnectAttempts = 0;
                emit('ws-status', 'connected');
                console.log(`Connected to Telemetry Server at ${WS_URL}`);
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    handleIncomingPacket(data);
                } catch (err) {
                    console.error('Error parsing telemetry data:', err);
                }
            };

            socket.onerror = (err) => {
                emit('ws-status', 'disconnected');
                console.error('WebSocket error:', err);
            };

            socket.onclose = (event) => {
                if (isDisposed) return;
                emit('ws-status', 'disconnected');
                console.warn('WebSocket closed. Code:', event.code, 'Reconnecting...');
                scheduleReconnect();
            };
        } catch (err) {
            emit('ws-status', 'disconnected');
            console.error('Failed to establish WebSocket connection:', err);
            scheduleReconnect();
        }
    };

    // Selection Logic
    const selectNode = (name: string) => {
        if (name === 'Gateway' || name === 'A100 Gateway') return;

        let newSelections = [...selectedNodeNames.value];
        const index = newSelections.indexOf(name);

        if (index > -1) {
            newSelections.splice(index, 1);
        } else {
            if (newSelections.length >= 2) {
                newSelections.shift();
            }
            newSelections.push(name);
        }

        selectedNodeNames.value = newSelections;
        emit('update:modelValue', newSelections);

        const firstNode = nodes.value.find(n => n.name === newSelections[0]);
        emit('node-select', firstNode || { name: '', value: '' });
        triggerRender();
    };

    // Watchers
    watch(devicesSource, (newDevices, oldDevices) => {
        if (!newDevices) return;
        
        // Only rebuild structure if device list changed (length or specific IDs)
        const oldIds = (oldDevices || []).map(d => d.id || d.name).sort().join(',');
        const newIds = newDevices.map(d => d.id || d.name).sort().join(',');
        
        if (oldIds !== newIds || nodes.value.length === 0) {
            buildNodesFromDevices(newDevices);
        } else {
            // Just update existing nodes with new values from devicesSource
            newDevices.forEach(device => {
                const node = nodes.value.find(n => n.name === device.name);
                if (node) {
                    node.value = device.ip;
                    if (device.stageId) node.stageId = device.stageId;
                    if (device.metrics?.throughput !== undefined) {
                        node.throughput = device.metrics.throughput / 10;
                    }
                }
            });
        }
        triggerRender();
    }, { deep: true, immediate: true });

    // Respond to chart size changes for recalculating layout
    if (chartSizeRef) {
        watch(chartSizeRef, (newSize) => {
            if (newSize) {
                buildNodesFromDevices(devicesSource.value);
                triggerRender();
            }
        });
    }

    watch(modelValue, (next) => {
        if (!next) return;
        const nextArr = Array.isArray(next) ? next : [next];
        if (JSON.stringify(nextArr) === JSON.stringify(selectedNodeNames.value)) return;
        selectedNodeNames.value = nextArr;
        triggerRender();
    });

    onUnmounted(() => {
        isDisposed = true;
        if (socket) {
            socket.close();
        }
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        blinkTimeouts.forEach((id) => window.clearTimeout(id));
        blinkTimeouts.clear();
    });

    return {
        nodes,
        deviceNodes,
        selectedNodeNames,
        viewMode,
        displayGatewayThroughput,
        startDataListener,
        selectNode,
        isDisposed
    };
}
