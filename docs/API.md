# MyMob iOS API

Base URL: `http://localhost:3000` in dev. All bodies are JSON. Dates are ISO 8601
strings with milliseconds (`2026-11-02T00:30:00.000Z`).

Authenticated requests send `Authorization: Bearer <token>`. Errors return
`{ "error": "message" }` with a 4xx/5xx status. `401` means the token is
missing or expired; `403` means the caller lacks the role for that action.

## Auth

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/auth/otp/send` | `{ phoneNumber }` (E.164, e.g. `+61400000003`) | `{ ok: true }` |
| POST | `/api/auth/otp/verify` | `{ phoneNumber, code, name? }` | `{ token, user: User }` |
| GET | `/api/me` | | `Me` |
| POST | `/api/devices` | `{ deviceId, apnsToken? }` | `{ ok: true }` |

In dev, the code is printed in the server log and the web outbox (`/admin/outbox`).
Seeded demo numbers also accept `DEMO_OTP_CODE` (default `123456`).

```
User   { id, name, phoneNumber, dateOfBirth?, gender? }
Me     { user: User, memberships: Membership[], isElderOf: string[] /* groupIds */ }
Membership { id, groupId, groupName, groupType, communityId, role: "member"|"elder", status: "pending"|"active"|"removed" }
```

## Groups and governance

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/groups/search?q=` | `GroupSummary[]` |
| POST | `/api/groups/join` | `{ joinCode }` or `{ groupId }` → `Membership` (status `pending`) |
| GET | `/api/groups/:id/feed` | `{ posts: Post[], events: Event[] }`, pinned posts first |
| POST | `/api/groups/:id/posts` | `{ body, title?, kind?, clientMutationId, urgent?, restrictGender?, minAge?, deceasedWarning? }` → `Post` |
| POST | `/api/groups/:id/events` | Elder only. `{ title, description?, category?, startsAt, endsAt?, location }` → `Event` |
| GET | `/api/groups/:id/moderation` | Elder only. `{ memberships: PendingMember[], posts: Post[], providerRequests: ProviderRequest[], reports: Report[] }` |
| POST | `/api/memberships/:id/approve` | Elder only |
| POST | `/api/memberships/:id/reject` | Elder only |
| POST | `/api/memberships/:id/remove` | Elder only |
| POST | `/api/posts/:id/approve` | Elder only. Optional `{ pinned }` |
| POST | `/api/posts/:id/reject` | Elder only |
| POST | `/api/posts/:id/pin` | Elder only. `{ pinned: boolean }` |
| POST | `/api/posts/:id/settings` | Elder only. `{ commentsEnabled?, threadLocked?, deceasedWarning? }` |
| POST | `/api/provider-access/:id/decide` | Elder only. `{ decision: "approved"\|"rejected" }` |

```
GroupSummary { id, name, type, parentName?, memberCount }
Post  { id, groupId, groupName, author: { id, name }, kind: "announcement"|"general"|"sorry_business",
        title?, body, hasMedia, status: "pending"|"published"|"rejected", pinned, urgent,
        restrictGender?, minAge?, deceasedWarning, commentsEnabled, threadLocked,
        commentCount, reactions: { like, heart, thinking_of_you }, myReactions: string[],
        createdAt, updatedAt }
Event { id, groupId, groupName, title, description?, category, startsAt, endsAt?, location,
        providerName?, cancelled, commentsEnabled, threadLocked,
        rsvpCounts: { going, maybe, no }, myRsvp?: "going"|"maybe"|"no", commentCount, updatedAt }
PendingMember   { id, user: { id, name, phoneNumber, isMinor }, guardianConsent: boolean, createdAt }
ProviderRequest { id, provider: { id, name, type, address }, message?, status, createdAt }
Report          { id, reason, comment: Comment, createdAt }
```

Posts by Elders publish immediately; everyone else's start `pending` and enter
the Elder queue. Posts the viewer may not see (gender/age restriction) are never
returned. Deceased-warning posts set `deceasedWarning: true`; the client hides
media until the viewer taps through.

## Comments and reactions

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/posts/:id/comments` | `Comment[]` (top level, each with `replies`) |
| POST | `/api/posts/:id/comments` | `{ body, parentCommentId?, clientMutationId }` → `Comment` |
| GET | `/api/events/:id/comments` | as above |
| POST | `/api/events/:id/comments` | as above |
| POST | `/api/comments/:id/hide` | Elder only |
| POST | `/api/comments/:id/report` | `{ reason }` |
| POST | `/api/reactions` | `{ targetType: "post"\|"comment"\|"event", targetId, kind }` toggles → `{ active, counts }` |

```
Comment { id, author: { id, name }, body, parentCommentId?, status, createdAt, replies: Comment[] }
```

Replies are one level deep: replying to a reply attaches to its top-level parent.

## Events

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/events/:id/rsvp` | `{ response, clientMutationId, respondedAt? }` → `{ response, rsvpCounts }`. Last write wins on `respondedAt`. |

## Health (visible only to the patient and carers they nominate)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/appointments` | `{ mine: Appointment[], caring: Appointment[] }` |
| POST | `/api/appointments/:id/confirm` | `{ clientMutationId }` → `Appointment` |
| GET | `/api/patient-links` | Pending clinic invites for my phone: `PatientInvite[]` |
| POST | `/api/patient-links/:id/accept` | → `PatientInvite` |
| GET | `/api/carers` | `{ myCarers: CarerLink[], caringFor: CarerLink[] }` |
| POST | `/api/carers` | `{ phoneNumber }` → `CarerLink` (404 if no MyMob user has that number) |
| DELETE | `/api/carers/:id` | Revokes consent → `CarerLink` |

```
Appointment   { id, startsAt, location, type, prepNotes?, transportNote?,
                status: "booked"|"confirmed"|"attended"|"missed"|"cancelled",
                provider: { id, name, phone? }, personName /* patient */, isMine, updatedAt }
PatientInvite { id, provider: { id, name, type }, status: "invited"|"accepted"|"revoked", createdAt }
CarerLink     { id, person: { id, name }, carer: { id, name, phoneNumber }, status: "active"|"revoked", consentedAt, revokedAt? }
```

## Sync (offline and satellite)

`POST /api/sync` and `POST /api/sync/lite` share one request shape:

```
{ cursor?: string, mutations: Mutation[] }
Mutation { clientMutationId: string, type: MutationType, payload: object, createdAt: string }
```

| type | payload |
| --- | --- |
| `rsvp` | `{ eventId, response }` |
| `confirmAppointment` | `{ appointmentId }` |
| `createPost` | `{ groupId, body, title?, kind? }` |
| `createComment` | `{ postId? , eventId?, parentCommentId?, body }` |
| `reaction` | `{ targetType, targetId, kind }` |

Mutations are applied in order. A repeated `clientMutationId` returns its
original result with status `duplicate` and is never applied twice.

Full sync response:

```
{ cursor, serverTime,
  results: [{ clientMutationId, status: "applied"|"duplicate"|"rejected", entityId?, error? }],
  appointments: Appointment[], posts: Post[], events: Event[], memberships: Membership[],
  carers: { myCarers, caringFor } }
```

Omit `cursor` for a full snapshot; pass the returned `cursor` next time to get
only changes since then. Appointments are server-wins.

Lite response (`/api/sync/lite`, gzip, target < 5 KB) uses the same keys but
only text and minimal fields, in priority order:

```
{ cursor, serverTime, lite: true, results,
  appointments: LiteAppointment[],    // { id, startsAt, location, type, status, providerName, isMine, updatedAt }
  notices: LiteNotice[],              // urgent + sorry business only: { id, groupId, kind, title?, body (≤280 chars), createdAt }
  deferred: { posts: number, events: number } }  // counts of changes waiting for normal coverage
```

The response header `X-Payload-Bytes` reports the uncompressed size and
`X-Compressed-Bytes` the gzip size, for the demo network log.
