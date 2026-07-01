// Typing engine: tracks input, computes WPM/accuracy/progress, fires callbacks.

export function createRace({ text, wordsEl, hiddenInput, onProgress, onFinish }) {
  const chars = [...wordsEl.querySelectorAll(".ch")];
  let idx = 0;
  let typed = 0;
  let correct = 0;
  let startTime = null;
  let raf = null;
  let finished = false;

  let firstLineTop = null;
  let lineHeight = 0;

  function setCurrent() {
    chars.forEach((c) => c.classList.remove("current"));
    const cur = chars[idx];
    if (cur) cur.classList.add("current");
    scrollToCurrent(cur);
  }

  // Keep the active line visible by translating the words track upward.
  // Once the caret passes the first line, we scroll so the current line sits
  // on the top row of the 3-line window (mirrors MonkeyType's behaviour).
  function scrollToCurrent(cur) {
    if (!cur) return;
    if (firstLineTop === null) {
      firstLineTop = cur.offsetTop;
      const lh = parseFloat(getComputedStyle(wordsEl).lineHeight);
      lineHeight = lh && !isNaN(lh) ? lh : cur.offsetHeight || 48;
    }
    const line = Math.round((cur.offsetTop - firstLineTop) / lineHeight);
    const shift = Math.max(0, line - 1) * lineHeight; // keep one line of context above
    wordsEl.style.transform = `translateY(${-shift}px)`;
  }

  function metrics() {
    const elapsedMs = startTime ? performance.now() - startTime : 0;
    const minutes = Math.max(elapsedMs / 60000, 1e-6);
    const wpm = Math.round(correct / 5 / minutes) || 0;
    const acc = typed ? Math.round((correct / typed) * 100) : 100;
    return { wpm, acc, time: (elapsedMs / 1000).toFixed(1), progress: idx / text.length };
  }

  function tick() {
    if (finished) return;
    onProgress(metrics());
    raf = requestAnimationFrame(tick);
  }

  function handleKey(e) {
    if (finished) return;
    if (!startTime) {
      startTime = performance.now();
      tick();
    }

    if (e.key === "Backspace") {
      if (idx > 0) {
        idx--;
        const c = chars[idx];
        c.classList.remove("correct", "incorrect");
      }
      setCurrent();
      e.preventDefault();
      return;
    }

    if (e.key.length !== 1) return; // ignore shift, arrows, etc.
    e.preventDefault();

    const expected = text[idx];
    typed++;
    if (e.key === expected) {
      chars[idx].classList.add("correct");
      chars[idx].classList.remove("incorrect");
      correct++;
    } else {
      chars[idx].classList.add("incorrect");
      chars[idx].classList.remove("correct");
    }
    idx++;
    setCurrent();

    if (idx >= text.length) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    const m = metrics();
    onFinish(m);
  }

  function start() {
    setCurrent();
    hiddenInput.focus();
    hiddenInput.addEventListener("keydown", handleKey);
    // keep focus on the invisible input
    wordsEl.closest(".type-stage").addEventListener("click", () => hiddenInput.focus());
  }

  function destroy() {
    finished = true;
    cancelAnimationFrame(raf);
    hiddenInput.removeEventListener("keydown", handleKey);
  }

  return { start, destroy, finish, metrics };
}
