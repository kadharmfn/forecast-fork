import type { GeocodedLocation } from "./geocode.js";
import type { CurrentWeather } from "./weather.js";

// In-memory, per-process session store — deliberately simple for a hackathon build. Lets a
// customer's standing preferences and last recommendation carry across turns/tool calls within
// a conversation (the "keeps context across sessions" bar), without a database. A real deployment
// would back this with a shared store (Redis/DynamoDB) so it survives process restarts and works
// across multiple server instances.
export interface DiningSession {
  id: string;
  /** Standing preferences the customer has stated, e.g. "vegetarian", "no seafood". */
  preferences: string[];
  lastLocation?: GeocodedLocation;
  lastWeather?: CurrentWeather;
  lastDishes?: string[];
  /** Dishes already suggested and rejected this conversation, so refinement doesn't repeat them. */
  rejectedDishes: string[];
  updatedAt: number;
}

const sessions = new Map<string, DiningSession>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours of inactivity

function pruneExpired(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(id);
  }
}

export function getOrCreateSession(id: string): DiningSession {
  pruneExpired();
  let session = sessions.get(id);
  if (!session) {
    session = { id, preferences: [], rejectedDishes: [], updatedAt: Date.now() };
    sessions.set(id, session);
  }
  return session;
}

export function getSession(id: string): DiningSession | undefined {
  pruneExpired();
  return sessions.get(id);
}

export function touchSession(session: DiningSession): void {
  session.updatedAt = Date.now();
}
