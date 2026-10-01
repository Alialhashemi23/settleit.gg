<script lang="ts">
	import { api, friendlyError } from '$lib/api';
	import TopBar from '$lib/components/TopBar.svelte';
	let done = $state(false);
	let error = $state('');
	async function reset() {
		if (!confirm('Unlink all daily attempts and public contributions from this browser? Anonymous votes stay in the totals.')) return;
		try {
			await api.del('/api/daily/history');
			done = true;
		} catch (e) {
			error = friendlyError(e);
		}
	}
</script>

<main class="page">
	<TopBar />
	<div class="stack">
		<h1>Your history</h1>
		<p class="muted small">Settle It keeps a guest identity in a cookie so your daily results and room seats survive reloads. There are no accounts yet. Resetting unlinks past attempts and public contributions from this browser; the anonymous counts stay.</p>
		{#if done}<p class="notice">Done. This browser starts fresh.</p>{/if}
		{#if error}<p class="error">{error}</p>{/if}
		<button class="btn danger" onclick={reset} disabled={done}>Reset my history</button>
		<a class="btn ghost" href="/daily">Back</a>
	</div>
</main>
