import { getTranslations } from "next-intl/server";
import { ButtonLink, Card, PageHeader } from "@/components/ui";
import { requireWebActor } from "@/lib/web";

/** Home: routes each signed-in person to the portal their roles allow. */
export default async function Home() {
  const actor = await requireWebActor();
  const t = await getTranslations("home");
  const portals = [
    actor.elderGroupIds.size > 0 && { href: "/elder", title: t("elderTitle"), body: t("elderBody") },
    actor.providerIds.length > 0 && { href: "/provider", title: t("providerTitle"), body: t("providerBody") },
    actor.isAdmin && { href: "/admin", title: t("adminTitle"), body: t("adminBody") },
  ].filter(Boolean) as { href: string; title: string; body: string }[];
  return (
    <>
      <PageHeader title={t("greeting", { name: actor.user.name })} description={portals.length ? t("pick") : t("appOnly")} />
      <div className="grid gap-4 md:grid-cols-3">
        {portals.map((p) => (
          <Card key={p.href} title={p.title} description={p.body}>
            <ButtonLink href={p.href} variant="secondary" className="self-start">{t("open")}</ButtonLink>
          </Card>
        ))}
      </div>
    </>
  );
}
