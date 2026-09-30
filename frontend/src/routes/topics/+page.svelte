<script lang="ts">
	import { onMount } from 'svelte';
	import { api, friendlyError } from '$lib/api';
	import TopBar from '$lib/components/TopBar.svelte';
	type Topics = { window: { days: number }; minSample: number; topics: { versionId: string; prompt: string; topic: string | null; total: number; published: boolean }[] };
	let data = $state<Topics | null>(null);
	let error = $state('');
	onMount(async () => {
		try {
			data = await api.get<Topics>('/api/stats/topics');
		} catch (e) {
			error = friendlyError(e);
		}
	});
</script>

<svelte:head><title>Topics · Settle It</title></svelte:head>
<main class="page">
	<TopBar />
	<div class="stack">
		<div><span class="eyebrow">Topics</span><h1>Most debated</h1><p class="muted small">Ranked by distinct participants in the last {data?.window.days ?? 30} days. Percentages appear once {data?.minSample ?? 20} people have answered.</p></div>
		{#if error}<p class="error">{error}</p>{/if}
		{#if data && data.topics.length === 0}
			<div class="card"><h3>Nothing ranked yet</h3><p class="muted small">Play a room or the daily challenge and check back.</p></div>
		{/if}
		{#if data}
			<ol class="topics">
				{#each data.topics as t, i}
					<li class="card row spread">
						<a href={`/topics/${t.versionId}`}><span class="dim tiny">#{i + 1} · {t.topic ?? 'mixed'}</span><br />{t.prompt}</a>
						<span class="chip" class:ok={t.published}>{t.total} {t.published ? '' : '· small sample'}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</main>

<style>
	.topics { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.topics a { color: var(--text); text-decoration: none; font-weight: 800; }
</style>
