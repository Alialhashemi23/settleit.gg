export interface DailyView {
	dateKey: string;
	opensAt?: number;
	closesAt?: number;
	status: 'none' | 'scheduled' | 'open' | 'closed' | 'settled' | 'void';
	question: { versionId: string; prompt: string; options: { id: string; text: string }[]; topic: string | null } | null;
	myAttempt: { optionId: string; prediction: number; submittedAt: number; eligible: boolean } | null;
	sample: number;
	minSample: number;
	split: { counts: Record<string, number>; total: number; provisional: boolean } | null;
	grade: { status: string; score: number | null; baselineShare: number | null; resultVersion: number } | null;
	resultVersion: number;
	voidReason: string | null;
	serverNow: number;
	share?: { isOwner: boolean; revealed: boolean; sharerOptionId: string | null };
}

export function localTime(ms: number | undefined): string {
	if (!ms) return '';
	return new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function pct(n: number, total: number): number {
	return total ? Math.round((n / total) * 1000) / 10 : 0;
}
