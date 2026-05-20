<script lang="ts">
  import { goto } from "$app/navigation";
  import { questionHistory } from "$lib/stores";

  let history = $questionHistory;

  function playAgain() {
    questionHistory.set([]);
    goto("/");
  }
</script>

<main>
  <div class="container">
    <h1>Session Over</h1>

    {#if history.length === 0}
      <p class="empty">No questions were asked this session.</p>
    {:else}
      <p class="subtitle">{history.length} question{history.length !== 1 ? "s" : ""} played</p>

      <div class="entries">
        {#each history as entry, i}
          <div class="entry">
            <div class="entry-header">
              <span class="entry-num">Q{i + 1}</span>
              <span class="entry-badge {entry.question.type}">{entry.question.type === "vote" ? "Vote" : "Hot Take"}</span>
            </div>
            <h3>{entry.question.prompt}</h3>

            {#if entry.question.type === "vote" && entry.counts}
              {@const total = Object.values(entry.counts).reduce((a, b) => a + b, 0)}
              <div class="vote-results">
                {#each Object.entries(entry.counts).sort(([, a], [, b]) => b - a) as [opt, count]}
                  {@const pct = Math.round((count / Math.max(1, total)) * 100)}
                  <div class="bar-row">
                    <span class="bar-label">{opt}</span>
                    <div class="bar-track">
                      <div class="bar-fill" style="width: {pct}%"></div>
                    </div>
                    <span class="bar-stat">{count} ({pct}%)</span>
                  </div>
                {/each}
              </div>
            {:else if entry.responses && entry.responses.length > 0}
              <div class="text-results">
                {#each entry.responses as r}
                  <div class="text-item">{r}</div>
                {/each}
              </div>
            {:else}
              <p class="no-responses">No responses</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <button class="btn-primary" onclick={playAgain}>New Game</button>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 2rem 1rem;
  }

  .container {
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 900;
    margin: 0;
    color: #ff4d00;
  }

  .subtitle {
    color: #888;
    margin: 0;
    font-size: 0.95rem;
  }

  .empty {
    color: #555;
    font-style: italic;
  }

  .entries {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .entry {
    background: #111;
    border: 1px solid #222;
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .entry-num {
    font-size: 0.75rem;
    font-weight: 700;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .entry-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .entry-badge.vote { background: #1a3a1a; color: #5dde5d; }
  .entry-badge.freetext { background: #1a1a3a; color: #7d9fff; }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.4;
    color: #fff;
  }

  .vote-results {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 1fr 2fr 4.5rem;
    align-items: center;
    gap: 0.6rem;
  }

  .bar-label {
    font-size: 0.875rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #ccc;
  }

  .bar-track {
    background: #1e1e1e;
    border-radius: 0.25rem;
    height: 1.5rem;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: #ff4d00;
    border-radius: 0.25rem;
  }

  .bar-stat {
    font-size: 0.75rem;
    color: #888;
    text-align: right;
  }

  .text-results {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .text-item {
    background: #1a1a1a;
    padding: 0.6rem 0.85rem;
    border-radius: 0.4rem;
    font-size: 0.9rem;
    color: #ddd;
  }

  .no-responses {
    color: #555;
    font-size: 0.875rem;
    font-style: italic;
    margin: 0;
  }

  .btn-primary {
    padding: 0.9rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover { opacity: 0.9; }
</style>
