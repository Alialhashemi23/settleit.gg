<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { api, friendlyError } from '$lib/api';
	import type { DailyView } from '$lib/daily';
	import DailyCard from '$lib/components/DailyCard.svelte';
	import TopBar from '$lib/components/TopBar.svelte';

	let view = $state<DailyView | null>(null);
	let error = $state('');
	onMount(async () => {
		try {
			view = await api.get<DailyView>(`/api/daily/${page.params.date}`);
		} catch (e) {
			error = friendlyError(e);
		}
	});
</script>

<svelte:head><title>Daily {page.params.date} · Settle It</title></svelte:head>
<main class="page">
	<TopBar />
	<div class="stack">
		<a class="small" href="/daily">← Today's challenge</a>
		{#if error}<p class="error">{error}</p>{:else if view}<DailyCard bind:view />{:else}<div class="card center pulse"><p class="muted">Loading…</p></div>{/if}
	</div>
</main>
