import {
  app,
  el,
  homeScreen,
  joinScreen,
  lobbyScreen,
  raceScreen,
  resultScreen,
  fallingScreen,
  toast,
  MODES,
} from "./ui.js";
import { generate, makeSeed } from "./words.js";
import { createRace } from "./race.js";
import { createFalling } from "./falling.js";
import { createNet } from "./net.js";

// Per-mode config. `words` is how many words to generate for the shared text;
// `timeLimit` (seconds) drives sprint; `hardMode` is accuracy sudden-death.
const MODE_CONFIG = {
  classic: { words: 40, timeLimit: 0, hardMode: false },
  sprint: { words: 200, timeLimit: 30, hardMode: false },
  accuracy: { words: 60, timeLimit: 0, hardMode: true },
  falling: { words: 0, timeLimit: 0, hardMode: false },
};

// ---------------------------------------------------------------------------
// TypeDuel — real-time 1v1 typing race.
//  - Solo warm-up: offline practice vs. a local demo bot.
//  - Multiplayer: WebRTC P2P via PeerJS. Host shares a code; guest joins.
// ---------------------------------------------------------------------------

const state = {
  seed: null,
  text: "",
  isHost: false,
  solo: false,
  mode: "classic",
  code: null,
  net: null,
  race: null,
  botTimer: null,
  you: null,
  foe: null,
  youDone: false,
  foeDone: false,
};

function render(html) {
  app().innerHTML = html;
}

function resetRoundState() {
  state.you = null;
  state.foe = null;
  state.youDone = false;
  state.foeDone = false;
}

function teardownNet() {
  if (state.net) {
    state.net.destroy();
    state.net = null;
  }
}

function clearBot() {
  if (state.botTimer) clearInterval(state.botTimer);
  state.botTimer = null;
}

// ---------------- Home ----------------
function goHome() {
  clearBot();
  teardownNet();
  if (state.race) state.race.destroy();
  state.solo = false;
  state.mode = "classic";
  resetRoundState();
  render(homeScreen());
  el("createCard").onclick = goCreate;
  el("joinCard").onclick = goJoin;
  el("soloBtn").onclick = () => startRace({ solo: true });
  const info = el("netInfoBtn");
  if (info)
    info.onclick = () =>
      toast(
        "Multiplayer connects browsers directly (P2P). Some strict/corporate networks block this — try another network if it fails."
      );
}

// ---------------- Create (host) ----------------
async function goCreate() {
  state.isHost = true;
  state.solo = false;
  renderLobby("", false);
  toast("Creating room…");

  state.net = createNet();
  wireNetHandlers();

  try {
    const code = await state.net.host();
    state.code = code;
    renderLobby(code, false);
  } catch (err) {
    toast(err.message || "Could not create room");
    goHome();
  }
}

// ---------------- Join (guest) ----------------
function goJoin() {
  render(joinScreen());
  el("backBtn").onclick = goHome;
  const input = el("codeInput");
  const connect = async () => {
    const code = input.value.trim().toUpperCase();
    if (code.length < 4) return toast("Enter a valid code");
    state.isHost = false;
    state.solo = false;
    toast("Connecting…");

    state.net = createNet();
    wireNetHandlers();
    try {
      await state.net.join(code);
      state.code = code;
      renderLobby(code, true);
      state.net.send({ type: "ready" });
    } catch (err) {
      toast(err.message || "Connection failed");
      teardownNet();
    }
  };
  el("connectBtn").onclick = connect;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") connect();
  });
  input.focus();
}

// Shared network message handling for both host and guest.
function wireNetHandlers() {
  const net = state.net;

  net.onConnect(() => {
    // Host learns a guest connected.
    if (state.isHost) {
      renderLobby(state.code, true);
      toast("Opponent connected");
    }
  });

  net.onMessage((msg) => {
    switch (msg.type) {
      case "ready":
        if (state.isHost) {
          renderLobby(state.code, true);
          // Tell the freshly-joined guest which mode is currently selected.
          state.net.send({ type: "mode", mode: state.mode });
        }
        break;
      case "mode":
        // Host changed the mode; guest updates its lobby to match.
        if (!state.isHost && MODES[msg.mode]) {
          state.mode = msg.mode;
          if (state.code) renderLobby(state.code, true);
        }
        break;
      case "start":
        // Guest receives the shared seed + mode and begins.
        resetRoundState();
        state.mode = MODES[msg.mode] ? msg.mode : "classic";
        state.seed = msg.seed;
        state.text = state.mode === "falling" ? "" : generate(msg.seed, msg.count);
        launchRace({ solo: false });
        break;
      case "progress":
        updateFoe(msg.progress, msg.wpm);
        // Safety net: if the explicit finish message is ever lost, a progress
        // report of 100% still lets us know the opponent has completed.
        if (msg.progress >= 1 && !state.foeDone) {
          state.foe = state.foe || { wpm: msg.wpm, acc: 100, time: "—", cleared: msg.cleared };
          state.foeDone = true;
          maybeShowResult();
        }
        break;
      case "finish":
        state.foe = {
          wpm: msg.wpm,
          acc: msg.acc,
          time: msg.time,
          cleared: msg.cleared,
        };
        state.foeDone = true;
        updateFoe(1, msg.wpm, msg.cleared);
        maybeShowResult();
        break;
      case "rematch":
        if (state.isHost) startRace({ solo: false }); // host drives a new round
        else toast("Opponent wants a rematch…");
        break;
    }
  });

  net.onClose(() => {
    toast("Opponent left the race");
    // If mid-race, end it; otherwise drop back to home.
    if (state.race) {
      state.foeDone = true;
      state.foe = state.foe || { wpm: 0, acc: 100, time: "—", cleared: 0 };
      maybeShowResult();
    }
  });

  net.onError((m) => toast(m));
}

function renderLobby(code, foeConnected) {
  render(
    lobbyScreen({ code, isHost: state.isHost, foeConnected, mode: state.mode })
  );
  el("leaveBtn").onclick = goHome;
  const copy = el("copyBtn");
  if (copy)
    copy.onclick = () => {
      navigator.clipboard?.writeText(code);
      toast("Code copied");
    };
  const startBtn = el("startBtn");
  if (startBtn) startBtn.onclick = () => startRace({ solo: false });

  // Host-only mode picker: selecting a chip updates state and notifies the guest.
  if (state.isHost) {
    document.querySelectorAll(".mode-chip").forEach((chip) => {
      chip.onclick = () => {
        const m = chip.dataset.mode;
        if (!MODES[m] || m === state.mode) return;
        state.mode = m;
        state.net && state.net.send({ type: "mode", mode: m });
        renderLobby(code, foeConnected);
      };
    });
  }
}

// ---------------- Race orchestration ----------------
// Host (or solo) picks the seed and, if multiplayer, tells the guest to start.
function startRace({ solo }) {
  clearBot();
  resetRoundState();
  state.solo = solo;
  if (solo) state.mode = "classic"; // solo warm-up is always the classic race
  const cfg = MODE_CONFIG[state.mode] || MODE_CONFIG.classic;
  state.seed = makeSeed();
  state.text =
    state.mode === "falling"
      ? ""
      : generate(state.seed, solo ? 30 : cfg.words);

  if (!solo && state.net) {
    state.net.send({
      type: "start",
      seed: state.seed,
      count: cfg.words,
      mode: state.mode,
    });
  }
  launchRace({ solo });
}

// Renders the right screen for the mode and runs the countdown, then the engine.
function launchRace({ solo }) {
  const cfg = MODE_CONFIG[state.mode] || MODE_CONFIG.classic;
  if (state.mode === "falling") {
    render(fallingScreen({ solo }));
  } else {
    render(raceScreen({ text: state.text, solo, mode: state.mode, timeLimit: cfg.timeLimit }));
  }

  const cd = el("countdown");
  let n = 3;
  cd.querySelector(".num").textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      cd.style.display = "none";
      if (state.mode === "falling") beginFalling();
      else beginTyping();
    } else {
      const num = cd.querySelector(".num");
      num.textContent = n;
      num.style.animation = "none";
      void num.offsetWidth;
      num.style.animation = "pop 1s ease";
    }
  }, 1000);
}

// Broadcast local progress to the opponent, throttled to ~10/s.
function makeProgressSender() {
  let lastSent = 0;
  return (payload) => {
    if (state.solo || !state.net) return;
    const now = performance.now();
    if (now - lastSent > 100) {
      lastSent = now;
      state.net.send({ type: "progress", ...payload });
    }
  };
}

function beginTyping() {
  const wordsEl = el("words");
  const hidden = el("hiddenInput");
  const cfg = MODE_CONFIG[state.mode] || MODE_CONFIG.classic;
  const sendProgress = makeProgressSender();

  state.race = createRace({
    text: state.text,
    wordsEl,
    hiddenInput: hidden,
    timeLimit: cfg.timeLimit,
    hardMode: cfg.hardMode,
    onProgress: (m) => {
      el("wpmVal").textContent = m.wpm;
      el("accVal").textContent = m.acc;
      el("timeVal").textContent = m.time;
      const leftEl = el("leftVal");
      if (leftEl && m.remaining != null) leftEl.textContent = Math.ceil(m.remaining);
      el("youMetric").textContent = `${m.wpm} wpm`;
      el("youFill").style.width = `${Math.min(m.progress * 100, 100)}%`;
      sendProgress({ progress: m.progress, wpm: m.wpm });
    },
    onFinish: (m) => {
      state.you = { wpm: m.wpm, acc: m.acc, time: m.time };
      state.youDone = true;
      if (!state.solo && state.net) {
        // Guaranteed final 100% progress (so the opponent's safety net fires
        // even if the finish packet is delayed), then the finish payload.
        state.net.send({ type: "progress", progress: 1, wpm: m.wpm });
        state.net.send({ type: "finish", wpm: m.wpm, acc: m.acc, time: m.time });
      }
      maybeShowResult();
    },
  });
  state.race.start();
}

function beginFalling() {
  const fieldEl = el("fallField");
  const hidden = el("hiddenInput");
  const typedEl = el("fallTyped");
  const sendProgress = makeProgressSender();

  state.race = createFalling({
    seed: state.seed,
    fieldEl,
    hiddenInput: hidden,
    typedEl,
    onProgress: (m) => {
      el("youMetric").textContent = `${m.cleared} cleared`;
      el("youFill").style.width = `${Math.min(m.progress * 100, 100)}%`;
      sendProgress({ progress: m.progress, wpm: m.wpm, cleared: m.cleared });
    },
    onFinish: (m) => {
      state.you = { wpm: m.wpm, acc: 100, time: "—", cleared: m.cleared };
      state.youDone = true;
      if (!state.solo && state.net) {
        state.net.send({ type: "progress", progress: 1, wpm: m.wpm, cleared: m.cleared });
        state.net.send({ type: "finish", wpm: m.wpm, acc: 100, time: "—", cleared: m.cleared });
      }
      maybeShowResult();
    },
  });
  state.race.start();
}

function updateFoe(progress, wpm, cleared) {
  const fill = el("foeFill");
  const metric = el("foeMetric");
  if (fill) fill.style.width = `${Math.min(progress * 100, 100)}%`;
  if (metric) {
    if (state.mode === "falling" && cleared != null) metric.textContent = `${cleared} cleared`;
    else if (wpm != null) metric.textContent = `${wpm} wpm`;
  }
}

// ---------------- Results ----------------
function maybeShowResult() {
  if (state.solo) {
    if (state.youDone) showResult();
    return;
  }
  if (state.youDone && state.foeDone) {
    showResult();
  } else if (state.youDone) {
    // You're done but the opponent is still typing — show clear feedback
    // instead of leaving the typing screen looking frozen.
    showWaiting();
  }
}

// Overlay shown after you finish while the opponent is still racing.
function showWaiting() {
  if (state.race) state.race.destroy();
  const stage = document.querySelector(".type-stage");
  if (!stage) return;
  if (document.getElementById("waitOverlay")) return;
  const ov = document.createElement("div");
  ov.className = "countdown";
  ov.id = "waitOverlay";
  ov.innerHTML = `
    <div style="text-align:center">
      <div style="font-size:44px;font-weight:700">Done!</div>
      <div class="dots-wait" style="margin-top:10px;color:var(--text-dim)">Waiting for opponent</div>
    </div>`;
  stage.appendChild(ov);
}

// Returns "win" | "lose" | "draw" from this peer's perspective.
// Uses the same rules on both machines, so results always agree.
//
// Ranked by WPM first (net WPM counts correct chars only, see race.js metrics),
// so mashing random keys to "finish" fast scores ~0 WPM and loses — this closes
// the old exploit where lowest raw time won regardless of accuracy.
function decideOutcome(you, foe) {
  // Falling-words is scored by words cleared; more cleared wins, tie -> wpm.
  if (state.mode === "falling") {
    const yc = you.cleared ?? 0;
    const fc = foe.cleared ?? 0;
    if (yc !== fc) return yc > fc ? "win" : "lose";
    if (you.wpm !== foe.wpm) return you.wpm > foe.wpm ? "win" : "lose";
    return "draw";
  }
  // 1) Higher WPM wins.
  if (you.wpm !== foe.wpm) return you.wpm > foe.wpm ? "win" : "lose";
  // 2) Tie on WPM -> higher accuracy wins.
  if (you.acc !== foe.acc) return you.acc > foe.acc ? "win" : "lose";
  // 3) Still tied -> lower time wins.
  const yt = parseFloat(you.time);
  const ft = parseFloat(foe.time);
  const yTime = isNaN(yt) ? Infinity : yt;
  const fTime = isNaN(ft) ? Infinity : ft;
  if (yTime !== fTime) return yTime < fTime ? "win" : "lose";
  // 4) Dead even.
  return "draw";
}

function showResult() {
  if (state.race) state.race.destroy();
  const you = state.you || { wpm: 0, acc: 100, time: "0.0", cleared: 0 };
  const foe = state.foe || { wpm: 0, acc: 100, time: "0.0", cleared: 0 };

  // Decide the outcome symmetrically so both peers agree.
  // Higher WPM wins; on a tie fall back to higher accuracy, then lower time.
  // (Falling mode ranks by words cleared — see decideOutcome.)
  const outcome = state.solo ? "solo" : decideOutcome(you, foe);

  render(resultScreen({ outcome, solo: state.solo, you, foe, mode: state.mode }));
  el("homeBtn").onclick = goHome;
  const rematch = el("rematchBtn");
  rematch.onclick = () => {
    if (state.solo) return startRace({ solo: true });
    if (state.isHost) startRace({ solo: false });
    else {
      state.net && state.net.send({ type: "rematch" });
      toast("Rematch requested — waiting for host");
    }
  };
}

// interactive glow on home cards
document.addEventListener("mousemove", (e) => {
  document.querySelectorAll(".card").forEach((card) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

goHome();
