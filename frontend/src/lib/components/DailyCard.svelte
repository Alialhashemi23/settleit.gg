<script lang="ts">
	import { api, friendlyError } from '$lib/api';
	import { localTime, pct, type DailyView } from '$lib/daily';

	let { view = $bindable(), submitPath = '/api/daily/submit' }: { view: DailyView; submitPath?: string } = $props();

	let choice = $state<string | null>(null);
	let prediction = $state(50);
	let submitting = $state(false);
	let error = $state('');
	let shareUrl = $state('');
	let sharing = $state(false);

	const q = $derived(view.question);
	const closed = $derived(view.status === 'closed' || view.status === 'settled');
	const myOptionText = $derived(q?.options.find((o) => o.id === view.myAttempt?.optionId)?.text ?? '');

	async function submit(e: Event) {
		e.preventDefault();
		if (!choice) return (error = 'Pick your answer first.');
		submitting = true;
		error = '';
		try {
			const r = await api.post<{ view: DailyView }>(submitPath, { dateKey: view.dateKey, optionId: choice, prediction: Math.round(prediction) });
			view = { ...view, ...r.view, share: view.share };
			if (view.share) view.share = { ...view.share, revealed: true };
		} catch (err) {
			error = friendlyError(err);
		} finally {
			submitting = false;
		}
	}

	async function share() {
		sharing = true;
		try {
			const { token } = await api.post<{ token: string }>(`/api/daily/${view.dateKey}/share`);
			shareUrl = `${location.origin}/daily/share/${token}`;
			if (navigator.share) {
				try {
					await navigator.share({ title: 'Settle It daily', text: `What would you pick? ${q?.prompt ?? ''}`, url: shareUrl });
				} catch {
					/* cancelled */
				}
			} else {
				await navigator.clipboard?.writeText(shareUrl);
			}
		} catch (e) {
			error = friendlyError(e);
		} finally {
			sharing = false;
		}
	}
</script>

{#if !q}
	<div class="card stack center">
		<h3>No challenge today</h3>
		<p class="muted small">{view.voidReason ?? 'Check back after the next rotation.'}</p>
	</div>
{:else}
	<div class="card raised stack enter">
		<div class="row spread">
			<span class="eyebrow">{view.dateKey} · {view.status === 'open' ? `closes ${localTime(view.closesAt)}` : view.status}</span>
			{#if view.status === 'open'}<span class="chip info">Read the Crowd</span>{/if}
		</div>
		<h2>{q.prompt}</h2>

		{#if !view.myAttempt}
			{#if view.status === 'void'}
				<p class="muted">{view.voidReason}</p>
			{:else}
				<form class="stack" onsubmit={submit}>
					<span class="eyebrow">1. Your honest answer</span>
					<div class="stack">
						{#each q.options as o}
							<button type="button" class="btn" class:primary={choice === o.id} onclick={() => (choice = o.id)} aria-pressed={choice === o.id}>{o.text}</button>
						{/each}
					</div>
					<span class="eyebrow">2. What share of today's players will pick the same?</span>
					<div class="row">
						<input type="range" min="0" max="100" step="1" bind:value={prediction} class="range" aria-label="Prediction percent" />
						<span class="pred">{prediction}%</span>
					</div>
					<p class="dim tiny">
						Both lock when you submit. Your score is how close your guess is to the final share among the other players, not whether your opinion "wins".
						{#if closed}This day has closed: answering now unlocks the comparison but won't be scored.{:else}If fewer than {view.minSample} people play, the day ends ungraded, no fake numbers.{/if}
					</p>
					{#if error}<p class="error">{error}</p>{/if}
					<button class="btn primary" type="submit" disabled={submitting || !choice}>{submitting ? 'Locking in…' : 'Lock it in'}</button>
				</form>
			{/if}
		{:else}
			<div class="stack">
				<p><strong>You picked {myOptionText}</strong> and guessed <strong>{view.myAttempt.prediction}%</strong> would agree.{#if !view.myAttempt.eligible} <span class="dim">(after close, unscored)</span>{/if}</p>

				{#if view.share && view.share.revealed && view.share.sharerOptionId}
					<p class="notice">Your friend picked <strong>{q.options.find((o) => o.id === view.share!.sharerOptionId)?.text}</strong>.{view.share.sharerOptionId === view.myAttempt.optionId ? ' Same side!' : ' Argue it out.'}</p>
				{/if}

				{#if view.split}
					<span class="eyebrow">{view.split.provisional ? 'Current split · provisional' : 'Final split'} · {view.split.total} players</span>
					{#each q.options as o}
						{@const n = view.split.counts[o.id] ?? 0}
						<div class="stack" style="gap:0.25rem">
							<div class="row spread small"><span class:lead={o.id === view.myAttempt.optionId}>{o.text}</span><span class="muted">{pct(n, view.split.total)}%</span></div>
							<div class="bar-track"><div class="bar-fill" class:win={o.id === view.myAttempt.optionId} class:dim={o.id !== view.myAttempt.optionId} style={`width:${pct(n, view.split.total)}%`}></div></div>
						</div>
					{/each}
				{:else if view.status === 'open'}
					<p class="muted small">Results unlock after {view.minSample} people answer. {view.sample} so far. Come back when the day closes for your score.</p>
				{:else if view.status === 'settled' && view.grade?.status === 'ungraded'}
					<p class="muted small">Only {view.sample} people played this day, so there's no reliable split and no score. Nothing here is made up.</p>
				{/if}

				{#if view.grade}
					<div class="card">
						{#if view.grade.status === 'graded'}
							<span class="eyebrow">Your score</span>
							<h2>{view.grade.score}/100</h2>
							<p class="muted small">{view.grade.baselineShare}% of the other players picked {myOptionText}. You guessed {view.myAttempt.prediction}%. Score = 100 − 2 × the gap.</p>
						{:else if view.grade.status === 'void'}
							<p class="muted small">This day's result was withdrawn, so scores are void.</p>
						{:else if view.grade.status === 'late'}
							<p class="muted small">Late answer: shown for comparison, not scored.</p>
						{:else}
							<p class="muted small">Ungraded: not enough other players to compare against honestly.</p>
						{/if}
					</div>
				{:else if view.status === 'open'}
					<p class="dim tiny">Scores arrive after close at {localTime(view.closesAt)}.</p>
				{/if}

				{#if !view.share || view.share.isOwner}
					<button class="btn" onclick={share} disabled={sharing}>{sharing ? 'Making link…' : 'Challenge a friend'}</button>
					{#if shareUrl}<p class="dim tiny">Link copied. They answer first, then see your pick.</p>{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.range { flex: 1; accent-color: var(--accent); }
	.pred { font-weight: 900; font-size: 1.3rem; min-width: 3.5rem; text-align: right; font-variant-numeric: tabular-nums; }
	.lead { color: var(--success); font-weight: 800; }
</style>
