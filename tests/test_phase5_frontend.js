// No dependencies: real app actions with a durable helper-contract test double.
// Browser IndexedDB transactions/reload are additionally covered by the manual procedure.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'frontend/app.js'),'utf8');
const content=JSON.parse(fs.readFileSync(path.join(root,'data/content.json'),'utf8'));
const copy=x=>structuredClone(x);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const ok=body=>({ok:true,status:200,json:async()=>copy(body)});

function database(){
 const cards=new Map(),ops=new Map(),history=[];
 const db={cards,ops,history,
  openOfflineDB:async()=>({close(){}}),
  getLocalPostcards:async()=>copy([...cards.values()]),
  getLocalPostcard:async id=>copy(cards.get(id)||null),
  saveLocalPostcard:async(c,op)=>{history.push(['save',c.id,c.sync_status]);cards.set(c.id,copy(c));if(op)await db.enqueueOperation(op);return copy(c)},
  enqueueOperation:async op=>{history.push(['enqueue',op.entity_id]);ops.set(op.id,copy(op));return copy(op)},
  getPendingOperations:async()=>copy([...ops.values()].filter(o=>['pending','syncing'].includes(o.status))),
  updateOperation:async op=>{ops.set(op.id,copy(op));return copy(op)},
  markOperationFailed:async(id,e,permanent)=>{const o=ops.get(id);o.status=permanent?'failed_permanent':'pending';o.attempts++;o.last_error=e.message;return copy(o)},
  removeOperation:async id=>ops.delete(id),
  clearOfflineData:async()=>{cards.clear();ops.clear()}
 };
 return db;
}
async function app({db=database(),online=false,stored=new Map(),handler,api='https://backend.test',cachedShell=false,voices=[{lang:'id-ID',name:'Indonesian'},{lang:'es-ES',name:'Spanish'},{lang:'en-US',name:'English'}]}={}){
 const nodes=new Map(),calls=[],events={},intervals=[],timers=new Map(),errors=[],spoken=[],played=[];let timerId=0;
 const node=k=>{if(!nodes.has(k))nodes.set(k,{style:{},innerHTML:'',textContent:'',value:'',className:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)}});return nodes.get(k)};
 class BrowserAudio{
  constructor(url){this.url=url;this.listeners={}}
  addEventListener(name,fn){this.listeners[name]=fn}
  pause(){this.paused=true}
  play(){played.push(this.url);return Promise.resolve().then(()=>this.listeners.ended&&this.listeners.ended())}
 }
 const context=vm.createContext({
  window:{YOLO_OFFLINE_DB:db,YOLO_CONFIG:{api},YOLO_CONTENT:cachedShell?null:copy(content),caches:cachedShell?{match:async()=>ok(content)}:undefined,crypto:webcrypto,addEventListener:(n,fn)=>events[n]=fn},
    SpeechSynthesisUtterance:function(text){this.text=text;this.lang="";this.rate=1},
  speechSynthesis:{getVoices:()=>voices,cancel(){},speak:utterance=>spoken.push({text:utterance.text,lang:utterance.lang,rate:utterance.rate,voice:utterance.voice&&utterance.voice.name})},
  Audio:BrowserAudio,URL:{createObjectURL:()=>`blob:tts-${played.length+1}`,revokeObjectURL:()=>{}},
  navigator:{onLine:online},document:{querySelector:k=>k==='#msg'?null:node(k),querySelectorAll:()=>[],addEventListener:()=>{},activeElement:null},
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},AbortController,
  console:{error:(...v)=>errors.push(v),warn:(...v)=>errors.push(v)},
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),
  fetch:async(url,options={})=>{const p=new URL(url).pathname;calls.push({path:p,...options});db.history.push(['fetch',p]);
   if(handler){const r=await handler(p,options);if(r)return r}
   return ok({});
  }
 });
 vm.runInContext(source,context);const run=s=>vm.runInContext(s,context);
 await settle();await run('syncPromise');
 return {db,stored,context,node,run,calls,events,intervals,timers,errors,spoken,played,selectLanguage:language=>run(`A.lang({dataset:{lang:${JSON.stringify(language)}}})`),
  create:async(text='I loved roasting coffee.')=>{run(`S.draft.t=${JSON.stringify(text)}`);await run('A.send()')},
  posts:()=>calls.filter(c=>c.path==='/api/postcards'),
  connect:async()=>{context.navigator.onLine=true;await events.online()},
  disconnect:()=>{context.navigator.onLine=false;events.offline()}
 };
}

test('offline creation atomically saves content and a stable UUID operation before showing success',async()=>{
 const a=await app();await a.create();
 const c=[...a.db.cards.values()][0],op=[...a.db.ops.values()][0];
 assert.match(c.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(c.id,op.entity_id);assert.equal(c.id,op.payload.id);
 assert.equal(op.type,'postcard.create');assert.equal(op.status,'pending');assert.equal(op.attempts,0);
 assert.equal(c.sync_status,'pending');assert.equal(c.t,'I loved roasting coffee.');
 assert.equal(a.run('S.mine.length'),1);assert.equal(a.posts().length,0);
 assert.match(a.node('#view').innerHTML,/I loved roasting coffee\.|Waiting to sync/);
 assert.deepEqual(a.db.history.map(x=>x[0]),['save','enqueue']);
 assert.equal(a.run('outbox().some(o=>o[0]==="postcards")'),false);
});

test('offline reload restores IndexedDB even without localStorage, then reconnect POSTs and reconciles once',async()=>{
 const db=database(),first=await app({db});await first.create();const id=[...db.cards.keys()][0];
 let remote={};
 const a=await app({db,handler:async(p,o)=>{
  if(p==='/api/postcards'){const payload=JSON.parse(o.body);remote[payload.id]=payload;return ok({ok:true})}
  if(p==='/api/sync')return ok({postcards:remote});
 }});
 assert.equal(a.run('S.mine[0].id'),id);assert.equal(a.run('S.mine[0].status'),'pending');
 assert.equal(a.calls.length,0);
 a.run('go("story")');assert.match(a.node('#view').innerHTML,new RegExp(id));
 await a.connect();
 assert.equal(a.posts().length,1);assert.equal(JSON.parse(a.posts()[0].body).id,id);
 assert.equal(a.posts()[0].method,'POST');assert.equal(db.ops.size,0);
 assert.equal(db.cards.get(id).sync_status,'synced');assert.equal(a.run('S.mine.length'),1);
 assert.equal(a.run('S.mine[0].status'),'sent');
 assert.deepEqual(a.calls.map(c=>c.path),['/api/postcards','/api/sync']);
 const again=await app({db,stored:a.stored,online:true,handler:async p=>p==='/api/sync'?ok({postcards:remote}):null});
 assert.equal(again.run('S.mine.length'),1);assert.equal(again.posts().length,0);
});

test('online creation saves locally before POST and accepts an empty 204 response',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/postcards'?{ok:true,status:204,json:()=>assert.fail('204 has no JSON body')}:null});
 a.db.history.length=0;await a.create();await a.run('flushPromise');
 const steps=a.db.history.map(x=>x[0]);assert.ok(steps.indexOf('save')<steps.indexOf('fetch'));
 assert.ok(steps.indexOf('enqueue')<steps.indexOf('fetch'));
 assert.equal(a.posts().length,1);assert.equal(a.db.ops.size,0);assert.equal(a.run('S.mine[0].sync_status'),'synced');
});

test('cached shell content boots and hydrates offline without fetching any network resource',async()=>{
 const first=await app();await first.create();
 const a=await app({db:first.db,cachedShell:true,handler:()=>assert.fail('Network required for offline boot')});
 assert.equal(a.run('bootReady'),true);assert.equal(a.run('S.mine.length'),1);assert.equal(a.calls.length,0);
});

test('permanent failure survives reload and is never automatically retried',async()=>{
 const a=await app({handler:async p=>p==='/api/postcards'?{ok:false,status:403}:null});await a.create();await a.connect();
 const b=await app({db:a.db,online:true});
 assert.equal(b.posts().length,0);assert.equal(b.run('S.mine[0].status'),'failed_permanent');
 assert.equal([...b.db.ops.values()][0].attempts,1);
});

for(const [name,response] of [
 ['network',()=>{throw new TypeError('Failed to fetch')}],
 ['HTTP 503',()=>({ok:false,status:503})],
 ['HTTP 400',()=>({ok:false,status:400})],
 ['HTTP 401',()=>({ok:false,status:401})],
 ['HTTP 409',()=>({ok:false,status:409})]
])test(name+' has correct retry classification and never loses content',async()=>{
 let fail=true;
 const a=await app({handler:async p=>p==='/api/postcards'?(fail?response():ok({})):null});
 await a.create();const id=[...a.db.cards.keys()][0];await a.connect();
 const permanent=/400|401|409/.test(name),op=[...a.db.ops.values()][0];
 assert.equal(op.status,permanent?'failed_permanent':'pending');assert.equal(op.attempts,1);assert.ok(op.last_error);
 assert.equal(a.db.cards.get(id).sync_status,op.status);assert.equal(a.run('S.mine.length'),1);
 if(permanent)assert.match(a.node('#view').innerHTML,/Synchronization failed; automatic retries stopped/);
 fail=false;await a.run('flush()');
 assert.equal(a.posts().length,permanent?1:2);
 assert.ok(a.posts().every(p=>JSON.parse(p.body).id===id));
 assert.equal(a.db.ops.size,permanent?1:0);
});

test('failure of one operation does not prevent another operation from syncing; unknown types are untouched',async()=>{
 const a=await app({handler:async(p,o)=>p==='/api/postcards'&&JSON.parse(o.body).t==='bad'?{ok:false,status:422}:null});
 await a.create('bad');await a.create('good');
 a.db.ops.set('unknown',{id:'unknown',type:'future.operation',created_at:new Date().toISOString(),status:'pending'});
 await a.connect();
 assert.equal(a.posts().length,2);assert.equal([...a.db.cards.values()][0].sync_status,'failed_permanent');
 assert.equal([...a.db.cards.values()][1].sync_status,'synced');assert.equal(a.db.ops.get('unknown').status,'pending');
});

test('overlapping flushes share a promise and do not send twice',async()=>{
 let finish;
 const a=await app({handler:async p=>p==='/api/postcards'?new Promise(resolve=>finish=()=>resolve(ok({}))):null});
 await a.create();a.context.navigator.onLine=true;a.run('S.online=true');
 const one=a.run('flush()'),two=a.run('flush()');assert.equal(one,two);await settle();
 assert.equal(a.posts().length,1);assert.equal([...a.db.ops.values()][0].status,'syncing');
 assert.match(a.node('#view').innerHTML,/Sending your saved postcard/);
 finish();await one;assert.equal(a.db.ops.size,0);
});

test('legacy offline bookings become sent only after their real POST succeeds and refresh the view',async()=>{
 let finish;const a=await app({handler:async p=>p==='/api/bookings'?new Promise(resolve=>finish=()=>resolve(ok({}))):null});
 a.node('#bd').value='2027-01-02';a.node('#bp').value='2';a.run('A.book()');
 assert.equal(a.run('S.bookings[0].sync'),'pending');
 const connected=a.connect();await settle();
 assert.equal(a.run('S.bookings[0].sync'),'pending');finish();await connected;
 assert.equal(a.run('S.bookings[0].sync'),'sent');
 assert.match(a.node('#view').innerHTML,/Terkirim\. Menunggu konfirmasi dari/);
});

test('translated chat speech uses the target locale and original speech uses the source locale',async()=>{
 const a=await app(),tid=a.run('gt()'),thread='noor:'+tid;
 a.run(`S.msgs[${JSON.stringify(thread)}]=[{from:'g',t:'Hello',id:'Halo',original_language:'en'}]`);
 a.selectLanguage('en');
 let html=a.run('chatHTML(biz("noor"),gt(),"b")');
 assert.match(html,/data-t="Halo" data-lang="id"/);
 await a.run('A.say({dataset:{t:"Halo",lang:"id"}})');
 assert.deepEqual([a.spoken[0].text,a.spoken[0].lang,a.spoken[0].voice],['Halo','id-ID','Indonesian']);

 a.run(`S.msgs[${JSON.stringify(thread)}]=[{from:'b',t:'Selamat pagi',en:'Good morning',original_language:'id'}]`);
 html=a.run('chatHTML(biz("noor"),gt(),"g")');
 assert.match(html,/data-t="Good morning" data-lang="en"/);
 await a.run('A.say({dataset:{t:"Good morning",lang:"en"}})');
 assert.deepEqual([a.spoken[1].text,a.spoken[1].lang,a.spoken[1].voice],['Good morning','en-US','English']);

 a.run(`S.msgs[${JSON.stringify(thread)}]=[{from:'g',t:'Hola',id:'Halo',original_language:'es'}]`);
 html=a.run('chatHTML(biz("noor"),gt(),"b")');
 assert.match(html,/data-t="Halo" data-lang="id"/);
 a.run(`S.tr[${JSON.stringify('noor'+tid+'0')}]=true`);
 html=a.run('chatHTML(biz("noor"),gt(),"b")');
 assert.match(html,/data-t="Hola" data-lang="es"/);
 await a.run('A.say({dataset:{t:"Hola",lang:"es"}})');
 assert.deepEqual([a.spoken[2].text,a.spoken[2].lang,a.spoken[2].voice],['Hola','es-ES','Spanish']);
});

test('online speech sends the displayed translation or original language to ElevenLabs',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/tts'?{ok:true,status:200,blob:async()=>({type:'audio/mpeg'})}:null});
 a.selectLanguage('en');
 const tid=a.run('gt()'),thread='noor:'+tid,cases=[
  {message:{from:'g',t:'Hello',id:'Halo',original_language:'en'},side:'b',spoken:'Halo',language:'id'},
  {message:{from:'b',t:'Selamat pagi',en:'Good morning',original_language:'id'},side:'g',spoken:'Good morning',language:'en'},
  {message:{from:'g',t:'Hola',id:'Halo',original_language:'es'},side:'b',spoken:'Halo',language:'id'},
  {message:{from:'g',t:'Hello',id:'Halo',original_language:'en'},side:'b',original:true,spoken:'Hello',language:'en'}
 ];
 for(const entry of cases){
  a.run(`S.msgs[${JSON.stringify(thread)}]=[${JSON.stringify(entry.message)}]`);
  const key='noor'+tid+'0';
  if(entry.original)a.run(`S.tr[${JSON.stringify(key)}]=true`);else a.run(`delete S.tr[${JSON.stringify(key)}]`);
  const html=a.run(`chatHTML(biz("noor"),gt(),${JSON.stringify(entry.side)})`);
  const match=html.match(/data-a="say" data-t="([^"]*)" data-lang="([^"]+)"/);
  assert.ok(match,html);assert.equal(match[1],entry.spoken);assert.equal(match[2],entry.language);
  await a.run(`A.say({dataset:{t:${JSON.stringify(match[1])},lang:${JSON.stringify(match[2])}}})`);
  assert.deepEqual(JSON.parse(a.calls.at(-1).body),{text:entry.spoken,language:entry.language,speed:1});
 }
 assert.equal(a.calls.filter(c=>c.path==='/api/tts').length,4);
 assert.equal(a.played.length,4);assert.equal(a.spoken.length,0);
});

test('ElevenLabs failure falls back to the matching browser voice',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/tts'?{ok:false,status:503}:null});
 await a.run('A.say({dataset:{t:"Halo",lang:"id",r:"0.8"}})');
 assert.equal(a.calls.filter(c=>c.path==='/api/tts').length,1);
 assert.deepEqual([a.spoken[0].text,a.spoken[0].lang,a.spoken[0].rate,a.spoken[0].voice],['Halo','id-ID',0.8,'Indonesian']);
 assert.equal(JSON.parse(a.calls.find(c=>c.path==='/api/tts').body).speed,0.8);
});

test('offline speech skips ElevenLabs and keeps the no-compatible-voice warning',async()=>{
 const a=await app({online:false,voices:[]});
 await a.run('A.say({dataset:{t:"Hola",lang:"es",r:"0.8"}})');
 assert.equal(a.calls.some(c=>c.path==='/api/tts'),false);
 assert.deepEqual([a.spoken[0].text,a.spoken[0].lang,a.spoken[0].rate],['Hola','es-ES',0.8]);
 assert.match(a.run('ui.toast'),/No Spanish voice on this device/);
});

test('phrase-card front/back and TTS language follow the language being learned',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/tts'?{ok:true,status:200,blob:async()=>({type:'audio/mpeg'})}:null});
 const idPhrase=content.phrases[0].id,enPhrase=content.phrases[0].en;
 const sayVisible=async(frontLanguage,flipped,speed)=>{
  const flip={dataset:{frontLang:frontLanguage},classList:{active:false,toggle(){this.active=!this.active},contains(){return this.active}}};
  a.context.window.testPhraseFlip=flip;
  a.context.window.testHear={dataset:{i:'0',r:String(speed)},closest:()=>({querySelector:()=>flip})};
  if(flipped)a.run('A.flip(window.testPhraseFlip)');
  await a.run('A.hear(window.testHear)');
  return JSON.parse(a.calls.filter(c=>c.path==='/api/tts').at(-1).body)
 };

 a.run('S.blang="en";go("help")');
 let html=a.node('#view').innerHTML;
 assert.match(html,/Say it in Indonesian/);
 assert.ok(html.indexOf(`<span class="say" lang="id">${idPhrase}</span>`) < html.indexOf(`<span class="say" lang="en">${enPhrase}</span>`));
 assert.deepEqual(await sayVisible('id',false,1),{text:idPhrase,language:'id',speed:1});
 assert.deepEqual(await sayVisible('id',true,0.8),{text:enPhrase,language:'en',speed:0.8});
 a.run('S.learned=Object.fromEntries(PHR.map((_,i)=>[i,true]));go("help")');
 assert.match(a.node('#view').innerHTML,/Say it in Indonesian/);

 a.selectLanguage('id');a.run('go("help")');html=a.node('#view').innerHTML;
 assert.match(html,/Ucapkan dalam bahasa Inggris/);
 assert.ok(html.indexOf(`<span class="say" lang="en">${enPhrase}</span>`) < html.indexOf(`<span class="say" lang="id">${idPhrase}</span>`));
 assert.deepEqual(await sayVisible('en',false,1),{text:enPhrase,language:'en',speed:1});
 assert.deepEqual(await sayVisible('en',true,0.8),{text:idPhrase,language:'id',speed:0.8});
});

test('EN/ID language selector remains visible and switches existing UI labels',async()=>{
 const a=await app();
 a.run('go("login")');
 assert.equal(a.node('#lang').style.display,'');
 assert.equal(a.node('#lang-en').className,'lang-choice');
 assert.equal(a.node('#lang-id').className,'lang-choice on');
 assert.equal(a.node('#lang-en').attributes['aria-pressed'],'false');
 assert.equal(a.node('#lang-id').attributes['aria-pressed'],'true');
 assert.match(a.node('#view').innerHTML,/Akun Anda/);
 a.selectLanguage('en');
 assert.equal(a.run('S.blang'),'en');
 assert.equal(a.node('#lang-en').className,'lang-choice on');
 assert.equal(a.node('#lang-id').className,'lang-choice');
 assert.equal(a.node('#lang-en').attributes['aria-pressed'],'true');
 assert.equal(a.node('#lang-id').attributes['aria-pressed'],'false');
 assert.match(a.node('#view').innerHTML,/Your account/);
 assert.match(a.node('#view').innerHTML,/Local business/);
 a.run('go("explore")');
 assert.match(a.node('#nav').innerHTML,/Explore/);
 a.selectLanguage('id');
 assert.equal(a.run('S.blang'),'id');
 assert.equal(a.node('#lang-id').className,'lang-choice on');
 assert.match(a.node('#nav').innerHTML,/Jelajahi/);
 assert.match(a.node('#nav').innerHTML,/Kunjungan/);
 a.run('go("ai")');
 assert.match(a.node('#view').innerHTML,/Cara kerja YoloWisata/);
 a.selectLanguage('en');
 assert.match(a.node('#view').innerHTML,/How YoloWisata works/);
});

test('Explore labels follow blang without translating business content',async()=>{
 const a=await app();a.run('S.dna=computeDNA();S.saved.noor=true;go("explore")');
 let html=a.node('#view').innerHTML;
 assert.match(html,/Temukan orang lokal/);
 assert.match(html,/Gunakan lokasi saya/);
 assert.match(html,/Lihat jarak setiap tempat/);
 for(const label of ['Semua','Kebun','Kerajinan','Makanan','Pemandu','Homestay'])assert.ok(html.includes(label),label);
 assert.match(html,/% cocok/);
 assert.match(html,/Tersimpan offline/);
 assert.match(html,/Noor’s Coffee Farm/);
 a.selectLanguage('en');html=a.node('#view').innerHTML;
 assert.match(html,/Find someone local/);
 assert.match(html,/Use my location/);
 assert.match(html,/See how far each place is/);
 for(const label of ['All','Farm','Craft','Food','Guide','Homestay'])assert.ok(html.includes(label),label);
 assert.match(html,/% match/);
 assert.match(html,/Saved offline/);
 assert.match(html,/Noor’s Coffee Farm/);
});

test('menu and booking dialogs rerender in the active UI language',async()=>{
 const a=await app();
 a.run('ui.modal={t:"menu"};renderOver()');
 assert.match(a.node('#over').innerHTML,/Cerita langkah demi langkah/);
 a.selectLanguage('en');
 assert.match(a.node('#over').innerHTML,/The story, step by step/);
 a.run('ui.modal={t:"book"};renderOver()');
 assert.match(a.node('#over').innerHTML,/Ask Noor/);
 a.selectLanguage('id');
 assert.match(a.node('#over').innerHTML,/Minta kunjungan kepada Noor/);
});

test('UI language persists across reload and does not alter online/offline or account controls',async()=>{
 const first=await app();first.selectLanguage('en');
 assert.equal(JSON.parse(first.stored.get('yolowisata-v3')).blang,'en');
 const reloaded=await app({stored:first.stored});
 assert.equal(reloaded.run('S.blang'),'en');
 assert.equal(reloaded.node('#lang-en').attributes['aria-pressed'],'true');
 assert.equal(reloaded.node('#lang-id').attributes['aria-pressed'],'false');
 assert.notEqual(reloaded.node('#acct').textContent,'');
 reloaded.context.navigator.onLine=true;await reloaded.run('A.net()');
 assert.match(reloaded.node('#net').textContent,/Online/);
 await reloaded.run('A.net()');
 assert.match(reloaded.node('#net').textContent,/Offline/);
});

test('pulled bookings and statuses are server-owned and never become outbound work',async()=>{
 const booking={id:'kserver',gid:'guest',biz:'noor',date:'Sat 10 Oct',visit_date:'2026-10-10',people:2,status:'pending',sync:'sent',ts:1791000000000};
 const a=await app({online:true,handler:async p=>p==='/api/sync'?ok({bookings:{kserver:booking},bookingstatus:{'noor-b1':{id:'noor-b1',status:'confirmed',ts:1791000001000}}}):null});
 assert.equal(a.run('S.bookings[0].server_record'),true);
 assert.equal(a.run('S.bookings[0].local_pending'),false);
 assert.equal(a.run('outbox().some(([kind])=>kind==="bookings"||kind==="bookingstatus")'),false);
 await a.run('flush()');
 assert.equal(a.calls.some(c=>c.method==='POST'&&/api\/(bookings|bookingstatus)$/.test(c.path)),false);
});

test('permanent booking 4xx and static demo statuses do not retry on later flushes',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/bookings'?{ok:false,status:400}:null});
 a.run(`S.bookings.push({id:'kbad',gid:S.gid,biz:'noor',date:'Sat 10 Oct',visit_date:'2026-10-10',people:2,status:'pending',sync:'pending',local_pending:true})`);
 await a.run('flush()');
 assert.equal(a.calls.filter(c=>c.method==='POST'&&c.path==='/api/bookings').length,1);
 assert.equal(a.run('S.bookings[0].sync'),'failed_permanent');
 a.run('go("trips")');
 assert.match(a.node('#view').innerHTML,/Permintaan tidak dapat dikirim/);
 await a.run('flush()');
 assert.equal(a.calls.filter(c=>c.method==='POST'&&c.path==='/api/bookings').length,1);

 a.run('S.role="biz";A.bdec({dataset:{id:"noor-b1",v:"confirmed"}})');
 await a.run('flush()');await a.run('flush()');
 assert.equal(a.calls.some(c=>c.method==='POST'&&c.path==='/api/bookingstatus'),false);
});

test('interrupted syncing operation is recovered after reload with identical payload and UUID',async()=>{
 const a=await app();await a.create();const op=[...a.db.ops.values()][0];op.status='syncing';
 const original=JSON.stringify(op.payload);
 const b=await app({db:a.db,online:true});
 assert.equal(b.posts().length,1);assert.equal(b.posts()[0].body,original);assert.equal(a.db.ops.size,0);
});

test('timeout remains retryable and a later retry uses the same id',async()=>{
 const a=await app({handler:async(p,o)=>p==='/api/postcards'?new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('Request timed out')))):null});
 await a.create();a.context.navigator.onLine=true;a.run('S.online=true');const flush=a.run('flush()');await settle();
 for(const t of [...a.timers.values()])if(t.delay===10000)t.fn();await flush;
 assert.equal([...a.db.ops.values()][0].status,'pending');assert.equal([...a.db.ops.values()][0].attempts,1);
});

test('pull keeps pending and permanently failed local content and merges accepted cards by id',async()=>{
 let remote={};const a=await app({handler:async p=>p==='/api/sync'?ok({postcards:remote}):null});await a.create();
 const c=[...a.db.cards.values()][0];remote[c.id]={...c,t:'stale server text'};
 a.context.navigator.onLine=true;a.run('S.online=true');await a.run('pull()');
 assert.equal(a.run('S.mine[0].t'),c.t);assert.equal(a.run('S.mine[0].status'),'pending');
 await a.run(`setPostcardSync('${c.id}','failed_permanent','HTTP 400')`);await a.run('pull()');
 assert.equal(a.run('S.mine[0].t'),c.t);assert.equal(a.run('S.mine.length'),1);
 await a.run(`setPostcardSync('${c.id}','synced')`);await a.run('pull()');
 assert.equal(a.run('S.mine[0].t'),'stale server text');assert.equal(a.run('S.mine.length'),1);
 remote={};await a.run('pull()');assert.equal(a.run('S.mine.length'),1);
});

test('double click saves one card; storage failure keeps the draft and sends nothing',async()=>{
 const a=await app();a.run('S.draft.t="one postcard"');
 const first=a.run('A.send()'),second=a.run('A.send()');assert.equal(first,second);await first;
 assert.equal(a.db.cards.size,1);
 a.db.saveLocalPostcard=async()=>{throw new Error('Quota exceeded')};await a.create('keep this draft');
 assert.equal(a.run('S.draft.t'),'keep this draft');assert.equal(a.db.cards.size,1);assert.equal(a.posts().length,0);
 assert.match(a.node('#over').innerHTML,/Could not save offline data/);
});

test('reset clears postcards, operations and memory and waits for an active send',async()=>{
 let finish;const a=await app({handler:async p=>p==='/api/postcards'?new Promise(resolve=>finish=()=>resolve(ok({}))):null});
 await a.create();a.context.navigator.onLine=true;a.run('S.online=true');
 const flush=a.run('flush()');await settle();const reset=a.run('A.reset()');
 assert.equal(a.db.cards.size,1);finish();await flush;await reset;
 assert.equal(a.db.cards.size,0);assert.equal(a.db.ops.size,0);assert.equal(a.run('S.mine.length'),0);
 assert.equal(JSON.parse(a.stored.get('yolowisata-v3')).mine.length,0);
 assert.equal(a.calls.some(c=>c.method==='DELETE'),false);
 const b=await app({db:a.db,stored:a.stored});assert.equal(b.run('S.mine.length'),0);
});

test('failed backend insights and offline hydration preserve deterministic fallback and pending count',async()=>{
 const a=await app({handler:async p=>p==='/api/businesses'?{ok:false,status:503}:null});await a.create();
 a.run('go("b-insights")');assert.equal(a.run('insightsFor(B()).source'),'local');
 assert.equal(a.run('analyse(B()).waiting'),1);
 await a.connect();await a.run('refreshInsights(true)');
 assert.equal(a.run('insightsFor(B()).source'),'local');assert.match(a.node('#view').innerHTML,/di perangkat|On-device fallback/);
});

test('legacy localStorage postcards migrate once without replacing existing retry identities',async()=>{
 const a=await app();a.run('S.mine.push({id:"mlegacy",gid:S.gid,biz:"noor",t:"old memory",ts:1791000000000,status:"pending"});save()');
 const b=await app({stored:a.stored,db:a.db});
 assert.equal(b.db.cards.size,1);assert.equal([...b.db.ops.values()][0].payload.id,'mlegacy');
 const c=await app({stored:b.stored,db:b.db});assert.equal(c.db.ops.size,1);assert.equal(c.run('S.mine.length'),1);
});

test('shell installs offline helper and neither POST nor API GET is intercepted',async()=>{
 const events={};let shell;
 const context=vm.createContext({self:{addEventListener:(n,fn)=>events[n]=fn,skipWaiting:async()=>{}},URL,location:{origin:'https://app.test'},
  caches:{open:async()=>({addAll:async files=>shell=files})}});
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/sw.js'),'utf8'),context);
 let install;events.install({waitUntil:p=>install=p});await install;assert.ok(shell.includes('/offline-db.js'));
 for(const method of ['GET','POST'])events.fetch({request:{method,url:'https://app.test/api/postcards'},respondWith:()=>assert.fail('API intercepted')});
 const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');
 assert.ok(html.indexOf('./offline-db.js')<html.indexOf('./app.js'));
});
