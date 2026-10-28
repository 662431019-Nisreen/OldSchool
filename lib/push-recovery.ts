// The durable outbox lives in D1. This per-isolate timer only avoids redundant
// recovery lookups while customers and staff poll the same API.
export function createPushRecoverySchedule(intervalMs = 30_000) {
  let nextCheckAt = 0;
  return {
    shouldCheck(request: Request, response: Response, now = Date.now()) {
      if (new URL(request.url).pathname !== "/api/pos") return false;
      // New orders and late subscriptions must dispatch immediately, including
      // when another recovery check is still running. Atomic event claims in
      // processPushEvent prevent the two requests from sending the same event.
      const mutation = request.method === "POST" && response.ok;
      if (!mutation && (request.method !== "GET" || now < nextCheckAt))
        return false;
      nextCheckAt = now + intervalMs;
      return true;
    },
    failed() {
      // A transient D1 failure must not suppress the next recovery opportunity.
      nextCheckAt = 0;
    },
  };
}
