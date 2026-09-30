<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { api, friendlyError } from '$lib/api';
	import type { DailyView } from '$lib/daily';
	import DailyCard from '$lib/components/DailyCard.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { track } from '$lib/telemetry';

	let view = $state<DailyView | null>(null);
	let error = $state('');
	onMount(async () => {
		try {
			view = await api.get<DailyView>(`/api/daily/share/${page.params.token}`);
			track('share_opened', {}, 'daily');
		} catch (e) {
			error = friendlyError(e);
		}
	});
</script>

<svelte:head><title>A friend challenged you · Settle It</title></svelte:head>
<main class="page">
	<TopBar />
	<div class="stack">
		<div>
			<span class="eyebrow">A friend challenged you</span>
			<h1>Answer first, then compare</h1>
			<p class="muted small">Their pick stays hidden until you've locked in yours.</p>
		</div>
		{#if error}<p class="error">{error}</p>{:else if view}<DailyCard bind:view />{:else}<div class="card center pulse"><p class="muted">Loading…</p></div>{/if}
		<a class="btn ghost" href="/daily">Play today's challenge</a>
	</div>
</main>
