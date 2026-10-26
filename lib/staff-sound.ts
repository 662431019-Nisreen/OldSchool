type AlertOrder = { id: number | string; status: string };
// A successful first snapshot establishes the baseline, including when it is empty.
export function createArrivalTracker() {
  let initialized = false;
  const seen = new Set<string>();
  return (orders: AlertOrder[]) => {
    let arrivals = 0;
    for (const order of orders) {
      const id = String(order.id);
      if (initialized && !seen.has(id) && order.status === "waiting") arrivals++;
      seen.add(id);
    }
    initialized = true;
    return arrivals;
  };
}
export function playOrderChime(context: AudioContext) {
  if (context.state !== "running") return false;
  const start = context.currentTime + 0.02;
  for (const [index, frequency] of [660, 880, 1046.5].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const at = start + index * 0.22;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.2, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at);
    oscillator.stop(at + 0.34);
  }
  return true;
}
