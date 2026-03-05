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
        const response = await fetch(url, { 
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new ApiError(`Request failed: ${response.status}`, response.status);
        }
        return await response.json() as T;
    } catch (error: any) {
        if (error instanceof ApiError) throw error;
        if (error.name === 'AbortError') {
            throw new ApiError('Request timed out after ' + (options.timeoutMs ?? 5000) + 'ms');
        }
        console.error('[API] Network error:', error);
        throw new ApiError('Network connection failed. Please check if the backend is reachable.');
    } finally {
        window.clearTimeout(timeout);
    }
};
