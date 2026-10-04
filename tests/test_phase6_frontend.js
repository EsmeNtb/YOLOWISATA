// Voice flow with real app actions and fake microphone/backend; no network or DB writes.
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

const proposal=()=>({listing:{business_name:null,experience_title:'Coffee roasting',description:'Roast coffee.',price:150000,currency:'IDR',duration_minutes:90,activities:['coffee_roasting'],availability:[]},uncertain_fields:['duration_minutes'],missing_fields:['business_name','availability'],extractor:{type:'small_ai',model:'Qwen local'},error:null});
const open=a=>a.run('S.blang="en";S.role="biz";go("b-list")');
const type=(a,text)=>{a.context.window.input={id:'voice-transcript',value:text,dataset:{}};a.run('voiceInput(window.input)')};
const field=(a,key,value)=>{a.context.window.input={id:'voice-'+key,value,dataset:{voiceField:key}};a.run('voiceInput(window.input)')};

test('microphone denial keeps manual transcript available; never inserts sample words',async()=>{
 const a=await app();open(a);a.context.window.MediaRecorder=function(){};
 a.context.navigator.mediaDevices={getUserMedia:async()=>{throw new Error('denied')}};
 type(a,'my real words');await a.run('A.voiceRecord()');
 assert.equal(a.run('voiceDraft().transcript'),'my real words');assert.equal(a.run('voiceDraft().busy'),false);
 assert.match(a.node('#view').innerHTML,/Microphone access denied/);assert.match(a.node('#view').innerHTML,/Enter fields manually/);
 assert.equal(a.calls.some(c=>c.path.includes('/api/voice')),false);
});

test('manual entry works offline and fields remain absent until explicitly supplied',async()=>{
 const a=await app();open(a);type(a,'manual offering');a.run('A.voiceManual()');
 assert.match(a.node('#view').innerHTML,/textarea[^>]+id="voice-transcript"/);
 assert.match(a.node('#view').innerHTML,/data-voice-field="price"/);assert.match(a.node('#view').innerHTML,/Missing/);
 field(a,'experience_title','My workshop');a.run('A.voiceConfirm()');
 assert.equal(a.run('S.listings[B().id].structured.price'),null);
 assert.equal(a.run('S.listings[B().id].structured.currency'),null);
 assert.equal(a.run('S.listings[B().id].transcript'),'manual offering');
 assert.equal(a.calls.some(c=>c.path==='/api/listings'),false);
 assert.equal(a.run('voiceDraft().status'),'Listing saved on this device. Waiting to sync.');
 assert.match(a.node('#over').innerHTML,/Listing saved on this device. Waiting to sync./);
});

test('AI proposal editable with missing and uncertain markers; no listing before confirmation',async()=>{
 const a=await app({handler:async p=>p==='/api/voice/proposal'?ok(proposal()):null});open(a);type(a,'Roast coffee for ninety minutes.');
 await a.run('A.voiceExtract()');assert.equal(a.run('Object.keys(S.listings).length'),0);
 assert.equal(a.calls.some(c=>c.path==='/api/listings'),false);assert.match(a.node('#view').innerHTML,/Review needed/);
 assert.match(a.node('#view').innerHTML,/voice-hint-availability/);assert.match(a.node('#view').innerHTML,/Missing/);
 field(a,'price','175000');field(a,'business_name','My family farm');a.run('A.voiceConfirm()');
 assert.equal(a.run('S.listings[B().id].structured.price'),175000);
 assert.equal(a.run('S.listings[B().id].structured.business_name'),'My family farm');
 assert.ok(a.run('S.listings[B().id].confirmed_at'));
});

test('confirmation uses existing listing POST and reports synced only after acceptance',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/voice/proposal'?ok(proposal()):null});open(a);type(a,'Roast coffee.');
 await a.run('A.voiceExtract()');await a.run('flush()');assert.equal(a.calls.some(c=>c.path==='/api/listings'),false);
 a.run('A.voiceConfirm()');await a.run('flush()');const writes=a.calls.filter(c=>c.path==='/api/listings');assert.equal(writes.length,1);
 assert.equal(JSON.parse(writes[0].body).L.structured.price,150000);
 assert.match(a.run('S.lsync[B().id]'),/Synced/);
});

test('processing failure or missing listing preserves transcript and edited fields',async()=>{
 for(const response of [{ok:false,status:503},ok({...proposal(),listing:null})]){
 const a=await app({handler:async p=>p==='/api/voice/proposal'?response:null});open(a);type(a,'keep my transcript');a.run('A.voiceManual()');field(a,'experience_title','keep my edits');
 await a.run('A.voiceExtract()');assert.equal(a.run('voiceDraft().transcript'),'keep my transcript');assert.equal(a.run('voiceDraft().fields.experience_title'),'keep my edits');
 assert.match(a.node('#view').innerHTML,/Processing unavailable/);assert.equal(a.run('Object.keys(S.listings).length'),0);
 }
});

test('cleared values stay missing and stale transcript blocks save until reviewed again',async()=>{
 const a=await app({handler:async p=>p==='/api/voice/proposal'?ok(proposal()):null});open(a);type(a,'original');await a.run('A.voiceExtract()');
 field(a,'price','');type(a,'changed');a.run('A.voiceConfirm()');assert.equal(a.run('Object.keys(S.listings).length'),0);
 a.run('A.voiceManual()');a.run('A.voiceConfirm()');assert.equal(a.run('S.listings[B().id].structured.price'),null);
});

test('model fallback is labelled honestly and edits during inference win over stale response',async()=>{
 let finish;const a=await app({handler:async p=>p==='/api/voice/proposal'?new Promise(resolve=>finish=resolve):null});open(a);type(a,'first');const pending=a.run('A.voiceExtract()');await settle();type(a,'second');finish(ok(proposal()));await pending;
 assert.equal(a.run('voiceDraft().transcript'),'second');assert.equal(a.run('voiceDraft().ready'),false);
 const b=await app({handler:async p=>p==='/api/voice/proposal'?ok({...proposal(),extractor:{type:'deterministic_fallback',model:'regex'}}):null});open(b);type(b,'hello');await b.run('A.voiceExtract()');assert.match(b.node('#view').innerHTML,/Basic deterministic fallback/);
});

test('record stop transcribes real blob then waits for explicit extraction',async()=>{
 const a=await app({handler:async p=>p==='/api/voice/transcribe'?ok({transcript:'Hola, tostamos café.',language:'es'}):null});open(a);let stopped=0;
 a.context.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 class Recorder{constructor(){this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'])});this.done=this.onstop()}}
 a.context.window.MediaRecorder=Recorder;await a.run('A.voiceRecord()');const recorder=a.run('voiceDraft().recorder');await a.run('A.voiceRecord()');await recorder.done;
 assert.equal(stopped,1);assert.equal(a.run('voiceDraft().transcript'),'Hola, tostamos café.');assert.equal(a.run('voiceDraft().language'),'es');
 assert.equal(a.calls.some(c=>c.path==='/api/voice/proposal'),false);assert.equal(a.run('Object.keys(S.listings).length'),0);
 assert.ok(a.calls.find(c=>c.path==='/api/voice/transcribe').body.get('audio') instanceof Blob);
});

test('unavailable STT preserves existing transcript and stops the microphone',async()=>{
 const a=await app({handler:async p=>p==='/api/voice/transcribe'?{ok:false,status:503}:null});open(a);type(a,'preserve');let stopped=0;
 a.context.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})};
 class Recorder{constructor(){this.mimeType='audio/webm'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'])});this.done=this.onstop()}}
 a.context.window.MediaRecorder=Recorder;await a.run('A.voiceRecord()');const recorder=a.run('voiceDraft().recorder');await a.run('A.voiceRecord()');await recorder.done;
 assert.equal(stopped,1);assert.equal(a.run('voiceDraft().transcript'),'preserve');assert.match(a.node('#view').innerHTML,/Transcription unavailable/);
});

test('draft belongs to its business even when a request finishes after navigation',async()=>{
 let finish;const a=await app({handler:async p=>p==='/api/voice/proposal'?new Promise(resolve=>finish=resolve):null});open(a);type(a,'Noor offering');const pending=a.run('A.voiceExtract()');await settle();
 a.run('S.myBiz="darto"');finish(ok(proposal()));await pending;assert.equal(a.run('voiceDraft().ready'),false);
 a.run('S.myBiz="noor"');assert.equal(a.run('voiceDraft().ready'),true);assert.equal(a.run('Object.keys(S.listings).length'),0);
});

test('invalid manual fields and storage failure never create a persistent listing',async()=>{
 const a=await app();open(a);a.run('A.voiceManual()');field(a,'experience_title','Workshop');field(a,'price','-1');a.run('A.voiceConfirm()');assert.equal(a.run('Object.keys(S.listings).length'),0);
 field(a,'price','');a.context.localStorage.setItem=()=>{throw new Error('full')};a.run('A.voiceConfirm()');assert.equal(a.run('Object.keys(S.listings).length'),0);assert.match(a.run('voiceDraft().status'),/Storage failed/);
});

test('cached shell includes voice UI script before app boot',()=>{
 const html=fs.readFileSync(path.join(root,'frontend/index.html'),'utf8');assert.ok(html.indexOf('./voice-listing.js')<html.indexOf('./app.js'));
 assert.match(fs.readFileSync(path.join(root,'frontend/sw.js'),'utf8'),/"\/voice-listing.js"/);
});

test('field edits during extraction are preserved over the late model proposal',async()=>{
 let finish;const a=await app({handler:async p=>p==='/api/voice/proposal'?new Promise(resolve=>finish=resolve):null});open(a);type(a,'my offering');a.run('A.voiceManual()');const pending=a.run('A.voiceExtract()');await settle();field(a,'experience_title','my own title');finish(ok(proposal()));await pending;
 assert.equal(a.run('voiceDraft().fields.experience_title'),'my own title');assert.equal(a.run('Object.keys(S.listings).length'),0);
});
const emptyListing=()=>({business_name:null,experience_title:null,description:null,price:null,currency:null,duration_minutes:null,activities:[],availability:[]});
const listingPosts=a=>a.calls.filter(c=>c.path==='/api/listings');
const localListing=a=>{open(a);type(a,'My confirmed offering');a.run('A.voiceManual()');field(a,'experience_title','My workshop');a.run('A.voiceConfirm()')};

for(const lang of ['en','id'])for(const partial of [false,true])test(`invalid_model_output remains editable and human-confirmed: ${lang}, partial=${partial}`,async()=>{
 const listing=partial?{...emptyListing(),experience_title:'Safe title',price:0,activities:['pottery']}:emptyListing();
 const a=await app({handler:async p=>p==='/api/voice/proposal'?ok({...proposal(),listing,error:'invalid_model_output',requires_confirmation:true}):null});
 open(a);a.run(`S.blang='${lang}'`);type(a,'Original transcript');a.run("voiceDraft().activityOther='old value';voiceDraft().stale=true");await a.run('A.voiceExtract()');
 assert.equal(a.run('voiceDraft().ready'),true);assert.equal(a.run('voiceDraft().stale'),false);assert.equal(a.run('voiceDraft().transcript'),'Original transcript');
 for(const [key,value] of Object.entries(listing))assert.equal(a.run(`voiceDraft().fields['${key}']`),Array.isArray(value)?value.join(', '):value==null?'':String(value));
 const html=a.node('#view').innerHTML;assert.match(html,/id="voice-fields"/);assert.match(html,/id="voice-business_name"[^>]*value=""/);
 assert.match(html,lang==='en'?/The AI could not safely extract all fields/:/AI tidak dapat mengekstrak semua informasi dengan aman/);assert.doesNotMatch(html,/Processing unavailable|old value/);
 assert.equal(a.run('Object.keys(S.listings).length'),0);assert.equal(listingPosts(a).length,0);
 field(a,'experience_title','Reviewed title');a.run('voiceRefresh()');assert.match(a.node('#view').innerHTML,/value="Reviewed title"/);assert.equal(a.run('Object.keys(S.listings).length'),0);
 a.run('A.voiceConfirm()');assert.equal(a.run('S.listings[B().id].structured.experience_title'),'Reviewed title');assert.equal(a.run('S.listings[B().id].transcript'),'Original transcript');
});

for(const lang of ['en','id'])test(`owner sees local save immediately and success only after POST: ${lang}`,async()=>{
 let finish;const a=await app({online:true,handler:async p=>p==='/api/listings'?new Promise(resolve=>finish=resolve):null});
 open(a);a.run(`S.blang='${lang}'`);type(a,'Offering');a.run('A.voiceManual()');field(a,'experience_title','My workshop');a.run('A.voiceConfirm()');await settle();
 assert.equal(a.run('S.lsync[B().id]'),'Listing saved on this device. Syncing…');
 assert.match(a.node('#over').innerHTML,lang==='en'?/Syncing…/:/Sedang menyinkronkan…/);assert.doesNotMatch(a.node('#over').innerHTML,/saved and synced|tersimpan dan tersinkron/);
 // Feedback must update even if focus prevents a full rerender.
 a.context.document.activeElement={tagName:'INPUT'};
 finish(ok({ok:true,action:'updated',experience:{id:'existing'}}));await a.run('flush()');
 assert.equal(a.run('S.lsync[B().id]'),'Synced. Guests can find it now.');
 assert.match(a.node('#over').innerHTML,lang==='en'?/Listing saved and synced with YoloWisata/:/Daftar tersimpan dan tersinkron dengan YoloWisata/);
 assert.equal(a.node('[data-voice-sync]').textContent,lang==='en'?'Synced. Guests can find it now.':'Tersinkron. Tamu sekarang dapat menemukannya.');
 const stored=JSON.parse(a.stored.get('yolowisata-v3'));assert.equal(stored.lsync.noor,'Synced. Guests can find it now.');assert.ok(Object.keys(stored.acked).some(k=>k.startsWith('listings/')));
});

for(const failure of ['network',503])test(`listing survives retryable sync failure ${failure}`,async()=>{
 let broken=true;const a=await app({online:true,handler:async p=>{if(p!=='/api/listings')return null;if(!broken)return ok({ok:true});if(failure==='network')throw new Error('offline');return {ok:false,status:failure}}});
 localListing(a);await a.run('flush()');const snapshot=a.run('JSON.stringify(S.listings.noor)');
 assert.equal(a.run('S.lsync.noor'),'Saved on this device. Server sync will retry.');assert.match(a.node('#view').innerHTML,/Server sync will retry/);
 assert.equal(a.run('Object.keys(S.acked).filter(k=>k.startsWith("listings/")).length'),0);assert.equal(listingPosts(a).length,1);
 broken=false;await a.run('flush()');assert.equal(listingPosts(a).length,2);assert.equal(a.run('JSON.stringify(S.listings.noor)'),snapshot);assert.equal(a.run('S.lsync.noor'),'Synced. Guests can find it now.');
});

for(const status of [400,409,422])test(`permanent listing ${status} remains local, visible, and acknowledged`,async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/listings'?{ok:false,status}:null});localListing(a);await a.run('flush()');
 assert.equal(a.run('S.listings.noor.structured.experience_title'),'My workshop');assert.equal(a.run('S.lsync.noor'),'Saved on this device, but server sync needs attention.');assert.match(a.node('#view').innerHTML,/server sync needs attention/);
 const stored=JSON.parse(a.stored.get('yolowisata-v3'));assert.ok(stored.listings.noor);assert.ok(Object.keys(stored.acked).some(k=>k.startsWith('listings/')));
 await a.run('flush()');assert.equal(listingPosts(a).length,1);
 // A newly confirmed save is a distinct operation, even with unchanged fields.
 a.run('A.voiceManual();A.voiceConfirm()');await a.run('flush()');assert.equal(listingPosts(a).length,2);
});

test('unmigrated custom business stays local with attention feedback',async()=>{
 const a=await app({online:true,handler:async p=>p==='/api/listings'?{ok:false,status:400}:null});open(a);
 a.run('S.custom.push({...B(),id:"clocal",custom:true});S.myBiz="clocal"');type(a,'Custom');a.run('A.voiceManual()');field(a,'experience_title','Local offering');a.run('A.voiceConfirm()');await a.run('flush()');
 assert.equal(JSON.parse(listingPosts(a)[0].body).id,'clocal');assert.equal(a.run('S.listings.clocal.structured.experience_title'),'Local offering');assert.match(a.run('S.lsync.clocal'),/needs attention/);
});

test('old in-flight success does not mark a newer local save synced',async()=>{
 let finish;const a=await app({online:true,handler:async p=>p==='/api/listings'?new Promise(resolve=>finish=resolve):null});localListing(a);await settle();
 const oldTs=a.run('S.lts.noor');a.run('A.voiceManual()');field(a,'experience_title','New offering');a.run('A.voiceConfirm()');assert.ok(a.run('S.lts.noor')>oldTs);
 finish(ok({ok:true}));await a.run('flush()');assert.equal(a.run('S.lsync.noor'),'Listing saved on this device. Syncing…');assert.doesNotMatch(a.node('#over').innerHTML,/saved and synced/);
});

test('listing success toast is only shown to its owner on listing screen',async()=>{
 for(const screen of ['explore','b-msgs']){
 let finish;const a=await app({online:true,handler:async p=>p==='/api/listings'?new Promise(resolve=>finish=resolve):null});localListing(a);await settle();a.run(`go('${screen}')`);finish(ok({ok:true}));await a.run('flush()');assert.doesNotMatch(a.node('#over').innerHTML,/saved and synced/);assert.equal(a.run('S.lsync.noor'),'Synced. Guests can find it now.');}
});

test('array clear intent is explicit; untouched missing arrays are not deletions',async()=>{
 const a=await app();localListing(a);assert.deepEqual(JSON.parse(a.run('JSON.stringify(S.listings.noor.confirmed_empty_fields)')),[]);
 a.run('A.voiceManual()');
 for(const [chip,value] of [['activity','coffee_roasting'],['day','monday']])for(let i=0;i<2;i++)a.run(`voiceChip({dataset:{chip:'${chip}',v:'${value}'}})`);
 a.run('A.voiceConfirm()');assert.deepEqual(JSON.parse(a.run('JSON.stringify(S.listings.noor.confirmed_empty_fields)')),['activities','availability']);
 assert.deepEqual(JSON.parse(a.run('JSON.stringify(S.listings.noor.structured.activities)')),[]);assert.deepEqual(JSON.parse(a.run('JSON.stringify(S.listings.noor.structured.availability)')),[]);
});

test('accepted new extraction resets previous array-clear intent',async()=>{
 const a=await app({handler:async p=>p==='/api/voice/proposal'?ok({...proposal(),listing:{...emptyListing(),experience_title:'New'}}):null});open(a);type(a,'Transcript');a.run("A.voiceManual();voiceChip({dataset:{chip:'day',v:'monday'}});voiceChip({dataset:{chip:'day',v:'monday'}})");await a.run('A.voiceExtract()');a.run('A.voiceConfirm()');assert.equal(a.run('S.listings.noor.confirmed_empty_fields.length'),0);
});

test('generated voice labels stay unique and target labelable controls in all duration modes',async()=>{
 const a=await app();open(a);a.run('A.voiceManual()');
 for(const lang of ['en','id'])for(const minutes of ['', '90','45'])for(const custom of [false,true]){
 a.run(`S.blang='${lang}';voiceDraft().fields.duration_minutes='${minutes}';voiceDraft().durationCustom=${custom};voiceRefresh()`);
 const html=a.node('#view').innerHTML,ids=new Map();
 for(const match of html.matchAll(/<([a-z]+)\b([^>]*)>/g)){const id=/\bid="([^"]+)"/.exec(match[2]);if(id){assert.ok(!ids.has(id[1]),id[1]);ids.set(id[1],{tag:match[1],attrs:match[2]})}}
 for(const label of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)){const target=ids.get(label[1]);assert.ok(target,label[1]);assert.ok(['input','select','textarea','button'].includes(target.tag));assert.doesNotMatch(target.attrs,/type="hidden"/)}
 for(const key of ['activities','availability','duration_minutes']){assert.ok(ids.has('voice-label-'+key));assert.ok(html.includes(`aria-labelledby="voice-label-${key}"`))}
 assert.equal(html.includes('for="voice-duration_minutes"'),custom||minutes==='45');
 }
});

test('voiceRequest keeps useful HTTP detail and its 180 second timeout',async()=>{
 const a=await app({handler:async p=>p==='/api/voice/proposal'?{ok:false,status:422,json:async()=>({detail:'Transcript required',stack:'SECRET'})}:null});
 await assert.rejects(a.run("voiceRequest('/api/voice/proposal',{method:'POST'})"),e=>e.message==='Transcript required');
 let signal;const b=await app({handler:async(p,options)=>p==='/api/voice/proposal'?new Promise((resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new Error('aborted')))}):null});
 const pending=b.run("voiceRequest('/api/voice/proposal',{method:'POST'})"),rejected=assert.rejects(pending,/aborted/);const timer=[...b.timers].find(([,t])=>t.delay===180000);assert.ok(timer);timer[1].fn();await rejected;assert.ok(signal.aborted);assert.equal(b.timers.has(timer[0]),false);
});

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
  Blob,FormData,Audio:BrowserAudio,URL:{createObjectURL:()=>`blob:tts-${played.length+1}`,revokeObjectURL:()=>{}},
  navigator:{onLine:online},document:{querySelector:k=>k==='#msg'?null:node(k),querySelectorAll:()=>[],addEventListener:()=>{},activeElement:null},
  localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},AbortController,
  console:{error:(...v)=>errors.push(v),warn:(...v)=>errors.push(v)},
  setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},clearTimeout:id=>timers.delete(id),setInterval:fn=>intervals.push(fn),
  fetch:async(url,options={})=>{const p=new URL(url).pathname;calls.push({path:p,...options});db.history.push(['fetch',p]);
   if(handler){const r=await handler(p,options);if(r)return r}
   return ok({});
  }
 });
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/voice-listing.js'),'utf8'),context);vm.runInContext(source,context);const run=s=>vm.runInContext(s,context);
 await settle();await run('syncPromise');
 return {db,stored,context,node,run,calls,events,intervals,timers,errors,spoken,played,selectLanguage:language=>run(`A.lang({dataset:{lang:${JSON.stringify(language)}}})`),
  create:async(text='I loved roasting coffee.')=>{run(`S.draft.t=${JSON.stringify(text)}`);await run('A.send()')},
  posts:()=>calls.filter(c=>c.path==='/api/postcards'),
  connect:async()=>{context.navigator.onLine=true;await events.online()},
  disconnect:()=>{context.navigator.onLine=false;events.offline()}
 };
}

