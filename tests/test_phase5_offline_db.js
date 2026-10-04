// Exercises the real helper's commit boundary using controlled transaction events.
// This is intentionally not a browser IndexedDB implementation/polyfill.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function helper(){
 const transactions=[];let closed=0;
 const db={close:()=>closed++,transaction:(names,mode)=>{
  const events={},writes=[];
  const tx={names,mode,writes,error:null,
   addEventListener:(name,fn)=>(events[name]??=[]).push(fn),
   emit:name=>(events[name]||[]).forEach(fn=>fn()),
   objectStore:name=>({transaction:tx,
    put:value=>{writes.push({name,value});return {}},
    clear:()=>{writes.push({name,clear:true});return {}},
    delete:key=>{writes.push({name,key});return {}}
   })
  };transactions.push(tx);return tx;
 }};
 const context=vm.createContext({window:{indexedDB:{open:()=>{
  const req={result:db};queueMicrotask(()=>req.onsuccess());return req;
 }}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/offline-db.js'),'utf8'),context);
 return {api:context.window.YOLO_OFFLINE_DB,transactions,closed:()=>closed};
}

test('real helper commits postcard and operation together and resolves only after completion',async()=>{
 const h=helper(),c={id:'uuid',t:'offline content'},op={id:'op',type:'postcard.create',entity_id:c.id,payload:c};
 let resolved=false;const saved=h.api.saveLocalPostcard(c,op).then(v=>{resolved=true;return v});await settle();
 assert.equal(resolved,false);assert.equal(h.transactions.length,1);
 const tx=h.transactions[0];assert.deepEqual([...tx.names],['postcards','outbox']);assert.equal(tx.mode,'readwrite');
 assert.deepEqual(tx.writes.map(w=>w.name),['postcards','outbox']);
 assert.equal(tx.writes[1].value.status,'pending');assert.equal(tx.writes[1].value.attempts,0);
 tx.emit('complete');assert.equal((await saved).sync_status,'pending');assert.equal(h.closed(),1);
});

test('real helper rejects an aborted write instead of reporting a saved postcard',async()=>{
 const h=helper(),saved=h.api.saveLocalPostcard({id:'uuid'});const rejected=assert.rejects(saved,/quota/);
 await settle();const tx=h.transactions[0];tx.error=new Error('quota');tx.emit('abort');await rejected;assert.equal(h.closed(),1);
});

test('real helper validates matching identities before starting a transaction',async()=>{
 const h=helper();await assert.rejects(h.api.saveLocalPostcard({id:'one'},{id:'op',type:'postcard.create',entity_id:'two',payload:{id:'two'}}),/same postcard id/);
 assert.equal(h.transactions.length,0);
});

test('real helper reset clears both stores in one committed transaction',async()=>{
 const h=helper();let resolved=false;const clear=h.api.clearOfflineData().then(v=>{resolved=true;return v});await settle();
 const tx=h.transactions[0];assert.equal(resolved,false);
 assert.deepEqual(tx.writes,[{name:'postcards',clear:true},{name:'outbox',clear:true}]);
 tx.emit('complete');assert.equal(await clear,true);assert.equal(h.closed(),1);
});

test('real helper outbox removal also waits for transaction commit',async()=>{
 const h=helper();let resolved=false;const remove=h.api.removeOperation('op').then(()=>resolved=true);await settle();
 const tx=h.transactions[0];assert.equal(resolved,false);assert.deepEqual(tx.writes,[{name:'outbox',key:'op'}]);
 tx.emit('complete');await remove;assert.equal(resolved,true);
});
