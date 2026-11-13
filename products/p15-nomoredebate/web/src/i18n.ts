"use client";

import { useTranslations } from "next-intl";
import type messages from "../messages/ru.json";

/**
 * Typed translations for P15's own messages (`messages/ru.json` → `p15.*`).
 *
 * The portal types next-intl globally (AppConfig) with ITS messages only, and must not import product types
 * (boundaries). So products type their keys locally: `useT("vote")("moved", {...})` is checked against
 * `p15.vote.moved` here, at compile time, in every program that includes this file.
 */
type M = (typeof messages)["p15"];
type Leaf<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaf<T[K]>}` }[keyof T & string];
type Branch<T> = {
  [K in keyof T & string]: T[K] extends string ? never : K | `${K}.${Branch<T[K]>}`;
}[keyof T & string];
type At<T, P extends string> = P extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? At<T[H], R>
    : never
  : P extends keyof T
    ? T[P]
    : never;

export type Namespace = Branch<M>;
export type Values = Record<string, string | number | Date>;
export type Translate<NS extends Namespace> = (key: Leaf<At<M, NS>>, values?: Values) => string;

export function useT<NS extends Namespace>(namespace: NS): Translate<NS> {
  const t = useTranslations(`p15.${namespace}` as never) as unknown as (key: string, values?: Values) => string;
  return t as Translate<NS>;
}
