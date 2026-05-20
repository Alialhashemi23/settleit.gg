<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { connect } from "$lib/socket";
  import {
    players, currentQuestion, voteCounts, freetextResponses,
    hasVoted, questionEnded, hostDisconnected, roomEnded, resetQuestionState,
    questionHistory,
  } from "$lib/stores";

  const code = $page.params.code;
  let socket = connect();
  let selectedOption: string | null = $state(null);
  let freetextInput = $state("");
  let submitted = $state(false);
  let hostWaitSeconds = $state(0);
  let hostTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    socket.on("room:updated", ({ players: pl }: any) => players.set(pl));

    socket.on("question:new", ({ question }: any) => {
      currentQuestion.set(question);
      voteCounts.set(question.options ? Object.fromEntries(question.options.map((o: string) => [o, 0])) : {});
      freetextResponses.set([]);
      hasVoted.set(false);
      questionEnded.set(false);
      selectedOption = null;
      freetextInput = "";
      submitted = false;
    });

    socket.on("response:update", ({ counts, responses }: any) => {
      if (counts && Object.keys(counts).length) voteCounts.set(counts);
      if (responses?.length) freetextResponses.set(responses);
    });

    socket.on("question:ended", ({ final }: any) => {
      questionEnded.set(true);
      if (final.counts) voteCounts.set(final.counts);
      if (final.responses) freetextResponses.set(final.responses);
      const q = get(currentQuestion);
      if (q) {
        questionHistory.update(h => [...h, {
          question: q,
          counts: final.counts,
          responses: final.responses,
        }]);
      }
    });

    socket.on("host:disconnected", ({ deadline }: { deadline: number }) => {
      hostDisconnected.set({ deadline });
      hostWaitSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      hostTimer = setInterval(() => {
        hostWaitSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        if (hostWaitSeconds <= 0 && hostTimer) clearInterval(hostTimer);
      }, 1000);
    });

    socket.on("room:ended", () => {
      roomEnded.set(true);
      if (hostTimer) clearInterval(hostTimer);
      goto("/summary");
    });
  });

  onDestroy(() => {
    socket.off("room:updated");
    socket.off("question:new");
    socket.off("response:update");
    socket.off("question:ended");
    socket.off("host:disconnected");
    socket.off("room:ended");
    if (hostTimer) clearInterval(hostTimer);
  });

  function vote(option: string) {
    if ($hasVoted || !$currentQuestion) return;
    selectedOption = option;
    hasVoted.set(true);
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: option });
  }

  function submitFreetext() {
    if (submitted || !freetextInput.trim() || !$currentQuestion) return;
    submitted = true;
    socket.emit("response:submit", { questionId: $currentQuestion.id, value: freetextInput.trim() });
  }

  let totalVotes = $derived(Object.values($voteCounts).reduce((a, b) => a + b, 0));
</script>

<main>
  <div class="room-code">{code}</div>

  {#if $hostDisconnected && !$roomEnded}
    <div class="banner">
      Host disconnected — waiting for reconnect ({hostWaitSeconds}s)
    </div>
  {/if}

  {#if !$currentQuestion || $questionEnded}
    <section class="waiting">
      {#if $questionEnded && $currentQuestion}
        <h2>Round over!</h2>
        {#if $currentQuestion.type === "vote"}
          <div class="results">
            {#each Object.entries($voteCounts).sort(([,a],[,b]) => b - a) as [opt, count]}
              {@const pct = Math.round((count / Math.max(1, totalVotes)) * 100)}
              <div class="result-bar">
                <span class="result-label">{opt}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:{pct}%"></div>
                </div>
                <span class="pct">{pct}%</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="freetext-results">
            {#each $freetextResponses as r}
              <div class="freetext-item">{r}</div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="waiting-msg">
          <div class="pulse-dot"></div>
          Waiting for the next question...
        </div>
        <ul class="player-list">
          {#each $players as player (player.id)}
            <li>{player.nickname}</li>
          {/each}
        </ul>
      {/if}
    </section>

  {:else}
    <section class="question">
      <h2>{$currentQuestion.prompt}</h2>

      {#if $currentQuestion.type === "vote"}
        {#if !$hasVoted}
          <div class="options">
            {#each ($currentQuestion.options ?? []) as option}
              <button class="option-btn" onclick={() => vote(option)}>
                {option}
              </button>
            {/each}
          </div>
        {:else}
          <p class="voted-msg">Voted for <strong>{selectedOption}</strong></p>
          <div class="live-counts">
            {#each Object.entries($voteCounts) as [opt, count]}
              {@const pct = Math.round((count / Math.max(1, totalVotes)) * 100)}
              <div class="bar-row">
                <span class="bar-label {opt === selectedOption ? 'chosen' : ''}">{opt}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:{pct}%"></div>
                </div>
                <span class="bar-count">{count}</span>
              </div>
            {/each}
          </div>
        {/if}

      {:else}
        {#if !submitted}
          <form onsubmit={(e) => { e.preventDefault(); submitFreetext(); }} class="freetext-form">
            <textarea
              bind:value={freetextInput}
              placeholder="Type your answer..."
              maxlength="300"
              rows="3"
              autofocus
            ></textarea>
            <button class="btn-primary" type="submit">Submit</button>
          </form>
        {:else}
          <p class="voted-msg">Answer submitted!</p>
          <div class="freetext-live">
            {#each $freetextResponses as r}
              <div class="freetext-item">{r}</div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    max-width: 480px;
    margin: 0 auto;
  }

  .room-code {
    font-size: 1.1rem;
    font-weight: 700;
    color: #ff4d00;
    letter-spacing: 0.08em;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .banner {
    background: #2a1500;
    border: 1px solid #ff4d00;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    text-align: center;
    color: #ffaa77;
  }

  .waiting {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
  }

  .waiting-msg {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #888;
    font-size: 1rem;
  }

  .pulse-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ff4d00;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }

  .player-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .player-list li {
    background: #1e1e1e;
    padding: 0.35rem 0.8rem;
    border-radius: 2rem;
    font-size: 0.8rem;
    color: #aaa;
  }

  .question {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding-top: 1rem;
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0 0 1.5rem;
    line-height: 1.3;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .option-btn {
    padding: 1.25rem;
    border-radius: 0.75rem;
    border: 2px solid #333;
    background: #111;
    color: #fff;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    min-height: 4rem;
  }

  .option-btn:hover {
    border-color: #ff4d00;
    background: #1a0800;
  }

  .voted-msg {
    color: #aaa;
    font-size: 0.95rem;
    margin: 0 0 1.25rem;
  }

  .live-counts, .results {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.5rem;
  }

  .bar-row, .result-bar {
    display: grid;
    grid-template-columns: 1fr 2fr 2.5rem;
    align-items: center;
    gap: 0.6rem;
  }

  .bar-label, .result-label {
    font-size: 0.9rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-label.chosen { color: #ff4d00; }

  .bar-track {
    background: #1e1e1e;
    border-radius: 0.25rem;
    height: 1.75rem;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: #ff4d00;
    border-radius: 0.25rem;
    transition: width 0.35s ease;
  }

  .bar-count, .pct {
    font-size: 0.8rem;
    color: #888;
    text-align: right;
  }

  .freetext-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  textarea {
    padding: 0.85rem 1rem;
    border-radius: 0.5rem;
    border: 2px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 1rem;
    resize: vertical;
    outline: none;
    font-family: inherit;
  }

  textarea:focus { border-color: #ff4d00; }

  .btn-primary {
    padding: 1rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  .freetext-live, .freetext-results {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .freetext-item {
    background: #1e1e1e;
    padding: 0.65rem 0.9rem;
    border-radius: 0.5rem;
    font-size: 0.95rem;
    animation: slideIn 0.2s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
