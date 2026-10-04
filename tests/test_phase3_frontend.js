// Dependency-free DOM-stub checks: node --test tests/test_phase3_frontend.js
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'frontend/app.js'),'utf8');
const content=JSON.parse(fs.readFileSync(path.join(root,'data/content.json'),'utf8'));
const NOOR='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const insightsPath='/api/businesses/'+NOOR+'/insights';
const copy=x=>JSON.parse(JSON.stringify(x));
const result=()=>({
 loved:{roast:{count:2,label:'Not enough evidence yet',quotes:[
  'I loved roasting coffee.','Saya senang sangrai kopi bersama Noor.'
 ]}},
 asks:{tasting:{count:1,label:'Not enough evidence yet',quotes:['Boleh cicip kopi lagi?']}},
 segments:{international:{},local:{tasting:1}},postcards:2,questions:1
});
const strong=()=>({
 loved:{roast:{count:6,label:'Strong pattern',quotes:Array(6).fill('Loved roasting coffee.')}},
 asks:{tasting:{count:3,label:'Early signal',quotes:Array(3).fill('More tasting please.')}},
 segments:{international:{tasting:3},local:{}},postcards:6,questions:3
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function app({online=true,api='https://backend.test',handler}={}){
 const nodes=new Map(),calls=[],events={},intervals=[],timers=new Map(),stored=new Map();
 let timerId=0,now=100000;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',style:{},scrollTop:0});return nodes.get(id)};
 class Clock extends Date {static now(){return now}}
 const context=vm.createContext({
  window:{YOLO_CONFIG:{api},YOLO_CONTENT:copy(content),addEventListener:(name,fn)=>events[name]=fn},
  navigator:{onLine:online},
  document:{querySelector:node,querySelectorAll:()=>[],addEventListener:()=>{},activeElement:null},
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},
  Date:Clock,AbortController,console,
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},
  clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),
  fetch:async(url,options={})=>{
   const pathname=new URL(url,'https://frontend.test').pathname;
   calls.push({pathname,options,url});
   if(pathname==='/api/sync')return {ok:true,json:async()=>({})};
   if(handler){const response=await handler(pathname,options);if(response)return response}
   const body=pathname==='/api/businesses'?{ok:true,businesses:[{id:NOOR,name:'Noor Coffee Farm'}]}:result();
   return {ok:true,json:async()=>copy(body)};
  }
 });
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/voice-listing.js'),'utf8'),context,{filename:'voice-listing.js'});
 vm.runInContext(source,context,{filename:'app.js'});
 const run=code=>vm.runInContext(code,context);
 run('S.blang="en"');
 return {context,run,calls,events,intervals,timers,stored,node,
  advance:ms=>now+=ms,
  open:async()=>{run('go("b-insights")');await run('refreshInsights()');await settle()},
  html:()=>node('#view').innerHTML,
  evidence:(key='roast',group='loved')=>{run(`A.evid({dataset:{k:${JSON.stringify(key)},group:${JSON.stringify(group)}}})`);return node('#over').innerHTML}
 };
}

test('online Noor resolves to UUID and renders authoritative backend counts, labels, and bilingual evidence',async()=>{
 const a=app();await a.open();
 assert.deepEqual(a.calls.filter(c=>c.pathname!=='/api/sync').map(c=>c.pathname),['/api/businesses',insightsPath]);
 assert.match(a.html(),/Online insights/);
 assert.match(a.html(),/From 2 postcards and 1 questions/);
 assert.match(a.html(),/2 mentions/);
 assert.match(a.html(),/Not enough evidence yet/);
 assert.match(a.html(),/No suggestion yet/);
 assert.doesNotMatch(a.html(),/Talking with Noor|Possible opportunity/);
 const evidence=a.evidence();
 assert.match(evidence,/I loved roasting coffee\./);
 assert.match(evidence,/Saya senang sangrai kopi bersama Noor\./);
 assert.match(evidence,/Visitor evidence · original text/);
 assert.doesNotMatch(evidence,/undefined|translated/);
 a.run('S.blang="id";render()');
 assert.match(a.node('#over').innerHTML,/I loved roasting coffee\./);
 assert.match(a.node('#over').innerHTML,/Saya senang sangrai kopi bersama Noor\./);
 assert.match(a.html(),/Bukti belum cukup/);
 assert.equal(a.run('insightsFor(B()).source'),'backend');
 assert.equal(a.run('S.mine.length'),0);
 assert.ok(a.calls.every(c=>(c.options.method||'GET')==='GET'));
 assert.equal(a.calls.find(c=>c.pathname===insightsPath).options.cache,'no-store');
});

test('same-origin config and direct UUID selection request the exact insight URL',async()=>{
 const a=app({api:'https://frontend.test'});
 a.run(`BIZ0[0].id="${NOOR}";S.myBiz="${NOOR}"`);
 await a.open();
 assert.equal(a.calls.filter(c=>c.pathname==='/api/businesses').length,0);
 assert.equal(a.calls.find(c=>c.pathname===insightsPath).url,'https://frontend.test'+insightsPath);
});

for(const [name,handler] of [
 ['HTTP error',async p=>p===insightsPath?{ok:false,status:503}:null],
 ['unavailable backend',async()=>{throw new Error('Failed to fetch')}],
 ['invalid JSON',async p=>p===insightsPath?{ok:true,json:async()=>{throw new SyntaxError('HTML response')}}:null],
 ['invalid contract',async p=>p===insightsPath?{ok:true,json:async()=>({loved:{}})}:null]
])test(name+' uses the unchanged local analyzer',async()=>{
 const a=app({handler});await a.open();
 assert.equal(a.run('insightsFor(B()).source'),'local');
 assert.equal(a.run('insightsFor(B()).nCards'),a.run('analyse(B()).nCards'));
 assert.match(a.html(),/On-device fallback/);
 assert.match(a.html(),/Coffee roasting/);
 assert.match(a.evidence(),/quote/);
});

test('navigator offline, simulated offline and no configured API use local fallback without insight requests',async()=>{
 for(const options of [{online:false},{api:''},{}]){
  const a=app(options);
  if(!Object.keys(options).length)a.run('S.online=false');
  await a.open();
  assert.equal(a.run('insightsFor(B()).source'),'local');
  assert.equal(a.calls.filter(c=>c.pathname.includes('/businesses')).length,0);
  assert.match(a.html(),/On-device fallback/);
  assert.ok(a.run('insightsFor(B()).nCards')>0);
 }
});

test('timeout aborts the read and falls back',async()=>{
 const a=app({handler:async(p,options)=>p===insightsPath?new Promise((resolve,reject)=>{
  options.signal.addEventListener('abort',()=>reject(new Error('aborted')));
 }):null});
 a.run('go("b-insights")');await settle();
 assert.match(a.html(),/Loading online insights/);
 assert.doesNotMatch(a.html(),/Possible opportunity/);
 for(const timer of [...a.timers.values()])if(timer.delay===6000)timer.fn();
 await a.run('refreshInsights()');
 assert.match(a.html(),/On-device fallback/);
});

test('empty or explicitly weak backend evidence never inherits demo recommendations',async()=>{
 const cases=[
  {loved:{},asks:{},segments:{international:{},local:{}},postcards:0,questions:0},
  {...strong(),asks:{tasting:{count:10,label:'Not enough evidence yet',quotes:Array(10).fill('Maybe tasting.')}}},
  {...strong(),loved:{roast:{count:8,label:'Uncertain evidence',quotes:['Roasting?']}}}
 ];
 for(const data of cases){
  const a=app({handler:async p=>p===insightsPath?{ok:true,json:async()=>data}:null});await a.open();
  assert.match(a.html(),/Online insights/);
  assert.match(a.html(),/No suggestion yet/);
  assert.doesNotMatch(a.html(),/Possible opportunity/);
  if(data.asks.tasting){assert.match(a.evidence('tasting','asks'),/Not enough evidence yet|Early signal/)}
 }
});

test('suggestions and Save idea / Not now never change listings, pricing, experiences or publish',async()=>{
 const a=app({handler:async p=>p===insightsPath?{ok:true,json:async()=>strong()}:null});
 const snapshot=()=>a.run('JSON.stringify({listings:S.listings,lts:S.lts,lsync:S.lsync,custom:S.custom,businesses:BIZ0,bookings:S.bookings,msgs:S.msgs})');
 const before=snapshot();await a.open();
 assert.match(a.html(),/Possible opportunity/);
 assert.match(a.html(),/Based on 6 mentions and 3 requests/);
 assert.match(a.html(),/Worth a small test, not a sure thing/);
 assert.equal(a.run('Object.keys(S.idea).length'),0);
 assert.equal(snapshot(),before);
 for(const choice of ['saved','later']){
  a.run(`A.idea({dataset:{v:"${choice}"}})`);
  assert.equal(a.run('S.idea.noor'),choice);
  assert.equal(snapshot(),before);
  assert.equal(a.run('outbox().length'),0);
 }
 assert.ok(a.calls.every(c=>(c.options.method||'GET')==='GET'));
});

test('polling refreshes backend counts, open evidence, and growth; request failure drops stale backend data',async()=>{
 let body=result(),fail=false;
 const a=app({handler:async p=>p===insightsPath?(fail?{ok:false,status:500}:{ok:true,json:async()=>copy(body)}):null});
 await a.open();a.evidence();
 body.loved.roast.quotes.push('New sangrai feedback');body.loved.roast.count=3;body.loved.roast.label='Early signal';body.postcards=3;
 a.advance(8001);a.intervals.forEach(fn=>fn());await a.run('refreshInsights()');
 assert.match(a.html(),/From 3 postcards/);
 assert.match(a.node('#over').innerHTML,/New sangrai feedback/);
 a.run('go("b-journey")');await a.run('refreshInsights()');
 assert.match(a.html(),/3 memories left so far/);
 fail=true;a.advance(8001);a.intervals.forEach(fn=>fn());await a.run('refreshInsights()');
 assert.equal(a.run('insightsFor(B()).source'),'local');
 a.run('go("b-insights")');await a.run('refreshInsights()');assert.match(a.html(),/On-device fallback/);
});

test('reconnection retries and offline discards an in-flight result',async()=>{
 let finish;
 const a=app({handler:async p=>p===insightsPath?new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>result()})):null});
 a.run('go("b-insights")');await settle();
 a.context.navigator.onLine=false;a.events.offline();
 finish();await settle();
 assert.match(a.html(),/On-device fallback/);
 assert.equal(a.run('insightCache.size'),0);
 a.context.navigator.onLine=true;a.events.online();await settle();finish();await settle();
 assert.match(a.html(),/Online insights/);
});

test('responses for a previous business cannot overwrite the selected business',async()=>{
 let finish;
 const a=app({handler:async p=>p===insightsPath?new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>result()})):null});
 a.run('go("b-insights")');await settle();
 a.run(`S.custom.push({...BIZ0[0],id:"${OTHER}",host:"Other host"});A.asbiz({dataset:{id:"${OTHER}"}})`);
 await a.run('refreshInsights()');
 finish();await settle();
 assert.match(a.html(),/Other host/);
 assert.doesNotMatch(a.html(),/Halo, Noor/);
});

test('unmapped, invalid and ambiguous businesses do not fetch guessed insight IDs',async()=>{
 for(const id of ['darto','missing-business']){
  const a=app();a.run(`S.myBiz="${id}"`);await a.open();
  assert.equal(a.calls.filter(c=>c.pathname.includes('/businesses')).length,0);
  assert.match(a.html(),/On-device fallback/);
 }
 for(const businesses of [[],[{id:NOOR,name:'Noor Coffee Farm'},{id:OTHER,name:'Noor Coffee Farm'}]]){
  const a=app({handler:async p=>p==='/api/businesses'?{ok:true,json:async()=>({ok:true,businesses})}:null});
  await a.open();assert.match(a.html(),/On-device fallback/);
  assert.equal(a.calls.filter(c=>c.pathname.endsWith('/insights')).length,0);
 }
});

test('unknown backend themes and quotes are escaped without changing their text',async()=>{
 const data=result();data.loved['<new theme>']={count:1,label:'<weak>',quotes:['<script>alert("x")</script>']};
 const a=app({handler:async p=>p===insightsPath?{ok:true,json:async()=>data}:null});await a.open();
 assert.match(a.html(),/&lt;new theme&gt;/);
 assert.match(a.html(),/&lt;weak&gt;/);
 const html=a.evidence('<new theme>');
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});

test('all existing screens still render in the DOM stub',async()=>{
 const a=app({api:''});
 for(const screen of a.run('Object.keys(V)')){
  a.run(`S.screen=${JSON.stringify(screen)};S.role=S.screen.startsWith("b-")?"biz":"guest";render()`);
  assert.ok(a.html().length,screen);
 }
});

test('fallback stays usable while retrying a failed request, then yields to backend',async()=>{
 let retry=false,finish;
 const a=app({handler:async p=>p===insightsPath?(retry?new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>result()})):{ok:false,status:503}):null});
 await a.open();retry=true;
 a.run('go("b-insights")');await settle();
 assert.match(a.html(),/On-device fallback/);
 assert.ok(a.run('insightsFor(B()).nCards')>0);
 finish();await settle();
 assert.match(a.html(),/Online insights/);
});

test('service worker keeps API requests on the network and serves the cached shell offline',async()=>{
 const events={},cached={offline:true};
 const context=vm.createContext({
  self:{addEventListener:(name,fn)=>events[name]=fn},URL,location:{origin:'https://app.test'},
  caches:{match:async key=>{assert.equal(key,'/index.html');return cached}},
  fetch:async()=>{throw new Error('offline')}
 });
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/sw.js'),'utf8'),context);
 events.fetch({request:{method:'GET',url:'https://app.test'+insightsPath},respondWith:()=>assert.fail('API must bypass cache')});
 let response;
 events.fetch({request:{method:'GET',mode:'navigate',url:'https://app.test/'},respondWith:p=>response=p});
 assert.equal(await response,cached);
});
