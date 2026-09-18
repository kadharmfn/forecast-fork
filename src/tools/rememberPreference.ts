import { getOrCreateSession, touchSession } from "../lib/session.js";

export interface RememberPreferenceArgs {
  sessionId: string;
  /** Free-text standing preference, e.g. "vegetarian", "no seafood", "loves spicy food". */
  preference: string;
}

export interface RememberPreferenceResult {
  preferences: string[];
}

export function rememberPreference(args: RememberPreferenceArgs): RememberPreferenceResult {
  const session = getOrCreateSession(args.sessionId);
  const trimmed = args.preference.trim();
  if (trimmed && !session.preferences.includes(trimmed)) {
    session.preferences.push(trimmed);
  }
  touchSession(session);
  return { preferences: session.preferences };
}
