const BASE_URL = '/api';

class APIClient {
  private baseURL: string;

  constructor(baseURL: string = BASE_URL) {
    this.baseURL = baseURL;
  }

  private getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  setToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  clearToken(): void {
    localStorage.removeItem('auth_token');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        localStorage.removeItem('auth-storage');
      }
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.detail || error.message || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async uploadFile<T>(
    path: string,
    file: File,
    extraFields?: Record<string, string>
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const token = this.getToken();
    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        localStorage.removeItem('auth-storage');
      }
      const error = await response.json().catch(() => ({ message: 'An error occurred' }));
      throw new Error(error.detail || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async streamPost(path: string, body?: unknown): Promise<ReadableStream<string>> {
    const url = `${this.baseURL}${path}`;
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 401) {
        this.clearToken();
        localStorage.removeItem('auth-storage');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    return response.body.pipeThrough(
      new TextDecoderStream()
    );
  }
}

export const apiClient = new APIClient();
