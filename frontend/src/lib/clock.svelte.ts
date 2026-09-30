/**
 * Server-time aware countdown. The server sends absolute deadlines; the client
 * only renders them, so no per-second network traffic exists.
 */
export class Clock {
	offset = $state(0); // serverNow - Date.now()
	now = $state(Date.now());
	private timer: ReturnType<typeof setInterval> | null = null;

	sync(serverNow: number) {
		this.offset = serverNow - Date.now();
	}
	start() {
		if (this.timer) return;
		this.timer = setInterval(() => (this.now = Date.now()), 250);
	}
	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
	serverNow(): number {
		return this.now + this.offset;
	}
	secondsUntil(deadline: number | null | undefined): number {
		if (!deadline) return 0;
		return Math.max(0, Math.ceil((deadline - this.serverNow()) / 1000));
	}
}
