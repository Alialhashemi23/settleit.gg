<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { CATEGORY_PRESETS } from '@settleit/content';
	import Logo from '$lib/components/Logo.svelte';
	import { api, friendlyError } from '$lib/api';
	import { loadPrefs, savePrefs } from '$lib/prefs';

	type Home = {
		window: { days: number };
		minSample: number;
		mostDebated: { versionId: string; prompt: string; total: number }[];
		closestCalls: { versionId: string; prompt: string; total: number; gapPoints: number }[];
		changedMinds: { changed: number; both: number; rounds: number; percent: number | null };
		todaysSplit: { dateKey: string; prompt: string; total: number; options: Record<string, { count: number; percent: number | null }> } | null;
		featured: { slot: string; version_id: string; prompt: string; note: string | null }[];
	};

	let mode = $state<'none' | 'create' | 'join'>('none');
	let nickname = $state('');
	let code = $state('');
	let categories = $state<string[]>(['mix']);
	let excludeSpoilers = $state(true);
	let error = $state('');
	let loading = $state(false);
	let home = $state<Home | null>(null);
	let lastRoom = $state<string | null>(null);

	onMount(async () => {
		const p = loadPrefs();
		nickname = p.nickname;
		categories = p.categories;
		excludeSpoilers = p.excludeSpoilers;
		lastRoom = p.lastRoom;
		const prefill = page.url.searchParams.get('code');
		if (prefill) {
			code = formatCode(prefill);
			mode = 'join';
		}
		try {
			home = await api.get<Home>('/api/stats/home');
		} catch {
			home = null;
		}
	});

	function formatCode(raw: string) {
		const s = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
		return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
	}

	function toggleCategory(id: string) {
		if (id === 'mix') {
			categories = ['mix'];
			return;
		}
		const next = categories.filter((c) => c !== 'mix');
		categories = next.includes(id) ? next.filter((c) => c !== id) : [...next, id];
		if (categories.length === 0) categories = ['mix'];
	}

	async function create() {
		if (!nickname.trim()) return (error = 'Pick a nickname first.');
		loading = true;
		error = '';
		try {
			const { snapshot } = await api.rooms.create(nickname.trim(), categories, excludeSpoilers);
			savePrefs({ nickname: nickname.trim(), lastRoom: snapshot.code, categories, excludeSpoilers });
			await goto(`/room/${snapshot.code}`);
		} catch (e) {
			error = friendlyError(e);
		} finally {
			loading = false;
		}
	}

	async function join() {
		if (!nickname.trim()) return (error = 'Pick a nickname first.');
		if (code.replace('-', '').length !== 8) return (error = 'Room codes look like FIRE-4829.');
		loading = true;
		error = '';
		try {
			const { snapshot } = await api.rooms.join(code, nickname.trim());
			savePrefs({ nickname: nickname.trim(), lastRoom: snapshot.code });
			await goto(`/room/${snapshot.code}`);
		} catch (e) {
			error = friendlyError(e);
		} finally {
			loading = false;
		}
	}

	const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
</script>

<main class="page">
	<section class="hero enter">
		<Logo size={64} />
		<h1 class="title">Settle It</h1>
		<p class="muted">Bring your own opinion. Find your people. See where the room lands.</p>

		{#if mode === 'none'}
			<div class="stack actions">
				<a class="btn primary daily-btn" href="/daily">Play today's challenge</a>
				<button class="btn" onclick={() => (mode = 'create')}>Create a room</button>
				<button class="btn" onclick={() => (mode = 'join')}>Join a room</button>
				{#if lastRoom}
					<a class="btn ghost" href={`/room/${lastRoom}`}>Back to {lastRoom}</a>
				{/if}
			</div>
		{:else}
			<form class="stack form" onsubmit={(e) => { e.preventDefault(); mode === 'create' ? create() : join(); }}>
				{#if mode === 'join'}
					<label class="field">Room code
						<input class="input code" value={code} oninput={(e) => (code = formatCode(e.currentTarget.value))} placeholder="FIRE-4829" maxlength="9" inputmode="text" autocapitalize="characters" autocomplete="off" />
					</label>
				{/if}
				<label class="field">Your nickname
					<input class="input" bind:value={nickname} placeholder="e.g. Alex" maxlength="20" autocomplete="nickname" />
				</label>
				{#if mode === 'create'}
					<div class="stack">
						<span class="eyebrow">Question mix</span>
						<div class="row">
							{#each CATEGORY_PRESETS as c}
								<button type="button" class="chip" class:on={categories.includes(c.id)} onclick={() => toggleCategory(c.id)}>{c.label}</button>
							{/each}
						</div>
						<label class="row small muted"><input type="checkbox" bind:checked={excludeSpoilers} /> Skip questions with spoilers</label>
					</div>
				{/if}
				{#if error}<p class="error">{error}</p>{/if}
				<button class="btn primary" type="submit" disabled={loading}>{loading ? 'One sec…' : mode === 'create' ? 'Create room' : 'Join room'}</button>
				<button class="btn ghost" type="button" onclick={() => { mode = 'none'; error = ''; }}>Back</button>
			</form>
		{/if}
	</section>

	<section class="stack cards">
		<h2>What players are saying</h2>
		{#if !home}
			<p class="muted small">Loading real results…</p>
		{:else}
			{#if home.todaysSplit}
				<a class="card stat" href="/daily">
					<span class="eyebrow">Today's split · provisional</span>
					<h3>{home.todaysSplit.prompt}</h3>
					<p class="muted small">{home.todaysSplit.total} answers so far. Final numbers when the day closes.</p>
				</a>
			{/if}
			{#if home.mostDebated.length > 0}
				<div class="card stat">
					<span class="eyebrow">Most debated · last {home.window.days} days</span>
					<ul class="list">
						{#each home.mostDebated.slice(0, 3) as t}
							<li><a href={`/topics/${t.versionId}`}>{t.prompt}</a> <span class="dim tiny">{t.total} votes</span></li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if home.closestCalls.length > 0}
				<div class="card stat">
					<span class="eyebrow">Closest calls</span>
					<ul class="list">
						{#each home.closestCalls.slice(0, 3) as t}
							<li><a href={`/topics/${t.versionId}`}>{t.prompt}</a> <span class="dim tiny">within {t.gapPoints} points · {t.total} votes</span></li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if home.changedMinds.percent !== null}
				<div class="card stat">
					<span class="eyebrow">Changed minds</span>
					<h3>{home.changedMinds.percent}% switched after the argument</h3>
					<p class="muted small">Across {home.changedMinds.rounds} group revotes with {home.changedMinds.both} voters.</p>
				</div>
			{/if}
			{#each home.featured as f}
				<a class="card stat" href={`/topics/${f.version_id}`}>
					<span class="eyebrow">Featured</span>
					<h3>{f.prompt}</h3>
					{#if f.note}<p class="muted small">{f.note}</p>{/if}
				</a>
			{/each}
			{#if home.mostDebated.length === 0 && !home.todaysSplit && home.changedMinds.percent === null && home.featured.length === 0}
				<div class="card">
					<h3>No results yet</h3>
					<p class="muted small">Cards appear once at least {home.minSample} people have answered a question. Play the daily challenge or start a room to be first.</p>
				</div>
			{/if}
			<p class="dim tiny">Numbers describe participating players, not a representative poll. <a href="/topics">All topics</a></p>
		{/if}
	</section>

	<p class="credit dim tiny center">created by dijaj garage</p>
</main>

<style>
	.hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.6rem; padding-top: 2rem; }
	.title { font-size: 3.4rem; line-height: 1; background: linear-gradient(to bottom, #f5ede0 20%, #e8831a 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
	.actions, .form { width: 100%; margin-top: 1rem; text-align: left; }
	.daily-btn { display: flex; align-items: center; justify-content: center; text-decoration: none; }
	.code { text-transform: uppercase; letter-spacing: 0.12em; font-weight: 800; }
	.cards { margin-top: 2.5rem; }
	.stat { display: block; text-decoration: none; color: inherit; }
	.stat h3 { margin-top: 0.3rem; }
	.list { list-style: none; margin: 0.4rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
	.list a { color: var(--text); text-decoration: none; font-weight: 800; }
	.list a:hover { color: var(--accent); }
	.credit { margin-top: 3rem; }
</style>
