// Run with node tests/test_phase4_frontend.js. Uses the actual UI actions/outbox.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function app(){
 const nodes=new Map();
 const node=k=>{if(!nodes.has(k))nodes.set(k,{style:{},innerHTML:'',value:'',textContent:''});return nodes.get(k)};
 const context=vm.createContext({
  window:{YOLO_CONFIG:{api:''},YOLO_CONTENT:JSON.parse(fs.readFileSync(path.join(root,'data/content.json'),'utf8')),addEventListener:()=>{}},
  navigator:{onLine:true},document:{querySelector:node,querySelectorAll:()=>[],addEventListener:()=>{}},
  localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,
  fetch:()=>{throw new Error('Unexpected network call')},console
 });
 vm.runInContext(fs.readFileSync(path.join(root,'frontend/app.js'),'utf8'),context);
 return {node,run:code=>vm.runInContext(code,context),outbox:()=>JSON.parse(vm.runInContext('JSON.stringify(outbox())',context))};
}

test('actual booking action preserves its display date and sends the chosen ISO year/date',()=>{
 const a=app();a.node('#bd').value='2027-01-02';a.node('#bp').value='3';
 a.run('S.guest.n="Guest";S.guest.f="🇮🇩";ui.time="13:00";A.book()');
 const [kind,key,booking]=a.outbox()[0];
 assert.equal(kind,'bookings');assert.equal(key,booking.id+':pending');
 assert.equal(booking.visit_date,'2027-01-02');assert.match(booking.date,/Jan/);
 assert.equal(booking.time,'13:00');assert.equal(booking.people,3);
 assert.equal(booking.gid,a.run('S.gid'));assert.equal(booking.biz,'noor');
 a.run('S.role="biz";A.bdec({dataset:{id:S.bookings[0].id,v:"declined"}})');
 const changed=a.outbox()[0][2];
 assert.equal(changed.status,'declined');assert.equal(changed.visit_date,booking.visit_date);
 assert.equal(changed.id,booking.id);
});

test('actual guest and owner actions keep the same thread and original/translated text',()=>{
 const a=app();a.node('#cin').value='Boleh cicip kopi lagi?';
 a.run('S.guest.n="Visitor";S.guest.f="🇮🇩";A.gsend()');
 const guest=a.outbox()[0][2];
 assert.equal(guest.thread,'noor:g'+a.run('S.gid'));
 assert.equal(guest.t,'Boleh cicip kopi lagi?');assert.equal(guest.from,'g');
 assert.equal(guest.id,guest.mid);assert.equal(guest.f,'🇮🇩');
 a.run('S.role="biz";ui.tid=gt();S.gid="owner-device";A.bq({dataset:{t:"Bisa",en:"Yes"}})');
 const owner=a.outbox()[0][2];
 assert.equal(owner.thread,guest.thread);assert.equal(owner.from,'b');
 assert.equal(owner.t,'Bisa');assert.equal(owner.en,'Yes');
});

test('static demo booking decisions stay local instead of posting an invalid backend id',()=>{
 const a=app();a.run('S.role="biz";A.bdec({dataset:{id:"noor-b1",v:"confirmed"}})');
 assert.equal(a.run('S.bstat["noor-b1"]'),'confirmed');
 assert.equal(a.outbox().some(([kind])=>kind==='bookingstatus'||kind==='bookings'),false);
});
