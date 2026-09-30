import { browser } from '$app/environment';
import type { CommandResponse, RoomCommandBody, RoomSnapshot, RecapView } from '@settleit/core';

export class ApiError extends Error {
	constructor(public status: number, public code: string, message: string) {
		super(message);
	}
}

export function newOpId(): string {
	if (browser && crypto.randomUUID) return crypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function call<T>(path: string, init: RequestInit = {}, fetchFn: typeof fetch = fetch): Promise<T> {
	const res = await fetchFn(path, {
		credentials: 'same-origin',
		...init,
		headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) }
	});
	const text = await res.text();
	let body: unknown = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = null;
	}
	if (!res.ok) {
		const err = (body ?? {}) as { error?: string; message?: string };
		throw new ApiError(res.status, err.error ?? `http_${res.status}`, err.message ?? `Request failed (${res.status}).`);
	}
	return body as T;
}

export const api = {
	get: <T>(path: string, fetchFn?: typeof fetch) => call<T>(path, {}, fetchFn),
	post: <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
	put: <T>(path: string, body?: unknown) => call<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
	patch: <T>(path: string, body?: unknown) => call<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
	del: <T>(path: string) => call<T>(path, { method: 'DELETE' }),

	rooms: {
		create: (nickname: string, categories: string[], excludeSpoilers: boolean) =>
			call<{ snapshot: RoomSnapshot }>('/api/rooms', { method: 'POST', body: JSON.stringify({ nickname, categories, excludeSpoilers }) }),
		join: (code: string, nickname: string) =>
			call<{ snapshot: RoomSnapshot }>(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({ nickname }) }),
		snapshot: (code: string) => call<{ snapshot: RoomSnapshot }>(`/api/rooms/${code}/snapshot`),
		recap: (code: string) => call<{ recap: RecapView; serverNow: number }>(`/api/rooms/${code}/recap`),
		command: (code: string, body: RoomCommandBody, opId: string) =>
			call<CommandResponse>(`/api/rooms/${code}/command`, { method: 'POST', body: JSON.stringify({ opId, body }) })
	}
};

export function friendlyError(e: unknown): string {
	if (e instanceof ApiError) return e.message;
	if (e instanceof TypeError) return "Can't reach the server. Check your connection.";
	return 'Something went wrong.';
}
