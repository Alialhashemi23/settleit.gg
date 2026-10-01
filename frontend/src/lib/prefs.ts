import { browser } from '$app/environment';

const KEY = 'settleit_prefs';

export interface Prefs {
	nickname: string;
	lastRoom: string | null;
	categories: string[];
	excludeSpoilers: boolean;
}

const DEFAULTS: Prefs = { nickname: '', lastRoom: null, categories: ['mix'], excludeSpoilers: true };

export function loadPrefs(): Prefs {
	if (!browser) return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(KEY);
		return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULTS };
	} catch {
		return { ...DEFAULTS };
	}
}

export function savePrefs(patch: Partial<Prefs>) {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
	} catch {
		// storage can be unavailable; the game still works
	}
}
