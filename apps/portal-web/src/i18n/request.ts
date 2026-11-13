import { getRequestConfig } from "next-intl/server";
import messages from "../../messages/ru.json";

/**
 * next-intl without i18n routing: one locale (RU) today, keys in English (ARCHITECTURE_PLAN D11).
 * KZ/EN arrive as `messages/<locale>.json` plus locale negotiation here, once translations exist.
 */
export const DEFAULT_LOCALE = "ru";

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages,
  timeZone: "Asia/Almaty",
}));
