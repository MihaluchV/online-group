/* Спільна практична · спільне: розмітка, повідомлення, база даних (Firebase або демо), зв'язок, підключення завдання до журналу дій
   Звичайний скрипт (не модуль): усі файли мають спільну глобальну область видимості; порядок підключення — в index.html. */
/* ================= ЗАГАЛЬНЕ ================= */
const Q=new URLSearchParams(location.search);
const DEMO=Q.has('demo');
const EM='@klas-kod.app';
const $app=document.getElementById('app');
function el(tag,attrs,...kids){const e=document.createElement(tag);
  if(attrs)for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;
    if(k.startsWith('on')&&typeof v==='function')e.addEventListener(k.slice(2),v);else if(k==='class')e.className=v;else if(k==='style')e.style.cssText=v;
    else if(k==='html')e.innerHTML=v;else if(k==='value')e.value=v;else e.setAttribute(k,v===true?'':v)}
  for(const k of kids.flat(9)){if(k==null||k===false)continue;e.append(k.nodeType?k:document.createTextNode(String(k)))}return e}
const clear=()=>{$app.innerHTML=''};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const _mc=new MessageChannel(),_mq=[];_mc.port1.onmessage=()=>{const f=_mq.shift();f&&f()};
const yieldNow=()=>new Promise(r=>{_mq.push(r);_mc.port2.postMessage(0)});
function hashStr(s){let h=2166136261;s=String(s);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const COLORS=['#e4572e','#2f6fdf','#16884f','#9b51e0','#d81b60','#00838f','#ef6c00','#6d4c41','#3949ab','#7cb342'];
const colorOf=uid=>COLORS[hashStr(uid)%COLORS.length];
const nkey=(ln,fn)=>(ln+' '+fn).trim().toLowerCase().replace(/\s+/g,' ').replace(/[’`ʼ]/g,"'").replace(/[.#$\[\]\/]/g,'_');
const cap=s=>s.trim().replace(/\s+/g,' ').split(/([ -])/).map(w=>w&&w.length>1?w[0].toLocaleUpperCase('uk')+w.slice(1):w.toLocaleUpperCase('uk')).join('');
const NAME_OK=/^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ'’ʼ\- ]{2,40}$/u;
let toastBox=null;
function toast(msg,kind,ms){if(!toastBox){toastBox=el('div',{class:'toasts',role:'status','aria-live':'polite'});document.body.append(toastBox)}
  const t=el('div',{class:'toast '+(kind||'')},msg);toastBox.append(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),300)},ms||3800)}
function modal(title,...body){const close=()=>bg.remove();
  const bg=el('div',{class:'modal-bg',onclick:e=>{if(e.target===bg)close()}},el('div',{class:'modal',role:'dialog','aria-label':title},
    el('div',{class:'mhead'},el('b',{},title),el('button',{class:'x',onclick:close,'aria-label':'Закрити'},'✕')),...body));
  document.body.append(bg);const k=e=>{if(e.key==='Escape'){close();removeEventListener('keydown',k)}};addEventListener('keydown',k);return close}
function qrSvg(text){try{const q=qrcode(0,'M');q.addData(text,'Byte');q.make();return q.createSvgTag({cellSize:8,margin:2,scalable:true})}catch(e){return ''}}
const studentLink=room=>location.origin+location.pathname+'?r='+room+(DEMO?'&demo':'');
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Скопійовано','ok',1800)}catch(e){prompt('Скопіюйте:',text)}}

/* ================= БАЗА ДАНИХ (Firebase або демо в браузері) ================= */
const BK={db:null,off:0,auth:null,fdb:null,TS:()=>Date.now()};
const sNow=()=>Date.now()+(BK.off||0);
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Не вдалося завантажити '+src));document.head.append(s)})}
async function initBackend(role){
  if(DEMO){BK.db=new LocalDB();Conn.init();return}
  if(JSON.stringify(CFG).includes('ВАШ'))throw new Error('Вставте свій firebaseConfig у верхній частині index.html (див. README).');
  const V='10.12.2',B='https://www.gstatic.com/firebasejs/'+V+'/';
  await loadScript(B+'firebase-app-compat.js');await Promise.all([loadScript(B+'firebase-database-compat.js'),loadScript(B+'firebase-auth-compat.js')]);
  const app=firebase.initializeApp(CFG,role==='t'?'collab-teacher':'collab-student');
  BK.auth=app.auth();BK.fdb=app.database();BK.db={ref:p=>BK.fdb.ref(p)};
  BK.TS=()=>firebase.database.ServerValue.TIMESTAMP;
  BK.fdb.ref('.info/serverTimeOffset').on('value',s=>{BK.off=s.val()||0});Conn.init()}
/* Демо: «база» в localStorage, зміни між вкладками — через BroadcastChannel */
const _parts=p=>String(p).split('/').filter(Boolean);
function _get(t,p){for(const k of _parts(p)){if(t==null||typeof t!=='object')return null;t=t[k]}return t===undefined?null:t}
function _set(t,p,v){const ks=_parts(p);let o=t;const st=[];
  for(let i=0;i<ks.length-1;i++){const k=ks[i];if(o[k]==null||typeof o[k]!=='object')o[k]={};st.push([o,k]);o=o[k]}
  const last=ks[ks.length-1];if(v==null)delete o[last];else o[last]=JSON.parse(JSON.stringify(v));
  for(let i=st.length-1;i>=0;i--){const[par,k]=st[i];if(par[k]&&typeof par[k]==='object'&&!Object.keys(par[k]).length)delete par[k]}}
class LSnap{constructor(k,v){this.key=k;this._v=v}val(){return this._v==null?null:JSON.parse(JSON.stringify(this._v))}exists(){return this._v!=null}}
class LocalDB{
  constructor(){this.K='collab-demo-db';this.ls=new Set();this.disc=[];this.cache=null;
    addEventListener('storage',e=>{if(e.key===this.K){try{this.cache=JSON.parse(e.newValue||'{}')||{}}catch(x){this.cache=null}this.notify(true)}});
    addEventListener('pagehide',()=>{for(const f of this.disc)try{f()}catch(e){}})}
  tree(){if(!this.cache){try{this.cache=JSON.parse(localStorage.getItem(this.K)||'{}')||{}}catch(e){this.cache={}}}return this.cache}
  write(fn){this.cache=null;const t=this.tree();fn(t);try{localStorage.setItem(this.K,JSON.stringify(t))}catch(e){toast('Демо: закінчилось місце в localStorage','bad')}
    this.cache=null;setTimeout(()=>this.notify(),0);return Promise.resolve()}
  notify(keep){if(!keep)this.cache=null;const t=this.tree();for(const l of[...this.ls])try{l.check(t)}catch(e){console.error(e)}}
  ref(p){return new LRef(this,p)}}
class LRef{
  constructor(db,p){this.db=db;this.path=_parts(p).join('/');this.key=_parts(p).pop()||null}
  child(c){return new LRef(this.db,this.path+'/'+c)}
  set(v){return this.db.write(t=>_set(t,this.path,v))}
  update(o){return this.db.write(t=>{for(const[k,v]of Object.entries(o))_set(t,this.path+'/'+k,v)})}
  remove(){return this.set(null)}
  once(){return Promise.resolve(new LSnap(this.key,_get(this.db.tree(),this.path)))}
  on(ev,cb){const self=this;const L={ref:this,ev,cb,prev:undefined,keys:null,check(t){
      const v=_get(t,self.path);
      if(ev==='value'){const s=JSON.stringify(v);if(s!==L.prev){L.prev=s;cb(new LSnap(self.key,v))}return}
      const obj=v&&typeof v==='object'?v:{},ks=Object.keys(obj).sort();
      if(!L.keys){L.keys=new Set();for(const k of ks){L.keys.add(k);if(ev==='child_added')cb(new LSnap(k,obj[k]))}return}
      for(const k of ks)if(!L.keys.has(k)){L.keys.add(k);if(ev==='child_added')cb(new LSnap(k,obj[k]))}
      for(const k of[...L.keys])if(!(k in obj)){L.keys.delete(k);if(ev==='child_removed')cb(new LSnap(k,null))}}};
    this.db.ls.add(L);setTimeout(()=>{if(this.db.ls.has(L))L.check(this.db.tree())},0);return cb}
  off(ev,cb){for(const L of[...this.db.ls])if(L.ref.path===this.path&&(!ev||L.ev===ev)&&(!cb||L.cb===cb))this.db.ls.delete(L)}
  onDisconnect(){const s=this,db=this.db;return{update(o){db.disc.push(()=>s.update(o));return Promise.resolve()},
    remove(){db.disc.push(()=>s.remove());return Promise.resolve()},set(v){db.disc.push(()=>s.set(v));return Promise.resolve()},cancel(){db.disc=[];return Promise.resolve()}}}}

let ROOM='';
const GCOL=['#2f6fdf','#16884f','#d81b60','#ef6c00','#9b51e0','#00838f'];
const gColor=g=>GCOL[(g-1)%GCOL.length];
const gnum=v=>typeof v==='string'?(+v.slice(1)||0):(+v||0);
/* Стан з'єднання з сервером */
const Conn={on:true,ls:new Set(),
  init(){if(DEMO){addEventListener('online',()=>this.set(true));addEventListener('offline',()=>this.set(false));this.set(navigator.onLine);window.__setConn=v=>this.set(v);return}
    BK.fdb.ref('.info/connected').on('value',s=>this.set(s.val()===true))},
  set(v){if(v===this.on)return;this.on=v;this.ls.forEach(f=>{try{f(v)}catch(e){console.error(e)}})},
  sub(f){this.ls.add(f);return()=>this.ls.delete(f)}};
function connBanner(){
  const b=el('div',{class:'offline',role:'alert',style:'display:none'},'⚠ Немає зв\'язку з сервером. Дії тимчасово не надсилаються — перевірте інтернет. Щойно зв\'язок з\'явиться, усе оновиться автоматично.');
  let t=null,shown=false;
  Conn.sub(v=>{clearTimeout(t);if(!v)t=setTimeout(()=>{if(!Conn.on){b.style.display='';shown=true}},1500);
    else{b.style.display='none';if(shown)toast('✓ Зв\'язок відновлено','ok');shown=false}});
  if(!Conn.on)t=setTimeout(()=>{if(!Conn.on){b.style.display='';shown=true}},1500);
  return b}
const SS=DEMO?sessionStorage:localStorage;
const savedStudent=()=>{try{return JSON.parse(SS.getItem('collab-student')||'null')}catch(e){return null}};
const saveStudent=o=>{try{SS.setItem('collab-student',JSON.stringify(o))}catch(e){}};
function Subs(){const l=[];return{on(ref,ev,cb){ref.on(ev,cb);l.push([ref,ev,cb]);return cb},off(){for(const[r,e,c]of l)try{r.off(e,c)}catch(x){}l.length=0}}}
const RR=p=>BK.db.ref('collab/rooms/'+ROOM+(p?'/'+p:''));
const canEditIn=(perm,uid)=>{perm=perm||{};const u=perm.u||{};return u[uid]===true||(perm.all===true&&u[uid]!==false)};
function genCode(){const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<5;i++)s+=A[Math.floor(Math.random()*A.length)];return s}
const newSid=()=>'s'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* Спільна «сцена» з завданням: підключення до активного завдання й журналу */
function connectStage(host,{uid,canAct:can0,nameOf,onActivity,onStatus,onActive,cursorOK,onLogChange,isTeacher,pickSession}){
  const canAct=()=>Conn.on&&can0();
  let logRef=null,logCb=null,curSid=null,token=0,lastCur=null,curTimer=null,curPending=undefined;const subs=Subs();
  let logRmCb=null;
  const stage=createStage(host,{uid,canAct,nameOf,onActivity,onStatus,onLogChange,
    push:(sid,key,en)=>RR('log/'+sid+'/'+key).set(en),
    onAlert:m=>toast('💬 '+m,'info',6000),
    onBlocked:k=>{const t=Date.now();if(t-(connectStage._b||0)<3500)return;connectStage._b=t;
      toast(!Conn.on?'⚠ Немає зв\'язку з сервером — дія не відбудеться. Перевірте інтернет.':k==='ro'?'👀 Зараз у вас режим перегляду. Дочекайтеся, поки вчитель надасть доступ.':'⏳ Зачекайте мить: синхронізація…','info',3000)},
    onSkipped:()=>toast('⚠️ Вашу дію скасовано: хтось інший змінив завдання в ту саму мить. Спробуйте ще раз.','bad',5000),
    onWriteFail:()=>toast('Дію не збережено: можливо, доступ щойно закрито.','bad'),
    onCursorLocal:c=>{if(c&&cursorOK&&!cursorOK())return;curPending=c;if(curTimer)return;curTimer=setTimeout(()=>{curTimer=null;const v=curPending;curPending=undefined;
      if(v===null)RR('cur/'+uid).remove().catch(()=>{});else if(v)RR('cur/'+uid).set({...v,s:stage.sid||'',t:BK.TS()}).catch(()=>{})},120)}});
  if(DEMO)window.__stage=stage;
  const empty=el('div',{class:'empty'});host.append(empty);
  const setEmpty=html=>{empty.innerHTML=html||'';empty.style.display=html?'':'none'};
  subs.on(RR('cur'),'value',s=>{const v=s.val()||{};const seen=new Set();
    for(const[u,c]of Object.entries(v)){if(u===uid||!c||(c.s&&c.s!==stage.sid))continue;seen.add(u);if(lastCur&&JSON.stringify(lastCur[u])===JSON.stringify(c))continue;stage.setCursor(u,c,nameOf(u))}
    if(lastCur)for(const u of Object.keys(lastCur))if(!seen.has(u))stage.setCursor(u,null);lastCur=v});
  const htmlCache={};let lastA=null;
  const detach=()=>{if(logRef){logRef.off('child_added',logCb);logRef.off('child_removed',logRmCb);logRef=null}};
  async function apply(a){
    if(!a||!a.sid){token++;detach();curSid=null;stage.unload();
      setEmpty('<div><div style="font-size:42px">📄</div><b>Завдання ще не відкрито</b><div class="mu">'+(isTeacher?'Завантажте HTML-файл у вкладці «Завдання» і натисніть «▶ Відкрити для всіх».':'Зачекайте: вчитель скоро відкриє завдання.')+'</div></div>');return}
    const ps=pickSession?pickSession(a):{sid:a.sid,at:a.at};
    if(!ps){token++;detach();curSid=null;stage.unload();
      setEmpty('<div><div style="font-size:42px">🧩</div><b>Групова робота</b><div class="mu">Зачекайте: учитель розподіляє учнів на групи.</div></div>');return}
    if(ps.sid===curSid)return;
    const my=++token;detach();
    curSid=ps.sid;setEmpty('<div class="mu">Завантаження завдання…</div>');
    try{
      let html=htmlCache[a.tid];if(!html){html=(await RR('html/'+a.tid).once('value')).val();if(html)htmlCache[a.tid]=html}if(my!==token)return;
      if(!html){setEmpty('<div class="mu">Файл завдання не знайдено.</div>');return}
      const entries=(await RR('log/'+ps.sid).once('value')).val()||{};if(my!==token)return;
      setEmpty('');
      await stage.load(html,ps.sid,ps.at,entries);if(my!==token)return;
      logRef=RR('log/'+ps.sid);logCb=logRef.on('child_added',sn=>stage.remote(sn.key,sn.val()));
      const sidNow=ps.sid;logRmCb=logRef.on('child_removed',sn=>{if(stage.sid===sidNow)stage.removed(sn.key)});
    }catch(e){console.error(e);if(my===token){curSid=null;setEmpty('<div class="err">Помилка завантаження: '+(e.message||e)+'</div>')}}}
  subs.on(RR('active'),'value',s=>{lastA=s.val();onActive&&onActive(lastA);apply(lastA)});
  stage.reapply=()=>apply(lastA);
  const unConn=Conn.sub(()=>stage.permChanged());
  /* «Дивіться сюди» від учителя */
  if(!isTeacher){let first=true,lastN=null;subs.on(RR('look'),'value',s=>{const v=s.val();
    if(first){first=false;lastN=v&&v.n;return}if(!v||v.n===lastN)return;lastN=v.n;
    if(stage.sid&&v.sid===stage.sid&&stage.lookAt(v))toast('👁 Учитель показує це місце','info',2500)})}
  stage.dispose=()=>{token++;subs.off();unConn();if(logRef){logRef.off('child_added',logCb);logRef.off('child_removed',logRmCb);logRef=null}stage.unload()};
  return stage}

function fatal(e){clear();$app.append(el('div',{class:'center'},el('div',{class:'box'},el('h1',{},'Помилка'),el('div',{class:'err'},String(e&&e.message||e)))))}
