// =====================================================================
//  groq · Edge Function  (motor compartido de IA)
//  - Las keys de Groq viven SOLO en la tabla privada noxy_engine_keys.
//  - Solo usuarios con sesión pueden usarlo, con límite por usuario.
//  - Rota keys: si una da 401 se marca "dead"; si da 429 entra en pausa.
//
//  Deploy:  supabase functions deploy groq --no-verify-jwt
//  Secrets: supabase secrets set ALLOW_ORIGIN=https://TU-SITIO.vercel.app
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = (Deno.env.get("ALLOW_ORIGIN") || "").split(",").map((s) => s.trim()).filter(Boolean);
const GROQ = "https://api.groq.com/openai/v1";
const PER_MIN = Number(Deno.env.get("RATE_PER_MIN") || 20);     // peticiones por usuario por minuto
const PER_DAY = Number(Deno.env.get("RATE_PER_DAY") || 600);    // peticiones por usuario por día
const MAX_BYTES = 26 * 1024 * 1024;                              // whisper acepta hasta ~25 MB

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const PATHS = new Set(["/chat/completions", "/models", "/audio/transcriptions", "/audio/speech"]);

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  const ok = ORIGINS.length === 0 ? "*" : ORIGINS.includes(o) ? o : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "x-noxy-engine, retry-after",
    "Vary": "Origin",
  };
}
const H = (req: Request, extra: Record<string, string> = {}) => ({ ...cors(req), "x-noxy-engine": "1", ...extra });
const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: H(req, { "Content-Type": "application/json", ...extra }) });

async function pickKeys() {
  const now = new Date().toISOString();
  const { data } = await admin.from("noxy_engine_keys").select("id,key,uses,cooldown_until")
    .eq("status", "active").or(`cooldown_until.is.null,cooldown_until.lt.${now}`).limit(50);
  return (data || []).sort(() => Math.random() - 0.5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  // ruta tras /groq
  const path = "/" + new URL(req.url).pathname.split("/groq").slice(1).join("/groq").replace(/^\/+/, "");
  const route = path === "/" ? "/health" : path;

  // ---- 1) autenticación obligatoria ----
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: ud, error: ue } = token ? await admin.auth.getUser(token) : { data: null, error: true as any };
  const user = ud?.user;
  if (ue || !user) return json(req, { error: { message: "Inicia sesión para usar la IA." } }, 401);

  // ---- 2) health (para el panel de admin) ----
  if (route === "/health") {
    const { count: total } = await admin.from("noxy_engine_keys").select("*", { count: "exact", head: true });
    const { count: active } = await admin.from("noxy_engine_keys").select("*", { count: "exact", head: true }).eq("status", "active");
    return json(req, { keys: total ?? 0, active: active ?? 0 });
  }

  if (!PATHS.has(route)) return json(req, { error: { message: "Ruta no permitida." } }, 404);
  if (req.method !== "POST" && !(req.method === "GET" && route === "/models")) {
    return json(req, { error: { message: "Método no permitido." } }, 405);
  }

  // ---- 3) límite por usuario ----
  const minAgo = new Date(Date.now() - 60e3).toISOString();
  const dayAgo = new Date(Date.now() - 86400e3).toISOString();
  const [{ count: cm }, { count: cd }] = await Promise.all([
    admin.from("noxy_engine_usage").select("*", { count: "exact", head: true }).eq("uid", user.id).gte("ts", minAgo),
    admin.from("noxy_engine_usage").select("*", { count: "exact", head: true }).eq("uid", user.id).gte("ts", dayAgo),
  ]);
  if ((cm ?? 0) >= PER_MIN || (cd ?? 0) >= PER_DAY) {
    return json(req, { error: { message: "Límite de uso alcanzado. Inténtalo en un minuto." } }, 429, { "retry-after": "60" });
  }
  await admin.from("noxy_engine_usage").insert({ uid: user.id });
  if (Math.random() < 0.02) {  // limpieza ocasional
    admin.from("noxy_engine_usage").delete().lt("ts", new Date(Date.now() - 2 * 86400e3).toISOString()).then(() => {});
    admin.from("noxy_auth_attempts").delete().lt("ts", new Date(Date.now() - 86400e3).toISOString()).then(() => {});
  }

  // ---- 4) cuerpo (tope de tamaño) ----
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json(req, { error: { message: "Archivo demasiado grande." } }, 413);
  const body = req.method === "POST" ? await req.arrayBuffer() : undefined;
  if (body && body.byteLength > MAX_BYTES) return json(req, { error: { message: "Archivo demasiado grande." } }, 413);
  const ctype = req.headers.get("content-type") || "application/json";

  // ---- 5) probar keys en orden hasta que una sirva ----
  const keys = await pickKeys();
  if (!keys.length) return json(req, { error: { message: "El motor compartido no tiene keys activas." } }, 503);

  let last: Response | null = null;
  for (const k of keys.slice(0, 4)) {
    let r: Response;
    try {
      r = await fetch(GROQ + route, {
        method: req.method,
        headers: { Authorization: "Bearer " + k.key, ...(body ? { "Content-Type": ctype } : {}) },
        body,
      });
    } catch (_) { continue; }

    if (r.status === 401 || r.status === 403) {
      await admin.from("noxy_engine_keys").update({ status: "dead" }).eq("id", k.id);
      last = r; continue;
    }
    if (r.status === 429) {
      const ra = Math.min(Math.max(Number(r.headers.get("retry-after") || 30), 30), 600);
      await admin.from("noxy_engine_keys")
        .update({ cooldown_until: new Date(Date.now() + ra * 1000).toISOString() }).eq("id", k.id);
      last = r; continue;
    }
    admin.from("noxy_engine_keys").update({ uses: (k.uses || 0) + 1 }).eq("id", k.id).then(() => {});
    const h = H(req, { "Content-Type": r.headers.get("content-type") || "application/json" });
    return new Response(r.body, { status: r.status, headers: h });
  }

  if (last) return json(req, { error: { message: "Todas las keys están en pausa. Prueba en un minuto." } }, 503);
  return json(req, { error: { message: "No se pudo contactar al proveedor de IA." } }, 502);
});
