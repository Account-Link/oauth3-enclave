export const APPROVE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Approve Request</title>
<style>
*{box-sizing:border-box}
body{background:#1e1e2e;color:#cdd6f4;font-family:'JetBrains Mono',monospace;margin:0;padding:20px;max-width:720px;margin:0 auto}
.card{background:#181825;border-radius:8px;padding:16px;margin-bottom:16px}
h1{margin:0 0 16px;font-size:20px}
h2{margin:16px 0 8px;font-size:15px;color:#89b4fa}
label{display:block;color:#a6adc8;font-size:12px;margin:8px 0 4px;text-transform:uppercase;letter-spacing:0.5px}
input,textarea{width:100%;padding:8px;background:#313244;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;font-family:inherit;box-sizing:border-box}
textarea{resize:vertical;min-height:60px}
pre{background:#313244;padding:12px;border-radius:4px;overflow-x:auto;font-size:12px;white-space:pre-wrap;line-height:1.5;margin:4px 0}
button{padding:10px 24px;border:none;border-radius:6px;font-family:inherit;font-size:14px;cursor:pointer;margin-right:8px}
.approve{background:#a6e3a1;color:#1e1e2e} .deny{background:#f38ba8;color:#1e1e2e}
.badge{display:inline-block;background:#45475a;padding:2px 8px;border-radius:4px;font-size:12px;margin:2px}
.stored-note{color:#a6adc8;font-size:11px;font-style:italic}
.secret-row{margin:6px 0;display:flex;align-items:center;gap:8px}
.secret-row input{flex:1}
.overwrite-btn{padding:4px 10px;font-size:11px;background:#45475a;color:#cdd6f4;border:none;border-radius:4px;cursor:pointer;white-space:nowrap}
#status{padding:12px;border-radius:4px;margin-top:12px;display:none}
.ok{background:#a6e3a1;color:#1e1e2e} .err{background:#f38ba8;color:#1e1e2e}
.bearer-box{background:#313244;border:1px solid #a6e3a1;border-radius:4px;padding:12px;margin-top:12px;word-break:break-all;font-size:11px;user-select:all;cursor:pointer}
.bearer-label{color:#a6e3a1;font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px}
.kw{color:#cba6f7}.str{color:#a6e3a1}.cm{color:#6c7086}.fn{color:#89b4fa}.num{color:#fab387}
</style></head><body>
<h1>Approve Request</h1>
<div id="loading">Loading...</div>
<div id="content" style="display:none"></div>
<div id="status"></div>
<script>
var params = new URLSearchParams(location.search);
var ID = location.pathname.split('/approve/')[1];
var TOKEN = params.get('token') || '';
var OWNER_TOKEN = params.get('owner_token') || localStorage.getItem('oauth3_jwt') || '';
var $ = function(s){return document.getElementById(s)};

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function highlight(code){
  return esc(code)
    .replace(/\\/\\/(.*)/g,'<span class="cm">//$1</span>')
    .replace(/\\b(const|let|var|async|await|function|return|if|else|for|of|in|new|import|from|export|throw|try|catch|typeof|instanceof)\\b/g,'<span class="kw">$1</span>')
    .replace(/\\b(console\\.log|fetch|JSON\\.stringify|JSON\\.parse)\\b/g,'<span class="fn">$1</span>')
    .replace(/\\b(\\d+)\\b/g,'<span class="num">$1</span>');
}

async function load(){
  try{
    var url = '/approve/'+ID+'?token='+TOKEN;
    if(OWNER_TOKEN) url += '&owner_token='+OWNER_TOKEN;
    var r = await fetch(url, {headers:{'Accept':'application/json'}});
    var d = await r.json();
    if(d.error){$('loading').textContent='Error: '+d.error;return}
    var h='<div class="card">';
    h+='<label>Status</label><p>'+esc(d.status)+'</p>';

    if(d.scope_request){
      var s=d.scope_request;
      if(s.description) h+='<label>Description</label><p>'+esc(s.description)+'</p>';
      if(s.permit_id) h+='<label>Permit ID</label><p style="font-size:11px">'+esc(s.permit_id)+'</p>';
      if(s.networks&&s.networks.length) h+='<label>Networks</label><p>'+s.networks.map(function(n){return '<span class="badge">'+esc(n)+'</span>'}).join(' ')+'</p>';

      if(s.capabilities&&s.capabilities.length){
        h+='<h2>Capabilities</h2>';
        s.capabilities.forEach(function(c){
          h+='<div style="margin:8px 0"><label>'+esc(c.name)+' <span class="badge">'+esc(c.type)+'</span></label>';
          if(c.signature) h+='<p style="font-size:12px;color:#89b4fa">'+esc(c.signature)+'</p>';
          if(c.code) h+='<pre>'+highlight(c.code)+'</pre>';
        });
      }

      if(s.secrets&&s.secrets.length){
        h+='<h2>Secrets</h2>';
        s.secrets.forEach(function(n){
          var missing = s.missing_secrets && s.missing_secrets.indexOf(n)>=0;
          if(missing){
            h+='<div style="margin:6px 0"><label>'+esc(n)+' <span style="color:#f38ba8">(required)</span></label>';
            h+='<input type="password" data-name="'+esc(n)+'" class="secret-input" placeholder="Enter '+esc(n)+'"></div>';
          } else {
            h+='<div style="margin:6px 0"><label>'+esc(n)+' <span class="stored-note">(stored in enclave)</span></label>';
            h+='<div class="secret-row"><input type="password" data-name="'+esc(n)+'" class="secret-input" placeholder="Enter new value to overwrite" disabled>';
            h+='<button class="overwrite-btn" onclick="toggleOverwrite(this)">Overwrite</button></div></div>';
          }
        });
      }
    }

    h+='</div>';
    if(d.status==='pending'){
      if(!OWNER_TOKEN){
        h+='<div style="margin-bottom:12px"><label>Owner Token (required to approve)</label>';
        h+='<input type="password" id="owner-token-input" placeholder="Paste your owner JWT here"></div>';
      }
      h+='<button class="approve" onclick="act(&#39;approve&#39;)">Approve</button>';
      h+='<button class="deny" onclick="act(&#39;deny&#39;)">Deny</button>';
    }
    $('content').innerHTML=h;$('loading').style.display='none';$('content').style.display='block';
  }catch(e){$('loading').textContent='Failed: '+e.message}
}

function toggleOverwrite(btn){
  var input = btn.previousElementSibling;
  input.disabled = !input.disabled;
  btn.textContent = input.disabled ? 'Overwrite' : 'Cancel';
}

async function act(action){
  var secrets={};
  document.querySelectorAll('.secret-input').forEach(function(el){
    if(el.value && !el.disabled) secrets[el.dataset.name]=el.value;
  });
  var ownerTok = OWNER_TOKEN || (document.getElementById('owner-token-input')||{}).value || '';
  try{
    var r=await fetch('/approve/'+ID,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,action:action,secrets:secrets,owner_token:ownerTok})});
    var d=await r.json();
    var st=$('status');st.style.display='block';
    if(d.error){st.className='err';st.textContent='Error: '+d.error;return}
    if(d.status==='denied'){st.className='err';st.textContent='Denied';return}
    var msg='Approved! Permit: '+esc(d.permit_id||d.id);
    st.className='ok';
    st.innerHTML=msg;
    if(d.bearer_token){
      var pid=esc(d.permit_id||d.id);
      st.innerHTML+=('<div class="bearer-label" style="margin-top:12px">Permit ID (click to copy)</div>'
        +'<div class="bearer-box" onclick="navigator.clipboard.writeText(this.textContent)">'+pid+'</div>'
        +'<div class="bearer-label" style="margin-top:12px">Bearer Token (click to copy)</div>'
        +'<div class="bearer-box" onclick="navigator.clipboard.writeText(this.textContent)">'+esc(d.bearer_token)+'</div>'
        +'<p style="font-size:11px;color:#a6adc8;margin-top:8px">POST /invoke/'+pid+' -H &quot;Authorization: Bearer &lt;token&gt;&quot; -d &#39;{&quot;capability&quot;:&quot;name&quot;,&quot;args&quot;:[...]}&#39;</p>');
    }
    document.querySelectorAll('button').forEach(function(b){b.disabled=true});
  }catch(e){var st=$('status');st.style.display='block';st.className='err';st.textContent='Error: '+e.message}
}

load();
</script></body></html>`;
