// Chart Scanner - public hosted version (single file)
// Run: npm i express && GEMINI_API_KEY=AIza... node server.js
// Needs Node 18+. Optional env: PORT, GEMINI_MODEL, FREE_PER_DAY
const express = require('express');
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '6mb' }));

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const FREE_PER_DAY = +process.env.FREE_PER_DAY || 3;
const PORT = process.env.PORT || 3000;
if (!KEY) { console.error('Set GEMINI_API_KEY'); process.exit(1); }

// ---- usage limits (in-memory; swap for Redis/DB in production) ----
const usage = new Map(); // key -> {day, n}
const today = () => new Date().toISOString().slice(0, 10);
function check(id) {
  const u = usage.get(id);
  if (!u || u.day !== today()) { usage.set(id, { day: today(), n: 0 }); return 0; }
  return u.n;
}
const bump = id => { usage.get(id).n++; };
// TODO paywall: if user has paid credits (MTN/Airtel via Flutterwave or Pesapal webhook), skip the free limit.

const PROMPT = tf => `You are a disciplined technical analyst. Analyze the attached trading chart screenshot.
Hints: timeframe=${tf.timeframe}, style=${tf.style}.
Read only what is visible. Never invent price levels not readable on the axis; if unreadable, use null.
Return ONLY JSON, no markdown:
{"instrument":string|null,"timeframe":string|null,"direction":"BUY"|"SELL"|"WAIT","trend":"bullish"|"bearish"|"ranging",
"structure":string,"support":[numbers],"resistance":[numbers],"entry":number|null,"stop_loss":number|null,
"take_profit":number|null,"rr":number|null,"confidence":0-100,"risks":[max 3 strings],"reasoning":string}
If the setup is unclear or low probability, direction must be WAIT.`;

app.post('/api/analyze', async (req, res) => {
  try {
    const id = req.ip;
    if (check(id) >= FREE_PER_DAY)
      return res.status(429).json({ error: `Free limit reached (${FREE_PER_DAY}/day). Come back tomorrow or upgrade.` });
    const { image, timeframe = 'Auto', style = 'Scalp' } = req.body || {};
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(image || '');
    if (!m) return res.status(400).json({ error: 'Send a JPEG, PNG or WebP image.' });
    if (!['Auto', 'M1', 'M5', 'M15', 'H1', 'H4', 'D1'].includes(timeframe) ||
        !['Scalp', 'Intraday', 'Swing'].includes(style))
      return res.status(400).json({ error: 'Bad options.' });

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: m[1], data: m[2] } },
          { text: PROMPT({ timeframe, style }) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 }
      })
    });
    if (!r.ok) {
      const t = await r.text(); console.error('GEMINI ERROR', r.status, t.slice(0, 500));
      return res.status(502).json({ error: r.status === 429 ? 'Busy or daily limit reached. Try again later.' : 'AI service error. Try again.' });
    }
    const data = await r.json();
    const text = ((data.candidates || [])[0]?.content?.parts || []).map(c => c.text || '').join('').replace(/```json|```/g, '').trim();
    let out; try { out = JSON.parse(text); } catch { console.error('BAD JSON', text.slice(0, 300)); return res.status(502).json({ error: 'Could not read the chart. Try a clearer screenshot.' }); }
    bump(id);
    res.json({ result: out, left: FREE_PER_DAY - check(id) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error.' }); }
});

app.get('/', (_, res) => res.type('html').send(PAGE()));
app.listen(PORT, () => console.log('Chart Scanner on :' + PORT));

function PAGE() { return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Chart Scanner</title>
<style>
:root{--bg:#07100b;--card:#0e1a13;--line:#1f4d33;--g:#3ddc84;--t:#e8f5ec;--m:#8aa896;--r:#ff5c5c;--y:#f5c542}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.4 system-ui,sans-serif;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
.w{max-width:480px;margin:0 auto;padding:18px 16px 40px}h1{font-size:20px;margin:6px 0 2px}.s{color:var(--m);font-size:13px;margin:0 0 16px}
.drop{display:block;border:2px dashed var(--line);border-radius:16px;padding:26px 14px;text-align:center;background:var(--card);cursor:pointer}.drop b{color:var(--g)}.drop img{max-width:100%;max-height:260px;border-radius:10px}
.row{display:flex;gap:8px;margin:12px 0}select{flex:1;background:var(--card);color:var(--t);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit}
button{width:100%;background:var(--g);color:#04210f;font:700 15px system-ui;border:0;border-radius:12px;padding:14px;cursor:pointer}button:disabled{opacity:.4}
.scan{display:none;margin-top:18px}.bar{height:6px;background:#12281c;border-radius:6px;overflow:hidden;margin:10px 0 14px}.bar i{display:block;height:100%;width:0;background:var(--g);transition:width .4s}
.st{display:flex;align-items:center;gap:10px;border:1.5px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px;color:var(--m)}.st.on,.st.done{color:var(--t)}.st.on{border-color:var(--g)}
.st .d{margin-left:auto;width:10px;height:10px;border-radius:50%;background:#1f4d33}.st.on .d{background:var(--g);animation:p 1s infinite}.st.done .d{background:var(--g)}@keyframes p{50%{opacity:.25}}
.res{display:none;margin-top:18px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}.sig{font-size:28px;font-weight:800}.BUY{color:var(--g)}.SELL{color:var(--r)}.WAIT{color:var(--y)}
.g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.g div{background:#0a1510;border-radius:10px;padding:10px}.g small{display:block;color:var(--m);font-size:11px}.g b{font-size:16px}
ul{padding-left:18px;margin:6px 0;color:var(--m);font-size:13px}.err{color:var(--r);margin-top:12px;display:none}.dis{color:var(--m);font-size:11px;margin-top:14px}
</style></head><body><div class="w">
<h1>Chart Scanner</h1><p class="s">Upload a chart screenshot. AI reads structure, levels and risk.</p>
<label class="drop"><input id="f" type="file" accept="image/*" hidden><div id="ph"><b>Tap to upload</b> or paste a screenshot</div></label>
<div class="row"><select id="tf"><option value="Auto">Auto-detect TF</option><option>M1</option><option>M5</option><option>M15</option><option>H1</option><option>H4</option><option>D1</option></select>
<select id="st"><option>Scalp</option><option>Intraday</option><option>Swing</option></select></div>
<button id="go" disabled>Analyze chart</button><div class="err" id="err"></div>
<div class="scan" id="scan"><div style="font-weight:700">Analyzing Market Structure<span id="pc" style="float:right;color:var(--m)">0%</span></div>
<div class="bar"><i id="bar"></i></div><div class="st" id="s1">Identifying market direction<span class="d"></span></div>
<div class="st" id="s2">Mapping key levels<span class="d"></span></div><div class="st" id="s3">Risk evaluation<span class="d"></span></div></div>
<div class="res" id="res"></div>
<p class="dis" id="left"></p>
<p class="dis">Educational analysis only. Not financial advice. Trading carries risk of loss.</p></div>
<script>
const $=i=>document.getElementById(i);let img=null;
const esc=s=>String(s==null?'—':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function load(file){if(!file||!file.type.startsWith('image/'))return;const u=URL.createObjectURL(file),im=new Image();
im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;
c.getContext('2d').drawImage(im,0,0,c.width,c.height);img=c.toDataURL('image/jpeg',.85);$('ph').innerHTML='<img src="'+u+'">';$('go').disabled=false};im.src=u}
$('f').onchange=e=>load(e.target.files[0]);
document.addEventListener('paste',e=>{for(const it of e.clipboardData.items)if(it.type.startsWith('image/'))load(it.getAsFile())});
const prog=n=>{$('bar').style.width=n+'%';$('pc').textContent=Math.round(n)+'%'};
const step=i=>['s1','s2','s3'].forEach((id,k)=>$(id).className='st'+(k<i?' done':k===i?' on':''));
$('go').onclick=async()=>{$('err').style.display='none';$('res').style.display='none';$('scan').style.display='block';$('go').disabled=true;
let p=0;step(0);prog(0);const t=setInterval(()=>{p=Math.min(p+(95-p)*.04,95);prog(p);step(p<30?0:p<60?1:2)},300);
try{const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image:img,timeframe:$('tf').value,style:$('st').value})});
const j=await r.json();clearInterval(t);if(!r.ok)throw new Error(j.error||'Failed');step(3);prog(100);show(j.result);$('left').textContent=j.left+' free scans left today'}
catch(e){clearInterval(t);$('scan').style.display='none';$('err').style.display='block';$('err').textContent=e.message}
$('go').disabled=false};
function show(r){const d=['BUY','SELL'].includes(r.direction)?r.direction:'WAIT',lv=a=>Array.isArray(a)&&a.length?a.join(', '):'—';
$('res').innerHTML='<div style="color:var(--m);font-size:12px">'+esc(r.instrument)+' · '+esc(r.timeframe)+' · '+esc(r.trend)+'</div><div class="sig '+d+'">'+(d=='WAIT'?'NO CLEAR SETUP':d)+'</div><div class="g">'+
'<div><small>Entry</small><b>'+esc(r.entry)+'</b></div><div><small>Confidence</small><b>'+esc(r.confidence)+'%</b></div><div><small>Stop loss</small><b>'+esc(r.stop_loss)+'</b></div><div><small>Take profit</small><b>'+esc(r.take_profit)+'</b></div><div><small>Support</small><b>'+esc(lv(r.support))+'</b></div><div><small>Resistance</small><b>'+esc(lv(r.resistance))+'</b></div><div><small>R:R</small><b>'+esc(r.rr)+'</b></div></div>'+
'<div style="font-size:13px">'+esc(r.structure)+'</div><div style="font-size:13px;margin-top:8px;color:var(--m)">'+esc(r.reasoning)+'</div><b style="font-size:13px;display:block;margin-top:10px">Risks</b><ul>'+(r.risks||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
$('res').style.display='block';$('res').scrollIntoView({behavior:'smooth'})}
</script></body></html>`; }
