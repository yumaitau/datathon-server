import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getActor } from "@/lib/api";
import { db } from "@/lib/db";
import { canEditLanguage, messagesFor } from "@/lib/i18n";
import { APP_TZ } from "@/lib/time";
import en from "@/messages/en.json";

/**
 * No locale routing: the language picker stores a code in the `locale` cookie.
 * Anything other than English is a community-owned Language from the database;
 * drafts are only shown to the people writing them.
 */
export default getRequestConfig(async () => {
  const code = (await cookies()).get("locale")?.value;
  if (code && code !== "en") {
    const language = await db.language.findUnique({ where: { code } });
    if (language) {
      const visible = language.status === "published" || (await getActor().then((a) => !!a && canEditLanguage(a, language)));
      if (visible) return { locale: language.code, timeZone: APP_TZ, messages: await messagesFor(language.id) };
    }
  }
  return { locale: "en", timeZone: APP_TZ, messages: en };
});
