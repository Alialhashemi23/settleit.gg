<script lang="ts">
	import { onMount } from 'svelte';
	import { api, friendlyError } from '$lib/api';
	import TopBar from '$lib/components/TopBar.svelte';

	type Me = { admin: string | null; configured: boolean; testMode: boolean };
	type Overview = { days: number; includeTest: boolean; totals: Record<string, number | null>; series: Record<string, number | string>[]; definitions: Record<string, string> };
	type Ops = { activeRooms: number; stalledExports: Record<string, unknown>[]; unsettledDays: { date_key: string }[]; upcomingDailies: { date_key: string; prompt: string; status: string; scheduled_by: string; version_id: string }[]; freshness: { lastExportAt: number | null; lastTelemetryAt: number | null }; recentClientErrors: unknown[] };
	type Q = { id: string; prompt: string; options: { text: string }[]; status: string; spoiler: number; topic: string | null; tags: string[]; version_id: string; note: string | null };

	let me = $state<Me | null>(null);
	let tab = $state<'overview' | 'ops' | 'library' | 'daily' | 'featured'>('overview');
	let overview = $state<Overview | null>(null);
	let ops = $state<Ops | null>(null);
	let questions = $state<Q[]>([]);
	let days = $state<{ date_key: string; prompt: string; effectiveStatus: string; attempts: number; version_id: string; scheduled_by: string }[]>([]);
	let featured = $state<{ slot: string; version_id: string | null; note: string | null }[]>([]);
	let error = $state('');
	let includeTest = $state(false);
	let filter = $state('');
	let newQ = $state({ prompt: '', options: '', topic: '', tags: '' });
	let editing = $state<Q | null>(null);
	let editV = $state({ prompt: '', options: '', note: '' });
	let schedule = $state({ date: '', versionId: '' });
	let feat = $state({ slot: 'hero', versionId: '', note: '' });

	const fmt = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : 'never');

	onMount(load);

	async function load() {
		try {
			me = await api.get<Me>('/api/admin/me');
			if (me.admin) await loadTab();
		} catch (e) {
			error = friendlyError(e);
		}
	}
	async function loadTab() {
		error = '';
		try {
			if (tab === 'overview') overview = await api.get<Overview>(`/api/admin/overview?days=14&includeTest=${includeTest ? 1 : 0}`);
			if (tab === 'ops') ops = await api.get<Ops>('/api/admin/ops');
			if (tab === 'library') questions = (await api.get<{ questions: Q[] }>('/api/admin/questions')).questions;
			if (tab === 'daily') days = (await api.get<{ days: typeof days }>('/api/admin/daily')).days;
			if (tab === 'featured') featured = (await api.get<{ slots: typeof featured }>('/api/admin/featured')).slots;
		} catch (e) {
			error = friendlyError(e);
		}
	}
	function go(t: typeof tab) {
		tab = t;
		void loadTab();
	}
	async function act(fn: () => Promise<unknown>) {
		error = '';
		try {
			await fn();
			await loadTab();
		} catch (e) {
			error = friendlyError(e);
		}
	}
	const split = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
	const visible = $derived(questions.filter((q) => !filter || q.prompt.toLowerCase().includes(filter.toLowerCase()) || q.id.includes(filter)));
</script>

<svelte:head><title>Admin · Settle It</title></svelte:head>
<main class="page page-wide">
	<TopBar />
	{#if !me}
		<p class="muted pulse">Checking access…</p>
	{:else if !me.admin}
		<div class="card stack" style="max-width:420px">
			<h2>Admin sign-in</h2>
			{#if me.configured}
				<a class="btn primary" href="/api/admin/login">Sign in with GitHub</a>
				<p class="dim tiny">Only GitHub logins listed in ADMIN_GITHUB_LOGINS get in. Everyone else sees this page and nothing more.</p>
			{:else}
				<p class="muted small">GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the API Worker.</p>
			{/if}
		</div>
	{:else}
		<div class="row spread">
			<div><span class="eyebrow">Admin · {me.admin}</span><h1>Overview</h1></div>
			<div class="row">
				<button class="btn compact" class:primary={me.testMode} onclick={() => act(async () => { await api.post('/api/admin/test-mode', { enabled: !me!.testMode }); me = await api.get<Me>('/api/admin/me'); })}>{me.testMode ? 'Test mode ON' : 'Test mode off'}</button>
				<button class="btn ghost compact" onclick={() => act(async () => { await api.post('/api/admin/logout'); me = await api.get<Me>('/api/admin/me'); })}>Sign out</button>
			</div>
		</div>
		<nav class="row tabs">
			{#each ['overview', 'ops', 'library', 'daily', 'featured'] as t}
				<button class="chip" class:on={tab === t} onclick={() => go(t as typeof tab)}>{t}</button>
			{/each}
		</nav>
		{#if error}<p class="error">{error}</p>{/if}

		{#if tab === 'overview' && overview}
			<div class="stack">
				<label class="row small muted"><input type="checkbox" bind:checked={includeTest} onchange={loadTab} /> Include test traffic (preview, owner test mode)</label>
				<div class="grid">
					{#each [['Visitors', overview.totals.visitors], ['Starters', overview.totals.starters], ['Rounds completed', overview.totals.roundsCompleted], ['Sessions with a round', overview.totals.sessionsWithRound], ['Daily submissions', overview.totals.dailySubmitted], ['Resume attempts', overview.totals.resumeAttempted], ['Resume failures', overview.totals.resumeFailed], ['Resumes ≤3s', overview.totals.resumeUnder3sPercent === null ? '—' : `${overview.totals.resumeUnder3sPercent}% of ${overview.totals.resumeSample}`]] as [label, value]}
						<div class="card"><span class="eyebrow">{label}</span><h2>{value ?? 0}</h2></div>
					{/each}
				</div>
				<div class="card" style="overflow:auto">
					<table class="table">
						<thead><tr><th>Day</th><th class="num">Visitors</th><th class="num">Starters</th><th class="num">Rounds</th><th class="num">Sessions</th><th class="num">Daily</th><th class="num">Graded</th><th class="num">Returning</th><th class="num">Resume ok/fail</th></tr></thead>
						<tbody>
							{#each overview.series as r}
								<tr><td>{r.day}</td><td class="num">{r.visitors}</td><td class="num">{r.starters}</td><td class="num">{r.roundsCompleted}</td><td class="num">{r.sessionsWithRound}</td><td class="num">{r.dailySubmitted}</td><td class="num">{r.dailyGraded}/{r.dailyUngraded}</td><td class="num">{r.returning}</td><td class="num">{r.resumeSucceeded}/{r.resumeFailed}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="card stack small">
					{#each Object.entries(overview.definitions) as [k, v]}<p><strong>{k}</strong> <span class="muted">{v}</span></p>{/each}
				</div>
			</div>

		{:else if tab === 'ops' && ops}
			<div class="stack">
				<div class="grid">
					<div class="card"><span class="eyebrow">Active rooms (3h)</span><h2>{ops.activeRooms}</h2></div>
					<div class="card"><span class="eyebrow">Stalled exports</span><h2 class:warn={ops.stalledExports.length > 0}>{ops.stalledExports.length}</h2></div>
					<div class="card"><span class="eyebrow">Unsettled days</span><h2 class:warn={ops.unsettledDays.length > 0}>{ops.unsettledDays.length}</h2></div>
					<div class="card"><span class="eyebrow">Last export</span><p class="small">{fmt(ops.freshness.lastExportAt)}</p></div>
					<div class="card"><span class="eyebrow">Last telemetry</span><p class="small">{fmt(ops.freshness.lastTelemetryAt)}</p></div>
				</div>
				<button class="btn compact" onclick={() => act(() => api.post('/api/admin/maintenance'))}>Run maintenance now</button>
				{#if ops.stalledExports.length}<div class="card"><pre class="tiny">{JSON.stringify(ops.stalledExports, null, 2)}</pre></div>{/if}
				<div class="card stack"><span class="eyebrow">Upcoming dailies</span>
					{#each ops.upcomingDailies as d}<div class="row spread small"><span>{d.date_key} · {d.prompt}</span><span class="dim">{d.status} · {d.scheduled_by}</span></div>{/each}
				</div>
				{#if ops.recentClientErrors.length}<div class="card"><span class="eyebrow">Recent client errors</span><pre class="tiny">{JSON.stringify(ops.recentClientErrors, null, 2)}</pre></div>{/if}
			</div>

		{:else if tab === 'library'}
			<div class="stack">
				<div class="card stack">
					<h3>New question</h3>
					<input class="input" bind:value={newQ.prompt} placeholder="Prompt" maxlength="140" />
					<textarea class="input" bind:value={newQ.options} placeholder="Options, one per line (2–4)" rows="3"></textarea>
					<div class="row"><input class="input" bind:value={newQ.topic} placeholder="topic (gaming…)" /><input class="input" bind:value={newQ.tags} placeholder="tags, comma separated" /></div>
					<button class="btn compact" onclick={() => act(async () => { await api.post('/api/admin/questions', { prompt: newQ.prompt, options: split(newQ.options), topic: newQ.topic, tags: split(newQ.tags) }); newQ = { prompt: '', options: '', topic: '', tags: '' }; })}>Add</button>
				</div>
				<input class="input" bind:value={filter} placeholder="Filter by text or id" />
				<div class="card" style="overflow:auto">
					<table class="table">
						<thead><tr><th>Id</th><th>Prompt</th><th>Options</th><th>Status</th><th></th></tr></thead>
						<tbody>
							{#each visible as q}
								<tr>
									<td>{q.id}<br /><span class="dim tiny">{q.version_id}{q.spoiler ? ' · spoiler' : ''}</span></td>
									<td>{q.prompt}<br /><span class="dim tiny">{q.topic ?? ''} {q.tags.join(' ')}</span></td>
									<td class="small">{q.options.map((o) => o.text).join(' / ')}</td>
									<td>
										<select class="input" value={q.status} onchange={(e) => act(() => api.patch(`/api/admin/questions/${q.id}`, { status: e.currentTarget.value }))}>
											{#each ['approved', 'retired', 'excluded'] as s}<option value={s}>{s}</option>{/each}
										</select>
										<label class="tiny row"><input type="checkbox" checked={!!q.spoiler} onchange={(e) => act(() => api.patch(`/api/admin/questions/${q.id}`, { spoiler: e.currentTarget.checked }))} /> spoiler</label>
									</td>
									<td><button class="btn ghost compact" onclick={() => { editing = q; editV = { prompt: q.prompt, options: q.options.map((o) => o.text).join('\n'), note: '' }; }}>New version</button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if editing}
					<div class="card stack">
						<h3>New version of {editing.id}</h3>
						<p class="dim tiny">Active versions are immutable. A new version starts fresh statistics and never rewrites a running daily ballot.</p>
						<input class="input" bind:value={editV.prompt} maxlength="140" />
						<textarea class="input" bind:value={editV.options} rows="4"></textarea>
						<input class="input" bind:value={editV.note} placeholder="Why this version exists (required)" />
						<div class="row"><button class="btn compact primary" onclick={() => act(async () => { await api.post(`/api/admin/questions/${editing!.id}/version`, { prompt: editV.prompt, options: split(editV.options), note: editV.note }); editing = null; })}>Create version</button><button class="btn ghost compact" onclick={() => (editing = null)}>Cancel</button></div>
					</div>
				{/if}
			</div>

		{:else if tab === 'daily'}
			<div class="stack">
				<div class="card stack">
					<h3>Schedule a future day</h3>
					<div class="row"><input class="input" type="date" bind:value={schedule.date} /><input class="input" bind:value={schedule.versionId} placeholder="version id e.g. q010v1" /></div>
					<button class="btn compact" onclick={() => act(() => api.put(`/api/admin/daily/${schedule.date}`, { versionId: schedule.versionId }))}>Schedule</button>
					<p class="dim tiny">Days without a manual pick are filled automatically, four days ahead, avoiding repeats within 60 days.</p>
				</div>
				<div class="card" style="overflow:auto">
					<table class="table">
						<thead><tr><th>Day</th><th>Question</th><th>Status</th><th class="num">Attempts</th><th></th></tr></thead>
						<tbody>
							{#each days as d}
								<tr>
									<td>{d.date_key}</td><td>{d.prompt}<br /><span class="dim tiny">{d.version_id} · {d.scheduled_by}</span></td><td>{d.effectiveStatus}</td><td class="num">{d.attempts}</td>
									<td class="row">
										{#if d.effectiveStatus === 'closed'}<button class="btn compact" onclick={() => act(() => api.post(`/api/admin/daily/${d.date_key}/settle`))}>Settle</button>{/if}
										{#if d.effectiveStatus === 'settled'}<button class="btn ghost compact" onclick={() => { const c = prompt('Correction note (re-runs settlement as a new result version):'); if (c) void act(() => api.post(`/api/admin/daily/${d.date_key}/settle`, { correction: c })); }}>Correct</button>{/if}
										{#if d.effectiveStatus !== 'void'}<button class="btn ghost compact danger" onclick={() => { const r = prompt('Void this day? Reason:'); if (r) void act(() => api.post(`/api/admin/daily/${d.date_key}/void`, { reason: r })); }}>Void</button>{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

		{:else if tab === 'featured'}
			<div class="stack">
				<div class="card stack">
					<h3>Featured homepage card</h3>
					<div class="row"><input class="input" bind:value={feat.slot} placeholder="slot" /><input class="input" bind:value={feat.versionId} placeholder="version id (blank clears)" /><input class="input" bind:value={feat.note} placeholder="note" /></div>
					<button class="btn compact" onclick={() => act(() => api.put('/api/admin/featured', { slot: feat.slot, versionId: feat.versionId || null, note: feat.note }))}>Save</button>
				</div>
				<div class="card stack small">{#each featured as f}<div class="row spread"><span>{f.slot}</span><span class="muted">{f.version_id ?? '—'} {f.note ?? ''}</span></div>{/each}{#if !featured.length}<p class="muted">No featured cards.</p>{/if}</div>
			</div>
		{/if}
	{/if}
</main>

<style>
	.tabs { margin: 0.75rem 0; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.5rem; }
	.warn { color: var(--error); }
	pre { white-space: pre-wrap; word-break: break-all; margin: 0; }
</style>
