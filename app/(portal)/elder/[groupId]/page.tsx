import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState, Field, inputClass } from "@/components/ui";
import { ageOf } from "@/lib/api";
import { db } from "@/lib/db";
import { auntyAction, membershipAction, postAction, providerAction, reportAction } from "../actions";

const when = (d: Date) => d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function ElderQueue({ params }: PageProps<"/elder/[groupId]">) {
  const { groupId } = await params;
  const t = await getTranslations("elder");
  const [members, posts, providers, reports, pinned, aunty] = await Promise.all([
    db.membership.findMany({ where: { groupId, status: "pending" }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.post.findMany({ where: { groupId, status: "published" }, include: { author: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.providerGroupAccess.findMany({ where: { groupId, status: "requested" }, include: { provider: true } }),
    db.report.findMany({
      where: { status: "open", comment: { OR: [{ post: { groupId } }, { event: { groupId } }] } },
      include: { comment: { include: { author: true } } },
    }),
    db.post.findMany({ where: { groupId, status: "published", pinned: true }, orderBy: { createdAt: "desc" } }),
    db.auntySetting.findUnique({ where: { groupId } }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title={t("joinRequests")} description={t("joinRequestsHint")}>
        {members.length === 0 ? <EmptyState>{t("noneWaiting")}</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {members.map((m) => {
              const age = ageOf(m.user.dateOfBirth);
              const minor = age != null && age < 18;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{m.user.name}</span>
                    <span className="text-xs text-ink-muted">{t("requested", { when: when(m.createdAt) })}</span>
                    {minor && (
                      <span className="mt-1"><Badge tone={m.guardianConsentAt ? "info" : "warn"}>{m.guardianConsentAt ? t("guardianOk") : t("guardianWaiting")}</Badge></span>
                    )}
                  </div>
                  <form action={membershipAction} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <SubmitButton size="sm" variant="secondary" name="action" value="reject">{t("decline")}</SubmitButton>
                    <SubmitButton size="sm" name="action" value="approve">{t("approve")}</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t("providerRequests")} description={t("providerRequestsHint")}>
        {providers.length === 0 ? <EmptyState>{t("noneWaiting")}</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {providers.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{r.provider.name}</span>
                  <span className="text-xs text-ink-muted">{r.provider.type} · {r.provider.address}</span>
                  {r.message && <p className="mt-1 text-sm">&ldquo;{r.message}&rdquo;</p>}
                </div>
                <form action={providerAction} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton size="sm" variant="secondary" name="decision" value="rejected">{t("decline")}</SubmitButton>
                  <SubmitButton size="sm" name="decision" value="approved">{t("allowPosting")}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("recentPosts")} description={t("recentPostsHint")} className="lg:col-span-2">
        {posts.length === 0 ? <EmptyState>{t("noPosts")}</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title ?? t("untitled")}</span>
                    <Badge>{p.kind.replace("_", " ")}</Badge>
                    {p.pinned && <Badge tone="info">{t("pinned")}</Badge>}
                    {p.restrictGender && <Badge tone="info">{t("restrictedGender", { gender: p.restrictGender })}</Badge>}
                    {p.minAge != null && <Badge tone="info">{t("restrictedAge", { age: p.minAge })}</Badge>}
                  </div>
                  <p className="max-w-prose text-sm">{p.body}</p>
                  <span className="text-xs text-ink-muted">{p.author.name} · {when(p.createdAt)}</span>
                </div>
                <form action={postAction} className="flex gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton size="sm" variant="secondary" name="action" value={p.pinned ? "unpin" : "pin"}>{p.pinned ? t("unpin") : t("pinToTop")}</SubmitButton>
                  <SubmitButton size="sm" variant="danger" name="action" value="reject">{t("removePost")}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("reported")} description={t("reportedHint")}>
        {reports.length === 0 ? <EmptyState>{t("nothingReported")}</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <p className="text-sm">&ldquo;{r.comment.body}&rdquo;</p>
                <span className="text-xs text-ink-muted">{r.comment.author.name} · {t("reason")}: {r.reason}</span>
                <form action={reportAction} className="flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="commentId" value={r.commentId} />
                  <SubmitButton size="sm" variant="secondary" name="action" value="dismiss">{t("keep")}</SubmitButton>
                  <SubmitButton size="sm" variant="danger" name="action" value="hide">{t("hideComment")}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("aunty")} description={t("auntyHint")}>
        <form action={auntyAction} className="flex flex-col gap-4">
          <input type="hidden" name="groupId" value={groupId} />
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={aunty?.enabled ?? false}
              className="mt-0.5 size-4 shrink-0 rounded border-line-strong accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{t("auntyEnable")}</span>
              <span className="text-xs text-ink-faint">{t("auntyEnableHint")}</span>
            </span>
          </label>
          <Field label={t("auntyGuidance")} hint={t("auntyGuidanceHint")}>
            <textarea
              name="guidance"
              rows={4}
              defaultValue={aunty?.guidance ?? ""}
              maxLength={2000}
              placeholder={t("auntyGuidancePlaceholder")}
              className={`${inputClass} h-auto py-2 leading-relaxed`}
            />
          </Field>
          <p className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-muted">{t("auntyPrivacy")}</p>
          <div>
            <SubmitButton size="sm">{t("auntySave")}</SubmitButton>
          </div>
        </form>
      </Card>

      <Card title={t("pinned")} description={t("pinnedHint")}>
        {pinned.length === 0 ? <EmptyState>{t("nothingPinned")}</EmptyState> : (
          <ul className="flex flex-col divide-y divide-line">
            {pinned.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm font-medium">{p.title ?? p.body.slice(0, 60)}</span>
                <form action={postAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton size="sm" variant="ghost" name="action" value="unpin">{t("unpin")}</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
