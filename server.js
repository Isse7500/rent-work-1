import express from "express";
import pg from "pg";
import crypto from "node:crypto";

const { ADMIN_USER, ADMIN_PASS, ADMIN_KEY, DATABASE_URL, SESSION_SECRET, PORT = 3000 } = process.env;

if (!ADMIN_USER || !ADMIN_PASS || !ADMIN_KEY || !DATABASE_URL || !SESSION_SECRET) {
  console.error("Waa la waayay: ADMIN_USER, ADMIN_PASS, ADMIN_KEY, DATABASE_URL, SESSION_SECRET");
  process.exit(1);
}

if (SESSION_SECRET.length < 24 || ADMIN_PASS.length < 8) {
  console.error("SESSION_SECRET waa inuu ahaadaa 24+ xaraf, ADMIN_PASS 8+ xaraf.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
});
await pool.query("create table if not exists records(coll text not null, id text not null, data jsonb not null, primary key(coll,id))");

const KEYS = {
  houses: ["code", "district", "addr", "type", "rooms", "rent", "landlord"],
  landlords: ["name", "phone", "idn", "addr", "photo"],
  tenants: ["name", "phone", "idn", "job", "fam", "photo", "user", "gname", "gphone", "gidn", "gphoto"],
  contracts: ["house", "tenant", "start", "rent", "dep"],
  payments: ["contract", "amount", "date", "note"],
  staff: ["name", "phone", "district", "user", "photo"],
};
const NEED = {
  houses: ["code", "district", "rent", "landlord"], landlords: ["name", "phone"], tenants: ["name", "phone"],
  contracts: ["house", "tenant", "start", "rent"], payments: ["contract", "amount", "date"], staff: ["name", "district"],
};

// ---- amniga: passwords (scrypt) iyo session (HMAC cookie)
const sha = (v) => crypto.createHash("sha256").update(String(v)).digest();
const eq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const hashPw = (p) => { const s = crypto.randomBytes(16).toString("hex"); return s + ":" + crypto.scryptSync(p, s, 64).toString("hex"); };
const checkPw = (p, h) => {
  const [s, k] = String(h || "").split(":");
  if (!s || !k) return false;
  const d = crypto.scryptSync(String(p), s, 64), kb = Buffer.from(k, "hex");
  return kb.length === d.length && crypto.timingSafeEqual(d, kb);
};
const sign = (v) => crypto.createHmac("sha256", SESSION_SECRET).update(v).digest("base64url");
const mkToken = (o) => { const b = Buffer.from(JSON.stringify({ ...o, exp: Date.now() + 12 * 3600e3 })).toString("base64url"); return b + "." + sign(b); };
const readToken = (req) => {
  const m = (req.headers.cookie || "").match(/(?:^|; )sid=([^;]+)/);
  if (!m) return null;
  const [b, s] = m[1].split(".");
  if (!b || !s || !eq(s, sign(b))) return null;
  try { const o = JSON.parse(Buffer.from(b, "base64url").toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
};

// ---- database
const all = async (c) => (await pool.query("select data from records where coll=$1", [c])).rows.map((r) => r.data);
const put = (c, d) => pool.query("insert into records(coll,id,data) values($1,$2,$3) on conflict(coll,id) do update set data=$3", [c, d.id, d]);
const del = (c, id) => pool.query("delete from records where coll=$1 and id=$2", [c, id]);
const loadAll = async () => { const o = {}; for (const c of Object.keys(KEYS)) o[c] = await all(c); return o; };
const strip = ({ hash, khash, ...r }) => r;

// ---- ogolaanshaha: waxa qof walba arki karo
function scope(R, u) {
  if (u.role === "admin") return R;
  if (u.role === "staff") {
    const me = R.staff.find((x) => x.id === u.id);
    const hs = R.houses.filter((h) => h.district === me.district);
    const cs = R.contracts.filter((c) => hs.some((h) => h.id === c.house));
    return {
      houses: hs, contracts: cs, staff: [me],
      payments: R.payments.filter((p) => cs.some((c) => c.id === p.contract)),
      tenants: R.tenants.filter((t) => t.by === u.id || cs.some((c) => c.tenant === t.id)),
      landlords: R.landlords.filter((l) => l.by === u.id || hs.some((h) => h.landlord === l.id)),
    };
  }
  const me = R.tenants.find((x) => x.id === u.id);
  const cs = R.contracts.filter((c) => c.tenant === u.id);
  const hs = R.houses.filter((h) => cs.some((c) => c.house === h.id));
  return {
    tenants: [me], contracts: cs, houses: hs, staff: [],
    landlords: R.landlords.filter((l) => hs.some((h) => h.landlord === l.id)),
    payments: R.payments.filter((p) => cs.some((c) => c.id === p.contract)),
  };
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "same-origin"); next(); });
app.use(express.static("public"));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: "Khalad server ah." }); });
const bad = (res, m, s = 400) => res.status(s).json({ error: m });

const auth = async (req, res, next) => {
  const s = readToken(req);
  if (!s) return bad(res, "Fadlan gal nidaamka.", 401);
  try {
    if (s.role !== "admin") {
      const x = (await all(s.role === "staff" ? "staff" : "tenants")).find((d) => d.id === s.id);
      if (!x) return bad(res, "Akoonka lama helin.", 401);
    }
    req.u = s; next();
  } catch (e) { console.error(e); bad(res, "Khalad server ah.", 500); }
};
const adminOnly = (req, res, next) => (req.u.role === "admin" ? next() : bad(res, "Admin kaliya ayaa sameyn kara.", 403));

const tries = new Map();
app.post("/api/login", wrap(async (req, res) => {
  const t = tries.get(req.ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 600000) { t.n = 0; t.at = Date.now(); }
  if (t.n >= 10) return bad(res, "Isku day badan. Sug 10 daqiiqo.", 429);
  const { user = "", pass = "", key = "" } = req.body || {};
  let s = null;
  if (eq(user, ADMIN_USER) && eq(pass, ADMIN_PASS) && eq(key, ADMIN_KEY)) s = { role: "admin", id: "admin" };
  else {
    for (const [c, role] of [["staff", "staff"], ["tenants", "user"]]) {
      const x = (await all(c)).find((d) => d.user === user);
      if (x && checkPw(pass, x.hash) && checkPw(key, x.khash)) { s = { role, id: x.id }; break; }
    }
  }
  if (!s) { t.n++; tries.set(req.ip, t); return bad(res, "Username, password ama Secret Key waa khaldan yihiin.", 401); }
  tries.delete(req.ip);
  res.setHeader("Set-Cookie", `sid=${mkToken(s)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${req.secure ? "; Secure" : ""}`);
  res.json({ ok: 1 });
}));
app.post("/api/logout", (req, res) => { res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"); res.json({ ok: 1 }); });

app.get("/api/data", auth, wrap(async (req, res) => {
  const sc = scope(await loadAll(), req.u);
  const data = Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.map(strip)]));
  res.json({ role: req.u.role, id: req.u.id, data });
}));

app.post("/api/import", auth, adminOnly, wrap(async (req, res) => {
  const R = await loadAll(), b = req.body || {}, n = { l: 0, h: 0, t: 0, sk: 0 };
  const t = (v) => String(v == null ? "" : v).trim().slice(0, 300);
  for (const r of b.landlords || []) {
    if (!t(r[0]) || R.landlords.some((x) => x.name === t(r[0]) && x.phone === t(r[1]))) { n.sk++; continue; }
    const d = { id: crypto.randomUUID(), name: t(r[0]), phone: t(r[1]), idn: t(r[2]), addr: t(r[3]) };
    R.landlords.push(d); await put("landlords", d); n.l++;
  }
  for (const r of b.houses || []) {
    const l = R.landlords.find((x) => x.name === t(r[6]));
    if (!t(r[0]) || !l || R.houses.some((h) => h.code === t(r[0]))) { n.sk++; continue; }
    const d = { id: crypto.randomUUID(), code: t(r[0]), district: t(r[1]), addr: t(r[2]), type: t(r[3]) || "Guri", rooms: t(r[4]), rent: t(r[5]), landlord: l.id };
    R.houses.push(d); await put("houses", d); n.h++;
  }
  for (const r of b.tenants || []) {
    if (!t(r[0]) || R.tenants.some((x) => x.name === t(r[0]) && x.phone === t(r[1]))) { n.sk++; continue; }
    const d = { id: crypto.randomUUID(), name: t(r[0]), phone: t(r[1]), idn: t(r[2]), job: t(r[3]), fam: t(r[4]), gname: t(r[5]), gphone: t(r[6]), gidn: t(r[7]) };
    R.tenants.push(d); await put("tenants", d); n.t++;
  }
  res.json(n);
}));

app.post("/api/contracts/:id/end", auth, adminOnly, wrap(async (req, res) => {
  const d = (await all("contracts")).find((x) => x.id === req.params.id);
  if (!d) return bad(res, "Heshiiska lama helin.", 404);
  d.end = new Date().toISOString().slice(0, 10);
  await put("contracts", d); res.json({ ok: 1 });
}));

app.post("/api/:coll", auth, wrap(async (req, res) => {
  const c = req.params.coll, u = req.u, b = req.body || {};
  if (!KEYS[c]) return bad(res, "Lama helin.", 404);
  if (u.role === "user" || (u.role === "staff" && c === "staff")) return bad(res, "Ma haysatid ogolaansho.", 403);
  const R = await loadAll(), sc = scope(R, u);
  const old = b.id ? R[c].find((x) => x.id === b.id) : null;
  if (b.id && !old) return bad(res, "Diiwaanka lama helin.", 404);
  if (old && u.role !== "admin") return bad(res, "Admin kaliya ayaa wax beddeli kara.", 403);
  const d = old ? { ...old } : { id: crypto.randomUUID(), at: new Date().toISOString().slice(0, 10) };
  for (const k of KEYS[c]) {
    if (!(k in b)) continue;
    const v = String(b[k] ?? "");
    if (v.length > (/photo/i.test(k) ? 150000 : 300)) return bad(res, "Qiimaha " + k + " aad buu u weyn yahay.");
    d[k] = v.trim();
  }
  if (!old && u.role === "staff") d.by = u.id;
  if (NEED[c].some((k) => !d[k])) return bad(res, "Buuxi goobaha loo baahan yahay.");
  if (c === "tenants" || c === "staff") {
    if (b.pass) { if (String(b.pass).length < 6) return bad(res, "Password-ku waa inuu ahaadaa 6 xaraf ama ka badan."); d.hash = hashPw(String(b.pass)); }
    if (b.skey) { if (String(b.skey).length < 4) return bad(res, "Secret Key-gu waa inuu ahaadaa 4 xaraf ama ka badan."); d.khash = hashPw(String(b.skey)); }
    if (!d.user || !d.hash || !d.khash) return bad(res, "Username, password iyo Secret Key waa loo baahan yahay.");
    if (eq(d.user, ADMIN_USER) || [...R.tenants, ...R.staff].some((x) => x.user === d.user && x.id !== d.id)) return bad(res, "Username-kan hore ayaa loo isticmaalay.");
  }
  if (c === "houses") {
    if (u.role === "staff") d.district = sc.staff[0].district;
    if (R.houses.some((h) => h.id !== d.id && h.code.toLowerCase() === d.code.toLowerCase())) return bad(res, "Lambarkan guri hore ayaa loo diiwaan geliyay.");
    if (!sc.landlords.some((l) => l.id === d.landlord)) return bad(res, "Milkiilaha lama helin.");
  }
  if (c === "contracts") {
    if (!sc.houses.some((h) => h.id === d.house) || !sc.tenants.some((t) => t.id === d.tenant)) return bad(res, "Guri ama kireyste aan jirin.");
    if (R.contracts.some((x) => x.id !== d.id && x.house === d.house && !x.end)) return bad(res, "Gurigan hore ayaa loo kireeyay.");
  }
  if (c === "payments" && !sc.contracts.some((x) => x.id === d.contract)) return bad(res, "Heshiiska lama helin.");
  await put(c, d);
  res.json({ id: d.id });
}));

app.delete("/api/:coll/:id", auth, adminOnly, wrap(async (req, res) => {
  const { coll: c, id } = req.params;
  if (!KEYS[c]) return bad(res, "Lama helin.", 404);
  const R = await loadAll();
  const used = (c === "landlords" && R.houses.some((h) => h.landlord === id)) ||
    (c === "houses" && R.contracts.some((x) => x.house === id && !x.end)) ||
    (c === "tenants" && R.contracts.some((x) => x.tenant === id && !x.end));
  if (used) return bad(res, "Lama tirin karo: wuxuu ku xiran yahay guri ama heshiis socda.");
  await del(c, id); res.json({ ok: 1 });
}));

app.listen(PORT, () => console.log("Diiwaan-guryaha wuxuu ka shaqeynayaa port " + PORT));
