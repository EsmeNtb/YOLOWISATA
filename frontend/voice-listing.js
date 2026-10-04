/* Local-host voice processing; drafts stay separate from persistent listings. */
const VOICE_FIELDS=[['business_name','Nama usaha','Business name'],['experience_title','Judul pengalaman','Experience title'],['description','Deskripsi','Description'],['price','Harga','Price'],['currency','Mata uang','Currency'],['duration_minutes','Durasi','Duration'],['activities','Kegiatan','Activities'],['availability','Hari buka','Open days']];
const VOICE_CURRENCIES=['IDR','MXN','USD','EUR'];
const VOICE_DURATIONS=[[30,'30 menit','30 min'],[60,'60 menit','60 min'],[90,'90 menit','90 min'],[120,'2 jam','2 hours'],[180,'3 jam','3 hours']];
const VOICE_ACTIVITY_CHIPS=[['coffee_roasting','Kopi / sangrai','Coffee / roasting',['coffee_roasting','coffee','roasting','roast']],['tasting','Mencicipi','Tasting',['tasting']],['farm_walk','Jalan kebun','Farm walk',['farm_walk','farm walk']],['cooking','Memasak','Cooking',['cooking','market_shopping']],['wood_carving','Kerajinan','Craft',['wood_carving','craft','carving']],['guided_walk','Pemandu / tur','Guide / tour',['guided_walk','guide','tour']],['homestay','Homestay','Homestay',['homestay']]];
const VOICE_DAYS=[['monday','Sen','Mon'],['tuesday','Sel','Tue'],['wednesday','Rab','Wed'],['thursday','Kam','Thu'],['friday','Jum','Fri'],['saturday','Sab','Sat'],['sunday','Min','Sun'],['every_day','Setiap hari','Every day']];
const voiceDrafts={};
function voiceDraft(){const id=B().id;return voiceDrafts[id]||(voiceDrafts[id]={transcript:'',language:S.blang,fields:Object.fromEntries(VOICE_FIELDS.map(([k])=>[k,''])),uncertain:[],status:'',saveState:'',busy:false,recording:false,ready:false,stale:false,revision:0,durationCustom:false,activityOther:'',arrayEdits:[]})}
function voiceSyncText(status){const messages={
 'Listing saved on this device. Syncing…':'Daftar tersimpan di perangkat ini. Sedang menyinkronkan…',
 'Listing saved on this device. Waiting to sync.':'Daftar tersimpan di perangkat ini. Menunggu sinkronisasi.',
 'Synced. Guests can find it now.':'Tersinkron. Tamu sekarang dapat menemukannya.',
 'Saved on this device. Server sync will retry.':'Tersimpan di perangkat ini. Sinkronisasi server akan dicoba lagi.',
 'Saved on this device, but server sync needs attention.':'Tersimpan di perangkat ini, tetapi sinkronisasi server perlu diperiksa.'};return T(messages[status]||status,status)}
function voiceListingSync(id,status){if(S.role!=='biz'||S.screen!=='b-list'||S.myBiz!==id)return;
 const d=voiceDraft(),saved=document.querySelector('[data-voice-sync]');if(saved)saved.textContent=voiceSyncText(status);
 if(d.saveState==='saved'){d.status=voiceSyncText(status);const node=document.querySelector('#voice-status');if(node)node.textContent=d.status}}
function voiceList(value){return String(value||'').split(',').map(s=>s.trim()).filter(Boolean)}
function voiceNorm(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,'_')}
function voiceActivitySelection(d){const selected=new Set(),unknown=[];
 for(const item of voiceList(d.fields.activities)){const norm=voiceNorm(item);const hit=VOICE_ACTIVITY_CHIPS.find(([, , ,aliases])=>aliases.some(a=>voiceNorm(a)===norm));
  if(hit)selected.add(hit[0]);else unknown.push(item)}
 return{selected,other:d.activityOther||unknown.join(', ')}}
function voiceWriteActivities(d,selected,other){d.activityOther=other;const values=[...selected];if(other.trim())values.push(...voiceList(other));d.fields.activities=values.join(', ')}
function voiceHint(d,k){const missing=!String(d.fields[k]).trim(),uncertain=d.uncertain.includes(k);return [missing?T('Belum diisi','Missing'):'',uncertain?T('Perlu diperiksa','Review needed'):''].filter(Boolean).join(' · ')||T('Periksa sebelum menyimpan','Review before saving')}
function voiceSaveBanner(d){if(!d.ready)return '';
 if(d.saveState==='error')return `<div class="voice-save-state err" role="status"><b>${T('Gagal menyimpan','Save failed')}</b><p>${esc(d.status)}</p><p class="small">${T('Usulan belum tersimpan. Nilai yang Anda edit masih ada.','Proposal not saved. Your edited values are still here.')}</p></div>`;
 return `<div class="voice-save-state" role="status"><b>${T('Usulan siap diperiksa','Proposal ready for review')}</b><p><strong>${T('Belum disimpan.','Not saved yet.')}</strong> ${T('Tekan Konfirmasi & simpan setelah Anda memeriksa.','Press Confirm & save after you review.')}</p></div>`}
// Chip groups use the visible label via aria-labelledby; only labelable controls get for.
function voiceFieldBlock(k,id,en,d,control,target=`voice-${k}`){return `<div class="voice-field"><label id="voice-label-${k}"${target?` for="${target}"`:''}>${T(id,en)}</label><span id="voice-hint-${k}" class="voice-hint">${voiceHint(d,k)}</span>${control}</div>`}
function voiceFieldsHTML(d){const {selected,other}=voiceActivitySelection(d);const days=new Set(voiceList(d.fields.availability).map(voiceNorm));
 const durationValue=String(d.fields.duration_minutes||'').trim();const durationPreset=VOICE_DURATIONS.some(([mins])=>String(mins)===durationValue);const showCustom=d.durationCustom||(durationValue&&!durationPreset);
 return VOICE_FIELDS.map(([k,id,en])=>{
  if(k==='currency')return '';
  if(k==='business_name'||k==='experience_title')return voiceFieldBlock(k,id,en,d,`<input class="t" id="voice-${k}" data-voice-field="${k}" aria-describedby="voice-hint-${k}" value="${esc(d.fields[k])}" maxlength="4000">`);
  if(k==='description')return voiceFieldBlock(k,id,en,d,`<textarea class="t" id="voice-${k}" data-voice-field="${k}" aria-describedby="voice-hint-${k}" maxlength="4000">${esc(d.fields[k])}</textarea>`);
  if(k==='price')return voiceFieldBlock(k,id,en,d,`<div class="voice-price-row"><input class="t" id="voice-price" data-voice-field="price" inputmode="numeric" aria-describedby="voice-hint-price" value="${esc(d.fields.price)}" maxlength="4000" placeholder="${T('Jumlah','Amount')}">
   <label class="voice-sr" for="voice-currency">${T('Mata uang','Currency')}</label>
   <select class="t" id="voice-currency" data-voice-field="currency" aria-describedby="voice-hint-currency"><option value="">${T('Belum diisi','Not set')}</option>${VOICE_CURRENCIES.map(c=>`<option value="${c}" ${d.fields.currency===c?'selected':''}>${c}</option>`).join('')}</select></div>
   <span id="voice-hint-currency" class="voice-hint">${voiceHint(d,'currency')}</span>`);
  if(k==='duration_minutes')return voiceFieldBlock(k,id,en,d,`<div class="voice-chips" role="group" aria-labelledby="voice-label-${k}">${VOICE_DURATIONS.map(([mins,idLabel,enLabel])=>`<button type="button" class="${durationValue===String(mins)?'on':''}" data-a="voiceChip" data-chip="duration" data-v="${mins}" ${d.busy||d.recording?'disabled':''}>${T(idLabel,enLabel)}</button>`).join('')}
   <button type="button" class="${showCustom?'on':''}" data-a="voiceChip" data-chip="duration" data-v="custom" ${d.busy||d.recording?'disabled':''}>${T('Kustom','Custom')}</button></div>
   ${showCustom?`<input class="t" id="voice-duration_minutes" data-voice-field="duration_minutes" inputmode="numeric" aria-describedby="voice-hint-duration_minutes" value="${esc(d.fields.duration_minutes)}" maxlength="4000" placeholder="${T('Menit','Minutes')}">`: `<input type="hidden" id="voice-duration_minutes" data-voice-field="duration_minutes" value="${esc(d.fields.duration_minutes)}">`}`,showCustom?`voice-${k}`:null);
  if(k==='activities')return voiceFieldBlock(k,id,en,d,`<div class="voice-chips" role="group" aria-labelledby="voice-label-${k}">${VOICE_ACTIVITY_CHIPS.map(([key,idLabel,enLabel])=>`<button type="button" class="${selected.has(key)?'on':''}" data-a="voiceChip" data-chip="activity" data-v="${key}" aria-pressed="${selected.has(key)}" ${d.busy||d.recording?'disabled':''}>${T(idLabel,enLabel)}</button>`).join('')}
   <button type="button" class="${other?'on':''}" data-a="voiceChip" data-chip="activity" data-v="__other__" aria-pressed="${other?'true':'false'}" ${d.busy||d.recording?'disabled':''}>${T('Lainnya','Other')}</button></div>
   <input class="t" id="voice-activity-other" data-voice-other="1" aria-label="${T('Kegiatan lain','Other activities')}" value="${esc(other)}" maxlength="4000" placeholder="${T('Kegiatan lain (opsional)','Other activities (optional)')}" ${d.busy||d.recording?'disabled':''}>`,null);
  if(k==='availability')return voiceFieldBlock(k,id,en,d,`<div class="voice-chips" role="group" aria-labelledby="voice-label-${k}">${VOICE_DAYS.map(([key,idLabel,enLabel])=>`<button type="button" class="${days.has(key)?'on':''}" data-a="voiceChip" data-chip="day" data-v="${key}" aria-pressed="${days.has(key)}" ${d.busy||d.recording?'disabled':''}>${T(idLabel,enLabel)}</button>`).join('')}</div>`,null);
  return '';
 }).join('')}
function voiceView(){const d=voiceDraft(),current=S.listings[B().id]||B().L;return `<div class="pad voice-listing" aria-busy="${d.busy}">
 <h1>${T('Ceritakan usaha Anda','Describe your business')}</h1>
 <p>${T('AI memberi usulan. Anda memeriksa dan memutuskan sebelum menyimpan.','AI proposes. You review and decide before saving.')}</p>
 <p class="small">${T('Perekaman mungkin tersedia offline. Pemrosesan memerlukan server lokal dengan model. Anda selalu dapat mengetik.','Recording may work offline. Processing needs a reachable host with models installed. You can always type.')}</p>
 ${current&&current.name?`<div class="box voice-saved-listing"><b>${T('Daftar tersimpan','Saved listing')}: ${esc(tv(current.name))}</b><p>${esc(tv(current.price||''))} ${esc(tv(current.duration||''))}</p><p class="small" data-voice-sync role="status" aria-live="polite">${esc(S.lsync[B().id]?voiceSyncText(S.lsync[B().id]):T('Tersimpan di perangkat ini.','Saved on this device.'))}</p></div>`:''}
 <label for="voice-language">${T('Bahasa ucapan','Speech language')}</label><select class="t" id="voice-language" ${d.busy||d.recording?'disabled':''}>${[['en','English'],['es','Español'],['id','Bahasa Indonesia']].map(([k,v])=>`<option value="${k}" ${k===d.language?'selected':''}>${v}</option>`).join('')}</select>
 <div class="voice-mic"><button class="mic ${d.recording?'rec':''}" data-a="voiceRecord" aria-label="${d.recording?T('Berhenti merekam','Stop recording'):T('Rekam pesan suara','Record a voice note')}" ${d.busy?'disabled':''}>${d.recording?'■':'🎙️'}</button>
 <p style="font-weight:700">${d.recording?T('Mendengarkan…','Listening…'):T('Tekan dan bicara','Tap and speak')}</p></div>
 <p id="voice-status" role="status" aria-live="polite">${esc(d.status)}</p>
 <label for="voice-transcript">${T('Transkrip — periksa atau ketik di sini','Transcript — review or type here')}</label>
 <textarea class="t" id="voice-transcript" maxlength="4000" lang="${d.language}">${esc(d.transcript)}</textarea>
 <div class="row"><button class="btn" data-a="voiceExtract" ${d.busy||d.recording?'disabled':''}>${T('Buat / perbarui usulan','Extract / re-extract proposal')}</button>
 <button class="btn alt" data-a="voiceManual" ${d.busy||d.recording?'disabled':''}>${T('Isi manual','Enter fields manually')}</button></div>
 <p class="small">${d.extractor?esc(d.extractor):''}</p>
 ${d.ready?`<h2>${T('Periksa dan ubah usulan','Review and edit proposal')}</h2>
 ${voiceSaveBanner(d)}
 <p>${T('Kosong = belum disebutkan. Perlu diperiksa = informasi belum pasti.','Missing = not stated. Review needed = uncertain information.')}</p>
 <p role="status">${d.stale?T('Transkrip berubah. Perbarui usulan atau pilih isi manual.','Transcript changed. Re-extract or choose manual entry.'):''}</p>
 <div id="voice-fields">${voiceFieldsHTML(d)}</div>
 <p class="small">${T('Konfirmasi menyimpan di perangkat ini, lalu menyinkronkan pengalaman dengan YoloWisata saat terhubung. Informasi yang belum diisi tidak mengganti data yang ada. Menghapus semua pilihan kegiatan atau hari akan mengosongkan bagian tersebut setelah dikonfirmasi.','Confirmation saves on this device, then syncs the experience with YoloWisata when connected. Missing information keeps existing data. Clearing all activity or day selections clears that field after confirmation.')}</p>
 <button class="btn sun wide" data-a="voiceConfirm" ${d.busy||d.recording||d.stale?'disabled':''}>${T('Konfirmasi & simpan','Confirm & save')}</button>`:''}</div>`}
function voiceRefresh(){if(S.screen==='b-list')render(false)}
function voiceMarkEdited(d,field){d.revision++;d.saveState=d.saveState==='saved'?'unsaved':(d.saveState||'unsaved');if(['activities','availability'].includes(field)&&!d.arrayEdits.includes(field))d.arrayEdits.push(field)}
function voiceInput(target){const d=voiceDraft();if(target.id==='voice-transcript'){d.transcript=target.value;d.revision++;d.stale=d.ready;const confirm=document.querySelector('[data-a="voiceConfirm"]');if(confirm)confirm.disabled=d.stale}
 if(target.id==='voice-language'){d.language=target.value;d.revision++;d.stale=d.ready;voiceRefresh()}
 if(target.dataset&&target.dataset.voiceOther){const {selected}=voiceActivitySelection(d);voiceWriteActivities(d,selected,target.value);voiceMarkEdited(d,'activities');const hint=document.querySelector('#voice-hint-activities');if(hint)hint.textContent=voiceHint(d,'activities');return}
 const k=target.dataset&&target.dataset.voiceField;if(k){d.fields[k]=target.value;if(k==='currency')d.fields.currency=(target.value||'').toUpperCase();voiceMarkEdited(d,k);const hint=document.querySelector('#voice-hint-'+k);if(hint)hint.textContent=voiceHint(d,k);if(k==='currency'){const ch=document.querySelector('#voice-hint-currency');if(ch)ch.textContent=voiceHint(d,'currency')}}}
function voiceChip(el){const d=voiceDraft();if(d.busy||d.recording||!d.ready)return;const kind=el.dataset.chip,value=el.dataset.v;
 if(kind==='duration'){if(value==='custom'){d.durationCustom=true}else{d.durationCustom=false;d.fields.duration_minutes=String(value)}voiceMarkEdited(d);voiceRefresh();return}
 if(kind==='activity'){const {selected,other}=voiceActivitySelection(d);if(value==='__other__'){if(!other)d.activityOther=' ';voiceMarkEdited(d);voiceRefresh();return}
  if(selected.has(value))selected.delete(value);else selected.add(value);voiceWriteActivities(d,selected,other===' '? '':other);voiceMarkEdited(d,'activities');voiceRefresh();return}
 if(kind==='day'){let days=new Set(voiceList(d.fields.availability).map(voiceNorm));
  if(value==='every_day'){days=days.has('every_day')?new Set():new Set(['every_day'])}
  else{days.delete('every_day');if(days.has(value))days.delete(value);else days.add(value)}
  d.fields.availability=[...days].join(', ');voiceMarkEdited(d,'availability');voiceRefresh()}}
async function voiceRequest(path,options){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);try{const response=await fetch(API+path,{...options,signal:controller.signal});
 if(!response.ok){let message=`Processing unavailable (HTTP ${response.status})`;try{const {detail}=await response.json();const text=typeof detail==='string'?detail:Array.isArray(detail)?detail.map(item=>typeof item?.msg==='string'?item.msg:'').filter(Boolean).join('; '):'';if(text.trim())message=text.trim()}catch(e){}throw new Error(message)}
 return await response.json()}finally{clearTimeout(timer)}}
async function voiceExtract(){const d=voiceDraft();if(d.busy||d.recording)return;if(!d.transcript.trim()){d.status=T('Ketik atau rekam terlebih dahulu.','Type or record first.');voiceRefresh();return}
 const revision=d.revision;d.busy=true;d.status=T('Memproses…','Processing…');voiceRefresh();
 try{const result=await voiceRequest('/api/voice/proposal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:d.transcript,language:d.language})});
  if(d.revision!==revision){d.status=T('Transkrip berubah; perbarui usulan.','Transcript changed; extract again.');return}
  if(!result?.listing||typeof result.listing!=='object'||Array.isArray(result.listing))throw new Error('Invalid proposal');
  const invalidOutput=result.error==='invalid_model_output';
  for(const [k] of VOICE_FIELDS){const value=result.listing[k];d.fields[k]=Array.isArray(value)?value.join(', '):value==null?'':String(value)}
  d.uncertain=invalidOutput?VOICE_FIELDS.map(([k])=>k):(result.uncertain_fields||[]);d.extractor=[result.extractor?.type,result.extractor?.model].filter(Boolean).join(' · ');d.ready=true;d.stale=false;d.saveState='unsaved';d.durationCustom=false;
  if(invalidOutput)d.activityOther='';
  d.arrayEdits=[];
  const parsed=voiceActivitySelection(d);d.activityOther=parsed.other;voiceWriteActivities(d,parsed.selected,parsed.other);
  d.status=invalidOutput?T('AI tidak dapat mengekstrak semua informasi dengan aman. Periksa transkrip dan isi bagian yang masih kosong.','The AI could not safely extract all fields. Review the transcript and fill in anything missing.'):result.extractor?.type==='deterministic_fallback'?T('Model tidak tersedia. Usulan memakai aturan dasar; periksa semuanya.','Small AI unavailable. Basic deterministic fallback; review every field.'):T('Usulan siap diperiksa.','Proposal ready for review.');
 }catch(e){d.status=T('Pemrosesan tidak tersedia. Transkrip tetap ada. Isi manual atau coba lagi.','Processing unavailable. Your transcript is preserved. Enter fields manually or retry.')}
 finally{d.busy=false;voiceRefresh()}}
function voiceManual(){const d=voiceDraft();if(d.busy||d.recording)return;d.ready=true;d.stale=false;d.saveState='unsaved';d.extractor=T('Entri manual','Manual entry');d.status=T('Usulan siap diperiksa.','Proposal ready for review.');voiceRefresh()}
async function voiceRecord(){const d=voiceDraft();if(d.busy)return;if(d.recording){if(d.recorder&&d.recorder.state==='recording')d.recorder.stop();return}
 if(!navigator.mediaDevices||!window.MediaRecorder){d.status=T('Mikrofon tidak tersedia. Ketik transkrip.','Microphone unavailable. Type your transcript.');voiceRefresh();return}
 d.busy=true;let stream;const revision=d.revision;
 try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const recorder=new window.MediaRecorder(stream),chunks=[];d.recorder=recorder;d.recording=true;d.busy=false;d.status=T('Merekam. Tekan Berhenti (maks. 60 detik).','Recording. Press Stop (60 second limit).');voiceRefresh();
  const release=()=>{clearTimeout(d.timer);stream.getTracks().forEach(t=>t.stop());d.recorder=null;d.recording=false};
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onerror=()=>{release();d.busy=false;d.status=T('Perekaman gagal. Ketik transkrip.','Recording failed. Type your transcript.');voiceRefresh()};
  recorder.onstop=async()=>{release();d.busy=true;d.status=T('Mentranskripsikan…','Transcribing…');voiceRefresh();
   try{const audio=new Blob(chunks,{type:recorder.mimeType});if(audio.size>8000000)throw new Error('Audio too large');const body=new FormData();body.append('audio',audio,'recording');body.append('language',d.language);
    const result=await voiceRequest('/api/voice/transcribe',{method:'POST',body});if(typeof result.transcript!=='string'||!['en','es','id'].includes(result.language))throw new Error('Invalid transcript');
    if(d.revision!==revision){d.status=T('Teks berubah saat merekam; teks Anda dipertahankan.','Text changed during recording; your edits were preserved.');return}
    d.transcript=result.transcript;d.language=result.language;d.revision++;d.stale=d.ready;d.status=T('Periksa transkrip lalu buat usulan. Bahasa: ','Review the transcript, then extract. Language: ')+result.language;
   }catch(e){d.status=T('Transkripsi tidak tersedia. Ketik atau ubah teks secara manual.','Transcription unavailable. Type or edit manually.')}finally{d.busy=false;voiceRefresh()}};
  recorder.start();d.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},60000);
 }catch(e){if(stream)stream.getTracks().forEach(t=>t.stop());d.busy=false;d.recording=false;d.status=T('Akses mikrofon ditolak atau tidak tersedia. Ketik transkrip.','Microphone access denied or unavailable. Type your transcript.');voiceRefresh()}}
function voiceConfirm(){const d=voiceDraft();if(!d.ready||d.busy||d.recording||d.stale)return;
 try{const listing={};for(const [k] of VOICE_FIELDS){const v=String(d.fields[k]||'').trim();listing[k]=['activities','availability'].includes(k)?voiceList(v).map(s=>k==='availability'?s.toLowerCase():s):v||null}
  for(const k of ['price','duration_minutes']){if(listing[k]!==null){if(!/^\d+$/.test(listing[k]))throw new Error(T('Gunakan bilangan bulat: ','Use whole numbers: ')+k);listing[k]=Number(listing[k]);if(!Number.isSafeInteger(listing[k])||listing[k]>(k==='price'?1000000000:10080)||(k==='duration_minutes'&&listing[k]===0))throw new Error(T('Nilai tidak valid: ','Invalid value: ')+k)}}
  if(listing.currency){listing.currency=listing.currency.toUpperCase();if(!/^[A-Z]{3}$/.test(listing.currency))throw new Error(T('Gunakan kode mata uang 3 huruf.','Use a three-letter currency code.'))}
  if(listing.availability.some(s=>!['monday','tuesday','wednesday','thursday','friday','saturday','sunday','every_day'].includes(s)))throw new Error(T('Periksa kode hari buka.','Check the opening day codes.'));
  if(!listing.experience_title)throw new Error(T('Isi judul pengalaman untuk menyimpan.','Enter an experience title to save.'));
  const b=B(),L={name:listing.experience_title,description:listing.description||'',price:listing.price===null?'':`${listing.currency||''} ${listing.price}`.trim(),duration:listing.duration_minutes===null?'':`${listing.duration_minutes} minutes`,activities:listing.activities.map(s=>s.replace(/_/g,' ')).join(', '),availability:listing.availability.map(s=>s==='every_day'?'Every day':s[0].toUpperCase()+s.slice(1)).join(' and '),structured:listing,confirmed_empty_fields:d.arrayEdits.filter(k=>listing[k].length===0),transcript:d.transcript,language:d.language,confirmed_at:new Date().toISOString()};
  // This is the only voice-flow mutation of the existing persistence/outbox state.
  const previous={listing:S.listings[b.id],ts:S.lts[b.id],sync:S.lsync[b.id]};S.listings[b.id]=L;S.lts[b.id]=Math.max(Date.now(),(previous.ts||0)+1);S.lsync[b.id]=API&&S.online&&navigator.onLine!==false?'Listing saved on this device. Syncing…':'Listing saved on this device. Waiting to sync.';
  try{localStorage.setItem('yolowisata-v3',JSON.stringify(S))}catch(e){if(previous.listing===undefined)delete S.listings[b.id];else S.listings[b.id]=previous.listing;S.lts[b.id]=previous.ts;S.lsync[b.id]=previous.sync;throw new Error(T('Penyimpanan gagal. Usulan tetap tersedia.','Storage failed. Your proposal is preserved.'))}
  d.saveState='saved';d.status=voiceSyncText(S.lsync[b.id]);d.ready=false;render();toast(d.status);
 }catch(e){d.saveState='error';d.status=e.message;voiceRefresh()}}
