'use client';

import type { User } from '@supabase/supabase-js';

import {
  COACH_CHAT_STORAGE_KEY,
  COACH_PROFILE_STORAGE_KEY,
  MAX_COACH_MESSAGES,
} from './coachPersistence';
import { safeParseJson } from './dailyLog';
import { createSupabaseBrowserClient } from './supabase/client';

const MIGRATION_VERSION = 1;

type StoredCoachChat<TMessage> = {
  messages?: TMessage[];
};

type StoredCoachProfile<TProfile, TDraft> = {
  profile?: TProfile;
  draftProfile?: TDraft;
};

type CloudCoachMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
};

type CloudCoachMessageRow = {
  client_id: string;
  role: 'user' | 'assistant';
  content: string;
  client_created_at: string | null;
  created_at: string;
};

function migrationKey(userId: string) {
  return `fitsync_cloud_migrated_${userId}_v${MIGRATION_VERSION}`;
}

function isPlainEmptyObject(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 0,
  );
}

export async function migrateLocalDataToCloud(user: User): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.localStorage.getItem(migrationKey(user.id)) === 'done') return false;

  const supabase = createSupabaseBrowserClient();

  const storedProfile = safeParseJson<StoredCoachProfile<unknown, unknown>>(
    window.localStorage.getItem(COACH_PROFILE_STORAGE_KEY),
  );

  if (storedProfile?.profile) {
    const { data: cloudProfile, error: profileReadError } = await supabase
      .from('user_profiles')
      .select('health_profile')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileReadError) throw profileReadError;

    if (!cloudProfile || isPlainEmptyObject(cloudProfile.health_profile)) {
      const { error } = await supabase.from('user_profiles').upsert({
        user_id: user.id,
        display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        health_profile: {
          profile: storedProfile.profile,
          draftProfile: storedProfile.draftProfile ?? null,
        },
      });
      if (error) throw error;
    }
  }

  const dailyRows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith('log_')) continue;
    const logDate = key.slice(4);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) continue;
    const log = safeParseJson<Record<string, unknown>>(window.localStorage.getItem(key));
    if (!log) continue;
    dailyRows.push({
      user_id: user.id,
      log_date: logDate,
      protein_g: typeof log.protein === 'number' ? Math.max(0, log.protein) : 0,
      protein_events: Array.isArray(log.proteinEvents) ? log.proteinEvents : [],
      workout: log.workout && typeof log.workout === 'object' ? log.workout : {},
      meals: Array.isArray(log.meals) ? log.meals : [],
    });
  }

  if (dailyRows.length) {
    const { error } = await supabase
      .from('daily_logs')
      .upsert(dailyRows, { onConflict: 'user_id,log_date', ignoreDuplicates: true });
    if (error) throw error;
  }

  const storedChat = safeParseJson<StoredCoachChat<CloudCoachMessage>>(
    window.localStorage.getItem(COACH_CHAT_STORAGE_KEY),
  );
  if (storedChat?.messages?.length) {
    const { count, error: countError } = await supabase
      .from('coach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (countError) throw countError;

    if (!count) {
      const rows = storedChat.messages.slice(-MAX_COACH_MESSAGES).map((message) => ({
        user_id: user.id,
        client_id: message.id,
        role: message.role,
        content: message.text,
        client_created_at: new Date(message.ts).toISOString(),
      }));
      const { error } = await supabase.from('coach_messages').insert(rows);
      if (error) throw error;
    }
  }

  window.localStorage.setItem(migrationKey(user.id), 'done');
  return true;
}

export async function loadCloudDailyLog<T>(userId: string, logDate: string): Promise<T | null> {
  const { data, error } = await createSupabaseBrowserClient()
    .from('daily_logs')
    .select('protein_g, protein_events, workout, meals')
    .eq('user_id', userId)
    .eq('log_date', logDate)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    protein: Number(data.protein_g) || 0,
    proteinEvents: data.protein_events,
    workout: data.workout,
    meals: data.meals,
  } as T;
}

export async function saveCloudDailyLog(
  userId: string,
  logDate: string,
  log: {
    protein: number;
    proteinEvents: unknown[];
    workout: Record<string, unknown>;
    meals: unknown[];
  },
) {
  const { error } = await createSupabaseBrowserClient().from('daily_logs').upsert(
    {
      user_id: userId,
      log_date: logDate,
      protein_g: Math.max(0, log.protein),
      protein_events: log.proteinEvents,
      workout: log.workout,
      meals: log.meals,
    },
    { onConflict: 'user_id,log_date' },
  );
  if (error) throw error;
}

export async function loadCloudCoachState<TProfile, TDraft, TMessage>(userId: string): Promise<{
  profile: TProfile | null;
  draftProfile: TDraft | null;
  messages: TMessage[];
}> {
  const supabase = createSupabaseBrowserClient();
  const [{ data: profileRow, error: profileError }, { data: messageRows, error: messageError }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('health_profile')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('coach_messages')
      .select('client_id, role, content, client_created_at, created_at')
      .eq('user_id', userId)
      .order('client_created_at', { ascending: true })
      .limit(MAX_COACH_MESSAGES),
  ]);

  if (profileError) throw profileError;
  if (messageError) throw messageError;

  const healthProfile = profileRow?.health_profile as {
    profile?: TProfile;
    draftProfile?: TDraft;
  } | null;

  return {
    profile: healthProfile?.profile ?? null,
    draftProfile: healthProfile?.draftProfile ?? null,
    messages: ((messageRows ?? []) as CloudCoachMessageRow[]).map((message) => ({
      id: message.client_id,
      role: message.role,
      text: message.content,
      ts: new Date(message.client_created_at || message.created_at).getTime(),
    })) as TMessage[],
  };
}

export async function saveCloudCoachProfile<TProfile, TDraft>(
  user: User,
  profile: TProfile,
  draftProfile: TDraft,
) {
  const { error } = await createSupabaseBrowserClient().from('user_profiles').upsert({
    user_id: user.id,
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    health_profile: { profile, draftProfile },
  });
  if (error) throw error;
}

export async function saveCloudCoachMessages(
  userId: string,
  messages: CloudCoachMessage[],
) {
  const supabase = createSupabaseBrowserClient();
  const { data: existingRows, error: readError } = await supabase
    .from('coach_messages')
    .select('client_id')
    .eq('user_id', userId);
  if (readError) throw readError;

  const nextMessages = messages.slice(-MAX_COACH_MESSAGES);
  const nextIds = new Set(nextMessages.map((message) => message.id));
  const staleIds = ((existingRows ?? []) as Array<{ client_id: string }>)
    .map((row) => row.client_id)
    .filter((clientId) => !nextIds.has(clientId));

  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from('coach_messages')
      .delete()
      .eq('user_id', userId)
      .in('client_id', staleIds);
    if (deleteError) throw deleteError;
  }

  if (!nextMessages.length) return;
  const rows = nextMessages.map((message) => ({
    user_id: userId,
    client_id: message.id,
    role: message.role,
    content: message.text,
    client_created_at: new Date(message.ts).toISOString(),
  }));
  const { error } = await supabase
    .from('coach_messages')
    .upsert(rows, { onConflict: 'user_id,client_id' });
  if (error) throw error;
}
