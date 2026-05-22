<script lang="ts">
  import type { Socket } from "socket.io-client";
  import { presets, TOPIC_TAGS, VIBE_TAGS, type PresetQuestion, type Tag } from "$lib/presets";
  import { askedPresetIds, presetsEnabled } from "$lib/stores";
  import { get } from "svelte/store";

  let { socket, onPushed }: { socket: Socket; onPushed?: () => void } = $props();

  let pickerTab: "roll" | "custom" = $state($presetsEnabled ? "roll" : "custom");

  // Roll state
  let selectedTags = $state<Set<Tag>>(new Set([...TOPIC_TAGS, ...VIBE_TAGS] as Tag[]));
  let currentRoll = $state<PresetQuestion | null>(null);
  let rollError = $state("");

  // Custom state
  let customPrompt = $state("");
  let customOptions: string[] = $state(["", "", "", ""]);

  function pool(): PresetQuestion[] {
    const asked = get(askedPresetIds);
    const tags = selectedTags;
    return presets.filter(q => !asked.has(q.id) && q.tags.some(t => tags.has(t as Tag)));
  }

  function rollOne() {
    rollError = "";
    let candidates = pool();
    if (currentRoll && candidates.length > 1) {
      candidates = candidates.filter(q => q.id !== currentRoll!.id);
    }
    if (candidates.length === 0) {
      rollError = selectedTags.size === 0
        ? "Select at least one tag to roll"
        : "No questions left for those tags — broaden filters or use Custom";
      currentRoll = null;
      return;
    }
    currentRoll = candidates[Math.floor(Math.random() * candidates.length)];
  }

  function toggleTag(tag: Tag) {
    const next = new Set(selectedTags);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    selectedTags = next;
    rollError = "";
  }

  function askRoll() {
    if (!currentRoll) return;
    socket.emit("question:ask", {
      prompt: currentRoll.prompt,
      options: currentRoll.options,
      presetId: currentRoll.id,
    });
    currentRoll = null;
    onPushed?.();
  }

  function askCustom() {
    const opts = customOptions.filter(o => o.trim());
    if (!customPrompt.trim() || opts.length < 2) return;
    socket.emit("question:ask", { prompt: customPrompt.trim(), options: opts });
    customPrompt = "";
    customOptions = ["", "", "", ""];
    onPushed?.();
  }

  // Initial roll when tab opens
  $effect(() => {
    if (pickerTab === "roll" && !currentRoll && !rollError) {
      rollOne();
    }
  });

  let poolSize = $derived(pool().length);
</script>

<div class="picker">
  {#if $presetsEnabled}
  <div class="tabs">
    <button class="tab {pickerTab === 'roll' ? 'active' : ''}" onclick={() => pickerTab = 'roll'}>🎲 Roll</button>
    <button class="tab {pickerTab === 'custom' ? 'active' : ''}" onclick={() => pickerTab = 'custom'}>Custom</button>
  </div>
  {/if}

  {#if pickerTab === 'roll' && $presetsEnabled}
    <div class="roll">
      <details class="tag-filters">
        <summary>Filters · {selectedTags.size} of {TOPIC_TAGS.length + VIBE_TAGS.length} tags · {poolSize} questions</summary>

        <div class="tag-section">
          <div class="tag-section-label">Topics</div>
          <div class="tag-chips">
            {#each TOPIC_TAGS as tag}
              <button class="chip {selectedTags.has(tag as Tag) ? 'on' : ''}" onclick={() => toggleTag(tag as Tag)}>{tag}</button>
            {/each}
          </div>
        </div>

        <div class="tag-section">
          <div class="tag-section-label">Vibes</div>
          <div class="tag-chips">
            {#each VIBE_TAGS as tag}
              <button class="chip {selectedTags.has(tag as Tag) ? 'on' : ''}" onclick={() => toggleTag(tag as Tag)}>{tag}</button>
            {/each}
          </div>
        </div>

        <div class="filter-shortcuts">
          <button class="btn-ghost" onclick={() => selectedTags = new Set([...TOPIC_TAGS, ...VIBE_TAGS] as Tag[])}>All</button>
          <button class="btn-ghost" onclick={() => selectedTags = new Set()}>None</button>
        </div>
      </details>

      {#if currentRoll}
        <div class="rolled">
          <div class="rolled-prompt">{currentRoll.prompt}</div>
          <div class="rolled-options">
            {#each currentRoll.options as opt}
              <span class="rolled-opt">{opt}</span>
            {/each}
          </div>
          <div class="rolled-tags">
            {#each currentRoll.tags as t}
              <span class="rolled-tag">{t}</span>
            {/each}
          </div>
        </div>
        <div class="roll-actions">
          <button class="btn-primary" onclick={askRoll}>Ask It</button>
          <button class="btn-secondary" onclick={rollOne}>🎲 Re-roll</button>
        </div>
      {:else}
        <button class="btn-primary big-roll" onclick={rollOne}>🎲 Roll a Question</button>
      {/if}

      {#if rollError}
        <p class="roll-error">{rollError}</p>
      {/if}
    </div>
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); askCustom(); }}>
      <label>
        Question
        <input type="text" bind:value={customPrompt} placeholder="Who's the GOAT?" maxlength="200" />
      </label>
      <fieldset>
        <legend>Options (optional, 0–4)</legend>
        {#each customOptions as _, i}
          <input type="text" bind:value={customOptions[i]} placeholder="Option {i + 1}" maxlength="60" />
        {/each}
      </fieldset>
      <button class="btn-primary" type="submit" disabled={!customPrompt.trim()}>
        Ask It
      </button>
    </form>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 1rem; }

  .tabs {
    display: flex;
    gap: 0.25rem;
    background: var(--bg);
    border-radius: 0.75rem;
    padding: 0.2rem;
    border: 1px solid var(--border);
  }

  .tab {
    flex: 1;
    padding: 0.4rem 0.85rem;
    border-radius: 0.6rem;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
  }

  .tab.active {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 0 10px var(--accent-alpha);
  }

  /* Roll */
  .roll { display: flex; flex-direction: column; gap: 0.875rem; }

  .tag-filters {
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.6rem 0.85rem;
    background: var(--bg);
  }

  .tag-filters summary {
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 800;
    color: var(--text-muted);
    user-select: none;
    list-style: none;
  }

  .tag-filters summary::-webkit-details-marker { display: none; }

  .tag-filters[open] summary { margin-bottom: 0.75rem; }

  .tag-section { margin-bottom: 0.75rem; }
  .tag-section:last-of-type { margin-bottom: 0.25rem; }
  .tag-section-label {
    font-size: 0.7rem;
    font-weight: 800;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.4rem;
  }

  .tag-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  .chip {
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text-dim);
    font-size: 0.75rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .chip:hover { color: var(--text-muted); }
  .chip.on {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(232,131,26,0.08);
  }

  .filter-shortcuts { display: flex; gap: 0.5rem; margin-top: 0.35rem; }

  .rolled {
    background: var(--surface);
    border: 1.5px solid var(--accent);
    border-radius: 1rem;
    padding: 1rem;
    box-shadow: 0 0 18px var(--accent-alpha);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    animation: rollIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .rolled-prompt {
    font-size: 1.1rem;
    font-weight: 900;
    color: var(--text);
    line-height: 1.3;
  }

  .rolled-options { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .rolled-opt {
    background: var(--surface-raised);
    color: var(--text-muted);
    border: 1px solid var(--border);
    padding: 0.25rem 0.6rem;
    border-radius: 0.5rem;
    font-size: 0.825rem;
    font-weight: 700;
  }

  .rolled-tags { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .rolled-tag {
    font-size: 0.65rem;
    font-weight: 800;
    color: var(--text-dim);
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    padding: 0.1rem 0.35rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .roll-actions { display: flex; gap: 0.5rem; }
  .roll-actions .btn-primary { flex: 1; }
  .roll-actions .btn-secondary { flex: 1; }

  .big-roll {
    padding: 1.25rem;
    font-size: 1.05rem;
  }

  .roll-error {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 700;
    margin: 0;
    text-align: center;
    padding: 0.5rem;
    background: var(--surface);
    border-radius: 0.5rem;
    border: 1px dashed var(--border);
  }

  /* Custom (existing) */
  form { display: flex; flex-direction: column; gap: 0.75rem; }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.875rem;
    font-weight: 800;
    color: var(--text-muted);
  }

  input[type="text"] {
    padding: 0.7rem 0.9rem;
    border-radius: 0.75rem;
    border: 2px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font-size: 1rem;
    font-family: inherit;
    font-weight: 600;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  input[type="text"]:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-alpha);
  }

  fieldset {
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  legend { font-size: 0.8rem; font-weight: 800; color: var(--text-muted); padding: 0 0.25rem; }

  .btn-primary {
    min-height: 48px;
    padding: 0.85rem;
    border-radius: 1rem;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 0 14px var(--accent-alpha), 0 4px 10px rgba(0,0,0,0.3);
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), background 150ms ease;
  }

  .btn-primary:not(:disabled):hover { background: var(--accent-hover); }
  .btn-primary:not(:disabled):active { transform: scale(0.96); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

  .btn-secondary {
    min-height: 48px;
    padding: 0.85rem;
    border-radius: 1rem;
    border: 2px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    font-size: 1rem;
    font-weight: 800;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
  .btn-secondary:active { transform: scale(0.96); }

  .btn-ghost {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 0.75rem;
    font-weight: 800;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: color 0.15s;
  }

  .btn-ghost:hover { color: var(--accent); }

  @keyframes rollIn {
    0% { opacity: 0; transform: scale(0.92) translateY(8px); }
    60% { transform: scale(1.02); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
</style>
