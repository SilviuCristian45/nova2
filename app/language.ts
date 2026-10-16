import { cookies } from "next/headers";

export async function getLanguage() {
  const language = (await cookies()).get("language")?.value === "ro" ? "ro" : "en";
  return {
    language,
    locale: language === "ro" ? "ro-RO" : "en-US",
    t: (ro: string, en: string) => language === "ro" ? ro : en,
  } as const;
}
