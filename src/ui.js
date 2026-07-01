// Pure rendering helpers. Each returns an HTML string for a screen.
// Event wiring happens in main.js after injection.

export const el = (id) => document.getElementById(id);
export const app = () => document.getElementById("app");

// ---- inline SVG icons (no emojis) ----
const icon = {
  logo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>`,
  create: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.3 6.7 19l1-5.8L3.5 9.2l5.9-.9z"/></svg>`,
  join: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`,
  you: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  foe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01"/></svg>`,
  ghost: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-2 2-2-2-2 2-2-2z"/><path d="M9 11h.01M15 11h.01"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v4a6 6 0 0 1-12 0z"/><path d="M6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3M9 18h6M10 15h4v3h-4zM8 21h8"/></svg>`,
  flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
};

function brand() {
  return `
    <div class="brand">
      <div class="logo">${icon.logo}</div>
      <h1>Type<span>Race</span></h1>
    </div>`;
}

export function homeScreen() {
  return `
  <div class="screen">
    ${brand()}
    <p class="tagline">Share a code. Race a friend. Fastest fingers win.</p>
    <div class="home-cards">
      <div class="card glass" id="createCard">
        <div class="ci">${icon.create}</div>
        <h3>Create Race</h3>
        <p>Generate a room code and invite a friend to duel.</p>
      </div>
      <div class="card glass" id="joinCard">
        <div class="ci">${icon.join}</div>
        <h3>Join Race</h3>
        <p>Got a code? Drop in and get ready to type.</p>
      </div>
    </div>
    <div class="center-actions" style="margin-top:22px">
      <button class="btn btn-ghost" id="soloBtn">Try a solo warm-up</button>
    </div>
  </div>`;
}

export function joinScreen() {
  return `
  <div class="screen">
    ${brand()}
    <div class="glass pad">
      <div class="section-title">Enter room code</div>
      <div class="field">
        <input class="input" id="codeInput" maxlength="6" placeholder="ABC123" autocomplete="off" />
      </div>
      <div class="actions">
        <button class="btn btn-ghost" id="backBtn">Back</button>
        <button class="btn btn-primary" id="connectBtn">Connect</button>
      </div>
    </div>
  </div>`;
}

export function lobbyScreen({ code, isHost, foeConnected }) {
  return `
  <div class="screen">
    ${brand()}
    <div class="glass pad">
      <div class="section-title">Room code — share this</div>
      <div class="code-box">
        <span class="code">${code || "······"}</span>
        <button class="btn" id="copyBtn">Copy</button>
      </div>

      <div class="players">
        <div class="player-chip you">
          <div class="avatar">${icon.you}</div>
          <div class="name">You</div>
          <div class="status">${isHost ? "Host" : "Guest"}</div>
        </div>
        <div class="vs">VS</div>
        <div class="player-chip foe ${foeConnected ? "connected" : ""}">
          <div class="avatar">${foeConnected ? icon.foe : icon.ghost}</div>
          <div class="name">Opponent</div>
          <div class="status">${
            foeConnected
              ? "Connected"
              : `<span class="dots-wait">Waiting</span>`
          }</div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-ghost" id="leaveBtn">Leave</button>
        ${
          isHost
            ? `<button class="btn btn-primary" id="startBtn" ${
                foeConnected ? "" : "disabled"
              }>Start Race</button>`
            : `<span class="hint">Waiting for host to start…</span>`
        }
      </div>
    </div>
  </div>`;
}

// Build word-grouped markup so text wraps by word across lines,
// while keeping a continuous character index for the typing engine.
function renderText(text) {
  let html = "";
  let i = 0;
  const words = text.split(" ");
  words.forEach((word, w) => {
    html += `<span class="word">`;
    for (const c of word) {
      html += `<span class="ch" data-i="${i}">${c}</span>`;
      i++;
    }
    html += `</span>`;
    // space between words (not after the last word) — a breakable char span
    if (w < words.length - 1) {
      html += `<span class="ch space" data-i="${i}"> </span>`;
      i++;
    }
  });
  return html;
}

export function raceScreen({ text, solo }) {
  return `
  <div class="screen">
    <div class="race-top">
      <div class="progress-track you glass">
        <div class="ph"><span class="who">You</span><span class="metric" id="youMetric">0 wpm</span></div>
        <div class="bar"><div class="fill" id="youFill"></div></div>
      </div>
      ${
        solo
          ? ""
          : `<div class="progress-track foe glass">
        <div class="ph"><span class="who">Opponent</span><span class="metric" id="foeMetric">0 wpm</span></div>
        <div class="bar"><div class="fill" id="foeFill"></div></div>
      </div>`
      }
    </div>

    <div class="type-stage glass">
      <div class="hud">
        <div class="stat"><div class="val" id="wpmVal">0</div><div class="lbl">wpm</div></div>
        <div class="stat"><div class="val" id="accVal">100</div><div class="lbl">accuracy %</div></div>
        <div class="stat"><div class="val" id="timeVal">0.0</div><div class="lbl">seconds</div></div>
      </div>
      <div class="words-viewport">
        <div class="words" id="words">${renderText(text)}</div>
      </div>
      <input class="hidden-input" id="hiddenInput" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
      <div class="countdown" id="countdown"><div class="num">3</div></div>
    </div>
    <div class="hint">Just start typing — click the box if the keyboard isn’t captured.</div>
  </div>`;
}

export function resultScreen({ outcome, solo, you, foe }) {
  // outcome: "solo" | "win" | "lose" | "draw"
  const titleMap = {
    solo: "Warm-up complete",
    win: "You Win",
    lose: "You Lose",
    draw: "It's a Draw",
  };
  const classMap = { solo: "", win: "win", lose: "lose", draw: "draw" };
  const iconMap = {
    solo: icon.target,
    win: icon.trophy,
    lose: icon.flag,
    draw: icon.target,
  };
  const heroTitle = titleMap[outcome];
  const heroClass = classMap[outcome];
  const heroIcon = iconMap[outcome];

  const foeCard = solo
    ? ""
    : `<div class="result-card foe glass">
        <div class="rc-head">${icon.foe}<span>Opponent</span></div>
        <div class="rc-stats">
          <div><div class="val">${foe.wpm}</div><div class="lbl">wpm</div></div>
          <div><div class="val">${foe.acc}%</div><div class="lbl">acc</div></div>
          <div><div class="val">${foe.time}s</div><div class="lbl">time</div></div>
        </div>
      </div>`;

  return `
  <div class="screen">
    <div class="glass result-hero">
      <div class="crown ${heroClass}">${heroIcon}</div>
      <h2 class="${heroClass}">${heroTitle}</h2>
    </div>
    <div class="result-grid" style="${solo ? "grid-template-columns:1fr" : ""}">
      <div class="result-card you glass">
        <div class="rc-head">${icon.you}<span>You</span></div>
        <div class="rc-stats">
          <div><div class="val">${you.wpm}</div><div class="lbl">wpm</div></div>
          <div><div class="val">${you.acc}%</div><div class="lbl">acc</div></div>
          <div><div class="val">${you.time}s</div><div class="lbl">time</div></div>
        </div>
      </div>
      ${foeCard}
    </div>
    <div class="actions">
      <button class="btn btn-ghost" id="homeBtn">Home</button>
      <button class="btn btn-primary" id="rematchBtn">${
        solo ? "Go again" : "Rematch"
      }</button>
    </div>
  </div>`;
}

export function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}
