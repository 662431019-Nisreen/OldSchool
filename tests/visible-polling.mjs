import assert from "node:assert/strict";
import { startVisiblePolling } from "../lib/visible-polling.ts";

// Advance promise continuations without relying on real time or browser globals.
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class Surface {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener();
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

class Clock {
  now = 0;
  nextId = 0;
  timers = new Map();
  setTimeout = (callback, delay) => {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.now + delay, callback });
    return id;
  };
  clearTimeout = (id) => this.timers.delete(id);
  async advance(ms) {
    const end = this.now + ms;
    let executions = 0;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(++executions < 1000, "polling must not create a busy timer loop");
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    this.now = end;
    await flush();
  }
  get dueAt() {
    return [...this.timers.values()].map((timer) => timer.at).sort((a, b) => a - b);
  }
}

async function scenario(name, run, initial = {}) {
  const clock = new Clock();
  const document = Object.assign(new Surface(), {
    visibilityState: initial.hidden ? "hidden" : "visible",
  });
  const window = new Surface();
  const navigator = { onLine: initial.online !== false };
  const values = {
    document,
    window,
    navigator,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  };
  const originals = new Map();
  for (const [name, value] of Object.entries(values)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  try {
    await run({ clock, document, window, navigator });
    console.log(`PASS: ${name}`);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

await scenario("visible polling starts immediately and uses a 10-second interval", async ({ clock }) => {
  const started = [];
  const stop = startVisiblePolling(async (signal) => {
    assert.equal(signal.aborted, false);
    started.push(clock.now);
  });
  await flush();
  assert.deepEqual(started, [0]);
  assert.deepEqual(clock.dueAt, [10_000]);
  await clock.advance(9999);
  assert.deepEqual(started, [0]);
  await clock.advance(1);
  assert.deepEqual(started, [0, 10_000]);
  await clock.advance(10_000);
  assert.deepEqual(started, [0, 10_000, 20_000]);
  stop();
  assert.equal(clock.timers.size, 0);
});

await scenario("hidden pages wait, pause timers, and refresh when visible", async ({ clock, document, window }) => {
  let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; });
  await flush();
  assert.equal(calls, 0);
  assert.equal(clock.timers.size, 0);
  window.emit("focus");
  await clock.advance(30_000);
  assert.equal(calls, 0, "focus must not poll a hidden page");
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  await flush();
  assert.equal(calls, 1);
  assert.deepEqual(clock.dueAt, [40_000]);
  document.visibilityState = "hidden";
  document.emit("visibilitychange");
  assert.equal(clock.timers.size, 0);
  await clock.advance(30_000);
  assert.equal(calls, 1);
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  await flush();
  assert.equal(calls, 2, "returning to the page must fetch immediately");
  stop();
}, { hidden: true });

await scenario("offline pages wait and reconnect only while visible", async ({ clock, document, window, navigator }) => {
  let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; });
  window.emit("focus");
  await clock.advance(30_000);
  assert.equal(calls, 0);
  assert.equal(clock.timers.size, 0);
  navigator.onLine = true;
  window.emit("online");
  await flush();
  assert.equal(calls, 1);
  navigator.onLine = false;
  window.emit("offline");
  assert.equal(clock.timers.size, 0);
  await clock.advance(30_000);
  assert.equal(calls, 1);
  document.visibilityState = "hidden";
  document.emit("visibilitychange");
  navigator.onLine = true;
  window.emit("online");
  await flush();
  assert.equal(calls, 1, "reconnecting must not wake a hidden page");
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  await flush();
  assert.equal(calls, 2);
  stop();
}, { online: false });

await scenario("focus refreshes now and replaces the old scheduled request", async ({ clock, window }) => {
  const started = [];
  const stop = startVisiblePolling(async () => { started.push(clock.now); });
  await flush();
  await clock.advance(5000);
  window.emit("focus");
  await flush();
  assert.deepEqual(started, [0, 5000]);
  assert.deepEqual(clock.dueAt, [15_000]);
  await clock.advance(5000);
  assert.deepEqual(started, [0, 5000], "the superseded timer must not fire");
  await clock.advance(5000);
  assert.deepEqual(started, [0, 5000, 15_000]);
  stop();
});

await scenario("slow requests never overlap and the next interval starts after completion", async ({ clock, document, window }) => {
  const pending = deferred();
  const started = [];
  const stop = startVisiblePolling(async () => {
    started.push(clock.now);
    if (started.length === 1) await pending.promise;
  });
  await clock.advance(30_000);
  window.emit("focus");
  window.emit("online");
  document.emit("visibilitychange");
  await flush();
  assert.deepEqual(started, [0]);
  assert.equal(clock.timers.size, 0, "a pending request must not retain a repeating timer");
  pending.resolve();
  await flush();
  assert.deepEqual(clock.dueAt, [40_000]);
  await clock.advance(9999);
  assert.deepEqual(started, [0]);
  await clock.advance(1);
  assert.deepEqual(started, [0, 40_000]);
  stop();
});

await scenario("hiding during a request prevents background rescheduling", async ({ clock, document }) => {
  const pending = deferred();
  let calls = 0;
  const stop = startVisiblePolling(async () => {
    calls++;
    if (calls === 1) await pending.promise;
  });
  document.visibilityState = "hidden";
  document.emit("visibilitychange");
  pending.resolve();
  await flush();
  assert.equal(clock.timers.size, 0);
  await clock.advance(30_000);
  assert.equal(calls, 1);
  document.visibilityState = "visible";
  document.emit("visibilitychange");
  await flush();
  assert.equal(calls, 2);
  stop();
});

await scenario("cleanup aborts the request, suppresses abort errors, and removes every listener", async ({ clock, document, window }) => {
  const errors = [];
  let calls = 0, requestSignal;
  const stop = startVisiblePolling((signal) => {
    calls++;
    requestSignal = signal;
    return new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true });
    });
  }, { onError: (error) => errors.push(error) });
  assert.equal(document.listenerCount, 1);
  assert.equal(window.listenerCount, 3);
  stop();
  assert.equal(requestSignal.aborted, true);
  await flush();
  assert.deepEqual(errors, []);
  assert.equal(document.listenerCount, 0);
  assert.equal(window.listenerCount, 0);
  assert.equal(clock.timers.size, 0);
  for (const type of ["focus", "online", "offline"]) window.emit(type);
  document.emit("visibilitychange");
  await clock.advance(30_000);
  assert.equal(calls, 1);
  stop();
});

await scenario("late completion after cleanup cannot schedule another request", async ({ clock }) => {
  const pending = deferred();
  let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; await pending.promise; });
  stop();
  pending.resolve();
  await flush();
  assert.equal(clock.timers.size, 0);
  await clock.advance(30_000);
  assert.equal(calls, 1);
});

await scenario("request failures are reported once and retry after the normal interval", async ({ clock }) => {
  const failure = new Error("temporarily disconnected");
  const errors = [];
  let calls = 0;
  const stop = startVisiblePolling(async () => {
    calls++;
    if (calls === 1) throw failure;
  }, { onError: (error) => errors.push(error) });
  await flush();
  assert.deepEqual(errors, [failure]);
  assert.equal(calls, 1);
  assert.deepEqual(clock.dueAt, [10_000]);
  await clock.advance(10_000);
  assert.equal(calls, 2);
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(clock.dueAt, [20_000]);
  stop();
});

await scenario("immediate false avoids a duplicate startup fetch", async ({ clock, document, window }) => {
  let calls = 0;
  const stop = startVisiblePolling(async () => { calls++; }, { immediate: false });
  await flush();
  assert.equal(calls, 0);
  assert.deepEqual(clock.dueAt, [10_000]);
  await clock.advance(9999);
  assert.equal(calls, 0);
  await clock.advance(1);
  assert.equal(calls, 1);
  stop();
  assert.equal(clock.timers.size, 0);
  assert.equal(document.listenerCount, 0);
  assert.equal(window.listenerCount, 0);
});

console.log("PASS: visible polling timing, lifecycle, connectivity, overlap, cleanup, and recovery");
