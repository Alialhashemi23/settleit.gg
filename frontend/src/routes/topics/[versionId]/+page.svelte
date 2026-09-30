<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { api, friendlyError } from '$lib/api';
	import TopBar from '$lib/components/TopBar.svelte';
	type Detail = {
		versionId: string; questionId: string; version: number; prompt: string; topic: string | null; tags: string[]; status: string;
		total: number; minSample: number; published: boolean;
		options: { id: string; text: string; count: number; percent: number | null }[];
		sources: Record<string, number>;
		rounds: { played: number; averageVoters: number; changedMinds: number; bothVotes: number; firstAt: number | null; lastAt: number | null } | null;
		versions: { version_id: string; version: number; prompt: string; note: string | null }[];
		dailies: { date_key: string; status: string }[];
		note: string;
	};
	let d = $state<Detail | null>(null);
	let error = $state('');
	onMount(async () => {
		try {
			d = await api.get<Detail>(`/api/stats/topics/${page.params.versionId}`);
		} catch (e) {
			error = friendlyError(e);
		}
	});
	const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString() : '—');
</script>

<svelte:head><title>{d?.prompt ?? 'Topic'} · Settle It</title></svelte:head>
<main class="page">
	<TopBar />
	<div class="stack">
		<a class="small" href="/topics">← All topics</a>
		{#if error}<p class="error">{error}</p>{/if}
		{#if d}
			<div><span class="eyebrow">{d.topic ?? 'mixed'} · version {d.version}{d.status !== 'approved' ? ` · ${d.status}` : ''}</span><h1>{d.prompt}</h1></div>
			<div class="card raised stack">
				<span class="eyebrow">{d.total} participants · {d.published ? 'all time' : `percentages unlock at ${d.minSample}`}</span>
				{#each d.options as o}
					<div class="stack" style="gap:0.25rem">
						<div class="row spread small"><span>{o.text}</span><span class="muted">{o.percent === null ? `${o.count}` : `${o.percent}%`}</span></div>
						<div class="bar-track"><div class="bar-fill" class:dim={!d.published} style={`width:${d.published ? o.percent : 0}%`}></div></div>
					</div>
				{/each}
				{#if !d.published}<p class="dim tiny">Not enough answers to show a split honestly yet.</p>{/if}
			</div>
			<div class="card stack small">
				<div class="row spread"><span class="muted">From group rooms</span><span>{d.sources.group ?? 0}</span></div>
				<div class="row spread"><span class="muted">From daily challenges</span><span>{d.sources.daily ?? 0}</span></div>
				{#if d.rounds}
					<div class="row spread"><span class="muted">Rounds played</span><span>{d.rounds.played} (avg {d.rounds.averageVoters} voters)</span></div>
					{#if d.rounds.bothVotes}<div class="row spread"><span class="muted">Changed minds after revotes</span><span>{d.rounds.changedMinds} of {d.rounds.bothVotes}</span></div>{/if}
					<div class="row spread"><span class="muted">Window</span><span>{date(d.rounds.firstAt)} → {date(d.rounds.lastAt)}</span></div>
				{/if}
				{#if d.dailies.length}<div class="row spread"><span class="muted">Ran as daily</span><span>{d.dailies.map((x) => x.date_key).join(', ')}</span></div>{/if}
				{#if d.versions.length > 1}
					<div class="stack" style="gap:0.2rem"><span class="muted">Versions</span>{#each d.versions as v}<span class="dim tiny">v{v.version}: {v.prompt}{v.note ? ` — ${v.note}` : ''}</span>{/each}</div>
				{/if}
			</div>
			<p class="dim tiny">{d.note}</p>
		{/if}
	</div>
</main>
