# Architecture and scalability notes

## Current architecture

The application is a modular monolith. Express routes define the HTTP surface, middleware handles cross-cutting concerns, controllers translate requests and responses, services contain business logic, and Mongoose models access MongoDB.

This structure keeps deployment simple while preserving boundaries that can be tested and, if necessary, extracted later. A microservice split is not justified by the current feature set.

## Redirect path

Redirects are the latency-sensitive path:

1. Redis is checked when configured.
2. A cache hit is still validated against MongoDB for active and expiration state.
3. MongoDB atomically increments `clickCount`.
4. A valid destination produces a `302`.
5. Click-event persistence happens asynchronously.

The authoritative MongoDB check prevents stale Redis entries from redirecting to links that have been deactivated or expired. The trade-off is that the current cache hit still performs a MongoDB operation. A future design could use versioned invalidation or trusted short TTLs to reduce that read, but would need stronger stale-data guarantees.

## Short-code design

Codes use cryptographically secure random bytes encoded as Base64 URL-safe characters. Random generation is simple and does not expose insertion volume. It is not collision-free: the application retries bounded candidates, and MongoDB's unique index is the final concurrency-safe guarantee.

Base62-encoded sequential IDs can produce shorter predictable codes but expose ordering and require an ID allocation strategy. Hash-based codes can be deterministic but need collision handling and careful treatment of input changes.

## Index decisions

- `urls.shortCode` unique index supports redirect lookup and enforces uniqueness.
- `users.email` unique index supports login lookup and prevents duplicate accounts.
- `clickEvents.urlId` and `clickedAt` indexes support event filtering.
- `{ urlId: 1, clickedAt: -1 }` supports recent-event queries for one URL.

Indexes improve reads but consume storage and add write cost. They should be confirmed with query plans against representative data.

## Analytics trade-off

The URL document stores `clickCount` for fast totals. Individual click events store history needed for daily aggregation and recent-event views. The counter update and event insert are separate operations, so an event write failure can create an analytics-history gap while preserving the counter.

At higher traffic, a durable queue or stream should receive a click event after the redirect. A worker could batch counter updates and analytics aggregation. That introduces delivery semantics, retries, idempotency, and operational complexity.

## Security boundaries

Validation ensures input shape and allowed URL protocols. Authentication verifies a JWT. Authorization scopes URL queries by the authenticated user ID. Rate limiting limits request frequency. These are separate controls and none replaces the others.

The service does not fetch destination URLs, so URL previews and redirect-following SSRF risks are outside the current implementation. If fetching is added, private address ranges, DNS rebinding, redirects, and protocol restrictions must be handled explicitly.

## Deployment model

The production Docker image contains only runtime dependencies and source files and runs as the non-root `node` user. Docker Compose provides a local stack, not a production orchestration policy.

Production should provide:

- Managed MongoDB with backups and restricted network access.
- Authenticated, private Redis if caching is enabled.
- TLS termination.
- Secret management.
- Centralized logs and metrics.
- Health monitoring and alerting.
- Resource limits and horizontal scaling policy.

If multiple API instances are deployed, the current process-local rate-limit store is insufficient for a global limit. Use a shared rate-limit store before relying on those limits for abuse prevention.

## Capacity-estimation framework

No benchmark results are claimed. A deployment estimate should state assumptions first:

- Redirect requests per second.
- Percentage of cacheable redirects.
- Average event document size.
- Retention period.
- Management API traffic.
- Availability target.

For example, if a system receives `R` redirects per second and stores one event per redirect, approximate event writes per day as:

```text
R * 86,400
```

Storage should then include average serialized event size, index overhead, replication, and retention. These calculations are planning estimates, not evidence of production capacity.

## When to split services

A modular monolith remains appropriate while the API, redirect path, analytics writes, and operational scale can be deployed and operated together. Service separation becomes more defensible when:

- Redirect traffic requires independent scaling from management APIs.
- Analytics processing requires a separate queue and worker fleet.
- Teams need independent release ownership.
- Different availability or data-retention requirements emerge.
- A measured bottleneck cannot be solved inside the monolith.

The split should follow measured operational boundaries rather than assumed scale.
