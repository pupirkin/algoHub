import type messages from "../../messages/ru.json";

// Type-safe message keys: a missing or misspelled key is a compile error.
declare module "next-intl" {
  interface AppConfig {
    Locale: "ru";
    Messages: typeof messages;
  }
}
