type FetchOptions = {
    timeoutMs?: number;
    retries?: number;
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

    const retries = options.retries ?? 2;
    let lastError: any;

    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) {
                if (response.status >= 500 && i < retries) continue;
                throw new ApiError(`Request failed: ${response.status}`, response.status);
            }
            return await response.json() as T;
        } catch (error: any) {
            lastError = error;
            if (error.name === 'AbortError') break;
            if (i < retries) {
                // 指数退避
                await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, i)));
                continue;
            }
        } finally {
            window.clearTimeout(timeout);
        }
    }

    if (lastError instanceof ApiError) throw lastError;
    if (lastError?.name === 'AbortError') {
        throw new ApiError('Request timed out after ' + (options.timeoutMs ?? 5000) + 'ms');
    }
    console.error('[API] Network error:', lastError);
    throw new ApiError('Network connection failed. Please check if the backend is reachable.');
};
