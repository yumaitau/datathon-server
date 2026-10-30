import { getTranslations } from "next-intl/server";
import { ServiceMap } from "@/components/service-map";
import { Card } from "@/components/ui";
import { serviceGaps } from "@/lib/insights";

export default async function Services() {
  const t = await getTranslations("elder");
  const gaps = await serviceGaps();
  return (
    <Card title={t("gapTitle")} description={t("gapHint")}>
      <ServiceMap gaps={gaps} />
    </Card>
  );
}
