// WebRTC peer-to-peer networking via PeerJS.
// Uses the free public PeerJS broker only for the connection handshake;
// all race traffic flows directly browser-to-browser. No backend, no cost.

import { Peer } from "peerjs";

const PREFIX = "typeduel-"; // namespaces our peer ids on the shared public broker
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function randomCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export function createNet() {
  let peer = null;
  let conn = null;
  const handlers = { message: null, connect: null, close: null, error: null };

  function wireConnection(c) {
    conn = c;
    c.on("open", () => handlers.connect && handlers.connect());
    c.on("data", (d) => {
      let msg = d;
      if (typeof d === "string") {
        try {
          msg = JSON.parse(d);
        } catch {
          return;
        }
      }
      handlers.message && handlers.message(msg);
    });
    c.on("close", () => handlers.close && handlers.close());
    c.on("error", () => handlers.close && handlers.close());
  }

  return {
    // Host a room. Resolves with the short code to share.
    host() {
      return new Promise((resolve, reject) => {
        const code = randomCode();
        peer = new Peer(PREFIX + code);
        peer.on("open", () => resolve(code));
        peer.on("connection", (c) => wireConnection(c));
        peer.on("error", (err) => {
          // If the id is taken, retry once with a fresh code.
          if (err.type === "unavailable-id") {
            peer.destroy();
            peer = new Peer(PREFIX + randomCode());
            peer.on("open", (id) => resolve(id.replace(PREFIX, "")));
            peer.on("connection", (c) => wireConnection(c));
            peer.on("error", (e) => handleError(e, reject));
          } else {
            handleError(err, reject);
          }
        });
      });
    },

    // Join a room by its short code. Resolves once the data channel opens.
    join(code) {
      return new Promise((resolve, reject) => {
        peer = new Peer();
        peer.on("open", () => {
          const c = peer.connect(PREFIX + code.trim().toUpperCase(), {
            reliable: true,
          });
          if (!c) return reject(new Error("Could not connect"));
          wireConnection(c);
          c.on("open", () => resolve());
        });
        peer.on("error", (err) => handleError(err, reject));
      });
    },

    send(obj) {
      if (conn && conn.open) conn.send(JSON.stringify(obj));
    },

    onMessage(cb) {
      handlers.message = cb;
    },
    onConnect(cb) {
      handlers.connect = cb;
    },
    onClose(cb) {
      handlers.close = cb;
    },
    onError(cb) {
      handlers.error = cb;
    },

    destroy() {
      handlers.message = handlers.connect = handlers.close = null;
      try {
        if (conn) conn.close();
      } catch {}
      try {
        if (peer) peer.destroy();
      } catch {}
      conn = null;
      peer = null;
    },
  };

  function handleError(err, reject) {
    const map = {
      "peer-unavailable": "No room found with that code.",
      network: "Network error — check your connection.",
      "server-error": "Signaling server unavailable, try again.",
      "browser-incompatible": "This browser doesn't support WebRTC.",
    };
    const message = map[err.type] || "Connection failed. Try again.";
    if (handlers.error) handlers.error(message);
    if (reject) reject(new Error(message));
  }
}
