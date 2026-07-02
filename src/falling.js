// Falling-words mode. Words drop from the top of the field; the player types a
// word (any currently-falling one) to clear it. A word that reaches the bottom
// costs a life. The run ends at 0 lives. Score = words cleared.
//
// Both peers use the same seed, so the spawn order is identical and the race is
// fair without a server. All state is in-memory and ephemeral.

import { generateWords } from "./words.js";

const START_LIVES = 3;
const SPAWN_MS = 1600; // initial gap between spawns
const MIN_SPAWN_MS = 650; // fastest spawn gap after ramping
const FALL_MS = 6000; // initial time for a word to fall top->bottom
const MIN_FALL_MS = 3200; // fastest fall after ramping
const RAMP_EVERY = 5; // speed up every N spawns
const PROGRESS_TARGET = 20; // cleared count that fills the progress bar to 100%

export function createFalling({ seed, fieldEl, hiddenInput, typedEl, onProgress, onFinish }) {
  const bank = generateWords(seed, 400); // deterministic long stream, shared by peers
  let spawnIdx = 0;
  let cleared = 0;
  let lives = START_LIVES;
  let buffer = "";
  let startTime = null;
  let raf = null;
  let spawnTimer = null;
  let finished = false;

  // Active falling words: { word, el, bornAt, dur }
  const active = [];

  function fieldHeight() {
    return fieldEl.clientHeight || 360;
  }

  function currentSpawnGap() {
    const steps = Math.floor(spawnIdx / RAMP_EVERY);
    return Math.max(MIN_SPAWN_MS, SPAWN_MS - steps * 120);
  }
  function currentFallDur() {
    const steps = Math.floor(spawnIdx / RAMP_EVERY);
    return Math.max(MIN_FALL_MS, FALL_MS - steps * 250);
  }

  function spawn() {
    if (finished) return;
    const word = bank[spawnIdx % bank.length];
    spawnIdx++;
    const node = document.createElement("div");
    node.className = "fall-word";
    node.textContent = word;
    // random horizontal position (10%..80%); deterministic enough per-client,
    // position doesn't affect fairness (only clearing does).
    const left = 8 + (spawnIdx * 37) % 78;
    node.style.left = left + "%";
    node.style.top = "0px";
    fieldEl.appendChild(node);
    active.push({ word, el: node, bornAt: performance.now(), dur: currentFallDur() });

    spawnTimer = setTimeout(spawn, currentSpawnGap());
  }

  function tick(now) {
    if (finished) return;
    const h = fieldHeight();
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      const t = (now - a.bornAt) / a.dur;
      const y = t * h;
      a.el.style.transform = `translateY(${y}px)`;
      if (t >= 1) {
        // Landed — costs a life.
        a.el.remove();
        active.splice(i, 1);
        loseLife();
        if (finished) return;
      }
    }
    onProgress(metrics());
    raf = requestAnimationFrame(tick);
  }

  function metrics() {
    const elapsedMs = startTime ? performance.now() - startTime : 0;
    const minutes = Math.max(elapsedMs / 60000, 1e-6);
    const wpm = Math.round(cleared / minutes) || 0; // words-per-minute (whole words)
    return {
      cleared,
      lives,
      wpm,
      progress: Math.min(cleared / PROGRESS_TARGET, 1),
    };
  }

  function loseLife() {
    lives--;
    renderStats();
    if (lives <= 0) finish();
  }

  function renderStats() {
    const scoreEl = document.getElementById("scoreVal");
    const livesEl = document.getElementById("livesVal");
    if (scoreEl) scoreEl.textContent = cleared;
    if (livesEl) livesEl.textContent = Math.max(0, lives);
  }

  function renderBuffer() {
    if (typedEl) typedEl.textContent = buffer;
    // Highlight words that match the current buffer prefix.
    active.forEach((a) => {
      a.el.classList.toggle("match", buffer && a.word.startsWith(buffer));
    });
  }

  function handleKey(e) {
    if (finished) return;
    if (!startTime) startTime = performance.now();

    if (e.key === "Backspace") {
      buffer = buffer.slice(0, -1);
      renderBuffer();
      e.preventDefault();
      return;
    }
    if (e.key === " ") {
      buffer = "";
      renderBuffer();
      e.preventDefault();
      return;
    }
    if (e.key.length !== 1) return;
    e.preventDefault();

    buffer += e.key;
    // Exact match against the lowest (closest to landing) matching word.
    let hitIdx = -1;
    let bestY = -1;
    for (let i = 0; i < active.length; i++) {
      if (active[i].word === buffer) {
        const t = (performance.now() - active[i].bornAt) / active[i].dur;
        if (t > bestY) {
          bestY = t;
          hitIdx = i;
        }
      }
    }
    if (hitIdx >= 0) {
      active[hitIdx].el.classList.add("cleared");
      const gone = active.splice(hitIdx, 1)[0];
      setTimeout(() => gone.el.remove(), 150);
      cleared++;
      buffer = "";
      renderStats();
      onProgress(metrics());
    } else if (!active.some((a) => a.word.startsWith(buffer))) {
      // No word matches this prefix — reset the buffer so typing stays responsive.
      buffer = "";
    }
    renderBuffer();
  }

  function start() {
    hiddenInput.focus();
    hiddenInput.addEventListener("keydown", handleKey);
    fieldEl.closest(".type-stage").addEventListener("click", () => hiddenInput.focus());
    renderStats();
    startTime = performance.now();
    spawn();
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    clearTimeout(spawnTimer);
    hiddenInput.removeEventListener("keydown", handleKey);
    onFinish(metrics());
  }

  function destroy() {
    finished = true;
    cancelAnimationFrame(raf);
    clearTimeout(spawnTimer);
    hiddenInput.removeEventListener("keydown", handleKey);
    active.forEach((a) => a.el.remove());
    active.length = 0;
  }

  return { start, destroy, finish, metrics };
}
