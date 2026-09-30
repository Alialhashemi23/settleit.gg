<script lang="ts">
	import { onMount } from 'svelte';
	import { api, friendlyError } from '$lib/api';
	import type { DailyView } from '$lib/daily';
	import DailyCard from '$lib/components/DailyCard.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { track } from '$lib/telemetry';

	let view = $state<DailyView | null>(null);
	let error = $state('');
	let history = $state<{ date_key: string; prompt: string; option_id: string; prediction: number; score: number | null; grade_status: string | null; challenge_status: string }[]>([]);

	onMount(async () => {
		try {
			view = await api.get<DailyView>('/api/daily');
			track('daily_opened', {}, 'daily');
			const h = await api.get<{ attempts: typeof history }>('/api/daily/history');
			history = h.attempts.filter((a) => view && a.date_key !== view.dateKey);
		} catch (e) {
			error = friendlyError(e);
		}
	});
</script>

<svelte:head><title>Daily challenge · Settle It</title></svelte:head>

<main class="page">
	<TopBar />
	<div class="stack">
		<div>
			<span class="eyebrow">Daily challenge</span>
			<h1>Read the crowd</h1>
			<p class="muted small">One question a day. Pick your answer, predict how many agree, and find out when the day closes.</p>
		</div>
		{#if error}<p class="error">{error}</p>{/if}
		{#if view}
			<DailyCard bind:view />
		{:else if !error}
			<div class="card center pulse"><p class="muted">Loading today's question…</p></div>
		{/if}

		{#if history.length}
			<h3>Your past days</h3>
			<ul class="hist">
				{#each history as h}
					<li class="card row spread">
						<a href={`/daily/${h.date_key}`}><span class="dim tiny">{h.date_key}</span><br />{h.prompt}</a>
						<span class="chip" class:ok={h.grade_status === 'graded'}>{h.grade_status === 'graded' ? `${h.score}/100` : h.challenge_status === 'settled' ? 'ungraded' : 'pending'}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="dim tiny">Your history lives in this browser. <a href="/daily/history">Manage</a></p>
	</div>
</main>

<style>
	.hist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
	.hist a { color: var(--text); text-decoration: none; font-weight: 800; }
</style>
