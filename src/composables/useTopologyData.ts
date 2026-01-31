import { ref, computed, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { STAGES } from '../api/stages';
import type { DeviceInfo, NodeData } from '../components/DeviceTopology.types';
import { calculatePositions } from '../components/DeviceTopology.helpers';

export function useTopologyData(
    devicesSource: Ref<DeviceInfo[] | undefined>,
    currentStageId: Ref<string>,
    modelValue: Ref<string | string[] | undefined>,
    emit: (event: any, ...args: any[]) => void,
    triggerRender: () => void
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
        const stageIds = STAGES.map(s => s.id);

        const defaultDevices = Array.from({ length: 60 }, (_, i) => {
            const types = ['Sensor', 'Camera', 'Node', 'Relay', 'Terminal'];
            const type = types[i % types.length];
            return {
                name: `IoT ${type} ${String.fromCharCode(65 + (i % 26))}${i > 25 ? i : ''}`,
                ip: `192.168.1.${100 + i}`,
                type: 'device'
            };
        });

        // SIMULATION FOR LARGE DATASET
        // Uncomment/Use this block to test WebGL performance with > 500 nodes
        const isSimulationMode = true; // Set to true to force 2000 nodes for testing
        let simulationDevices: any[] = [];
        if (isSimulationMode) {
             simulationDevices = Array.from({ length: 2000 }, (_, i) => ({
                name: `SimNode-${i}`,
                ip: `10.0.${Math.floor(i / 255)}.${i % 255}`,
                type: 'device'
            }));
        }

        const gatewayName = 'A100 Gateway';
        const seenNames = new Set([gatewayName]);
        
        const sourceList = isSimulationMode ? simulationDevices : ((devices && devices.length) ? devices : defaultDevices);
        
        const deviceList = sourceList
            .filter(device => {
                if (!device.name || seenNames.has(device.name)) return false;
                seenNames.add(device.name);
                return true;
            });

        const positions = calculatePositions(deviceList.length);

        const gateway = {
            name: gatewayName,
            x: 400,
            y: 200,
            value: '192.168.1.1',
            category: 'gateway',
            isBlinking: previousState.get(gatewayName)?.isBlinking || false,
            stageId: currentStageId.value || 'AUTH',
            throughput: previousState.get(gatewayName)?.throughput || 100,
            description: 'Secure RISC-V Cryptoverse Hub'
        };

        const newDeviceNodes = deviceList.map((device, index) => {
            const pos = positions[index] || { x: 0, y: 0 };
            const prevState = previousState.get(device.name);
            const defaultTput = Math.floor(Math.random() * 10) + 1;
            return {
                name: device.name,
                x: pos.x,
                y: pos.y,
                value: device.ip,
                category: 'device',
                isBlinking: prevState?.isBlinking || false,
                stageId: prevState?.stageId || stageIds[index % stageIds.length] || 'AUTH',
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

    const handleIncomingPacket = (packet: any) => {
        if (isDisposed) return;
        emit('ws-last-message', Date.now());
        emit('telemetry', packet);

        if (!packet?.source || packet.type === 'device_join' || packet.type === 'device_exit') return;

        const targetNode = nodes.value.find(n => n.value === packet.source || n.value.includes(packet.source));

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
            triggerRender();

            const clearDelay = packet.isLastStage ? 3000 : 1100;
            const existing = blinkTimeouts.get(targetNode.name);
            if (existing) window.clearTimeout(existing);

            const timeoutId = window.setTimeout(() => {
                if (isDisposed) return;
                targetNode.isBlinking = false;
                targetNode.throughput = 0;
                triggerRender();
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
        emit('ws-status', 'connecting');
        if (socket) socket.close();

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
    watch(devicesSource, (newDevices) => {
        buildNodesFromDevices(newDevices);
        triggerRender();
    }, { deep: true, immediate: true });

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
