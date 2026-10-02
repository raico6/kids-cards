// Generate a JennyNeural MP3 for a parent-added word and store it in the public `tts` bucket.
// Deploy with verify_jwt ON. The platform rejects missing/invalid JWTs before this runs,
// and the function checks the user again so an anonymous caller still gets 401.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { synthesizeJenny } from "./speech.ts";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SYNTH_PER_WINDOW = 12;
const synthHits = new Map<string, number[]>();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

/** Same cache key the site uses for built-in word files. */
export function wordSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Letters, spaces, hyphens, apostrophes, at most 40 characters. */
export function validWord(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*(?: +[A-Za-z]+(?:['-][A-Za-z]+)*)*$/.test(t);
}

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (synthHits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_SYNTH_PER_WINDOW) {
    synthHits.set(userId, recent);
    return true;
  }
  recent.push(now);
  synthHits.set(userId, recent);
  return false;
}

function objectPath(slug: string): string {
  return `audio/tts/${slug}.mp3`;
}

function publicUrl(supabaseUrl: string, slug: string, version?: number): string {
  const base = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/tts/${objectPath(slug)}`;
  return version ? `${base}?v=${version}` : base;
}

async function userId(supabaseUrl: string, serviceKey: string, authHeader: string): Promise<string | null> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: serviceKey },
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body && typeof body.id === "string" ? body.id : null;
}

async function cached(url: string): Promise<boolean> {
  const res = await fetch(url, { method: "HEAD" });
  return res.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "server is missing storage credentials" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "sign in required" }, 401);
  const uid = await userId(supabaseUrl, serviceKey, authHeader);
  if (!uid) return json({ error: "sign in required" }, 401);

  let payload: { text?: unknown; force?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!validWord(text)) return json({ error: "word must be 1-40 English letters, spaces, hyphens, or apostrophes" }, 400);
  const slug = wordSlug(text);
  if (!slug) return json({ error: "word must include a letter" }, 400);
  const force = payload.force === true;

  const existing = publicUrl(supabaseUrl, slug);
  try {
    if (!force && await cached(existing)) return json({ url: existing, slug, cached: true });
  } catch {
    /* treat a failed lookup as a cache miss and try to synthesize */
  }

  if (rateLimited(uid)) return json({ error: "too many recordings, try again in a few minutes" }, 429);

  let audio: Uint8Array;
  try {
    audio = await synthesizeJenny(text);
  } catch (err) {
    console.error("tts synthesize failed", err instanceof Error ? err.message : err);
    return json({ error: "could not record that word" }, 502);
  }
  if (!audio.length || audio.length > 1024 * 1024) return json({ error: "could not record that word" }, 502);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const version = Date.now();
  const { error } = await admin.storage.from("tts").upload(objectPath(slug), audio, {
    contentType: "audio/mpeg",
    upsert: true,
    cacheControl: force ? "60" : "86400",
  });
  if (error) {
    console.error("tts upload failed", error.message);
    return json({ error: "could not store the recording" }, 502);
  }
  return json({ url: publicUrl(supabaseUrl, slug, force ? version : undefined), slug, cached: false });
});
