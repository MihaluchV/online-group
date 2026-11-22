/* Спільна практична · рушій синхронізації: запис дій у журнал і відтворення їх в усіх копіях завдання
   Звичайний скрипт (не модуль): усі файли мають спільну глобальну область видимості; порядок підключення — в index.html. */
/*
   Кожен пристрій запускає власну копію HTML-завдання в iframe.
   Дії того, хто має доступ (події миші, дотику, клавіатури, введення тексту),
   записуються пакетами в журнал (log) і відтворюються на всіх інших пристроях
   у тому самому порядку. Порядок задає ключ пакета (час + id), тому всі
   копії приходять до однакового стану. Якщо пакет прийшов «не за чергою»,
   копія тихо перебудовується з журналу в прихованому iframe і підміняється.
   Для детермінізму в завданні підміняються Math.random (спільне зерно),
   localStorage (у пам'яті), таймери (віртуальний час під час відтворення). */
function createStage(host, o){
  const S={html:null,sid:null,t0:0,seed:1,known:new Map(),applied:new Set(),maxKey:'',queue:[],open:null,ctx:null,
    ready:false,rebuilding:false,needRebuild:false,playing:false,pumping:false,
    ptrs:new Set(),mouse:false,touches:0,drag:false,lastLocal:0,seq:0,lastTs:0,gen:0,moveT:{},pend:new Map(),flushT:null,
    misses:0,skipClick:null,noClickUntil:0,skipped:new Set(),curT:0,curOffT:null,cursors:new Map()};
  const layer=el('div',{class:'cursors'});host.append(layer);
  const now=()=>Date.now()+(BK.off||0);
  const TYPES=['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','click','dblclick','contextmenu',
    'touchstart','touchmove','touchend','touchcancel','dragstart','dragenter','dragover','dragleave','drop','dragend',
    'keydown','keyup','keypress','input','change','beforeinput','paste','cut'];
  const MOVES=new Set(['pointermove','mousemove','touchmove','dragover','dragenter','dragleave']);
  const ENDS=new Set(['pointerup','pointercancel','mouseup','touchend','touchcancel','dragend','drop','click']);
  const DOWNS=new Set(['pointerdown','mousedown','touchstart','dragstart','click','dblclick','contextmenu','keydown']);
  const fp=n=>{if(!n||n.nodeType!==1)return null;return (n.tagName+':'+(n.textContent||'').replace(/\s+/g,' ').trim().slice(0,40))};
  const gestureActive=()=>S.ptrs.size>0||S.mouse||S.touches>0||S.drag;
  const resetGesture=()=>{S.ptrs.clear();S.mouse=false;S.touches=0;S.drag=false};
  const tsOf=k=>k?parseInt(k.slice(0,9),36):0;
  const makeKey=()=>{const ts=Math.max(Math.floor(now()),tsOf(S.maxKey)+1,S.lastTs+1);S.lastTs=ts;
    return ts.toString(36).padStart(9,'0')+'_'+String(o.uid).replace(/[^A-Za-z0-9]/g,'').slice(0,8)+(++S.seq).toString(36).padStart(3,'0')};

  /* ---------- шляхи до елементів ---------- */
  function pathOf(ctx,n){const d=ctx.doc;if(!n)return null;if(n===d)return 'D';if(n===ctx.win)return 'W';
    if(n.nodeType!==1)n=n.parentElement;if(!n||n.ownerDocument!==d)return null;
    const p=[];while(n&&n!==d.documentElement){const par=n.parentElement;if(!par)return null;p.push(Array.prototype.indexOf.call(par.children,n));n=par}
    return n?p.reverse():null}
  function byPath(ctx,p){if(p==='D')return ctx.doc;if(p==='W')return ctx.win;if(!Array.isArray(p))return null;let n=ctx.doc.documentElement;for(const i of p){n=n&&n.children[i]}return n||null}
  const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  function pointRec(ctx,rec,x,y,tg){
    let hit=null;try{hit=ctx.doc.elementFromPoint(x,y)}catch(e){}
    const ref=hit||(tg&&tg.nodeType===1?tg:null);
    if(!ref){rec.ax=Math.round(x);rec.ay=Math.round(y);return}
    const r=ref.getBoundingClientRect();rec.x=+((x-r.left)/(r.width||1)).toFixed(4);rec.z=+((y-r.top)/(r.height||1)).toFixed(4);
    if(hit){const hp=pathOf(ctx,hit);if(!hp){delete rec.x;delete rec.z;rec.ax=Math.round(x);rec.ay=Math.round(y)}else rec.h=same(hp,rec.p)?1:hp}
    else rec.rt=1}
  function pointFor(ctx,r,tg,scroll){
    let ref=null;if(r.h===1||r.rt)ref=tg;else if(Array.isArray(r.h))ref=byPath(ctx,r.h);
    if(!ref||ref.nodeType!==1)return{x:r.ax||0,y:r.ay||0,abs:1};
    let b=ref.getBoundingClientRect(),x=b.left+r.x*b.width,y=b.top+r.z*b.height;
    if(scroll){const W=ctx.win.innerWidth,H=ctx.win.innerHeight;
      if(x<0||y<0||x>=W||y>=H){const sx=ctx.win.scrollX,sy=ctx.win.scrollY;
        try{ctx.win.scrollBy((x<0||x>=W)?x-W/2:0,(y<0||y>=H)?y-H/2:0)}catch(e){}
        ctx.tmp={sx,sy,ax:ctx.win.scrollX,ay:ctx.win.scrollY};b=ref.getBoundingClientRect();x=b.left+r.x*b.width;y=b.top+r.z*b.height}
      /* якщо в цьому місці екрана елемент перекритий (інша ширина екрана), шукаємо видиму точку того самого елемента */
      const hits=(X,Y)=>{try{const e=ctx.doc.elementFromPoint(X,Y);return !!e&&(e===ref||ref.contains(e))}catch(_){return true}};
      const G=[[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75],[.1,.5],[.9,.5],[.15,.15],[.85,.85],[.15,.85],[.85,.15]];
      const tryGrid=()=>{for(const[a,c]of G){const X=b.left+a*b.width,Y=b.top+c*b.height;if(X>=0&&Y>=0&&X<W&&Y<H&&hits(X,Y)){x=X;y=Y;return true}}return false};
      if(!hits(x,y)&&!tryGrid()){
        /* елемент закритий, наприклад, липкою панеллю внизу: тимчасово прокручуємо його в центр */
        if(!ctx.tmp)ctx.tmp={sx:ctx.win.scrollX,sy:ctx.win.scrollY};
        try{ctx.win.scrollBy(0,b.top+b.height/2-H/2)}catch(e){}
        ctx.tmp.ax=ctx.win.scrollX;ctx.tmp.ay=ctx.win.scrollY;
        b=ref.getBoundingClientRect();const fx=b.left+r.x*b.width,fy=b.top+r.z*b.height;
        if(hits(fx,fy)){x=fx;y=fy}else if(!tryGrid()){x=fx;y=fy}}}
    return{x,y}}

  /* ---------- запис події ---------- */
  const mods=e=>(e.ctrlKey?1:0)|(e.shiftKey?2:0)|(e.altKey?4:0)|(e.metaKey?8:0);
  function ser(ctx,e){
    const W=ctx.win,t=e.type,tg=e.target,p=pathOf(ctx,tg);if(p==null)return null;
    const rec={y:t,p};const m=mods(e);if(m)rec.m=m;
    if(e instanceof W.KeyboardEvent){rec.k='k';rec.key=e.key;rec.code=e.code;if(e.keyCode)rec.kc=e.keyCode;if(e.charCode)rec.ch=e.charCode;if(e.repeat)rec.r=1;if(e.location)rec.l=e.location;return rec}
    if(t==='input'||t==='change'){
      const ty=(tg.type||'').toLowerCase();if(ty==='file')return null;
      rec.k='i';if(ty==='checkbox'||ty==='radio'){rec.c=tg.checked?1:0;return rec}
      if(tg.isContentEditable&&!('value' in tg))rec.ht=tg.innerHTML;else if('value' in tg)rec.v=tg.value;else return null;
      try{if(typeof tg.selectionStart==='number'){rec.s0=tg.selectionStart;rec.s1=tg.selectionEnd}}catch(_){}
      if(e.inputType)rec.it=e.inputType;if(e.data!=null)rec.dd=e.data;return rec}
    if(W.TouchEvent&&e instanceof W.TouchEvent){rec.k='t';
      const tr=tp=>{const q={i:tp.identifier,p:pathOf(ctx,tp.target)};pointRec(ctx,q,tp.clientX,tp.clientY,tp.target);return q};
      rec.tl=[...e.touches].map(tr);rec.cl=[...e.changedTouches].map(tr);return rec}
    if(e instanceof W.MouseEvent){
      rec.k=(W.DragEvent&&e instanceof W.DragEvent)?'d':(W.PointerEvent&&e instanceof W.PointerEvent)?'p':'m';
      pointRec(ctx,rec,e.clientX,e.clientY,tg);
      if(e.button)rec.b=e.button;if(e.buttons)rec.bs=e.buttons;if(e.detail)rec.dt=e.detail;
      if(rec.k==='p'){rec.id=e.pointerId;rec.pt=e.pointerType;if(!e.isPrimary)rec.pr=0}
      return rec}
    return null}

  function block(e,soft){
    const t=e.type;e.stopImmediatePropagation();
    if(t==='touchstart'||t==='touchmove'||t==='pointermove'||t==='mousemove'||t==='pointerdown')return;
    if(t==='keydown'&&/^(Arrow|Page|Home|End|Tab)/.test(e.key||''))return;
    if(e.cancelable)e.preventDefault()}

  function onLocal(ctx,e){
    if(!e.isTrusted)return;
    const t=e.type;
    if(ctx!==S.ctx||ctx.mode!=='live'||ctx.dead){block(e);return}
    const can=o.canAct()&&S.ready&&!S.rebuilding&&!S.playing;
    if(!can){block(e);if(t==='pointerup'||t==='mouseup'||t==='touchend')S.noClickUntil=performance.now()+600;if(t==='pointerdown'||t==='keydown'||t==='touchstart')o.onBlocked&&o.onBlocked(S.playing||S.rebuilding||!S.ready?'wait':'ro');return}
    if(t==='beforeinput'||t==='paste'||t==='cut')return;
    if(t==='click'){
      if(S.skipClick&&e.target===S.skipClick){S.skipClick=null;return}
      const lab=e.target.closest&&e.target.closest('label');
      if(lab&&lab.control&&lab.control!==e.target&&!lab.control.contains(e.target)){S.skipClick=lab.control;setTimeout(()=>{S.skipClick=null},0)}}
    const orphan=(t==='pointerup'||t==='pointercancel')?!S.ptrs.has(e.pointerId):t==='mouseup'?!S.mouse:(t==='touchend'||t==='touchcancel')?S.touches===0:(t==='drop'||t==='dragend')?!S.drag:
      (t==='click'||t==='dblclick'||t==='contextmenu')?performance.now()<S.noClickUntil:false;
    if(orphan){block(e);if(t!=='click'&&t!=='dblclick'&&t!=='contextmenu')S.noClickUntil=performance.now()+600;return}
    if(t==='pointerdown')S.ptrs.add(e.pointerId);else if(t==='pointerup'||t==='pointercancel')S.ptrs.delete(e.pointerId);
    else if(t==='mousedown')S.mouse=true;else if(t==='mouseup')S.mouse=false;
    else if(t==='touchstart'||t==='touchend'||t==='touchcancel'){S.touches=e.touches.length;e.__seen=1;
      if(t==='touchstart'){const tg=e.target,h=ev=>{if(ev.__seen||!ev.isTrusted)return;S.touches=ev.touches.length;if(!gestureActive())scheduleFlush(60)};
        tg.addEventListener('touchend',h,{once:true});tg.addEventListener('touchcancel',h,{once:true})}}
    else if(t==='dragstart')S.drag=true;else if(t==='dragend')S.drag=false;
    const mv=MOVES.has(t);
    if(mv&&!gestureActive())return;
    S.lastLocal=now();
    const rec=ser(ctx,e);if(!rec)return;rec._t=now();
    if(DOWNS.has(t)&&!(S.open&&S.open.ev.some(x=>x.f!=null))){const f=fp(e.target);if(f!=null)rec.f=f}
    if(mv){const tn=performance.now();const lim=S.open&&S.open.ev.length>400?100:40;
      if(tn-(S.moveT[t]||0)<lim){S.pend.set(t,rec);S.lastActor=o.uid;sendCursor(rec);return}S.moveT[t]=tn;S.pend.delete(t)}
    else flushPend()
    S.lastActor=o.uid;push(rec);sendCursor(rec);
    if(gestureActive()){clearTimeout(S.flushT);S.flushT=null}
    else scheduleFlush(ENDS.has(t)?60:(t==='keydown'||t==='keyup'||t==='keypress'||t==='input')?450:120)}
  function push(rec){
    if(!S.open){const key=makeKey();S.open={key,t0:tsOf(key),ev:[],born:performance.now(),base:S.maxKey}}
    rec.d=Math.max(0,Math.round((rec._t||now())-S.open.t0));delete rec._t;S.open.ev.push(rec)}
  function flushPend(){if(!S.pend.size)return;const l=[...S.pend.values()].sort((a,b)=>a._t-b._t);S.pend.clear();for(const r of l)push(r)}
  function scheduleFlush(ms){clearTimeout(S.flushT);
    if(S.open&&performance.now()-S.open.born>1500)ms=0;
    S.flushT=setTimeout(()=>{S.flushT=null;if(!gestureActive())flush()},ms)}
  function recDialog(ctx,v){if(ctx===S.ctx&&S.open)S.open.ev.push({k:'g',v,d:Math.max(0,Math.round(now()-S.open.t0))})}
  function flush(){
    clearTimeout(S.flushT);S.flushT=null;
    const b=S.open;if(!b)return;flushPend()
    S.open=null;if(!b.ev.length)return;
    const en={u:o.uid,t0:b.t0,b:b.base||'',e:JSON.stringify(b.ev)};
    S.known.set(b.key,en);S.applied.add(b.key);if(b.key>S.maxKey)S.maxKey=b.key;if(S.ctx)S.ctx.lastKey=b.key;
    const gen=S.gen;
    Promise.resolve().then(()=>o.push(S.sid,b.key,en)).catch(err=>{console.warn('Запис відхилено',err);
      if(gen!==S.gen)return;S.known.delete(b.key);S.applied.delete(b.key);S.maxKey=[...S.applied].sort().pop()||'';
      o.onWriteFail&&o.onWriteFail(err);requestRebuild()});
    o.onActivity&&o.onActivity(o.uid);o.onLogChange&&o.onLogChange();
    endCursorSoon();
    pumpQueue()}
  setInterval(()=>{if(gestureActive()&&now()-S.lastLocal>4000){resetGesture();flush();pumpQueue()}},1000);

  /* ---------- курсори ---------- */
  function sendCursor(rec){
    if(!o.onCursorLocal||!(rec.k==='p'||rec.k==='m'||rec.k==='d'||rec.k==='t'))return;
    const src=rec.k==='t'?(rec.tl[0]||rec.cl[0]):rec;if(!src)return;
    const tn=performance.now();if(tn-S.curT<110)return;S.curT=tn;
    const c={p:rec.k==='t'?src.p:rec.p};if(src.h!==undefined)c.h=src.h;if(src.rt)c.rt=1;if(src.x!==undefined){c.x=src.x;c.z=src.z}else{c.ax=src.ax;c.ay=src.ay}
    clearTimeout(S.curOffT);o.onCursorLocal(c)}
  function endCursorSoon(){clearTimeout(S.curOffT);S.curOffT=setTimeout(()=>o.onCursorLocal&&o.onCursorLocal(null),900)}
  function setCursor(uid,c,name){
    let it=S.cursors.get(uid);
    if(!c){if(it){it.el.remove();S.cursors.delete(uid)}return}
    if(!it){const col=colorOf(uid);
      it={el:el('div',{class:'cur'},el('div',{html:'<svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1l15 9.5-6.6 1.3L13 20l-3 1.2-3.6-8.1L1 17z" fill="'+col+'" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'}),el('span',{style:'background:'+col},name||''))};
      layer.append(it.el);S.cursors.set(uid,it)}
    it.c=c;it.name=name;it.el.querySelector('span').textContent=name||'';
    clearTimeout(it.tm);it.tm=setTimeout(()=>setCursor(uid,null),4000);
    placeCursor(it)}
  function placeCursor(it){
    const ctx=S.ctx;if(!ctx||!ctx.doc){it.el.style.display='none';return}
    const tg=it.c.p!=null?byPath(ctx,it.c.p):null;let pt;
    try{pt=pointFor(ctx,it.c,tg,false)}catch(e){pt=null}
    if(!pt||pt.x<0||pt.y<0||pt.x>ctx.win.innerWidth||pt.y>ctx.win.innerHeight){it.el.style.display='none';return}
    it.el.style.display='';it.el.style.left=pt.x+'px';it.el.style.top=pt.y+'px'}
  const placeAll=()=>S.cursors.forEach(placeCursor);
  function cursorFromRec(uid,r){
    const src=r.k==='t'?(r.tl[0]||r.cl[0]):r;if(!src)return;
    const c={p:r.k==='t'?src.p:r.p,h:src.h,rt:src.rt,x:src.x,z:src.z,ax:src.ax,ay:src.ay};
    setCursor(uid,c,o.nameOf(uid))}

  /* ---------- iframe і підміни всередині завдання ---------- */
  window.__collabHook=function(win){try{const f=win.frameElement,ctx=f&&f.__ctx;if(ctx&&!ctx.win)patch(ctx,win)}catch(e){console.error(e)}};
  function inject(html){
    const tag='<script>try{parent.__collabHook(window)}catch(e){}<\/script>';
    if(/<head[^>]*>/i.test(html))return html.replace(/<head[^>]*>/i,m=>m+tag);
    if(/<html[^>]*>/i.test(html))return html.replace(/<html[^>]*>/i,m=>m+tag);
    if(/<!doctype[^>]*>/i.test(html))return html.replace(/<!doctype[^>]*>/i,m=>m+tag);
    return tag+html}
  function makeFrame(hidden){
    const f=document.createElement('iframe');if(hidden)f.className='hidden';
    f.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads');
    f.setAttribute('title','Завдання');
    const ctx={f,mode:'replay',vnow:S.t0,timers:[],tid:1,raf:[],rid:1e9,dq:[],synth:0,silent:hidden,dead:false};
    f.__ctx=ctx;
    ctx.ready=new Promise(res=>{let done=false;const fin=()=>{if(done)return;done=true;try{if(!ctx.win)patch(ctx,f.contentWindow)}catch(e){}res()};
      f.addEventListener('load',fin,{once:true});setTimeout(fin,10000)});
    f.srcdoc=inject(S.html);
    host.insertBefore(f,layer);
    return ctx}
  function memStore(){const m=new Map();return{getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v))},
    removeItem:k=>{m.delete(String(k))},clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size}}}
  function patch(ctx,win){
    ctx.win=win;ctx.doc=win.document;
    const N=ctx.N={st:win.setTimeout.bind(win),ct:win.clearTimeout.bind(win),raf:win.requestAnimationFrame.bind(win),caf:win.cancelAnimationFrame.bind(win),
      pnow:win.performance.now.bind(win.performance),confirm:win.confirm.bind(win),prompt:win.prompt.bind(win)};
    let a=S.seed|0;
    win.Math.random=function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
    for(const k of ['localStorage','sessionStorage'])try{Object.defineProperty(win,k,{value:memStore(),configurable:true})}catch(e){}
    const clock=()=>ctx.mode==='live'?now():ctx.vnow;
    try{win.Date.now=()=>Math.floor(clock())}catch(e){}
    try{win.performance.now=()=>ctx.mode==='live'?N.pnow()+(ctx.pBase||0):ctx.vnow-S.t0}catch(e){}
    const add=(fn,d,args,iv)=>{if(typeof fn!=='function'){const code=String(fn);fn=()=>win.eval(code)}
      const id=ctx.tid++;d=Math.max(0,+d||0);ctx.timers.push({id,due:clock()+d,fn,args,iv:iv?Math.max(d,4):0});if(ctx.mode==='live')wake(ctx);return id};
    win.setTimeout=function(fn,d,...args){return add(fn,d,args,false)};
    win.setInterval=function(fn,d,...args){return add(fn,d,args,true)};
    win.clearTimeout=win.clearInterval=function(id){const i=ctx.timers.findIndex(t=>t.id===id);if(i>=0)ctx.timers.splice(i,1)};
    win.requestAnimationFrame=function(cb){if(ctx.mode==='live')return N.raf(()=>{if(!ctx.dead)try{cb(win.performance.now())}catch(e){console.error(e)}});const id=ctx.rid++;ctx.raf.push({id,cb});return id};
    win.cancelAnimationFrame=function(id){if(id>=1e9){const i=ctx.raf.findIndex(r=>r.id===id);if(i>=0)ctx.raf.splice(i,1)}else N.caf(id)};
    win.alert=function(m){if(!ctx.silent&&ctx===S.ctx)o.onAlert&&o.onAlert(String(m))};
    win.confirm=function(m){if(ctx.synth>0||ctx.mode!=='live'||ctx!==S.ctx){const r=ctx.dq.shift();return r?!!r.v:false}const v=N.confirm(m);recDialog(ctx,v);return v};
    win.prompt=function(m,d){if(ctx.synth>0||ctx.mode!=='live'||ctx!==S.ctx){const r=ctx.dq.shift();return r?r.v:null}const v=N.prompt(m,d);recDialog(ctx,v);return v};
    /* мережеві запити, що надсилають дані (наприклад, результати в Google-таблицю), виконує лише пристрій того, хто діяв */
    const mine=()=>ctx.synth===0&&ctx.mode==='live'&&ctx===S.ctx&&S.lastActor===o.uid;
    const FAKE='{"ok":true,"status":"ok","result":"success"}';
    const nf=win.fetch&&win.fetch.bind(win);
    if(nf)win.fetch=function(input,init){const m=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
      if(m!=='GET'&&m!=='HEAD'&&!mine())return Promise.resolve(new win.Response(FAKE,{status:200,headers:{'Content-Type':'application/json'}}));return nf(input,init)};
    try{const XP=win.XMLHttpRequest.prototype,oO=XP.open,oS=XP.send;
      XP.open=function(m,...a){this.__m=String(m||'GET').toUpperCase();return oO.call(this,m,...a)};
      XP.send=function(b){if(this.__m&&this.__m!=='GET'&&this.__m!=='HEAD'&&!mine()){const x=this;
          for(const[k,v]of[['readyState',4],['status',200],['responseText',FAKE],['response',FAKE]])try{Object.defineProperty(x,k,{value:v,configurable:true})}catch(e){}
          N.st(()=>{try{x.onreadystatechange&&x.onreadystatechange();x.dispatchEvent(new win.ProgressEvent('load'));x.dispatchEvent(new win.ProgressEvent('loadend'))}catch(e){}},0);return}
        return oS.call(this,b)}}catch(e){}
    try{const ob=win.navigator.sendBeacon&&win.navigator.sendBeacon.bind(win.navigator);if(ob)win.navigator.sendBeacon=function(...a){return mine()?ob(...a):true}}catch(e){}
    /* у вбудованій сторінці зміна адреси (#t1 тощо) заборонена браузером — просто ігноруємо */
    for(const m of ['pushState','replaceState']){try{const f0=win.history[m];if(f0)win.history[m]=function(...x){try{return f0.apply(win.history,x)}catch(e){}}}catch(e){}}
    for(const m of ['setPointerCapture','releasePointerCapture']){const f0=win.Element.prototype[m];if(f0)win.Element.prototype[m]=function(...x){try{return f0.apply(this,x)}catch(e){}}}
    for(const P of [win.HTMLElement,win.SVGElement]){if(!P)continue;const fo=P.prototype.focus;if(fo)P.prototype.focus=function(...x){if(ctx.synth>0||ctx.silent)return;return fo.apply(this,x)}}
    win.Element.prototype.scrollIntoView=function(arg){try{const r=this.getBoundingClientRect(),H=win.innerHeight;
      const blk=arg===true?'start':arg===false?'end':(arg&&arg.block)||'start';
      let dy=blk==='start'?r.top:blk==='end'?r.bottom-H:blk==='center'?r.top+r.height/2-H/2:(r.top<0?r.top:r.bottom>H?r.bottom-H:0);
      win.scrollBy({top:dy,behavior:(arg&&arg.behavior)||'auto'})}catch(e){}};
    win.addEventListener('submit',e=>e.preventDefault());
    win.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;const h=a.getAttribute('href')||'';
      if(h.startsWith('#')||/^javascript:/i.test(h))return;e.preventDefault();if(e.isTrusted&&ctx===S.ctx)window.open(a.href,'_blank','noopener')});
    for(const t of TYPES)win.addEventListener(t,e=>onLocal(ctx,e),{capture:true,passive:false});
    win.addEventListener('scroll',()=>{if(ctx===S.ctx)placeAll()},{passive:true});
    win.addEventListener('resize',()=>{if(ctx===S.ctx)placeAll()});
  }
  function wake(ctx){
    if(ctx.dead||ctx.mode!=='live'||!ctx.timers.length)return;
    let e=Infinity;for(const t of ctx.timers)if(t.due<e)e=t.due;
    if(ctx.wakeAt&&ctx.wakeAt<=e)return;
    if(ctx.wakeH)ctx.N.ct(ctx.wakeH);ctx.wakeAt=e;
    ctx.wakeH=ctx.N.st(()=>{ctx.wakeAt=0;ctx.wakeH=0;if(!ctx.dead&&ctx.mode==='live'){fireDue(ctx,now());wake(ctx)}},Math.max(0,e-now()))}
  function fireDue(ctx,T){
    for(let g=0;g<200000;g++){
      let best=null;for(const t of ctx.timers)if(t.due<=T&&(!best||t.due<best.due||(t.due===best.due&&t.id<best.id)))best=t;
      if(!best||ctx.dead)break;
      if(ctx.mode!=='live'&&best.due>ctx.vnow)ctx.vnow=best.due;
      if(best.iv){best.due+=best.iv;if(ctx.mode!=='live'&&(T-best.due)/best.iv>300)best.due=T-((T-best.due)%best.iv)}
      else ctx.timers.splice(ctx.timers.indexOf(best),1);
      try{best.fn.apply(ctx.win,best.args||[])}catch(e){console.error('[завдання]',e)}}}
  function advanceTo(ctx,T){
    if(T>ctx.vnow){fireDue(ctx,T);ctx.vnow=T}
    const q=ctx.raf;ctx.raf=[];for(const r of q)try{r.cb(ctx.vnow-S.t0)}catch(e){console.error(e)}}
  function goLive(ctx){
    advanceTo(ctx,now());ctx.pBase=(ctx.vnow-S.t0)-ctx.N.pnow();ctx.mode='live';
    const q=ctx.raf;ctx.raf=[];for(const r of q)ctx.N.raf(()=>{try{r.cb(ctx.win.performance.now())}catch(e){}});
    wake(ctx)}

  /* ---------- відтворення ---------- */
  function defP(ev,k,v){try{Object.defineProperty(ev,k,{get:()=>v})}catch(e){}}
  function dispatch(ctx,r){
    const W=ctx.win;const tg=byPath(ctx,r.p);if(!tg){S.misses++;return}
    ctx.tmp=null;let ev;const m=r.m||0,md={ctrlKey:!!(m&1),shiftKey:!!(m&2),altKey:!!(m&4),metaKey:!!(m&8)};
    try{
      if(r.k==='k'){ev=new W.KeyboardEvent(r.y,{bubbles:true,cancelable:true,composed:true,view:W,key:r.key,code:r.code,repeat:!!r.r,location:r.l||0,...md});
        defP(ev,'keyCode',r.kc|0);defP(ev,'which',r.kc|0);defP(ev,'charCode',r.ch|0)}
      else if(r.k==='i'){
        if(r.c!==undefined)tg.checked=!!r.c;else if(r.ht!==undefined)tg.innerHTML=r.ht;else if(r.v!==undefined&&'value' in tg)tg.value=r.v;
        if(r.s0!=null&&tg.setSelectionRange)try{tg.setSelectionRange(r.s0,r.s1)}catch(e){}
        ev=r.y==='input'?new W.InputEvent('input',{bubbles:true,composed:true,inputType:r.it||'insertText',data:r.dd??null}):new W.Event(r.y,{bubbles:true})}
      else if(r.k==='t'){
        const mk=l=>(l||[]).map(t=>{const tt=(t.p!=null&&byPath(ctx,t.p))||tg;const pt=pointFor(ctx,t,tt,false);
          return new W.Touch({identifier:t.i,target:tt,clientX:pt.x,clientY:pt.y,pageX:pt.x+W.scrollX,pageY:pt.y+W.scrollY,screenX:pt.x,screenY:pt.y,radiusX:1,radiusY:1,force:1})});
        const tl=mk(r.tl);ev=new W.TouchEvent(r.y,{bubbles:true,cancelable:true,composed:true,view:W,touches:tl,targetTouches:tl,changedTouches:mk(r.cl),...md})}
      else{const pt=pointFor(ctx,r,tg,true);
        const init={bubbles:true,cancelable:true,composed:true,view:W,clientX:pt.x,clientY:pt.y,screenX:pt.x,screenY:pt.y,button:r.b|0,buttons:r.bs|0,detail:r.dt|0,...md};
        if(r.k==='p')ev=new W.PointerEvent(r.y,{...init,pointerId:r.id??1,pointerType:r.pt||'mouse',isPrimary:r.pr!==0,width:1,height:1,pressure:r.bs?0.5:0});
        else if(r.k==='d'){if(r.y==='dragstart'||!ctx.dt)ctx.dt=new W.DataTransfer();ev=new W.DragEvent(r.y,{...init,dataTransfer:ctx.dt})}
        else ev=new W.MouseEvent(r.y,init)}
    }catch(e){console.warn('Подію не вдалося відтворити',r.y,e);return}
    let ctl=null,got=false;const hk=()=>{got=true};
    if(r.y==='click'&&tg.closest){const lab=tg.closest('label');ctl=lab&&lab.control;if(ctl&&(ctl===tg||ctl.contains(tg)))ctl=null;if(ctl)ctl.addEventListener('click',hk,true)}
    ctx.synth++;try{tg.dispatchEvent(ev)}catch(e){console.error(e)}finally{ctx.synth--}
    if(ctl){ctl.removeEventListener('click',hk,true);if(!got&&!ev.defaultPrevented){ctx.synth++;try{ctl.click()}catch(e){}finally{ctx.synth--}}}
    if(r.y==='dragend')ctx.dt=null;
    if(ctx.tmp){const t=ctx.tmp;ctx.tmp=null;if(W.scrollX===t.ax&&W.scrollY===t.ay)try{W.scrollTo(t.sx,t.sy)}catch(e){}}}
  async function replayEntry(ctx,en,live,key){
    let evs;try{evs=JSON.parse(en.e)}catch(e){return}
    const prev=ctx.lastKey||'';ctx.lastKey=key;
    if((en.b||'')!==prev){const r0=evs.find(r=>r.f!=null);
      if(r0){const tg=byPath(ctx,r0.p);if(!tg||fp(tg)!==r0.f){
        if(en.u===o.uid&&key&&!S.skipped.has(key)){S.skipped.add(key);o.onSkipped&&o.onSkipped()}return}}}
    const t0=en.t0||0;let lastD=null;const span=evs.length?(evs[evs.length-1].d||0)-(evs[0].d||0):0,scale=span>700?700/span:1;
    for(let i=0;i<evs.length;i++){
      const r=evs[i];if(r.k==='g')continue;if(ctx.dead)return;
      ctx.dq=[];for(let j=i+1;j<evs.length&&evs[j].k==='g';j++)ctx.dq.push(evs[j]);
      if(!live)advanceTo(ctx,t0+(r.d||0));
      else{const d=r.d||0;if(lastD!==null&&S.queue.length<2){const gap=Math.min(110,(d-lastD)*scale);if(gap>6)await sleep(gap)}lastD=d;
        if(ctx.dead)return;if(r.k!=='k'&&r.k!=='i'&&r.k!=='g')cursorFromRec(en.u,r)}
      dispatch(ctx,r);
      await yieldNow()}}
  async function pumpQueue(){
    if(S.pumping||!S.ready||S.rebuilding||!S.ctx)return;S.pumping=true;
    try{
      while(S.queue.length){
        if(gestureActive())break;
        if(S.open)flush();
        S.queue.sort();const k=S.queue.shift();
        if(S.applied.has(k)||!S.known.has(k))continue;
        if(k<S.maxKey){S.queue=[];S.pumping=false;await rebuild();return}
        const en=S.known.get(k),gen=S.gen;
        S.playing=true;S.lastActor=en.u;o.onActivity&&o.onActivity(en.u);
        try{await replayEntry(S.ctx,en,true,k)}finally{S.playing=false}
        if(gen!==S.gen)return;
        S.applied.add(k);if(k>S.maxKey)S.maxKey=k;
        if(S.misses){S.misses=0;S.pumping=false;await rebuild();return}}
    }finally{S.pumping=false}}
  function requestRebuild(){if(gestureActive()||S.open){resetGesture();flush()}rebuild()}
  async function rebuild(){
    if(!S.html)return;
    if(S.rebuilding){S.needRebuild=true;return}
    S.rebuilding=true;const gen=S.gen;o.onStatus&&o.onStatus('sync');
    let ok=false;
    try{
      if(S.open){resetGesture();flush()}
      const old=S.ctx;let focus=null,sx=0,sy=0;
      if(old&&old.doc){try{const a=old.doc.activeElement;if(a&&a!==old.doc.body)focus={p:pathOf(old,a),s0:a.selectionStart,s1:a.selectionEnd};sx=old.win.scrollX;sy=old.win.scrollY}catch(e){}}
      const ctx=makeFrame(true);await ctx.ready;
      if(gen!==S.gen){ctx.dead=true;ctx.f.remove();return}
      const keys=[...S.known.keys()].sort();S.misses=0;
      ctx.lastKey='';for(const k of keys){await replayEntry(ctx,S.known.get(k),false,k);if(gen!==S.gen){ctx.dead=true;ctx.f.remove();return}}
      S.misses=0;
      goLive(ctx);
      if(old){old.dead=true;old.f.remove()}
      ctx.f.classList.remove('hidden');ctx.silent=false;S.ctx=ctx;
      try{ctx.win.scrollTo(sx,sy)}catch(e){}
      if(focus&&Array.isArray(focus.p)){const a=byPath(ctx,focus.p);if(a&&a.focus&&o.canAct()){try{a.focus({preventScroll:true});if(focus.s0!=null)a.setSelectionRange(focus.s0,focus.s1)}catch(e){}}}
      S.applied=new Set(keys);S.maxKey=keys.length?keys[keys.length-1]:'';S.lastActor=keys.length?S.known.get(keys[keys.length-1]).u:null;
      ok=true;
    }finally{S.rebuilding=false;if(gen===S.gen)o.onStatus&&o.onStatus(ok?'ok':'err')}
    if(gen!==S.gen)return;
    S.queue=[...S.known.keys()].filter(k=>!S.applied.has(k));
    if(S.needRebuild){S.needRebuild=false;return rebuild()}
    placeAll();pumpQueue()}

  function teardown(){clearTimeout(S.flushT);S.flushT=null;S.open=null;S.pend.clear();resetGesture();
    host.querySelectorAll('iframe').forEach(f=>{if(f.__ctx)f.__ctx.dead=true;f.remove()});S.ctx=null;
    S.cursors.forEach(it=>it.el.remove());S.cursors.clear()}
  return{
    async load(html,sid,t0,entries){
      S.gen++;teardown();S.html=html;S.sid=sid;S.t0=t0||now();S.seed=hashStr(sid);
      S.known=new Map(Object.entries(entries||{}));S.applied=new Set();S.maxKey='';S.queue=[];S.ready=false;S.needRebuild=false;S.rebuilding=false;S.playing=false;S.pumping=false;
      await rebuild();S.ready=true;o.onLogChange&&o.onLogChange();
      S.queue=[...S.known.keys()].filter(k=>!S.applied.has(k));pumpQueue()},
    unload(){S.gen++;teardown();S.html=null;S.sid=null;S.ready=false},
    remote(key,en){if(!en||S.known.has(key))return;S.known.set(key,en);o.onLogChange&&o.onLogChange();if(!S.ready)return;S.queue.push(key);pumpQueue()},
    /* учитель скасував дію(ї): прибираємо з журналу й перебудовуємо */
    removed(key){if(!S.known.has(key))return;S.known.delete(key);S.applied.delete(key);S.queue=S.queue.filter(k=>k!==key);o.onLogChange&&o.onLogChange();
      clearTimeout(S.rmT);S.rmT=setTimeout(()=>{S.maxKey=[...S.applied].sort().pop()||'';if(S.ready)requestRebuild()},150)},
    entries(){return[...S.known.entries()].sort((a,b)=>a[0]<b[0]?-1:1)},
    /* «Дивіться сюди»: опорний елемент у верхній третині екрана вчителя */
    anchor(){const ctx=S.ctx;if(!ctx||!ctx.doc)return null;const W=ctx.win.innerWidth,H=ctx.win.innerHeight;
      let e=ctx.doc.elementFromPoint(W/2,H*0.3);if(!e)return null;
      while(e.parentElement&&e.parentElement!==ctx.doc.body&&e.getBoundingClientRect().height<80)e=e.parentElement;
      const p=pathOf(ctx,e);if(!Array.isArray(p))return null;return{p,y:+(e.getBoundingClientRect().top/H).toFixed(3)}},
    lookAt(a){const ctx=S.ctx;if(!ctx||!ctx.doc||!a)return false;const e=byPath(ctx,a.p);if(!e)return false;const H=ctx.win.innerHeight;
      try{ctx.win.scrollBy({top:e.getBoundingClientRect().top-a.y*H,behavior:'smooth'})}catch(x){}
      setTimeout(()=>{if(S.ctx!==ctx)return;const r=e.getBoundingClientRect();if(r.height>H*0.9)return;
        const fl=el('div',{class:'lookflash',style:`left:${r.left-6}px;top:${r.top-6}px;width:${r.width+12}px;height:${r.height+12}px`});layer.append(fl);setTimeout(()=>fl.remove(),2600)},550);
      return true},
    resync(){if(S.html)requestRebuild()},
    permChanged(){if(!o.canAct()&&(S.open||gestureActive())){resetGesture();flush()}},
    setCursor,
    get sid(){return S.sid},get ctx(){return S.ctx},get busy(){return S.rebuilding||S.playing},
    _S:S
  }
}
