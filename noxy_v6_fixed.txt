/* ===== NOXY v6 (reescrito, mismas funciones) ===== */
(() => {

document.head.insertAdjacentHTML('beforeend', `<style>
#side{max-width:calc(100% - 16px)!important;padding:8px 10px!important;gap:2px!important}
.nv{width:auto!important;min-width:60px!important;height:52px!important;flex-direction:column!important;gap:3px!important;padding:4px 8px!important;font-size:11px!important}
.nv span{display:block!important;font-size:10.5px;font-weight:600;letter-spacing:.01em}
.nv:after{display:none!important}
#view{padding-bottom:124px!important}
.osrow>#go{width:auto!important;height:44px;flex:none}
.plh{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.plh .plk{margin-left:auto}
.plgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.plc{position:relative;text-align:left;padding:14px;border-radius:16px;border:1px solid var(--bd);background:var(--bg2);display:flex;gap:12px;align-items:flex-start;transition:border-color .15s,transform .1s}
.plc:hover{border-color:var(--ac2)}
.plc:active{transform:scale(.985)}
.plc .ic2{width:36px;height:36px;flex:none;border-radius:11px;background:var(--bg3);display:grid;place-items:center;color:var(--ac2)}
.plc b{display:block;font-size:14px}
.plc small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px;line-height:1.4}
.plc .tagp{position:absolute;top:10px;right:10px;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ac2);border:1px solid color-mix(in srgb,var(--ac2) 45%,transparent);border-radius:99px;padding:2px 7px}
.pgate{max-width:340px;margin:8vh auto;text-align:center}
.pgate .ic3{width:56px;height:56px;margin:0 auto 14px;border-radius:18px;background:var(--bg3);display:grid;place-items:center;color:var(--ac2)}
.pgate h2{font-size:20px;margin-bottom:6px}
.pgate p{color:var(--mut);font-size:13.5px;margin-bottom:14px}
.pgate input{text-align:center;letter-spacing:.12em}
.osrow input{flex:1}
.kv{display:grid;grid-template-columns:minmax(88px,auto) 1fr;gap:7px 14px;font-size:13px}
.kv b{color:var(--mut);font-weight:500}
.kv span{word-break:break-word}
.sec2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:16px 0 8px}
.lsview:after{content:"";position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:28px 28px}
.lsempty{position:absolute;inset:0;display:grid;place-items:center;color:#ffffff44;font-size:12px;text-align:center;padding:20px}
</style>`);

/* ---------- helpers compartidos (reusan los globales si ya existen) ---------- */
const GJ = (typeof gj !== 'undefined') ? gj : (u => fetch(u).then(r => { if (!r.ok) throw Error('HTTP ' + r.status); return r.json() }));
const GT = (typeof gt !== 'undefined') ? gt : (u => fetch(u).then(r => r.text()));
const KV = (typeof kv !== 'undefined') ? kv : (a => '<div class=kv>' + a.map(([k, v]) => '<b>' + esc(k) + '</b><span>' + esc(v == null || v === '' ? '—' : v) + '</span>').join('') + '</div>');
const SHOT = (typeof shot !== 'undefined') ? shot : (() => {});
const GET = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch (e) { return d } };
const SET = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} };

/* ---------- zip (compresión STORE, sin dependencias) ---------- */
const CRC_TABLE = (() => {
 const t = new Uint32Array(256);
 for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c >>> 0 }
 return t;
})();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 };
const u16 = v => [v & 255, (v >> 8) & 255];
const u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
function zip(files) {
 const E = new TextEncoder(), body = [], central = [];
 let offset = 0;
 for (const f of files) {
  const nameBytes = E.encode(f.n);
  const data = typeof f.d === 'string' ? E.encode(f.d) : f.d;
  const crc = crc32(data);
  const localHeader = new Uint8Array([
   ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
   ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
  ]);
  body.push(localHeader, nameBytes, data);
  const centralHeader = new Uint8Array([
   ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
   ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
  ]);
  central.push(centralHeader, nameBytes);
  offset += localHeader.length + nameBytes.length + data.length;
 }
 const centralStart = offset;
 const centralLen = central.reduce((a, p) => a + p.length, 0);
 const end = new Uint8Array([
  ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
  ...u32(centralLen), ...u32(centralStart), ...u16(0)
 ]);
 return new Blob([...body, ...central, end], { type: 'application/zip' });
}

/* ---------- empaquetado .py + README ---------- */
function readme(title, desc, example) {
 const lines = [
  'NOXY PLONT - ' + title,
  '='.repeat(46),
  '',
  'Que hace:',
  desc,
  '',
  'Uso rapido (Windows):',
  '1. Instala Python 3 desde python.org y marca "Add Python to PATH".',
  '2. Abre CMD en esta carpeta (shift + clic derecho > abrir terminal).',
  '3. pip install -r requirements.txt',
  '4. ' + example,
  '',
  'Linux / Mac:',
  '1. python3 -m pip install -r requirements.txt',
  '2. ' + example.replace('python ', 'python3 '),
  '',
  'Notas:',
  '- Solo usa datos publicos. Nada de esto rompe nada.',
  '- Si un servicio limita, espera un rato o cambia de red.',
  '- Hecho por Noxy.'
 ];
 return lines.join('\r\n') + '\r\n';
}
function pack(fileSlug, pyCode, title, desc, example) {
 return zip([
  { n: 'noxyplont_' + fileSlug + '.py', d: pyCode },
  { n: 'requirements.txt', d: 'requests\n' },
  { n: 'README.txt', d: readme(title, desc, example) }
 ]);
}

/* ---------- runner genérico de cada herramienta ---------- */
function mk(el, o) {
 el.innerHTML = '<div class=pad><h3>' + esc(o.t) + '</h3><p>' + esc(o.d) + '</p>' +
  '<div class=osrow><input id=qi placeholder="' + esc(o.ph || '') + '" autocapitalize=none spellcheck=false>' +
  '<button class="pb" id=go>Ejecutar</button></div>' +
  '<div class=acts style="margin-bottom:10px">' + (o.py ? '<button class=gb id=dz>Descargar .zip</button>' : '') +
  '<span id=xp style="align-self:center;color:var(--mut);font-size:12px"></span></div>' +
  '<div id=o></div></div>';
 const inp = $('#qi', el), out = $('#o', el);
 const run = async () => {
  const v = inp.value.trim();
  if (!v) return;
  out.innerHTML = '<p class=sub>Consultando…</p>';
  try { await o.run(v, out, el) }
  catch (e) { out.innerHTML = '<div class=iss style="border-left:3px solid #ff3b46">' + esc(e.message) + '</div>' }
 };
 $('#go', el).onclick = run;
 inp.onkeydown = e => { if (e.key === 'Enter') run() };
 if (o.py) {
  $('#dz', el).onclick = () => {
   dl(pack(o.py[0], o.py[1], o.t, o.d, o.py[2]), 'noxyplont_' + o.py[0] + '.zip');
   if (typeof snd === 'function') snd(600, 900);
  };
 }
}

/* ---------- las 10 herramientas de Plont ---------- */
const T = {
 ip: el => mk(el, {
  t: 'IP Dossier', d: 'Geo, ISP, ASN, prefijo BGP, PTR, puertos y CVEs de una IP o dominio.', ph: '8.8.8.8',
  py: ['ip',
   '# Noxy Plont - IP Dossier\n' +
   'import sys, json, requests\n\n' +
   'ip = sys.argv[1]\n' +
   'if not ip.replace(".", "").isdigit():\n' +
   '    ip = requests.get(f"https://dns.google/resolve?name={ip}&type=A").json()["Answer"][0]["data"]\n' +
   'g = requests.get(f"https://ipwho.is/{ip}").json()\n' +
   'print(json.dumps({k: g.get(k) for k in ("ip","country","region","city","latitude","longitude","connection")}, indent=2))\n' +
   'for u in (f"https://internetdb.shodan.io/{ip}", f"https://api.bgpview.io/ip/{ip}"):\n' +
   '    try: print(json.dumps(requests.get(u).json(), indent=2))\n' +
   '    except Exception as e: print("fallo", u, e)\n',
   'python noxyplont_ip.py 8.8.8.8'],
  run: async (v, o, el) => {
   const ip = /^\d+\.\d+\.\d+\.\d+$/.test(v) ? v : (await GJ('https://dns.google/resolve?name=' + encodeURIComponent(v) + '&type=A')).Answer?.[0]?.data;
   if (!ip) throw Error('No resolvió.');
   const g = await GJ('https://ipwho.is/' + ip);
   if (g.success === false) throw Error('IP inválida.');
   const [sh, bg, ptr] = await Promise.all([
    GJ('https://internetdb.shodan.io/' + ip).catch(() => ({})),
    GJ('https://api.bgpview.io/ip/' + ip).catch(() => ({})),
    GJ('https://dns.google/resolve?name=' + ip + '&type=PTR').then(j => j.Answer?.[0]?.data || '').catch(() => '')
   ]);
   let html = KV([
    ['IP', ip], ['PTR', ptr],
    ['País', [g.country, g.region, g.city].filter(Boolean).join(', ')],
    ['Coords', g.latitude + ', ' + g.longitude],
    ['Zona', g.timezone?.id], ['ISP', g.connection?.isp],
    ['ASN', 'AS' + g.connection?.asn], ['Prefijo', bg.data?.prefixes?.[0]?.prefix]
   ]);
   if (sh.ports?.length) html += '<div class=sec2>Puertos (' + sh.ports.length + ')</div><div class=tags>' + sh.ports.map(p => '<span>' + p + '</span>').join('') + '</div>';
   if (sh.hostnames?.length) html += '<div class=sec2>Hostnames</div><div class=tags>' + sh.hostnames.map(h => '<span>' + esc(h) + '</span>').join('') + '</div>';
   if (sh.vulns?.length) html += '<div class=sec2>CVEs</div><div class=tags>' + sh.vulns.map(c => '<span>' + c + '</span>').join('') + '</div>';
   html += '<div class=acts style="margin-top:12px"><a class=gb style="text-decoration:none" target=_blank rel=noopener href="https://www.shodan.io/host/' + ip + '">Shodan</a>' +
    '<a class=gb style="text-decoration:none" target=_blank rel=noopener href="https://www.abuseipdb.com/check/' + ip + '">AbuseIPDB</a></div>';
   o.innerHTML = html;
   SHOT(el, 3);
  }
 }),

 dom: el => mk(el, {
  t: 'Domain Recon', d: 'RDAP, DNS completo, certificados y subdominios de un dominio.', ph: 'ejemplo.com',
  py: ['dom',
   '# Noxy Plont - Domain Recon\n' +
   'import sys, requests\n\n' +
   'd = sys.argv[1]\n' +
   'for t in ("A","MX","NS","TXT"):\n' +
   '    j = requests.get(f"https://dns.google/resolve?name={d}&type={t}").json()\n' +
   '    print(t, [a["data"] for a in j.get("Answer", [])])\n' +
   'try:\n' +
   '    r = requests.get(f"https://rdap.org/domain/{d}", timeout=15).json()\n' +
   '    print("eventos:", r.get("events"))\n' +
   'except Exception as e: print("rdap:", e)\n' +
   'for c in requests.get(f"https://crt.sh/?q=%25.{d}&output=json").json()[:60]:\n' +
   '    print("sub:", c["name_value"].replace(chr(10), " | "))\n',
   'python noxyplont_dom.py ejemplo.com'],
  run: async (v, o, el) => {
   const d = v.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
   const [rd, a, mx, ns, tx, cr] = await Promise.all([
    GJ('https://rdap.org/domain/' + d).catch(() => null),
    GJ('https://dns.google/resolve?name=' + d + '&type=A').catch(() => ({})),
    GJ('https://dns.google/resolve?name=' + d + '&type=MX').catch(() => ({})),
    GJ('https://dns.google/resolve?name=' + d + '&type=NS').catch(() => ({})),
    GJ('https://dns.google/resolve?name=' + d + '&type=TXT').catch(() => ({})),
    GT('https://crt.sh/?q=%25.' + d + '&output=json').then(JSON.parse).catch(() => [])
   ]);
   const ev = x => rd?.events?.find(e => e.eventAction == x)?.eventDate?.slice(0, 10) || '—';
   const subs = [...new Set((Array.isArray(cr) ? cr : []).flatMap(c => String(c.name_value || '').split('\n')))].filter(s => s.endsWith(d)).slice(0, 80);
   let html = KV([['Dominio', d], ['Creado', ev('registration')], ['Vence', ev('expiration')], ['Estado', (rd?.status || []).join(', ')]]);
   html += '<div class=sec2>A</div><div class=tags>' + ((a.Answer || []).map(x => '<span>' + esc(x.data) + '</span>').join('') || '—') + '</div>';
   html += '<div class=sec2>MX</div><div class=tags>' + ((mx.Answer || []).map(x => '<span>' + esc(x.data) + '</span>').join('') || '—') + '</div>';
   html += '<div class=sec2>NS</div><div class=tags>' + ((ns.Answer || []).map(x => '<span>' + esc(x.data) + '</span>').join('') || '—') + '</div>';
   if (tx.Answer?.length) html += '<div class=sec2>TXT</div><div class=tags>' + tx.Answer.map(x => '<span>' + esc(String(x.data).slice(0, 120)) + '</span>').join('') + '</div>';
   if (subs.length) html += '<div class=sec2>Subdominios (' + subs.length + ')</div><div class=tags>' + subs.map(s => '<span>' + esc(s) + '</span>').join('') + '</div>';
   o.innerHTML = html;
   SHOT(el, 3);
  }
 }),

 sub: el => mk(el, {
  t: 'Subdomain Hunter', d: 'Cruza certificados públicos con fuerza bruta DNS.', ph: 'ejemplo.com',
  py: ['sub',
   '# Noxy Plont - Subdomain Hunter\n' +
   'import sys, requests\n\n' +
   'd = sys.argv[1]\n' +
   'seen = set()\n' +
   'for c in requests.get(f"https://crt.sh/?q=%25.{d}&output=json", timeout=30).json():\n' +
   '    for s in c["name_value"].split(chr(10)):\n' +
   '        if s.endswith(d): seen.add(s.strip())\n' +
   'for w in ("www","api","dev","test","mail","vpn","admin","cdn","app","blog","shop"):\n' +
   '    h = f"{w}.{d}"\n' +
   '    try:\n' +
   '        j = requests.get(f"https://dns.google/resolve?name={h}&type=A", timeout=10).json()\n' +
   '        if j.get("Answer"): seen.add(h)\n' +
   '    except Exception: pass\n' +
   'print(chr(10).join(sorted(seen)))\n',
   'python noxyplont_sub.py ejemplo.com'],
  run: async (v, o, el) => {
   const d = v.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
   const cr = await GT('https://crt.sh/?q=%25.' + d + '&output=json').then(JSON.parse).catch(() => []);
   let found = [...new Set((Array.isArray(cr) ? cr : []).flatMap(c => String(c.name_value || '').split('\n')))].filter(s => s.endsWith(d));
   const words = ['www', 'api', 'dev', 'test', 'mail', 'vpn', 'admin', 'cdn', 'app', 'blog', 'shop', 'panel', 'sso', 'git', 'static'];
   const hits = await Promise.all(words.map(async w => {
    const h = w + '.' + d;
    try { const j = await GJ('https://dns.google/resolve?name=' + h + '&type=A'); return j.Answer?.length ? h : null }
    catch (e) { return null }
   }));
   found = [...new Set([...found, ...hits.filter(Boolean)])];
   o.innerHTML = found.length ? ('<div class=tags>' + found.sort().map(s => '<span>' + esc(s) + '</span>').join('') + '</div>') : '<p class=sub>Nada encontrado.</p>';
   SHOT(el, 2);
  }
 }),

 mail: el => mk(el, {
  t: 'Email Harvester', d: 'MX del dominio, perfil de Gravatar y verificación de un correo.', ph: 'correo@dominio.com',
  py: ['mail',
   '# Noxy Plont - Email Harvester\n' +
   'import sys, hashlib, requests\n\n' +
   'e = sys.argv[1].lower()\n' +
   'dom = e.split("@")[1]\n' +
   'print("md5:", hashlib.md5(e.encode()).hexdigest())\n' +
   'print("mx:", [a["data"] for a in requests.get(f"https://dns.google/resolve?name={dom}&type=MX").json().get("Answer", [])])\n' +
   'r = requests.get(f"https://www.gravatar.com/{hashlib.md5(e.encode()).hexdigest()}.json")\n' +
   'print("gravatar:", r.status_code == 200)\n',
   'python noxyplont_mail.py correo@dominio.com'],
  run: async (v, o, el) => {
   const e = v.toLowerCase(), dom = e.split('@')[1] || '';
   if (!dom) throw Error('Falta el dominio.');
   const md5h = await (async s => {
    const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
   })(e);
   const [gr, ev, mx] = await Promise.all([
    GJ('https://www.gravatar.com/' + md5h + '.json').catch(() => null),
    GJ('https://api.eva.pingutil.com/email?email=' + encodeURIComponent(e)).catch(() => null),
    GJ('https://dns.google/resolve?name=' + dom + '&type=MX').catch(() => ({}))
   ]);
   const p = gr?.entry;
   let html = KV([
    ['Correo', e], ['Entregable', ev?.data?.deliverable ? 'sí' : 'no'],
    ['Descartable', ev?.data?.disposable ? 'sí' : 'no'], ['Gravatar', p ? 'perfil público' : 'sin perfil']
   ]);
   if (p) html += '<div class=sec2>Perfil</div>' + KV([['Nombre', p.displayName], ['Ubicación', p.currentLocation]]) +
    (p.urls || []).map(u => '<div class=iss><b>' + esc(u.title || 'enlace') + '</b><div style="word-break:break-all">' + esc(u.value) + '</div></div>').join('');
   html += '<div class=sec2>MX</div><div class=tags>' + ((mx.Answer || []).map(x => '<span>' + esc(x.data) + '</span>').join('') || '—') + '</div>';
   o.innerHTML = html;
   SHOT(el, 2);
  }
 }),

 user: el => mk(el, {
  t: 'Username Sweep', d: 'Barrido de un alias en varias plataformas (usa la app Sherlock).', ph: 'usuario',
  run: async (v, o, el) => {
   if (typeof sherlock !== 'function') throw Error('El módulo Sherlock no está disponible en esta página.');
   el.innerHTML = '';
   sherlock(el);
   const uInput = $('#u', el);
   if (uInput) { uInput.value = v; setTimeout(() => $('#go', el)?.click(), 60) }
  }
 }),

 pass: el => mk(el, {
  t: 'Password Leak Check', d: 'Cuenta cuántas filtraciones públicas tienen una contraseña (k-anonymity, nunca se envía completa).', ph: 'contraseña',
  py: ['pass',
   '# Noxy Plont - Password Leak Check\n' +
   'import sys, hashlib, requests\n\n' +
   'p = sys.argv[1]\n' +
   'h = hashlib.sha1(p.encode()).hexdigest().upper()\n' +
   'r = requests.get(f"https://api.pwnedpasswords.com/range/{h[:5]}")\n' +
   'n = 0\n' +
   'for line in r.text.splitlines():\n' +
   '    if line.split(":")[0] == h[5:]: n = int(line.split(":")[1])\n' +
   'print("filtraciones:", n)\n',
   'python noxyplont_pass.py miClave123'],
  run: async (v, o, el) => {
   const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(v));
   const h = [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
   const txt = await GT('https://api.pwnedpasswords.com/range/' + h.slice(0, 5));
   const line = txt.split('\n').find(l => l.startsWith(h.slice(5)));
   const n = line ? parseInt(line.split(':')[1]) : 0;
   o.innerHTML = '<div class=iss style="border-left:3px solid ' + (n ? '#ff3b46' : '#4ade80') + '"><b>' +
    (n ? (n + ' filtraciones') : 'sin filtraciones conocidas') + '</b><div class=sub style="margin:0">' +
    (n ? 'Cambia esa contraseña.' : 'Buena elección.') + '</div></div>';
   SHOT(el, 1);
  }
 }),

 hash: el => mk(el, {
  t: 'Hash ID', d: 'Identifica el tipo de hash probable por su longitud.', ph: '5f4dcc3b5aa765d61d8327deb882cf99',
  py: ['hash',
   '# Noxy Plont - Hash ID\n' +
   'import sys\n\n' +
   'h = sys.argv[1].strip()\n' +
   'k = {32:"MD5",40:"SHA-1",64:"SHA-256",128:"SHA-512"}.get(len(h),"desconocido")\n' +
   'print("tipo probable:", k)\n',
   'python noxyplont_hash.py 5f4dcc3b5aa765d61d8327deb882cf99'],
  run: async (v, o, el) => {
   const h = v.trim();
   const t = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 128: 'SHA-512' }[h.length] || 'desconocido';
   o.innerHTML = KV([['Hash', h], ['Tipo probable', t]]);
   SHOT(el, 1);
  }
 }),

 web: el => mk(el, {
  t: 'Web Fingerprint', d: 'robots.txt, security.txt y señales de tecnología del sitio.', ph: 'ejemplo.com',
  py: ['web',
   '# Noxy Plont - Web Fingerprint\n' +
   'import sys, requests\n\n' +
   'h = {"User-Agent": "Mozilla/5.0"}\n' +
   'u = sys.argv[1]\n' +
   'if not u.startswith("http"): u = "https://" + u\n' +
   'r = requests.get(u, headers=h, timeout=15, allow_redirects=True)\n' +
   'print(r.status_code)\n' +
   'for k, v in r.headers.items(): print(k + ":", v)\n',
   'python noxyplont_web.py ejemplo.com'],
  run: async (v, o, el) => {
   const u = /^https?:\/\//.test(v) ? v : 'https://' + v;
   const [rob, sec] = await Promise.all([
    GT(u.replace(/\/$/, '') + '/robots.txt').catch(() => ''),
    GT(u.replace(/\/$/, '') + '/.well-known/security.txt').catch(() => '')
   ]);
   const tech = [['WordPress', /wp-content|wp-json/i], ['Shopify', /cdn\.shopify/i], ['React', /__NEXT_DATA__|react/i], ['Cloudflare', /cloudflare/i], ['nginx', /nginx/i], ['Apache', /apache/i]];
   let html = KV([['URL', u], ['robots.txt', rob ? (rob.length + ' bytes') : '—'], ['security.txt', sec ? 'existe' : '—']]);
   html += '<div class=sec2>Señales</div><div class=tags>' + (tech.filter(([, r]) => r.test(rob + sec)).map(([n]) => '<span>' + n + '</span>').join('') || '—') + '</div>';
   html += '<div class=acts style="margin-top:12px"><a class=gb style="text-decoration:none" target=_blank rel=noopener href="' + esc(u) + '">Abrir sitio</a></div>';
   o.innerHTML = html;
   SHOT(el, 2);
  }
 }),

 meta: el => mk(el, {
  t: 'EXIF / Metadata', d: 'Sube una foto y lee cámara, fecha y GPS si lo trae.', ph: '',
  run: async (v, o, el) => {
   o.innerHTML = '<input type=file id=f accept="image/*"><div id=mo style="margin-top:12px"></div>';
   $('#f', o).onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    const mo = $('#mo', o);
    mo.innerHTML = '<p class=sub>Leyendo…</p>';
    const buf = new Uint8Array(await f.arrayBuffer());
    const txt = new TextDecoder('latin1').decode(buf.slice(0, 200000));
    const tags = [...txt.matchAll(/(Make|Model|DateTimeOriginal|Software|LensModel)\x00+([\x20-\x7E]{2,40})/g)].map(m => [m[1], m[2]]);
    const gps = /GPS/.test(txt);
    mo.innerHTML = KV([['Archivo', f.name], ['Tamaño', (f.size / 1024).toFixed(0) + ' KB'], ['GPS', gps ? 'presente (posible)' : 'no detectado'], ...tags]) +
     '<p class=sub style="margin-top:10px">Sin EXIF si la app borró los metadatos al subirla.</p>';
    SHOT(el, 1);
   };
  }
 }),

 dork: el => mk(el, {
  t: 'Dork Builder', d: 'Genera dorks de Google, GitHub y Shodan para un objetivo.', ph: 'dominio o usuario',
  run: async (v, o, el) => {
   const t = encodeURIComponent(v);
   const items = [
    ['Archivos expuestos', 'https://www.google.com/search?q=site:' + t + '+(ext:pdf OR ext:xls OR ext:env OR ext:sql)'],
    ['Paneles', 'https://www.google.com/search?q=site:' + t + '+inurl:(admin OR login OR panel)'],
    ['Correos', 'https://www.google.com/search?q=%22@' + t + '%22'],
    ['Shodan', 'https://www.shodan.io/search?query=' + t],
    ['crt.sh', 'https://crt.sh/?q=%25.' + t]
   ];
   o.innerHTML = items.map(([n, u]) =>
    '<a class=iss style="display:block;text-decoration:none;color:inherit" target=_blank rel=noopener href="' + u + '"><b>' + n + '</b><div class=sub style="margin:0;word-break:break-all">' + esc(u) + '</div></a>'
   ).join('');
   SHOT(el, 1);
  }
 })
};

/* ---------- puerta de acceso ---------- */
const PW = 'xplont';
const locked = () => !GET('plont_ok', 0);
function gate(el, after) {
 el.innerHTML =
  '<div class=pgate><div class=ic3>' + I('shield', 26) + '</div><h2>Plont</h2>' +
  '<p>Herramientas de reconocimiento OSINT. Acceso restringido.</p>' +
  '<input id=pgpw type=password placeholder="contraseña" autocomplete=off><div style="height:10px"></div>' +
  '<button class=pb id=pgok style="width:100%">Entrar</button><div id=pgpe class=sub style="margin-top:10px"></div></div>';
 const t = $('#pgpw', el);
 t.focus();
 const tryIt = () => {
  if (t.value.trim().toLowerCase() === PW) {
   SET('plont_ok', 1);
   if (typeof snd === 'function') snd(600, 1000);
   after ? after() : hub(el);
  } else {
   $('#pgpe', el).textContent = 'Contraseña incorrecta.';
   t.value = '';
   t.focus();
  }
 };
 $('#pgok', el).onclick = tryIt;
 t.onkeydown = e => { if (e.key === 'Enter') tryIt() };
}

const HUB = [
 { id: 'ip', n: 'IP Dossier', ic: 'eye', d: 'Geo, ASN, puertos y CVEs.', py: 1 },
 { id: 'dom', n: 'Domain Recon', ic: 'search', d: 'RDAP, DNS y subdominios.', py: 1 },
 { id: 'sub', n: 'Subdomain Hunter', ic: 'users', d: 'Certificados + fuerza bruta DNS.', py: 1 },
 { id: 'mail', n: 'Email Harvester', ic: 'mail', d: 'Gravatar, MX y validación.', py: 1 },
 { id: 'user', n: 'Username Sweep', ic: 'user', d: 'Varias plataformas de una vez.' },
 { id: 'pass', n: 'Password Leak', ic: 'key', d: 'Filtraciones por k-anonymity.', py: 1 },
 { id: 'hash', n: 'Hash ID', ic: 'braces', d: 'Identifica el tipo de hash.', py: 1 },
 { id: 'web', n: 'Web Fingerprint', ic: 'tool', d: 'robots, security.txt, tecnologías.', py: 1 },
 { id: 'meta', n: 'EXIF', ic: 'cam', d: 'Cámara, fecha y GPS de una foto.' },
 { id: 'dork', n: 'Dork Builder', ic: 'search', d: 'Dorks de Google, GitHub y Shodan.' }
];

function hub(el) {
 el.innerHTML =
  '<div class=pad><div class=plh><h3 style="margin:0">Plont</h3><button class="gb plk" id=plk>Bloquear</button></div>' +
  '<p>' + HUB.length + ' herramientas. Las que llevan sello <b>py</b> se descargan como .zip con script y README.</p>' +
  '<div class=plgrid id=plg></div></div>';
 $('#plk', el).onclick = () => { SET('plont_ok', 0); gate(el) };
 $('#plg', el).innerHTML = HUB.map(x =>
  '<button class=plc data-id="' + x.id + '">' + (x.py ? '<span class=tagp>py</span>' : '') +
  '<span class=ic2>' + I(x.ic, 18) + '</span><span><b>' + x.n + '</b><small>' + x.d + '</small></span></button>'
 ).join('');
 $$('.plc', el).forEach(b => b.onclick = () => openTool(b.dataset.id));
}

/* abre una herramienta pl_<id> reutilizando la navegación de "enter()" */
const openTool = id => {
 const firstNav = document.querySelector('#nv .nv');
 if (!firstNav) return;
 if (!document.querySelector('#tl')) { firstNav.dataset.k = 'home'; firstNav.click() }
 setTimeout(() => {
  const tile = document.querySelector('#tl .tile');
  if (tile) { tile.dataset.id = 'pl_' + id; tile.click(); return }
  const q = document.querySelector('#nv .nv');
  if (q) { q.dataset.k = 'plont'; q.click(); setTimeout(() => openTool(id), 300) }
 }, 140);
};

/* ---------- navegación: añade "Plont" al dock sin romper lo existente ---------- */
const NAV = [['home', 'Inicio', 'home'], ['per', 'Perfiles', 'user'], ['pro', 'Proyectos', 'braces'], ['com', 'Comunidad', 'users'], ['plont', 'Plont', 'shield']];
const navSig = () => [...document.querySelectorAll('#nv .nv')].map(b => b.dataset.k).join('|');
let navLock = 0, proxyNav = null;
function buildNav() {
 const nv = $('#nv');
 if (!nv) return;
 navLock = 1;
 const first = $('.nv', nv);
 if (first && first.onclick && !proxyNav) { proxyNav = document.createElement('button'); proxyNav.onclick = first.onclick }
 nv.innerHTML = NAV.map(([k, t, i]) => '<button class=nv data-k="' + k + '" data-l="' + t + '" aria-label="' + t + '">' + I(i, 20) + '<span>' + t + '</span></button>').join('');
 $$('.nv', nv).forEach(b => {
  const k = b.dataset.k;
  b.onclick = () => {
   if (proxyNav) { proxyNav.dataset.k = k; try { proxyNav.onclick() } catch (e) {} }
   const ttl = $('#ttl');
   if (ttl) ttl.textContent = (k === 'plont') ? 'Plont' : b.dataset.l;
   if (k === 'plont') setTimeout(() => { const v = $('#view'); if (v) (locked() ? gate(v) : hub(v)) }, 160);
  };
 });
 requestAnimationFrame(() => { navLock = 0 });
}
new MutationObserver(() => {
 if (navLock) return;
 if (navSig() === NAV.map(n => n[0]).join('|')) return;
 buildNav();
}).observe(document.body, { childList: true, subtree: true });

/* tarjeta de comunidad en la vista "com" */
const communityCard = () =>
 '<div id=plontcom class=iss style="display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:14px">' +
 '<div><b>Plont Community</b><div class=sub style="margin:0">English server · scripts, drops and support</div></div>' +
 '<a class=pb style="text-decoration:none;flex:none" href="https://discord.gg/9CTngA9qCK" target=_blank rel=noopener>Join</a></div>';
setInterval(() => {
 const v = $('#view');
 if (!v) return;
 if (document.querySelector('.nv.on')?.dataset.k !== 'com') return;
 if (!$('#plontcom')) v.insertAdjacentHTML('beforeend', communityCard());
}, 800);

/* registra cada herramienta como app "pl_<id>" */
Object.entries(T).forEach(([id, fn]) => {
 const meta = HUB.find(h => h.id == id) || {};
 APPS.push({
  id: 'pl_' + id, name: meta.n || id, ic: meta.ic || 'shield', desc: meta.d || '', cat: 'Plont',
  r: el => { if (locked()) return gate(el, () => fn(el)); fn(el) },
  tech: ['OSINT']
 });
});

/* ================= LUAU STUDIO (motor Lua real vía fengari) ================= */
function luau(el) {
 const PRESETS = [
  { n: 'Ventana con botones',
   c: 'local gui = Instance.new("ScreenGui")\n' +
    'gui.Parent = game:GetService("CoreGui")\n' +
    'local w = Instance.new("Frame")\n' +
    'w.Size = UDim2.new(0, 300, 0, 210)\n' +
    'w.Position = UDim2.new(0.5, -150, 0.5, -105)\n' +
    'w.BackgroundColor3 = Color3.fromRGB(18, 16, 20)\n' +
    'w.BorderSizePixel = 0\n' +
    'w.Parent = gui\n' +
    'local c = Instance.new("UICorner")\n' +
    'c.CornerRadius = UDim.new(0, 12)\n' +
    'c.Parent = w\n' +
    'local b = Instance.new("TextButton")\n' +
    'b.Size = UDim2.new(1, -32, 0, 38)\n' +
    'b.Position = UDim2.new(0, 16, 1, -54)\n' +
    'b.BackgroundColor3 = Color3.fromRGB(200, 22, 29)\n' +
    'b.BorderSizePixel = 0\n' +
    'b.Text = "Ejecutar"\n' +
    'b.TextColor3 = Color3.fromRGB(255, 255, 255)\n' +
    'b.TextSize = 14\n' +
    'b.Parent = w\n' +
    'local n = 0\n' +
    'b.MouseButton1Click:Connect(function()\n' +
    '  n = n + 1\n' +
    '  b.Text = "clics: " .. n\n' +
    '  print("pulsado " .. n)\n' +
    'end)\n' +
    'print("GUI cargada")' },
  { n: 'Bucle con task.wait',
   c: 'local gui = Instance.new("ScreenGui")\n' +
    'gui.Parent = game:GetService("CoreGui")\n' +
    'local l = Instance.new("TextLabel")\n' +
    'l.Size = UDim2.new(0, 200, 0, 40)\n' +
    'l.Position = UDim2.new(0, 20, 0, 20)\n' +
    'l.BackgroundColor3 = Color3.fromRGB(0, 0, 0)\n' +
    'l.BackgroundTransparency = 0.3\n' +
    'l.Text = "tick 0"\n' +
    'l.TextColor3 = Color3.fromRGB(255, 255, 255)\n' +
    'l.Parent = gui\n' +
    'local i = 0\n' +
    'while true do\n' +
    '  i = i + 1\n' +
    '  l.Text = "tick " .. i\n' +
    '  task.wait(1)\n' +
    'end' },
  { n: 'Stubs de executor',
   c: 'print(identifyexecutor())\n' +
    'print(typeof(getgenv()), typeof(hookmetamethod), typeof(firesignal))' }
 ];

 el.innerHTML =
  '<div style="display:flex;flex-direction:column;height:100%">' +
  '<div style="display:flex;gap:8px;padding:10px;border-bottom:1px solid var(--bd);flex-wrap:wrap">' +
  '<select id=ps style="width:auto;margin:0;padding:8px"><option value="">Ejemplos…</option>' +
  PRESETS.map((p, i) => '<option value=' + i + '>' + esc(p.n) + '</option>').join('') +
  '</select><button class=pb id=run>Ejecutar</button><button class=gb id=stop>Detener</button><button class=gb id=clr>Limpiar</button>' +
  '<span id=st style="margin-left:auto;color:var(--mut);font-size:12px;align-self:center">listo</span></div>' +
  '<div style="flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px">' +
  '<textarea id=cd spellcheck=false style="min-height:0;font:12.5px/1.6 var(--m);white-space:pre;resize:none;padding:12px;border-radius:12px;background:#0b0a0c"></textarea>' +
  '<div style="display:flex;flex-direction:column;gap:8px;min-height:0">' +
  '<div class=lsview style="flex:1;min-height:0;position:relative;overflow:hidden;border:1px solid var(--bd);border-radius:12px;background:linear-gradient(160deg,#1b2330,#0e1218)">' +
  '<div id=vp style="position:absolute;inset:0;overflow:hidden"></div><div class=lsempty id=em>sin GUI todavía</div></div>' +
  '<div id=cn style="height:130px;overflow:auto;background:#000;border:1px solid var(--bd);border-radius:12px;padding:8px;font:12px/1.5 var(--m);color:#c9c2c4"></div>' +
  '</div></div></div>';

 const cn = $('#cn', el), vp = $('#vp', el), em = $('#em', el), cd = $('#cd', el), st = $('#st', el);
 let running = 0, timer = null, co = null, coRef = null, curL = null, ins = 0, lua = null, lauxlib = null;

 const log = (t, c) => {
  const d = document.createElement('div');
  d.textContent = t;
  d.style.color = c == 'e' ? '#ff6b74' : c == 'w' ? '#ffc35b' : c == 'm' ? '#8f7bff' : '#c9c2c4';
  cn.append(d);
  cn.scrollTop = cn.scrollHeight;
  while (cn.childElementCount > 200) cn.firstElementChild.remove();
 };
 const toStr = v => v == null ? 'nil' : (typeof v === 'object' ? (v.__inst ? (v.cn || 'Instance') : (v.__rbx || 'table')) : String(v));

 const CHAIN = {
  Instance: [], GuiObject: ['Instance'], ScreenGui: ['Instance'], Frame: ['GuiObject'],
  TextLabel: ['GuiObject'], TextButton: ['GuiObject'], TextBox: ['GuiObject'], Folder: ['Instance'],
  UIComponent: ['Instance'], UICorner: ['UIComponent'], UIStroke: ['UIComponent'], UIPadding: ['UIComponent'], UIListLayout: ['UIComponent']
 };
 const PROPS = {
  Instance: ['Name', 'Parent'],
  GuiObject: ['Visible', 'Size', 'Position', 'BackgroundColor3', 'BackgroundTransparency', 'BorderSizePixel', 'ZIndex', 'Text', 'TextColor3', 'TextSize', 'TextXAlignment', 'TextYAlignment', 'PlaceholderText'],
  UICorner: ['CornerRadius'], UIStroke: ['Color', 'Thickness', 'Transparency'], UIListLayout: ['Padding', 'FillDirection']
 };
 const DEFV = {
  Size: () => ({ __rbx: 'U2', xs: 0, xo: 100, ys: 0, yo: 100 }),
  Position: () => ({ __rbx: 'U2', xs: 0, xo: 0, ys: 0, yo: 0 }),
  BackgroundColor3: () => ({ __rbx: 'C3', r: 1, g: 1, b: 1 }),
  BackgroundTransparency: 0, BorderSizePixel: 1, Visible: true, ZIndex: 1, Text: '',
  TextColor3: () => ({ __rbx: 'C3', r: 0, g: 0, b: 0 }), TextSize: 14,
  TextXAlignment: 'Center', TextYAlignment: 'Center',
  Color: () => ({ __rbx: 'C3', r: 0, g: 0, b: 0 }), Thickness: 1, Transparency: 0,
  CornerRadius: () => ({ __rbx: 'UD', s: 0, o: 0 }), Padding: () => ({ __rbx: 'UD', s: 0, o: 0 }), FillDirection: 'Vertical'
 };
 const makeSignal = () => ({
  l: [],
  Connect(f) { if (typeof f === 'function') this.l.push(f); return { Disconnect() {} } },
  Fire(...a) { this.l.slice().forEach(f => { try { f(...a) } catch (e) {} }) }
 });
 const sig = o => o.__s || (o.__s = {});
 const sigNamed = (o, name) => { const s = sig(o); return s[name] || (s[name] = makeSignal()) };
 const setParent = (o, p) => { if (o.parent) o.parent.ch = o.parent.ch.filter(x => x !== o); o.parent = p || null; if (p && p.ch && !p.ch.includes(o)) p.ch.push(o); invalidate() };

 function newInstance(cn0) {
  if (!CHAIN[cn0]) cn0 = 'Frame';
  const o = { __inst: 1, cn: cn0, ch: [], _p: {}, parent: null, dead: 0 };
  const props = new Set();
  (CHAIN[cn0] || []).forEach(k => (PROPS[k] || []).forEach(p => props.add(p)));
  props.forEach(p => Object.defineProperty(o, p, {
   enumerable: true,
   get() { if (p in this._p) return this._p[p]; const d = DEFV[p]; return typeof d === 'function' ? d() : d },
   set(v) { this._p[p] = v; p === 'Parent' ? setParent(this, v) : invalidate() }
  }));
  Object.defineProperty(o, 'Name', { enumerable: true, get() { return this._p.Name || cn0 }, set(v) { this._p.Name = v } });
  o.Destroy = () => { setParent(o, null); o.dead = 1; invalidate() };
  o.GetChildren = () => o.ch.slice();
  o.FindFirstChild = n => o.ch.find(x => x.Name === n) || null;
  o.WaitForChild = n => o.FindFirstChild(n);
  o.IsA = x => x === cn0 || (CHAIN[cn0] || []).includes(x);
  ['MouseButton1Click', 'MouseButton1Down', 'Activated', 'InputBegan'].forEach(e =>
   Object.defineProperty(o, e, { get() { return sigNamed(o, e) } })
  );
  return o;
 }

 const SV = {};
 const service = n => SV[n] || (SV[n] = Object.assign(newInstance('Folder'), { Name: n }));
 const game = { ClassName: 'DataModel', PlaceId: 1, GetService: service, Players: { LocalPlayer: { Name: 'NoxyPlayer', PlayerGui: newInstance('Folder') } } };

 const VISIBLE = new Set(['ScreenGui', 'Frame', 'TextLabel', 'TextButton', 'TextBox']);
 const col3 = (r, g, b) => ({ __rbx: 'C3', r: r || 0, g: g || 0, b: b || 0 });
 const toCss = c => (c && c.__rbx) ? 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' : 'rgba(255,255,255,';

 let paintRaf = null;
 function invalidate() { if (paintRaf) return; paintRaf = requestAnimationFrame(() => { paintRaf = null; paint() }) }
 function roots() {
  const out = [...service('CoreGui').ch];
  const pg = game.Players.LocalPlayer.PlayerGui;
  if (pg) out.push(...pg.ch);
  return out.filter(x => x.cn === 'ScreenGui' && !x.dead);
 }
 function paint() { vp.innerHTML = ''; roots().forEach(r => { const d = buildNode(r); if (d) vp.append(d) }); em.style.display = vp.childElementCount ? 'none' : 'grid' }
 function buildNode(i) {
  if (!VISIBLE.has(i.cn) || i._p.Visible === false) return null;
  if (i.cn === 'ScreenGui') {
   const d = document.createElement('div');
   d.style.cssText = 'position:absolute;inset:0';
   i.ch.forEach(c => { const x = buildNode(c); if (x) d.append(x) });
   return d;
  }
  const isBtn = i.cn === 'TextButton';
  const d = document.createElement(isBtn ? 'button' : 'div');
  d.style.cssText = 'position:absolute;box-sizing:border-box;display:flex;overflow:hidden;font-family:Inter,system-ui,sans-serif';
  const p = i.Position, s = i.Size;
  d.style.left = 'calc(' + (p.xs * 100) + '% + ' + p.xo + 'px)';
  d.style.top = 'calc(' + (p.ys * 100) + '% + ' + p.yo + 'px)';
  d.style.width = 'calc(' + (s.xs * 100) + '% + ' + s.xo + 'px)';
  d.style.height = 'calc(' + (s.ys * 100) + '% + ' + s.yo + 'px)';
  d.style.background = toCss(i.BackgroundColor3) + (1 - (i.BackgroundTransparency || 0)) + ')';
  if (i.BorderSizePixel > 0) d.style.border = '1px solid #ffffff22';
  if (i._p.Text !== undefined) {
   d.style.color = toCss(i.TextColor3) + '1)';
   d.style.fontSize = (i.TextSize || 14) + 'px';
   d.style.justifyContent = ({ Left: 'flex-start', Center: 'center', Right: 'flex-end' })[i.TextXAlignment] || 'center';
   d.style.alignItems = 'center';
   d.innerHTML = esc(i._p.Text || '');
  }
  i.ch.forEach(c => {
   if (c.cn === 'UICorner') d.style.borderRadius = (c.CornerRadius.o || 0) + 'px';
   else if (c.cn === 'UIStroke') d.style.border = (c.Thickness || 1) + 'px solid ' + toCss(c.Color) + (1 - (c.Transparency || 0)) + ')';
  });
  if (isBtn) { d.style.cursor = 'pointer'; d.onclick = () => { sigNamed(i, 'MouseButton1Click').Fire(); log('clic ' + (i._p.Name || 'boton'), 'i') } }
  i.ch.forEach(c => { if (!['UICorner', 'UIStroke', 'UIListLayout', 'UIPadding'].includes(c.cn)) { const x = buildNode(c); if (x) d.append(x) } });
  return d;
 }

 const translate = src => {
  let x = src;
  x = x.replace(/\blocal\s+([A-Za-z_]\w*)\s*:\s*[A-Za-z_][\w.]*/g, 'local $1');
  x = x.replace(/([A-Za-z_][\w.\[\]]*)\s*(\.\.|\+|-|\*|\/)=/g, '$1 = $1 $2 ');
  return x;
 };

 function countHook(L) { ins += 20000; if (ins > 2e6) { lua.lua_pushstring(L, lua.to_luastring('bucle sin task.wait(): cortado')); lua.lua_error(L) } }
 function finish() { running = 0; st.textContent = 'terminado' }
 function stop() { clearTimeout(timer); timer = null; co = null; coRef = null; if (running) log('— detenido —', 'm'); finish() }

 function resume() {
  if (!co || !running) return;
  if (!el.isConnected) return;
  const L = co;
  curL = L;
  let base = 0;
  try { base = lua.lua_gettop(L); if (lua.lua_sethook && lua.LUA_MASKCOUNT) lua.lua_sethook(L, countHook, lua.LUA_MASKCOUNT, 20000); ins = 0 } catch (e) {}
  try {
   lua.lua_getglobal(L, lua.to_luastring('coroutine'));
   lua.lua_getfield(L, -1, lua.to_luastring('resume'));
   lua.lua_remove(L, -2);
   lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, coRef);
   const okc = lua.lua_pcall(L, 1, lua.LUA_MULTRET, 0);
   try { if (lua.lua_sethook) lua.lua_sethook(L, null, 0, 0) } catch (e) {}
   if (okc !== lua.LUA_OK) { log(lua.lua_tojsstring(L, -1), 'e'); lua.lua_settop(L, base); return finish() }
   if (!lua.lua_toboolean(L, base + 1)) { log(lua.lua_tojsstring(L, base + 2), 'e'); lua.lua_settop(L, base); return finish() }
   lua.lua_getglobal(L, lua.to_luastring('coroutine'));
   lua.lua_getfield(L, -1, lua.to_luastring('status'));
   lua.lua_remove(L, -2);
   lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, coRef);
   let status = 'dead';
   if (lua.lua_pcall(L, 1, 1, 0) === lua.LUA_OK) { status = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1) }
   if (status === 'dead') { lua.lua_settop(L, base); return finish() }
   const w = lua.lua_tonumber(L, base + 2) || 0;
   lua.lua_settop(L, base);
   timer = setTimeout(resume, Math.min(Math.max(w * 1000, 0), 3000));
  } catch (e) { log('error interno: ' + e.message, 'e'); finish() }
 }

 const FENGARI_URLS = ['https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js', 'https://unpkg.com/fengari-web@0.1.4/dist/fengari-web.js'];
 const loadFengari = () => new Promise((ok, no) => {
  let i = 0;
  const next = () => {
   if (window.fengari) return ok();
   if (i >= FENGARI_URLS.length) return no(Error('no cargué el motor Lua (¿bloqueaste el CDN?)'));
   const s = document.createElement('script');
   s.src = FENGARI_URLS[i++];
   s.onload = () => ok();
   s.onerror = next;
   document.head.append(s);
  };
  next();
 });

 $('#run', el).onclick = async () => {
  if (running) stop();
  const code = cd.value;
  if (!code.trim()) return;
  log('▶ ejecutando', 'm');
  running = 1;
  st.textContent = 'ejecutando';
  try { await loadFengari() } catch (e) { log(e.message, 'e'); return finish() }

  lua = window.fengari.lua;
  lauxlib = window.fengari.lauxlib;
  const L = lauxlib.luaL_newstate();
  window.fengari.lualib.luaL_openlibs(L);
  const setGlobal = (n, v) => { window.fengari.interop.push(L, v); lua.lua_setglobal(L, lua.to_luastring(n)) };

  setGlobal('print', LL => { const a = []; for (let i = 1; i <= lua.lua_gettop(LL); i++) a.push(toStr(window.fengari.interop.tojs(LL, i))); log(a.join('\t')); return 0 });
  setGlobal('warn', LL => { const a = []; for (let i = 1; i <= lua.lua_gettop(LL); i++) a.push(toStr(window.fengari.interop.tojs(LL, i))); log(a.join('\t'), 'w'); return 0 });
  setGlobal('typeof', LL => { const v = window.fengari.interop.tojs(LL, 1); lua.lua_pushstring(LL, lua.to_luastring(v && v.__inst ? 'Instance' : (v && v.__rbx) || typeof v)); return 1 });
  const yieldWait = LL => { const n = lua.lua_tonumber(LL, 1) || 0; lua.lua_pushnumber(LL, n); return lua.lua_yield(LL, 1) };
  setGlobal('wait', yieldWait);
  setGlobal('task', { wait: yieldWait, spawn: LL => { lauxlib.lua_pushvalue(LL, 1); lua.lua_pcall(LL, 0, 0, 0); return 0 } });
  setGlobal('Instance', { new: newInstance });
  setGlobal('Color3', { new: col3, fromRGB: (r, g, b) => col3(r / 255, g / 255, b / 255) });
  setGlobal('UDim2', {
   new: (a, b, c, d) => ({ __rbx: 'U2', xs: a, xo: b, ys: c, yo: d }),
   fromOffset: (x, y) => ({ __rbx: 'U2', xs: 0, xo: x, ys: 0, yo: y }),
   fromScale: (x, y) => ({ __rbx: 'U2', xs: x, xo: 0, ys: y, yo: 0 })
  });
  setGlobal('UDim', { new: (s, o) => ({ __rbx: 'UD', s, o }) });
  setGlobal('Enum', new Proxy({}, { get: (t, k) => new Proxy({}, { get: (_, n) => ({ Name: n }) }) }));
  setGlobal('game', game);
  setGlobal('identifyexecutor', () => 'Delta');
  setGlobal('getgenv', () => ({}));
  setGlobal('firesignal', (s, ...a) => { s && s.Fire && s.Fire(...a) });
  setGlobal('hookmetamethod', (a, b, c) => c);
  setGlobal('getgc', () => ({}));

  const src = translate(code);
  if (lauxlib.luaL_loadstring(L, lua.to_luastring(src)) !== lua.LUA_OK) { log(lua.lua_tojsstring(L, -1), 'e'); return finish() }
  lua.lua_getglobal(L, lua.to_luastring('coroutine'));
  lua.lua_getfield(L, -1, lua.to_luastring('create'));
  lua.lua_remove(L, -2);
  lauxlib.luaL_loadstring(L, lua.to_luastring(src));
  if (lua.lua_pcall(L, 1, 1, 0) !== lua.LUA_OK) { log(lua.lua_tojsstring(L, -1), 'e'); return finish() }
  co = lua.lua_tothread(L, -1);
  coRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
  resume();
 };

 $('#stop', el).onclick = stop;
 $('#clr', el).onclick = () => { Object.keys(SV).forEach(k => delete SV[k]); vp.innerHTML = ''; em.style.display = 'grid'; log('GUI limpiada', 'm') };
 $('#ps', el).onchange = e => { const p = PRESETS[e.target.value]; if (p) { cd.value = p.c; e.target.value = '' } };
 cd.value = PRESETS[0].c;
 log('Lua 5.3 real con API de Roblox simulada.', 'm');
}

const luaApp = APPS.find(a => a.id == 'luau');
if (luaApp) luaApp.r = luau;

/* botón "Plont" también en la fila de categorías de la home */
const addPlontCatButton = () => {
 const c = $('.cats');
 if (!c || $('.ct[data-p]')) return;
 const b = document.createElement('button');
 b.className = 'ct';
 b.dataset.p = 1;
 b.textContent = 'Plont';
 b.onclick = () => {
  const v = $('#view');
  if (!v) return;
  (locked() ? gate(v) : hub(v));
  $$('.ct').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  const ttl = $('#ttl');
  if (ttl) ttl.textContent = 'Plont';
 };
 c.append(b);
};
setInterval(addPlontCatButton, 1500);

})();
