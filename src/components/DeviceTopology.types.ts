export type DeviceInfo = {
    id?: string;
    name: string;
    ip: string;
    status?: string;
    deviceType?: 'sensor' | 'camera' | 'industrial' | 'relay' | 'terminal' | 'gateway';
    metrics?: {
        throughput: number;
        latency: number;
        securityScore: number;
    };
    stageId?: string;
};

export type NodeData = {
    name: string;
    x: number;
    y: number;
    value: string;
    category: string;
    deviceType?: string;
    isBlinking: boolean;
    stageId: string;
    throughput: number;
    latency?: number;
    securityScore?: number;
    description?: string;
};

export const THEME = {
    primary: '#7dd3fc',
    success: '#34d399',
    danger: '#fb7185',
    accent: '#a78bfa',
    warning: '#fbbf24',
    grid: '#243047',
    line: '#1f3b72',
    lineReturn: '#0f4c3a',
    textMuted: '#94a3b8'
};
