# MyMob PRD audit — 31 October 2026

Baseline: `../../PRD.md` (30 October 2026), server commit
`2cb391b447f454f29f5226a0031f6ad28d438786`, iOS commit
`553b3691d6883bf6164468a700c7e1717b7b7dd8`.

Most feature families exist. The project is not yet fully compliant with the
PRD: consent revocation, shared-phone notification routing, retry safety,
sync completeness and youth onboarding need work before claiming the privacy
and offline guarantees. This is an audit, not an implementation of the gaps.
Findings are source-based unless explicitly marked as executed below.
The companion [iOS audit](../../app/docs/PRD-AUDIT.md) gives client-specific evidence.

## Fix first

### 1. Revoking a carer does not remove their cached health data (P0)

`lib/health.ts:27` correctly filters subsequent reads to active carers. However,
`lib/sync.ts:110` and `:132` send only currently visible appointments, without
appointment removal IDs or an authoritative visibility set. iOS only upserts
those records and continues displaying the cached appointments after revocation.
The full response includes revoked carer relationships, but the client does not
use them to purge appointments; lite sync does not include those relationships.

**Acceptance:** cache a patient's appointments on the carer's device, revoke
consent, then sync both normally and in satellite mode. The appointments and
their details must disappear. Also test patient-link access withdrawal and
newly granted access to appointments older than the current delta cursor.
An offline device cannot learn about a new revocation until reconnecting;
the confirmed defect is continued access after successful sync.

### 2. Shared-device pushes are not routed to the active profile (P0)

`app/api/devices/route.ts:12` retains registrations keyed by user and device;
it does not deactivate the previous profile. `lib/notify.ts:130` sends to every
registered token for the user. iOS displays incoming notifications and opens
the current profile's Calendar without checking recipient identity.
Generic notification text is implemented, but profile routing is not.

**Acceptance:** switch from patient A to B on a shared phone, send A a reminder,
and verify that it neither appears as B's reminder nor opens B's calendar as
though it belonged to B. Preserve PIN protection when routing to A.

### 3. Offline cache invalidation is incomplete for moderated content (P0)

`lib/sync.ts:84` fetches only published posts or the actor's own posts, then
computes rejection removals from that result at `:101–104`. Once an Elder
rejects a previously published post, other readers cannot receive its removal
ID because it no longer matches the query. Membership removal similarly
excludes a group's content without communicating deletions to the cache.
The existing smoke test checks rejection removals for the **author** only.

**Acceptance:** a different member caches a published post; reject it and sync.
The member must lose the post and cached comments. Repeat after membership
removal and any change that makes content culturally inaccessible.

### 4. Delta cursors can skip changes permanently (P0)

`lib/sync.ts:88,98` limits full content pages to 100/200 posts and 100 events;
lite sync caps appointments at 20 (`:155`) and notices at 10 (`:181`). Both
advance the cursor to the current server time (`:116,162`) without pagination
or an indication that capped rows still need delivery. More changes than a
limit can leave rows permanently behind the cursor.

**Acceptance:** create more than each cap between syncs and drain all changes
without loss. Cursor advancement must reflect the delivered page, including
ties in update timestamps and changes arriving during a request. Separately,
bound and prioritize the client's outgoing queue; see the iOS audit.

### 5. Retry identity is lost in the iOS direct-to-offline fallback (P0)

The direct post request and queued retry use different mutation IDs; a server
commit followed by a dropped response can therefore produce two posts. Comment
reaction fallback can similarly toggle an already-applied reaction again.
See the iOS audit for exact locations.

**Acceptance:** drop the response after the server commits, reconnect, and
assert one post / the intended reaction state. Use one mutation identity and
explicit reaction state throughout the attempt and retry.

### 6. New youth cannot complete the required guardian-consent journey (P0)

`app/api/auth/otp/verify/route.ts:6` accepts phone, code and name, not birth date
or guardian. No profile-update route supplies these fields.
`lib/governance.ts:16` requires consent only for a **known** age under 18, so
new accounts with unknown age can be approved without the youth check.
`app/api/memberships/[id]/guardian-consent/route.ts` exists, but the app has no
guardian linking or consent UI. Seeded relationships do not close this gap.

**Acceptance:** register a new minor, link a guardian, obtain their explicit
consent and then allow Elder approval. Verify that skipping age/guardian data
cannot silently bypass the intended safeguard. No direct-messaging feature was
found; do not add one merely to satisfy the PRD's prohibition on adult/minor DMs.

## Other missing or partial requirements

| Requirement | Evidence and remaining work | Priority |
| --- | --- | --- |
| Clinic can edit appointments | `lib/provider.ts:77–87` has an update helper, but its only portal caller (`app/(portal)/provider/actions.ts:50–53`) changes status. The appointments page has booking and attended/missed/cancel buttons, no edit/reschedule form. Expose validated editing and verify changed details/reminders reach the patient. | P0 role capability |
| Carers cannot edit appointments | `lib/health.ts:61–73` explicitly lets active carers change booked appointments to confirmed. This exceeds the PRD's read/reminder-only carer role. Restrict confirmation to the patient or explicitly revise the requirement. | P0 role mismatch |
| SMS fallback when push is not delivered | `lib/notify.ts:110` treats APNs acceptance (HTTP 200) as success. `lib/health.ts:205–213` falls back only on immediate failure/no device. There is no receipt/timeout handling for an accepted but undelivered push. Define a delivery/acknowledgement policy and test the fallback. | P0 partial |
| Minimum cell size of five | Insight SQL suppresses when the total cohort has fewer than five appointments; it still exposes outcome counts of 1–4 and corresponding rates when the total is larger. See both insight-view migrations. The PRD says every provider-facing number has the threshold. Clarify the intended cell definition and implement outcome/complementary suppression if literal; test that totals/rates cannot reconstruct hidden cells. | P0 privacy mismatch |
| Provider registration | Admin onboarding and verification exist; provider self-registration described in the PRD does not. Decide whether admin-assisted onboarding is the agreed demo substitute. | Supporting journey |
| Community scoping | `lib/db.ts:20` scopes six content models, not every row/model as the PRD states. Health uses separate patient/provider predicates; many governance operations use explicit checks with unscoped `db`. This is an architecture deviation, not proof of a cross-community leak. Document the actual boundary and add cross-role/cross-community integration coverage. | Guarantee/verification |
| Cultural controls | Gender/age checks and normal deceased warnings exist. Elders bypass restrictions outside a dedicated moderation view (`lib/content.ts:26`); lite notices omit warning metadata (`lib/sync.ts:181`). Resolve the Elder exception and preserve warnings in lite payloads. | P1 |
| Sorry-business mute | Elder-only creation, default comments-off, no images and 14-day cron archival exist. The iOS mute preference has no consumer or server registration. | P1 |
| Service directory | `/api/services` exists; no iOS directory screen or offline service cache. The web service-gap map is a separate implemented feature. | P1 |
| Elder nomination | Web nomination and admin verification exist; no in-app nomination. Seeded verified Elders satisfy the P0 demo fallback. | P1 |
| Community export | JSON/CSV export exists, limited to members, posts and events in one group. Comments, reactions and subgroup data are not a complete community export. Health exclusion is appropriate. | P1 partial |
| Supported iOS version | App deployment target is 27.0; PRD specifies 26.1+. Verify APIs and lower target or record an accepted scope change. | Platform mismatch |

## Coverage that already exists

These are source-level implementations, not claims that every live journey was
rehearsed successfully.

| PRD area | Existing implementation |
| --- | --- |
| Phone authentication | Better Auth phone plugin, bearer/cookie sessions, SNS integration, demo/outbox fallback; app PIN and profile switching |
| Elder governance | Join/search/code, approval/removal, post approval/pinning, provider access decisions, moderation queues |
| Events and conversation | Events, queued RSVP, one-level comments/replies, immediate publishing, reactions, reporting, hide/remove and lock/comment settings |
| Clinic to patient | Mobile invitation, acceptance, booking/cancellation, appointment details, nominated carers, explicit logged consent/revocation |
| Reminders | 48-hour and 2-hour scheduling, APNs/SNS adapters, generic text, cron route and local cron container |
| Offline and satellite | SwiftData cache/queue, full/lite endpoints, gzip, client mutation records, dedicated constrained transport and demo toggle; correctness gaps above |
| Insights | SQL views plus dashboard code for missed appointments, reminder effectiveness, engagement and service gaps; fictional seeded history |
| Language readiness | next-intl, String Catalog, placeholder language and community-managed translation workflow |
| Governance documentation | `docs/breach-response.md`, API contract, deployment/environment and demo instructions |

## Executed checks and limits

- `pnpm test`: **28 tests passed in four files**.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- Read-only queries against the running local Postgres succeeded: 145 rows in
  `v_dna_weekly`, 8 in `v_reminder_effectiveness`, 54 in `v_weekly_active`,
  and 14 in `v_service_gap`. This establishes populated views, not rendered
  dashboard correctness or validity of the seeded hypotheses.
- The Docker app, database and cron containers were running. No database reset
  or seed was performed. The smoke script requires a freshly seeded database
  and changes demo state; it was inspected but not run against this existing
  instance. It does not exercise clinic booking through the web portal or the
  revocation/large-delta cases above.
- No iOS build, simulator/device flow, browser rehearsal, production build,
  actual SMS/APNs delivery or Network Link Conditioner test was performed.
  Existing tests do not establish these outcomes.

## External/demo readiness still to establish

The repository supplies Docker deployment and Sydney-region defaults, but no
evidence inspected here establishes a live AWS Sydney deployment, RDS region,
SNS sandbox approvals or APNs delivery. The outbox is a PRD-permitted fallback;
label it as such in the demo. Apple satellite entitlements and live carrier
testing are explicitly post-datathon, not missing P0 prototype work.

Still rehearse both complete device/web flows (including a second carer device,
offline confirmation, SMS/outbox and satellite payload), time them below 3.5
minutes twice, and record the backup demo. The PRD's partner, cultural-adviser,
naming/trademark and carrier questions remain external decisions; this code
audit does not resolve them. Production certification, PMS integration,
Android and real patient data remain out of scope.
