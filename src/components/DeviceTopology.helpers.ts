import { THEME } from './DeviceTopology.types';

export const getStageContext = (stageId: string) => {
    const stageMap: Record<string, { color: string; text: string }> = {
        AUTH: { color: THEME.accent, text: 'IDENTITY AUTH' },
        ENCRYPT: { color: THEME.success, text: 'ENCRYPTED' },
        DECRYPT: { color: '#f472b6', text: 'DECRYPTION' },
        HASH: { color: THEME.warning, text: 'SM3 HASHING' }
    };
    return stageMap[stageId] || { color: THEME.primary, text: 'PENDING' };
};

export const getGatewayColor = (throughput: number) => {
    const maxExpectedThroughput = 5000;
    const intensity = Math.min(1, throughput / maxExpectedThroughput);

    const red = 255;
    const green = Math.floor(255 * (1 - intensity * 0.85)); // 颜色变化更明显
    const blue = Math.floor(255 * (1 - intensity * 0.85));
    return `rgb(${red}, ${green}, ${blue})`;
};

export const calculatePositions = (count: number) => {
    const centerX = 400;
    const centerY = 200; // Shifted slightly for better fit
    const radiusX = 350;
    const radiusY = 175;

    // Generate dozens of points in a responsive arc or circle
    return Array.from({ length: count }, (_, i) => {
        // Use full circle if count is high, otherwise arc
        const isHighCount = count > 30;
        const angle = isHighCount
            ? (i / count) * 2 * Math.PI
            : (i / (count - 1 || 1)) * Math.PI - Math.PI;

        return {
            x: centerX + Math.cos(angle) * (isHighCount ? radiusX * 0.9 : radiusX),
            y: centerY + Math.sin(angle) * (isHighCount ? radiusY * 0.9 : radiusY)
        };
    });
};
