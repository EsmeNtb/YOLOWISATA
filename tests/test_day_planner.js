// Deterministic local planner checks; no dependencies, network, or storage writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const content=JSON.parse(fs.readFileSync(path.join(root,'frontend/data/content.json'),'utf8'));
const source=fs.readFileSync(path.join(root,'frontend/app.js'),'utf8');
const dna={hands:.9,nature:.9,culture:.8,food:.7,quiet:.8,crowds:.1};
function app(){
 const nodes=new Map(),events={},requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',style:{},setAttribute(){}});return nodes.get(id)};
 const context=vm.createContext({window:{YOLO_CONFIG:{api:''},YOLO_CONTENT:structuredClone(content),addEventListener(){}},navigator:{onLine:false},
  document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn,activeElement:null},
  localStorage:{getItem(){return null},setItem(){}},setTimeout(){},clearTimeout(){},setInterval(){},AbortController,console,
  fetch:async url=>{requests.push(url);throw new Error('Planner must not fetch')}
 });
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/voice-listing.js'),'utf8'),context);
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 run(`S.blang='en';S.dna=${JSON.stringify(dna)}`);
 return {run,node,events,requests,context};
}
function candidate(id,minutes=60,price=10,currency='IDR',match=dna){return {id,name:id,dna:match,L:{name:id+' experience',structured:{duration_minutes:minutes,price,currency}}}}
function setBusinesses(a,rows){a.context.rows=rows;a.run('BIZ0=rows;S.custom=[];S.listings={}')}
const plain=value=>JSON.parse(JSON.stringify(value));

test('planner requires completed Travel DNA and offers the existing flow',()=>{
 const a=app();a.run('S.dna=null');const plan=a.run('planDay(240)');assert.equal(plan.needsDNA,true);assert.equal(plan.items.length,0);
 const html=a.run('V.plan()');assert.match(html,/Find your Travel DNA first so we can personalize your day/);assert.match(html,/data-s="swipe"/);assert.doesNotMatch(html,/data-a="buildPlan"/);
});

test('highest existing matching scores come first, with stable tie order',()=>{
 const a=app();setBusinesses(a,[candidate('lower',60,10,'IDR',{...dna,nature:0}),candidate('best'),candidate('tied')]);
 const plan=a.run('planDay(480)');assert.deepEqual(plain(plan.items.map(i=>i.b.id)),['best','tied','lower']);
 for(const item of plan.items)assert.equal(item.score,a.run(`matchOf(biz('${item.b.id}')).score`));
 assert.deepEqual(plain(a.run('planDay(480)')),plain(plan));
});

test('total duration respects remaining time and skips oversized candidates',()=>{
 const a=app();setBusinesses(a,[candidate('long',300),candidate('first',90),candidate('too-long-next',180),candidate('second',120)]);
 const plan=a.run('planDay(240)');assert.deepEqual(plain(plan.items.map(i=>i.b.id)),['first','second']);assert.equal(plan.minutes,210);
});

test('budget is cumulative for known prices, including zero-price listings',()=>{
 const a=app();setBusinesses(a,[candidate('first',60,70),candidate('over',60,40),candidate('second',60,30),candidate('free',60,0)]);
 const plan=a.run("planDay(240,100,'IDR')");assert.deepEqual(plain(plan.items.map(i=>i.b.id)),['first','second','free']);assert.equal(plan.totals.IDR,10000);
});

test('missing price stays unknown, is never free, and produces a known-total caveat',()=>{
 const a=app();setBusinesses(a,[candidate('unknown',60,null),candidate('known',60,20)]);a.run("ui.dayPlan={minutes:240,budget:'20',built:true}");
 const plan=a.run("planDay(240,20,'IDR')");assert.equal(plan.items[0].price,null);assert.equal(plan.unknownPrices,1);assert.equal(plan.totals.IDR,2000);
 const html=a.run('V.plan()');assert.match(html,/Price not listed or unclear/);assert.match(html,/Known total: IDR 20/);assert.match(html,/Some prices not listed or unclear/);assert.match(html,/Missing prices are not free/);
});

test('missing or ambiguous duration is excluded, never guessed from activity or stale text',()=>{
 const a=app();const absent=candidate('absent',null);absent.L.duration='2 hours';
 setBusinesses(a,[absent,{...candidate('range'),L:{duration:'1–2 hours',price:'IDR 10'}},{...candidate('unknown'),L:{activities:'A short walk',duration:'Half day'}}]);
 const plan=a.run('planDay(480)');assert.equal(plan.items.length,0);assert.equal(plan.minutes,0);a.run("ui.dayPlan={minutes:480,budget:'',built:true}");
 assert.match(a.run('V.plan()'),/No verified experiences fit those limits yet. Try more time or a larger budget/);
});

test('only all() businesses appear, with a maximum of three including local businesses',()=>{
 const a=app();setBusinesses(a,Array.from({length:6},(_,i)=>candidate('real-'+i,30)));
 a.context.custom=candidate('local',15);a.run('S.custom=[custom]');const plan=a.run('planDay(480)');
 assert.equal(plan.items.length,3);assert.ok(plan.items.every(i=>a.run('all().map(b=>b.id)').includes(i.b.id)));
 setBusinesses(a,[]);assert.equal(a.run('planDay(240)').items.length,0);
});

test('same-currency totals use exact cents',()=>{
 const a=app();setBusinesses(a,[candidate('one',60,.1,'USD'),candidate('two',60,.2,'USD')]);
 const plan=a.run('planDay(240)');assert.equal(plan.totals.USD,30);assert.equal(a.run("planMoney(30,'USD')"),'USD 0.3');
});

test('mixed currencies are shown individually without a combined total',()=>{
 const a=app();setBusinesses(a,[candidate('one',60,100,'IDR'),candidate('two',60,10,'USD')]);
 const plan=a.run('planDay(240)');assert.deepEqual(plain(plan.totals),{IDR:10000,USD:1000});a.run("ui.dayPlan={minutes:240,budget:'',built:true}");
 const html=a.run('V.plan()');assert.match(html,/Prices shown individually because listings use different currencies/);assert.doesNotMatch(html,/Known total:/);
 const budget=a.run("planDay(240,100,'IDR')");assert.deepEqual(plain(budget.items.map(i=>i.b.id)),['one']);
});

test('local listing overrides are authoritative, including missing structured fields',()=>{
 const a=app();setBusinesses(a,[{...candidate('one'),L:{duration:'3 hours',price:'Rp150.000 per person'}}]);
 a.run("S.listings.one={name:'Updated listing',structured:{duration_minutes:90,price:25,currency:'USD'}}");
 let plan=a.run('planDay(120)');assert.equal(plan.items[0].L.name,'Updated listing');assert.equal(plan.minutes,90);assert.equal(plan.totals.USD,2500);
 a.run('S.listings.one.structured.price=null');plan=a.run('planDay(120)');assert.equal(plan.items[0].price,null);assert.deepEqual(plain(plan.totals),{});
});

test('duration parsing is explicit and retains source approximation',()=>{
 const a=app();for(const [text,minutes,approximate] of [['About 3 hours',180,true],['90 min',90,false],['1.5 hours',90,false],['2h 30min',150,false],['Sekitar 2 jam',120,true]]){
 a.context.listing={duration:text};assert.deepEqual(plain(a.run('planDuration(listing)')),{minutes,approximate});}
 for(const text of ['3','around lunch','2 to 3 hours','at least 1 hour','two hours','0 minutes']){a.context.listing={duration:text};assert.equal(a.run('planDuration(listing)'),null);}
});

test('price parsing accepts explicit formats and rejects currencies or numbers it cannot verify',()=>{
 const a=app();for(const [text,cents,currency] of [['Rp150.000 per person',15000000,'IDR'],['Rp75.000,50',7500050,'IDR'],['IDR 150000',15000000,'IDR'],['USD 1,500.25',150025,'USD'],['MXN 0',0,'MXN']]){
 a.context.listing={price:text};assert.deepEqual(plain(a.run('planPrice(listing)')),{cents,currency});}
 for(const text of ['$20','150000','from IDR 100','IDR 10–20','Rp1.50','USD 1.000','free','IDR -5']){a.context.listing={price:text};assert.equal(a.run('planPrice(listing)'),null);}
});

test('Build my plan runs offline with no fetch, and inputs have unique labels',()=>{
 const a=app();a.run("S.screen='plan'");a.node('#plan-time').value='240';a.node('#plan-budget').value='250000';a.run('A.buildPlan()');
 const html=a.node('#view').innerHTML;assert.match(html,/experiences/);assert.equal(a.requests.length,0);
 for(const id of ['plan-time','plan-budget']){assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);assert.match(html,new RegExp(`for="${id}"`));}
 assert.match(html,/aria-describedby="plan-budget-hint"/);assert.match(html,/id="plan-budget-hint"/);
 a.events.input({target:{id:'plan-budget',value:'10'}});assert.equal(a.run('ui.dayPlan.budget'),'10');assert.equal(a.run('ui.dayPlan.built'),false);assert.equal(a.node('#plan-results').innerHTML,'');
});

test('invalid budgets do not silently become unlimited plans',()=>{
 const a=app();for(const budget of ['-1','abc','2,000','Infinity','1.234']){
 a.context.budget=budget;a.run('ui.dayPlan={minutes:240,budget,built:true}');assert.match(a.run('V.plan()'),/Enter a valid budget/);}
 assert.equal(a.run("planDay(123,null,'IDR').invalid"),true);
});

test('current listing currency is used, with a fallback only to another listed currency',()=>{
 const a=app();setBusinesses(a,[candidate('one',60,20,'USD'),candidate('two',60,100,'MXN')]);a.run("S.biz='two'");assert.equal(a.run('planCurrency()'),'MXN');
 a.run('BIZ0[1].L.structured.price=null');assert.equal(a.run('planCurrency()'),'USD');a.run('BIZ0[0].L.structured.price=null');assert.equal(a.run('planCurrency()'),null);assert.match(a.run('V.plan()'),/No listing currency is known/);
});

test('entry points and explanations use existing DNA data in both languages',()=>{
 const a=app();for(const screen of ['explore','dna','match'])assert.match(a.run(`V.${screen}()`),/data-s="plan"/);
 setBusinesses(a,[candidate('Local host')]);a.run("ui.dayPlan={minutes:240,budget:'',built:true}");let html=a.run('V.plan()');assert.match(html,/Matches your preferences: Hands-on and Nature/);assert.match(html,/Fits within your available time/);assert.doesNotMatch(html,/\b\d{2}:\d{2}\b/);
 a.run("S.blang='id'");html=a.run('V.plan()');assert.match(html,/Rencanakan hari saya/);assert.match(html,/Buat rencana saya/);assert.match(html,/Sesuai preferensi Anda/);
});

test('bundled durations stay honest; a real shorter local override enables two experiences in four hours',()=>{
 const a=app();assert.equal(a.run("planDay(240,250000,'IDR').items.length"),1);
 a.run("S.listings.noor={structured:{duration_minutes:90,price:150000,currency:'IDR'}};S.dna={...biz('darto').dna}");
 const plan=a.run("planDay(240,250000,'IDR')");assert.equal(plan.items.length,2);assert.equal(plan.minutes,210);assert.equal(plan.totals.IDR,25000000);assert.deepEqual(new Set(plain(plan.items.map(i=>i.b.id))),new Set(['noor','darto']));
});
