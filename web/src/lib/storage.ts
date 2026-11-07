import { clear, createStore, del, get, set, values, type UseStore } from "idb-keyval";
import type { CardEntry } from "../types";

let store: UseStore | null = null;
const db = () => (store ??= createStore("kortkollen", "cards"));

export async function listCards(): Promise<CardEntry[]> {
  const cards = await values<CardEntry>(db());
  return cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCard(id: string): Promise<CardEntry | undefined> {
  return get<CardEntry>(id, db());
}

export function putCard(card: CardEntry): Promise<void> {
  return set(card.id, { ...card, saved: true }, db());
}

export function deleteCard(id: string): Promise<void> {
  return del(id, db());
}

export function clearCards(): Promise<void> {
  return clear(db());
}
