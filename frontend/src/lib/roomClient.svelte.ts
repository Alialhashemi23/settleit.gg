import { browser } from '$app/environment';
import type { CommandOutcome, RoomCommandBody, RoomSnapshot, ServerPush } from '@settleit/core';
import { ApiError, api, friendlyError, newOpId } from './api';
import { Clock } from './clock.svelte';
import { track } from './telemetry';

export type Connection = 'connecting' | 'live' | 'polling' | 'offline';

interface Queued {
	opId: string;
	body: RoomCommandBody;
	resolve: (r: CommandOutcome | null) => void;
}

const POLL_MS = [3000, 5000, 8000, 12000, 15000];

/**
 * Owns everything about one room on the client: the latest snapshot, the live
 * connection, polling fallback, foreground recovery and a serialized command
 * queue with stable operation ids so retries can never double-apply.
 */
export class RoomClient {
	snapshot = $state<RoomSnapshot | null>(null);
	connection = $state<Connection>('connecting');
	notInRoom = $state(false);
	gone = $state<null | 'expired' | 'not_found'>(null);
	fatal = $state<string | null>(null);
	/** Set while a command is in flight (used for "sending…" feedback). */
	pending = $state<RoomCommandBody | null>(null);
	/** Short, transient server feedback such as "too late". */
	note = $state<string | null>(null);
	clock = new Clock();

	private ws: WebSocket | null = null;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private pollStep = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private reconnectDelay = 1000;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private queue: Queued[] = [];
	private draining = false;
	private stopped = false;
	private noteTimer: ReturnType<typeof setTimeout> | null = null;
	private listeners: (() => void)[] = [];

	constructor(public code: string) {}

	async start(): Promise<void> {
		if (!browser) return;
		this.stopped = false;
		this.clock.start();
		const ok = await this.refresh();
		if (!ok) return;
		this.openSocket();
		const onVisible = () => {
			if (document.visibilityState === 'visible') void this.resume('visibility');
			else this.pauseBackground();
		};
		const onOnline = () => void this.resume('online');
		const onFocus = () => void this.resume('focus');
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onOnline);
		window.addEventListener('pageshow', onFocus);
		this.listeners.push(
			() => document.removeEventListener('visibilitychange', onVisible),
			() => window.removeEventListener('online', onOnline),
			() => window.removeEventListener('pageshow', onFocus)
		);
	}

	stop(): void {
		this.stopped = true;
		this.clock.stop();
		for (const off of this.listeners) off();
		this.listeners = [];
		this.closeSocket();
		this.stopPolling();
		if (this.pingTimer) clearInterval(this.pingTimer);
		this.pingTimer = null;
	}

	/** Fresh authenticated snapshot over HTTP. Returns false when the room is unreachable for good. */
	async refresh(): Promise<boolean> {
		try {
			const { snapshot } = await api.rooms.snapshot(this.code);
			this.apply(snapshot);
			return true;
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'not_a_member') this.notInRoom = true;
				else if (e.code === 'room_expired') this.gone = 'expired';
				else if (e.code === 'room_not_found') this.gone = 'not_found';
				else this.fatal = e.message;
				return false;
			}
			this.connection = 'offline';
			return true;
		}
	}

	private async resume(reason: string): Promise<void> {
		if (this.stopped || document.visibilityState !== 'visible') return;
		const t0 = performance.now();
		track('resume_attempted', { reason }, 'group');
		const ok = await this.refresh();
		if (ok && this.snapshot && this.connection !== 'offline') {
			track('resume_succeeded', { reason, latencyMs: Math.round(performance.now() - t0) }, 'group');
		} else {
			track('resume_failed', { reason }, 'group');
		}
		if (!this.ws || this.ws.readyState > WebSocket.OPEN) this.openSocket();
		else if (this.ws.readyState === WebSocket.OPEN) this.ws.send('sync');
		void this.drain();
	}

	private pauseBackground(): void {
		// Never poll a sleeping phone. The socket may die on its own; we recover on return.
		this.stopPolling();
	}

	apply(snapshot: RoomSnapshot): void {
		if (this.snapshot && snapshot.version < this.snapshot.version) return; // stale
		this.snapshot = snapshot;
		this.clock.sync(snapshot.serverNow);
		if (snapshot.status === 'expired') this.gone = 'expired';
	}

	// ---------- live connection ----------

	private openSocket(): void {
		if (this.stopped || this.ws) return;
		if (document.visibilityState !== 'visible') return;
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		let ws: WebSocket;
		try {
			ws = new WebSocket(`${proto}://${location.host}/api/rooms/${this.code}/ws`);
		} catch {
			this.startPolling();
			return;
		}
		this.ws = ws;
		this.connection = this.snapshot ? this.connection : 'connecting';
		ws.onopen = () => {
			this.connection = 'live';
			this.reconnectDelay = 1000;
			this.stopPolling();
			if (this.pingTimer) clearInterval(this.pingTimer);
			this.pingTimer = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN && document.visibilityState === 'visible') ws.send('ping');
			}, 25_000);
		};
		ws.onmessage = (ev) => {
			if (typeof ev.data !== 'string' || ev.data === 'pong') return;
			try {
				const msg = JSON.parse(ev.data) as ServerPush;
				if (msg.kind === 'snapshot') this.apply(msg.snapshot);
				else if (msg.kind === 'version') void this.refresh();
				else if (msg.kind === 'expired') this.gone = 'expired';
			} catch {
				/* ignore malformed */
			}
		};
		ws.onclose = () => {
			if (this.ws === ws) this.ws = null;
			if (this.pingTimer) clearInterval(this.pingTimer);
			this.pingTimer = null;
			if (this.stopped || this.gone) return;
			// HTTP still works? Poll while visible, and try the socket again with backoff.
			this.startPolling();
			this.scheduleReconnect();
		};
		ws.onerror = () => {
			try {
				ws.close();
			} catch {
				/* ignore */
			}
		};
	}

	private closeSocket(): void {
		const ws = this.ws;
		this.ws = null;
		if (ws) {
			ws.onclose = null;
			try {
				ws.close(1000, 'leaving');
			} catch {
				/* ignore */
			}
		}
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.reconnectTimer = null;
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer || this.stopped) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (document.visibilityState === 'visible') this.openSocket();
		}, this.reconnectDelay);
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15_000);
	}

	private startPolling(): void {
		if (this.pollTimer || this.stopped) return;
		this.connection = this.connection === 'offline' ? 'offline' : 'polling';
		const tick = async () => {
			this.pollTimer = null;
			if (this.stopped || document.visibilityState !== 'visible' || this.ws?.readyState === WebSocket.OPEN) return;
			const ok = await this.refresh();
			if (ok && this.connection === 'offline' && this.snapshot) this.connection = 'polling';
			const delay = POLL_MS[Math.min(this.pollStep++, POLL_MS.length - 1)]!;
			this.pollTimer = setTimeout(tick, delay);
		};
		this.pollStep = 0;
		this.pollTimer = setTimeout(tick, 1000);
	}

	private stopPolling(): void {
		if (this.pollTimer) clearTimeout(this.pollTimer);
		this.pollTimer = null;
	}

	// ---------- commands ----------

	/**
	 * Commands run one at a time. A newer vote replaces an older vote that has not
	 * been sent yet, so tapping quickly ends with exactly the last choice.
	 */
	send(body: RoomCommandBody): Promise<CommandOutcome | null> {
		return new Promise((resolve) => {
			if (body.type === 'vote') {
				const i = this.queue.findIndex((q) => q.body.type === 'vote');
				if (i >= 0) {
					this.queue[i]!.resolve(null);
					this.queue.splice(i, 1);
				}
			}
			this.queue.push({ opId: newOpId(), body, resolve });
			void this.drain();
		});
	}

	private async drain(): Promise<void> {
		if (this.draining) return;
		this.draining = true;
		try {
			while (this.queue.length > 0 && !this.stopped) {
				const item = this.queue[0]!;
				this.pending = item.body;
				const outcome = await this.deliver(item);
				this.pending = null;
				this.queue.shift();
				item.resolve(outcome);
			}
		} finally {
			this.draining = false;
		}
	}

	/** Same opId on every retry: the server returns the original result for duplicates. */
	private async deliver(item: Queued): Promise<CommandOutcome | null> {
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				const res = await api.rooms.command(this.code, item.body, item.opId);
				this.apply(res.snapshot);
				if (this.connection === 'offline') this.connection = this.ws?.readyState === WebSocket.OPEN ? 'live' : 'polling';
				if (!res.result.ok) this.showNote(res.result.message);
				return res.result;
			} catch (e) {
				if (e instanceof ApiError) {
					if (e.code === 'not_a_member') this.notInRoom = true;
					else if (e.code === 'room_expired') this.gone = 'expired';
					else this.showNote(e.message);
					return null;
				}
				this.connection = 'offline';
				await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
			}
		}
		this.showNote(friendlyError(new TypeError('network')));
		return null;
	}

	showNote(text: string): void {
		this.note = text;
		if (this.noteTimer) clearTimeout(this.noteTimer);
		this.noteTimer = setTimeout(() => (this.note = null), 4000);
	}

	// Convenience wrappers
	vote(optionId: string) {
		const r = this.snapshot?.round;
		if (!r) return Promise.resolve(null);
		return this.send({ type: 'vote', roundId: r.roundId, ballotRevision: r.ballotRevision, optionId });
	}
	requestRevote() {
		const r = this.snapshot?.round;
		return r ? this.send({ type: 'request_revote', roundId: r.roundId }) : Promise.resolve(null);
	}
	requestMoreTime() {
		const r = this.snapshot?.round;
		return r ? this.send({ type: 'request_more_time', roundId: r.roundId }) : Promise.resolve(null);
	}
	requestSkip() {
		const r = this.snapshot?.round;
		return r ? this.send({ type: 'request_skip', roundId: r.roundId }) : Promise.resolve(null);
	}
	writeIn(text: string) {
		const r = this.snapshot?.round;
		return r ? this.send({ type: 'write_in', roundId: r.roundId, text }) : Promise.resolve(null);
	}
	setReady(ready: boolean) {
		return this.send({ type: 'set_ready', ready });
	}
	setCategories(categories: string[], excludeSpoilers: boolean) {
		return this.send({ type: 'set_categories', categories, excludeSpoilers });
	}
	queueCustom(prompt: string, options: string[]) {
		return this.send({ type: 'queue_custom', prompt, options });
	}
	leave() {
		return this.send({ type: 'leave' });
	}
}
