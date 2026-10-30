import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const LOCALES = ["en", "xx"] as const;
export type Locale = (typeof LOCALES)[number];

/** No locale routing: the demo toggle stores the choice in a cookie. */
export default getRequestConfig(async () => {
  const value = (await cookies()).get("locale")?.value;
  const locale: Locale = value === "xx" ? "xx" : "en";
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
