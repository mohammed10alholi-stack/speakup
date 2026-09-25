// Edge Function: المعلم الذكي — يتحقق من الاشتراك ويستدعي الذكاء الاصطناعي بمفتاحك المخفي
// يدعم Gemini (مجاني من Google AI Studio) أو Claude (مدفوع). إذا GEMINI_API_KEY موجود بيستخدم Gemini.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// بيجرّب أكثر من موديل بالترتيب، لأن Google بتوقف موديلات قديمة من وقت لوقت
// الأذكى أول؛ إذا مشغول أو مش متاح بينتقل للي بعده تلقائياً
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL"),
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
].filter(Boolean) as string[];

async function gemini(system: string | undefined, messages: { role: string; content: string }[], tier?: string) {
  const key = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  let lastErr = "upstream_error";
  // توكي بيفكر أعمق بالشرح، وبيضل سريع بالمهام الصغيرة
  const level = tier === "quick" ? "low" : "high";
  for (const model of GEMINI_MODELS) {
    const call = (think: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 2048, temperature: 0.8, ...(think ? { thinkingConfig: { thinkingLevel: level } } : {}) },
      }),
    });
    let r = await call(true);
    if (r.status === 400) { console.error(`Gemini ${model}: retrying without thinkingConfig`); r = await call(false); }
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = (d.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("");
      if (text.trim()) return { text };
      console.error(`Gemini ${model}: empty response`, JSON.stringify(d).slice(0, 500));
      continue;
    }
    const msg = JSON.stringify(d?.error || d).slice(0, 500);
    console.error(`Gemini ${model} -> ${r.status}: ${msg}`);
    if (/API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(msg)) return { error: "upstream_error" };
    lastErr = r.status === 429 ? "rate_limited" : "upstream_error";
  }
  return { error: lastErr };
}

async function claude(system: string | undefined, messages: { role: string; content: string }[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001", max_tokens: 1200, ...(system ? { system } : {}), messages }),
  });
  const d = await r.json();
  if (!r.ok) { console.error("Claude:", JSON.stringify(d?.error)); return { error: "upstream_error" }; }
  return { text: (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("") };
}


// ---------- 🔔 Web Push ----------
async function pushLib(): Promise<any> { return (await import("npm:web-push@3.6.7")).default; }
async function vapidKeys(admin: any) {
  const { data } = await admin.from("push_keys").select("*").eq("id", 1).maybeSingle();
  if (data) return data;
  const wp = await pushLib(); const k = wp.generateVAPIDKeys();
  const row = { id: 1, public_key: k.publicKey, private_key: k.privateKey, cron_key: crypto.randomUUID().replace(/-/g, "") };
  await admin.from("push_keys").insert(row);
  return row;
}
const PUSH_MSG = {
  streak: [["🔥 سلسلتك بخطر!", "5 دقايق مع توكي وبتحافظ عليها 💙"], ["🔥 لا تخلّي الشعلة تنطفي", "درس صغير هلأ وبتضل السلسلة شغّالة"]],
  miss: [["💙 توكي مشتاقلك", "كلماتك بتستناك… يلا درس صغير؟"], ["👋 وينك؟", "رجعنالك تمرين قصير على قدّك، جرّبه"], ["🎁 هدية اليوم بتستناك", "افتح الصندوق وكمّل من وين وقفت"]],
};
async function pushSend(admin: any, subs: any[], pick: (s: any) => [string, string] | null) {
  const keys = await vapidKeys(admin), wp = await pushLib();
  wp.setVapidDetails("mailto:support@speakup-ar.com", keys.public_key, keys.private_key);
  let sent = 0, removed = 0;
  for (const s of subs) {
    const m = pick(s); if (!m) continue;
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: m[0], body: m[1], url: "./" }), { TTL: 3600 });
      sent++; if (s._day) await admin.from("push_subs").update({ last_sent: s._day }).eq("endpoint", s.endpoint);
    } catch (e: any) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await admin.from("push_subs").delete().eq("endpoint", s.endpoint); removed++; } else console.error("push", e?.statusCode, String(e?.body || e).slice(0, 200)); }
  }
  return { sent, removed };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // ---- 🔔 كل ساعة: تذكيرات للي ما درسوا اليوم (الجدولة من قاعدة البيانات) ----
    const early = await req.clone().json().catch(() => ({}));
    if (early.action === "push_cron") {
      const keys = await vapidKeys(admin);
      if ((req.headers.get("x-cron-key") || "") !== keys.cron_key) return json({ error: "forbidden" }, 403);
      const { data: subs } = await admin.from("push_subs").select("endpoint,p256dh,auth,user_id,tz,last_sent").limit(5000);
      const ids = [...new Set((subs || []).map((x: any) => x.user_id))];
      const { data: profs } = ids.length ? await admin.from("profiles").select("id,updated_at").in("id", ids) : { data: [] };
      const last: Record<string, number> = {}; (profs || []).forEach((p: any) => last[p.id] = new Date(p.updated_at).getTime());
      const r = await pushSend(admin, subs || [], (sb: any) => {
        const loc = new Date(Date.now() + (sb.tz || 0) * 60000), day = loc.toISOString().slice(0, 10), hour = loc.getUTCHours();
        if (sb.last_sent === day) return null;
        const act = last[sb.user_id] ? new Date(last[sb.user_id] + (sb.tz || 0) * 60000).toISOString().slice(0, 10) : "";
        const idle = act ? Math.round((Date.parse(day) - Date.parse(act)) / 864e5) : 99;
        sb._day = day;
        if (idle === 1 && hour === 19) return PUSH_MSG.streak[Math.floor(Math.random() * PUSH_MSG.streak.length)] as [string, string];
        if (idle >= 2 && idle <= 14 && hour === 12) return PUSH_MSG.miss[Math.floor(Math.random() * PUSH_MSG.miss.length)] as [string, string];
        return null;
      });
      return json({ ok: true, ...r });
    }
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json({ error: "unauthorized" }, 401);

    const { data: prof } = await admin.from("profiles").select("plan_until, role").eq("id", user.id).single();
    // الموقع صار مجاني للكل (بالطاقة ⚡)، فأي حساب مسجّل بيقدر يستخدم

    if (!Deno.env.get("GEMINI_API_KEY") && !Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ai_not_configured" }, 503);

    const body = await req.json().catch(() => ({}));
    if (body.action === "push_key") { const k = await vapidKeys(admin); return json({ key: k.public_key }); }
    if (body.action === "push_test") {
      const { data: subs } = await admin.from("push_subs").select("endpoint,p256dh,auth").eq("user_id", user.id);
      const r = await pushSend(admin, subs || [], () => ["🔔 تجربة من SpeakUp", "الإشعارات شغّالة! توكي رح يذكّرك تكمّل 💙"]);
      return json({ ok: true, ...r });
    }

    // ---- high-quality pronunciation: generate once with Gemini TTS, store publicly, reuse for everyone ----
    if (body.action === "tts") {
      const LN: Record<string, string> = { en: "English (American)", tr: "Turkish", es: "Spanish (Spain)", de: "German", fr: "French", zh: "Mandarin Chinese", it: "Italian" };
      const lang = String(body.lang || ""), text = String(body.text || "").trim();
      // «mix-xx» = رد توكي: عربي فلسطيني مخلوط مع لغة xx، بصوت توكي الحقيقي
      const mix = lang.startsWith("mix-") ? lang.slice(4) : "";
      if ((!LN[lang] && !LN[mix]) || !text || text.length > (mix ? 1200 : 300)) return json({ error: "bad_request" }, 400);
      const key = (Deno.env.get("GEMINI_API_KEY") || "").trim();
      if (!key) return json({ error: "ai_not_configured" }, 503);
      const voice = mix ? "Puck" : "Kore";
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`v2|${lang}|${voice}|${text}`));
      const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const path = `${mix ? "mix" : lang}/${hash}.wav`;
      const pub = admin.storage.from("tts").getPublicUrl(path).data.publicUrl;
      const head = await fetch(pub, { method: "HEAD" }).catch(() => null);
      if (head && head.ok) return json({ url: pub });
      const prompt = mix
        ? `You are Toki, a warm, upbeat language tutor talking to an Arabic-speaking friend. Read this message aloud naturally: speak the Arabic parts in a friendly Palestinian Levantine dialect, and the ${LN[mix]} words and sentences with a clear native ${LN[mix]} accent. Keep a lively, conversational pace. Skip emojis and symbols. Say exactly this text and nothing else: ${text}`
        : `You are a warm, friendly native ${LN[lang]} teacher. Read this aloud in ${LN[lang]} with a clear, natural native accent and a normal, lively pace (not slow, not robotic). Where you see "…", make only a very short pause. Say exactly this text and nothing else: ${text}`;
      let pcm: Uint8Array | null = null, detail = "";
      for (const model of [Deno.env.get("TTS_MODEL"), "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"].filter(Boolean) as string[]) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
          }),
        });
        const d = await r.json().catch(() => ({}));
        const b64 = d?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
        if (r.ok && b64) { pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); break; }
        detail = `${model} -> ${r.status}: ${d?.error?.message || ""}`.slice(0, 300);
        console.error("tts", detail);
      }
      if (!pcm) return json({ error: "tts_failed", detail }, 502);
      // trim the silence Google adds at the start and end (keep ~60 ms of air)
      {
        const n = pcm.length >> 1, v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), TH = 450;
        let a = 0, b = n - 1;
        while (a < n && Math.abs(v.getInt16(a * 2, true)) < TH) a++;
        while (b > a && Math.abs(v.getInt16(b * 2, true)) < TH) b--;
        const pad = 1440; a = Math.max(0, a - pad); b = Math.min(n - 1, b + pad);
        if (b > a) pcm = pcm.slice(a * 2, (b + 1) * 2);
      }
      // wrap raw 24kHz 16-bit mono PCM in a WAV header
      const wav = new Uint8Array(44 + pcm.length), dv = new DataView(wav.buffer);
      const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) wav[o + i] = t.charCodeAt(i); };
      w(0, "RIFF"); dv.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 24000, true); dv.setUint32(28, 48000, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, pcm.length, true); wav.set(pcm, 44);
      const up = await admin.storage.from("tts").upload(path, wav, { contentType: "audio/wav", cacheControl: "31536000", upsert: true });
      if (up.error) return json({ error: "tts_store", detail: "run upgrade-v8.sql: " + up.error.message }, 500);
      return json({ url: pub });
    }

    // ---- Toki Live (real voice): short-lived Google token + daily minutes per user ----
    if (typeof body.action === "string" && body.action.startsWith("live_")) {
      const isAdmin = prof?.role === "admin";
      const { data: sets } = await admin.from("app_settings").select("key,value").in("key", ["live_voice", "live_daily_min"]);
      const sv: Record<string, string> = Object.fromEntries((sets || []).map((r: any) => [r.key, r.value]));
      const mode = (sv.live_voice || Deno.env.get("LIVE_ENABLED") || "admins").toLowerCase(); // off | admins | all
      const enabled = isAdmin || mode === "all";
      const dailySec = Math.max(0, Number(sv.live_daily_min ?? "5") || 0) * 60;
      const today = new Date().toISOString().slice(0, 10);
      // free minutes left today (admins: unlimited 10-minute calls)
      const freeLeft = async () => {
        if (isAdmin) return 10 * 60;
        let q = await admin.from("live_sessions").select("granted_sec,used_sec,source").eq("uid", user.id).eq("day", today);
        if (q.error) q = await admin.from("live_sessions").select("granted_sec,used_sec").eq("uid", user.id).eq("day", today) as any;
        if (q.error) return -1;
        const used = (q.data || []).filter((r: any) => (r.source || "free") === "free").reduce((a: number, r: any) => a + (r.used_sec ?? r.granted_sec), 0);
        return Math.max(0, dailySec - used);
      };
      const balance = async () => {
        const { data, error: be } = await admin.from("profiles").select("live_balance_sec").eq("id", user.id).maybeSingle();
        return be ? 0 : Math.max(0, Number(data?.live_balance_sec) || 0);
      };

      if (body.action === "live_status") {
        if (!enabled) return json({ enabled: false, remaining_sec: 0, balance_sec: 0 });
        const rem = await freeLeft();
        return json({ enabled: rem >= 0, remaining_sec: Math.max(0, rem), balance_sec: isAdmin ? 0 : await balance(), daily_min: dailySec / 60 });
      }

      if (body.action === "live_end") {
        const sid = String(body.sid || "");
        const used = Math.max(0, Math.round(Number(body.used) || 0));
        if (sid) {
          let q = await admin.from("live_sessions").select("granted_sec,used_sec,source").eq("id", sid).eq("uid", user.id).maybeSingle();
          if (q.error) q = await admin.from("live_sessions").select("granted_sec,used_sec").eq("id", sid).eq("uid", user.id).maybeSingle() as any;
          const row: any = q.data;
          if (row && row.used_sec == null) {
            const u = Math.min(used, row.granted_sec);
            await admin.from("live_sessions").update({ used_sec: u }).eq("id", sid);
            if (row.source === "balance" && row.granted_sec - u > 0) await admin.rpc("live_refund", { u: user.id, sec: row.granted_sec - u });
          }
        }
        return json({ ok: true, balance_sec: await balance() });
      }

      if (body.action !== "live_token") return json({ error: "bad_request" }, 400);
      if (!enabled) return json({ error: "live_disabled" }, 403);
      const key = (Deno.env.get("GEMINI_API_KEY") || "").trim();
      if (!key) return json({ error: "ai_not_configured" }, 503);
      const rem = await freeLeft();
      if (rem < 0) return json({ error: "live_setup", detail: "live_sessions table missing: run upgrade-v6.sql" }, 500);

      // free minutes first; then the paid balance (reserved now, unused part refunded at the end)
      let grant = 0, source = "free";
      if (rem >= 20) grant = Math.min(rem, 10 * 60);
      else if (body.use_balance) {
        const { data: got, error: re } = await admin.rpc("live_reserve", { u: user.id, want: 10 * 60 });
        if (re) return json({ error: "live_setup", detail: "run upgrade-v7.sql: " + re.message }, 500);
        grant = Number(got) || 0;
        source = "balance";
      }
      if (grant < 20) return json({ error: "live_quota", remaining_sec: 0, balance_sec: await balance() }, 429);
      const refund = async () => { if (source === "balance") await admin.rpc("live_refund", { u: user.id, sec: grant }); };

      const models = [Deno.env.get("LIVE_MODEL"), "gemini-3.8-live-extended-thinking", "gemini-3.8-live", "gemini-3.1-flash-live-preview", "gemini-2.5-flash-native-audio-preview-12-2025"].filter(Boolean) as string[];
      const now = Date.now();
      let detail = "";
      for (const model of models) {
        for (const withConstraints of [true, false]) {
          const tb: Record<string, unknown> = {
            uses: 1,
            expireTime: new Date(now + (grant + 30) * 1000).toISOString(),
            newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
          };
          if (withConstraints) tb.liveConnectConstraints = { model: "models/" + model };
          for (const ver of ["v1beta", "v1alpha"]) {
            const r = await fetch(`https://generativelanguage.googleapis.com/${ver}/auth_tokens`, {
              method: "POST",
              headers: { "x-goog-api-key": key, "content-type": "application/json" },
              body: JSON.stringify(tb),
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.name) {
              let ins = await admin.from("live_sessions").insert({ uid: user.id, day: today, granted_sec: grant, source }).select("id").maybeSingle();
              if (ins.error) ins = await admin.from("live_sessions").insert({ uid: user.id, day: today, granted_sec: grant }).select("id").maybeSingle() as any;
              return json({ token: d.name, model, sid: ins.data?.id || null, seconds: grant, source, remaining_sec: rem });
            }
            detail = `${ver} ${model}${withConstraints ? "" : " (no constraints)"} -> ${r.status}: ${d?.error?.message || JSON.stringify(d).slice(0, 200)}`;
            console.error("live token", detail);
            if (r.status === 429) { await refund(); return json({ error: "live_busy", detail }, 429); }
            if (/API_KEY_INVALID|API key not valid/i.test(detail)) { await refund(); return json({ error: "live_error", detail }, 502); }
          }
        }
      }
      await refund();
      return json({ error: "live_error", detail }, 502);
    }

    // رسالة لتوكي بتصرف ⚡ وحدة (السيرفر هو اللي بيخصم)
    if (body.charge) {
      const { data: en, error: ee } = await admin.rpc("use_energy_for", { u: user.id, n: 1 });
      if (!ee && en && (en as any).ok === false) return json({ error: "no_energy", energy: en }, 402);
    }

    const limit = Number(Deno.env.get("DAILY_AI_LIMIT") || "60");
    const { data: used, error: uerr } = await admin.rpc("bump_ai_usage", { uid: user.id });
    if (uerr) return json({ error: "usage_error" }, 500);
    if ((used as number) > limit) return json({ error: "rate_limited" }, 429);

    let messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-20)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "bad_request" }, 400);
    if (messages[0].role !== "user") messages = [{ role: "user", content: "(start the conversation)" }, ...messages];
    const system = typeof body.system === "string" ? body.system.slice(0, 5000) : undefined;

    const out = Deno.env.get("GEMINI_API_KEY") ? await gemini(system, messages, body.tier) : await claude(system, messages);
    if (out.error) return json({ error: out.error }, out.error === "rate_limited" ? 429 : 502);
    return json({ text: out.text });
  } catch (_e) {
    return json({ error: "server_error" }, 500);
  }
});
