import { safeParseJson } from './dailyLog';

export const COACH_CHAT_STORAGE_KEY = 'coach_chat_v1';
export const COACH_PROFILE_STORAGE_KEY = 'coach_profile_v1';
export const COACH_STORAGE_VERSION = 2;
export const MAX_COACH_MESSAGES = 100;

type StoredCoachChat<TMessage> = {
  version?: number;
  messages?: TMessage[];
  updatedAt?: number;
  timestamp?: number;
};

type StoredCoachProfile<TProfile, TDraft> = {
  version?: number;
  profile?: TProfile;
  draftProfile?: TDraft;
  updatedAt?: number;
  timestamp?: number;
};

export function loadCoachChat<TMessage>(): TMessage[] | null {
  if (typeof window === 'undefined') return null;
  const data = safeParseJson<StoredCoachChat<TMessage>>(
    window.localStorage.getItem(COACH_CHAT_STORAGE_KEY),
  );
  return Array.isArray(data?.messages) ? data.messages.slice(-MAX_COACH_MESSAGES) : null;
}

export function saveCoachChat<TMessage>(messages: TMessage[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    COACH_CHAT_STORAGE_KEY,
    JSON.stringify({
      version: COACH_STORAGE_VERSION,
      messages: messages.slice(-MAX_COACH_MESSAGES),
      updatedAt: Date.now(),
    }),
  );
}

export function loadCoachProfile<TProfile, TDraft>(): {
  profile: TProfile;
  draftProfile?: TDraft;
} | null {
  if (typeof window === 'undefined') return null;
  const data = safeParseJson<StoredCoachProfile<TProfile, TDraft>>(
    window.localStorage.getItem(COACH_PROFILE_STORAGE_KEY),
  );
  if (!data?.profile) return null;
  return {
    profile: data.profile,
    draftProfile: data.draftProfile,
  };
}

export function saveCoachProfile<TProfile, TDraft>(
  profile: TProfile,
  draftProfile: TDraft,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    COACH_PROFILE_STORAGE_KEY,
    JSON.stringify({
      version: COACH_STORAGE_VERSION,
      profile,
      draftProfile,
      updatedAt: Date.now(),
    }),
  );
}
