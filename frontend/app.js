/* ---------- Content. Loaded from /data/content.json (or from the backend). Edit the data there, not here. ---------- */
const API=((window.YOLO_CONFIG||{}).api||"").replace(/\/$/,"");
const DIMS={hands:"Hands-on",nature:"Nature",culture:"Local culture",food:"Food discovery",quiet:"Quiet places",crowds:"Crowded attractions"};
const PAL=["#FFC928","#47C882","#FF7043","#7193D8","#D6E8FA"];
const WHYG={hands:"You make something yourself",nature:"Time outdoors",culture:"A small local business with its own story",food:"Local food, made by locals",quiet:"Small groups, far from the crowds"};
let CARDS=[],SECTORS={},SAMPLES={},BIZ0=[],LOVED={},ASKS={},LID={},IDEAS=[],IDEAID={},GQ=[],BR=[],IDQ={},PHR=[],POS={},GATE=[18,86];
function applyContent(c){CARDS=c.swipeCards;GATE=(c.village&&c.village.gate)||GATE;
 for(const k in c.sectors){const s=c.sectors[k];SECTORS[k]=[s.emoji,s.dna,s.suffix];SAMPLES[k]=s.sample}
 const lex=(src,dst)=>{for(const k in src){dst[k]=[src[k].en,src[k].words];LID[k]=src[k].id}};lex(c.themes.loved,LOVED);lex(c.themes.asks,ASKS);
 IDEAS=c.ideas||[];IDEAS.forEach(i=>IDEAID[i.title]=[i.title_id||i.title,i.text_id||i.text]);
 GQ=c.guestQuestions||[];GQ.forEach(q=>IDQ[q.t]=q.id);BR=c.ownerReplies||[];
 PHR=(c.phrases||[]).map(p=>[p.id,p.en,p.say,p.emoji]);
 BIZ0=c.businesses.map(b=>Object.assign({why:null,chips:[],story:"",L:{},cards:[],qs:[],bookings:[],threads:[],e:(SECTORS[b.sector]||SECTORS.Other)[0],col:"#FFC928",place:""},b,{dna:b.dna||(SECTORS[b.sector]||SECTORS.Other)[1]}));
 BIZ0.forEach(b=>{if(b.pos)POS[b.id]=b.pos})}
/* Tiny multilingual lexicon tagger: the on-device stand-in for a small language model. The word lists live in content.json under "themes". */
const tagsOf=(txt,lex)=>{const s=txt.toLowerCase();return Object.keys(lex).filter(k=>lex[k][1].some(w=>s.includes(w)))};
const T=(id,en)=>S.blang==="en"?en:id;
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
const fresh=()=>({acct:null,gid:newId(),acked:{},bts:{},lts:{},screen:"land",role:"guest",guest:{n:"",f:"🌍"},blang:"id",learned:{},here:null,biz:"noor",myBiz:"noor",custom:[],online:true,i:0,likes:[],dna:null,saved:{},mine:[],msgs:{},bookings:[],bstat:{},idea:{},listings:{},lsync:{},sector:"All",draft:{bg:"sun",s:[],p:0,t:"",voice:false,photo:""},tr:{}});
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
const cardsOf=b=>b.cards.map((c,i)=>({...c,id:b.id+"-s"+i})).concat(S.mine.filter(m=>m.biz===b.id));
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
const STEPS=[["login","Browse as a guest, or log in","Everyone"],["swipe","Discover your Travel DNA","Guest"],["match","Get matched to local businesses","Guest"],["exp","View Noor’s experience","Guest"],["inbox","Message local businesses across languages","Guest"],["trips","Ask to book a visit","Guest"],["help","Phrase cards for talking face to face","Guest"],["card","Leave a postcard","Guest"],["story","The Story of This Place","Guest"],["b-list","Describe the business by voice","Local business"],["b-msgs","Reply to guests, translated","Local business"],["b-book","Confirm or decline bookings","Local business"],["b-insights","See what visitors remember","Local business"]];

/* ---------- AI 1: Travel DNA and matching ---------- */
function computeDNA(){const d={};for(const k in DIMS){let tot=0,yes=0;CARDS.forEach((c,i)=>{if(c.g.includes(k)){tot++;if(S.likes[i])yes++}});d[k]=yes/tot}return d}
function matchOf(b){const d=S.dna||computeDNA();let diff=0;for(const k in DIMS)diff+=Math.abs(d[k]-b.dna[k]);
 const w=b.why||WHYG;return{score:Math.round((1-diff/6)*100),why:Object.keys(w).filter(k=>d[k]>=.5&&b.dna[k]>=.5).map(k=>w[k])}}

/* ---------- AI 4: Experience DNA from postcards, questions and guest messages ---------- */
function analyse(b){const hw=b.host.toLowerCase().split(" ").pop(),LV=Object.assign({},LOVED,LOVED.host?{host:[LOVED.host[0],LOVED.host[1].concat(hw)]}:{});const cards=b.cards.concat(S.mine.filter(m=>m.biz===b.id&&m.status==="sent"));
 let qs=b.qs.slice(),waiting=S.mine.filter(m=>m.biz===b.id&&m.status!=="sent").length;
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
<h1>Travel local. Stay connected.</h1><p class="tagline">Download the place. Discover the people. <em>Live the moment, even offline.</em></p></div>
<div class="inner"><button class="btn sun wide" data-a="go" data-s="explore">Start exploring</button>
<div class="row" style="margin-top:.7rem"><button class="btn" data-a="go" data-s="swipe">Find my Travel DNA</button><button class="btn" data-a="ltab" data-t="biz">I run a business</button></div>
<p class="small" style="color:var(--ink);text-align:center;margin-top:1rem">No account needed to look around. Built for real local businesses, not just the ones already online.</p></div></div>`;

V.login=()=>{const a=S.acct,biz=ui.ltab==="biz",flags=["🌍","🇮🇩","🇲🇽","🇬🇧","🇺🇸","🇩🇪","🇫🇷","🇯🇵","🇪🇸","🇮🇳","🇰🇷","🇧🇷","🇦🇺"];
 const phonePin=`<div class="row"><div style="flex:3"><label class="f" for="lp">Phone number</label><input class="t" id="lp" inputmode="tel" autocomplete="tel" placeholder="0812…"></div><div style="flex:2"><label class="f" for="lpin">PIN (4 to 6 digits)</label><input class="t" id="lpin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div></div>`;
 return `<div class="pad"><div class="hello">${MASCOT}<div><h1 style="font-size:1.7rem">Your account</h1><p class="sub">${a?"Logged in as "+esc(a.phone)+".":"You are browsing as a guest. That is all you need."}</p></div></div>
 <div class="tabs2"><button class="${biz?"":"on"}" data-a="ltab" data-t="guest">🧳 Guest</button><button class="${biz?"on":""}" data-a="ltab" data-t="biz">🏡 Local business</button></div>
 ${biz?`
 <div class="box"><h3>Log in to your business</h3><p class="sub">Use the phone number and PIN you registered with.</p>${phonePin}
 <button class="btn wide" style="margin-top:.9rem" data-a="blogin">Log in</button></div>
 <div class="box"><h3>New here? Register your business</h3><p class="sub">Any kind: a farm, a workshop, a kitchen, a homestay, a guide.</p>
 <label class="f" for="bn">Your first name</label><input class="t" id="bn" maxlength="24" placeholder="For example Rina">
 <div style="margin-top:.6rem">${Object.keys(SECTORS).map(k=>`<button class="chip pick ${ui.newSector===k?"on":""}" data-a="nsec" data-s="${k}">${SECTORS[k][0]} ${k}</button>`).join("")}</div>
 <div class="row"><div style="flex:3"><label class="f" for="rp">Phone number</label><input class="t" id="rp" inputmode="tel" placeholder="0812…"></div><div style="flex:2"><label class="f" for="rpin">Choose a PIN</label><input class="t" id="rpin" type="password" inputmode="numeric" maxlength="6"></div></div>
 <button class="btn sun wide" style="margin-top:.9rem" data-a="register">Register and describe it by voice</button>
 ${API?"":`<p class="small" style="margin-top:.5rem">No server is connected, so the phone number and PIN are optional and this business lives on this device only.</p>`}</div>
 <details class="box"><summary><b>Try a sample business</b> <span class="small">no login needed</span></summary>
 ${all().map(b=>`<button class="bz" data-a="asbiz" data-id="${b.id}"><span class="tile" style="background:${b.col}">${b.e}</span><span><b>${esc(b.name)}</b><span class="small">${b.sector}</span></span></button>`).join("")}</details>`
 :`
 <div class="box sel"><h3>How guests see you</h3><p class="sub">Optional. Used on your messages, bookings and postcards.</p>
 <div class="row"><div style="flex:2"><label class="f" for="gn">Nickname</label><input class="t" id="gn" maxlength="20" value="${esc(S.guest.n)}"></div>
 <div style="flex:1"><label class="f" for="gf">From</label><select class="t" id="gf">${flags.map(x=>`<option ${x===S.guest.f?"selected":""}>${x}</option>`).join("")}</select></div></div>
 <button class="btn wide" style="margin-top:.9rem" data-a="asguest">Save and keep exploring</button></div>
 ${a&&a.kind==="guest"?`<div class="box"><h3>Logged in</h3><p class="sub">Your visits and chats follow you to any device where you log in with ${esc(a.phone)}.</p><button class="btn alt wide" style="margin-top:.8rem" data-a="logout">Log out</button></div>`
 :`<div class="box"><h3>Log in or create an account</h3><p class="sub">Only needed if you want your visits and chats on another device. The first time you use a number, this creates the account.</p>${phonePin}
 <button class="btn alt wide" style="margin-top:.9rem" data-a="glogin">Log in</button>
 ${API?"":`<p class="small" style="margin-top:.5rem">No server is connected right now, so accounts are switched off. Everything you do is still kept on this device.</p>`}</div>`}`}
 <p class="small" style="margin-top:1.2rem;display:flex;gap:1rem;flex-wrap:wrap"><button style="text-decoration:underline;font-weight:700" data-a="go" data-s="ai">How YoloWisata works</button><button style="text-decoration:underline" data-a="reset">Clear everything on this device</button></p>
 </div>`};

V.explore=()=>{const cats=[["All","✨"]].concat(Object.keys(SECTORS).slice(0,5).map(k=>[k,SECTORS[k][0]]));
 let list=all().filter(b=>S.sector==="All"||b.sector===S.sector).map(b=>({b,m:S.dna?matchOf(b).score:null,d:kmTo(b)}));
 if(S.dna)list.sort((x,y)=>y.m-x.m);else if(S.here)list.sort((x,y)=>x.d-y.d);
 return `<div class="pad"><div class="hello">${MASCOT}<div><p class="small">Hi${S.guest.n?" "+esc(S.guest.n):""} 👋</p><h1 style="font-size:1.7rem">Find someone local</h1></div></div>
 ${S.dna?"":`<button class="box" style="width:100%;text-align:left;background:var(--yellow);border:0" data-a="go" data-s="swipe"><b>🧬 Find your Travel DNA</b><br><span class="small" style="color:var(--ink)">Ten swipes, and this list sorts itself for you.</span></button>`}
 ${S.here?`<div class="savebar on"><span style="font-size:1.5rem">📍</span><div><b>Showing what is near you</b><div class="small">Your position comes from the phone’s GPS, which works with no internet.</div></div></div><div class="map">${mapSVG(list.map(x=>x.b))}</div>`
 :`<button class="savebar" data-a="loc"><span style="font-size:1.5rem">📍</span><div><b>Use my location</b><div class="small">See how far each place is. Optional, and never shared with anyone.</div></div></button>`}
 <div class="cats">${cats.map(([k,e])=>`<button class="cat ${S.sector===k?"on":""}" data-a="sector" data-s="${k}"><span>${e}</span>${k}</button>`).join("")}</div>
 <div class="places">${list.map(({b,m,d})=>`<button class="pcard" data-a="view" data-id="${b.id}"><div class="art" style="background:${b.col}">${b.e}</div><div class="body"><b>${esc(b.name)}</b><div class="small">${b.sector} · ${esc(b.place)}</div>
 ${m!==null?`<span class="tag early">${m}% match</span>`:""}${d?`<span class="tag blue">${d} km away</span>`:""}${S.saved[b.id]?`<span class="tag strong">Saved offline</span>`:""}</div></button>`).join("")||`<div class="box"><b>Nobody here yet</b><p class="sub">No ${S.sector.toLowerCase()} business has joined in this village so far.</p></div>`}</div>
 <p class="small" style="margin-top:.9rem">Run something yourself? <button style="text-decoration:underline;font-weight:700" data-a="go" data-s="login">Add your business</button></p></div>`};

V.help=()=>{const n=PHR.filter((_,i)=>S.learned[i]).length,all8=n===PHR.length;
 return `<div class="pad"><div class="hello ${all8?"cheer":""}">${MASCOT}<div><h1 style="font-size:1.6rem">${all8?"Kamu hebat!":"Say it in Indonesian"}</h1><p class="sub">${all8?"You can say all "+n+". You sound local already.":"Listen, repeat, then try it on a real person."}</p></div></div>
 <div class="box"><b style="display:flex;justify-content:space-between"><span>Phrases you can say</span><span>${n} of ${PHR.length}</span></b><div class="track" style="margin-top:.4rem"><i style="width:${n/PHR.length*100}%;background:var(--green)"></i></div></div>
 <div class="phrases">${PHR.map(([id,en,pr,e],i)=>`<div class="phc ${S.learned[i]?"got":""}"><button class="flip" data-a="flip" aria-label="Phrase card: ${en}. Tap to flip."><span class="in"><span class="face" style="background:${["#FFF2C6","#DCF4E7","#FFE4D9","#D6E8FA"][i%4]}"><span class="emo">${e}</span><span class="say" lang="id">${id}</span><span class="pron">${pr}</span><span class="hint">Tap to see English</span></span><span class="face bk"><span class="hint">In English</span><span class="say">${en}</span><span class="hint">Tap to flip back</span></span></span></button>
 <div class="acts"><button data-a="hear" data-i="${i}" data-r="0.95">🔊 Hear it</button><button data-a="hear" data-i="${i}" data-r="0.55">🐢 Slow</button><button class="${S.learned[i]?"on":""}" data-a="learn" data-i="${i}">${S.learned[i]?"⭐ Got it":"☆ Got it?"}</button></div></div>`).join("")}</div>
 <p class="small" style="margin-top:1.2rem">The cards and the spelled-out sounds are stored on the phone and work with no signal. The voice uses your phone’s own speech, so it needs an Indonesian voice installed.</p>
 <button class="btn alt wide" style="margin-top:.8rem" data-a="go" data-s="inbox">Need more? Message the host</button></div>`};

V.swipe=()=>{if(S.i>=CARDS.length)return V.dna();const c=CARDS[S.i],n=CARDS[S.i+1];
 const card=(c,i,cls)=>`<div class="sw ${cls}" ${cls?"":'id="top"'} style="background:${PAL[i%5]}"><span class="stampy yes">Yes!</span><span class="stampy no">Not for me</span><span class="emo">${c.e}</span><h3>${c.t}</h3><p>${c.d}</p></div>`;
 return `<div class="pad"><h1 style="font-size:1.5rem">Would you enjoy this?</h1><p class="sub">Swipe right for yes, left for no. Ten cards, no forms.</p>
 <div class="deck">${n?card(n,S.i+1,"back"):""}${card(c,S.i,"")}</div>
 <div class="swbtns"><button data-a="swipe" data-v="0" aria-label="Not for me">✕</button><button data-a="swipe" data-v="1" aria-label="Yes, I would enjoy this">♥</button></div>
 <div class="dots">${CARDS.map((_,i)=>`<i class="${i<S.i?"d":""}"></i>`).join("")}</div></div>`};

V.dna=()=>{if(!S.dna)return V.swipe();const rows=Object.keys(DIMS).map(k=>[k,Math.round(S.dna[k]*100)]).sort((a,b)=>b[1]-a[1]);
 const low=rows.filter(r=>r[1]<=25).map(r=>DIMS[r[0]].toLowerCase());
 return `<div class="pad"><p class="hand">That was quick.</p><h1 style="font-size:1.8rem">Your Travel DNA</h1>
 <div class="box">${rows.map(([k,p],i)=>`<div class="bar-row"><b><span>${DIMS[k]}</span><span>${p}%</span></b><div class="track"><i style="width:${p}%;background:${PAL[i%4]}"></i></div></div>`).join("")}</div>
 ${low.length?`<p class="sub" style="margin-top:.8rem">You tend to skip ${low.join(" and ")}.</p>`:""}
 <p class="small" style="margin-top:.6rem">📥 Kept on this phone. It still works with no signal.</p>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="go" data-s="match">See my matches</button><button class="btn alt" data-a="redo">Swipe again</button></div></div>`};

V.match=()=>{if(!S.dna)return V.swipe();const r=all().map(b=>({b,m:matchOf(b)})).sort((x,y)=>y.m.score-x.m.score),{b,m}=r[0],weak=m.score<55;
 return `<div class="pad"><p class="sub">${weak?"We are not sure about any of these":"Your best match nearby"}</p>
 <div class="box" style="margin-top:.5rem;border:0;background:${b.col}"><div class="match-num">${m.score}%</div><p style="font-size:.85rem">match with your Travel DNA</p>
 <h2 style="font-size:1.5rem;margin-top:.6rem">${b.e} ${esc(b.name)}</h2><p>${b.sector} · ${esc(b.place)}</p></div>
 <div class="box">${weak?`<p>Your swipes and these places overlap only a little. Have a look and decide for yourself.</p>`:`<b>Why it fits you</b>`}
 <ul class="why">${m.why.map(w=>`<li>${w}</li>`).join("")}<li>${cardsOf(b).length} travelers left a postcard here</li></ul></div>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="view" data-id="${b.id}">View experience</button><button class="btn alt" data-a="offline" data-id="${b.id}">${S.saved[b.id]?"Saved offline ✓":"Save offline"}</button></div>
 <label class="f">Also near you</label>${r.slice(1).map(({b,m})=>`<button class="bz" data-a="view" data-id="${b.id}"><span class="tile" style="background:${b.col}">${b.e}</span><span><b>${esc(b.name)}</b><span class="small">${b.sector}</span></span><span class="pct">${m.score}%</span></button>`).join("")}
 <p class="small" style="margin-top:.8rem">The score compares your six Travel DNA values with each place’s Experience DNA. It is a suggestion, not a promise.</p></div>`};

V.exp=()=>{const b=biz(S.biz),L=Lst(b);return `<div class="hero" style="background:${b.col}"><button class="pill back" data-a="go" data-s="explore">‹ All places</button>${b.e}</div>
 <div class="pad" style="padding-top:1rem"><h1 style="font-size:1.6rem">${esc(L.name||b.name)}</h1>
 <p class="sub">${b.sector} · ${esc(b.place)} ${kmTo(b)?"· "+kmTo(b)+" km from you ":""}${S.saved[b.id]?"· 📥 saved on this phone":""}</p>
 <div style="margin-top:.7rem">${b.chips.map(c=>`<span class="chip">${c}</span>`).join("")}</div>
 <p style="margin-top:.6rem">${esc(b.story||L.description||"This business has not told its story yet.")}</p>
 <div class="facts"><div><span>Duration</span><b>${esc(L.duration||"Ask the host")}</b></div><div><span>Price</span><b>${esc(L.price||"Ask the host")}</b></div>
 <div><span>Languages</span><b>Indonesian, with on-phone translation</b></div><div><span>Open</span><b>${esc(L.availability||"Ask the host")}</b></div></div>
 <div class="box"><b>What you will do</b><p class="sub">${esc(L.activities||"Not listed yet")}</p></div>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="bookopen">📅 Ask to book</button><button class="btn sun" data-a="go" data-s="chat">💬 Message ${esc(b.host)}</button></div>
 <div class="row" style="margin-top:.6rem"><button class="btn alt" data-a="offline" data-id="${b.id}">${S.saved[b.id]?"Saved offline ✓":"Save offline"}</button><button class="btn alt" data-a="go" data-s="card">✍️ Leave a postcard</button></div>
 <button class="btn warm wide" style="margin-top:.6rem" data-a="go" data-s="story">Visit The Story of This Place</button></div>`};

function chatHTML(b,tid,side){const en=side==="g"||S.blang==="en",ms=thread(b,tid),other=en?"en":"id",lang=side==="g"?"English":T("bahasa Indonesia","English"),bz=side==="b";
 return ms.map((m,i)=>{if(m.from==="sys")return `<div class="bub sys">${esc(m.t)}</div>`;
  const me=m.from===side,k=b.id+tid+i,tr=m[other];
  return `<div class="bub ${me?"me":""}">${esc(me||!tr||S.tr[k]?m.t:tr)}<small>${me?(m.sync==="pending"?(bz?T("📦 Tersimpan di ponsel. Dikirim saat ada sinyal.","📦 Saved on this phone. Will send when connection returns."):"📦 Saved on this phone. Will send when connection returns."):(tr?"":"")):tr?`${bz?T("Diterjemahkan ke "+lang+" di ponsel ini","Translated to English on this phone"):"Translated to "+lang+" on this phone"} · <button data-a="trm" data-k="${k}">${S.tr[k]?(bz?T("terjemahan","translation"):"translation"):(bz?T("teks asli","original"):"original")}</button>`:(bz?T("Kalimat ini belum bisa diterjemahkan. Kalau ragu, tanyakan langsung.","No translation for this sentence yet. If unsure, ask in person."):"No translation for this sentence yet. If unsure, ask in person.")}</small></div>`}).join("")||`<div class="bub sys">No messages yet. Say hello.</div>`}
V.chat=()=>{const b=biz(S.biz);return `<div class="chat"><div class="head"><button class="pill" data-a="go" data-s="inbox">‹ Chats</button><span style="font-size:1.5rem">${b.e}</span><b>${esc(b.host)}</b><span class="small">replies in Indonesian</span></div>
 <div class="msgs">${chatHTML(b,gt(),"g")}</div>
 <div class="foot"><div>${GQ.map((q,i)=>`<button class="chip pick" data-a="gq" data-i="${i}">${q.t}</button>`).join("")}</div>
 <div class="send"><input class="t" id="cin" placeholder="Write in your own language" maxlength="140"><button class="btn" data-a="gsend">Send</button></div></div></div>`};

V.inbox=()=>{const row=b=>{const ms=thread(b,gt()),last=ms[ms.length-1];return `<button class="bz" data-a="chatwith" data-id="${b.id}"><span class="tile" style="background:${b.col}">${b.e}</span><span style="min-width:0"><b>${esc(b.host)}</b><span class="small" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${last?esc(last.from==="b"?(last.en||last.t):last.t):esc(b.name)}</span></span>${last&&last.from==="b"?`<span class="tag strong" style="margin-left:auto">New reply</span>`:last&&last.sync==="pending"?`<span class="tag early" style="margin-left:auto">Waiting to send</span>`:""}</button>`};
 const on=all().filter(b=>S.msgs[b.id+":"+gt()]),off=all().filter(b=>!S.msgs[b.id+":"+gt()]);
 return `<div class="pad"><h1 style="font-size:1.7rem">Messages</h1><p class="sub">Talk to the people who run each place. Each of you writes in your own language.</p>
 ${on.length?`<label class="f">Your chats</label><div class="list2">${on.map(row).join("")}</div>`:`<div class="box"><b>No chats yet</b><p class="sub">Pick someone below and say hello.</p></div>`}
 ${off.length?`<label class="f">Start a new chat</label><div class="list2">${off.map(row).join("")}</div>`:""}</div>`};
V.trips=()=>{const ks=S.bookings.filter(k=>k.gid===S.gid);return `<div class="pad"><h1 style="font-size:1.7rem">Your visits</h1><p class="sub">You ask, the host decides. No one is charged here.</p>
 ${ks.length?ks.slice().reverse().map(k=>{const b=biz(k.biz);return `<div class="box"><div style="display:flex;gap:.7rem;align-items:center"><span style="font-size:1.8rem">${b.e}</span><div style="flex:1"><b>${esc(b.name)}</b><div class="small">${esc(k.date)} at ${k.time||"09:00"} · ${k.people} ${k.people>1?"people":"person"}</div></div>
 <span class="tag ${k.status==="confirmed"?"strong":k.status==="declined"?"warn":"early"}">${k.status==="confirmed"?"Confirmed":k.status==="declined"?"Declined":"Waiting"}</span></div>
 <p class="small" style="margin-top:.5rem">${k.sync==="pending"?"📦 Saved on this phone. Will send when connection returns.":k.status==="pending"?"Sent. Waiting for "+esc(b.host)+" to confirm.":k.status==="confirmed"?esc(b.host)+" is expecting you.":esc(b.host)+" cannot host you that day. Try another date."}</p></div>`}).join(""):`<div class="box"><b>No visits yet</b><p class="sub">Pick a place and ask to book. It takes two taps.</p></div>`}
 <button class="btn wide" style="margin-top:1rem" data-a="view" data-id="${S.biz}">Ask to book ${esc(biz(S.biz).name)}</button></div>`};

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
 ${c.status&&c.status!=="sent"?`<p class="meta">📦 Saved on this phone. Will send when connection returns.</p>`:""}</div>`};
const draftCard=()=>{const d=S.draft;return{n:S.guest.n,f:S.guest.f,t:d.t,bg:d.bg,s:d.s.join(""),prompt:PROMPTS[d.p],voice:d.voice,photo:d.photo}};
V.card=()=>{const d=S.draft,b=biz(S.biz);return `<div class="pad"><button class="pill" style="margin-bottom:.8rem" data-a="go" data-s="exp">‹ Back to ${esc(b.name)}</button><p class="hand">Not a review. A memory.</p><h1 style="font-size:1.6rem">Leave a little piece of your trip</h1><p class="sub">For ${esc(b.name)}</p>
 <div style="margin-top:.9rem" id="pv">${pcHTML(draftCard())}</div>
 <label class="f">Pick a prompt</label><div>${PROMPTS.map((p,i)=>`<button class="chip pick ${d.p===i?"on":""}" data-a="prompt" data-i="${i}">${p}</button>`).join("")}</div>
 <label class="f" for="msg">Your message, in any language</label><textarea class="t" id="msg" maxlength="160" placeholder="I’ll always remember…">${esc(d.t)}</textarea>
 <label class="f">Postcard</label><div class="bgs">${["sun","field","sky","coral"].map(x=>`<button class="pc ${x} ${d.bg===x?"on":""}" style="min-height:0;padding:0;box-shadow:none" data-a="bg" data-b="${x}" aria-label="${x} background"></button>`).join("")}</div>
 <label class="f">Stickers</label><div class="stks">${["☕","🌿","💛","⭐","☀️","🌧️","🔥","🪵"].map(s=>`<button class="${d.s.includes(s)?"on":""}" data-a="stk" data-s="${s}">${s}</button>`).join("")}</div>
 <div class="row" style="margin-top:.7rem"><button class="btn alt" data-a="voice">${d.voice?"🎙️ Voice note added":"🎙️ Add a voice note"}</button><label class="btn alt" tabindex="0">📷 ${d.photo?"Photo added":"Add a photo"}<input type="file" accept="image/*" id="ph" hidden></label></div>
 <button class="btn warm wide" style="margin-top:1rem" data-a="send">Leave your postcard</button>
 <p class="small" style="margin-top:.6rem">${S.online?"":"You are offline. Your postcard will be kept on this phone and sent later. "}Only your nickname, flag and message are shared with ${esc(b.host)}.</p></div>`};
V.thanks=()=>{const c=S.mine.filter(m=>m.gid===S.gid).pop();if(!c)return V.card();return `<div class="pad" style="text-align:center"><div style="text-align:left;transform:rotate(-2deg);margin:.6rem 0 1.2rem">${pcHTML(c)}</div>
 <h1 style="font-size:1.6rem">Thank you.</h1><p class="hand" style="margin:.4rem 0 1rem">Your postcard is now part of this place’s story.</p>
 <button class="btn warm wide" data-a="go" data-s="story">See it in The Story of This Place</button></div>`};

const SLOTS=[[12,17],[35,14],[60,18],[84,15],[22,31],[47,29],[72,32],[91,38],[8,46],[30,49],[63,47],[85,55],[14,63],[33,69],[72,68],[89,74],[10,83],[28,88],[74,88],[53,40],[20,75],[82,88]];
const ORBC=["#FFC928","#47C882","#FF7043","#7193D8","#FFFFFF","#FFE9A3"];
V.story=()=>{const b=biz(S.biz),c=cardsOf(b);
 return `<div class="scene">${farmSVG(true)}<div class="cap"><h1>The Story of This Place</h1><p class="hand">${c.length?"Moments that stayed here. Tap one.":"No memories yet. Be the first."}</p></div>
 ${c.map((c,i)=>{const [x,y]=SLOTS[i%SLOTS.length],sz=46+(i*7)%20,mine=!!c.biz;
  return `<button class="orb ${["","wink","","oh"][i%4]} ${mine?"new":""} ${c.status&&c.status!=="sent"?"pending":""}" data-a="open" data-id="${c.id}" aria-label="Postcard from ${esc(c.n||"a traveler")}" style="left:calc(${x}% - ${sz/2}px);top:calc(${y+9}% - ${sz/2}px);width:${sz}px;height:${sz}px;background:${ORBC[i%ORBC.length]};--d:${4+i%5}s;--dl:-${i*.7}s"><span class="face"><i></i></span><span class="ic">${first(c.s)}</span></button>`}).join("")}
 </div><div class="pad" style="padding-top:.9rem"><p class="sub">${c.length} memories left by travelers at ${esc(b.name)}${c.length?", in "+new Set(c.map(x=>x.l)).size+" languages":""}.</p>
 <div class="row" style="margin-top:.8rem"><button class="btn" data-a="go" data-s="card">Leave your postcard</button><button class="btn alt" data-a="go" data-s="exp">Back to ${esc(b.host)}</button></div></div>`};

/* ----- Local business side: Indonesian by default, English with the 🌐 switch ----- */
V["b-list"]=()=>{const b=B(),L=ui.transcript?extract(ui.transcript,b):null,cur=S.listings[b.id]||(b.custom?null:b.L);
 if(!ui.transcript)return `<div class="pad" style="text-align:center"><p class="hand">Halo, ${esc(b.host)}.</p><h1 style="font-size:1.6rem">${T("Ceritakan usaha Anda","Describe your business")}</h1><p class="sub">${T("Cukup bicara. Tidak perlu mengetik.","Just speak. No typing needed.")}</p>
 <button class="mic ${ui.rec?"rec":""}" data-a="rec" aria-label="${T("Rekam pesan suara","Record a voice note")}">${ui.rec?"■":"🎙️"}</button>
 <p style="font-weight:700">${ui.rec?T("Mendengarkan…","Listening…"):T("Tekan dan bicara","Tap and speak")}</p><p class="small">${ui.rec?"":T("Sebutkan nama Anda, kegiatan tamu, berapa lama, harganya, dan hari buka.","Say your name, what guests do, how long, how much, and which days.")}</p>
 ${cur?`<div class="box" style="text-align:left"><b>${b.e} ${esc(tv(cur.name||b.name))}</b><p class="sub">${esc(tv(cur.price||""))} · ${esc(tv(cur.duration||""))}</p><p class="small">${S.lsync[b.id]?T(S.lsync[b.id].startsWith("Saved")?"Tersimpan di ponsel. Dikirim saat ada sinyal.":"Terkirim. Tamu sudah bisa menemukannya.",S.lsync[b.id]):T("Aktif. Tamu bisa menemukannya.","Live. Guests can find it.")}</p></div>`:`<div class="box" style="text-align:left"><b>${T("Belum ada daftar","No listing yet")}</b><p class="sub">${T("Rekam satu pesan suara, dan tamu bisa menemukan Anda.","Record one voice note and guests can find you.")}</p></div>`}
 <p class="small" style="margin-top:1.2rem">${T("Catatan prototipe: mikrofon disimulasikan dengan contoh rekaman.","Prototype note: the microphone is simulated with a sample recording.")}</p></div>`;
 return `<div class="pad"><h1 style="font-size:1.4rem">${T("Apakah ini benar?","Is this right?")}</h1><p class="sub">${T("Belum ada yang diterbitkan sebelum Anda setuju.","Nothing is published until you confirm.")}</p>
 <label class="f" for="trn">${T("Yang kami dengar","What we heard")}</label><textarea class="t" id="trn" style="min-height:120px">${esc(ui.transcript)}</textarea>
 <p class="small">${T("Daftar di bawah dibuat hanya dari kata-kata di atas.","The listing below is built only from the words above.")}</p>
 <div class="box" id="flds">${fieldsHTML(L)}</div>
 <div class="row" style="margin-top:1rem"><button class="btn" data-a="confirm">${T("Benar","Confirm")}</button><button class="btn alt" data-a="edit">${ui.edit?T("Selesai","Done editing"):T("Ubah","Edit")}</button></div>
 <button class="btn alt wide" style="margin-top:.6rem" data-a="rerec">${T("Rekam lagi","Record again")}</button></div>`};
function fieldsHTML(L){return FIELDS.map(([k,id,en])=>{const v=(ui.over&&ui.over[k])??L[k];
 return `<div class="fld"><span>${T(id,en)}</span>${ui.edit?`<input class="t" data-k="${k}" value="${esc(v||"")}" placeholder="${T("Mohon diisi","Please fill this in")}">`:(v?`<b>${esc(tv(v))}</b>`:`<b><span class="unsure">${T("Tidak yakin.","Not sure.")}</span> ${T("Saya tidak mendengar ini. Mohon beri tahu.","I did not hear this. Please tell me.")}</b>`)}</div>`}).join("")}

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
 ${k.sync==="pending"?`<p class="small" style="margin-top:.5rem">📦 ${T("Permintaan ini belum terkirim dari ponsel tamu.","This request has not left the guest’s phone yet.")}</p>`:k.status==="pending"?`<div class="row" style="margin-top:.7rem"><button class="btn" data-a="bdec" data-id="${k.id}" data-v="confirmed">${T("Terima","Confirm")}</button><button class="btn alt" data-a="bdec" data-id="${k.id}" data-v="declined">${T("Tolak","Decline")}</button></div>`:""}</div>`).join(""):`<div class="box"><b>${T("Belum ada pesanan","No bookings yet")}</b><p class="sub">${T("Permintaan dari tamu akan muncul di sini.","Requests from guests will appear here.")}</p></div>`}
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
 <p class="small" style="margin-top:.8rem">${T("YoloWisata tidak pernah mengubah daftar atau harga Anda sendiri. Anda yang memilih.","YoloWisata never changes your listing or prices by itself. You choose.")}</p></div>`};

V["b-journey"]=()=>{const b=B(),A=insightsFor(b),has=!!(S.listings[b.id]||!b.custom),old=!b.custom&&b.id==="noor";
 const M=[[T("Daftar usaha dibuat","Listing created"),T("Tamu bisa menemukan Anda.","Guests can find you."),has],[T("10 tamu pertama","First 10 visitors"),old?T("Tamu mulai berdatangan.","People are coming."):T("Terus semangat.","Keep going."),old],[T("5 kartu pos pertama","First 5 postcards"),A.nCards+T(" kenangan sejauh ini."," memories left so far."),A.nCards>=5],[T("Rekomendasi pertama","First referral"),T("Seorang tamu mengajak temannya.","A visitor sent a friend."),old],[T("Ide baru pertama","First new idea discovered"),T("Dari apa yang sering dikatakan tamu.","From what visitors keep saying."),S.idea[b.id]==="saved"],[T("Perbaikan pertama","First experience improvement"),T("Coba satu ide, lalu lihat kata kartu pos.","Try an idea, then see what the postcards say."),0]];
 return `<div class="pad"><h1 style="font-size:1.6rem">${T("Usaha Anda tumbuh","Your business is growing")}</h1>
 <div class="plant">${M.slice().reverse().map(m=>`<div class="m ${m[2]?"":"todo"}"><b>${m[2]?"":T("Berikutnya: ","Next: ")}${m[0]}</b><span class="small">${m[1]}</span></div>`).join("")}</div>
 <p class="small" style="margin-top:.4rem">🌱 ${T("Tanaman tumbuh dari bawah. Tidak perlu belajar grafik.","The plant grows from the bottom. No charts to learn.")}</p></div>`};

V.ai=()=>`<div class="pad ai"><h1 style="font-size:1.5rem">How it works offline, and what the AI does</h1>
 <div class="box" style="background:var(--pale);border:0"><h3>A website that behaves like an app</h3><p>YoloWisata is a website, so there is nothing to download from a store. The first time it opens with any signal, the browser keeps a copy of the app and of the places you saved. After that it opens with no internet at all. Anything you do offline (a postcard, a message, a booking, a voice note) waits on the phone and is sent when a signal appears. Tap the Online pill at the top to try it.</p></div>
 <div class="box"><h3>1. Travel DNA matching</h3><p>Ten swipes become six numbers. The match score is the distance between those numbers and each business’s Experience DNA. A weak match says so.</p></div>
 <div class="box"><h3>2. Voice to listing</h3><p>The owner speaks in Bahasa Indonesia. Speech-to-text, then extraction into six fields. Anything not heard is marked “Not sure”, never guessed. Nothing is published until the owner confirms.</p></div>
 <div class="box"><h3>Owner’s language first</h3><p>The business side is in Bahasa Indonesia by default. The 🌐 button switches it to English. Online insight quotes keep the visitor’s original text, including English and Indonesian. When a local translation is available, it keeps the original underneath.</p></div>
 <div class="box"><h3>3. Translation in messages</h3><p>Guests write in their language, the owner reads Indonesian, and the other way round. The original is always one tap away. Reply suggestions come from a fixed list and are never sent automatically.</p></div>
 <div class="box"><h3>4. Experience DNA</h3><p>With the backend connected, visitor insights use its theme counts, evidence labels and original quotes. Offline or when that request fails, the on-device analyzer uses the feedback saved on this phone. Each finding carries its count and a label: Strong pattern (6 or more), Early signal (3 to 5), Not enough evidence yet. Suggested experiments use the existing idea templates only when the evidence supports them. Saving an idea never publishes or changes a listing.</p></div>
 <div class="box"><h3>Location</h3><p>Guests can choose to share their location to see what is near and how far. GPS needs no internet, the position stays on the phone, and everything works without it. In this demo the village is fictional, so the pin starts at the village gate.</p></div>
 <div class="box"><h3>Any sector</h3><p>A farm, a carpenter and a kitchen share the same screens. A new business picks a sector, records one voice note and is listed. New businesses start with “Not enough evidence yet” until real visitors write.</p></div>
 <div class="box"><h3>Data</h3><p>In this prototype: 20 postcards, 16 visitor questions and a handful of messages and bookings, all synthetic and written by the team. They do not cover real visitor wording, slang, sarcasm, voice recordings, or any language beyond the seven used here. Planned for the real build: NLLB-200 (translation), Mozilla Common Voice and MMS (Indonesian speech), MASSIVE (sorting guest messages by intent), OpenStreetMap (what is findable near the village today).</p></div>
 <div class="box"><h3>What is real in this prototype</h3><p>Matching and listing extraction run in your browser. Visitor theme counts and evidence labels come from the backend when available, with on-device analysis as fallback. With the backend connected, postcards, messages, bookings and listings are shared between phones; without it they stay on one device. Translations here come from a small prepared phrase list, standing in for an on-device translation model; sentences outside it are shown untranslated and say so. A keyword lexicon stands in for a small language model in the theme counts. The microphone is simulated, and “offline” is simulated with the pill. The bundled demo feedback is synthetic.</p></div></div>`;

/* ---------- Render ---------- */
const GNAV=[["explore","🧭","Explore"],["swipe","🧬","Travel DNA"],["inbox","💬","Messages"],["trips","📅","Visits"],["help","🗣️","Phrases"]];
const BNAV=()=>[["b-list","🎙️",T("Usaha","Listing")],["b-insights","💛",T("Tamu","Visitors")],["b-msgs","💬",T("Pesan","Messages")],["b-book","📅",T("Pesanan","Bookings")],["b-journey","🌱",T("Tumbuh","Growth")]];
const GROUP={chat:"inbox",dna:"swipe",match:"swipe",exp:"explore",card:"explore",thanks:"explore",story:"explore","b-thread":"b-msgs"};
function render(){refreshInsights();const s=S.screen;$("#view").innerHTML=(V[s]||V.land)();
 $("#net").className="pill net"+(S.online?"":" off");$("#net").textContent=S.online?"● Online":"○ Offline";
 $("#acct").textContent=S.role==="biz"?B().e+" "+B().host:"🧳 "+(S.guest.n||"Guest");
 const nav=s==="land"||s==="login"||s==="ai"?null:S.role==="biz"?BNAV():GNAV,g=GROUP[s]||s;const lg=$("#lang");lg.style.display=S.role==="biz"&&s!=="land"&&s!=="login"?"":"none";lg.textContent=S.blang==="en"?"🌐 ID":"🌐 EN";
 $("#nav").innerHTML=nav?`<nav class="nav">${nav.map((n,i)=>`<button class="${n[0]===g?"on":""}" data-a="go" data-s="${n[0]}"><span class="ni" style="--c:${["#FFE4D9","#FFF2C6","#D6E8FA","#DCF4E7","#FFE4D9"][i%5]}" aria-hidden="true">${n[1]}</span>${n[2]}</button>`).join("")}</nav>`:"";
 renderOver();if(s==="swipe")bindSwipe();
 if(s==="chat"||s==="b-thread")$("#view").scrollTop=1e6;save();flush()}
const stepsHTML=()=>STEPS.map(([k,t,w])=>`<li><button class="${S.screen===k||(k==="swipe"&&S.screen==="dna")||(k==="card"&&S.screen==="thanks")||(k==="b-msgs"&&S.screen==="b-thread")?"on":""}" data-a="go" data-s="${k}"><span>${t}<span class="who">${w}</span></span></button></li>`).join("");
function renderOver(){const m=ui.modal,o=$("#over"),t=ui.toast?`<div class="toast" role="status">${ui.toast}</div>`:"";if(!m){o.innerHTML=t;return}
 let h="";
 if(m.t==="pc"){const c=cardsOf(biz(S.biz)).find(c=>c.id===m.id);h=`<div class="modal" data-a="close"><div class="in">${pcHTML(c,true)}<button class="btn alt wide" style="margin-top:.8rem" data-a="close">Back to the field</button></div></div>`}
 if(m.t==="menu")h=`<div class="modal" data-a="close" style="place-items:end;padding:0"><div class="sheet"><h2 style="font-size:1.2rem;margin-bottom:.5rem">The story, step by step</h2><ol class="steps">${stepsHTML()}</ol>
 <div class="row" style="margin-top:.8rem"><button class="btn alt" data-a="go" data-s="ai">How it works</button><button class="btn alt" data-a="reset">Reset demo</button></div></div></div>`;
 if(m.t==="evid"){const b=B(),a=insightsFor(b),group=m.group||"asks",ev=(a.source==="backend"?a.evidence[group][m.k]:a.ev[m.k])||[],[c,tx]=insightLabel(a,group,m.k);
  h=`<div class="modal" data-a="close" style="place-items:end;padding:0"><div class="sheet"><span class="tag ${c}">${esc(tx||T("Bukti belum cukup","Not enough evidence yet"))}</span><h2 style="font-size:1.3rem;margin:.4rem 0">${esc(lab(m.k,b))}</h2><p class="sub">${T(`${ev.length} hal yang benar-benar ditulis tamu.`,`The ${ev.length} thing${ev.length===1?"":"s"} visitors actually wrote.`)} ${c==="thin"?T("Terlalu sedikit untuk bertindak. Tanyakan pada tamu berikutnya.","Too few to act on. Ask your next visitors."):""}</p>
  ${ev.map(e=>{const o=e.backend?null:ownerText(e);return `<div class="quote">“${esc(o||e.t)}”<small>${e.backend?T("Bukti tamu · teks asli","Visitor evidence · original text"):e.n?esc(e.n)+" "+e.f+" · "+T("kartu pos","postcard"):e.f+" · "+T("pertanyaan","question")}${o?" · "+T("diterjemahkan, aslinya: ","translated, original: ")+esc(e.t):""}</small></div>`}).join("")}
  <button class="btn wide" style="margin-top:1rem" data-a="close">${T("Tutup","Close")}</button></div></div>`}
 if(m.t==="book"){const b=biz(S.biz),d=new Date(Date.now()+6*864e5).toISOString().slice(0,10);
  h=`<div class="modal" data-a="close" style="place-items:end;padding:0"><div class="sheet"><h2 style="font-size:1.3rem">Ask ${esc(b.host)} for a visit</h2><p class="sub">${esc(Lst(b).availability?"Open: "+Lst(b).availability:"Ask about opening days")}. ${esc(b.host)} confirms each request personally.</p>
  <div class="row"><div style="flex:2"><label class="f" for="bd">Day</label><input class="t" type="date" id="bd" value="${d}"></div><div style="flex:1"><label class="f" for="bp">People</label><select class="t" id="bp">${[1,2,3,4,5,6,7,8].map(n=>`<option ${n===2?"selected":""}>${n}</option>`).join("")}</select></div></div>
  <label class="f">Time</label><div id="bt">${["08:00","09:00","10:00","13:00","15:00"].map(h=>`<button class="chip pick ${(ui.time||"09:00")===h?"on":""}" data-a="btime" data-h="${h}">${h}</button>`).join("")}</div>
  <button class="btn wide" style="margin-top:1rem" data-a="book">Send request</button><p class="small" style="margin-top:.5rem">${S.online?"No payment in this demo.":"You are offline. The request is kept on this phone and sent later."}</p></div></div>`}
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
function setOnline(on){if(S.online===on)return;S.online=on;insightCache.clear();if(on){let n=0;
  S.mine.forEach(m=>{if(m.status!=="sent"){m.status="sent";n++}});S.bookings.forEach(k=>{if(k.sync==="pending"){k.sync="sent";n++}});
  for(const k in S.msgs)S.msgs[k].forEach(m=>{if(m.sync==="pending"){m.sync="sent";n++}});
  for(const k in S.lsync)if(S.lsync[k].startsWith("Saved locally")){S.lsync[k]="Synced. Guests can find it now.";n++}
  render();toast(n?"Back online. Sent "+n+" saved item"+(n>1?"s":"")+".":"Back online. Nothing was waiting.")}
 else{render();toast("Offline. Everything you do is saved on this phone and sent later.")}}
function push(b,tid,m){const k=b.id+":"+tid;(S.msgs[k]=S.msgs[k]||[]).push(Object.assign({sync:st(),mid:newId(),ts:Date.now(),own:S.gid},m.from==="g"?{who:S.guest.n||"Guest",f:S.guest.f}:{},m))}

/* ---------- Sync with the backend. Only runs when config.js sets an API address; without it everything stays on this device. ---------- */
const hash=s=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h};
const api=(path,method,body)=>fetch(API+path,{method:method||"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined}).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json()});
const inflight={};
function outbox(){const o=[];
 S.mine.forEach(m=>{if(m.status==="sent"&&m.gid===S.gid)o.push(["postcards",m.id,m])});
 for(const k in S.msgs)S.msgs[k].forEach(m=>{if(m.mid&&m.from!=="sys"&&m.sync!=="pending"&&m.own===S.gid)o.push(["messages",m.mid,Object.assign({},m,{id:m.mid,thread:k})])});
 S.bookings.forEach(k=>{if(k.sync!=="pending")o.push(["bookings",k.id+":"+k.status,k])});
 for(const id in S.bstat)o.push(["bookingstatus",id+":"+S.bstat[id],{id,status:S.bstat[id],ts:S.bts[id]||0}]);
 for(const id in S.listings)if(!(S.lsync[id]||"").startsWith("Saved locally"))o.push(["listings",id+":"+hash(JSON.stringify(S.listings[id])),{id,L:S.listings[id],ts:S.lts[id]||0}]);
 S.custom.forEach(b=>o.push(["businesses",b.id+":"+hash(b.name+b.story),b]));
 return o}
function flush(){if(!API||!S.online)return;outbox().forEach(([kind,key,rec])=>{const k=kind+"/"+key;if(S.acked[k]||inflight[k])return;inflight[k]=1;
 api("/api/"+kind,"POST",rec).then(()=>{S.acked[k]=1;delete inflight[k];save()}).catch(()=>{delete inflight[k]})})}
function pull(){if(!API||!S.online)return;api("/api/sync").then(d=>{let ch=false;const vals=k=>Object.values(d[k]||{});
 vals("businesses").forEach(r=>{const c=S.custom.find(b=>b.id===r.id);if(BIZ0.some(b=>b.id===r.id))return;if(!c){S.custom.push(r);ch=true}else if(c.name!==r.name||c.story!==r.story){c.name=r.name;c.story=r.story;ch=true}});
 vals("postcards").forEach(r=>{if(!S.mine.some(m=>m.id===r.id)){S.mine.push(Object.assign({},r,{status:"sent"}));ch=true}});
 vals("messages").forEach(r=>{const a=S.msgs[r.thread]=S.msgs[r.thread]||[];if(!a.some(m=>m.mid===r.mid)){a.push(r);a.sort((x,y)=>(x.ts||0)-(y.ts||0));ch=true}});
 vals("bookings").forEach(r=>{const k=S.bookings.find(k=>k.id===r.id);if(!k){S.bookings.push(r);ch=true}else if((r.ts||0)>(k.ts||0)){Object.assign(k,r);ch=true}});
 vals("bookingstatus").forEach(r=>{if((r.ts||0)>(S.bts[r.id]||0)){S.bstat[r.id]=r.status;S.bts[r.id]=r.ts;ch=true}});
 vals("listings").forEach(r=>{if((r.ts||0)>(S.lts[r.id]||0)){S.listings[r.id]=r.L;S.lts[r.id]=r.ts;ch=true}});
 if(ch){save();const a=document.activeElement;if(!ui.modal&&!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName||"")))render()}}).catch(()=>{})}
const A={
 go:el=>go(el.dataset.s), swipe:el=>swipe(+el.dataset.v),
 redo:()=>{S.i=0;S.likes=[];S.dna=null;go("swipe")},
 net:()=>setOnline(!S.online),
 close:(el,e)=>{if(e.target===el||el.tagName==="BUTTON"){ui.modal=null;renderOver()}},
 reset:()=>{S=fresh();insightCache.clear();noorInsightId=null;ui={modal:null,rec:0,edit:false,transcript:"",tid:"",newSector:"Craft",ltab:"guest"};render();toast("Cleared. This device is back to a fresh start.")},
 asguest:()=>{S.guest={n:$("#gn").value.trim(),f:$("#gf").value};go(S.dna?"explore":"swipe");toast("Saved.")},
 ltab:el=>{ui.ltab=el.dataset.t;go("login")},
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
 hear:el=>{const t=PHR[+el.dataset.i];try{const vs=speechSynthesis.getVoices(),v=vs.find(v=>v.lang.toLowerCase().startsWith("id")),u=new SpeechSynthesisUtterance(t[0]);u.lang="id-ID";u.rate=+el.dataset.r;if(v)u.voice=v;speechSynthesis.cancel();speechSynthesis.speak(u);
   if(vs.length&&!v)toast("No Indonesian voice on this device, so it may sound off. Read it as: "+t[2])}catch(e){toast("This device cannot speak. Read it as: "+t[2])}},
 learn:el=>{const i=el.dataset.i;S.learned[i]=!S.learned[i];render();if(PHR.every((_,j)=>S.learned[j]))toast("⭐ All "+PHR.length+" phrases. Go and try them on someone!")},
 lang:()=>{S.blang=S.blang==="en"?"id":"en";render()},
 loc:()=>{const done=m=>{S.here=GATE;render();toast(m)};
  try{if(!navigator.geolocation)return done("This browser cannot share location. Starting from the village gate.");toast("Finding you…");
   navigator.geolocation.getCurrentPosition(p=>done("Found you, within about "+Math.round(p.coords.accuracy)+" m. Ondera is a demo village, so your pin starts at the village gate."),()=>done("Location is blocked here. Starting from the village gate instead."),{timeout:6000})}
  catch(e){done("Location is blocked here. Starting from the village gate instead.")}},
 sector:el=>{S.sector=el.dataset.s;render()},
 view:el=>{S.biz=el.dataset.id;go("exp")},
 offline:el=>{const b=biz(el.dataset.id);S.saved[b.id]=1;render();toast("Saved on this phone: "+b.name+", your Travel DNA and "+cardsOf(b).length+" postcards.")},
 chatwith:el=>{S.biz=el.dataset.id;go("chat")},
 gq:el=>{const q=GQ[+el.dataset.i],b=biz(S.biz);push(b,gt(),{from:"g",t:q.t,id:q.id});if(q.auto&&Lst(b).price)push(b,gt(),{from:"sys",t:"From the listing: "+Lst(b).price+". "+b.host+" can still answer herself or himself.",sync:"sent"});render()},
 gsend:()=>{const v=$("#cin").value.trim();if(!v)return;push(biz(S.biz),gt(),{from:"g",t:v});render()},
 thread:el=>{ui.tid=el.dataset.id;go("b-thread")},
 bq:el=>{push(B(),ui.tid,{from:"b",t:el.dataset.t,en:el.dataset.en});render()},
 bsend:()=>{const v=$("#cin").value.trim();if(!v)return;push(B(),ui.tid,{from:"b",t:v});render()},
 trm:el=>{S.tr[el.dataset.k]=!S.tr[el.dataset.k];render()},
 btime:el=>{ui.time=el.dataset.h;document.querySelectorAll("#bt .chip").forEach(c=>c.classList.toggle("on",c===el))},
 bookopen:()=>{ui.modal={t:"book"};renderOver()},
 book:()=>{const d=$("#bd").value,b=biz(S.biz);if(!d){toast("Pick a day first.");return}
  const nice=new Date(d+"T12:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
  S.bookings.push({id:"k"+newId(),gid:S.gid,ts:Date.now(),biz:b.id,who:(S.guest.n||"Guest")+" "+S.guest.f,date:nice,visit_date:d,time:ui.time||"09:00",people:+$("#bp").value,status:"pending",sync:st()});go("trips");toast(S.online?"Request sent to "+b.host+".":"Saved on this phone. Will send when connection returns.")},
 bdec:el=>{const id=el.dataset.id,k=S.bookings.find(k=>k.id===id);if(k){k.status=el.dataset.v;k.ts=Date.now()}else{S.bstat[id]=el.dataset.v;S.bts[id]=Date.now()}render();toast(T((el.dataset.v==="confirmed"?"Diterima.":"Ditolak.")+(S.online?" Tamu sudah bisa melihatnya.":" Tersimpan di ponsel. Dikirim saat ada sinyal."),(el.dataset.v==="confirmed"?"Confirmed.":"Declined.")+(S.online?" The guest can see it now.":" Saved locally. Will sync when connection returns.")))},
 prompt:el=>{S.draft.p=+el.dataset.i;keep();render()}, bg:el=>{S.draft.bg=el.dataset.b;keep();render()},
 stk:el=>{const s=el.dataset.s,a=S.draft.s;a.includes(s)?a.splice(a.indexOf(s),1):a.length<4&&a.push(s);keep();render()},
 voice:()=>{S.draft.voice=!S.draft.voice;keep();render();if(S.draft.voice)toast("Voice note attached (simulated in this prototype).")},
 send:()=>{keep();const d=S.draft;if(!d.t.trim()){toast("Write a few words first. One sentence is enough.");return}
  S.mine.push({id:"m"+newId(),gid:S.gid,ts:Date.now(),biz:S.biz,n:S.guest.n||"A traveler",f:S.guest.f,l:"Original language",t:d.t.trim(),bg:d.bg,s:d.s.join(""),prompt:PROMPTS[d.p],voice:d.voice,photo:d.photo,loc:S.guest.f==="🇮🇩"?1:0,status:st()});
  S.draft=fresh().draft;go("thanks")},
 open:el=>{ui.modal={t:"pc",id:el.dataset.id};renderOver()},
 tr:el=>{S.tr[el.dataset.k]=!S.tr[el.dataset.k];renderOver()},
 rec:()=>{const b=B(),done=t=>{ui.rec=0;ui.mr=null;ui.transcript=t||sampleFor(b);ui.over={};render()},fake=()=>{ui.rec=1;render();setTimeout(()=>done(),2400)};
  if(ui.rec){if(ui.mr)ui.mr.stop();return}
  if(!(API&&S.online&&window.MediaRecorder&&navigator.mediaDevices))return fake();   /* no backend: sample recording */
  navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{const chunks=[],mr=new MediaRecorder(stream);ui.mr=mr;ui.rec=1;render();
   mr.ondataavailable=e=>chunks.push(e.data);
   mr.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const fd=new FormData();fd.append("audio",new Blob(chunks,{type:mr.mimeType}),"note.webm");fd.append("sector",b.sector);
    fetch(API+"/api/voice",{method:"POST",body:fd}).then(r=>r.json()).then(d=>{done(d.transcript);if(d.demo)toast(T("Server belum punya model suara, jadi ini contoh rekaman.","The server has no speech model yet, so this is a sample transcript."))}).catch(()=>done())};
   mr.start();setTimeout(()=>{if(mr.state==="recording")mr.stop()},30000)}).catch(fake)},
 rerec:()=>{ui.transcript="";ui.edit=false;ui.over={};render()},
 edit:()=>{grab();ui.edit=!ui.edit;render()},
 confirm:()=>{grab();const b=B(),L=Object.assign(extract(ui.transcript,b),ui.over);const miss=FIELDS.filter(f=>!L[f[0]]);
  if(miss.length){ui.edit=true;render();toast(T("Masih kurang: "+miss.map(f=>f[1].toLowerCase()).join(", ")+". Isi atau rekam lagi.","Still missing: "+miss.map(f=>f[2].toLowerCase()).join(", ")+". Fill it in or record again."));return}
  S.listings[b.id]=L;S.lts[b.id]=Date.now();S.lsync[b.id]=S.online?"Synced. Guests can find it now.":"Saved locally. Will sync when connection returns.";const c=S.custom.find(x=>x.id===b.id);if(c){c.name=L.name;c.story=L.description}
  ui.transcript="";ui.edit=false;render();toast(T(S.online?"Terkirim. Tamu sudah bisa menemukannya.":"Tersimpan di ponsel. Dikirim saat ada sinyal.",S.lsync[b.id]))},
 idea:el=>{S.idea[B().id]=el.dataset.v;render()},
 evid:el=>{ui.modal={t:"evid",k:el.dataset.k,group:el.dataset.group||"asks"};renderOver()},
 say:el=>{const t=el.dataset.t;try{const u=new SpeechSynthesisUtterance(t);u.lang="id-ID";speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}toast("🔊 “"+t+"”")}
};
function keep(){const m=$("#msg");if(m)S.draft.t=m.value}
function grab(){const t=$("#trn");if(t)ui.transcript=t.value;ui.over=ui.over||{};document.querySelectorAll("#flds input").forEach(i=>{if(i.value.trim())ui.over[i.dataset.k]=i.value.trim();else delete ui.over[i.dataset.k]})}
document.addEventListener("click",e=>{const el=e.target.closest("[data-a]");if(el&&A[el.dataset.a])A[el.dataset.a](el,e)});
document.addEventListener("input",e=>{const id=e.target.id;
 if(id==="msg"){keep();$("#pv").innerHTML=pcHTML(draftCard());save()}
 if(id==="trn"&&!ui.edit){ui.transcript=e.target.value;ui.over={};$("#flds").innerHTML=fieldsHTML(extract(ui.transcript,B()))}});
document.addEventListener("change",e=>{if(e.target.id!=="ph"||!e.target.files[0])return;const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement("canvas"),k=Math.min(1,420/img.width);c.width=img.width*k;c.height=img.height*k;c.getContext("2d").drawImage(img,0,0,c.width,c.height);keep();S.draft.photo=c.toDataURL("image/jpeg",.7);render()};img.src=r.result};r.readAsDataURL(e.target.files[0])});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ui.modal){ui.modal=null;renderOver()}
 if(e.key==="Enter"&&e.target.id==="cin"){S.screen==="chat"?A.gsend():A.bsend()}
 if(S.screen==="swipe"&&!ui.modal){if(e.key==="ArrowRight")swipe(1);if(e.key==="ArrowLeft")swipe(0)}});
window.addEventListener("offline",()=>setOnline(false));window.addEventListener("online",()=>setOnline(true));
async function boot(){let c=window.YOLO_CONTENT;
 if(!c&&API){try{c=await api("/api/content")}catch(e){}}
 if(!c){try{c=await (await fetch("/data/content.json")).json()}catch(e){}}
 if(!c){$("#view").innerHTML='<div class="pad"><h1 style="font-size:1.5rem">YoloWisata could not load its content</h1><p class="sub">Open it once with a connection. After that it works offline.</p></div>';return}
 applyContent(c);
 if(navigator.onLine===false)S.online=false;
 render();
 if(API){
   pull();
   setInterval(()=>{pull();flush();refreshInsights()},8000)
 }}
boot();
