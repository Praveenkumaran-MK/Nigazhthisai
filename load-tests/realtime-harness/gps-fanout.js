#!/usr/bin/env node
// Scenario 3 — GPS Broadcast fan-out (see ../README.md).
//
// Measures delivery latency/loss as subscriber count scales, using the
// REAL @supabase/supabase-js client (k6 doesn't speak the Phoenix protocol
// Supabase Realtime uses, so this can't be a k6 script). Uses a synthetic
// channel name, not a real route — Broadcast channels in this app aren't
// RLS-scoped, so this test creates ZERO persistent data (no auth users, no
// DB rows) and is the lowest-risk script in this entire suite to run
// against a shared project.
//
// Usage:
//   node gps-fanout.js --subscribers=100 [--messages=20] [--interval=500]
//
// Required env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or
// VITE_SUPABASE_ANON_KEY) — falls back to the VITE_ names so you can just
// `export $(grep -v '^#' ../../.env | xargs)` and run this directly.

import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const SUBSCRIBER_COUNT = Number(args.subscribers || 100);
const MESSAGE_COUNT = Number(args.messages || 20);
const INTERVAL_MS = Number(args.interval || 500);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Set SUPABASE_URL/SUPABASE_ANON_KEY (or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) in the environment.");
  process.exit(1);
}

// Must match packages/shared-types/src/realtime.ts's routeChannelName().
// "loadtest-<timestamp>" is not a real route id — nothing in the DB needs
// to exist for this test.
const CHANNEL_NAME = `room:route_loadtest-${Date.now()}`;
const BROADCAST_EVENT = "gps-telemetry";

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.min(sortedArr.length - 1, Math.floor((p / 100) * sortedArr.length));
  return sortedArr[idx];
}

async function main() {
  console.log(
    `GPS fan-out: ${SUBSCRIBER_COUNT} subscribers, ${MESSAGE_COUNT} messages @ ${INTERVAL_MS}ms, channel "${CHANNEL_NAME}"`,
  );

  const receipts = []; // { subscriberId, seq, latencyMs }
  const subscriberClients = [];
  const subscribeErrors = [];

  const subscriberPromises = Array.from({ length: SUBSCRIBER_COUNT }, (_, i) => {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    subscriberClients.push(client);
    const channel = client.channel(CHANNEL_NAME, { config: { broadcast: { self: false } } });

    channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
      receipts.push({ subscriberId: i, seq: payload.seq, latencyMs: Date.now() - payload.sentAt });
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        subscribeErrors.push(i);
        resolve();
      }, 15_000);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          subscribeErrors.push(i);
          resolve();
        }
      });
    });
  });

  console.log("Waiting for all subscribers to join...");
  await Promise.all(subscriberPromises);
  const joined = SUBSCRIBER_COUNT - subscribeErrors.length;
  console.log(`${joined}/${SUBSCRIBER_COUNT} subscribers joined (${subscribeErrors.length} failed/timed out).`);

  const publisherClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const publisherChannel = publisherClient.channel(CHANNEL_NAME, {
    config: { broadcast: { self: false, ack: false } },
  });
  await new Promise((resolve) => publisherChannel.subscribe((status) => status === "SUBSCRIBED" && resolve()));

  console.log(`Publishing ${MESSAGE_COUNT} messages...`);
  for (let seq = 0; seq < MESSAGE_COUNT; seq++) {
    await publisherChannel.send({ type: "broadcast", event: BROADCAST_EVENT, payload: { seq, sentAt: Date.now() } });
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  console.log("Waiting 3s for stragglers...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // --- Report ---
  const expected = joined * MESSAGE_COUNT;
  const actual = receipts.length;
  const lossRate = expected > 0 ? (1 - actual / expected) * 100 : 100;
  const latencies = receipts.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;

  console.log("\n=== GPS Broadcast Fan-out Results ===");
  console.log(`Subscribers joined:     ${joined}/${SUBSCRIBER_COUNT}`);
  console.log(`Messages sent:          ${MESSAGE_COUNT}`);
  console.log(`Expected receipts:      ${expected}`);
  console.log(`Actual receipts:        ${actual}`);
  console.log(`Loss rate:              ${lossRate.toFixed(2)}%`);
  console.log(`Latency avg:            ${avg !== null ? avg.toFixed(1) + "ms" : "n/a"}`);
  console.log(`Latency p50:            ${percentile(latencies, 50) ?? "n/a"}ms`);
  console.log(`Latency p95:            ${percentile(latencies, 95) ?? "n/a"}ms`);
  console.log(`Latency max:            ${latencies.length ? latencies[latencies.length - 1] : "n/a"}ms`);
  console.log("======================================\n");

  // Cleanup
  await Promise.all(subscriberClients.map((c) => c.removeAllChannels()));
  await publisherClient.removeAllChannels();
  process.exit(0);
}

main().catch((err) => {
  console.error("gps-fanout failed:", err);
  process.exit(1);
});
