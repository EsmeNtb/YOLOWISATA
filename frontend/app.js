/* ---------- Content. Loaded from /data/content.json (or from the backend). Edit the data there, not here. ---------- */
const API=((window.YOLO_CONFIG||{}).api||"").replace(/\/$/,"");
const DIMS={hands:"Hands-on",nature:"Nature",culture:"Local culture",food:"Food discovery",quiet:"Quiet places",crowds:"Crowded attractions"};
const PAL=["#FFC928","#47C882","#FF7043","#7193D8","#D6E8FA"];
const WHYG={hands:"You make something yourself",nature:"Time outdoors",culture:"A small local business with its own story",food:"Local food, made by locals",quiet:"Small groups, far from the crowds"};
const PB={en:{},id:{}},norm=t=>t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu,"").replace(/\s+/g," ").trim();   /* small sentence phrasebook for free-typed chat */
let CARDS=[],SECTORS={},SAMPLES={},BIZ0=[],LOVED={},ASKS={},LID={},IDEAS=[],IDEAID={},GQ=[],BR=[],IDQ={},PHR=[],POS={},GATE=[18,86];
function applyContent(c){CARDS=c.swipeCards;GATE=(c.village&&c.village.gate)||GATE;
 for(const k in c.sectors){const s=c.sectors[k];SECTORS[k]=[s.emoji,s.dna,s.suffix];SAMPLES[k]=s.sample}
 const lex=(src,dst)=>{for(const k in src){dst[k]=[src[k].en,src[k].words];LID[k]=src[k].id}};lex(c.themes.loved,LOVED);lex(c.themes.asks,ASKS);
 IDEAS=c.ideas||[];IDEAS.forEach(i=>IDEAID[i.title]=[i.title_id||i.title,i.text_id||i.text]);
 GQ=c.guestQuestions||[];GQ.forEach(q=>IDQ[q.t]=q.id);BR=c.ownerReplies||[];
 (c.phrasebook||[]).forEach(p=>{PB.en[norm(p.en)]=p.id;PB.id[norm(p.id)]=PB.id[norm(p.id)]||p.en[0].toUpperCase()+p.en.slice(1)});
 PHR=(c.phrases||[]).map(p=>[p.id,p.en,p.say,p.emoji]);
 BIZ0=c.businesses.map(b=>Object.assign({why:null,chips:[],story:"",L:{},cards:[],qs:[],bookings:[],threads:[],e:(SECTORS[b.sector]||SECTORS.Other)[0],col:"#FFC928",place:""},b,{dna:b.dna||(SECTORS[b.sector]||SECTORS.Other)[1]}));
 BIZ0.forEach(b=>{if(b.pos)POS[b.id]=b.pos})}
/* Deterministic multilingual lexicon fallback. The word lists live in content.json under "themes". */
const tagsOf=(txt,lex)=>{const s=txt.toLowerCase();return Object.keys(lex).filter(k=>lex[k][1].some(w=>s.includes(w)))};
const T=(id,en)=>S.blang==="en"?en:id;
const sectorText=k=>T(({All:"Semua",Farm:"Kebun",Craft:"Kerajinan",Food:"Makanan",Guide:"Pemandu",Homestay:"Homestay"})[k]||k,k);
const dimensionText=k=>T(({hands:"Praktik langsung",nature:"Alam",culture:"Budaya lokal",food:"Wisata kuliner",quiet:"Tempat tenang",crowds:"Tempat ramai"})[k]||DIMS[k],DIMS[k]);
const SPEECH_LOCALES={id:"id-ID",es:"es-ES",en:"en-US"};
function speechLanguage(value,fallback="id"){
 const code=String(value||"").toLowerCase().split(/[-_]/)[0];return SPEECH_LOCALES[code]?code:fallback}
let speechGeneration=0,ttsController=null,ttsAudio=null,ttsObjectUrl=null;
function stopCurrentSpeech(){
 if(ttsController)ttsController.abort();ttsController=null;
 if(ttsAudio){ttsAudio.pause();ttsAudio=null}
 if(ttsObjectUrl){URL.revokeObjectURL(ttsObjectUrl);ttsObjectUrl=null}
 if(typeof speechSynthesis!=="undefined")speechSynthesis.cancel()
}
function speakWithBrowser(text,code,rate){
 if(typeof speechSynthesis==="undefined"||typeof SpeechSynthesisUtterance==="undefined"){toast("This device cannot speak. Read it as: "+text);return}
 const voices=speechSynthesis.getVoices(),voice=voices.find(v=>String(v.lang||"").toLowerCase().startsWith(code));
 const u=new SpeechSynthesisUtterance(text);u.lang=SPEECH_LOCALES[code];u.rate=rate;if(voice)u.voice=voice;
 if(!voice){const name={id:"Indonesian",es:"Spanish",en:"English"}[code];toast(`No ${name} voice on this device, so it may sound off. Read it as: ${text}`)}
 speechSynthesis.speak(u)
}
async function playElevenLabs(text,code,generation,speed){
 const controller=new AbortController();ttsController=controller;const timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch(API+"/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,language:code,speed}),signal:controller.signal});
  if(!response.ok)throw new Error("TTS request failed.");
  const blob=await response.blob();if(generation!==speechGeneration)return;
  const url=URL.createObjectURL(blob);ttsObjectUrl=url;const audio=new Audio(url);ttsAudio=audio;
  await new Promise((resolve,reject)=>{
   audio.addEventListener("ended",resolve,{once:true});
   audio.addEventListener("error",()=>reject(new Error("TTS playback failed.")),{once:true});
   Promise.resolve(audio.play()).catch(reject)
  });
 }finally{
  clearTimeout(timeout);
  if(ttsController===controller)ttsController=null;
  if(generation===speechGeneration){if(ttsAudio){ttsAudio.pause();ttsAudio=null}if(ttsObjectUrl){URL.revokeObjectURL(ttsObjectUrl);ttsObjectUrl=null}}
 }
}
async function speakText(text,language,rate=1){
 const code=speechLanguage(language),generation=++speechGeneration;stopCurrentSpeech();
 if(API&&S.online&&navigator.onLine!==false){
  try{await playElevenLabs(text,code,generation,rate);return}catch(e){if(generation!==speechGeneration)return}
 }
 if(generation!==speechGeneration)return;
 stopCurrentSpeech();speakWithBrowser(text,code,rate)
}
const label=n=>n>=6?["strong",T("Pola kuat","Strong pattern")]:n>=3?["early",T("Sinyal awal","Early signal")]:["thin",T("Bukti belum cukup","Not enough evidence yet")];
const lab=(k,b)=>k==="host"?T("Mengobrol dengan ","Talking with ")+b.host:T(LID[k]||k,(LOVED[k]||ASKS[k]||[k])[0]);
const RID=[["per person","per orang"],["About ","Sekitar "],[" hours"," jam"],["Every day","Setiap hari"],[" mornings"," pagi"],["Saturday","Sabtu"],["Sunday","Minggu"],["Monday","Senin"],["Tuesday","Selasa"],["Wednesday","Rabu"],["Thursday","Kamis"],["Friday","Jumat"],[" and "," dan "],["A guided walk","jalan keliling"],["Picking coffee cherries","petik kopi"],["Roasting your own coffee","sangrai kopi sendiri"],["Drinking the coffee","minum kopi"],["Wood carving","mengukir kayu"],["Making your own piece","membuat karya sendiri"],["Market shopping","belanja ke pasar"],["Cooking together","masak bersama"],["Tasting","mencicipi"],["Weaving","menenun"],["Coffee Farm Experience","Wisata Kebun Kopi"],["Coffee Farm","Kebun Kopi"],["Farm Experience","Wisata Kebun"],["Wood Workshop","Bengkel Kayu"],["Workshop","Bengkel"],["Kitchen","Dapur"],["Guided Walk","Jalan Keliling"],["Experience","Wisata"],["A visit in","Kunjungan di"],["Sat ","Sab "],["Sun ","Min "],["Mon ","Sen "],["Tue ","Sel "],["Wed ","Rab "],["Thu ","Kam "],["Fri ","Jum "],[" Oct"," Okt"],[" Dec"," Des"],[" Aug"," Agu"],[" May"," Mei"]];
const CHID={Coffee:"Kopi",Nature:"Alam","Hands-on":"Praktik langsung",Storytelling:"Cerita",Scenic:"Pemandangan indah","Family-friendly":"Ramah keluarga",Woodwork:"Kayu",Craft:"Kerajinan","Take it home":"Bisa dibawa pulang","Home cooking":"Masakan rumah","Market visit":"Ke pasar",Family:"Keluarga","New on YoloWisata":"Baru bergabung",Farm:"Kebun",Food:"Makanan",Guide:"Pemandu",Other:"Lainnya"};
function tv(v){if(S.blang==="en"||!v)return v;let o=String(v).replace(/A (\d+)-hour visit in/,"Kunjungan $1 jam di");RID.forEach(([a,b])=>{o=o.replace(new RegExp(a,"gi"),b)});
 o=o.replace(/^((?:Pak |Ibu )?[^\s’]+)’s (.+)$/,"$2 $1");return o[0].toUpperCase()+o.slice(1)}
/* what the owner reads: Indonesian by default, English on request; null means no translation is available */
const ownerText=e=>{if(S.blang==="en")return e.en||null;if(e.loc||e.l==="Indonesian")return null;return e.idt||IDQ[e.t]||null};

/* ---------- State, kept on the device ---------- */
const KEY="yolowisata-v3";
const newId=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const fresh=()=>({acct:null,gid:newId(),acked:{},bts:{},lts:{},screen:"land",role:"guest",guest:{n:"",f:"🌍"},blang:"id",learned:{},here:null,biz:"noor",myBiz:"noor",custom:[],online:true,i:0,likes:[],dna:null,saved:{},mine:[],hid:{},msgs:{},bookings:[],bstat:{},idea:{},listings:{},lsync:{},sector:"All",draft:{bg:"sun",s:[],p:0,t:"",voice:false,photo:""},tr:{}});
let S=fresh();
try{const r=localStorage.getItem(KEY);if(r)S=Object.assign(fresh(),JSON.parse(r))}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
let ui={modal:null,rec:0,edit:false,transcript:"",tid:"",newSector:"Craft",ltab:"guest"};
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const all=()=>BIZ0.concat(S.custom);
const biz=id=>all().find(b=>b.id===id)||BIZ0[0];
const B=()=>biz(S.role==="biz"?S.myBiz:S.biz);
const Lst=b=>Object.assign({},b.L,S.listings[b.id]);
const isHid=c=>!!(c.hidden||(S.hid||{})[c.id]);
const cardsOf=(b,own)=>b.cards.map((c,i)=>({...c,id:b.id+"-s"+i})).concat(S.mine.filter(m=>m.biz===b.id&&!m.removed)).filter(c=>own||!isHid(c));
const thread=(b,tid)=>((b.threads.find(t=>t.id===tid)||{}).msgs||[]).concat(S.msgs[b.id+":"+tid]||[]);
const gt=()=>"g"+S.gid;
/* after logging in on a new device: take over the account's guest id, and move anything made here under it */
function adopt(gid){if(!gid||gid===S.gid)return;const old=S.gid;S.mine.forEach(m=>{if(m.gid===old)m.gid=gid});S.bookings.forEach(k=>{if(k.gid===old)k.gid=gid});
 for(const k of Object.keys(S.msgs)){S.msgs[k].forEach(m=>{if(m.own===old)m.own=gid});if(k.endsWith(":g"+old)){const nk=k.slice(0,-old.length)+gid;S.msgs[nk]=(S.msgs[nk]||[]).concat(S.msgs[k]);delete S.msgs[k]}}
 S.acked={};S.gid=gid}   /* this guest's own thread id */
const threadsOf=b=>b.threads.concat(Object.keys(S.msgs).filter(k=>k.startsWith(b.id+":g")).map(k=>{const m=S.msgs[k].find(m=>m.from==="g")||{};return{id:k.slice(b.id.length+1),who:m.who||"Guest",f:m.f||"🌍"}}));
const bookingsOf=b=>b.bookings.map((k,i)=>({...k,id:b.id+"-b"+i,status:S.bstat[b.id+"-b"+i]||k.status})).concat(S.bookings.filter(k=>k.biz===b.id));
const MASCOT=`<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 14c27 0 46 19 46 45 0 29-21 49-46 49S14 88 14 59C14 33 33 14 60 14z" fill="#FF7043"/><circle cx="38" cy="70" r="7" fill="#FFC928" opacity=".9"/><circle cx="82" cy="70" r="7" fill="#FFC928" opacity=".9"/><path d="M40 58q6 7 12 0M68 58q6 7 12 0M50 74q10 10 20 0" fill="none" stroke="#171717" stroke-width="4" stroke-linecap="round"/></svg>`;
const pos=b=>POS[b.id]||[50,42];
const kmTo=b=>S.here?(Math.hypot(pos(b)[0]-S.here[0],pos(b)[1]-S.here[1])*.06).toFixed(1):null;
function mapSVG(list){const X=v=>v*3.6,Y=v=>v*2.1;
 return `<svg viewBox="0 0 360 210" role="img" aria-label="Sketch map of the village with ${list.length} places"><rect width="360" height="210" fill="#D6E8FA"/>
 <path d="M0 70 Q90 20 200 50 T360 30 V0 H0Z" fill="#B9EBD1"/><path d="M0 210 V150 Q120 120 220 160 T360 140 V210Z" fill="#B9EBD1"/>
 <path d="M${X(GATE[0])} ${Y(GATE[1])} Q130 150 ${X(38)} ${Y(58)} T${X(70)} ${Y(22)}" fill="none" stroke="#FFF9F0" stroke-width="9" stroke-linecap="round"/>
 ${list.map(b=>`<g><circle cx="${X(pos(b)[0])}" cy="${Y(pos(b)[1])}" r="15" fill="${b.col}" stroke="#FFFFFF" stroke-width="3"/><text x="${X(pos(b)[0])}" y="${Y(pos(b)[1])+6}" text-anchor="middle" font-size="16">${b.e}</text><text x="${X(pos(b)[0])}" y="${Y(pos(b)[1])+30}" text-anchor="middle" font-size="10" font-weight="700" fill="#171717">${esc(b.host)}</text></g>`).join("")}
 <g><circle cx="${X(S.here[0])}" cy="${Y(S.here[1])}" r="13" fill="#FF7043" opacity=".3"/><circle cx="${X(S.here[0])}" cy="${Y(S.here[1])}" r="6" fill="#FF7043" stroke="#FFFFFF" stroke-width="2.5"/><text x="${X(S.here[0])+16}" y="${Y(S.here[1])+4}" font-size="10" font-weight="700" fill="#171717">You</text></g></svg>`}
const STEPS=[["login","Explora como invitado o inicia sesión","Browse as a guest, or log in","Todos","Everyone"],["swipe","Descubre tu DNA de Viaje","Discover your Travel DNA","Invitado","Guest"],["match","Encuentra negocios locales compatibles","Get matched to local businesses","Invitado","Guest"],["exp","Mira la experiencia de Noor","View Noor’s experience","Invitado","Guest"],["inbox","Envía mensajes a negocios en distintos idiomas","Message local businesses across languages","Invitado","Guest"],["trips","Solicita una visita","Ask to book a visit","Invitado","Guest"],["help","Frases para conversar en persona","Phrase cards for talking face to face","Invitado","Guest"],["card","Deja una tarjeta postal","Leave a postcard","Invitado","Guest"],["story","La historia de este lugar","The Story of This Place","Invitado","Guest"],["b-list","Describe tu negocio con voz","Describe the business by voice","Negocio local","Local business"],["b-msgs","Responde a los mensajes traducidos","Reply to guests, translated","Negocio local","Local business"],["b-book","Confirma o rechaza visitas","Confirm or decline bookings","Negocio local","Local business"],["b-insights","Descubre qué recuerdan los visitantes","See what visitors remember","Negocio local","Local business"]];

/* ---------- AI 1: Travel DNA and matching ---------- */
function computeDNA(){const d={};for(const k in DIMS){let tot=0,yes=0;CARDS.forEach((c,i)=>{if(c.g.includes(k)){tot++;if(S.likes[i])yes++}});d[k]=yes/tot}return d}
function matchOf(b){const d=S.dna||computeDNA();let diff=0;for(const k in DIMS)diff+=Math.abs(d[k]-b.dna[k]);
 const w=b.why||WHYG;return{score:Math.round((1-diff/6)*100),why:Object.keys(w).filter(k=>d[k]>=.5&&b.dna[k]>=.5).map(k=>w[k])}}

/* ---------- AI 4: Experience DNA from postcards, questions and guest messages ---------- */
function analyse(b){const hw=b.host.toLowerCase().split(" ").pop(),LV=Object.assign({},LOVED,LOVED.host?{host:[LOVED.host[0],LOVED.host[1].concat(hw)]}:{});const cards=b.cards.concat(S.mine.filter(m=>m.biz===b.id&&m.status==="sent"&&!m.removed));
 let qs=b.qs.slice(),waiting=S.mine.filter(m=>m.biz===b.id&&m.status!=="sent"&&!m.removed).length;
 for(const k in S.msgs)if(k.startsWith(b.id+":"))S.msgs[k].forEach(m=>{if(m.from==="g"){if(m.sync==="pending")waiting++;else qs.push({f:m.f||S.guest.f,t:m.t,loc:(m.f||S.guest.f)==="🇮🇩"?1:0})}});
 const loved={},asks={},ev={},seg={intl:{},loc:{}};
 const add=(o,k,item)=>{o[k]=(o[k]||0)+1;(ev[k]=ev[k]||[]).push(item)};
 cards.forEach(c=>{tagsOf(c.t,LV).forEach(k=>add(loved,k,c));tagsOf(c.t,ASKS).forEach(k=>add(asks,k,c))});
 qs.forEach(q=>tagsOf(q.t,ASKS).forEach(k=>{add(asks,k,q);const g=q.loc?"loc":"intl";seg[g][k]=(seg[g][k]||0)+1}));
 return{loved,asks,ev,seg,cardAsk:k=>(ev[k]||[]).filter(x=>x.n).length,qAsk:k=>(ev[k]||[]).filter(x=>!x.n).length,nCards:cards.length,nQ:qs.length,waiting}}

/* Online insights are read-only and kept separately from the on-device analyzer/state.
   Only the seeded Noor alias has a known database counterpart; never fuzzy-match businesses. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const insightCache=new Map();
let noorInsightId=null;
const insightBusiness=()=>S.role==="biz"&&["b-insights","b-journey"].includes(S.screen)?all().find(b=>b.id===S.myBiz):null;
const canFetchInsights=b=>!!(b&&API&&S.online&&navigator.onLine!==false&&(UUID.test(b.id)||b.id==="noor"));
function adaptInsights(data){
 const object=v=>v&&typeof v==="object"&&!Array.isArray(v);
 const count=v=>Number.isSafeInteger(v)&&v>=0;
 if(!object(data)||!count(data.postcards)||!count(data.questions)||!object(data.segments))throw new Error("Invalid insights");
 const out={source:"backend",loved:{},asks:{},ev:{},evidence:{loved:{},asks:{}},labels:{loved:{},asks:{}},seg:{intl:{},loc:{}},nCards:data.postcards,nQ:data.questions,waiting:0};
 for(const group of ["loved","asks"]){
  if(!object(data[group]))throw new Error("Invalid insight themes");
  for(const [k,e] of Object.entries(data[group])){
   if(!object(e)||!count(e.count)||typeof e.label!=="string"||!Array.isArray(e.quotes)||!e.quotes.every(q=>typeof q==="string"))throw new Error("Invalid insight evidence");
   // Quotes have no author, language or postcard/question attribution in this API.
   Object.defineProperty(out[group],k,{value:e.count,enumerable:true});
   Object.defineProperty(out.labels[group],k,{value:e.label,enumerable:true});
   Object.defineProperty(out.evidence[group],k,{value:e.quotes.map(t=>({t,backend:true})),enumerable:true});
  }
 }
 for(const [remote,local] of [["international","intl"],["local","loc"]]){
  if(!object(data.segments[remote])||!Object.values(data.segments[remote]).every(count))throw new Error("Invalid insight segments");
  out.seg[local]={...data.segments[remote]};
 }
 return out;
}
function insightsFor(b){
 if(b.id===S.myBiz&&canFetchInsights(b)){
  const entry=insightCache.get(b.id);
  if(entry&&entry.data)return entry.data;
  if(!entry||(entry.status==="loading"&&!entry.fallback))return {...adaptInsights({loved:{},asks:{},segments:{international:{},local:{}},postcards:0,questions:0}),source:"loading"};
 }
 return {...analyse(b),source:"local"};
}
function insightLabel(a,group,k){
 if(a.source!=="backend")return label(a[group][k]||0);
 const value=a.labels[group][k];
 if(value==="Strong pattern")return ["strong",T("Pola kuat",value)];
 if(value==="Early signal")return ["early",T("Sinyal awal",value)];
 return ["thin",value==="Not enough evidence yet"?T("Bukti belum cukup",value):value];
}
function insightIdea(a){
 return IDEAS.find(i=>(a.loved[i.need[0]]||0)>=6&&(a.asks[i.need[1]]||0)>=3&&
  (a.source!=="backend"||(a.labels.loved[i.need[0]]==="Strong pattern"&&
   ["Early signal","Strong pattern"].includes(a.labels.asks[i.need[1]])&&
   a.evidence.loved[i.need[0]].length&&a.evidence.asks[i.need[1]].length)));
}
async function insightJSON(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
 try{
  const response=await fetch(API+path,{method:"GET",cache:"no-store",signal:controller.signal});
  if(!response.ok)throw new Error("HTTP "+response.status);
  return await response.json();
 }finally{clearTimeout(timer)}
}
async function refreshInsights(force=false){
 const b=insightBusiness();if(!canFetchInsights(b))return;
 const previous=insightCache.get(b.id);
 if(previous&&(previous.status==="loading"||(!force&&Date.now()-previous.at<8000)))return previous.pending;
 const entry={status:"loading",at:Date.now(),data:previous&&previous.data,fallback:previous&&previous.status==="failed"};
 insightCache.set(b.id,entry);
 entry.pending=(async()=>{
  try{
   let id=b.id;
   if(id==="noor"){
    if(!noorInsightId){
     const result=await insightJSON("/api/businesses");
     const matches=result.ok===true&&Array.isArray(result.businesses)?result.businesses.filter(row=>row.name==="Noor Coffee Farm"):[];
     if(matches.length!==1||!UUID.test(matches[0].id))throw new Error("No unique Noor business");
     noorInsightId=matches[0].id;
    }
    id=noorInsightId;
   }
   if(insightCache.get(b.id)!==entry||!canFetchInsights(b))return;
   const data=adaptInsights(await insightJSON("/api/businesses/"+encodeURIComponent(id)+"/insights"));
   if(insightCache.get(b.id)!==entry||!canFetchInsights(b))return;
   entry.data=data;entry.status="ready";
  }catch(e){entry.data=null;entry.status="failed"}
  finally{
   entry.at=Date.now();
   // Refresh only these read-only views; do not trigger the legacy write queue.
   if(insightCache.get(b.id)===entry&&insightBusiness()?.id===b.id){$("#view").innerHTML=V[S.screen]();renderOver()}
  }
 })();
 return entry.pending;
}

/* ---------- AI 2: voice note to listing (rule-based extraction, nothing invented) ---------- */
function extract(t,b){const s=t.toLowerCase(),o={},num={satu:1,dua:2,tiga:3,empat:4,lima:5,enam:6};
 let m=s.match(/nama saya ([a-z]+)/);if(m)o.name=m[1][0].toUpperCase()+m[1].slice(1)+"’s "+(s.includes("kopi")?"Coffee Farm Experience":(SECTORS[b.sector]||SECTORS.Other)[2]);
 m=s.match(/(\d{2,4})\s*(?:[.,]000|ribu|rb)/);if(m)o.price="Rp"+m[1]+".000 per person";
 m=s.match(/(\d+|satu|dua|tiga|empat|lima|enam)\s*jam/);if(m)o.duration="About "+(num[m[1]]||m[1])+" hours";
 const acts=[["keliling","A guided walk"],["petik","Picking coffee cherries"],["sangrai","Roasting your own coffee"],["minum","Drinking the coffee"],["cicip","Tasting"],["ukir","Wood carving"],["membuat","Making your own piece"],["pasar","Market shopping"],["masak","Cooking together"],["tenun","Weaving"]].filter(a=>s.includes(a[0])).map(a=>a[1]);
 if(acts.length)o.activities=acts.join(", ");
 const days=[["senin","Monday"],["selasa","Tuesday"],["rabu","Wednesday"],["kamis","Thursday"],["jumat","Friday"],["sabtu","Saturday"],["minggu","Sunday"]].filter(d=>s.includes(d[0])).map(d=>d[1]);
 if(s.includes("setiap hari"))o.availability="Every day";else if(days.length)o.availability=days.join(" and ")+(s.includes("pagi")?" mornings":"");
 if(o.activities)o.description=(o.duration?o.duration.replace("About ","A ").replace(" hours","-hour")+" visit":"A visit")+" in "+b.place+": "+o.activities.toLowerCase()+".";
 return o}
const FIELDS=[["name","Nama","Name"],["description","Deskripsi","Description"],["price","Harga","Price"],["duration","Lama","Duration"],["activities","Kegiatan","Activities"],["availability","Buka","Availability"]];
const sampleFor=b=>SAMPLES[b.sector]||SAMPLES.Other;

const farmSVG=(mail,vb)=>`<svg viewBox="${vb||"0 0 390 590"}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<rect width="390" height="590" fill="#D6E8FA"/><circle cx="312" cy="250" r="46" fill="#FFE9A3"/><circle cx="312" cy="250" r="30" fill="#FFC928"/>
<path d="M0 330 Q70 270 150 310 T300 290 T390 320 V590 H0Z" fill="#B9EBD1"/>
<path d="M0 380 Q110 320 220 370 T390 360 V590 H0Z" fill="#7FDAAA"/>
<path d="M0 450 Q130 400 260 440 T390 430 V590 H0Z" fill="#47C882"/>
<g fill="#2FA869">${[[30,405],[78,392],[126,398],[262,402],[312,394],[358,404],[52,470],[330,476],[20,520],[368,528]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="20" ry="13"/>`).join("")}</g>
<g fill="#FF7043">${[[24,402],[36,409],[82,389],[120,400],[268,399],[306,396],[318,391],[354,406],[48,468],[334,473],[26,518],[362,530]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.6"/>`).join("")}</g>
<path d="M170 590 Q185 500 195 470 Q205 500 225 590Z" fill="#FFF9F0"/>
${mail?`<g><rect x="191" y="478" width="9" height="62" rx="3" fill="#7193D8"/><rect x="163" y="440" width="66" height="44" rx="20" fill="#FF7043"/><rect x="176" y="455" width="40" height="5" rx="2.5" fill="#FFF9F0"/><rect x="229" y="438" width="5" height="26" fill="#7193D8"/><path d="M234 438 h16 v12 h-16z" fill="#FFC928"/><rect x="184" y="430" width="22" height="15" rx="2" fill="#FFFFFF" transform="rotate(-12 195 437)"/></g>`:""}
</svg>`;

/* ---------- Screens ---------- */
const V={};
V.land=()=>`<div class="splash"><div class="inner"><div class="mascot">${MASCOT.replaceAll("#FF7043","#FFC928").replaceAll('fill="#FFC928" opacity=".9"','fill="#FF7043" opacity=".55"')}</div>
<h1>${T("Jelajahi lokal. Tetap terhubung.","Travel local. Stay connected.")}</h1><p class="tagline">${T("Temukan tempatnya. Kenali orangnya.","Download the place. Discover the people.")} <em>${T("Nikmati saat ini, bahkan tanpa internet.","Live the moment, even offline.")}</em></p></div>
<div class="inner"><button class="btn sun wide" data-a="go" data-s="explore">${T("Mulai menjelajah","Start exploring")}</button>
<div class="row" style="margin-top:.7rem"><button class="btn" data-a="go" data-s="swipe">${T("Cari DNA Perjalanan saya","Find my Travel DNA")}</button><button class="btn" data-a="ltab" data-t="biz">${T("Saya menjalankan usaha","I run a business")}</button></div>
<p class="small" style="color:var(--ink);text-align:center;margin-top:1rem">${T("Tidak perlu akun untuk melihat-lihat. Dibuat untuk usaha lokal.","No account needed to look around. Built for real local businesses, not just the ones already online.")}</p></div></div>`;

V.login=()=>{const a=S.acct,biz=ui.ltab==="biz",flags=["🌍","🇮🇩","🇲🇽","🇬🇧","🇺🇸","🇩🇪","🇫🇷","🇯🇵","🇪🇸","🇮🇳","🇰🇷","🇧🇷","🇦🇺"];
 const phonePin=`<div class="row"><div style="flex:3"><label class="f" for="lp">${T("Nomor telepon","Phone number")}</label><input class="t" id="lp" inputmode="tel" autocomplete="tel" placeholder="0812…"></div><div style="flex:2"><label class="f" for="lpin">${T("PIN (4 sampai 6 digit)","PIN (4 to 6 digits)")}</label><input class="t" id="lpin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div></div>`;
 return `<div class="pad"><div class="hello">${MASCOT}<div><h1 style="font-size:1.7rem">${T("Akun Anda","Your account")}</h1><p class="sub">${a?T("Masuk sebagai ","Logged in as ")+esc(a.phone)+".":T("Anda menjelajah sebagai tamu. Itu saja yang diperlukan.","You are browsing as a guest. That is all you need.")}</p></div></div>
 <div class="tabs2"><button class="${biz?"":"on"}" data-a="ltab" data-t="guest">🧳 ${T("Tamu","Guest")}</button><button class="${biz?"on":""}" data-a="ltab" data-t="biz">🏡 ${T("Usaha lokal","Local business")}</button></div>
 ${biz?`
 <div class="box"><h3>${T("Masuk ke usaha Anda","Log in to your business")}</h3><p class="sub">${T("Gunakan nomor telepon dan PIN yang Anda daftarkan.","Use the phone number and PIN you registered with.")}</p>${phonePin}
 <button class="btn wide" style="margin-top:.9rem" data-a="blogin">${T("Masuk","Log in")}</button></div>
 <details class="box" ${ui.regOpen?"open":""}><summary data-a="regopen"><span><b>${T("Baru di sini? Daftarkan usaha Anda","New here? Register your business")}</b><br><span class="small">${T("Semua jenis usaha diterima: kebun, bengkel, dapur, homestay, pemandu, dan lainnya.","Any sector is welcome: farm, workshop, kitchen, homestay, guide and more")}</span></span></summary>
 <label class="f" for="bn">${T("Nama depan Anda","Your first name")}</label><input class="t" id="bn" maxlength="24" placeholder="${T("Contoh: Rina","For example Rina")}">
 <div style="margin-top:.6rem">${Object.keys(SECTORS).map(k=>`<button class="chip pick ${ui.newSector===k?"on":""}" data-a="nsec" data-s="${k}">${SECTORS[k][0]} ${sectorText(k)}</button>`).join("")}</div>
 <div class="row"><div style="flex:3"><label class="f" for="rp">${T("Nomor telepon","Phone number")}</label><input class="t" id="rp" inputmode="tel" placeholder="0812…"></div><div style="flex:2"><label class="f" for="rpin">${T("Pilih PIN","Choose a PIN")}</label><input class="t" id="rpin" type="password" inputmode="numeric" maxlength="6"></div></div>
 <button class="btn sun wide" style="margin-top:.9rem" data-a="register">${T("Daftar dan jelaskan usaha dengan suara","Register and describe it by voice")}</button>
 ${API?"":`<p class="small" style="margin-top:.5rem">${T("Nomor telepon dan PIN opsional tanpa server; usaha ini hanya tersimpan di perangkat ini.","No server is connected, so the phone number and PIN are optional and this business lives on this device only.")}</p>`}</details>
 <details class="box"><summary><b>${T("Coba usaha contoh","Try a sample business")}</b> <span class="small">${T("tanpa login","no login needed")}</span></summary>
 ${all().map(b=>`<button class="bz" data-a="asbiz" data-id="${b.id}"><span class="tile" style="background:${b.col}">${b.e}</span><span><b>${esc(b.name)}</b><span class="small">${sectorText(b.sector)}</span></span></button>`).join("")}</details>`
 :`
 <div class="box sel"><h3>${T("Selamat datang 👋","Welcome 👋")}</h3><p class="sub">${T("Tidak perlu mendaftar. Tambahkan nama panggilan jika mau.","No sign-up needed. Add a nickname if you like.")}</p>
 <div class="row"><div style="flex:2"><label class="f" for="gn">${T("Nama panggilan (opsional)","Nickname (optional)")}</label><input class="t" id="gn" maxlength="20" value="${esc(S.guest.n)}"></div>
 <div style="flex:1"><label class="f" for="gf">${T("Asal","From")}</label><select class="t" id="gf">${flags.map(x=>`<option ${x===S.guest.f?"selected":""}>${x}</option>`).join("")}</select></div></div>
 <button class="btn wide" style="margin-top:.9rem" data-a="asguest">${T("Lanjut menjelajah","Keep exploring")}</button></div>
 ${a&&a.kind==="guest"?`<div class="box"><h3>${T("Sudah masuk","Logged in")}</h3><p class="sub">${T("Kunjungan dan pesan Anda tersedia di perangkat mana pun saat masuk dengan ","Your visits and chats follow you to any device where you log in with ")}${esc(a.phone)}.</p><button class="btn alt wide" style="margin-top:.8rem" data-a="logout">${T("Keluar","Log out")}</button></div>`
 :`<details class="box"><summary><span><b>${T("Masuk atau daftar","Log in or Sign up")}</b><br><span class="small">${T("Bawa pesan dan kunjungan ke perangkat mana pun","Keep your chats and visits on any device")}</span></span></summary>
 <p class="sub" style="margin-top:.7rem">${T("Masukkan nomor telepon dan PIN.<br>Nomor baru? Akun akan dibuat.","Enter your phone number and a PIN.<br>New number? We’ll create your account.")}</p>${phonePin}
 <button class="btn alt wide" style="margin-top:.9rem" data-a="glogin">${T("Lanjutkan","Continue")}</button>
 ${API?"":`<p class="small" style="margin-top:.5rem">${T("Tanpa server, akun tidak aktif. Semua aktivitas tetap tersimpan di perangkat ini.","No server is connected right now, so accounts are switched off. Everything you do is still kept on this device.")}</p>`}</details>`}`}
 <p class="small" style="margin-top:1.2rem;display:flex;gap:1rem;flex-wrap:wrap"><button style="text-decoration:underline;font-weight:700" data-a="go" data-s="ai">${T("Cara kerja YoloWisata","How YoloWisata works")}</button><button style="text-decoration:underline" data-a="reset">${T("Hapus semua dari perangkat ini","Clear everything on this device")}</button></p>
 </div>`};

V.explore=()=>{const cats=[["All","✨"]].concat(Object.keys(SECTORS).slice(0,5).map(k=>[k,SECTORS[k][0]]));
 let list=all().filter(b=>S.sector==="All"||b.sector===S.sector).map(b=>({b,m:S.dna?matchOf(b).score:null,d:kmTo(b)}));
 if(S.dna)list.sort((x,y)=>y.m-x.m);else if(S.here)list.sort((x,y)=>x.d-y.d);
 return `<div class="pad"><div class="hello">${MASCOT}<div><p class="small">${T("Hai","Hi")}${S.guest.n?" "+esc(S.guest.n):""} 👋</p><h1 style="font-size:1.7rem">${T("Temukan orang lokal","Find someone local")}</h1></div></div>
 ${S.dna?"":`<button class="box" style="width:100%;text-align:left;background:var(--yellow);border:0" data-a="go" data-s="swipe"><b>🧬 ${T("Cari DNA Perjalanan Anda","Find your Travel DNA")}</b><br><span class="small" style="color:var(--ink)">${T("Sepuluh pilihan, dan daftar ini akan menyesuaikan.","Ten swipes, and this list sorts itself for you.")}</span></button>`}
 ${S.here?`<div class="savebar on"><span style="font-size:1.5rem">📍</span><div><b>${T("Menampilkan tempat di dekat Anda","Showing what is near you")}</b><div class="small">${T("Lokasi berasal dari GPS ponsel dan tetap berfungsi tanpa internet.","Your position comes from the phone’s GPS, which works with no internet.")}</div></div></div><div class="map">${mapSVG(list.map(x=>x.b))}</div>`
 :`<button class="savebar" data-a="loc"><span style="font-size:1.5rem">📍</span><div><b>${T("Gunakan lokasi saya","Use my location")}</b><div class="small">${T("Lihat jarak setiap tempat. Opsional dan tidak dibagikan.","See how far each place is. Optional, and never shared with anyone.")}</div></div></button>`}
 <div class="cats">${cats.map(([k,e])=>`<button class="cat ${S.sector===k?"on":""}" data-a="sector" data-s="${k}"><span>${e}</span>${sectorText(k)}</button>`).join("")}</div>
 <div class="places">${list.map(({b,m,d})=>`<button class="pcard" data-a="view" data-id="${b.id}"><div class="art" style="background:${b.col}">${b.e}</div><div class="body"><b>${esc(b.name)}</b><div class="small">${sectorText(b.sector)} · ${esc(b.place)}</div>
 ${m!==null?`<span class="tag early">${m}% ${T("cocok","match")}</span>`:""}${d?`<span class="tag blue">${d} ${T("km dari Anda","km away")}</span>`:""}${S.saved[b.id]?`<span class="tag strong">${T("Tersimpan offline","Saved offline")}</span>`:""}</div></button>`).join("")||`<div class="box"><b>${T("Belum ada tempat di sini","Nobody here yet")}</b><p class="sub">${T("Belum ada usaha "+sectorText(S.sector).toLowerCase()+" di desa ini.","No "+S.sector.toLowerCase()+" business has joined in this village so far.")}</p></div>`}</div>
 <p class="small" style="margin-top:.9rem">${T("Punya usaha?","Run something yourself?")} <button style="text-decoration:underline;font-weight:700" data-a="ltab" data-t="biz" data-reg="1">${T("Tambahkan usaha Anda","Add your business")}</button></p></div>`};

V.help=()=>{const n=PHR.filter((_,i)=>S.learned[i]).length,all8=n===PHR.length,learnId=S.blang==="en";
 return `<div class="pad"><div class="hello ${all8?"cheer":""}">${MASCOT}<div><h1 style="font-size:1.6rem">${learnId?T("Ucapkan dalam bahasa Indonesia","Say it in Indonesian"):T("Ucapkan dalam bahasa Inggris","Say it in English")}</h1><p class="sub">${all8?T("Kamu hebat! Bisa mengucapkan semuanya.","You did it! You can say all ")+n+T(". Kamu terdengar seperti warga lokal.",". You sound local already."):T("Dengarkan, ulangi, lalu coba ucapkan kepada seseorang.","Listen, repeat, then try it on a real person.")}</p></div></div>
 <div class="box"><b style="display:flex;justify-content:space-between"><span>${T("Frasa yang bisa diucapkan","Phrases you can say")}</span><span>${n} ${T("dari","of")} ${PHR.length}</span></b><div class="track" style="margin-top:.4rem"><i style="width:${n/PHR.length*100}%;background:var(--green)"></i></div></div>
 <div class="phrases">${PHR.map(([id,en,pr,e],i)=>{const frontId=learnId,front=frontId?id:en,back=frontId?en:id,frontLang=frontId?"id":"en",frontHint=frontId?T("Ketuk untuk melihat bahasa Inggris","Tap to see English"):T("Ketuk untuk melihat bahasa Indonesia","Tap to see Indonesian"),backHint=frontId?T("Dalam bahasa Inggris","In English"):T("Dalam bahasa Indonesia","In Indonesian");return `<div class="phc ${S.learned[i]?"got":""}"><button class="flip" data-a="flip" data-index="${i}" data-front-lang="${frontLang}" aria-label="${T("Kartu frasa: ","Phrase card: ")}${en}. ${T("Ketuk untuk membalik.","Tap to flip.")}"><span class="in"><span class="face" style="background:${["#FFF2C6","#DCF4E7","#FFE4D9","#D6E8FA"][i%4]}"><span class="emo">${e}</span><span class="say" lang="${frontLang}">${front}</span>${frontId?`<span class="pron">${pr}</span>`:""}<span class="hint">${frontHint}</span></span><span class="face bk"><span class="hint">${backHint}</span><span class="say" lang="${frontId?"en":"id"}">${back}</span>${frontId?"":`<span class="pron">${pr}</span>`}<span class="hint">${T("Ketuk untuk kembali","Tap to flip back")}</span></span></span></button>
 <div class="acts"><button data-a="hear" data-i="${i}" data-r="1">🔊 ${T("Dengarkan","Hear it")}</button><button data-a="hear" data-i="${i}" data-r="0.8">🐢 ${T("Pelan","Slow")}</button><button class="${S.learned[i]?"on":""}" data-a="learn" data-i="${i}">${S.learned[i]?"⭐ "+T("Bisa","Got it"):"☆ "+T("Sudah bisa?","Got it?")}</button></div></div>`}).join("")}</div>
 <p class="small" style="margin-top:1.2rem">${learnId?T("Kartu dan panduan pengucapannya tersimpan di ponsel dan berfungsi tanpa sinyal. Suara memakai fitur ponsel dan memerlukan suara bahasa Indonesia yang terpasang.","The cards and the spelled-out sounds are stored on the phone and work with no signal. The voice uses your phone’s own speech, so it needs an Indonesian voice installed."):T("Kartu ini membantu Anda berlatih bahasa Inggris.","These cards help you practice English.")}</p>
 <button class="btn alt wide" style="margin-top:.8rem" data-a="go" data-s="inbox">${T("Perlu bantuan? Pesan tuan rumah","Need more? Message the host")}</button></div>`};

V.swipe=()=>{if(S.i>=CARDS.length)return V.dna();const c=CARDS[S.i],n=CARDS[S.i+1];
 const card=(c,i,cls)=>`<div class="sw ${cls}" ${cls?"":'id="top"'} style="background:${PAL[i%5]}"><span class="stampy yes">${T("Ya!","Yes!")}</span><span class="stampy no">${T("Bukan untuk saya","Not for me")}</span><span class="emo">${c.e}</span><h3>${c.t}</h3><p>${c.d}</p></div>`;
 return `<div class="pad"><h1 style="font-size:1.5rem">${T("Apakah Anda akan menyukainya?","Would you enjoy this?")}</h1><p class="sub">${T("Geser ke kanan untuk ya, ke kiri untuk tidak. Sepuluh kartu, tanpa formulir.","Swipe right for yes, left for no. Ten cards, no forms.")}</p>
 <div class="deck">${n?card(n,S.i+1,"back"):""}${card(c,S.i,"")}</div>
 <div class="swbtns"><button data-a="swipe" data-v="0" aria-label="${T("Bukan untuk saya","Not for me")}">✕</button><button data-a="swipe" data-v="1" aria-label="${T("Ya, saya akan menyukainya","Yes, I would enjoy this")}">♥</button></div>
 <div class="dots">${CARDS.map((_,i)=>`<i class="${i<S.i?"d":""}"></i>`).join("")}</div></div>`};

V.dna=()=>{if(!S.dna)return V.swipe();const rows=Object.keys(DIMS).map(k=>[k,Math.round(S.dna[k]*100)]).sort((a,b)=>b[1]-a[1]);
 const low=rows.filter(r=>r[1]<=25).map(r=>dimensionText(r[0]).toLowerCase());
 return `<div class="pad"><p class="hand">${T("Cepat sekali.","That was quick.")}</p><h1 style="font-size:1.8rem">${T("DNA Perjalanan Anda","Your Travel DNA")}</h1>
 <div class="box">${rows.map(([k,p],i)=>`<div class="bar-row"><b><span>${dimensionText(k)}</span><span>${p}%</span></b><div class="track"><i style="width:${p}%;background:${PAL[i%4]}"></i></div></div>`).join("")}</div>
 ${low.length?`<p class="sub" style="margin-top:.8rem">${T("Anda cenderung melewatkan ","You tend to skip ")}${low.join(T(" dan "," and "))}.</p>`:""}
 <p class="small" style="margin-top:.6rem">${T("📥 Tersimpan di ponsel. Tetap berfungsi tanpa sinyal.","📥 Kept on this phone. It still works with no signal.")}</p>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="go" data-s="match">${T("Lihat kecocokan saya","See my matches")}</button><button class="btn alt" data-a="redo">${T("Geser lagi","Swipe again")}</button></div></div>`};

V.match=()=>{if(!S.dna)return V.swipe();const r=all().map(b=>({b,m:matchOf(b)})).sort((x,y)=>y.m.score-x.m.score),{b,m}=r[0],weak=m.score<55;
 return `<div class="pad"><p class="sub">${weak?T("Kami belum yakin dengan pilihan mana pun","We are not sure about any of these"):T("Kecocokan terbaik di dekat Anda","Your best match nearby")}</p>
 <div class="box" style="margin-top:.5rem;border:0;background:${b.col}"><div class="match-num">${m.score}%</div><p style="font-size:.85rem">${T("cocok dengan DNA Perjalanan Anda","match with your Travel DNA")}</p>
 <h2 style="font-size:1.5rem;margin-top:.6rem">${b.e} ${esc(b.name)}</h2><p>${sectorText(b.sector)} · ${esc(b.place)}</p></div>
 <div class="box">${weak?`<p>${T("Pilihan Anda hanya sedikit cocok dengan tempat-tempat ini. Lihat dan tentukan sendiri.","Your swipes and these places overlap only a little. Have a look and decide for yourself.")}</p>`:`<b>${T("Alasan tempat ini cocok","Why it fits you")}</b>`}
 <ul class="why">${m.why.map(w=>`<li>${w}</li>`).join("")}<li>${cardsOf(b).length} ${T("wisatawan meninggalkan kartu pos di sini","travelers left a postcard here")}</li></ul></div>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="view" data-id="${b.id}">${T("Lihat pengalaman","View experience")}</button><button class="btn alt" data-a="offline" data-id="${b.id}">${S.saved[b.id]?T("Tersimpan offline ✓","Saved offline ✓"):T("Simpan offline","Save offline")}</button></div>
 <label class="f">${T("Juga di sekitar Anda","Also near you")}</label>${r.slice(1).map(({b,m})=>`<button class="bz" data-a="view" data-id="${b.id}"><span class="tile" style="background:${b.col}">${b.e}</span><span><b>${esc(b.name)}</b><span class="small">${sectorText(b.sector)}</span></span><span class="pct">${m.score}%</span></button>`).join("")}
 <p class="small" style="margin-top:.8rem">${T("Skor membandingkan enam nilai DNA Perjalanan Anda dengan DNA Pengalaman tiap tempat. Ini saran, bukan janji.","The score compares your six Travel DNA values with each place’s Experience DNA. It is a suggestion, not a promise.")}</p></div>`};

V.exp=()=>{const b=biz(S.biz),L=Lst(b);return `<div class="hero" style="background:${b.col}"><button class="pill back" data-a="go" data-s="explore">‹ All places</button>${b.e}</div>
 <div class="pad" style="padding-top:1rem"><h1 style="font-size:1.6rem">${esc(L.name||b.name)}</h1>
 <p class="sub">${sectorText(b.sector)} · ${esc(b.place)} ${kmTo(b)?"· "+kmTo(b)+" "+T("km dari Anda","km from you")+" ":""}${S.saved[b.id]?"· 📥 "+T("tersimpan di ponsel ini","saved on this phone"):""}</p>
 <div style="margin-top:.7rem">${b.chips.map(c=>`<span class="chip">${c}</span>`).join("")}</div>
 <p style="margin-top:.6rem">${esc(b.story||L.description||T("Usaha ini belum membagikan ceritanya.","This business has not told its story yet."))}</p>
 <div class="facts"><div><span>${T("Durasi","Duration")}</span><b>${esc(L.duration||T("Tanyakan kepada tuan rumah","Ask the host"))}</b></div><div><span>${T("Harga","Price")}</span><b>${esc(L.price||T("Tanyakan kepada tuan rumah","Ask the host"))}</b></div>
 <div><span>${T("Bahasa","Languages")}</span><b>${T("Bahasa Indonesia, dengan terjemahan di ponsel","Indonesian, with on-phone translation")}</b></div><div><span>${T("Buka","Open")}</span><b>${esc(L.availability||T("Tanyakan kepada tuan rumah","Ask the host"))}</b></div></div>
 <div class="box"><b>${T("Yang akan Anda lakukan","What you will do")}</b><p class="sub">${esc(L.activities||T("Belum dicantumkan","Not listed yet"))}</p></div>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="bookopen">📅 ${T("Minta kunjungan","Ask to book")}</button><button class="btn sun" data-a="go" data-s="chat">💬 ${T("Pesan","Message")} ${esc(b.host)}</button></div>
 <div class="row" style="margin-top:.6rem"><button class="btn alt" data-a="offline" data-id="${b.id}">${S.saved[b.id]?T("Tersimpan offline ✓","Saved offline ✓"):T("Simpan offline","Save offline")}</button><button class="btn alt" data-a="go" data-s="card">✍️ ${T("Tinggalkan kartu pos","Leave a postcard")}</button></div>
 <button class="btn warm wide" style="margin-top:.6rem" data-a="go" data-s="story">${T("Kunjungi Cerita Tempat Ini","Visit The Story of This Place")}</button></div>`};

function chatHTML(b,tid,side){const en=side==="g",ms=thread(b,tid),other=en?"en":"id",lang=side==="g"?T("Inggris","English"):T("bahasa Indonesia","Indonesian"),bz=side==="b";
 return ms.map((m,i)=>{if(m.from==="sys")return `<div class="bub sys">${esc(m.t)}</div>`;
  const me=m.from===side,k=b.id+tid+i,tr=m[other],translated=!me&&!!tr&&!S.tr[k],shown=me||!tr||S.tr[k]?m.t:tr;
  const originalLanguage=speechLanguage(m.original_language||m.l,m.from==="b"?"id":"en"),spokenLanguage=translated?speechLanguage(m.translated_language,other):originalLanguage;
  return `<div class="bub ${me?"me":""}">${esc(shown)} <button data-a="say" data-t="${esc(shown)}" data-lang="${spokenLanguage}" aria-label="Play message aloud">🔊</button><small>${me?(m.sync==="pending"?(bz?T("📦 Tersimpan di ponsel. Dikirim saat ada sinyal.","📦 Saved on this phone. Will send when connection returns."):"📦 Saved on this phone. Will send when connection returns."):(tr?"":"")):tr?`${bz?T("Diterjemahkan ke "+lang+" di ponsel ini","Translated to English on this phone"):"Translated to "+lang+" on this phone"} · <button data-a="trm" data-k="${k}">${S.tr[k]?(bz?T("terjemahan","translation"):"translation"):(bz?T("teks asli","original"):"original")}</button>`:(other==="en"&&m.id)||(other==="id"&&m.en&&m.from==="b")?"":(bz?T("Kalimat ini belum bisa diterjemahkan. Kalau ragu, tanyakan langsung.","Shown as the guest wrote it. No translation for this sentence yet."):"Shown as written. No translation for this sentence yet. If unsure, ask in person.")}</small></div>`}).join("")||`<div class="bub sys">No messages yet. Say hello.</div>`}
V.chat=()=>{const b=biz(S.biz);return `<div class="chat"><div class="head"><button class="pill" data-a="go" data-s="inbox">‹ ${T("Pesan","Chats")}</button><span style="font-size:1.5rem">${b.e}</span><b>${esc(b.host)}</b><span class="small">${T("responde en bahasa Indonesia","replies in Indonesian")}</span></div>
 <div class="msgs">${chatHTML(b,gt(),"g")}</div>
 <div class="foot"><div>${GQ.map((q,i)=>`<button class="chip pick" data-a="gq" data-i="${i}">${q.t}</button>`).join("")}</div>
 <div class="send"><input class="t" id="cin" placeholder="${T("Tulis dalam bahasa Anda","Write in your own language")}" maxlength="140"><button class="btn" data-a="gsend">${T("Kirim","Send")}</button></div></div></div>`};

V.inbox=()=>{const row=b=>{const ms=thread(b,gt()),last=ms[ms.length-1];return `<button class="bz" data-a="chatwith" data-id="${b.id}"><span class="tile" style="background:${b.col}">${b.e}</span><span style="min-width:0"><b>${esc(b.host)}</b><span class="small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${last?esc(last.from==="b"?(last.en||last.t):last.t):esc(b.name)}</span></span>${last&&last.from==="b"?`<span class="tag strong" style="margin-left:auto">${T("Balasan baru","New reply")}</span>`:last&&last.sync==="pending"?`<span class="tag early" style="margin-left:auto">${T("Menunggu untuk dikirim","Waiting to send")}</span>`:""}</button>`};
 const on=all().filter(b=>S.msgs[b.id+":"+gt()]),off=all().filter(b=>!S.msgs[b.id+":"+gt()]);
 return `<div class="pad"><h1 style="font-size:1.7rem">${T("Pesan","Messages")}</h1><p class="sub">${T("Bicara dengan orang yang menjalankan tiap tempat. Kalian menulis dalam bahasa masing-masing.","Talk to the people who run each place. Each of you writes in your own language.")}</p>
 ${on.length?`<label class="f">${T("Obrolan Anda","Your chats")}</label><div class="list2">${on.map(row).join("")}</div>`:`<div class="box"><b>${T("Belum ada obrolan","No chats yet")}</b><p class="sub">${T("Pilih seseorang di bawah dan sapa mereka.","Pick someone below and say hello.")}</p></div>`}
 ${off.length?`<label class="f">${T("Mulai obrolan baru","Start a new chat")}</label><div class="list2">${off.map(row).join("")}</div>`:""}</div>`};
V.trips=()=>{const ks=S.bookings.filter(k=>k.gid===S.gid);return `<div class="pad"><h1 style="font-size:1.7rem">${T("Kunjungan Anda","Your visits")}</h1><p class="sub">${T("Anda mengajukan, tuan rumah memutuskan. Tidak ada pembayaran di sini.","You ask, the host decides. No one is charged here.")}</p>
 ${ks.length?ks.slice().reverse().map(k=>{const b=biz(k.biz);return `<div class="box"><div style="display:flex;gap:.7rem;align-items:center"><span style="font-size:1.8rem">${b.e}</span><div style="flex:1"><b>${esc(b.name)}</b><div class="small">${esc(k.date)} at ${k.time||"09:00"} · ${k.people} ${k.people>1?"people":"person"}</div></div>
 <span class="tag ${k.status==="confirmed"?"strong":k.status==="declined"?"warn":"early"}">${k.status==="confirmed"?T("Dikonfirmasi","Confirmed"):k.status==="declined"?T("Ditolak","Declined"):T("Menunggu","Waiting")}</span></div>
 ${k.off&&k.status==="pending"?`<p class="small" style="margin-top:.5rem">⚠️ ${esc(b.host)} ${T("biasanya tutup pada hari itu, permintaan ini mungkin ditolak.","is usually closed that day, so this may be declined.")}</p>`:""}<p class="small" style="margin-top:.5rem">${k.sync==="failed_permanent"?T("⚠️ Permintaan tidak dapat dikirim. Silakan buat permintaan baru.","⚠️ This booking could not be sent. Please submit a new request."):k.sync==="pending"?T("📦 Tersimpan di ponsel. Akan dikirim saat tersambung.","📦 Saved on this phone. Will send when connection returns."):k.status==="pending"?T("Terkirim. Menunggu konfirmasi dari ","Sent. Waiting for ")+esc(b.host)+".":k.status==="confirmed"?esc(b.host)+" "+T("menantikan kunjungan Anda.","is expecting you."):esc(b.host)+" "+T("tidak dapat menerima kunjungan pada hari itu. Coba tanggal lain.","cannot host you that day. Try another date.")}</p></div>`}).join(""):`<div class="box"><b>${T("Belum ada kunjungan","No visits yet")}</b><p class="sub">${T("Pilih tempat dan ajukan kunjungan. Hanya dua langkah.","Pick a place and ask to book. It takes two taps.")}</p></div>`}
 <button class="btn wide" style="margin-top:1rem" data-a="view" data-id="${S.biz}">${T("Ajukan kunjungan ke","Ask to book")} ${esc(biz(S.biz).name)}</button></div>`};

const PROMPTS=["What will you remember?","What would you tell the next traveler?","What made this place special?"];
const first=s=>(s||"").match(/\p{Extended_Pictographic}\uFE0F?/u)?.[0]||"";
const pcHTML=(c,full)=>{const showEn=c.en&&S.tr[c.id];
 return `<div class="pc ${c.bg}"><div class="stamp">${first(c.s)||"💌"}</div>
 <div class="who">${esc(c.n||"A traveler")} ${c.f||""} <span class="small">${c.l?esc(c.l):""}</span></div>
 ${c.photo?`<img src="${c.photo}" alt="Photo attached to the postcard">`:""}
 <p class="msg">${esc(showEn?c.en:(c.t||"Your words will appear here…"))}</p>
 ${c.en&&full?`<button class="tr" data-a="tr" data-k="${esc(c.id)}">${showEn?"Show original":"Translate to English"}</button>`:""}
 ${c.prompt?`<p class="prompt">${esc(c.prompt)}</p>`:""}
 <div class="stk">${esc(c.s||"")}</div>
 ${c.voice?`<p class="meta">🎙️ Voice note 0:12</p>`:""}
 ${c.status?`<p class="meta" role="status">${c.status==="sent"?"✓ Synced.":c.status==="failed_permanent"?"⚠️ Saved on this phone. Synchronization failed; automatic retries stopped.":c.sync_status==="syncing"?"Sending your saved postcard…":"📦 Saved on this phone. Waiting to sync."}</p>`:""}</div>`};
const draftCard=()=>{const d=S.draft;return{n:S.guest.n,f:S.guest.f,t:d.t,bg:d.bg,s:d.s.join(""),prompt:PROMPTS[d.p],voice:d.voice,photo:d.photo}};
V.card=()=>{const d=S.draft,b=biz(S.biz);return `<div class="pad"><button class="pill" style="margin-bottom:.8rem" data-a="go" data-s="exp">‹ ${T("Kembali ke","Back to")} ${esc(b.name)}</button><p class="hand">${T("Bukan ulasan. Sebuah kenangan.","Not a review. A memory.")}</p><h1 style="font-size:1.6rem">${T("Tinggalkan sedikit kenangan perjalanan","Leave a little piece of your trip")}</h1><p class="sub">${T("Untuk","For")} ${esc(b.name)}</p>
 <div style="margin-top:.9rem" id="pv">${pcHTML(draftCard())}</div>
 <label class="f">${T("Pilih pertanyaan","Pick a prompt")}</label><div>${PROMPTS.map((p,i)=>`<button class="chip pick ${d.p===i?"on":""}" data-a="prompt" data-i="${i}">${p}</button>`).join("")}</div>
 <label class="f" for="msg">${T("Pesan Anda, dalam bahasa apa pun","Your message, in any language")}</label><textarea class="t" id="msg" maxlength="160" placeholder="${T("Saya akan selalu mengingat…","I’ll always remember…")}">${esc(d.t)}</textarea>
 <label class="f">${T("Kartu pos","Postcard")}</label><div class="bgs">${["sun","field","sky","coral"].map(x=>`<button class="pc ${x} ${d.bg===x?"on":""}" style="min-height:0;padding:0;box-shadow:none" data-a="bg" data-b="${x}" aria-label="${T("Latar "+x,x+" background")}"></button>`).join("")}</div>
 <label class="f">${T("Stiker","Stickers")}</label><div class="stks">${["☕","🌿","💛","⭐","☀️","🌧️","🔥","🪵"].map(s=>`<button class="${d.s.includes(s)?"on":""}" data-a="stk" data-s="${s}">${s}</button>`).join("")}</div>
 <div class="row" style="margin-top:.7rem"><button class="btn alt" data-a="voice">${d.voice?"🎙️ "+T("Catatan suara ditambahkan","Voice note added"):"🎙️ "+T("Tambahkan catatan suara","Add a voice note")}</button><label class="btn alt" tabindex="0">📷 ${d.photo?T("Foto ditambahkan","Photo added"):T("Tambahkan foto","Add a photo")}<input type="file" accept="image/*" id="ph" hidden></label></div>
 <button class="btn warm wide" style="margin-top:1rem" data-a="send">${T("Tinggalkan kartu pos","Leave your postcard")}</button>
 <p class="small" style="margin-top:.6rem">${S.online?"":T("Anda offline. Kartu pos akan disimpan di ponsel dan dikirim nanti. ","You are offline. Your postcard will be kept on this phone and sent later. ")} ${T("Hanya nama panggilan, bendera, dan pesan Anda yang dibagikan kepada ","Only your nickname, flag and message are shared with ")}${esc(b.host)}.</p></div>`};
V.thanks=()=>{const c=S.mine.filter(m=>m.gid===S.gid&&!m.removed).pop();if(!c)return V.card();return `<div class="pad" style="text-align:center"><div style="text-align:left;transform:rotate(-2deg);margin:.6rem 0 1.2rem">${pcHTML(c)}</div>
 <h1 style="font-size:1.6rem">${T("Terima kasih.","Thank you.")}</h1><p class="hand" style="margin:.4rem 0 1rem">${T("Kartu pos Anda kini menjadi bagian dari cerita tempat ini.","Your postcard is now part of this place’s story.")}</p>
 <button class="btn warm wide" data-a="go" data-s="story">${T("Lihat di Cerita Tempat Ini","See it in The Story of This Place")}</button></div>`};

const SLOTS=[[12,17],[35,14],[60,18],[84,15],[22,31],[47,29],[72,32],[91,38],[8,46],[30,49],[63,47],[85,55],[14,63],[33,69],[72,68],[89,74],[10,83],[28,88],[74,88],[53,40],[20,75],[82,88]];
const ORBC=["#FFC928","#47C882","#FF7043","#7193D8","#FFFFFF","#FFE9A3"];
function storyHTML(b,own){const c=cardsOf(b,own),nh=c.filter(isHid).length;
 return `<div class="scene">${farmSVG(true)}<div class="cap"><h1>${T("Cerita Tempat Ini","The Story of This Place")}</h1><p class="hand">${own?T("Ketuk kartu untuk menyembunyikan atau menampilkannya.","Tap a postcard to hide or show it."):c.length?T("Kenangan yang tertinggal di sini. Ketuk salah satu.","Moments that stayed here. Tap one."):T("Belum ada kenangan. Jadilah yang pertama.","No memories yet. Be the first.")}</p></div>
 ${c.map((c,i)=>{const [x,y]=SLOTS[i%SLOTS.length],sz=46+(i*7)%20,mine=!!c.biz;
  return `<button class="orb ${["","wink","","oh"][i%4]} ${mine?"new":""} ${c.status&&c.status!=="sent"?"pending":""}" data-a="open" data-id="${c.id}" aria-label="${T("Kartu pos dari ","Postcard from ")}${esc(c.n||T("wisatawan","a traveler"))}${isHid(c)?", "+T("disembunyikan","hidden"):""}" style="left:calc(${x}% - ${sz/2}px);top:calc(${y+9}% - ${sz/2}px);width:${sz}px;height:${sz}px;background:${ORBC[i%ORBC.length]};--d:${4+i%5}s;--dl:-${i*.7}s${isHid(c)?";opacity:.35;outline:2px dashed var(--ink);outline-offset:3px":""}"><span class="of"><i></i></span><span class="ic">${first(c.s)}</span></button>`}).join("")}
 </div><div class="pad" style="padding-top:.9rem">${own?`<p class="sub">${T(`${c.length-nh} kartu pos tampil untuk tamu${nh?`, ${nh} disembunyikan`:""}. Kartu yang disembunyikan tetap dihitung di ringkasan Anda.`,`${c.length-nh} postcards are shown to guests${nh?`, ${nh} hidden`:""}. Hidden postcards still count in your insights.`)}</p>
 <button class="btn alt wide" style="margin-top:.8rem" data-a="go" data-s="b-insights">‹ ${T("Kembali","Back")}</button></div>`
 :`<p class="sub">${c.length} ${T("kenangan ditinggalkan wisatawan di ","memories left by travelers at ")}${esc(b.name)}${c.length?", "+new Set(c.map(x=>x.l)).size+" "+T("bahasa","languages"):""}.</p>
 <div class="row" style="margin-top:.8rem"><button class="btn" data-a="go" data-s="card">${T("Tinggalkan kartu pos","Leave your postcard")}</button><button class="btn alt" data-a="go" data-s="exp">${T("Kembali ke","Back to")} ${esc(b.host)}</button></div></div>`}`}
V.story=()=>storyHTML(biz(S.biz),false);
V["b-story"]=()=>storyHTML(B(),true);

/* ----- Local business side: Indonesian by default, English with the 🌐 switch ----- */
V["b-list"]=()=>voiceView();

V["b-msgs"]=()=>{const b=B(),ts=threadsOf(b),k=S.blang==="en"?"en":"id";return `<div class="pad"><h1 style="font-size:1.6rem">${T("Pesan tamu","Guest messages")}</h1><p class="sub">${T("Pesan tamu ditampilkan dalam bahasa Indonesia.","Guest messages, shown in English.")}</p>
 ${ts.length?ts.map(t=>{const ms=thread(b,t.id),last=ms[ms.length-1],wait=last.from==="g";return `<button class="bz" data-a="thread" data-id="${t.id}"><span class="tile" style="background:var(--pale)">${t.f}</span><span style="min-width:0"><b>${esc(t.who)}</b><span class="small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px">${esc(last.from==="g"?(last[k]||last.t):last.t)}</span></span>${wait?`<span class="tag warn" style="margin-left:auto">${T("Balas","Reply")}</span>`:""}</button>`}).join(""):`<div class="box"><b>${T("Belum ada pesan","No messages yet")}</b><p class="sub">${T("Saat tamu menulis, pesannya muncul di sini dalam bahasa Anda.","When a guest writes, it appears here in your language.")}</p></div>`}</div>`};
V["b-thread"]=()=>{const b=B(),t=threadsOf(b).find(t=>t.id===ui.tid);if(!t)return V["b-msgs"]();const L=Lst(b);
 const rs=BR.concat(L.price?[{t:"Harganya "+L.price.replace(" per person"," per orang")+".",en:"The price is "+L.price+"."}]:[]);
 return `<div class="chat"><div class="head"><button class="pill" data-a="go" data-s="b-msgs">‹</button><span style="font-size:1.5rem">${t.f}</span><b>${esc(t.who)}</b></div>
 <div class="msgs">${chatHTML(b,t.id,"b")}</div>
 <div class="foot"><p class="small">${T("Saran balasan. Anda yang memilih.","Suggested replies. You choose.")}</p><div>${rs.map(q=>`<button class="chip pick" data-a="bq" data-t="${esc(q.t)}" data-en="${esc(q.en)}">${T(q.t,q.en)}</button>`).join("")}</div>
 <div class="send"><input class="t" id="cin" placeholder="${T("Tulis balasan…","Write a reply…")}" maxlength="140"><button class="btn" data-a="bsend">${T("Kirim","Send")}</button></div></div></div>`};

V["b-book"]=()=>{const b=B(),ks=bookingsOf(b);return `<div class="pad"><h1 style="font-size:1.6rem">${T("Pesanan","Bookings")}</h1><p class="sub">${T("Tamu meminta, Anda yang memutuskan.","Guests ask, you decide.")}</p>
 ${ks.length?ks.slice().reverse().map(k=>`<div class="box"><div style="display:flex;gap:.7rem;align-items:center"><div style="flex:1"><b>${esc(k.who)}</b><div class="small">${esc(tv(k.date))} ${T("pukul","at")} ${k.time||"09:00"} · ${k.people} ${T("orang",k.people>1?"people":"person")}</div></div>
 ${k.status==="pending"?"":`<span class="tag ${k.status==="confirmed"?"strong":"warn"}">${k.status==="confirmed"?T("Diterima","Confirmed"):T("Ditolak","Declined")}</span>`}</div>
 ${k.off&&k.status==="pending"?`<p class="small" style="margin-top:.5rem">⚠️ ${T("Tamu meminta hari di luar jadwal buka Anda.","The guest asked for a day outside your opening days.")}</p>`:""}${k.sync==="pending"?`<p class="small" style="margin-top:.5rem">📦 ${T("Permintaan ini belum terkirim dari ponsel tamu.","This request has not left the guest’s phone yet.")}</p>`:k.status==="pending"?`<div class="row" style="margin-top:.7rem"><button class="btn" data-a="bdec" data-id="${k.id}" data-v="confirmed">${T("Terima","Confirm")}</button><button class="btn alt" data-a="bdec" data-id="${k.id}" data-v="declined">${T("Tolak","Decline")}</button></div>`:""}</div>`).join(""):`<div class="box"><b>${T("Belum ada pesanan","No bookings yet")}</b><p class="sub">${T("Permintaan dari tamu akan muncul di sini.","Requests from guests will appear here.")}</p></div>`}
 <p class="small" style="margin-top:.8rem">${T("YoloWisata tidak pernah menerima pesanan atas nama Anda.","YoloWisata never accepts a booking for you.")}</p></div>`};

V["b-insights"]=()=>{const b=B(),A=insightsFor(b);
 const list=(group,unit)=>{const o=A[group];return Object.keys(o).sort((x,y)=>o[y]-o[x]).map(k=>{const [c,t]=insightLabel(A,group,k);return `<button class="cnt" data-a="evid" data-group="${group}" data-k="${esc(k)}"><b>${esc(lab(k,b))}</b><em>${o[k]} ${unit(o[k])}</em><span class="tag ${c}">${esc(t)}</span></button>`}).join("")||`<p class="sub">${T("Belum ada. Bukti belum cukup.","Nothing yet. Not enough evidence.")}</p>`};
 const idea=insightIdea(A),s=A.seg,top=o=>Object.keys(o).sort((x,y)=>o[y]-o[x])[0],ti=top(s.intl),tl=top(s.loc),st=S.idea[b.id],I=idea&&IDEAID[idea.title];
 return `<div class="pad"><div class="hello">${MASCOT}<div><p class="small">Halo, ${esc(b.host)}</p><h1 style="font-size:1.6rem">${T("Yang diingat tamu","What visitors remember")}</h1></div></div>
 <p class="sub" style="margin-top:.5rem">${T(`Dari ${A.nCards} kartu pos dan ${A.nQ} pertanyaan`,`From ${A.nCards} postcards and ${A.nQ} questions`)}${A.waiting?T(`. ${A.waiting} lagi menunggu sinyal`,`. ${A.waiting} more waiting to sync`):""}.</p>
 <p class="small">${A.source==="backend"?T("Wawasan daring · umpan balik dari server","Online insights · feedback from the server"):A.source==="loading"?T("Memuat wawasan daring…","Loading online insights…"):T("Analisis cadangan di perangkat · data di ponsel ini","On-device fallback · data on this phone")}</p>
 <div style="margin-top:.8rem">${b.chips.map(c=>`<span class="chip">${T(CHID[c]||c,c)}</span>`).join("")}</div>
 <div class="box"><b>${T("Yang disukai tamu","What visitors loved")}</b>${list("loved",n=>T("kali disebut","mention"+(n===1?"":"s")))}</div>
 <div class="box"><b>${T("Yang sering ditanyakan","What visitors often ask for")}</b>${list("asks",n=>T("permintaan","request"+(n===1?"":"s")))}</div>
 <div class="box"><b>${T("Pola tamu","Visitor patterns")}</b>
 ${ti?`<p style="margin-top:.4rem">${T("Tamu mancanegara paling sering bertanya tentang","International visitors most often ask about")}: ${esc(lab(ti,b).toLowerCase())} (${s.intl[ti]} ${T("pertanyaan","questions")}). <span class="tag ${label(s.intl[ti])[0]}">${label(s.intl[ti])[1]}</span></p>`:""}
 ${tl?`<p style="margin-top:.5rem">${T("Tamu lokal paling sering bertanya tentang","Local visitors most often ask about")}: ${esc(lab(tl,b).toLowerCase())} (${s.loc[tl]} ${T("pertanyaan","questions")}). <span class="tag ${label(s.loc[tl])[0]}">${label(s.loc[tl])[1]}</span></p>`:""}
 ${ti||tl?"":`<p class="sub">${T("Pertanyaan belum cukup untuk dibandingkan.","Not enough questions yet to compare groups.")}</p>`}</div>
 ${idea?`<div class="opp"><span class="tag" style="background:var(--white)">${T("Peluang · Sinyal awal","Possible opportunity · Early signal")}</span><h3>${T(I[0],idea.title)}</h3><p>${T(I[1],idea.text)}</p>
 <p class="small" style="color:var(--ink);margin-top:.5rem">${A.source==="backend"?T(`Berdasarkan ${A.loved[idea.need[0]]} penyebutan dan ${A.asks[idea.need[1]]} permintaan dalam umpan balik tamu. Layak dicoba kecil-kecilan, belum pasti berhasil.`,`Based on ${A.loved[idea.need[0]]} mentions and ${A.asks[idea.need[1]]} requests in visitor feedback. Worth a small test, not a sure thing.`):T(`Berdasarkan ${A.loved[idea.need[0]]} kartu pos yang menyebutnya, ${A.cardAsk(idea.need[1])} kartu pos yang meminta lebih, dan ${A.qAsk(idea.need[1])} pertanyaan berulang. Layak dicoba kecil-kecilan, belum pasti berhasil.`,`Based on ${A.loved[idea.need[0]]} postcards that mention it, ${A.cardAsk(idea.need[1])} postcards that ask for more, and ${A.qAsk(idea.need[1])} repeated questions. Worth a small test, not a sure thing.`)}</p>
 ${st==="saved"?`<p style="margin-top:.7rem;font-weight:800">🌱 ${T("Disimpan di ide Anda. Anda yang menentukan kapan mencobanya.","Saved to your ideas. You decide when to try it.")}</p>`:st==="later"?`<p style="margin-top:.7rem;font-weight:800">${T("Baik, lain kali. Tidak ada yang diubah.","Okay, not now. Nothing was changed.")}</p>`:""}
 <div class="row" style="margin-top:.8rem"><button class="btn" data-a="idea" data-v="saved">${T("Simpan ide","Save idea")}</button><button class="btn alt" data-a="idea" data-v="later">${T("Lain kali","Not now")}</button></div>
 <div class="row" style="margin-top:.5rem"><button class="btn alt" data-a="evid" data-group="asks" data-k="${esc(idea.need[1])}">${T("Kenapa?","Learn why")}</button><button class="btn alt" data-a="say" data-t="${esc(idea.say)}">🔊 ${T("Dengarkan","Listen")}</button></div></div>`
 :`<div class="box" style="background:var(--pale);border:0"><b>${T("Belum ada saran","No suggestion yet")}</b><p>${T("Bukti belum cukup untuk menyarankan hal baru. Belum yakin, jadi tanyakan pada tamu berikutnya apa yang mereka harapkan.","There is not enough evidence to suggest something new. Not sure, so ask your next visitors what they wished for.")}</p></div>`}
 <button class="btn alt wide" style="margin-top:.9rem" data-a="go" data-s="b-story">💌 ${T("Lihat dan atur Cerita Tempat Ini","See and manage The Story of This Place")}</button>
 <p class="small" style="margin-top:.8rem">${T("YoloWisata tidak pernah mengubah daftar atau harga Anda sendiri. Anda yang memilih.","YoloWisata never changes your listing or prices by itself. You choose.")}</p></div>`};

V["b-journey"]=()=>{const b=B(),A=insightsFor(b),has=!!(S.listings[b.id]||!b.custom),old=!b.custom&&b.id==="noor";
 const M=[[T("Daftar usaha dibuat","Listing created"),T("Tamu bisa menemukan Anda.","Guests can find you."),has],[T("10 tamu pertama","First 10 visitors"),old?T("Tamu mulai berdatangan.","People are coming."):T("Terus semangat.","Keep going."),old],[T("5 kartu pos pertama","First 5 postcards"),A.nCards+T(" kenangan sejauh ini."," memories left so far."),A.nCards>=5],[T("Rekomendasi pertama","First referral"),T("Seorang tamu mengajak temannya.","A visitor sent a friend."),old],[T("Ide baru pertama","First new idea discovered"),T("Dari apa yang sering dikatakan tamu.","From what visitors keep saying."),S.idea[b.id]==="saved"],[T("Perbaikan pertama","First experience improvement"),T("Coba satu ide, lalu lihat kata kartu pos.","Try an idea, then see what the postcards say."),0]];
 return `<div class="pad"><h1 style="font-size:1.6rem">${T("Usaha Anda tumbuh","Your business is growing")}</h1>
 <div class="plant">${M.slice().reverse().map(m=>`<div class="m ${m[2]?"":"todo"}"><b>${m[2]?"":T("Berikutnya: ","Next: ")}${m[0]}</b><span class="small">${m[1]}</span></div>`).join("")}</div>
 <p class="small" style="margin-top:.4rem">🌱 ${T("Tanaman tumbuh dari bawah. Tidak perlu belajar grafik.","The plant grows from the bottom. No charts to learn.")}</p></div>`};

V.ai=()=>{const P=t=>`<p style="text-align:justify;hyphens:auto">${t}</p>`,H=t=>`<h2 style="font-size:1.15rem;margin:1.6rem 0 -.2rem">${t}</h2>`,B=(h,t,pale)=>`<div class="box"${pale?' style="background:var(--pale);border:0"':""}><h3>${h}</h3>${P(t)}</div>`;
 return `<div class="pad ai" lang="${S.blang}"><button class="pill" style="margin-bottom:.9rem" data-a="go" data-s="login">‹ ${T("Kembali","Back")}</button>
 <h1 style="font-size:1.6rem">${T("Cara kerja YoloWisata","How YoloWisata works")}</h1><p class="sub" style="margin-top:.3rem">${T("Situs untuk wisatawan dan usaha lokal yang tetap berfungsi tanpa internet.","A website for travelers and local businesses that keeps working when the internet does not.")}</p>
 ${B(T("Tetap berfungsi tanpa internet","Works without internet"),T("YoloWisata adalah situs web, jadi tidak perlu memasang aplikasi. Setelah kunjungan pertama, situs dapat dibuka tanpa koneksi. Aktivitas offline seperti pesan, kunjungan, kartu pos disimpan di perangkat dan dikirim saat tersambung kembali.","YoloWisata is a website, so there is nothing to install. After the first visit it opens with no connection. Anything done offline, such as a message, a booking, a postcard, is kept on the device and sent when the signal returns."),1)}
 ${H(T("Yang dilakukan AI","What the AI does"))}
 ${B(T("1. Pencocokan","1. Matching"),T("Sepuluh pilihan membentuk DNA Perjalanan. Setiap usaha memiliki DNA Pengalaman. Skor membandingkan keduanya dan menunjukkan jika kecocokannya rendah.","Ten swipes become a Travel DNA. Each business has an Experience DNA. The match score compares the two, and a weak match says so."))}
 ${B(T("2. Suara menjadi daftar usaha","2. Voice to listing"),T("Pemilik menjelaskan usahanya dengan suara dalam bahasanya sendiri. Informasi menjadi daftar berisi nama, harga, durasi, kegiatan, dan hari buka. Hal yang tidak terdengar ditandai ‘Belum yakin’ dan tidak ditebak.","An owner describes the business out loud, in their own language. The words become a listing with a name, price, duration, activities and opening days. Anything not heard is marked ‘Not sure’ and is never guessed."))}
 ${B(T("3. Terjemahan","3. Translation"),T("Tamu dan pemilik menulis serta membaca dalam bahasa masing-masing. Teks asli selalu dapat dilihat kembali.","Guests and owners each write and read in their own language. The original text is always one tap away."))}
 ${B(T("4. Wawasan pengunjung","4. Visitor insights"),T("Kartu pos, pertanyaan, dan pesan dikelompokkan berdasarkan tema. Setiap temuan menampilkan jumlah, kutipan, dan label kekuatan bukti.","Postcards, questions and messages are counted by theme. Every finding shows its count, the quotes behind it and a label: Strong pattern, Early signal or Not enough evidence yet."))}
 ${H(T("Perlu diketahui","Good to know"))}
 ${B(T("Keputusan tetap di tangan orang","People decide"),T("AI memberi saran, manusia yang memutuskan. AI tidak menerima kunjungan, mengubah harga, mengirim balasan, atau menerbitkan daftar usaha sendiri.","The AI suggests and people decide. It never accepts a booking, changes a price, sends a reply or publishes a listing on its own."))}
 ${B(T("Untuk berbagai jenis usaha","Any kind of business"),T("Kebun, bengkel, dapur, homestay, dan pemandu menggunakan layar yang sama; setiap usaha dapat memakai aplikasi dalam bahasanya.","A farm, a workshop, a kitchen, a homestay or a guide all use the same screens, and each business uses the app in its own language."))}
 ${B(T("Lokasi","Location"),T("Berbagi lokasi bersifat opsional. Fitur ini berfungsi tanpa internet dan posisi tetap di perangkat.","Sharing a location is optional. It works without internet, and the position stays on the device."))}
 ${H(T("Tentang prototipe ini","About this prototype"))}
 ${B(T("Yang nyata dan yang disimulasikan","What is real and what is simulated"),T("Pencocokan berjalan di perangkat. Pemrosesan suara memerlukan server Python dengan model; tidak dijamin offline di ponsel. Wawasan pengunjung berasal dari server saat tersambung, atau dari perangkat saat offline. Terjemahan memakai daftar frasa yang telah disiapkan. Perekaman daftar memakai mikrofon; desa demo disimulasikan; kartu pos dan pertanyaan contoh ditulis oleh tim.","Matching runs on the device. Voice listing processing runs on a configured Python host; it is not guaranteed offline on the phone. Visitor insights come from the server when it is connected, and from the device otherwise. Translation uses a prepared phrase list in place of a translation model, so other sentences are shown as written. Listing recording uses the microphone; the demo village is simulated, and the sample postcards and questions were written by the team."))}</div>`};

/* ---------- Render ---------- */
const GNAV=()=>[["explore","🧭",T("Jelajahi","Explore")],["swipe","🧬",T("DNA Perjalanan","Travel DNA")],["inbox","💬",T("Pesan","Messages")],["trips","📅",T("Kunjungan","Visits")],["help","🗣️",T("Frasa","Phrases")]];
const BNAV=()=>[["b-list","🎙️",T("Usaha","Listing")],["b-insights","💛",T("Tamu","Visitors")],["b-msgs","💬",T("Pesan","Messages")],["b-book","📅",T("Pesanan","Bookings")],["b-journey","🌱",T("Tumbuh","Growth")]];
const GROUP={chat:"inbox",dna:"swipe",match:"swipe",exp:"explore",card:"explore",thanks:"explore",story:"explore","b-thread":"b-msgs","b-story":"b-insights"};
function render(sync=true){refreshInsights();const s=S.screen;$("#view").innerHTML=(V[s]||V.land)();
 $("#net").className="pill net"+(S.online?"":" off");$("#net").textContent=S.online?T("● Terhubung","● Online"):T("○ Luring","○ Offline");
 $("#acct").textContent=S.role==="biz"?B().e+" "+B().host:"🧳 "+(S.guest.n||T("Tamu","Guest"));
 const nav=s==="land"||s==="login"||s==="ai"?null:S.role==="biz"?BNAV():GNAV(),g=GROUP[s]||s;const langSwitch=$("#lang"),langEn=$("#lang-en"),langId=$("#lang-id");langSwitch.style.display="";langEn.className="lang-choice"+(S.blang==="en"?" on":"");langId.className="lang-choice"+(S.blang==="id"?" on":"");if(langEn.setAttribute)langEn.setAttribute("aria-pressed",String(S.blang==="en"));if(langId.setAttribute)langId.setAttribute("aria-pressed",String(S.blang==="id"));
 $("#nav").innerHTML=nav?`<nav class="nav">${nav.map((n,i)=>`<button class="${n[0]===g?"on":""}" data-a="go" data-s="${n[0]}"><span class="ni" style="--c:${["#FFE4D9","#FFF2C6","#D6E8FA","#DCF4E7","#FFE4D9"][i%5]}" aria-hidden="true">${n[1]}</span>${n[2]}</button>`).join("")}</nav>`:"";
 renderOver();if(s==="swipe")bindSwipe();
 if(s==="chat"||s==="b-thread")$("#view").scrollTop=1e6;save();if(sync)flush()}
const stepsHTML=()=>STEPS.map(([k,id,en,whoId,whoEn])=>`<li><button class="${S.screen===k||(k==="swipe"&&S.screen==="dna")||(k==="card"&&S.screen==="thanks")||(k==="b-msgs"&&S.screen==="b-thread")?"on":""}" data-a="go" data-s="${k}"><span>${T(id,en)}<span class="who">${T(whoId,whoEn)}</span></span></button></li>`).join("");
function renderOver(){const m=ui.modal,o=$("#over"),t=ui.toast?`<div class="toast" role="status">${ui.toast}</div>`:"";if(!m){o.innerHTML=t;return}
 let h="";
 if(m.t==="pc"){const own=S.role==="biz",c=cardsOf(B(),own).find(c=>c.id===m.id);if(!c){ui.modal=null;o.innerHTML=t;return}
  const act=own?`<button class="btn ${isHid(c)?"":"warm"} wide" style="margin-top:.6rem" data-a="pchide" data-id="${c.id}">${isHid(c)?T("Tampilkan lagi di Cerita","Show in the Story again"):T("Sembunyikan dari Cerita","Hide from the Story")}</button><p class="small" style="color:var(--ink);margin-top:.4rem;text-align:center">${T("Tamu tidak akan melihatnya. Tidak dihapus, dan tetap dihitung di ringkasan Anda.","Guests will not see it. It is not deleted, and still counts in your insights.")}</p>`
   :c.gid===S.gid?`<button class="btn alt wide" style="margin-top:.6rem" data-a="pcdel" data-id="${c.id}">${m.sure?T("Ketuk lagi untuk menghapus permanen","Tap again to remove it for good"):"🗑️ "+T("Hapus kartu pos saya","Remove my postcard")}</button>`:"";
  h=`<div class="modal" data-a="close"><div class="in">${pcHTML(c,true)}${act}<button class="btn alt wide" style="margin-top:.6rem" data-a="close">${own?T("Kembali","Back"):T("Kembali ke halaman","Back to the field")}</button></div></div>`}
 if(m.t==="menu")h=`<div class="modal" data-a="close" style="place-items:end;padding:0"><div class="sheet"><h2 style="font-size:1.2rem;margin-bottom:.5rem">${T("Cerita langkah demi langkah","The story, step by step")}</h2><ol class="steps">${stepsHTML()}</ol>
 <div class="row" style="margin-top:.8rem"><button class="btn alt" data-a="go" data-s="ai">${T("Cara kerja","How it works")}</button><button class="btn alt" data-a="reset">${T("Reset demo","Reset demo")}</button></div></div></div>`;
 if(m.t==="evid"){const b=B(),a=insightsFor(b),group=m.group||"asks",ev=(a.source==="backend"?a.evidence[group][m.k]:a.ev[m.k])||[],[c,tx]=insightLabel(a,group,m.k);
  h=`<div class="modal" data-a="close" style="place-items:end;padding:0"><div class="sheet"><span class="tag ${c}">${esc(tx||T("Bukti belum cukup","Not enough evidence yet"))}</span><h2 style="font-size:1.3rem;margin:.4rem 0">${esc(lab(m.k,b))}</h2><p class="sub">${T(`${ev.length} hal yang benar-benar ditulis tamu.`,`The ${ev.length} thing${ev.length===1?"":"s"} visitors actually wrote.`)} ${c==="thin"?T("Terlalu sedikit untuk bertindak. Tanyakan pada tamu berikutnya.","Too few to act on. Ask your next visitors."):""}</p>
  ${ev.map(e=>{const o=e.backend?null:ownerText(e);return `<div class="quote">“${esc(o||e.t)}”<small>${e.backend?T("Bukti tamu · teks asli","Visitor evidence · original text"):e.n?esc(e.n)+" "+e.f+" · "+T("kartu pos","postcard"):e.f+" · "+T("pertanyaan","question")}${o?" · "+T("diterjemahkan, aslinya: ","translated, original: ")+esc(e.t):""}</small></div>`}).join("")}
  <button class="btn wide" style="margin-top:1rem" data-a="close">${T("Tutup","Close")}</button></div></div>`}
 if(m.t==="book"){const b=biz(S.biz),d=new Date(Date.now()+6*864e5).toISOString().slice(0,10);
  h=`<div class="modal" data-a="close" style="place-items:end;padding:0"><div class="sheet"><button data-a="close" aria-label="${T("Tutup","Close")}" style="float:right;width:38px;height:38px;border-radius:50%;background:var(--white);border:1.5px solid var(--line);font-weight:800;line-height:1;margin:-.2rem -.2rem .4rem .6rem">✕</button><h2 style="font-size:1.3rem">${T("Minta kunjungan kepada","Ask")} ${esc(b.host)}</h2><p class="sub">${esc(Lst(b).availability?T("Buka: ","Open: ")+Lst(b).availability:T("Tanyakan hari buka","Ask about opening days"))}. ${esc(b.host)} ${T("mengonfirmasi setiap permintaan secara langsung.","confirms each request personally.")}</p>
  <div class="row"><div style="flex:2"><label class="f" for="bd">${T("Hari","Day")}</label><input class="t" type="date" id="bd" value="${d}"></div><div style="flex:1"><label class="f" for="bp">${T("Orang","People")}</label><select class="t" id="bp">${[1,2,3,4,5,6,7,8].map(n=>`<option ${n===2?"selected":""}>${n}</option>`).join("")}</select></div></div>
  <div id="bwarn">${closedNote(b,d)}</div>
  <label class="f">${T("Waktu","Time")}</label><div id="bt">${SLOTS_T.map(h=>`<button class="chip pick ${(ui.time||"09:00")===h?"on":""}" data-a="btime" data-h="${h}">${h}</button>`).join("")}</div>
  <div style="display:flex;align-items:center;gap:.6rem;margin-top:.3rem"><label class="small" for="bti">${T("atau waktu lain","or another time")}</label><input class="t" type="time" id="bti" step="900" style="width:auto" value="${ui.time&&!SLOTS_T.includes(ui.time)?ui.time:""}"></div>
  <button class="btn wide" style="margin-top:1rem" data-a="book">${T("Kirim permintaan","Send request")}</button><p class="small" style="margin-top:.5rem">${S.online?T("Tidak ada pembayaran di demo ini.","No payment in this demo."):T("Anda offline. Permintaan disimpan di ponsel dan dikirim nanti.","You are offline. The request is kept on this phone and sent later.")}</p></div></div>`}
 o.innerHTML=h+t}
let tt;function toast(t){ui.toast=t;renderOver();clearTimeout(tt);tt=setTimeout(()=>{ui.toast="";renderOver()},3600)}
function go(s){if(s.startsWith("b-"))S.role="biz";else if(s!=="login"&&s!=="ai"&&s!=="land")S.role="guest";S.screen=s;ui.modal=null;refreshInsights(true);render();if(s!=="chat"&&s!=="b-thread")$("#view").scrollTop=0}

/* ---------- Actions ---------- */
function swipe(v){S.likes[S.i]=v?1:0;S.i++;if(S.i>=CARDS.length){S.dna=computeDNA();S.screen="dna"}render()}
function bindSwipe(){const el=$("#top");if(!el)return;let x0=null,dx=0;
 el.onpointerdown=e=>{x0=e.clientX;el.setPointerCapture(e.pointerId);el.style.transition="none"};
 el.onpointermove=e=>{if(x0===null)return;dx=e.clientX-x0;el.style.transform=`translateX(${dx}px) rotate(${dx/18}deg)`;el.querySelector(".yes").style.opacity=Math.max(0,dx/80);el.querySelector(".no").style.opacity=Math.max(0,-dx/80)};
 el.onpointerup=el.onpointercancel=()=>{if(x0===null)return;x0=null;if(Math.abs(dx)>80){const v=dx>0;el.style.transition="transform .2s";el.style.transform=`translateX(${v?500:-500}px) rotate(${v?25:-25}deg)`;setTimeout(()=>swipe(v),170)}else{el.style.transition="transform .2s";el.style.transform="";el.querySelectorAll(".stampy").forEach(s=>s.style.opacity=0)}dx=0}}
const st=()=>S.online?"sent":"pending";
function setOnline(on){S.online=on;insightCache.clear();if(!bootReady)return;render(false);
 toast(on?"Back online. Checking for saved items to sync.":"Offline. Postcards are saved on this phone and sent later.");
 if(on)return synchronize()}
function push(b,tid,m){const k=b.id+":"+tid;(S.msgs[k]=S.msgs[k]||[]).push(Object.assign({sync:st(),mid:newId(),ts:Date.now(),own:S.gid},m.from==="g"?{who:S.guest.n||"Guest",f:S.guest.f}:{},m))}

/* ---------- Sync with the backend. Only runs when config.js sets an API address; without it everything stays on this device. ---------- */
const hash=s=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h};
async function api(path,method,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const r=await fetch(API+path,{method:method||"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal});
  if(!r.ok)throw Object.assign(new Error("HTTP "+r.status),{status:r.status});
  return path==="/api/postcards"&&method==="POST"?null:await r.json();
 }finally{clearTimeout(timer)}
}
const inflight={};
const offlineDB=window.YOLO_OFFLINE_DB;
let offlineReady=false,bootReady=false,creatingPostcard=null,flushPromise=null,pullPromise=null,syncPromise=null,resetting=false;
const postcardOperation=c=>({id:"postcard.create:"+c.id,type:"postcard.create",entity_id:c.id,payload:{...c},status:"pending",attempts:0,last_error:null,created_at:c.created_at});
const postcardView=c=>({...c,status:c.sync_status==="synced"?"sent":c.sync_status==="failed_permanent"?"failed_permanent":"pending"});
function mergePostcards(local,remote){
 const byId=new Map(local.map(c=>[c.id,c]));
 for(const r of remote){const existing=byId.get(r.id);
  if(!existing||existing.status==="sent")byId.set(r.id,{...existing,...r,sync_status:"synced",status:"sent",last_error:null});
 }
 return [...byId.values()];
}
function offlineError(e){console.error("Offline persistence:",e);toast("Could not save offline data. Your draft is kept here; check browser storage and try again.")}
async function hydratePostcards(){
 const db=await offlineDB.openOfflineDB();db.close();
 const persisted=await offlineDB.getLocalPostcards(),ids=new Set(persisted.map(c=>c.id));
 // Import the previous localStorage cache once, preserving its original retry ids.
 for(const c of S.mine){if(ids.has(c.id))continue;
  const pending=c.gid===S.gid&&!S.acked["postcards/"+c.id];
  const record={...c,sync_status:pending?"pending":"synced",created_at:c.created_at||new Date(c.ts||Date.now()).toISOString()};
  persisted.push(await offlineDB.saveLocalPostcard(record,pending?postcardOperation(record):null));ids.add(c.id);
 }
 S.mine=persisted.map(postcardView);offlineReady=true;save();
}
async function createPostcard(){
 keep();const d=S.draft;if(!d.t.trim()){toast("Write a few words first. One sentence is enough.");return}
 try{
  if(!offlineReady)throw new Error("Offline storage is unavailable.");
  const c={id:window.crypto.randomUUID(),gid:S.gid,ts:Date.now(),biz:S.biz,business_id:S.biz,n:S.guest.n||"A traveler",f:S.guest.f,l:"Original language",t:d.t.trim(),bg:d.bg,s:d.s.join(""),prompt:PROMPTS[d.p],voice:d.voice,photo:d.photo,loc:S.guest.f==="🇮🇩"?1:0,consent_for_analysis:false,status:"pending",sync_status:"pending",created_at:new Date().toISOString()};
  await offlineDB.saveLocalPostcard(c,postcardOperation(c));
  S.mine.push(c);S.draft=fresh().draft;go("thanks");
 }catch(e){save();offlineError(e)}
}
async function setPostcardSync(id,sync_status,last_error=null){
 const c=await offlineDB.getLocalPostcard(id);if(!c)throw new Error("Missing local postcard "+id);
 const next=postcardView({...c,sync_status,last_error});
 await offlineDB.saveLocalPostcard(next);
 const index=S.mine.findIndex(m=>m.id===id);if(index<0)S.mine.push(next);else S.mine[index]=next;
 save();const active=document.activeElement;
 if(!active||!/INPUT|TEXTAREA|SELECT/.test(active.tagName||""))render(false);
}
async function flushPostcards(){
 if(!offlineReady)return;
 const operations=await offlineDB.getPendingOperations();
 operations.sort((a,b)=>a.created_at.localeCompare(b.created_at));
 for(const op of operations){
  if(!S.online||navigator.onLine===false||resetting)break;
  if(op.type!=="postcard.create")continue;
  try{
   await offlineDB.updateOperation({...op,status:"syncing"});
   await setPostcardSync(op.entity_id,"syncing");
   let failure=null;
   try{await api("/api/postcards","POST",op.payload)}catch(e){failure=e}
   if(failure){
    const permanent=failure.status>=400&&failure.status<500;
    await offlineDB.markOperationFailed(op.id,failure,permanent);
    await setPostcardSync(op.entity_id,permanent?"failed_permanent":"pending",failure.message);
    console.warn("Postcard sync",op.entity_id,failure.message);
   }else{
    // Persist acceptance before clearing retry state; interrupted sends safely reuse the id.
    await setPostcardSync(op.entity_id,"synced");
    await offlineDB.removeOperation(op.id);
   }
  }catch(e){offlineError(e)}
 }
}
function outbox(){const o=[];
 S.mine.forEach(m=>{if(m.status==="sent"&&(m.removed||m.modBy===S.gid)&& (m.gid===S.gid||m.modBy===S.gid))o.push(["postcards",m.id+(m.removed?":r":"")+(m.hidden?":h":m.modBy?":s":""),m.removed?Object.assign({},m,{t:"(removed)"}):m])});
 for(const k in S.msgs)S.msgs[k].forEach(m=>{if(m.mid&&m.from!=="sys"&&m.own===S.gid)o.push(["messages",m.mid,Object.assign({},m,{id:m.mid,thread:k,sync:"sent"})])});
 S.bookings.forEach(k=>{const key="bookings/"+k.id+":"+k.status;if(k.local_pending||(!k.server_record&&!S.acked[key]))o.push(["bookings",k.id+":"+k.status,{...k,sync:"sent"}])});
 for(const id in S.listings)o.push(["listings",id+":"+(S.lts[id]||0)+":"+hash(JSON.stringify(S.listings[id])),{id,L:S.listings[id],ts:S.lts[id]||0}]);
 S.custom.forEach(b=>o.push(["businesses",b.id+":"+hash(b.name+b.story),b]));
 return o}
function flush(){
 if(flushPromise)return flushPromise;
 if(!API||!S.online||navigator.onLine===false||resetting)return Promise.resolve();
  const drain=async()=>{
  if(resetting)return;
  await flushPostcards();
  let changed=false;
  await Promise.all(outbox().map(async([kind,key,rec])=>{const k=kind+"/"+key;if(S.acked[k]||inflight[k]||resetting)return;inflight[k]=1;
   try{await api("/api/"+kind,"POST",rec);S.acked[k]=1;
    if(kind==="messages"){const m=(S.msgs[rec.thread]||[]).find(m=>m.mid===rec.mid);if(m)m.sync="sent"}
    if(kind==="bookings"){const b=S.bookings.find(b=>b.id===rec.id);if(b){b.sync="sent";b.local_pending=false}}
    if(kind==="listings"&&S.listings[rec.id]===rec.L&&(S.lts[rec.id]||0)===rec.ts){
     S.lsync[rec.id]="Synced. Guests can find it now.";
     if(typeof voiceListingSync==="function")voiceListingSync(rec.id,S.lsync[rec.id]);
     if(S.role==="biz"&&S.screen==="b-list"&&S.myBiz===rec.id)toast(T("Daftar tersimpan dan tersinkron dengan YoloWisata.","Listing saved and synced with YoloWisata."));
    }
    changed=true;save();
  }catch(e){console.warn("Sync",kind,e.message);const permanent=e.status>=400&&e.status<500;
   if(kind==="listings"&&S.listings[rec.id]===rec.L&&(S.lts[rec.id]||0)===rec.ts){S.lsync[rec.id]=permanent?"Saved on this device, but server sync needs attention.":"Saved on this device. Server sync will retry.";if(typeof voiceListingSync==="function")voiceListingSync(rec.id,S.lsync[rec.id]);changed=true;save()}
   if(permanent){S.acked[k]=1;if(kind==="bookings"){const b=S.bookings.find(b=>b.id===rec.id);if(b){b.sync="failed_permanent";b.local_pending=false}}changed=true;save()}}finally{delete inflight[k]}
  }));
  const active=document.activeElement;
  if(changed&&!ui.modal&&!(active&&/INPUT|TEXTAREA|SELECT/.test(active.tagName||"")))render(false);
 };
 // Web Locks also serialize drains across tabs where the browser supports them.
 flushPromise=(navigator.locks?navigator.locks.request("yolowisata-postcards",drain):drain())
  .catch(offlineError).finally(()=>{flushPromise=null});
 return flushPromise;
}
function synchronize(){
 if(syncPromise)return syncPromise;
 syncPromise=(async()=>{await flush();await pull();await refreshInsights()})().finally(()=>{syncPromise=null});
 return syncPromise;
}
function pull(){if(pullPromise)return pullPromise;if(!API||!S.online||navigator.onLine===false||resetting)return Promise.resolve();
 pullPromise=api("/api/sync").then(async d=>{if(resetting)return;let ch=false;const vals=k=>Object.values(d[k]||{});
 vals("businesses").forEach(r=>{const c=S.custom.find(b=>b.id===r.id);if(BIZ0.some(b=>b.id===r.id))return;if(!c){S.custom.push(r);ch=true}else if(c.name!==r.name||c.story!==r.story){c.name=r.name;c.story=r.story;ch=true}});
 const merged=mergePostcards(S.mine,vals("postcards"));
 for(const c of merged){const previous=S.mine.find(m=>m.id===c.id);
  if(JSON.stringify(previous)===JSON.stringify(c))continue;
  if(offlineReady)await offlineDB.saveLocalPostcard(c);
  const index=S.mine.findIndex(m=>m.id===c.id);
  if(index<0)S.mine.push(c);else if(S.mine[index]===previous)S.mine[index]=c;
  ch=true;
 }
 vals("messages").forEach(r=>{const a=S.msgs[r.thread]=S.msgs[r.thread]||[];if(!a.some(m=>m.mid===r.mid)){a.push(r);a.sort((x,y)=>(x.ts||0)-(y.ts||0));ch=true}});
 vals("bookings").forEach(r=>{const k=S.bookings.find(k=>k.id===r.id);if(!k){S.bookings.push({...r,sync:"sent",local_pending:false,server_record:true});ch=true}else{if(!k.server_record){k.server_record=true;ch=true}if((r.ts||0)>=(k.ts||0)){Object.assign(k,r,{sync:"sent",local_pending:false,server_record:true});ch=true}}});
 vals("bookingstatus").forEach(r=>{if((r.ts||0)>(S.bts[r.id]||0)){S.bstat[r.id]=r.status;S.bts[r.id]=r.ts;ch=true}});
 vals("listings").forEach(r=>{if((r.ts||0)>(S.lts[r.id]||0)){S.listings[r.id]=r.L;S.lts[r.id]=r.ts;ch=true}});
 if(ch){save();const a=document.activeElement;if(!ui.modal&&!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName||"")))render(false)}}).catch(e=>console.warn("Pull",e.message)).finally(()=>{pullPromise=null});return pullPromise}
async function resetDemo(){
 if(resetting)return;resetting=true;
 try{
  await creatingPostcard;await flushPromise;await pullPromise;
  if(offlineDB)await offlineDB.clearOfflineData();
  S=fresh();S.online=navigator.onLine!==false;insightCache.clear();noorInsightId=null;
  ui={modal:null,rec:0,edit:false,transcript:"",tid:"",newSector:"Craft",ltab:"guest"};
  render(false);toast("Cleared. This device is back to a fresh start.");
 }catch(e){offlineError(e)}finally{resetting=false}
}
const A={
 go:el=>go(el.dataset.s), swipe:el=>swipe(+el.dataset.v),
 redo:()=>{S.i=0;S.likes=[];S.dna=null;go("swipe")},
 net:()=>setOnline(!S.online),
 close:(el,e)=>{if(e.target===el||el.tagName==="BUTTON"){ui.modal=null;renderOver()}},
 reset:resetDemo,
 asguest:()=>{S.guest={n:$("#gn").value.trim(),f:$("#gf").value};go("explore");toast("Saved.")},
 regopen:()=>{ui.regOpen=!ui.regOpen},   /* remember it, so picking a sector does not fold the form shut */
 ltab:el=>{ui.ltab=el.dataset.t;if(el.dataset.reg)ui.regOpen=true;go("login")},
 logout:()=>{S.acct=null;render();toast("Logged out. Your data stays on this device.")},
 glogin:()=>{const phone=$("#lp").value.replace(/\D/g,""),pin=$("#lpin").value;if(phone.length<8||pin.length<4){toast("Enter your phone number and a PIN of 4 to 6 digits.");return}
  if(!API||!S.online){toast(API?"You are offline. Log in when you have signal.":"Accounts need the server. Your data is still kept on this device.");return}
  api("/api/login","POST",{kind:"guest",phone,pin,gid:S.gid,name:S.guest.n,flag:S.guest.f}).then(r=>{adopt(r.gid);if(r.name||!S.guest.n)S.guest={n:r.name||"",f:r.flag||S.guest.f};S.acct={kind:"guest",phone};render();pull();toast(r.created?"Account created.":"Welcome back"+(r.name?", "+r.name:"")+".")})
  .catch(e=>toast(/401/.test(e.message)?"That PIN does not match this number.":"Could not reach the server. Try again."))},
 blogin:()=>{const phone=$("#lp").value.replace(/\D/g,""),pin=$("#lpin").value;if(phone.length<8||pin.length<4){toast("Enter your phone number and PIN.");return}
  if(!API||!S.online){toast(API?"You are offline. Log in when you have signal.":"Business login needs the server. Use a demo account below.");return}
  api("/api/login","POST",{kind:"biz",phone,pin}).then(r=>{S.acct={kind:"biz",phone};pull();setTimeout(()=>{S.myBiz=r.bizId;ui.transcript="";go("b-insights")},600)})
  .catch(e=>toast(/401/.test(e.message)?"That PIN does not match this number.":/404/.test(e.message)?"No business uses this number yet. Register below.":"Could not reach the server. Try again."))},
 asbiz:el=>{S.myBiz=el.dataset.id;ui.transcript="";go("b-insights")},
 nsec:el=>{ui.newSector=el.dataset.s;const v=$("#bn").value;render();$("#bn").value=v},
 register:()=>{const n=$("#bn").value.trim();if(!n){toast("Type your first name so guests know who you are.");return}const sec=ui.newSector,id="c"+newId();
  S.custom.push({id,name:n+"’s "+SECTORS[sec][2],host:n,sector:sec,e:SECTORS[sec][0],col:PAL[S.custom.length%4],place:"Ondera village",dna:SECTORS[sec][1],chips:[sec,"New on YoloWisata"],story:"",L:{},cards:[],qs:[],bookings:[],threads:[],custom:true});
  const phone=$("#rp").value.replace(/\D/g,""),pin=$("#rpin").value;
  if(API&&S.online){if(phone.length<8||pin.length<4){S.custom.pop();toast("Add a phone number and a PIN of 4 to 6 digits, so you can log in again later.");return}
   api("/api/login","POST",{kind:"biz",phone,pin,bizId:id}).then(()=>{S.acct={kind:"biz",phone};save()}).catch(e=>toast(/401|409/.test(e.message)?"This number already has a business. Log in instead.":"Could not save the login. The business is kept on this device."))}
  S.myBiz=id;ui.transcript="";go("b-list");toast("Welcome, "+n+". Now tell guests what you offer.")},
 flip:el=>el.classList.toggle("on"),
 hear:el=>{const [id,en]=PHR[+el.dataset.i],flip=el.closest?.(".phc")?.querySelector(".flip"),frontLang=flip?.dataset.frontLang||(S.blang==="en"?"id":"en"),flipped=!!flip?.classList.contains("on"),language=flipped?(frontLang==="id"?"en":"id"):frontLang;return speakText(language==="id"?id:en,language,Number(el.dataset.r)||1)},
 learn:el=>{const i=el.dataset.i;S.learned[i]=!S.learned[i];render();if(PHR.every((_,j)=>S.learned[j]))toast("⭐ All "+PHR.length+" phrases. Go and try them on someone!")},
 lang:el=>{const next=el&&el.dataset.lang;if(next!=="en"&&next!=="id")return;S.blang=next;render()},
 loc:()=>{const done=m=>{S.here=GATE;render();toast(m)};
  try{if(!navigator.geolocation)return done("This browser cannot share location. Starting from the village gate.");toast("Finding you…");
   navigator.geolocation.getCurrentPosition(p=>done("Found you, within about "+Math.round(p.coords.accuracy)+" m. Ondera is a demo village, so your pin starts at the village gate."),()=>done("Location is blocked here. Starting from the village gate instead."),{timeout:6000})}
  catch(e){done("Location is blocked here. Starting from the village gate instead.")}},
 sector:el=>{S.sector=el.dataset.s;render()},
 view:el=>{S.biz=el.dataset.id;go("exp")},
 offline:el=>{const b=biz(el.dataset.id);S.saved[b.id]=1;render();toast("Saved on this phone: "+b.name+", your Travel DNA and "+cardsOf(b).length+" postcards.")},
 chatwith:el=>{S.biz=el.dataset.id;go("chat")},
 gq:el=>{const q=GQ[+el.dataset.i],b=biz(S.biz);push(b,gt(),{from:"g",t:q.t,id:q.id});if(q.auto&&Lst(b).price)push(b,gt(),{from:"sys",t:"From the listing: "+Lst(b).price+". "+b.host+" can still answer herself or himself.",sync:"sent"});render()},
 gsend:()=>{const v=$("#cin").value.trim();if(!v)return;const id=PB.en[norm(v)];push(biz(S.biz),gt(),Object.assign({from:"g",t:v},id?{id}:{}));render()},
 thread:el=>{ui.tid=el.dataset.id;go("b-thread")},
 bq:el=>{push(B(),ui.tid,{from:"b",t:el.dataset.t,en:el.dataset.en});render()},
 bsend:()=>{const v=$("#cin").value.trim();if(!v)return;const en=PB.id[norm(v)];push(B(),ui.tid,Object.assign({from:"b",t:v},en?{en}:{}));render()},
 trm:el=>{S.tr[el.dataset.k]=!S.tr[el.dataset.k];render()},
 btime:el=>{const o=$("#bti");if(o)o.value="";ui.time=el.dataset.h;document.querySelectorAll("#bt .chip").forEach(c=>c.classList.toggle("on",c===el))},
 bookopen:()=>{ui.modal={t:"book"};renderOver()},
 book:()=>{const d=$("#bd").value,b=biz(S.biz);if(!d){toast("Pick a day first.");return}
  const nice=new Date(d+"T12:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  S.bookings.push({id:"k"+newId(),gid:S.gid,ts:Date.now(),biz:b.id,who:(S.guest.n||"Guest")+" "+S.guest.f,date:nice,visit_date:d,off:offDay(b,d)?1:0,time:ui.time||"09:00",people:+$("#bp").value,status:"pending",sync:st(),local_pending:true});go("trips");toast(S.online?"Request sent to "+b.host+".":"Saved on this phone. Will send when connection returns.")},
 bdec:el=>{const id=el.dataset.id,k=S.bookings.find(k=>k.id===id);if(k){k.status=el.dataset.v;k.ts=Date.now();k.local_pending=true;k.sync="pending"}else{S.bstat[id]=el.dataset.v;S.bts[id]=Date.now()}render();toast(T((el.dataset.v==="confirmed"?"Diterima.":"Ditolak.")+(S.online?(k?" Tamu sudah bisa melihatnya.":" Demo only; not sent to the server."):" Tersimpan di ponsel."),(el.dataset.v==="confirmed"?"Confirmed.":"Declined.")+(S.online?(k?" The guest can see it now.":" Demo only; not sent to the server."):" Saved locally.")))},
 prompt:el=>{S.draft.p=+el.dataset.i;keep();render()}, bg:el=>{S.draft.bg=el.dataset.b;keep();render()},
 stk:el=>{const s=el.dataset.s,a=S.draft.s;a.includes(s)?a.splice(a.indexOf(s),1):a.length<4&&a.push(s);keep();render()},
 voice:()=>{S.draft.voice=!S.draft.voice;keep();render();if(S.draft.voice)toast("Voice note attached (simulated in this prototype).")},
 send:()=>{if(resetting)return;if(!creatingPostcard)creatingPostcard=createPostcard().finally(()=>{creatingPostcard=null});return creatingPostcard},
 open:el=>{ui.modal={t:"pc",id:el.dataset.id};renderOver()},
 pcdel:el=>{const c=S.mine.find(m=>m.id===el.dataset.id&&m.gid===S.gid);if(!c)return;if(!ui.modal.sure){ui.modal.sure=1;renderOver();return}
  c.removed=true;c.t="";c.photo="";c.ts=Date.now();ui.modal=null;render();toast("Your postcard was removed.")},
 pchide:el=>{const id=el.dataset.id,c=S.mine.find(m=>m.id===id);
  if(c){c.hidden=!c.hidden;c.ts=Date.now();c.modBy=S.gid}else{S.hid[id]=!S.hid[id]}   /* sample postcards from the data file are hidden on this device only */
  ui.modal=null;render();toast(isHid(c||{id})?T("Disembunyikan dari Cerita.","Hidden from the Story."):T("Tampil lagi di Cerita.","Showing in the Story again."))},
 tr:el=>{S.tr[el.dataset.k]=!S.tr[el.dataset.k];renderOver()},
 voiceRecord:()=>voiceRecord(),
 voiceExtract:()=>voiceExtract(),
 voiceManual:()=>voiceManual(),
 voiceConfirm:()=>voiceConfirm(),
 voiceChip:el=>voiceChip(el),
 idea:el=>{S.idea[B().id]=el.dataset.v;render()},
 evid:el=>{ui.modal={t:"evid",k:el.dataset.k,group:el.dataset.group||"asks"};renderOver()},
 say:el=>{const t=el.dataset.t;toast("🔊 “"+t+"”");return speakText(t,el.dataset.lang||"id",Number(el.dataset.r)||1)}
};
function keep(){const m=$("#msg");if(m)S.draft.t=m.value}
document.addEventListener("click",e=>{const el=e.target.closest("[data-a]");if(el&&A[el.dataset.a])A[el.dataset.a](el,e)});
const DAYN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
/* true when the listing names its open days and the chosen date is not one of them; unknown opening days never warn */
function offDay(b,d){const av=(Lst(b).availability||"");if(!d||/every day/i.test(av))return false;const open=DAYN.filter(n=>av.includes(n));if(!open.length)return false;return !open.includes(DAYN[new Date(d+"T12:00").getDay()])}
function closedNote(b,d){if(!offDay(b,d))return"";const day=DAYN[new Date(d+"T12:00").getDay()];
 return `<div role="status" style="background:#FFE4D9;border:1.5px solid var(--orange);border-radius:16px;padding:.7rem .8rem;margin-top:.8rem"><b>⚠️ ${esc(b.host)} ${T("biasanya tutup pada hari "+day+".","is usually closed on "+day+".")}</b><p class="small" style="color:var(--ink);margin-top:.2rem">${T("Buka: ","Open: ")}${esc(Lst(b).availability)}. ${T("Anda tetap dapat mengirim permintaan, tetapi mungkin ditolak. Sebaiknya tanyakan dahulu.","You can still send the request, but it may be declined. It is best to ask first.")}</p><button class="btn alt" style="margin-top:.5rem;min-height:40px;padding:.4rem .9rem" data-a="go" data-s="chat">💬 ${T("Pesan ","Message ")}${esc(b.host)} ${T("terlebih dahulu","first")}</button></div>`}
const SLOTS_T=["08:00","09:00","10:00","11:00","13:00","14:00","15:00","16:00"];
document.addEventListener("input",e=>{const id=e.target.id;
 if(id==="bd"){const w=$("#bwarn");if(w)w.innerHTML=closedNote(biz(S.biz),e.target.value)}
 if(id==="bti"&&e.target.value){ui.time=e.target.value;document.querySelectorAll("#bt .chip").forEach(c=>c.classList.toggle("on",c.dataset.h===ui.time))}
 if(id==="msg"){keep();$("#pv").innerHTML=pcHTML(draftCard());save()}
 if(typeof voiceInput==="function" && (id.startsWith("voice-") || (e.target.dataset && (e.target.dataset.voiceField||e.target.dataset.voiceOther))))voiceInput(e.target)});
document.addEventListener("change",e=>{
 if(typeof voiceInput==="function" && e.target.dataset && e.target.dataset.voiceField)voiceInput(e.target);
 if(e.target.id!=="ph"||!e.target.files[0])return;const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement("canvas"),k=Math.min(1,420/img.width);c.width=img.width*k;c.height=img.height*k;c.getContext("2d").drawImage(img,0,0,c.width,c.height);keep();S.draft.photo=c.toDataURL("image/jpeg",.7);render()};img.src=r.result};r.readAsDataURL(e.target.files[0])});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ui.modal){ui.modal=null;renderOver()}
 if(e.key==="Enter"&&e.target.id==="cin"){S.screen==="chat"?A.gsend():A.bsend()}
 if(S.screen==="swipe"&&!ui.modal){if(e.key==="ArrowRight")swipe(1);if(e.key==="ArrowLeft")swipe(0)}});
window.addEventListener("offline",()=>setOnline(false));window.addEventListener("online",()=>setOnline(true));
async function boot(){let c=window.YOLO_CONTENT,storageError=null;
 const hydration=offlineDB?hydratePostcards().catch(e=>{storageError=e}):null;
 // Cached shell content and IndexedDB are enough to render before backend requests.
 if(!c&&window.caches){try{const cached=await window.caches.match("/data/content.json");if(cached)c=await cached.json()}catch(e){}}
 if(!c){try{c=await (await fetch("/data/content.json")).json()}catch(e){}}
 if(!c&&API&&navigator.onLine!==false){try{c=await api("/api/content")}catch(e){}}
 if(!c){$("#view").innerHTML='<div class="pad"><h1 style="font-size:1.5rem">YoloWisata could not load its content</h1><p class="sub">Open it once with a connection. After that it works offline.</p></div>';return}
 applyContent(c);
 if(hydration)await hydration;
 S.online=navigator.onLine!==false;
 bootReady=true;render(false);if(storageError)offlineError(storageError);
 if(API){
   synchronize();
   setInterval(()=>{synchronize();refreshInsights()},8000)
 }}
boot();
