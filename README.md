# TypeDuel

Real-time 1v1 typing speed race. Share a code, race a friend, and see who types faster. Runs entirely in the browser over a peer-to-peer WebRTC connection, with no backend server to host or pay for.

![Vite](https://img.shields.io/badge/build-Vite-646CFF)
![JavaScript](https://img.shields.io/badge/language-JavaScript-F7DF1E)
![WebRTC](https://img.shields.io/badge/multiplayer-WebRTC%20P2P-4ABC9E)
![License](https://img.shields.io/badge/license-MIT-green)

## Overview

TypeDuel is a MonkeyType-style typing test with a head-to-head multiplayer mode:

- One player creates a room and gets a short code.
- The other player enters the code to join.
- Both receive the exact same passage and race to type it first.
- Live progress bars, words-per-minute, accuracy, and a winner screen.

There is no server holding the game state. The two browsers talk directly to each other using WebRTC; a free public signaling broker is used only to introduce the two peers during the initial handshake.

## Features

- Head-to-head multiplayer with a shareable room code.
- Solo warm-up mode for offline practice.
- Live opponent progress, WPM, and accuracy.
- Deterministic word generation so both players always get identical text.
- Glassmorphic dark UI with animated background, custom caret, and per-character feedback.
- Fully static: deployable to any static host at zero cost.

## How it works

```
  Player A (Host)                Public PeerJS broker              Player B (Guest)
  --------------                 --------------------              ----------------
  create room  ───────────────▶  register id "typeduel-<CODE>"
  show <CODE>                                                      enter <CODE>
                                 relay handshake  ◀───────────────  connect to id
                          ◀────────  handshake / ICE  ────────▶
        │                                                                │
        └──────────  direct WebRTC data channel (peer-to-peer)  ─────────┘
                    start / progress / finish / rematch messages
```

Fairness without a server comes from a seeded pseudo-random generator (`mulberry32`). The
host generates a numeric seed and sends it to the guest; both call `generate(seed, count)`
locally to produce the identical passage. Only tiny JSON messages (progress, finish) travel
over the data channel during the race.

## Project structure

```
typeduel/
├── index.html                  App shell + animated background
├── package.json                Scripts and dependencies (Vite, PeerJS)
├── vite.config.js              Build config (base: './' for static hosting)
├── src/
│   ├── main.js                 App flow: screens, race orchestration, networking glue
│   ├── net.js                  WebRTC/PeerJS wrapper: host, join, messaging
│   ├── race.js                 Typing engine: input, WPM, accuracy, progress
│   ├── words.js                Word bank + seeded deterministic text generator
│   ├── ui.js                   Screen rendering (Home, Join, Lobby, Race, Results)
│   └── style.css               Glassmorphic dark theme
└── .github/workflows/deploy.yml  GitHub Pages deploy on push to main
```

## Prerequisites

- Node.js 18 or newer (includes npm).
- A modern browser with WebRTC support (Chrome, Edge, Firefox, Safari).

## Quickstart

```bash
git clone https://github.com/Hemanth-Chilakala/typeduel.git
cd typeduel
npm install
npm run dev
```

Open the printed local URL. To try multiplayer on one machine, open the site in two browser
windows (or two devices on the same network using the Network URL that Vite prints).

## Playing a multiplayer race

1. Player 1 clicks **Create Race** and shares the generated code.
2. Player 2 clicks **Join Race**, enters the code, and connects.
3. Once the opponent shows as connected, the host clicks **Start Race**.
4. Both players type the same passage. First to finish wins. Use **Rematch** to play again.

Solo warm-up is available from the home screen and needs no connection.

## Deployment (GitHub Pages, free)

The included workflow builds and deploys automatically:

1. Push to the `main` branch.
2. In the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. After the workflow runs, the site is live at
   `https://hemanth-chilakala.github.io/typeduel/`.

Because the app is fully static and multiplayer is peer-to-peer, hosting costs nothing and
no payment details are required anywhere.

## Verification

- Verified locally with `npm run dev` by running two browser windows: creating a room in
  one, joining from the other, and completing a race. Confirmed the shared passage matches,
  live progress updates on both sides, the winner is decided by finish time, rematch works,
  and closing one window ends the race with an "opponent left" notice.
- `npm run build` produces a working production bundle in `dist/` (verified);
  `npm run preview` serves it locally.
- The GitHub Pages deployment requires the one-time Settings step above and has not been
  exercised in CI as part of this README.

## Known limitations

- Multiplayer relies on the free public PeerJS broker for the handshake, which is
  best-effort and can be rate-limited. If needed, you can self-host the small `peerjs-server`
  for free, or fall back to a manual copy-paste connection flow.
- Some strict or symmetric NATs may block a direct peer-to-peer connection. A TURN relay
  would resolve this but is out of scope for a zero-cost project.

## Privacy

No accounts, no tracking, and no game data is stored on any server. The passage, progress,
and results exist only in the two players' browsers for the duration of a race.

## License

Released under the [MIT License](LICENSE).
