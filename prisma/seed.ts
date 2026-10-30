/**
 * Demo data: two fictional communities, ~300 members, 6 months of appointments,
 * events and posts. All names and places are invented. Deterministic (seeded PRNG),
 * so every run produces the same dataset.
 *
 * Attendance is generated with hypothesis-shaped rates (no reminder < SMS ≈ push
 * < reminder also sent to a carer; higher no-show for distant services) so the
 * insights have a story to illustrate. These are illustrations, not findings.
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import type { Gender } from "../generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let state = 20261030;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const DAY = 86400_000;
const NOW = new Date();
const daysAgo = (d: number, hour = 10) => {
  const t = new Date(NOW.getTime() - d * DAY);
  t.setUTCHours(hour - 9, rand() < 0.5 ? 0 : 30, 0, 0); // hour in UTC+9:30-ish local
  return t;
};
const id = () => randomUUID();

const FEMALE = ["Leah", "Grace", "Ruby", "Mia", "Tahlia", "Jasmine", "Kiara", "Shania", "Alinta", "Courtney", "Brooke", "Nikita", "Rosie", "Lena", "Monique", "Danielle", "Kayla", "Tanya", "Joy", "Faith", "Amber", "Destiny", "Ella", "Sienna", "Maree", "Beverley", "Doreen", "Pearl", "Elsie", "Ivy"];
const MALE = ["Sam", "Tom", "Jordan", "Ray", "Darcy", "Lachlan", "Tyson", "Jarrah", "Kane", "Brodie", "Reuben", "Mitchell", "Cody", "Jayden", "Isaac", "Nathan", "Wade", "Clinton", "Dale", "Errol", "Keith", "Lionel", "Mervyn", "Stanley", "Jesse", "Aaron", "Blake", "Corey", "Dylan", "Ethan"];
const SURNAMES = ["Walker", "Baker", "Miller", "Thompson", "Cooper", "Hayes", "Bennett", "Fletcher", "Morgan", "Turner", "Wallace", "Harding", "Ross", "Ellis", "Carter", "Mason", "Webb", "Dawson", "Lane", "Price", "Foster", "Sutton", "Hughes", "Rowe", "Barton", "Nolan", "Pike", "Shaw", "Doyle", "Keane"];

type MessageTree = { [key: string]: string | MessageTree };
const flattenMessages = (tree: MessageTree, prefix = ""): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : flattenMessages(v, `${prefix}${k}.`)));

/** Pseudo-translation: accented letters in brackets; ICU arguments and printf specifiers untouched. */
function pseudo(text: string) {
  const map: Record<string, string> = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú", c: "ç", n: "ñ" };
  let depth = 0;
  let out = "";
  for (const ch of text) {
    if (ch === "{") depth++;
    out += depth === 0 ? (map[ch] ?? ch) : ch;
    if (ch === "}") depth--;
  }
  return `⟦${out}⟧`;
}

async function reset() {
  // Children first; this script owns the whole demo database.
  const tables = [
    "Translation", "Language", "Activity", "ClientMutation", "AuditLog", "NotificationLog", "Reminder", "CarerLink", "Appointment",
    "PatientLink", "ProviderGroupAccess", "ProviderStaff", "Report", "Reaction", "Comment", "Rsvp", "Event",
    "Post", "ElderNomination", "Membership", "Provider", "Group", "DeviceProfile", "OtpCode", "verification",
    "account", "session", "user",
  ];
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

type U = { id: string; name: string; phoneNumber: string | null; gender: Gender; dateOfBirth: Date; email: string; guardianId?: string | null; platformRole?: "admin" | "none" };
const users: U[] = [];
let phoneSeq = 100;
function person(name: string, gender: Gender, age: number, phone?: string): U {
  const phoneNumber = phone ?? `+614${String(10000000 + phoneSeq++).slice(-8)}`;
  const dob = new Date(NOW.getFullYear() - age, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27));
  const u: U = { id: id(), name, phoneNumber, gender, dateOfBirth: dob, email: `${phoneNumber.slice(1)}@phone.mymob.invalid` };
  users.push(u);
  return u;
}
function randomPerson(): U {
  const g: Gender = chance(0.52) ? "female" : "male";
  const first = g === "female" ? pick(FEMALE) : pick(MALE);
  const age = chance(0.22) ? 12 + Math.floor(rand() * 6) : 18 + Math.floor(rand() * 62);
  return person(`${first} ${pick(SURNAMES)}`, g, age);
}

async function main() {
  // `--if-empty` (used by the Docker entrypoint) keeps an existing demo database.
  if (process.argv.includes("--if-empty") && (await db.user.count()) > 0) {
    console.log("Database already has data; skipping seed.");
    return;
  }
  await reset();

  // ---------- Groups ----------
  const nation = { id: id(), type: "nation" as const, name: "Plains Country Nation", joinCode: "PLAINS-NATION", communityId: null, parentId: null, lat: null, lng: null, description: "Language group (fictional)" };
  const salt = { id: id(), type: "community" as const, name: "Saltbush Creek", joinCode: "SALT-2026", parentId: nation.id, lat: -22.96, lng: 134.58, description: "Saltbush Creek community hub" };
  const iron = { id: id(), type: "community" as const, name: "Ironbark Ridge", joinCode: "IRON-2026", parentId: nation.id, lat: -21.42, lng: 136.07, description: "Ironbark Ridge community hub" };
  const communities = [salt, iron].map((c) => ({ ...c, communityId: c.id }));
  const subgroups = [
    { id: id(), type: "subgroup" as const, name: "Saltbush Youth Sport", joinCode: "SALT-SPORT", parentId: salt.id, communityId: salt.id, lat: null, lng: null, description: "Footy, netball and basketball" },
    { id: id(), type: "subgroup" as const, name: "Walker Family", joinCode: "WALKER-FAM", parentId: salt.id, communityId: salt.id, lat: null, lng: null, description: "Family group" },
    { id: id(), type: "subgroup" as const, name: "Ironbark Women's Group", joinCode: "IRON-WOMEN", parentId: iron.id, communityId: iron.id, lat: null, lng: null, description: "Women's business and support" },
  ];
  await db.group.createMany({ data: [nation, ...communities, ...subgroups] });

  // ---------- Demo people (fixed numbers, accept DEMO_OTP_CODE) ----------
  const grace = person("Aunty Grace Walker", "female", 68, "+61400000001");
  const tom = person("Uncle Tom Baker", "male", 72, "+61400000002");
  // Jordan has an account but has not joined yet: demo flow A starts with his join request.
  person("Jordan Miller", "male", 24, "+61400000003");
  const leah = person("Leah Thompson", "female", 34, "+61400000004");
  const sam = person("Sam Thompson", "male", 37, "+61400000005");
  // Ray has no app: no account, only a clinic invite to his phone (+61400000006).
  const clinician = person("Priya Nair", "female", 41, "+61400000010");
  const dentist = person("Mark Ellis", "male", 50, "+61400000011");
  const admin = person("Platform Admin", "other", 40, "+61400000099");
  admin.platformRole = "admin";
  const elderNominee = person("Aunty Pearl Hayes", "female", 70, "+61400000007");

  const saltMembers: U[] = [grace, leah, sam, elderNominee];
  const ironMembers: U[] = [tom];
  for (let i = 0; i < 150; i++) saltMembers.push(randomPerson());
  for (let i = 0; i < 145; i++) ironMembers.push(randomPerson());
  // A couple of youth members joined with guardian consent.
  for (const kid of [...saltMembers, ...ironMembers].filter((u) => NOW.getFullYear() - u.dateOfBirth.getFullYear() < 18)) {
    kid.guardianId = pick(saltMembers.includes(kid) ? saltMembers : ironMembers).id;
  }

  await db.user.createMany({
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: false,
      phoneNumber: u.phoneNumber,
      phoneNumberVerified: true,
      gender: u.gender,
      dateOfBirth: u.dateOfBirth,
      platformRole: u.platformRole ?? "none",
      createdAt: daysAgo(200),
    })),
  });
  for (const u of users.filter((u) => u.guardianId)) {
    await db.user.update({ where: { id: u.id }, data: { guardianId: u.guardianId } });
  }

  const memberships: object[] = [];
  const addMember = (u: U, g: { id: string; communityId: string | null }, role: "member" | "elder" = "member", status: "active" | "pending" = "active") =>
    memberships.push({ id: id(), userId: u.id, groupId: g.id, communityId: g.communityId, role, status, createdAt: daysAgo(150 + Math.floor(rand() * 40)), guardianConsentAt: u.guardianId ? daysAgo(150) : null, decidedAt: status === "active" ? daysAgo(140) : null });
  for (const u of saltMembers) addMember(u, communities[0], u === grace ? "elder" : "member");
  for (const u of ironMembers) addMember(u, communities[1], u === tom ? "elder" : "member");
  addMember(grace, subgroups[1], "elder");
  addMember(leah, subgroups[1]);
  addMember(sam, subgroups[1]);
  for (const u of saltMembers.slice(4, 40)) addMember(u, subgroups[0]);
  addMember(tom, subgroups[2], "elder");
  for (const u of ironMembers.filter((x) => x.gender === "female").slice(0, 30)) addMember(u, subgroups[2]);
  // Two pending join requests already waiting (Jordan requests live in the demo).
  addMember(randomPerson(), communities[0], "member", "pending");
  addMember(randomPerson(), communities[1], "member", "pending");
  const late = users.slice(-2);
  await db.user.createMany({ data: late.map((u) => ({ id: u.id, name: u.name, email: u.email, phoneNumber: u.phoneNumber, phoneNumberVerified: true, gender: u.gender, dateOfBirth: u.dateOfBirth })) });
  await db.membership.createMany({ data: memberships as never });

  await db.elderNomination.create({
    data: { groupId: salt.id, communityId: salt.id, nomineeId: elderNominee.id, nominatedBy: grace.id },
  });

  // ---------- Providers ----------
  // Invented services placed so Ironbark Ridge sits much further from dental, hospital and legal help.
  // Fictional regional town, deliberately placed away from any real labelled town.
  const town = { lat: -24.15, lng: 133.35 };
  const providers = [
    { id: id(), name: "Saltbush Creek Health Service", type: "clinic", address: "2 Clinic Rd, Saltbush Creek", phone: "+61889000001", lat: -22.955, lng: 134.585, verified: true },
    { id: id(), name: "Ironbark Ridge Nurse Post", type: "clinic", address: "1 Main St, Ironbark Ridge", phone: "+61889000002", lat: -21.418, lng: 136.072, verified: true },
    { id: id(), name: "Mulga Springs Dental", type: "dental", address: "14 Todd Ln, Mulga Springs", phone: "+61889000003", lat: town.lat, lng: town.lng, verified: true },
    { id: id(), name: "Mulga Springs Hospital", type: "hospital", address: "1 Hospital Dr, Mulga Springs", phone: "+61889000004", lat: town.lat + 0.01, lng: town.lng - 0.01, verified: true },
    { id: id(), name: "Plains Legal Aid", type: "legal", address: "8 Court St, Mulga Springs", phone: "+61889000005", lat: town.lat - 0.005, lng: town.lng + 0.01, verified: true },
    { id: id(), name: "Regional Housing Office", type: "housing", address: "20 Railway Tce, Mulga Springs", phone: "+61889000006", lat: town.lat + 0.004, lng: town.lng + 0.004, verified: true },
    { id: id(), name: "Saltbush Community Bus", type: "transport", address: "Community Office, Saltbush Creek", phone: "+61889000007", lat: -22.958, lng: 134.581, verified: true },
    { id: id(), name: "Ridge Outreach Mental Health", type: "mental_health", address: "Visiting service, Tennant Flats", phone: "+61889000008", lat: -19.65, lng: 134.19, verified: true },
  ];
  await db.provider.createMany({ data: providers });
  const [saltClinic, ironClinic, dental] = providers;
  await db.providerStaff.createMany({
    data: [
      { providerId: saltClinic.id, userId: clinician.id },
      { providerId: dental.id, userId: dentist.id },
    ],
  });
  await db.providerGroupAccess.createMany({
    data: [
      { communityId: salt.id, providerId: saltClinic.id, groupId: salt.id, status: "approved", decidedById: grace.id, decidedAt: daysAgo(170) },
      { communityId: iron.id, providerId: ironClinic.id, groupId: iron.id, status: "approved", decidedById: tom.id, decidedAt: daysAgo(170) },
      { communityId: iron.id, providerId: saltClinic.id, groupId: iron.id, status: "approved", decidedById: tom.id, decidedAt: daysAgo(160) },
      { communityId: salt.id, providerId: dental.id, groupId: salt.id, status: "requested", message: "We'd like to share dental outreach days with Saltbush Creek." },
    ],
  });

  // ---------- Events, RSVPs ----------
  const EVENT_TYPES = [
    { title: "NAIDOC Week family day", category: "cultural", pull: 0.75 },
    { title: "Community BBQ", category: "community", pull: 0.5 },
    { title: "Junior footy carnival", category: "sport", pull: 0.55 },
    { title: "Netball round robin", category: "sport", pull: 0.35 },
    { title: "Community meeting", category: "governance", pull: 0.3 },
    { title: "Bush tucker walk", category: "cultural", pull: 0.45 },
    { title: "Movie night at the hall", category: "community", pull: 0.4 },
    { title: "Women's yarning circle", category: "community", pull: 0.25 },
    { title: "Health check day", category: "health", pull: 0.3 },
    { title: "School holiday program", category: "youth", pull: 0.3 },
  ];
  const events: { id: string; communityId: string; groupId: string; title: string; category: string; startsAt: Date; location: string; createdById: string; providerId?: string; createdAt: Date }[] = [];
  const rsvps: object[] = [];
  for (const [c, members, elder] of [[communities[0], saltMembers, grace], [communities[1], ironMembers, tom]] as const) {
    for (let w = 26; w >= -3; w--) {
      const count = chance(0.6) ? 1 : 2;
      for (let k = 0; k < count; k++) {
        const t = w === 14 && k === 0 ? EVENT_TYPES[0] : pick(EVENT_TYPES.slice(1));
        const isHealth = t.category === "health";
        const ev = {
          id: id(),
          communityId: c.id,
          groupId: c.id,
          title: t.title,
          category: t.category,
          startsAt: daysAgo(w * 7 - Math.floor(rand() * 6), 10 + Math.floor(rand() * 7)),
          location: pick(["Community hall", "Oval", "Basketball court", "Clinic verandah", "Riverbank camp"]),
          createdById: isHealth ? clinician.id : elder.id,
          ...(isHealth ? { providerId: saltClinic.id } : {}),
          createdAt: daysAgo(w * 7 + 10),
        };
        events.push(ev);
        if (w < 0) continue; // future events: RSVPs come during the demo
        // Engagement grows as the hub is adopted.
        const adoption = 0.35 + (0.65 * (26 - w)) / 26;
        for (const m of members) {
          if (!chance(t.pull * adoption * 0.8)) continue;
          const r = rand();
          rsvps.push({ id: id(), communityId: c.id, eventId: ev.id, userId: m.id, response: r < 0.7 ? "going" : r < 0.9 ? "maybe" : "no", respondedAt: new Date(ev.startsAt.getTime() - (1 + rand() * 6) * DAY) });
        }
      }
    }
  }
  await db.event.createMany({ data: events.map((e) => ({ ...e, description: `${e.title} for everyone in the community. Bring the family.` })) });
  await db.rsvp.createMany({ data: rsvps as never });

  // ---------- Posts ----------
  const POSTS = [
    ["Water outage Thursday", "Council is fixing the main pipe Thursday morning. Fill some containers Wednesday night.", true],
    ["Store delivery delayed", "The truck is held up by the creek crossing. Fresh food should arrive Saturday.", false],
    ["Footy training times", "Juniors Tuesday and Thursday 4pm at the oval. New players welcome.", false],
    ["Road closed after rain", "The south road is closed until it dries out. Use the station track.", true],
    ["Clinic visiting doctor", "A visiting doctor is at the clinic all next week. Book with the front desk.", false],
    ["Art centre open day", "Come see the new work from local artists on Friday afternoon.", false],
    ["Lost dog near the hall", "Brown kelpie, answers to Bluey. Message Rosie if you see him.", false],
    ["School photo day", "Kids need their uniforms on Monday for photos.", false],
  ] as const;
  const posts: object[] = [];
  for (const [c, members, elder] of [[communities[0], saltMembers, grace], [communities[1], ironMembers, tom]] as const) {
    for (let i = 0; i < 40; i++) {
      const [title, body, urgent] = pick(POSTS);
      const created = daysAgo(180 - i * 4.4 - Math.floor(rand() * 3));
      const byElder = chance(0.4);
      const status = byElder ? "published" : chance(0.85) ? "published" : "rejected";
      posts.push({
        id: id(), communityId: c.id, groupId: c.id, authorId: byElder ? elder.id : pick(members).id,
        kind: chance(0.25) ? "general" : "announcement", title, body, status, urgent: byElder && urgent,
        decidedById: elder.id, decidedAt: new Date(created.getTime() + (2 + rand() * 20) * 3600_000),
        createdAt: created, updatedAt: created,
      });
    }
    posts.push({
      id: id(), communityId: c.id, groupId: c.id, authorId: elder.id, kind: "sorry_business",
      title: "Sorry business", body: "The family asks for privacy during sorry business. Services will be shared with family directly. Please keep the family in your thoughts.",
      status: "published", commentsEnabled: false, deceasedWarning: true, decidedById: elder.id, decidedAt: daysAgo(5), createdAt: daysAgo(5), updatedAt: daysAgo(5),
    });
  }
  // A pinned welcome post and a member post in each community.
  posts.push(
    { id: id(), communityId: salt.id, groupId: salt.id, authorId: grace.id, kind: "announcement", title: "Welcome to the Saltbush Creek hub", body: "This space is looked after by Elders. Be kind and look after each other.", status: "published", pinned: true, decidedById: grace.id, decidedAt: daysAgo(180), createdAt: daysAgo(180), updatedAt: daysAgo(180) },
    { id: id(), communityId: salt.id, groupId: salt.id, authorId: saltMembers[9].id, kind: "general", title: "Selling a trailer", body: "Box trailer, good tyres. Message me if keen.", status: "published", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    { id: id(), communityId: iron.id, groupId: iron.id, authorId: tom.id, kind: "announcement", title: "Welcome to the Ironbark Ridge hub", body: "Elders look after this space. Share news, events and help each other out.", status: "published", pinned: true, decidedById: tom.id, decidedAt: daysAgo(180), createdAt: daysAgo(180), updatedAt: daysAgo(180) },
    { id: id(), communityId: iron.id, groupId: subgroups[2].id, authorId: tom.id, kind: "announcement", title: "Women's health morning", body: "Women only. Health yarn and morning tea at the clinic Thursday.", status: "published", restrictGender: "female", decidedById: tom.id, decidedAt: daysAgo(5), createdAt: daysAgo(5), updatedAt: daysAgo(5) },
  );
  await db.post.createMany({ data: posts as never });

  // Comments and reactions on recent published posts.
  const published = (posts as { id: string; communityId: string; status: string; commentsEnabled?: boolean; groupId: string }[]).filter(
    (p) => p.status === "published" && p.commentsEnabled !== false,
  );
  const comments: object[] = [];
  const reactions = new Map<string, object>();
  const REPLIES = ["Thanks for letting us know", "Good to hear", "Will pass it on to the family", "See you there", "Thank you Aunty", "Can someone give me a lift?", "Deadly, the kids will love it"];
  for (const p of published.slice(-60)) {
    const members = p.communityId === salt.id ? saltMembers : ironMembers;
    const top: string[] = [];
    for (let i = 0; i < Math.floor(rand() * 4); i++) {
      const cid = id();
      top.push(cid);
      comments.push({ id: cid, communityId: p.communityId, postId: p.id, authorId: pick(members).id, body: pick(REPLIES) });
    }
    if (top.length && chance(0.4)) comments.push({ id: id(), communityId: p.communityId, postId: p.id, parentCommentId: top[0], authorId: pick(members).id, body: pick(REPLIES) });
    for (let i = 0; i < Math.floor(rand() * 12); i++) {
      const r = { communityId: p.communityId, targetType: "post", targetId: p.id, userId: pick(members).id, kind: pick(["like", "heart", "like", "thinking_of_you"]) };
      reactions.set(`${r.targetId}:${r.userId}:${r.kind}`, r);
    }
  }
  await db.comment.createMany({ data: comments as never });
  await db.reaction.createMany({ data: [...reactions.values()] as never });

  // ---------- Activity (weekly active members) ----------
  const activity: object[] = [];
  for (const [c, members] of [[salt.id, saltMembers], [iron.id, ironMembers]] as const) {
    for (let d = 182; d >= 0; d--) {
      const adoption = 0.08 + (0.22 * (182 - d)) / 182;
      const day = new Date(new Date(NOW.getTime() - d * DAY).toISOString().slice(0, 10));
      for (const m of members) if (chance(adoption * (c === iron.id ? 0.85 : 1))) activity.push({ id: id(), userId: m.id, communityId: c, day });
    }
  }
  for (let i = 0; i < activity.length; i += 5000) await db.activity.createMany({ data: activity.slice(i, i + 5000) as never, skipDuplicates: true });

  // ---------- Patients, carers, appointments, reminders ----------
  const carerLinks: object[] = [{ id: id(), userId: leah.id, carerId: sam.id, consentedAt: daysAgo(120) }];
  const patientLinks: { id: string; providerId: string; userId: string | null; invitedPhone: string; displayName: string; status: "accepted" | "invited"; communityId: string; hasCarer: boolean; hasApp: boolean }[] = [];
  const carerOf = new Map<string, string>([[leah.id, sam.id]]);
  const adultPatients = (ms: U[]) => ms.filter((u) => NOW.getFullYear() - u.dateOfBirth.getFullYear() >= 18 && u !== grace && u !== tom);
  // The Saltbush clinic also runs the visiting clinic at Ironbark Ridge.
  for (const [c, members, clinic] of [[salt.id, saltMembers, saltClinic], [iron.id, ironMembers, saltClinic]] as const) {
    const pts = adultPatients(members).slice(0, 110);
    for (const u of pts) {
      const hasApp = u === leah || chance(0.7);
      if (u !== leah && chance(0.3)) {
        const carer = pick(members);
        if (carer !== u) {
          carerOf.set(u.id, carer.id);
          carerLinks.push({ id: id(), userId: u.id, carerId: carer.id, consentedAt: daysAgo(150) });
        }
      }
      patientLinks.push({ id: id(), providerId: clinic.id, userId: u.id, invitedPhone: u.phoneNumber!, displayName: u.name, status: hasApp ? "accepted" : "invited", communityId: c, hasCarer: carerOf.has(u.id), hasApp });
    }
  }
  // Ray Cooper: no app, invited by phone only.
  const ray = { id: id(), providerId: saltClinic.id, userId: null, invitedPhone: "+61400000006", displayName: "Ray Cooper", status: "invited" as const, communityId: salt.id, hasCarer: false, hasApp: false };
  patientLinks.push(ray);
  // Some patients also see the dentist in town.
  for (const p of patientLinks.filter((_, i) => i % 4 === 0).slice(0, 50)) {
    patientLinks.push({ ...p, id: id(), providerId: dental.id });
  }
  await db.carerLink.createMany({ data: carerLinks as never, skipDuplicates: true });
  await db.patientLink.createMany({
    data: patientLinks.map((l) => ({ id: l.id, providerId: l.providerId, userId: l.userId, invitedPhone: l.invitedPhone, displayName: l.displayName, status: l.status })),
    skipDuplicates: true,
  });

  const TYPES_BY_PROVIDER: Record<string, string[]> = {
    clinic: ["715 health check", "GP review", "Diabetes check", "Immunisation", "Antenatal", "Ear health check"],
    dental: ["Dental check-up", "Dental treatment"],
  };
  const appointments: object[] = [];
  const reminders: object[] = [];
  const baseAttend: Record<string, number> = { none: 0.6, sms: 0.71, push: 0.74, carer: 0.86 };
  for (const p of patientLinks) {
    const provider = providers.find((x) => x.id === p.providerId)!;
    const visits = provider.type === "dental" ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 4);
    for (let v = 0; v < visits; v++) {
      const d = Math.floor(rand() * 180) + 1;
      const startsAt = daysAgo(d, 8 + Math.floor(rand() * 8));
      // Reminders were rolled out over the period, so early appointments more often had none.
      const rollout = (180 - d) / 180;
      const category = !chance(0.25 + 0.65 * rollout) ? "none" : p.hasCarer ? "carer" : p.hasApp ? "push" : "sms";
      let pAttend = baseAttend[category];
      if (provider.type === "dental") pAttend -= p.communityId === iron.id ? 0.18 : 0.08;
      if (p.communityId === iron.id) pAttend -= 0.1; // further from town services
      if (startsAt.getUTCDay() === 1) pAttend -= 0.05; // Mondays after weekend travel
      const type = pick(TYPES_BY_PROVIDER[provider.type] ?? TYPES_BY_PROVIDER.clinic);
      const status = startsAt.getTime() > NOW.getTime() - DAY && chance(0.1) ? "cancelled" : chance(pAttend) ? "attended" : "missed";
      const apptId = id();
      appointments.push({ id: apptId, communityId: p.communityId, patientLinkId: p.id, startsAt, location: provider.type === "clinic" && p.communityId === iron.id ? `Visiting clinic, ${ironClinic.address}` : provider.address, type, status, createdAt: new Date(startsAt.getTime() - 14 * DAY), updatedAt: startsAt });
      if (category === "none") continue;
      for (const h of [48, 2]) {
        const at = new Date(startsAt.getTime() - h * 3600_000);
        const selfChannel = p.hasApp ? "push" : "sms";
        reminders.push({ appointmentId: apptId, channel: selfChannel, recipient: "self", recipientUserId: p.userId, recipientPhone: p.invitedPhone, scheduledFor: at, sentAt: at, deliveryStatus: chance(0.95) ? "sent" : "failed" });
        if (category === "carer") reminders.push({ appointmentId: apptId, channel: "push", recipient: "carer", recipientUserId: carerOf.get(p.userId!), scheduledFor: at, sentAt: at, deliveryStatus: "sent" });
      }
    }
  }
  // Leah's upcoming appointments (demo flow B shows the live booking on top of these).
  const leahLink = patientLinks.find((p) => p.userId === leah.id && p.providerId === saltClinic.id)!;
  const upcoming = [
    { startsAt: new Date(NOW.getTime() + 6 * DAY), type: "Diabetes check", prepNotes: "Bring your blood sugar diary and current medicines.", transportNote: "Community bus leaves the store at 9:15am." },
  ];
  for (const u of upcoming) {
    u.startsAt.setUTCHours(0, 30, 0, 0);
    const apptId = id();
    appointments.push({ id: apptId, communityId: salt.id, patientLinkId: leahLink.id, location: saltClinic.address, status: "booked", ...u });
    for (const h of [48, 2]) {
      const at = new Date(u.startsAt.getTime() - h * 3600_000);
      reminders.push({ appointmentId: apptId, channel: "push", recipient: "self", recipientUserId: leah.id, recipientPhone: leah.phoneNumber, scheduledFor: at });
      reminders.push({ appointmentId: apptId, channel: "push", recipient: "carer", recipientUserId: sam.id, recipientPhone: sam.phoneNumber, scheduledFor: at });
    }
  }
  for (let i = 0; i < appointments.length; i += 2000) await db.appointment.createMany({ data: appointments.slice(i, i + 2000) as never });
  for (let i = 0; i < reminders.length; i += 4000) await db.reminder.createMany({ data: reminders.slice(i, i + 4000) as never });

  // ---------- Demo community language ----------
  // Fictional: `qaa` is reserved for local use, so it can't be mistaken for a
  // real language. Pseudo-text stands in for real translation work.
  const language = await db.language.create({
    data: {
      code: "qaa",
      name: "Plains demo language",
      endonym: "Pláíñs démó",
      communityId: salt.id,
      status: "published",
      notes: "Fictional demo language. Real languages are added by a community's Elders.",
      createdById: grace.id,
    },
  });
  await db.membership.update({ where: { userId_groupId: { userId: leah.id, groupId: salt.id } }, data: { canTranslate: true } });
  const readJson = (file: string) => JSON.parse(readFileSync(new URL(`../messages/${file}`, import.meta.url), "utf8"));
  const sources: [string, string][] = [
    ...flattenMessages(readJson("en.json")),
    ...Object.entries(readJson("app.en.json") as Record<string, string>).map(([k, v]): [string, string] => [`app:${k}`, v]),
  ];
  const translations = sources
    // Status is chosen from a hash of the key, so adding strings never reshuffles which are translated.
    .map(([key, english]) => ({ key, english, slot: createHash("sha1").update(key).digest()[0] % 12 }))
    // Most strings approved, some drafts waiting for an Elder, a few missing (they show in English).
    .filter((x) => x.slot !== 11)
    .map((x) => ({
      languageId: language.id,
      key: x.key,
      value: pseudo(x.english),
      status: x.slot === 10 ? ("draft" as const) : ("approved" as const),
      updatedById: x.slot === 10 ? leah.id : grace.id,
      approvedById: x.slot === 10 ? null : grace.id,
    }));
  await db.translation.createMany({ data: translations });

  await db.auditLog.create({ data: { actorId: admin.id, action: "seed", entity: "Database", detail: "Demo data loaded" } });

  console.log(
    `Seeded ${users.length} people, ${memberships.length} memberships, ${events.length} events, ${rsvps.length} RSVPs, ` +
      `${posts.length} posts, ${appointments.length} appointments, ${reminders.length} reminders.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
