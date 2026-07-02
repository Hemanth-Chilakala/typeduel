// Local word bank + seeded generator.
// Same seed -> same word sequence on both peers (fair race, no server needed).

const BANK = [
  "the","and","for","you","that","with","have","this","from","they","will","would",
  "there","their","what","about","which","when","make","like","time","just","know",
  "take","people","into","year","your","good","some","them","other","than","then",
  "look","only","come","over","think","also","back","after","work","first","well",
  "even","want","because","these","give","most","find","tell","ask","need","feel",
  "three","state","never","become","between","high","really","something","world",
  "still","system","house","water","light","under","story","early","reason","music",
  "point","power","change","place","around","every","large","small","great","little",
  "right","study","book","word","start","night","begin","hand","group","open","close",
  "speed","quick","brown","jumps","lazy","typing","letter","screen","focus","clean",
  "space","enter","press","score","match","rival","final","round","ready","steady",
];

// mulberry32 — tiny deterministic PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed() {
  // 32-bit seed; fine for fairness (both peers share it explicitly).
  return (Math.floor(Math.random() * 0xffffffff) >>> 0);
}

// Deterministic array of words for a given seed (same on both peers).
export function generateWords(seed, count = 40) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(BANK[Math.floor(rand() * BANK.length)]);
  }
  return out;
}

export function generate(seed, count = 40) {
  return generateWords(seed, count).join(" ");
}
