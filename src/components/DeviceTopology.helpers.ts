import { THEME } from './DeviceTopology.types';

export const getStageContext = (stageId: string) => {
    const stageMap: Record<string, { color: string; text: string }> = {
        AUTH: { color: THEME.accent, text: 'IDENTITY AUTH' },
        ENCRYPT: { color: THEME.success, text: 'ENCRYPTED' },
        DECRYPT: { color: '#f472b6', text: 'DECRYPTION' },
        HASH: { color: THEME.warning, text: 'SM3 HASHING' }
    };
    return stageMap[stageId] || { color: THEME.primary, text: 'PENDING' };
}

export const getGatewayColor = (throughput: number) => {
    const maxExpectedThroughput = 4500;
    const intensity = Math.min(1, throughput / maxExpectedThroughput);

    // Dynamic scale: Cyan (Low) -> Blue (Mid) -> Purple (High) -> Rose (Peak)
    if (intensity < 0.3) {
      return `rgb(125, 211, 252)`; // Sky 300
    } else if (intensity < 0.6) {
      return `rgb(96, 165, 250)`; // Blue 400
    } else if (intensity < 0.85) {
      return `rgb(167, 139, 250)`; // Violet 400
    } else {
      return `rgb(251, 113, 133)`; // Rose 400
    }
};

/**
 * Returns a symbol type based on the device name category
 */
export const getNodeSymbol = (name: string): string => {
    if (name.includes('Gateway')) return 'roundRect';
    if (name.includes('Sensor')) return 'diamond';
    if (name.includes('Camera')) return 'rect';
    if (name.includes('Node')) return 'circle';
    if (name.includes('Relay')) return 'triangle';
    if (name.includes('Terminal')) return 'pin';
    return 'circle';
};

/**
 * Centrally manages the layout logic for the topology
 */
export const calculateTopologyLayout = (width: number, height: number, nodeCount: number) => {
    // 1. Definition of Safe Area
    // Center the layout horizontally within the canvas.
    const usableWidth = width;
    
    const centerX = usableWidth / 2;
    const centerY = height / 2;

    // 2. Gateway Position
    const gatewayPos = { x: centerX, y: centerY };

    // 3. Radius Calculation (Adaptive)
    const minDim = Math.min(usableWidth, height);
    let radius = (minDim / 2) - 90;
    radius = Math.max(160, Math.min(radius, 520));

    // 4. Multi-ring Node Distribution for dense graphs
    // Desired min arc spacing (approx label width + gap)
    const minArcSpacing = 140;
    const maxPerRing = Math.max(8, Math.floor((2 * Math.PI * radius) / minArcSpacing));
    const ringCount = Math.max(1, Math.ceil(nodeCount / maxPerRing));
    const ringStep = Math.min(130, Math.max(85, radius / (ringCount + 0.5)));

    const rings = Array.from({ length: ringCount }, (_, i) => {
        const r = radius - (ringCount - 1 - i) * ringStep;
        const rClamped = Math.max(120, r);
        const rx = rClamped * (usableWidth > height * 1.2 ? 1.35 : 1.05);
        const ry = rClamped;
        return { rx, ry };
    });

    let nodeIndex = 0;
    const nodes = [] as { x: number; y: number }[];
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
        const remaining = nodeCount - nodeIndex;
        const capacity = Math.min(maxPerRing, remaining);
        const ring = rings[ringIndex] || { rx: radius, ry: radius };
        const { rx, ry } = ring;
        const offset = (ringIndex * 18 * Math.PI) / 180; // stagger rings

        for (let i = 0; i < capacity; i += 1) {
            const angle = (i / capacity) * 2 * Math.PI - (Math.PI / 2) + offset;
            nodes.push({
                x: centerX + Math.cos(angle) * rx,
                y: centerY + Math.sin(angle) * ry
            });
            nodeIndex += 1;
        }
    }

    return {
        gateway: gatewayPos,
        nodes: nodes,
        radius: radius
    };
};

// --- Adapters for backward compatibility (or simplified usage) ---

export const getCenterY = (height: number, _count: number) => {
    return height / 2;
}

export const getTopologyCenter = () => {
    return { centerX: window.innerWidth / 2, centerY: window.innerHeight / 2 }; 
}

export const calculatePositions = (count: number, width?: number, height?: number) => {
    const w = width || ((typeof window !== 'undefined') ? window.innerWidth : 1200);
    const h = height || ((typeof window !== 'undefined') ? window.innerHeight : 800);
    return calculateTopologyLayout(w, h, count).nodes;
}
