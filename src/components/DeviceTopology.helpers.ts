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
    const maxExpectedThroughput = 5000;
    const intensity = Math.min(1, throughput / maxExpectedThroughput);

    const red = 255;
    const green = Math.floor(255 * (1 - intensity * 0.85)); // 颜色变化更明显
    const blue = Math.floor(255 * (1 - intensity * 0.85));
    return `rgb(${red}, ${green}, ${blue})`;
};

const getLayoutMetrics = (width: number, height: number, count: number) => {
    const isHighCount = count > 30;
    const topOffset = 90;   // leave space for title/toolbar
    const bottomOffset = 70; // leave space for footer/labels
    const usableHeight = Math.max(200, height - topOffset - bottomOffset);

    const centerX = Math.floor(width * 0.5);
    const centerY = Math.floor(topOffset + usableHeight * (isHighCount ? 0.52 : 0.62));

    const radiusX = Math.floor(width * 0.36);
    const radiusY = Math.floor(usableHeight * (isHighCount ? 0.44 : 0.5));

    return { centerX, centerY, radiusX, radiusY };
};

export const getCenterY = (height: number, count: number) => {
    const width = (typeof window !== 'undefined') ? window.innerWidth : 1200;
    return getLayoutMetrics(width, height, count).centerY;
}

export const getTopologyCenter = () => {
    const width = (typeof window !== 'undefined') ? window.innerWidth : 1200;
    const height = (typeof window !== 'undefined') ? window.innerHeight : 800;

    return getLayoutMetrics(width, height, 0);
}

export const calculatePositions = (count: number, width?: number, height?: number) => {
    let centerX: number, centerY: number, radiusX: number, radiusY: number;
    const isHighCount = count > 30;

    if (width && height) {
        const metrics = getLayoutMetrics(width, height, count);
        centerX = metrics.centerX;
        centerY = metrics.centerY;
        radiusX = metrics.radiusX;
        radiusY = metrics.radiusY;
    } else {
        const c = getTopologyCenter();
        centerX = c.centerX;
        centerY = height ? getCenterY(height, count) : c.centerY;
        radiusX = c.radiusX; radiusY = c.radiusY;
    }

    // Generate dozens of points in a responsive arc or circle
    return Array.from({ length: count }, (_, i) => {
        const angle = isHighCount
            ? (i / count) * 2 * Math.PI
            : (i / (count - 1 || 1)) * Math.PI - Math.PI;

        return {
            x: centerX + Math.cos(angle) * (isHighCount ? radiusX * 0.85 : radiusX),
            y: centerY + Math.sin(angle) * (isHighCount ? radiusY * 0.85 : radiusY)
        };
    });
}
