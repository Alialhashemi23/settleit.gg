<script lang="ts">
  import type { Socket } from "socket.io-client";
  import { packs } from "$lib/packs";
  import type { Pack, PackQuestion } from "$lib/packs";

  let { socket, onPushed }: { socket: Socket; onPushed?: () => void } = $props();

  let pickerTab: "custom" | "pack" = $state("custom");
  let customPrompt = $state("");
  let customOptions: string[] = $state(["", "", "", ""]);
  let selectedPack: Pack | null = $state(null);

  function pushQuestion() {
    const opts = customOptions.filter(o => o.trim());
    if (!customPrompt.trim() || opts.length < 2) return;
    socket.emit("question:ask", { prompt: customPrompt.trim(), options: opts });
    customPrompt = "";
    customOptions = ["", "", "", ""];
    onPushed?.();
  }

  function askPackQuestion(q: PackQuestion) {
    socket.emit("question:ask", { prompt: q.prompt, options: q.options });
    onPushed?.();
  }
</script>

<div class="picker">
  <div class="tabs">
    <button class="tab {pickerTab === 'custom' ? 'active' : ''}" onclick={() => pickerTab = 'custom'}>Custom</button>
    <button class="tab {pickerTab === 'pack' ? 'active' : ''}" onclick={() => { pickerTab = 'pack'; selectedPack = null; }}>From Pack</button>
  </div>

  {#if pickerTab === 'custom'}
    <form onsubmit={(e) => { e.preventDefault(); pushQuestion(); }}>
      <label>
        Question
        <input type="text" bind:value={customPrompt} placeholder="Who's the GOAT?" maxlength="200" />
      </label>
      <fieldset>
        <legend>Options (2–4)</legend>
        {#each customOptions as _, i}
          <input type="text" bind:value={customOptions[i]} placeholder="Option {i + 1}" maxlength="60" />
        {/each}
      </fieldset>
      <button class="btn-primary" type="submit" disabled={!customPrompt.trim() || customOptions.filter(o => o.trim()).length < 2}>
        Ask It
      </button>
    </form>
  {:else}
    <div class="pack-browser">
      {#if !selectedPack}
        <div class="pack-grid">
          {#each packs as pack}
            <button class="pack-card" onclick={() => selectedPack = pack}>
              <span class="pack-emoji">{pack.emoji}</span>
              <span class="pack-name">{pack.name}</span>
              <span class="pack-count">{pack.questions.length} questions</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="pack-questions">
          <button class="btn-ghost back-btn" onclick={() => selectedPack = null}>← Back</button>
          <h4>{selectedPack.emoji} {selectedPack.name}</h4>
          {#each selectedPack.questions as q}
            <button class="question-card" onclick={() => askPackQuestion(q)}>
              {q.prompt}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 1rem; }

  .tabs {
    display: flex;
    gap: 0.25rem;
    background: #1a1a1a;
    border-radius: 0.5rem;
    padding: 0.2rem;
  }

  .tab {
    flex: 1;
    padding: 0.35rem 0.85rem;
    border-radius: 0.35rem;
    border: none;
    background: transparent;
    color: #888;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .tab.active { background: #ff4d00; color: #fff; }

  form { display: flex; flex-direction: column; gap: 0.75rem; }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #ccc;
  }

  input[type="text"] {
    padding: 0.65rem 0.9rem;
    border-radius: 0.5rem;
    border: 2px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 1rem;
    outline: none;
  }

  input[type="text"]:focus { border-color: #ff4d00; }

  fieldset {
    border: 1px solid #333;
    border-radius: 0.5rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  legend { font-size: 0.8rem; color: #888; padding: 0 0.25rem; }

  .btn-primary {
    padding: 0.85rem;
    border-radius: 0.5rem;
    border: none;
    background: #ff4d00;
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary:not(:disabled):hover { opacity: 0.9; }

  .btn-ghost {
    background: none;
    border: none;
    color: #666;
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .btn-ghost:hover { color: #aaa; }

  .pack-browser { display: flex; flex-direction: column; gap: 0.75rem; }

  .pack-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }

  .pack-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 1rem 0.5rem;
    border-radius: 0.75rem;
    border: 2px solid #222;
    background: #1a1a1a;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .pack-card:hover { border-color: #ff4d00; }

  .pack-emoji { font-size: 2rem; }
  .pack-name { font-weight: 700; font-size: 0.9rem; }
  .pack-count { color: #666; font-size: 0.75rem; }

  .pack-questions { display: flex; flex-direction: column; gap: 0.5rem; }
  .pack-questions h4 { margin: 0.25rem 0 0.5rem; font-size: 1rem; }
  .back-btn { align-self: flex-start; margin-bottom: 0.25rem; }

  .question-card {
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid #222;
    background: #1a1a1a;
    cursor: pointer;
    text-align: left;
    font-size: 0.9rem;
    color: #ddd;
    transition: border-color 0.15s, background 0.15s;
    width: 100%;
  }

  .question-card:hover { border-color: #ff4d00; background: #1f0d00; }
</style>
