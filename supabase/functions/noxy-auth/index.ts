// =====================================================================
//  noxy-auth · Edge Function
//  Hace en el SERVIDOR lo que antes hacía el navegador:
//   - login   (usuario o correo + contraseña) con límite de intentos
//   - signup  (valida y crea usuario + fila + perfil, todo atómico)
//   - oauth   (Google/GitHub: enlaza o pide completar registro)
//   - onboard (termina el registro de un usuario OAuth)
//  Migra solas las cuentas viejas (hash propio) a Supabase Auth en su primer login.
//
//  Deploy:  supabase functions deploy noxy-auth --no-verify-jwt
//  Secrets: supabase secrets set ALLOW_ORIGIN=https://TU-SITIO.vercel.app
//           (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya vienen solas)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || SERVICE;
const ORIGINS = (Deno.env.get("ALLOW_ORIGIN") || "").split(",").map((s) => s.trim()).filter(Boolean);

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const NAME = /^[a-z0-9_.]{3,20}$/;
const EML = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USED = "Ese nombre de usuario ya fue usado. Elige otro.";
const BAD = "Usuario o contraseña incorrectos.";

// ---------- utilidades ----------
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  const ok = ORIGINS.length === 0 ? "*" : ORIGINS.includes(o) ? o : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const J = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
const E = (req: Request, error: string, status = 400) => J(req, { error }, status);

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("noxy:" + s)));
async function kd(p: string, s: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(p), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(s), iterations: 120000, hash: "SHA-256" }, k, 256));
}
const ct = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

const bearer = (req: Request) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "x";

// ---------- rate limit ----------
async function blocked(keys: [string, number][]) {
  const since = new Date(Date.now() - 10 * 60e3).toISOString();
  for (const [k, max] of keys) {
    const { count } = await admin.from("noxy_auth_attempts")
      .select("*", { count: "exact", head: true }).eq("k", k).gte("ts", since);
    if ((count ?? 0) >= max) return true;
  }
  return false;
}
const strike = (keys: string[]) => admin.from("noxy_auth_attempts").insert(keys.map((k) => ({ k })));
const clear = (k: string) => admin.from("noxy_auth_attempts").delete().eq("k", k);

// ---------- Supabase Auth ----------
async function grant(email: string, password: string) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at };
}

async function userFromToken(req: Request) {
  const t = bearer(req);
  if (!t) return null;
  const { data, error } = await admin.auth.getUser(t);
  return error ? null : data.user;
}

async function nextId(): Promise<string> {
  try {
    const { data, error } = await admin.rpc("noxy_next_uid");
    if (!error && data) return String(data);
  } catch (_) { /* cae al conteo */ }
  const { count } = await admin.from("noxy_users").select("*", { count: "exact", head: true });
  return String((count ?? 0) + 1);
}

function checkBirth(b: string) {
  const t = new Date(b);
  if (!b || isNaN(+t) || +t > Date.now() || t.getFullYear() < 1900) return "Escribe una fecha de nacimiento válida.";
  if ((Date.now() - +t) / 31557600000 < 13) return "Debes tener al menos 13 años para crear una cuenta.";
  return "";
}
const cleanPhoto = (p: unknown) => {
  const s = String(p || "");
  if (s.length > 300_000) return "";
  return /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) || /^https:\/\/[^\s"'()<>]+$/.test(s) ? s : "";
};

async function upsertProfile(name: string, d: Record<string, unknown>) {
  await admin.from("noxy_profiles").upsert({
    name, photo: d.photo || "", bio: d.bio || "", fullname: d.full || "", created: d.created || Date.now(),
  });
}

// ---------- acciones ----------
async function login(req: Request, b: any) {
  const ident = String(b.ident || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!ident || !password || ident.length > 120 || password.length > 200) return E(req, BAD, 401);

  const ip = ipOf(req);
  if (await blocked([[`u:${ident}`, 8], [`ip:${ip}`, 40]])) {
    return E(req, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", 429);
  }
  const keys = [`u:${ident}`, `ip:${ip}`];

  // buscar la fila por usuario o por correo
  let q = admin.from("noxy_users").select("name,auth_id,data");
  q = ident.includes("@") ? q.eq("data->>email", ident) : q.eq("name", ident);
  const { data: rows } = await q.limit(5);
  const row = (rows || []).find((r: any) => !r.data?.dead);
  if (!row) { await strike(keys); return E(req, BAD, 401); }

  const d = row.data || {};
  let email = "";

  if (row.auth_id) {
    const { data: u } = await admin.auth.admin.getUserById(row.auth_id);
    email = u?.user?.email || "";
  } else {
    // ---- cuenta vieja: verificar el hash antiguo y migrarla a Supabase Auth ----
    if (!d.h) { await strike(keys); return E(req, BAD, 401); }          // cuentas OAuth entran con su botón
    const okOld = d.legacy ? ct(String(d.h), await sha(password)) : ct(String(d.h), await kd(password, String(d.s || "")));
    if (!okOld) { await strike(keys); return E(req, BAD, 401); }

    email = String(d.email || "").toLowerCase();
    if (!EML.test(email)) return E(req, "Tu cuenta antigua no tiene un correo válido. Escríbele al administrador.", 409);

    const { data: cu, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { username: row.name },
    });
    if (error || !cu?.user) {
      return E(req, "No se pudo migrar tu cuenta. Si usaste Google/GitHub con ese correo, entra con ese botón.", 409);
    }
    const { h: _h, s: _s, legacy: _l, ...rest } = d;
    await admin.from("noxy_users").update({ auth_id: cu.user.id, data: { ...rest, last: Date.now() } }).eq("name", row.name);
    row.auth_id = cu.user.id;
    row.data = { ...rest, last: Date.now() };
  }

  const session = email ? await grant(email, password) : null;
  if (!session) { await strike(keys); return E(req, BAD, 401); }

  await clear(`u:${ident}`);
  const last = Date.now();
  await admin.from("noxy_users").update({ data: { ...(row.data || {}), last } }).eq("name", row.name);
  return J(req, { session, name: row.name, data: { ...(row.data || {}), last } });
}

async function signup(req: Request, b: any) {
  const ip = ipOf(req);
  if (await blocked([[`su:${ip}`, 10]])) return E(req, "Demasiados registros desde tu red. Inténtalo más tarde.", 429);
  await strike([`su:${ip}`]);

  const name = String(b.name || "").trim().toLowerCase();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const full = String(b.full || "").trim().slice(0, 80);
  const birth = String(b.birth || "");

  if (full.length < 2) return E(req, "Escribe tu nombre completo.");
  if (!NAME.test(name)) return E(req, "Usuario: de 3 a 20 caracteres, solo letras, números, _ y .");
  if (!EML.test(email) || email.length > 120) return E(req, "Escribe un correo válido.");
  const be = checkBirth(birth); if (be) return E(req, be);
  if (password.length < 8 || password.length > 200) return E(req, "La contraseña debe tener mínimo 8 caracteres.");

  const { data: ex1 } = await admin.from("noxy_users").select("name").eq("name", name).maybeSingle();
  if (ex1) return E(req, USED, 409);
  const { data: ex2 } = await admin.from("noxy_users").select("name").eq("data->>email", email).limit(1);
  if (ex2 && ex2.length) return E(req, "Ese correo ya tiene una cuenta.", 409);

  const { data: cu, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { username: name },
  });
  if (error || !cu?.user) {
    return E(req, /already|registered|exists/i.test(error?.message || "") ? "Ese correo ya tiene una cuenta." : "No se pudo crear la cuenta.", 409);
  }

  const data = {
    id: await nextId(), created: Date.now(), last: Date.now(),
    photo: cleanPhoto(b.photo), full, email, birth,
  };
  const { error: e2 } = await admin.from("noxy_users").insert({ name, auth_id: cu.user.id, data });
  if (e2) {
    await admin.auth.admin.deleteUser(cu.user.id);
    return E(req, /duplicate|unique/i.test(e2.message) ? USED : "No se pudo crear la cuenta.", 409);
  }
  await upsertProfile(name, data);

  const session = await grant(email, password);
  if (!session) return E(req, "Cuenta creada, pero no se pudo iniciar sesión. Intenta entrar.", 500);
  return J(req, { session, name, data });
}

async function oauth(req: Request) {
  const user = await userFromToken(req);
  if (!user) return E(req, "Sesión inválida.", 401);

  let row: any = (await admin.from("noxy_users").select("name,auth_id,data").eq("auth_id", user.id).maybeSingle()).data;
  if (!row) {
    // cuenta OAuth vieja: enlazar por el id del proveedor que ya tenías guardado
    const { data: old } = await admin.from("noxy_users").select("name,auth_id,data").eq("data->>oauth", user.id).maybeSingle();
    if (old && !old.auth_id) {
      await admin.from("noxy_users").update({ auth_id: user.id }).eq("name", old.name);
      row = { ...old, auth_id: user.id };
    }
  }
  if (row && !row.data?.dead) {
    const data = { ...(row.data || {}), last: Date.now() };
    await admin.from("noxy_users").update({ data }).eq("name", row.name);
    return J(req, { name: row.name, data });
  }

  const md: any = user.user_metadata || {};
  const user0 = String(md.user_name || md.preferred_username || (user.email || "").split("@")[0] || "")
    .toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
  return J(req, {
    onboard: {
      oauth: user.id, email: user.email || "", prov: user.app_metadata?.provider || "",
      full: md.full_name || md.name || "", photo: md.avatar_url || md.picture || "", user: user0,
    },
  });
}

async function onboard(req: Request, b: any) {
  const user = await userFromToken(req);
  if (!user) return E(req, "Sesión inválida.", 401);

  const { data: has } = await admin.from("noxy_users").select("name").eq("auth_id", user.id).maybeSingle();
  if (has) return E(req, "Esta cuenta ya está registrada.", 409);

  const name = String(b.name || "").trim().toLowerCase();
  const full = String(b.full || "").trim().slice(0, 80);
  const birth = String(b.birth || "");
  const bio = String(b.bio || "").slice(0, 200);
  if (full.length < 2) return E(req, "Escribe tu nombre completo.");
  if (!NAME.test(name)) return E(req, "Usuario: de 3 a 20 caracteres, solo letras, números, _ y .");
  const be = checkBirth(birth); if (be) return E(req, be);

  const md: any = user.user_metadata || {};
  const data = {
    id: await nextId(), oauth: user.id, provider: user.app_metadata?.provider || "",
    email: (user.email || "").toLowerCase(), full, birth, bio,
    created: Date.now(), last: Date.now(), photo: cleanPhoto(md.avatar_url || md.picture),
  };
  const { error } = await admin.from("noxy_users").insert({ name, auth_id: user.id, data });
  if (error) return E(req, /duplicate|unique/i.test(error.message) ? USED : "No se pudo completar el registro.", 409);
  await upsertProfile(name, data);
  return J(req, { name, data });
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return E(req, "Método no permitido.", 405);
  try {
    const b = await req.json().catch(() => ({}));
    switch (b.action) {
      case "login": return await login(req, b);
      case "signup": return await signup(req, b);
      case "oauth": return await oauth(req);
      case "onboard": return await onboard(req, b);
      default: return E(req, "Acción desconocida.", 400);
    }
  } catch (e) {
    console.error("noxy-auth", e);
    return E(req, "Error del servidor.", 500);
  }
});
