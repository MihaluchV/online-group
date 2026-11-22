/* Спільна практична · сторінка учня: вхід, автоповернення, присутність, рука, група
   Звичайний скрипт (не модуль): усі файли мають спільну глобальну область видимості; порядок підключення — в index.html. */
async function studentMain(){
  clear();$app.append(el('div',{class:'center'},el('div',{class:'mu'},'Завантаження…')));
  try{await initBackend('s')}catch(e){return fatal(e)}
  const sv=savedStudent(),urlR=DEMO?'DEMO':(Q.get('r')||'').trim().toUpperCase();
  if(sv&&sv.auto&&sv.ln&&sv.fn&&(!urlR||sv.r===urlR))return autoJoin(sv);
  joinScreen()}
async function doJoin(r,L,F){
  let uid;
  if(DEMO){uid=sessionStorage.getItem('collab-demo-s');if(!uid){uid='S'+Math.random().toString(36).slice(2,10);sessionStorage.setItem('collab-demo-s',uid)}}
  else{const sv=savedStudent();
    /* інший учень на тому самому пристрої отримує новий ідентифікатор (і не успадковує доступ попереднього) */
    if(BK.auth.currentUser&&sv&&(sv.ln!==L||sv.fn!==F))await BK.auth.signOut();
    if(!BK.auth.currentUser)await BK.auth.signInAnonymously();uid=BK.auth.currentUser.uid}
  ROOM=r;const o=(await RR('owner').once('value')).val();
  if(!o)return 'Кімнату з таким кодом не знайдено.';
  saveStudent({r,ln:L,fn:F,auto:true});
  studentRoom(uid,o,L,F);return null}
function autoJoin(sv){
  clear();let cancel=false;
  $app.append(el('div',{class:'center'},el('div',{class:'box'},el('h1',{},'👋 Повертаємо вас до кімнати…'),
    el('div',{},el('b',{},sv.ln+' '+sv.fn),' · кімната ',el('b',{},sv.r)),
    el('button',{class:'lnk',onclick:()=>{cancel=true;saveStudent({...sv,auto:false});joinScreen()}},'Це не я — увійти як інший учень'))));
  setTimeout(async()=>{if(cancel)return;
    try{const e=await doJoin(sv.r,sv.ln,sv.fn);if(e){saveStudent({...sv,auto:false});joinScreen(e)}}
    catch(e){console.error(e);joinScreen('Не вдалося підключитися: '+(e.message||e))}},700)}
function joinScreen(msg){
  clear();
  let room=DEMO?'DEMO':(Q.get('r')||'').trim().toUpperCase();
  const saved=savedStudent();
  const code=el('input',{type:'text',placeholder:'Код кімнати',maxlength:'8',value:room||(saved&&saved.r)||'',autocomplete:'off',style:'text-transform:uppercase;letter-spacing:.15em;font-weight:700'});
  const ln=el('input',{type:'text',placeholder:'Прізвище',autocomplete:'family-name',value:saved?saved.ln:''}),fn=el('input',{type:'text',placeholder:"Ім'я",autocomplete:'given-name',value:saved?saved.fn:''});
  const err=el('div',{class:'err'},msg||'');
  const go=async()=>{err.textContent='';const r=(room||code.value).trim().toUpperCase(),L=cap(ln.value),F=cap(fn.value);
    if(!r){err.textContent='Введіть код кімнати.';return}
    if(!NAME_OK.test(L)||!NAME_OK.test(F)){err.textContent="Введіть прізвище та ім'я українськими або латинськими літерами.";return}
    btn.disabled=true;
    try{const e=await doJoin(r,L,F);if(e){err.textContent=e;btn.disabled=false}}
    catch(e){console.error(e);err.textContent='Не вдалося підключитися: '+(e.message||e);btn.disabled=false}};
  const btn=el('button',{class:'pri',onclick:go},'Увійти');
  [code,ln,fn].forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter')go()}));
  $app.append(el('div',{class:'center'},el('div',{class:'box'},el('h1',{},'👋 Вхід до спільної практичної'),
    room?el('div',{class:'mu'},'Кімната ',el('b',{},room)):code,ln,fn,err,btn,
    el('a',{href:'?teacher'+(DEMO?'&demo':''),class:'mu'},'Вхід для вчителя'))));
  (room?(ln.value?fn:ln):code).focus()}
function studentRoom(uid,owner,L,F){
  clear();
  const D={perm:{},students:{},me:true,can:false,acting:'',hands:{},q:{},g:0,act:null};
  const nameOf=u=>u===owner?'Вчитель':(D.students[u]?D.students[u].ln+' '+D.students[u].fn:'Учень');
  const host=el('div',{class:'stage'});
  const pill=el('span',{class:'pill ro'},'👀 Перегляд'),taskT=el('span',{class:'ttl'},'Завдання'),actingTxt=el('span',{class:'mu acting-txt'}),syncB=el('span',{class:'pill warn',style:'display:none'},'⟳');
  const side=el('div',{class:'side',style:'display:none'}),main=el('div',{class:'main noside'},el('div',{class:'stagewrap'},host),side);
  const handBtn=el('button',{class:'sm hand-btn',onclick:()=>{if(D.hands[uid])RR('hands/'+uid).remove();else{RR('hands/'+uid).set(BK.TS()).catch(e=>toast(e.message,'bad'))}}},'✋ Підняти руку');
  const qInfo=el('span',{class:'qinfo'}),gBadge=el('span',{class:'gbadge',style:'display:none'});
  const updG=()=>{const on=!!(D.act&&D.act.groups);gBadge.style.display=on&&D.g?'':'none';if(on&&D.g){gBadge.textContent='🧩 Група '+D.g;gBadge.style.background=gColor(D.g)}};
  function updHand(){const up=!!D.hands[uid];handBtn.style.display=D.can?'none':'';handBtn.classList.toggle('up',up);
    handBtn.textContent=up?'✋ Опустити руку':'✋ Підняти руку';
    const order=[...Object.entries(D.hands).filter(([u])=>D.students[u]&&D.students[u].on).sort((a,b)=>a[1]-b[1]).map(x=>x[0]),
      ...(Array.isArray(D.q.l)?D.q.l:Object.values(D.q.l||{})).filter(u=>!D.hands[u]&&D.students[u]&&D.students[u].on)];
    const i=order.indexOf(uid);qInfo.textContent=D.can||i<0?'':i===0?'⏭ Ви наступний!':'У черзі: №'+(i+1)}
  const partBtn=el('button',{class:'sm',onclick:()=>{const s=side.style.display==='none';side.style.display=s?'':'none';main.classList.toggle('noside',!s);renderSide()}},'👥 Учасники');
  $app.append(el('div',{class:'app'},el('div',{class:'top'},el('span',{class:'me'},'👤 ',L+' '+F),taskT,gBadge,pill,handBtn,qInfo,syncB,actingTxt,el('span',{class:'sp'}),partBtn,
    el('button',{class:'sm',title:'Перезібрати завдання',onclick:()=>stage.resync()},'⟳'),
    el('button',{class:'sm',onclick:leave},'Вийти')),connBanner(),main));
  let at={};
  const onActivity=u=>{if(u===uid)return;actingTxt.textContent='Діє: '+nameOf(u);clearTimeout(at.t);at.t=setTimeout(()=>{actingTxt.textContent=''},3500)};
  const editorsNow=()=>Object.entries(D.students).filter(([u,v])=>v&&v.on&&canEditIn(D.perm,u)).length;
  const pickSession=a=>a.groups?((D.g&&a.groups.s&&a.groups.s['g'+D.g])||null):{sid:a.sid,at:a.at};
  const stage=connectStage(host,{uid,canAct:()=>D.can,cursorOK:()=>editorsNow()<=5,pickSession,nameOf,onActivity,onStatus:s=>{syncB.style.display=s==='sync'?'':'none'},
    onActive:a=>{D.act=a;taskT.textContent=a?a.name:'Очікування завдання';updG();renderSide()}});
  const meRef=RR('students/'+uid);let gone=false,connCb=null;const subs=Subs();
  if(DEMO){meRef.set({ln:L,fn:F,on:true,at:Date.now()});meRef.onDisconnect().update({on:false,at:Date.now()})}
  else{connCb=BK.fdb.ref('.info/connected').on('value',s=>{if(s.val()!==true||gone)return;
    meRef.update({ln:L,fn:F,on:true,at:BK.TS()}).then(()=>meRef.onDisconnect().update({on:false,at:BK.TS()}))
      .catch(e=>{console.warn(e);toast('Не вдалося зареєструватися в списку учнів: '+(e.message||e),'bad',8000)})})}
  let seen=false;
  subs.on(meRef,'value',s=>{const v=s.val();if(v){seen=true;return}if(seen&&!gone){gone=true;cleanup();const sv=savedStudent();if(sv)saveStudent({...sv,auto:false});joinScreen('Вас відключено від кімнати. Якщо вчитель змінив код — увійдіть за новим посиланням або QR-кодом.')}});
  const upd=()=>{const c=canEditIn(D.perm,uid);if(c!==D.can&&D.ready)toast(c?'✏️ Вчитель надав вам доступ: можете виконувати завдання!':'🔒 Доступ до виконання закрито. Ви бачите, що роблять інші.',c?'ok':'info',4500);
    D.can=c;D.ready=true;updHand();pill.className='pill '+(c?'ok':'ro');pill.textContent=c?'✏️ Ви можете виконувати завдання':'👀 Перегляд';stage.permChanged()};
  subs.on(RR('perm'),'value',s=>{D.perm=s.val()||{};upd();renderSide()});
  subs.on(RR('students'),'value',s=>{D.students=s.val()||{};renderSide();updHand()});
  subs.on(RR('hands'),'value',s=>{D.hands=s.val()||{};updHand();renderSide()});
  subs.on(RR('q'),'value',s=>{D.q=s.val()||{};updHand()});
  let gFirst=true;subs.on(RR('ga'),'value',s=>{D.ga=s.val()||{};const g=gnum(D.ga[uid]),ch=g!==D.g;D.g=g;updG();renderSide();
    if(ch){if(!gFirst&&D.act&&D.act.groups)toast(g?'🧩 Вас додано до групи '+g:'Вас вилучено з групи','info');stage.reapply&&stage.reapply()}gFirst=false});
  function renderSide(){if(side.style.display==='none')return;side.innerHTML='';
    const grp=!!(D.act&&D.act.groups&&D.g);
    const list=Object.entries(D.students).map(([u,v])=>({u,...v})).filter(x=>x.on&&(x.ln||x.fn)&&(!grp||x.u===uid||gnum(D.ga[x.u])===D.g)).sort((a,b)=>String(a.ln).localeCompare(String(b.ln),'uk'));
    partBtn.textContent='👥 Учасники ('+list.length+')';
    side.append(el('div',{class:'sbody'},el('div',{class:'gl'},(grp?'Група '+D.g+' · ':'')+'онлайн: '+list.length),
      ...list.map(s=>el('div',{class:'st2'},el('span',{class:'dot on'}),el('span',{class:'nm'},s.ln+' '+s.fn,s.u===uid?' (ви)':''),D.hands[s.u]?el('span',{title:'піднімає руку'},'✋'):null,canEditIn(D.perm,s.u)?el('span',{class:'badge ed'},'✏️ виконує'):el('span',{class:'badge'},'👀')))))}
  function cleanup(){gone=true;subs.off();try{if(connCb)BK.fdb.ref('.info/connected').off('value',connCb)}catch(e){}stage.dispose()}
  async function leave(){cleanup();const sv=savedStudent();if(sv)saveStudent({...sv,auto:false});
    try{await meRef.onDisconnect().cancel();await meRef.update({on:false,at:BK.TS()});await RR('cur/'+uid).remove();await RR('hands/'+uid).remove()}catch(e){}
    if(!DEMO)try{await BK.auth.signOut()}catch(e){}
    joinScreen()}}
