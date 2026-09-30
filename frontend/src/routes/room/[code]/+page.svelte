<script lang="ts">
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { CATEGORY_PRESETS } from '@settleit/content';
	import { describeOutcome, majorityThreshold, type RecapView, type RoundView } from '@settleit/core';
	import { api, friendlyError } from '$lib/api';
	import { loadPrefs, savePrefs } from '$lib/prefs';
	import { RoomClient } from '$lib/roomClient.svelte';
	import TopBar from '$lib/components/TopBar.svelte';

	const code = page.params.code!.toUpperCase();
	const client = new RoomClient(code);

	let nickname = $state('');
	let joinError = $state('');
	let joining = $state(false);
	let copied = $state(false);
	let showRecap = $state(false);
	let recap = $state<RecapView | null>(null);
	let writeInText = $state('');
	let showWriteIn = $state(false);
	let showCustom = $state(false);
	let customPrompt = $state('');
	let customOptions = $state(['', '', '', '']);
	let showSettings = $state(false);

	const snap = $derived(client.snapshot);
	const round = $derived(snap?.round ?? null);
	const me = $derived(snap?.members.find((m) => m.actorId === snap?.me.actorId) ?? null);
	const seconds = $derived(client.clock.secondsUntil(round?.deadline));
	const iAmEligible = $derived(!!round && !!snap && round.eligible.includes(snap.me.actorId));
	const activeCount = $derived(snap?.members.filter((m) => m.presence === 'active').length ?? 0);
	const readyCount = $derived(snap?.members.filter((m) => m.ready && m.presence === 'active').length ?? 0);
	const voters = $derived(round ? Object.keys(round.phase === 'vote' ? {} : {}).length : 0);
	const initialVoterCount = $derived(round?.initialOutcome?.total ?? 0);
	const sendingVote = $derived(client.pending?.type === 'vote' || client.pending?.type === 'write_in');
	const nameOf = (actorId: string) => snap?.members.find((m) => m.actorId === actorId)?.nickname ?? 'Someone';

	onMount(async () => {
		nickname = loadPrefs().nickname;
		await client.start();
	});
	onDestroy(() => client.stop());

	async function join() {
		if (!nickname.trim()) return (joinError = 'Pick a nickname first.');
		joining = true;
		joinError = '';
		try {
			await api.rooms.join(code, nickname.trim());
			savePrefs({ nickname: nickname.trim(), lastRoom: code });
			client.notInRoom = false;
			client.gone = null;
			await client.start();
		} catch (e) {
			joinError = friendlyError(e);
		} finally {
			joining = false;
		}
	}

	function copyLink() {
		navigator.clipboard?.writeText(`${location.origin}/join/${code}`).then(() => {
			copied = true;
			setTimeout(() => (copied = false), 2000);
		});
	}

	async function share() {
		const url = `${location.origin}/join/${code}`;
		if (navigator.share) {
			try {
				await navigator.share({ title: 'Settle It', text: `Join my room ${code}`, url });
				return;
			} catch {
				/* cancelled */
			}
		}
		copyLink();
	}

	async function openRecap() {
		showRecap = true;
		try {
			recap = (await api.rooms.recap(code)).recap;
		} catch (e) {
			client.showNote(friendlyError(e));
		}
	}

	async function submitWriteIn(e: Event) {
		e.preventDefault();
		const t = writeInText.trim();
		if (!t) return;
		writeInText = '';
		showWriteIn = false;
		await client.writeIn(t);
	}

	async function submitCustom(e: Event) {
		e.preventDefault();
		const opts = customOptions.map((o) => o.trim()).filter(Boolean);
		const r = await client.queueCustom(customPrompt.trim(), opts);
		if (r?.ok) {
			customPrompt = '';
			customOptions = ['', '', '', ''];
			showCustom = false;
			client.showNote('Queued for this room.');
		}
	}

	function toggleCategory(id: string) {
		if (!snap) return;
		let next = id === 'mix' ? [] : snap.categories.includes(id) ? snap.categories.filter((c) => c !== id) : [...snap.categories, id];
		void client.setCategories(next, snap.excludeSpoilers);
	}

	function countFor(r: RoundView, optionId: string) {
		return r.votes.filter((v) => v.optionId === optionId).length;
	}
	function namesFor(r: RoundView, optionId: string) {
		return r.votes.filter((v) => v.optionId === optionId).map((v) => v.nickname);
	}
	const phaseLabel: Record<string, string> = { vote: 'Vote', discuss: 'Discuss', revote: 'Revote', verdict: 'Verdict' };
</script>

<svelte:head><title>Room {code} · Settle It</title></svelte:head>

<main class="page">
	<TopBar />

	{#if client.gone === 'not_found'}
		<div class="card stack center enter">
			<h2>Room not found</h2>
			<p class="muted">Check the code, or <a href="/">start a new room</a>.</p>
		</div>
	{:else if client.notInRoom}
		<form class="card stack enter" onsubmit={(e) => { e.preventDefault(); join(); }}>
			<span class="eyebrow">Joining room</span>
			<h2 class="code">{code}</h2>
			<label class="field">Your nickname
				<input class="input" bind:value={nickname} maxlength="20" placeholder="e.g. Alex" autocomplete="nickname" />
			</label>
			{#if joinError}<p class="error">{joinError}</p>{/if}
			<button class="btn primary" type="submit" disabled={joining}>{joining ? 'Joining…' : 'Join'}</button>
		</form>
	{:else if client.fatal}
		<div class="card stack center"><h2>Something broke</h2><p class="muted">{client.fatal}</p><button class="btn" onclick={() => location.reload()}>Reload</button></div>
	{:else if !snap}
		<div class="card center pulse"><p class="muted">Rejoining {code}…</p></div>
	{:else}
		<!-- header -->
		<div class="row spread head">
			<div>
				<span class="eyebrow">Room</span>
				<div class="row"><h2 class="code">{snap.code}</h2>
					<button class="btn ghost compact" onclick={share}>{copied ? 'Copied!' : 'Invite'}</button>
				</div>
			</div>
			<div class="row" style="gap:0.35rem">
				<span class="chip" class:ok={client.connection === 'live'} class:info={client.connection === 'polling' || client.connection === 'connecting'} class:warn={client.connection === 'offline'}>
					{client.connection === 'live' ? 'Live' : client.connection === 'polling' ? 'Syncing' : client.connection === 'offline' ? 'Offline' : 'Connecting'}
				</span>
				<button class="btn ghost compact" onclick={openRecap}>Recap</button>
			</div>
		</div>

		{#if client.note}<p class="notice enter">{client.note}</p>{/if}

		{#if snap.status === 'expired'}
			<div class="card stack center enter">
				<h2>This room has ended</h2>
				<p class="muted">Rooms close after half an hour with nobody around. Your recap is still here.</p>
				<button class="btn" onclick={openRecap}>Open recap</button>
				<a class="btn primary" href="/">Start another</a>
			</div>

		{:else if snap.status === 'lobby'}
			<div class="card stack enter">
				<h3>Waiting to start</h3>
				<p class="muted small">Starts as soon as two people are ready. {snap.members.length < 2 ? 'Share the code to bring friends in.' : ''}</p>
				<ul class="members">
					{#each snap.members as m}
						<li class="row spread">
							<span class:dim={m.presence === 'away'}>{m.nickname}{m.actorId === snap.me.actorId ? ' (you)' : ''}</span>
							<span class="chip" class:ok={m.ready}>{m.ready ? 'Ready' : m.presence === 'away' ? 'Away' : 'Not ready'}</span>
						</li>
					{/each}
				</ul>
				<button class="btn" class:primary={!me?.ready} onclick={() => client.setReady(!me?.ready)}>{me?.ready ? "I'm not ready" : "I'm ready"}</button>
				<p class="dim tiny">{readyCount} of {activeCount} here are ready.</p>
			</div>

			<div class="card stack">
				<button class="btn ghost compact" onclick={() => (showSettings = !showSettings)}>{showSettings ? 'Hide' : 'Question mix'} · {snap.categories.length ? snap.categories.map((c) => CATEGORY_PRESETS.find((p) => p.id === c)?.label ?? c).join(', ') : 'Everything'}{snap.excludeSpoilers ? ' · no spoilers' : ''}</button>
				{#if showSettings}
					<div class="row">
						{#each CATEGORY_PRESETS as c}
							<button type="button" class="chip" class:on={c.id === 'mix' ? snap.categories.length === 0 : snap.categories.includes(c.id)} onclick={() => toggleCategory(c.id)}>{c.label}</button>
						{/each}
					</div>
					<label class="row small muted"><input type="checkbox" checked={snap.excludeSpoilers} onchange={(e) => client.setCategories(snap!.categories, e.currentTarget.checked)} /> Skip questions with spoilers</label>
					<p class="dim tiny">Anyone in the room can change this before the first question.</p>
				{/if}
			</div>

		{:else if snap.status === 'paused' || !round}
			<div class="card stack center enter">
				<h3>Waiting for players</h3>
				<p class="muted small">Questions resume when at least two people are here. {snap.roundsCompleted} settled so far.</p>
				<ul class="members left">
					{#each snap.members as m}
						<li class="row spread"><span class:dim={m.presence === 'away'}>{m.nickname}</span><span class="chip" class:ok={m.presence === 'active'}>{m.presence === 'active' ? 'Here' : 'Away'}</span></li>
					{/each}
				</ul>
				{#if snap.expiresAt}<p class="dim tiny">Room closes in {Math.max(0, Math.round((snap.expiresAt - client.clock.serverNow()) / 60000))} min if nobody returns.</p>{/if}
			</div>

		{:else}
			<!-- round -->
			<div class="card raised stack enter round" data-phase={round.phase}>
				<div class="row spread">
					<span class="eyebrow">Q{round.roundNumber} · {phaseLabel[round.phase]}</span>
					<span class="timer" class:urgent={seconds <= 5 && round.phase !== 'verdict'}>{seconds}s</span>
				</div>
				<h2 class="prompt">{round.ballot.prompt}</h2>
				{#if round.ballot.source === 'custom'}<span class="chip">Room question · stays private</span>{/if}
				{#if !iAmEligible}
					<p class="notice">You're in. You'll join on the next question.</p>
				{/if}

				{#if round.phase === 'vote' || round.phase === 'revote'}
					{#if round.phase === 'revote'}<p class="muted small">Revote: change your mind or stand your ground. Anyone who stays quiet keeps their first answer.</p>{/if}
					<div class="stack options">
						{#each round.ballot.options as o}
							{@const mine = round.myVote?.optionId === o.id}
							{@const names = namesFor(round, o.id)}
							<button class="btn option" class:primary={mine} disabled={!iAmEligible} onclick={() => client.vote(o.id)} aria-pressed={mine}>
								<span class="opt-text">{o.text}{o.writeIn ? ' ✎' : ''}</span>
								<span class="opt-meta">{#if mine}{sendingVote ? 'Sending…' : 'Saved'}{:else if names.length}{names.length}{/if}</span>
								{#if names.length}<span class="opt-names">{names.join(', ')}</span>{/if}
							</button>
						{/each}
					</div>
					{#if iAmEligible && round.phase === 'vote' && round.ballot.options.filter((o) => o.writeIn).length < 2}
						{#if showWriteIn}
							<form class="row" onsubmit={submitWriteIn}>
								<input class="input" bind:value={writeInText} maxlength="40" placeholder="Your own answer" />
								<button class="btn compact" type="submit">Add</button>
							</form>
							<p class="dim tiny">Write-ins make this a room-only question; it won't count toward public totals.</p>
						{:else}
							<button class="btn ghost compact" onclick={() => (showWriteIn = true)}>+ Write in an answer</button>
						{/if}
					{/if}
					<p class="dim tiny">{round.votes.length} of {round.eligible.length} answered. {round.phase === 'vote' ? 'Closes early when everyone has.' : ''}</p>

				{:else if round.phase === 'discuss'}
					{@const outcome = round.initialOutcome!}
					<p class="muted">{describeOutcome(outcome, round.ballot.options)} Talk it out.</p>
					<div class="stack">
						{#each round.ballot.options as o}
							{@const n = outcome.counts[o.id] ?? 0}
							<div class="tally">
								<div class="row spread"><span class="opt-text" class:lead={outcome.leaders.includes(o.id)}>{o.text}</span><span class="dim small">{n}</span></div>
								<div class="bar-track"><div class="bar-fill" class:win={outcome.leaders.includes(o.id)} class:dim={!outcome.leaders.includes(o.id)} style={`width:${outcome.total ? (n / outcome.total) * 100 : 0}%`}></div></div>
								{#if namesFor(round, o.id).length}<span class="opt-names">{namesFor(round, o.id).join(', ')}</span>{/if}
							</div>
						{/each}
					</div>
					{#if iAmEligible && round.myVote}
						<div class="row actions">
							<button class="btn compact" disabled={round.revoteUsed || round.revoteRequests.includes(snap.me.actorId)} onclick={() => client.requestRevote()}>Revote {round.revoteRequests.length}/{majorityThreshold(initialVoterCount)}</button>
							<button class="btn compact" disabled={round.extensionUsed || round.moreTimeRequests.includes(snap.me.actorId)} onclick={() => client.requestMoreTime()}>More time {round.moreTimeRequests.length}/{majorityThreshold(initialVoterCount)}</button>
							<button class="btn compact ghost" disabled={round.skipRequests.includes(snap.me.actorId)} onclick={() => client.requestSkip()}>Skip {round.skipRequests.length}/{majorityThreshold(initialVoterCount)}</button>
						</div>
						<p class="dim tiny">More than half of the voters can trigger each of these, once per question.</p>
					{/if}

				{:else if round.phase === 'verdict' && round.result}
					{@const res = round.result}
					{#if res.skipped}
						<p class="muted">Skipped by the room.</p>
					{:else if res.empty}
						<p class="muted">Nobody voted. No verdict.</p>
					{:else}
						<p class="verdict">{describeOutcome(res.final, round.ballot.options)}</p>
						<div class="stack">
							{#each round.ballot.options as o}
								{@const n = res.final.counts[o.id] ?? 0}
								{@const names = Object.entries(res.finalVotes).filter(([, v]) => v.optionId === o.id).map(([a]) => nameOf(a))}
								<div class="tally">
									<div class="row spread"><span class="opt-text" class:lead={res.final.leaders.includes(o.id)}>{o.text}</span><span class="dim small">{n}{#if res.revoteHappened && (res.initial.counts[o.id] ?? 0) !== n} <span class="tiny">(was {res.initial.counts[o.id] ?? 0})</span>{/if}</span></div>
									<div class="bar-track"><div class="bar-fill" class:win={res.final.leaders.includes(o.id)} class:dim={!res.final.leaders.includes(o.id)} style={`width:${res.final.total ? (n / res.final.total) * 100 : 0}%`}></div></div>
									{#if names.length}<span class="opt-names">{names.join(', ')}</span>{/if}
								</div>
							{/each}
						</div>
						{#if res.changedMinds.length}
							<p class="notice">Plot twist: {res.changedMinds.map(nameOf).join(', ')} switched after the argument.</p>
						{/if}
						<p class="dim tiny">{res.final.total} of {round.eligible.length} eligible voted.</p>
					{/if}
					<p class="dim tiny">Next question in {seconds}s{activeCount < 2 ? ' — if someone else is still here' : ''}.</p>
				{/if}
			</div>

			<div class="card stack">
				<div class="row spread">
					<span class="small muted">{snap.members.length} in the room · {snap.roundsCompleted} settled</span>
					<button class="btn ghost compact" onclick={() => (showCustom = !showCustom)}>{showCustom ? 'Close' : 'Add a question'}</button>
				</div>
				{#if showCustom}
					<form class="stack" onsubmit={submitCustom}>
						<input class="input" bind:value={customPrompt} maxlength="140" placeholder="Your question" />
						{#each customOptions as _, i}
							<input class="input" bind:value={customOptions[i]} maxlength="40" placeholder={`Answer ${i + 1}${i > 1 ? ' (optional)' : ''}`} />
						{/each}
						<button class="btn compact" type="submit">Queue it for this room</button>
						<p class="dim tiny">Custom questions stay private to this room. {snap.customQueueLength} waiting.</p>
					</form>
				{/if}
				<ul class="members compact">
					{#each snap.members as m}
						<li><span class:dim={m.presence === 'away'}>{m.nickname}</span></li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if snap.status !== 'expired'}
			<div class="row spread foot">
				<a class="btn ghost compact" href="/" onclick={() => client.leave()}>Leave room</a>
				<span class="dim tiny">Lock your phone whenever. Your seat and votes wait for you.</span>
			</div>
		{/if}
	{/if}

	{#if showRecap}
		<div class="sheet" role="dialog" aria-modal="true">
			<div class="sheet-inner stack">
				<div class="row spread"><h2>Recap</h2><button class="btn ghost compact" onclick={() => (showRecap = false)}>Close</button></div>
				{#if !recap}
					<p class="muted pulse">Loading…</p>
				{:else}
					{#if recap.awards.length}
						<div class="stack">
							{#each recap.awards as a}
								<div class="card">
									<span class="eyebrow">{a.title}</span>
									<p><strong>{a.recipients.length ? a.recipients.map((r) => recap!.members.find((m) => m.actorId === r)?.nickname ?? 'Someone').join(' & ') : recap.rounds.find((r) => r.roundId === a.roundId)?.prompt ?? ''}</strong></p>
									<p class="muted small">{a.description}</p>
								</div>
							{/each}
						</div>
					{:else}
						<p class="muted small">Awards appear after a few settled questions.</p>
					{/if}
					{#each [...recap.rounds].reverse() as r}
						<div class="card stack">
							<span class="eyebrow">Q{r.roundNumber}</span>
							<h3>{r.prompt}</h3>
							{#if r.skipped}<p class="dim small">Skipped</p>{:else if r.empty}<p class="dim small">No votes</p>{:else}
								<p class="muted small">{describeOutcome(r.final, r.options)}</p>
								{#each r.options as o}
									{@const n = r.final.counts[o.id] ?? 0}
									<div class="row spread small"><span class:lead={r.final.leaders.includes(o.id)}>{o.text}</span><span class="dim">{n}</span></div>
								{/each}
							{/if}
						</div>
					{/each}
					{#if recap.rounds.length === 0}<p class="muted">Nothing settled yet.</p>{/if}
				{/if}
			</div>
		</div>
	{/if}
</main>

<style>
	.head { margin-bottom: 0.75rem; }
	.code { letter-spacing: 0.08em; }
	.members { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
	.members.left { text-align: left; }
	.members.compact { flex-direction: row; flex-wrap: wrap; gap: 0.4rem 0.8rem; font-size: 0.85rem; color: var(--text-muted); }
	.round { margin-bottom: 0.75rem; }
	.prompt { font-size: 1.5rem; line-height: 1.25; }
	.timer { font-variant-numeric: tabular-nums; font-weight: 900; font-size: 1.1rem; color: var(--text-muted); }
	.timer.urgent { color: var(--error); }
	.options { gap: 0.6rem; }
	.option { display: grid; grid-template-columns: 1fr auto; gap: 0.15rem 0.5rem; text-align: left; min-height: 60px; align-items: center; }
	.opt-text { font-weight: 800; font-size: 1.05rem; }
	.opt-text.lead { color: var(--success); }
	.opt-meta { font-size: 0.8rem; opacity: 0.85; }
	.opt-names { grid-column: 1 / -1; font-size: 0.78rem; font-weight: 600; opacity: 0.8; }
	.tally { display: flex; flex-direction: column; gap: 0.3rem; }
	.actions .btn { flex: 1; }
	.verdict { font-size: 1.15rem; font-weight: 800; }
	.foot { margin-top: 1rem; }
	.sheet { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: flex-end; justify-content: center; z-index: 10; }
	.sheet-inner { background: var(--bg); border-top: 1px solid var(--border); border-radius: 1.25rem 1.25rem 0 0; width: 100%; max-width: 560px; max-height: 88vh; overflow: auto; padding: 1rem 1rem 2rem; }
	@media (min-width: 600px) { .sheet { align-items: center; } .sheet-inner { border-radius: 1.25rem; border: 1px solid var(--border); } }
</style>
