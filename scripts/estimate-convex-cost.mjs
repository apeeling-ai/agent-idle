#!/usr/bin/env node

/**
 * Estimate Convex monthly cost for Agent Idle traffic.
 *
 * Pricing defaults are copied from Convex Professional pricing observed on
 * 2026-06-24. Treat this as a planning model, not an invoice: real DB I/O and
 * egress depend on serialized document sizes and reactive query invalidations.
 */

const PRICING = {
  developerBaseUsd: 25,
  includedFunctionCalls: 25_000_000,
  functionCallsPerMillionUsd: 2,
  includedDbStorageGb: 50,
  dbStoragePerGbUsd: 0.20,
  includedDbIoGb: 50,
  dbIoPerGbUsd: 0.20,
  includedEgressGb: 50,
  egressPerGbUsd: 0.12,
};

const DEFAULTS = {
  users: 10_000,
  days: 30,
  connectedQueriesPerUser: 3,
  eventRatesPerMinute: [0.2, 1, 2, 5, 10],
  rawEventsPerWrite: 1,
  targetMonthlyUsd: 217,
  targetRawEventsPerWrite: 300,
  reactiveQueryRefreshesPerEvent: 2,
  dbIoKbPerEvent: 35,
  egressKbPerEvent: 8,
  storedKbPerEvent: 1.5,
};

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (value == null) continue;
    if (key === "rates") opts.eventRatesPerMinute = value.split(",").map(Number);
    else if (key in opts) opts[key] = Number(value);
  }
  return opts;
}

function dollars(value) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function gbFromKb(kb) {
  return kb / 1024 / 1024;
}

function overage(value, included, unitPrice) {
  return Math.max(0, value - included) * unitPrice;
}

function simulate(rate, opts) {
  const minutes = opts.days * 24 * 60;
  const rawEvents = opts.users * rate * minutes;
  const events = rawEvents / opts.rawEventsPerWrite;
  const initialQueries = opts.users * opts.connectedQueriesPerUser;
  const functionCalls = initialQueries + events * (1 + opts.reactiveQueryRefreshesPerEvent);
  const dbIoGb = gbFromKb(events * opts.dbIoKbPerEvent);
  const egressGb = gbFromKb(events * opts.egressKbPerEvent);
  const storageGb = gbFromKb(events * opts.storedKbPerEvent);

  const functionCallsUsd = overage(
    functionCalls / 1_000_000,
    PRICING.includedFunctionCalls / 1_000_000,
    PRICING.functionCallsPerMillionUsd,
  );
  const dbIoUsd = overage(dbIoGb, PRICING.includedDbIoGb, PRICING.dbIoPerGbUsd);
  const egressUsd = overage(egressGb, PRICING.includedEgressGb, PRICING.egressPerGbUsd);
  const storageUsd = overage(storageGb, PRICING.includedDbStorageGb, PRICING.dbStoragePerGbUsd);
  const totalUsd = PRICING.developerBaseUsd + functionCallsUsd + dbIoUsd + egressUsd + storageUsd;

  return {
    rate,
    rawEvents,
    events,
    functionCalls,
    dbIoGb,
    egressGb,
    storageGb,
    functionCallsUsd,
    dbIoUsd,
    egressUsd,
    storageUsd,
    totalUsd,
  };
}

function fmtNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

function fmtGb(value) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} GB`;
}

const opts = parseArgs(process.argv.slice(2));
const rows = opts.eventRatesPerMinute.map((rate) => simulate(rate, opts));

console.log("Agent Idle Convex cost estimate");
console.log("");
console.log("Assumptions");
console.log(`  users: ${fmtNumber(opts.users)}`);
  console.log(`  period: ${opts.days} days`);
  console.log(`  connected queries/user: ${opts.connectedQueriesPerUser}`);
  console.log(`  raw events/write: ${opts.rawEventsPerWrite}`);
  console.log(`  reactive query refreshes/event: ${opts.reactiveQueryRefreshesPerEvent}`);
console.log(`  DB I/O/event: ${opts.dbIoKbPerEvent} KB`);
console.log(`  egress/event: ${opts.egressKbPerEvent} KB`);
console.log(`  stored ledger+index/event: ${opts.storedKbPerEvent} KB`);
console.log("");
console.log(
  [
    "events/min/player",
    "raw events",
    "Convex writes",
    "function calls",
    "DB I/O",
    "egress",
    "new storage",
    "est. bill",
  ].join("\t"),
);

for (const row of rows) {
  console.log(
    [
      row.rate,
      fmtNumber(row.rawEvents),
      fmtNumber(row.events),
      fmtNumber(row.functionCalls),
      fmtGb(row.dbIoGb),
      fmtGb(row.egressGb),
      fmtGb(row.storageGb),
      dollars(row.totalUsd),
    ].join("\t"),
  );
}

console.log("");
console.log("Cost breakdown at highest rate");
const high = rows.at(-1);
console.log(`  base: ${dollars(PRICING.developerBaseUsd)}`);
console.log(`  function calls: ${dollars(high.functionCallsUsd)}`);
console.log(`  DB I/O: ${dollars(high.dbIoUsd)}`);
console.log(`  egress: ${dollars(high.egressUsd)}`);
console.log(`  DB storage: ${dollars(high.storageUsd)}`);

if (opts.targetMonthlyUsd > 0) {
  console.log("");
  console.log(`Target check: ${dollars(opts.targetMonthlyUsd)} / month`);
  for (const row of rows) {
    const ok = row.totalUsd <= opts.targetMonthlyUsd ? "OK" : "OVER";
    console.log(`  ${row.rate} events/min/player: ${ok} (${dollars(row.totalUsd)})`);
  }
  const highestRate = opts.eventRatesPerMinute.at(-1);
  if (opts.rawEventsPerWrite < opts.targetRawEventsPerWrite && highestRate >= 10) {
    console.log("");
    console.log(
      `Budget mode suggestion: rerun with --rawEventsPerWrite=${opts.targetRawEventsPerWrite} for the 10 events/min/player target.`,
    );
  }
}
