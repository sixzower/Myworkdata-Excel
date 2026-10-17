const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function parser() {
  const fields = new Map();
  const radios = ['plateSize','layout','pageOrder'].flatMap(name => ({plateSize:['745×605','925×740','1030×790'],layout:['กลับในตัว','กลับนอก'],pageOrder:['เปิดซ้าย–ขวาแบบไทย','ขวา–ซ้ายแบบญี่ปุ่น']}[name]).map(value=>({name,value,checked:false})));
  const document = {
    getElementById(id) { if(!fields.has(id)) fields.set(id,{value:'',style:{}}); return fields.get(id); },
    querySelectorAll(selector) { const name=/name="([^"]+)"/.exec(selector)?.[1]; return radios.filter(r=>r.name===name); },
    querySelector(selector) { const name=/name="([^"]+)"/.exec(selector)?.[1]; const value=/value="([^"]+)"/.exec(selector)?.[1]; return radios.find(r=>r.name===name && r.value===value); }
  };
  const ctx = vm.createContext({document,render(){}});
  vm.runInContext(html.slice(html.indexOf('function buildLines('),html.indexOf('function checkbox(')),ctx);
  return {ctx,fields,radios,extract(lines) {ctx.extractFields(lines,[],null,null);}};
}
test('keeps English title before punctuation and embedded Thai annotations',()=>{
  for (const title of ['HERO: THE RETURN! 12','MY SKILL (นิยาย) RETURNS 4','CHEAT SKILL "SHISHA SOSEI" 5']) {
    const p=parser(); p.extract(['ชื่องาน: ทดสอบ','จำนวนหน้า: 192 หน้า '+title]);
    assert.equal(p.fields.get('f_jobname2').value,p.ctx.insertVolumeWord(title));
    assert.equal(p.fields.get('f_pages').value,'192 หน้า');
  }
});
test('preserves source plate and half-signature quantities without adjacent fields',()=>{
  const p=parser();p.extract(['จำนวนหน้า: 40 หน้า','จำนวนเพลท: 3เพลท /2ยกครึ่ง ขนาดงาน: 12.5x18 cm.']);
  assert.equal(p.fields.get('f_plates').value,'3 เพลท / 2 ยกครึ่ง');
  assert.equal(p.fields.get('f_size').value,'12.5x18 cm.');
});
test('reads Thai page order and clears stale or unreadable selections',()=>{
  const p=parser();p.extract(['☑ เปิดซ้าย–ขวาแบบไทย ☐ ขวา–ซ้ายแบบญี่ปุ่น','☑ กลับในตัว ☐ กลับนอก']);
  assert.equal(p.radios.find(r=>r.name==='pageOrder'&&r.checked)?.value,'เปิดซ้าย–ขวาแบบไทย');
  assert.equal(p.radios.find(r=>r.name==='layout'&&r.checked)?.value,'กลับในตัว');
  p.extract(['☐ เปิดซ้าย–ขวาแบบไทย ☐ ขวา–ซ้ายแบบญี่ปุ่น']);
  assert.equal(p.radios.filter(r=>r.checked).length,0);
});
test('does not silently choose when both options are explicitly checked',()=>{
  const p=parser();assert.equal(p.ctx.markedOptionInText('☑ กลับในตัว ☑ กลับนอก',['กลับในตัว','กลับนอก']),'');
});
test('reads split PDF option labels and font-specific Japanese glyphs from checkbox pixels',()=>{
  for (const selected of ['เปิดซ้าย–ขวาแบบไทย','ขวา–ซ้ายแบบญี่ปุ่น']) {
    const p=parser();
    const items=[];
    function item(str,x,width){items.push({str,width,transform:[7,0,0,7,x,100]});}
    item('☐',20,10);item('เป\uF701ดซ\uF70Bาย',32,22);item('–',54,3);item('ขวาแบบไทย',57,35);
    item('☐',100,10);item('ขวา',112,11);item('–',123,3);item('ซ\uF70Bายแบบญี่ปุ\uF705น',126,38);
    const width=260,height=200,data=new Uint8ClampedArray(width*height*4).fill(255);
    function dark(x,y){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}
    for(const [index,left] of [20,100].entries()){
      const cx=Math.round((left+5)*1.4),cy=135;
      for(let x=cx-5;x<=cx+5;x++) {dark(x,cy-5);dark(x,cy+5);}
      for(let y=cy-5;y<=cy+5;y++) {dark(cx-5,y);dark(cx+5,y);}
      if(index===(selected==='เปิดซ้าย–ขวาแบบไทย'?0:1))
        for(let x=cx-5;x<=cx+5;x++)for(let y=cy-1;y<=cy+1;y++)dark(x,y);
    }
    const canvas={width,height,getContext(){return {getImageData(){return {data};}};}};
    const viewport={transform:[1.4,0,0,-1.4,0,280],convertToViewportPoint(x,y){return [x*1.4,280-y*1.4];}};
    const result=p.ctx.detectVisualMarkedOption(items,viewport,canvas,['เปิดซ้าย–ขวาแบบไทย','ขวา–ซ้ายแบบญี่ปุ่น']);
    assert.equal(result.value,selected);
  }
});
test('sample PDF title retains SAINT SEIYA prefix before colon',()=>{
  const p=parser();p.extract(['ชื่องาน: เซนต์เซย์ย่า จ้าวสมุทรคืนบัลลังก์ RERISE OF POSEIDON 03','จำนวนหน้า : 192หน้า SAINT SEIYA : RERISE OF POSEIDON 03']);
  assert.equal(p.fields.get('f_jobname2').value,'SAINT SEIYA : RERISE OF POSEIDON เล่ม 03');
});
