/* Спільна практична · кабінет учителя: вхід, кімната, учні й доступ, «До дошки», групова робота, історія, проєктор, завдання
   Звичайний скрипт (не модуль): усі файли мають спільну глобальну область видимості; порядок підключення — в index.html. */
async function teacherMain(){
  clear();$app.append(el('div',{class:'center'},el('div',{class:'mu'},'Завантаження…')));
  try{await initBackend('t')}catch(e){return fatal(e)}
  if(DEMO){let id=sessionStorage.getItem('collab-demo-t');if(!id){id='T'+Math.random().toString(36).slice(2,9);sessionStorage.setItem('collab-demo-t',id)}
    ROOM='DEMO';await RR().update({owner:id,at:Date.now()});return cabinet(id,{name:'Вчитель (демо)'})}
  let busy=false;
  BK.auth.onAuthStateChanged(async u=>{if(busy)return;if(!u||u.isAnonymous)return loginScreen();
    try{busy=true;const p=(await BK.db.ref('teachers/'+u.uid).once('value').catch(()=>null));const prof=(p&&p.val())||{};
      ROOM=await teacherRoom(u.uid);busy=false;cabinet(u.uid,{name:[prof.first,prof.middle].filter(Boolean).join(' ')||prof.login||u.email})}
    catch(e){busy=false;fatal(e)}});
  function loginScreen(){clear();
    const lg=el('input',{type:'text',placeholder:'Логін або пошта',autocomplete:'username'}),pw=el('input',{type:'password',placeholder:'Пароль',autocomplete:'current-password'}),err=el('div',{class:'err'});
    const go=async()=>{err.textContent='';const id=lg.value.trim().toLowerCase(),p=pw.value;if(!id||!p){err.textContent='Введіть логін і пароль.';return}
      btn.disabled=true;
      try{let cands=[];if(id.includes('@'))cands=[id];else{try{const m=(await BK.db.ref('logins/'+id).once('value')).val();if(m&&m.e)cands.push(m.e)}catch(e){}cands.push(id+EM)}
        let last;for(const e of cands){try{await BK.auth.signInWithEmailAndPassword(e,p);return}catch(x){last=x;if(!['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email','auth/invalid-login-credentials'].includes(x.code))throw x}}throw last}
      catch(x){err.textContent=x&&x.code==='auth/too-many-requests'?'Забагато спроб. Спробуйте за кілька хвилин.':'Неправильний логін або пароль.'}
      finally{btn.disabled=false}};
    const btn=el('button',{class:'pri',onclick:go},'Увійти');
    pw.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
    $app.append(el('div',{class:'center'},el('div',{class:'box'},el('h1',{},'🧑‍🏫 Вхід для вчителя'),
      el('div',{class:'mu'},'Логін і пароль ті самі, що й на платформі «Клас-код».'),lg,pw,err,btn,
      el('a',{href:location.pathname+(DEMO?'?demo':''),class:'mu'},'← Я учень'))));lg.focus()}}
async function teacherRoom(uid){
  let code=(await BK.db.ref('collab/owners/'+uid).once('value')).val();
  if(code){const o=(await BK.db.ref('collab/rooms/'+code+'/owner').once('value')).val();if(o===uid)return code}
  for(let i=0;i<30;i++){code=genCode();const ex=await BK.db.ref('collab/rooms/'+code+'/owner').once('value');if(ex.exists())continue;
    await BK.db.ref('collab/rooms/'+code).set({owner:uid,at:BK.TS()});await BK.db.ref('collab/owners/'+uid).set(code);return code}
  throw new Error('Не вдалося створити кімнату')}

function cabinet(uid,prof){
  clear();
  const D={active:null,meta:{},perm:{},students:{},groups:{},sel:new Set(),acting:{},tab:'st',hands:{},q:{},ga:{},gcfg:{},view:'all'};
  const projBar=el('div',{class:'projbar'}),viewBar=el('span',{class:'viewbar'});
  const gOn=()=>!!(D.active&&D.active.groups);
  const viewLabel=()=>gOn()&&D.view!=='all'&&D.active.groups.s[D.view]?'Група '+D.view.slice(1):'';
  function renderView(){viewBar.innerHTML='';if(!gOn()){if(D.view!=='all'){D.view='all';stage.reapply()}return}
    const n=D.active.groups.n,cnt=g=>Object.entries(D.ga).filter(([u,v])=>gnum(v)===g&&D.students[u]&&D.students[u].on).length;
    const b=(key,label,col)=>el('button',{class:'sm vb'+(D.view===key?' on':''),style:col?'--gc:'+col:'',onclick:()=>{D.view=key;renderView();stage.reapply();renderSide()}},label);
    viewBar.append(el('span',{class:'mu'},'Дивлюсь:'),b('all','Весь клас'),...Array.from({length:n},(_,i)=>b('g'+(i+1),'Група '+(i+1)+' ('+cnt(i+1)+')',gColor(i+1))))}
  const nameOf=u=>u===uid?'Вчитель':(D.students[u]?D.students[u].ln+' '+D.students[u].fn:'Учень');
  const host=el('div',{class:'stage'}),syncB=el('span',{class:'pill warn',style:'display:none'},'⟳ Синхронізація…');
  const actPill=el('span',{class:'pill ro'},'Завдання не відкрито');
  const actingTxt=el('span',{class:'mu acting-txt'});
  const top=el('div',{class:'top'},
    el('span',{class:'ttl'},'🤝 Спільна практична'),
    el('span',{class:'roomcode',title:'Код кімнати для учнів'},'Кімната: ',el('b',{},ROOM)),
    el('button',{class:'sm',onclick:()=>copy(studentLink(ROOM))},'🔗 Посилання для учнів'),
    el('button',{class:'sm',onclick:showQR},'▦ QR-код'),
    actPill,viewBar,syncB,actingTxt,el('span',{class:'sp'}),
    el('button',{class:'sm',title:'Прокрутити в усіх учнів завдання до того місця, яке зараз бачите ви',onclick:look},'👁 Дивіться сюди'),
    el('button',{class:'sm',title:'Режим проєктора: лише завдання на весь екран',onclick:()=>projector(true)},'📽 Проєктор'),
    el('button',{class:'sm',title:'Перезібрати завдання з журналу дій',onclick:()=>stage.resync()},'⟳'),
    el('span',{class:'mu'},prof.name||''),
    DEMO?el('button',{class:'sm',onclick:()=>{if(confirm('Очистити всі демо-дані в цьому браузері?')){localStorage.removeItem('collab-demo-db');location.reload()}}},'Скинути демо')
       :el('button',{class:'sm',onclick:()=>BK.auth.signOut().then(()=>location.reload())},'Вийти'));
  const side=el('div',{class:'side'});
  $app.append(el('div',{class:'app'},top,projBar,connBanner(),
    DEMO?el('div',{class:'demo'},'Демо-режим: дані зберігаються лише в цьому браузері. Відкрийте ',el('a',{href:studentLink(ROOM),target:'_blank'},'посилання учня'),' у кількох вкладках, щоб перевірити спільну роботу.'):null,
    el('div',{class:'main'},el('div',{class:'stagewrap'},host),side)));
  let actT={};
  const onActivity=u=>{D.acting[u]=Date.now();actingTxt.textContent='Діє: '+nameOf(u);clearTimeout(actT.t);actT.t=setTimeout(()=>{actingTxt.textContent='';renderSide()},3500);renderSideSoon()};
  const onActive=a=>{D.active=a;setTimeout(renderView,0);actPill.className='pill '+(a?'ok':'ro');actPill.textContent=a?'▶ '+a.name:'Завдання не відкрито';renderSide()};onActive.teacher=true;
  let lcT=0;const onLogChange=()=>{if(D.tab!=='hi'||lcT)return;lcT=setTimeout(()=>{lcT=0;renderSide()},250)};
  const pickSession=a=>(a.groups&&D.view!=='all'&&a.groups.s&&a.groups.s[D.view])?a.groups.s[D.view]:{sid:a.sid,at:a.at};
  const stage=connectStage(host,{uid,canAct:()=>true,nameOf,onActivity,onStatus:s=>{syncB.style.display=s==='sync'?'':'none'},onActive,onLogChange,isTeacher:true,pickSession});
  RR('ga').on('value',s=>{D.ga=s.val()||{};renderView();renderSide()});
  RR('gcfg').on('value',s=>{D.gcfg=s.val()||{};renderSide()});
  RR('meta').on('value',s=>{D.meta=s.val()||{};renderSide()});
  RR('perm').on('value',s=>{D.perm=s.val()||{};renderSide()});
  RR('students').on('value',s=>{D.students=s.val()||{};renderSide()});
  RR('groups').on('value',s=>{D.groups=s.val()||{};renderSide()});
  let handsInit=false;
  RR('hands').on('value',s=>{const v=s.val()||{};
    if(handsInit)for(const u of Object.keys(v))if(!D.hands[u])toast('✋ '+nameOf(u)+' піднімає руку','info',5000);
    handsInit=true;D.hands=v;renderSide()});
  RR('q').on('value',s=>{D.q=s.val()||{};renderSide()});
  RR('cur').on('value',s=>{const v=s.val()||{};let ch=false;for(const u of Object.keys(v)){if(u!==uid){D.acting[u]=Date.now();ch=true}}if(ch)renderSideSoon()});
  setInterval(renderSideSoon,4000);
  /* Прибирання: учні, яких немає в мережі понад добу, застарілі курсори й зайві дозволи */
  const DAY=24*3600e3;
  async function tidy(){try{
    const st=(await RR('students').once('value')).val()||{},pm=(await RR('perm/u').once('value')).val()||{},cu=(await RR('cur').once('value')).val()||{};
    const t=sNow(),upd={};
    for(const[u,v]of Object.entries(st))if(!v||(!v.on&&(!v.at||t-v.at>DAY))){upd['students/'+u]=null;upd['perm/u/'+u]=null;upd['cur/'+u]=null;upd['hands/'+u]=null;upd['ga/'+u]=null}
    const hs=(await RR('hands').once('value')).val()||{};for(const u of Object.keys(hs))if(!st[u])upd['hands/'+u]=null;
    for(const u of Object.keys(pm))if(!st[u]||upd['students/'+u]===null)upd['perm/u/'+u]=null;
    for(const[u,c]of Object.entries(cu))if(!c||!c.t||t-c.t>60e3)upd['cur/'+u]=null;
    if(Object.keys(upd).length)await RR().update(upd)}catch(e){console.warn('tidy',e)}}
  setTimeout(tidy,5000);setInterval(tidy,30*60e3);
  function showQR(){const url=studentLink(ROOM);
    modal('Підключення учнів',el('div',{class:'qr',html:qrSvg(url)}),el('div',{class:'qrcode-big'},ROOM),el('div',{class:'mu',style:'word-break:break-all;text-align:center'},url),
      el('div',{class:'row',style:'justify-content:center'},el('button',{onclick:()=>copy(url)},'🔗 Скопіювати посилання'),
        DEMO?null:el('button',{class:'cx',onclick:changeCode},'🔄 Змінити код кімнати')))}
  async function changeCode(){
    if(!confirm('Створити новий код кімнати?\n\nСтаре посилання і QR-код перестануть працювати, підключених учнів буде відключено — їм потрібно буде увійти за новим посиланням.\nЗавдання, їхній поступ і групи збережуться.'))return;
    try{const old=ROOM,data=(await RR().once('value')).val()||{};
      let code='';for(let i=0;i<30;i++){const c=genCode();if(!(await BK.db.ref('collab/rooms/'+c+'/owner').once('value')).exists()){code=c;break}}
      if(!code)throw new Error('не вдалося підібрати вільний код');
      delete data.students;delete data.cur;data.owner=uid;
      await BK.db.ref('collab/rooms/'+code).set(data);
      await BK.db.ref('collab/owners/'+uid).set(code);
      await BK.db.ref('collab/rooms/'+old).remove();
      toast('Новий код кімнати: '+code,'ok');setTimeout(()=>location.reload(),900)}
    catch(e){toast('Не вдалося змінити код: '+(e.message||e),'bad',7000)}}
  let rs=0;function renderSideSoon(){if(rs)return;rs=requestAnimationFrame(()=>{rs=0;renderSide()})}
  let focusKeep=null;
  function renderSide(){renderProj();
    const fk=side.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
    const sc=side.querySelector('.sbody');const keep=sc?sc.scrollTop:0;
    side.innerHTML='';
    const list=Object.entries(D.students).map(([u,v])=>({u,...v})).filter(x=>x.ln||x.fn)
      .sort((a,b)=>(b.on?1:0)-(a.on?1:0)||String(a.ln).localeCompare(String(b.ln),'uk')||String(a.fn).localeCompare(String(b.fn),'uk'));
    for(const u of[...D.sel])if(!D.students[u])D.sel.delete(u);
    const online=list.filter(x=>x.on).length,editors=list.filter(x=>canEditIn(D.perm,x.u)).length;
    side.append(el('div',{class:'tabsb'},
      el('button',{class:D.tab==='st'?'on':'',onclick:()=>{D.tab='st';renderSide()}},'👥 Учні (',String(online),')',Object.keys(D.hands).length?' ✋'+Object.keys(D.hands).length:''),
      el('button',{class:D.tab==='hi'?'on':'',onclick:()=>{D.tab='hi';renderSide()}},'🕘 Історія'),
      el('button',{class:D.tab==='tk'?'on':'',onclick:()=>{D.tab='tk';renderSide()}},'📄 Завдання')));
    const body=el('div',{class:'sbody'});side.append(body);
    if(D.tab==='tk')renderTasks(body);else if(D.tab==='hi')renderHistory(body);else renderStudents(body,list,online,editors);
    body.scrollTop=keep;if(fk){const f=[...side.querySelectorAll('[aria-label]')].find(x=>x.getAttribute('aria-label')===fk);if(f)f.focus({preventScroll:true})}}
  /* ---------- Історія дій і скасування ---------- */
  function describe(en){let ev;try{ev=JSON.parse(en.e)}catch(e){return'дія'}
    const f=(ev.find(r=>r.f)||{}).f,txt=f?f.split(':').slice(1).join(':').trim().slice(0,32):'',q=txt?' «'+txt+'»':'';
    const has=t=>ev.some(r=>r.y===t),inp=ev.filter(r=>r.k==='i');
    if(inp.length){const l=inp[inp.length-1];if(l.c!==undefined)return(l.c?'☑ позначка':'☐ зняв позначку')+q;
      const v=String(l.v??(l.ht?'текст':'')).replace(/\s+/g,' ');return'⌨ введення: «'+(v.length>34?'…'+v.slice(-34):v)+'»'}
    if(has('drop')||ev.filter(r=>/move|dragover/.test(r.y)).length>2)return'✋ перетягування'+q;
    if(has('click')||has('pointerdown')||has('touchstart'))return'👆 клацання'+q;
    if(ev.some(r=>r.k==='k'))return'⌨ клавіші';return'дія'}
  function renderHistory(body){
    const a=D.active;if(!a){body.append(el('div',{class:'mu'},'Завдання не відкрито.'));return}
    const all=stage.entries(),list=all.slice(-60).reverse();
    body.append(el('div',{class:'mu'},'Дії в завданні «'+a.name+'»'+(viewLabel()?' — '+viewLabel():gOn()?' — весь клас':'')+', нові зверху. ',el('b',{},'↶'),' скасовує одну дію, ',el('b',{},'⤺'),' повертає завдання до стану перед цією дією (скасовує її та всі пізніші). Зміни бачать усі.'));
    if(!list.length){body.append(el('div',{class:'mu',style:'padding:8px 0'},'Ще ніхто нічого не робив.'));return}
    const rm=keys=>{const upd={};keys.forEach(k=>upd['log/'+stage.sid+'/'+k]=null);return RR().update(upd).then(()=>toast('↶ Скасовано дій: '+keys.length,'ok')).catch(e=>toast(e.message,'bad'))};
    const ul=el('div',{class:'hist'});
    for(const[k,en]of list){const t=new Date(parseInt(k.slice(0,9),36));
      const idx=all.findIndex(x=>x[0]===k),after=all.slice(idx).map(x=>x[0]);
      ul.append(el('div',{class:'hrow'},el('span',{class:'ht'},t.toLocaleTimeString('uk-UA')),
        el('span',{class:'hn'},el('b',{style:'color:'+colorOf(en.u)},nameOf(en.u)),el('span',{class:'hd'},describe(en))),
        el('button',{class:'sm',title:'Скасувати лише цю дію',onclick:()=>{if(confirm('Скасувати цю дію ('+nameOf(en.u)+')?'))rm([k])}},'↶'),
        el('button',{class:'sm',title:'Повернути завдання до стану перед цією дією',onclick:()=>{if(confirm('Повернути завдання до стану перед цією дією?\nБуде скасовано дій: '+after.length+'.'))rm(after)}},'⤺')))}
    body.append(ul);
    if(all.length>60)body.append(el('div',{class:'mu'},'Показано останні 60 з '+all.length+'.'))}
  /* ---------- «Дивіться сюди» ---------- */
  let lookN=0;
  function look(){const a=D.active,an=stage.anchor();if(!a||!an){toast('Спершу відкрийте завдання.','info');return}
    RR('look').set({...an,sid:stage.sid,n:Date.now().toString(36)+(++lookN)}).then(()=>toast('👁 Учням показано це місце','ok',2000))}
  /* ---------- Режим проєктора ---------- */
  function projector(on){const app=$app.querySelector('.app');if(!app)return;app.classList.toggle('proj',on);
    try{if(on&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});if(!on&&document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch(e){}
    renderProj()}
  function renderProj(){const app=$app.querySelector('.app');if(!app||!app.classList.contains('proj'))return;
    const eds=Object.keys(D.students).filter(u=>D.students[u].on&&canEditIn(D.perm,u)).map(nameOf),hn=Object.keys(D.hands).length;
    projBar.innerHTML='';projBar.append(...[el('span',{class:'pr-room'},'Кімната ',el('b',{},ROOM)),el('span',{class:'pr-task'},D.active?D.active.name:''),viewLabel()?el('span',{class:'pr-grp',style:'background:'+gColor(+D.view.slice(1))},viewLabel()):null,
      el('span',{class:'pr-ed'},D.perm.all?'✏️ Виконують усі':eds.length?'✏️ Виконує: '+eds.join(', '):'👀 Усі дивляться'),
      hn?el('span',{class:'pr-hands'},'✋ '+hn):null,el('span',{class:'sp'}),
      el('button',{class:'sm',onclick:look,title:'Прокрутити в усіх учнів до цього місця'},'👁'),
      el('button',{class:'sm',onclick:()=>projector(false)},'✕ Вийти з режиму проєктора')].filter(Boolean))}
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){const app=$app.querySelector('.app');if(app&&app.classList.contains('proj'))renderProj()}});
  /* ---------- «До дошки»: руки, черга, наступний ---------- */
  const isOn=u=>D.students[u]&&D.students[u].on;
  const qList=()=>(Array.isArray(D.q.l)?D.q.l:Object.values(D.q.l||{})).filter(u=>D.students[u]);
  const handOrder=()=>Object.entries(D.hands).filter(([u])=>D.students[u]).sort((a,b)=>a[1]-b[1]).map(x=>x[0]);
  function giveTurn(u){const l=qList().filter(x=>x!==u);
    return RR().update({perm:{all:false,u:{[u]:true}},['hands/'+u]:null,'q/l':l.length?l:null,['q/d/'+u]:true,'q/c':u})
      .then(()=>toast('✏️ До дошки: '+nameOf(u),'ok')).catch(e=>toast(e.message,'bad'))}
  function nextTurn(){const c=[...handOrder(),...qList()].filter(u=>isOn(u)&&u!==D.q.c);
    if(!c.length){toast('Черга порожня. Натисніть «🎲 Випадковий» або складіть чергу.','info');return}giveTurn(c[0])}
  function randomTurn(){const on=Object.keys(D.students).filter(u=>isOn(u)&&u!==D.q.c);if(!on.length){toast('Немає учнів онлайн.','info');return}
    let pool=on.filter(u=>!(D.q.d||{})[u]);if(!pool.length){RR('q/d').remove();pool=on}
    giveTurn(pool[Math.floor(Math.random()*pool.length)])}
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  function queueBox(list){
    const cur=D.q.c&&canEditIn(D.perm,D.q.c)?D.q.c:null,hands=handOrder(),q=qList().filter(u=>!D.hands[u]),done=Object.keys(D.q.d||{}).filter(u=>D.students[u]).length;
    const row=(u,i,isHand)=>el('div',{class:'qrow'+(isOn(u)?'':' off')},el('span',{class:'qn'},isHand?'✋':(hands.length+i+1)+'.'),el('span',{class:'nm'},nameOf(u),isOn(u)?'':' (не в мережі)'),
      el('button',{class:'sm ok',title:'Дати доступ лише цьому учневі',onclick:()=>giveTurn(u)},'▶'),
      el('button',{class:'sm cx',title:isHand?'Опустити руку':'Прибрати з черги',onclick:()=>isHand?RR('hands/'+u).remove():RR('q/l').set(qList().filter(x=>x!==u))},'×'));
    return el('div',{class:'grp qbox'},el('div',{class:'gl'},'🎯 До дошки'),
      cur?el('div',{class:'qcur'},'Зараз виконує: ',el('b',{},nameOf(cur))):el('div',{class:'mu'},'Зараз ніхто не виконує окремо.'),
      el('div',{class:'row'},
        el('button',{class:'sm pri',onclick:nextTurn,title:'Доступ отримає перший, хто підняв руку, або наступний у черзі; у решти доступ закриється'},'▶ Наступний'),
        el('button',{class:'sm',onclick:randomTurn,title:'Випадковий учень онлайн, який ще не був біля дошки'},'🎲 Випадковий'),
        el('button',{class:'sm',disabled:!cur&&!editorsAny(),onclick:()=>RR().update({perm:{all:false},'q/c':null})},'⏹ Завершити хід')),
      (hands.length||q.length)?el('div',{class:'qlist'},...hands.map((u,i)=>row(u,i,true)),...q.map((u,i)=>row(u,i,false))):el('div',{class:'mu'},'Черга порожня. Учні можуть піднімати руку ✋.'),
      el('div',{class:'row'},el('span',{class:'mu'},'Скласти чергу:'),
        el('button',{class:'sm lnk',onclick:()=>{const l=shuffle(list.filter(x=>x.on&&x.u!==cur).map(x=>x.u));if(l.length)RR('q/l').set(l)}},'🎲 з усіх онлайн'),
        el('button',{class:'sm lnk',disabled:!D.sel.size,onclick:()=>{const l=list.filter(x=>D.sel.has(x.u)).map(x=>x.u);RR('q/l').set(l)}},'з вибраних'),
        q.length?el('button',{class:'sm lnk',onclick:()=>RR('q/l').remove()},'очистити'):null),
      done?el('div',{class:'mu'},'Уже були біля дошки: '+done+' ',el('button',{class:'sm lnk',onclick:()=>RR('q/d').remove()},'почати коло заново')):null)}
  /* ---------- Групова робота ---------- */
  function groupBox(list){
    const n=D.gcfg.n||0,on=gOn(),onl=list.filter(x=>x.on);
    const cnt=g=>onl.filter(x=>gnum(D.ga[x.u])===g).length,none=onl.filter(x=>!(gnum(D.ga[x.u])>=1&&gnum(D.ga[x.u])<=n)).length;
    const sel=el('select',{class:'gsel','aria-label':'Кількість груп',disabled:on||null},el('option',{value:'0'},'—'),...[2,3,4,5,6].map(k=>el('option',{value:k},k+(k<5?' групи':' груп'))));
    sel.value=String(n);sel.onchange=()=>{const k=+sel.value;RR('gcfg').set(k?{n:k}:null);if(!k)RR('ga').remove()};
    const box=el('div',{class:'grp gbox'},el('div',{class:'gl'},'🧩 Групова робота'),
      el('div',{class:'row'},el('span',{class:'mu'},'Кількість:'),sel,
        n?el('button',{class:'sm',onclick:()=>randomGroups(onl,n)},'🎲 Розподілити випадково'):null,
        n&&Object.keys(D.ga).length&&!on?el('button',{class:'sm lnk',onclick:()=>RR('ga').remove()},'скинути'):null));
    if(n){box.append(el('div',{class:'row'},...Array.from({length:n},(_,i)=>el('span',{class:'gchip',style:'--gc:'+gColor(i+1)},'Група '+(i+1)+': '+cnt(i+1))),
        none?el('span',{class:'mu'},'без групи: '+none):null),
      el('div',{class:'mu'},'Щоб розподілити вручну, виберіть групу біля імені учня в списку нижче.'),
      on?el('button',{class:'sm',onclick:stopGroups},'⏹ Завершити групову роботу'):el('button',{class:'sm pri',onclick:()=>startGroups(onl,n,none)},'▶ Почати роботу в групах'))}
    else box.append(el('div',{class:'mu'},'Виберіть кількість груп, і кожна група отримає власну копію відкритого завдання.'));
    return box}
  function randomGroups(onl,n){const l=shuffle(onl.map(x=>x.u)),upd={};l.forEach((u,i)=>upd[u]='g'+((i%n)+1));
    for(const u of Object.keys(D.ga))if(!(u in upd)&&!(D.students[u]&&D.students[u].on))upd[u]=null;
    RR('ga').update(upd).then(()=>toast('🎲 Учнів розподілено на '+n+' групи','ok'))}
  async function startGroups(onl,n,none){const a=D.active;if(!a){toast('Спершу відкрийте завдання (вкладка «Завдання»).','info');return}
    if(none&&!confirm(none+' учн. без групи бачитимуть лише «Зачекайте». Почати?'))return;
    const m=D.meta[a.tid]||{},gs={...(m.gs||{})},t=Math.floor(sNow());
    for(let g=1;g<=n;g++)if(!gs['g'+g])gs['g'+g]={sid:newSid()+g,at:t};
    const s={};for(let g=1;g<=n;g++)s['g'+g]=gs['g'+g];
    await RR().update({['meta/'+a.tid+'/gs']:gs,'active/groups':{n,s},perm:{all:true},'q/c':null});
    toast('▶ Групова робота почалась: кожна група працює у своїй копії','ok')}
  function stopGroups(){if(!confirm('Завершити групову роботу? Учні повернуться до спільного завдання класу. Роботи груп збережуться.'))return;
    D.view='all';RR('active/groups').remove()}
  const editorsAny=()=>Object.keys(D.students).some(u=>canEditIn(D.perm,u));
  function renderStudents(body,list,online,editors){
    const selN=D.sel.size;const selArr=[...D.sel];
    const setPerm=v=>RR().update({perm:v,'q/c':null}).catch(e=>toast(e.message,'bad'));
    body.append(
      el('div',{class:'stat'},'Онлайн: ',el('b',{},String(online)),' з ',String(list.length),' · Виконують: ',el('b',{},String(editors)),D.perm.all?el('span',{class:'badge ed'},'доступ усім'):null),
      groupBox(list),
      queueBox(list),
      el('div',{class:'grp'},el('div',{class:'gl'},'Доступ для всіх'),el('div',{class:'row'},
        el('button',{class:'sm ok',onclick:()=>setPerm({all:true})},'✏️ Усім учням'),
        el('button',{class:'sm',onclick:()=>setPerm({all:false})},'🔒 Нікому'))),
      el('div',{class:'grp'},el('div',{class:'gl'},'Вибрані учні: ',el('b',{},String(selN))),el('div',{class:'row'},
        el('button',{class:'sm ok',disabled:!selN,title:'Доступ матимуть лише вибрані',onclick:()=>{const u={};selArr.forEach(x=>u[x]=true);setPerm({all:false,u})}},'✏️ Лише вибраним'),
        el('button',{class:'sm',disabled:!selN,title:'Додати доступ вибраним, не забираючи в інших',onclick:()=>{const u={};selArr.forEach(x=>u[x]=true);RR('perm/u').update(u)}},'＋ Додати'),
        el('button',{class:'sm',disabled:!selN,onclick:()=>{const u={};selArr.forEach(x=>u[x]=false);RR('perm/u').update(u)}},'🔒 Забрати')),
        el('div',{class:'row'},
        el('button',{class:'sm lnk',onclick:()=>{list.filter(x=>x.on).forEach(x=>D.sel.add(x.u));renderSide()}},'☑ вибрати всіх онлайн'),
        el('button',{class:'sm lnk',disabled:!selN,onclick:()=>{D.sel.clear();renderSide()}},'✕ зняти вибір'))));
    const gl=Object.entries(D.groups);
    const gbox=el('div',{class:'grp'},el('div',{class:'gl'},'Набори учнів'));
    const chips=el('div',{class:'row'});
    for(const[gid,g]of gl){const m=g.m||{};const mem=list.filter(x=>m[nkey(x.ln,x.fn)]);const on=mem.filter(x=>x.on).length;
      chips.append(el('span',{class:'chip'},el('button',{class:'cb',title:'Вибрати учнів набору: '+Object.values(m).join(', '),onclick:()=>{D.sel.clear();mem.forEach(x=>D.sel.add(x.u));renderSide()}},g.name,' ',el('small',{},on+'/'+Object.keys(m).length)),
        el('button',{class:'cx',title:'Видалити набір',onclick:()=>{if(confirm('Видалити набір «'+g.name+'»?'))RR('groups/'+gid).remove()}},'×')))}
    if(!gl.length)chips.append(el('span',{class:'mu'},'Виберіть учнів і збережіть їх як набір, щоб наступного разу вибрати одним кліком.'));
    gbox.append(chips,el('div',{class:'row'},el('button',{class:'sm',disabled:!selN,onclick:()=>{
      const nm=(prompt('Назва набору:','Набір '+(gl.length+1))||'').trim();if(!nm)return;const m={};
      selArr.forEach(x=>{const s=D.students[x];if(s)m[nkey(s.ln,s.fn)]=s.ln+' '+s.fn});RR('groups/g'+Date.now().toString(36)).set({name:nm.slice(0,40),m})}},'＋ Набір з вибраних')));
    body.append(gbox);
    const ul=el('div',{class:'stlist'});
    if(!list.length)ul.append(el('div',{class:'mu',style:'padding:8px'},'Учні ще не підключилися. Дайте їм посилання або QR-код кімнати ',el('b',{},ROOM),'.'));
    for(const s of list){const ed=canEditIn(D.perm,s.u),act=D.acting[s.u]&&Date.now()-D.acting[s.u]<4000;
      const cb=el('input',{type:'checkbox','aria-label':'Вибрати '+s.ln+' '+s.fn});cb.checked=D.sel.has(s.u);
      cb.onchange=()=>{cb.checked?D.sel.add(s.u):D.sel.delete(s.u);renderSide()};
      ul.append(el('div',{class:'st'+(D.sel.has(s.u)?' sel':'')+(s.on?'':' off')},cb,el('span',{class:'dot'+(s.on?' on':''),title:s.on?'онлайн':'не в мережі'}),
        el('span',{class:'nm',onclick:()=>{D.sel.has(s.u)?D.sel.delete(s.u):D.sel.add(s.u);renderSide()}},s.ln+' '+s.fn,D.hands[s.u]?el('span',{class:'hand',title:'піднімає руку'},' ✋'):null,act?el('span',{class:'acting',title:'діє зараз'},' ✍️'):null),
        (D.gcfg.n?(()=>{const g=gnum(D.ga[s.u]),gs=el('select',{class:'gpick','aria-label':'Група учня '+s.ln+' '+s.fn,style:g?'--gc:'+gColor(g):''},el('option',{value:'0'},'—'),...Array.from({length:D.gcfg.n},(_,i)=>el('option',{value:i+1},'Г'+(i+1))));
          gs.value=String(g);gs.onchange=()=>RR('ga/'+s.u).set(+gs.value?'g'+gs.value:null);return gs})():el('span')),
        el('button',{class:'sm tg '+(ed?'ok':''),title:ed?'Забрати доступ':'Надати доступ',onclick:()=>{RR('perm/u/'+s.u).set(!ed);if(!ed)RR('hands/'+s.u).remove()}},ed?'✏️ виконує':'👀 дивиться'),
        el('button',{class:'sm cx',title:'Відключити учня',onclick:()=>{if(confirm('Відключити '+s.ln+' '+s.fn+'?')){RR('students/'+s.u).remove();RR('perm/u/'+s.u).remove();RR('cur/'+s.u).remove();RR('hands/'+s.u).remove()}}},'×')))}
    body.append(ul);
    if(list.some(x=>!x.on))body.append(el('button',{class:'sm lnk',onclick:()=>{list.filter(x=>!x.on).forEach(x=>{RR('students/'+x.u).remove();RR('perm/u/'+x.u).remove()})}},'🧹 Прибрати зі списку тих, хто не в мережі'))}
  function renderTasks(body){
    const inp=el('input',{type:'file',accept:'.html,.htm,text/html',multiple:true,style:'display:none'});
    inp.onchange=async()=>{for(const f of inp.files){if(f.size>3e6){toast('Файл «'+f.name+'» завеликий (понад 3 МБ).','bad');continue}
      const text=await f.text();const tid='t'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
      try{await RR('html/'+tid).set(text);await RR('meta/'+tid).set({name:f.name.replace(/\.html?$/i,'').slice(0,80),size:text.length,at:Date.now()});toast('Завантажено: '+f.name,'ok')}
      catch(e){toast('Не вдалося зберегти: '+e.message,'bad')}}inp.value=''};
    body.append(inp,el('button',{class:'pri',onclick:()=>inp.click()},'📤 Завантажити завдання (HTML-файл)'),
      el('div',{class:'mu'},'Завдання — це звичайна HTML-сторінка (як ваші тренажери). Усі підключені бачать одну спільну копію: кожна дія того, хто має доступ, одразу видна всім.'));
    const a=D.active;
    if(a)body.append(el('div',{class:'row'},el('button',{class:'sm',onclick:()=>RR('active').set(null)},'⏹ Закрити завдання'),
      el('button',{class:'sm',onclick:()=>restart(a.tid)},'⟲ Почати заново')));
    const arr=Object.entries(D.meta).sort((x,y)=>(y[1].at||0)-(x[1].at||0));
    if(!arr.length)body.append(el('div',{class:'mu',style:'padding:6px 0'},'Ще немає завантажених завдань.'));
    for(const[tid,m]of arr){const act=a&&a.tid===tid;
      body.append(el('div',{class:'task'+(act?' act':'')},
        el('div',{class:'tn'},act?'🟢 ':'',m.name),
        el('div',{class:'mu'},Math.round((m.size||0)/1024)+' КБ'+(m.sid?' · є збережений поступ':'')),
        el('div',{class:'row'},
          act?el('span',{class:'badge ed'},'відкрито для всіх'):el('button',{class:'sm pri',onclick:()=>openTask(tid)},'▶ Відкрити для всіх'),
          m.sid?el('button',{class:'sm',onclick:()=>restart(tid)},'⟲ Почати заново'):null,
          el('button',{class:'sm',onclick:()=>{const n=(prompt('Нова назва:',m.name)||'').trim();if(n)RR('meta/'+tid+'/name').set(n.slice(0,80)).then(()=>{if(act)RR('active/name').set(n.slice(0,80))})}},'✏️'),
          el('button',{class:'sm cx',title:'Видалити',onclick:()=>delTask(tid)},'🗑'))))}}
  async function openTask(tid){const m=D.meta[tid];if(!m)return;let sid=m.sid,sat=m.sat;D.view='all';
    if(!sid){sid=newSid();sat=Math.floor(sNow());await RR('meta/'+tid).update({sid,sat})}
    await RR('active').set({tid,sid,at:sat,name:m.name});toast('Завдання відкрито для всіх','ok')}
  async function restart(tid){const m=D.meta[tid];if(!m)return;
    if(!confirm('Почати «'+m.name+'» заново? Усі дії в цьому завданні (і в роботах груп) буде стерто для всіх.'))return;
    const old=m.sid,sid=newSid(),sat=Math.floor(sNow()),oldG=m.gs||{},gs={};
    for(const k of Object.keys(oldG))gs[k]={sid:newSid()+k.slice(1),at:sat};
    await RR('meta/'+tid).update({sid,sat,gs:Object.keys(gs).length?gs:null});
    const a=D.active;
    if(a&&a.tid===tid){const na={tid,sid,at:sat,name:m.name};if(a.groups){const s2={};for(const k of Object.keys(a.groups.s||{}))s2[k]=gs[k]||{sid:newSid()+k.slice(1),at:sat};na.groups={n:a.groups.n,s:s2}}
      await RR('active').set(na)}
    if(old)RR('log/'+old).remove();for(const v of Object.values(oldG))if(v&&v.sid)RR('log/'+v.sid).remove()}
  async function delTask(tid){const m=D.meta[tid];if(!m)return;if(!confirm('Видалити завдання «'+m.name+'» разом із поступом?'))return;
    if(D.active&&D.active.tid===tid)await RR('active').set(null);
    if(m.sid)await RR('log/'+m.sid).remove();for(const v of Object.values(m.gs||{}))if(v&&v.sid)await RR('log/'+v.sid).remove();await RR('html/'+tid).remove();await RR('meta/'+tid).remove()}
  renderSide()}
