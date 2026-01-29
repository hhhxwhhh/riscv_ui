type FetchOptions = {
    timeoutMs?: number;
};

export class ApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export const fetchJson = async <T>(url: string, options: FetchOptions = {}): Promise<T> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

    try {
        const res = await fetch(url, { signal: controller.signal });
        
        // 检查请求是否被中止（超时）
        if (controller.signal.aborted) {
            throw new ApiError('Request timed out');
        }
        
        if (!res.ok) {
            throw new ApiError(`Request failed: ${res.status}`, res.status);
        }
        return await res.json() as T;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if ((error as Error).name === 'AbortError') {
            throw new ApiError('Request timed out');
        }
        throw new ApiError('Network error');
    } finally {
        window.clearTimeout(timeout);
    }
};