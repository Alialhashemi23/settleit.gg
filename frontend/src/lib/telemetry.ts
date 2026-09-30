import { browser } from '$app/environment';
import { newOpId } from './api';

interface Ev { id: string; name: string; at: number; sessionId: string; mode?: string; props?: Record<string, unknown> }

const queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sessionId = '';

function session(): string {
	if (sessionId) return sessionId;
	try {
		sessionId = sessionStorage.getItem('sit_client_session') ?? '';
		if (!sessionId) {
			sessionId = newOpId().slice(0, 24);
			sessionStorage.setItem('sit_client_session', sessionId);
		}
	} catch {
		sessionId = sessionId || newOpId().slice(0, 24);
	}
	return sessionId;
}

async function flush() {
	timer = null;
	if (queue.length === 0) return;
	const events = queue.splice(0, 50);
	try {
		await fetch('/api/telemetry', {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ events }),
			keepalive: true
		});
	} catch {
		// Telemetry never blocks or retries aggressively.
	}
}

/** Fire-and-forget usage event. Ids are unique so server-side dedupe makes retries harmless. */
export function track(name: string, props?: Record<string, unknown>, mode?: string) {
	if (!browser) return;
	queue.push({ id: newOpId(), name, at: Date.now(), sessionId: session(), mode, props });
	if (!timer) timer = setTimeout(flush, 1500);
}

export function trackPageView(path: string) {
	track('page_view', { path });
}

if (browser) {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') void flush();
	});
}
