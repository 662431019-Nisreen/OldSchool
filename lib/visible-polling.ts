type PollOptions = {
  intervalMs?: number;
  immediate?: boolean;
  onError?: (error: unknown) => void;
};

// One request at a time, only while the page is visible and connected.
export function startVisiblePolling(
  refresh: (signal: AbortSignal) => Promise<void>,
  { intervalMs = 10_000, immediate = true, onError }: PollOptions = {},
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | undefined;
  const canRefresh = () =>
    !stopped &&
    document.visibilityState !== "hidden" &&
    navigator.onLine !== false;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clearTimer();
    if (canRefresh()) timer = setTimeout(() => void poll(), intervalMs);
  };
  const poll = async () => {
    if (active || !canRefresh()) return;
    clearTimer();
    const controller = new AbortController();
    active = controller;
    try {
      await refresh(controller.signal);
    } catch (error) {
      if (!stopped && !controller.signal.aborted) onError?.(error);
    } finally {
      active = undefined;
      schedule();
    }
  };
  const resume = () => {
    clearTimer();
    if (canRefresh()) void poll();
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  window.addEventListener("offline", resume);
  window.addEventListener("focus", resume);
  if (immediate) void poll();
  else schedule();
  return () => {
    stopped = true;
    clearTimer();
    active?.abort();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
    window.removeEventListener("offline", resume);
    window.removeEventListener("focus", resume);
  };
}
