import {
  app,
  el,
  homeScreen,
  joinScreen,
  lobbyScreen,
  raceScreen,
  resultScreen,
  toast,
} from "./ui.js";
import { generate, makeSeed } from "./words.js";
import { createRace } from "./race.js";
import { createNet } from "./net.js";

// ---------------------------------------------------------------------------
// TypeDuel — real-time 1v1 typing race.
//  - Solo warm-up: offline practice vs. a local demo bot.
//  - Multiplayer: WebRTC P2P via PeerJS. Host shares a code; guest joins.
// ---------------------------------------------------------------------------

const WORD_COUNT = 40;

const state = {
  seed: null,
  text: "",
  isHost: false,
  solo: false,
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
  resetRoundState();
  render(homeScreen());
  el("createCard").onclick = goCreate;
  el("joinCard").onclick = goJoin;
  el("soloBtn").onclick = () => startRace({ solo: true });
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
        if (state.isHost) renderLobby(state.code, true);
        break;
      case "start":
        // Guest receives the shared seed and begins.
        state.seed = msg.seed;
        state.text = generate(msg.seed, msg.count);
        launchRace({ solo: false });
        break;
      case "progress":
        updateFoe(msg.progress, msg.wpm);
        break;
      case "finish":
        state.foe = { wpm: msg.wpm, acc: msg.acc, time: msg.time };
        state.foeDone = true;
        updateFoe(1, msg.wpm);
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
      state.foe = state.foe || { wpm: 0, acc: 100, time: "—" };
      maybeShowResult();
    }
  });

  net.onError((m) => toast(m));
}

function renderLobby(code, foeConnected) {
  render(lobbyScreen({ code, isHost: state.isHost, foeConnected }));
  el("leaveBtn").onclick = goHome;
  const copy = el("copyBtn");
  if (copy)
    copy.onclick = () => {
      navigator.clipboard?.writeText(code);
      toast("Code copied");
    };
  const startBtn = el("startBtn");
  if (startBtn) startBtn.onclick = () => startRace({ solo: false });
}

// ---------------- Race orchestration ----------------
// Host (or solo) picks the seed and, if multiplayer, tells the guest to start.
function startRace({ solo }) {
  clearBot();
  resetRoundState();
  state.solo = solo;
  state.seed = makeSeed();
  state.text = generate(state.seed, solo ? 30 : WORD_COUNT);

  if (!solo && state.net) {
    state.net.send({ type: "start", seed: state.seed, count: WORD_COUNT });
  }
  launchRace({ solo });
}

// Renders the race screen and runs the countdown + typing engine.
function launchRace({ solo }) {
  render(raceScreen({ text: state.text, solo }));

  const cd = el("countdown");
  let n = 3;
  cd.querySelector(".num").textContent = n;
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      cd.style.display = "none";
      beginTyping();
    } else {
      const num = cd.querySelector(".num");
      num.textContent = n;
      num.style.animation = "none";
      void num.offsetWidth;
      num.style.animation = "pop 1s ease";
    }
  }, 1000);
}

function beginTyping() {
  const wordsEl = el("words");
  const hidden = el("hiddenInput");
  let lastSent = 0;

  state.race = createRace({
    text: state.text,
    wordsEl,
    hiddenInput: hidden,
    onProgress: (m) => {
      el("wpmVal").textContent = m.wpm;
      el("accVal").textContent = m.acc;
      el("timeVal").textContent = m.time;
      el("youMetric").textContent = `${m.wpm} wpm`;
      el("youFill").style.width = `${Math.min(m.progress * 100, 100)}%`;

      // Throttle progress broadcasts to ~10/s.
      if (!state.solo && state.net) {
        const now = performance.now();
        if (now - lastSent > 100) {
          lastSent = now;
          state.net.send({ type: "progress", progress: m.progress, wpm: m.wpm });
        }
      }
    },
    onFinish: (m) => {
      state.you = { wpm: m.wpm, acc: m.acc, time: m.time };
      state.youDone = true;
      if (!state.solo && state.net) {
        state.net.send({ type: "finish", wpm: m.wpm, acc: m.acc, time: m.time });
      }
      maybeShowResult();
    },
  });
  state.race.start();
}

function updateFoe(progress, wpm) {
  const fill = el("foeFill");
  const metric = el("foeMetric");
  if (fill) fill.style.width = `${Math.min(progress * 100, 100)}%`;
  if (metric && wpm != null) metric.textContent = `${wpm} wpm`;
}

// ---------------- Results ----------------
function maybeShowResult() {
  if (state.solo) {
    if (state.youDone) showResult();
    return;
  }
  if (state.youDone && state.foeDone) showResult();
}

function showResult() {
  if (state.race) state.race.destroy();
  const you = state.you || { wpm: 0, acc: 100, time: "0.0" };
  const foe = state.foe || { wpm: 0, acc: 100, time: "0.0" };
  const youWon =
    parseFloat(you.time) <= (isNaN(parseFloat(foe.time)) ? Infinity : parseFloat(foe.time));

  render(resultScreen({ youWon, solo: state.solo, you, foe }));
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
