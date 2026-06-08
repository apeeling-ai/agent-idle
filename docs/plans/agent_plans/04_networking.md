# Agent 04 — Networking

> Greenfield. Owns the movement of events and state between sensors, clients, server,
> and phone — with offline tolerance, exactly-once feeds, and live pushes.

---

## 1. Mandate

Make the data flow reliable and private. Sensors emit signed events; clients send and
receive state; the phone reads what the laptop fed; nobody loses or double-counts a
feed when the network hiccups; and prompt content never travels.

## 2. Topology

```
sensors ──signed events──▶ server (authority: ledger + reduce)
clients ──events + reads──▶ server
server  ──WebSocket push──▶ clients (pet fed / rank changed / unlock)
clients ──local cache────  SQLite (desktop), in-memory (mobile)
```

## 3. Transport decisions

- **REST** for state reads/writes and event submission.
- **WebSocket** for live pushes (one per logged-in client): "pet ate", "rank
  changed", "cosmetic unlocked". Pushes are hints; the client can always reconcile via
  REST.
- **Local-first** in Phases 1–3: the same event pipe targets `localhost`; flipping to
  cloud is a base-URL change, not a rewrite.

## 4. The event pipe (the core reliability problem)

Feeds must be **exactly-once** in effect, even over flaky networks:
- Every event carries an **idempotencyKey**; the server dedupes on it. Re-sending after
  a timeout is safe.
- The client **batches** events and posts with **retry + exponential backoff**.
- Unsent events persist to the local cache first (write-ahead), so a crash mid-send
  loses nothing.
- The server appends accepted events to the **append-only ledger** and never mutates
  past entries.

## 5. Sensor → server security

- Each event from a sensor is **HMAC-signed** with a per-account secret provisioned at
  link time. Randoms can't POST to your account.
- The server verifies the signature before accepting (records `hmacValid`).
- **Privacy on the wire:** the payload carries counts + a coarse quality score only.
  There is no field for prompt text or source — enforced by the shared event schema,
  not by trust. This is the structural privacy invariant from the Architect.

## 6. Sync & reconciliation

- **Save sync:** last-write-wins on `updatedAt` for the mutable save (cosmetics
  equipped, entity positions). Cheap, sufficient; no CRDT needed at this scale.
- **Authoritative stats** are never synced *up* — they're derived by the server from
  the ledger and pushed *down*. The client's local score is a preview only.
- **Conflict rule:** on any disagreement, server stats win; client reconciles.

## 7. Offline behavior

- Desktop keeps a SQLite cache; the pet keeps living locally via the engine `tick`
  while offline. On reconnect, queued events flush (idempotent) and the client pulls
  authoritative stats.
- Mobile, offline, shows last-known state read-only and queues taps to flush on
  reconnect.

## 8. Real-time fan-out

- The "watch your phone show the pet eating as your laptop codes" moment is a server
  push to all of an account's connected clients when a feed is ingested.
- Keep pushes small (a delta, not a full save); clients apply the delta and can
  re-pull on doubt.

## 9. Phased delivery

- **P1–2:** localhost dev bus; no real network; the event pipe exists but points local.
- **P3:** the Claude Code sensor posts signed events to the local bus.
- **P4:** promote to the cloud server; introduce auth tokens on the socket; SQLite
  becomes the offline cache.
- **P5:** mobile client joins the same socket.
- **P6:** rank-change pushes added for leaderboards.

## 10. Interfaces & handoffs

- **Consumes:** Engine's `Event` shape; Architect's idempotency + privacy invariants.
- **Produces:** the event client (batch/sign/retry/idempotency), the WebSocket layer,
  the offline cache + reconciliation, the localhost dev bus.
- **Feeds:** Leaderboards (the verified ingested stream), Frontend (the live channel).

## 11. Risks

- **Double-feeding / lost feeds** → idempotency keys + write-ahead cache.
- **Replay/forgery of sensor events** → HMAC + server-side rate sanity (shared with
  Leaderboards).
- **Socket scaling** → pushes are best-effort hints; REST reconciliation is the
  safety net, so the socket can drop without correctness loss.
- **Privacy leak via payload creep** → schema review on every new event field.

## 12. Open decisions surfaced

- **D2** (from Research): if a game-BaaS owns the socket/realtime, this agent
  integrates rather than builds that layer. Resolve via the Research spike.
- Self-hosted socket vs managed realtime at launch (cost/ops).

## 13. Definition of done

Two clients on one account converge live; killing the network mid-feed loses nothing
and double-feeds nothing on recovery; no payload ever contains content; the local-to-
cloud switch is a config change.

## 14. First three tasks

1. Build the event client (batch, sign, retry, idempotency) against the localhost bus.
2. Implement server-side dedupe + append-only ledger insert.
3. Stand up the WebSocket push for "pet fed" and prove two-client convergence.
