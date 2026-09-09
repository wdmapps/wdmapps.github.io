(()=>{
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const LIB='wdm-sheets-library-v3';
let workbook=null,currentId=null,activeSheet=0,selectedStart='A1',selectedEnd='A1',dirty=false;
let dragSelecting=false,formulaRefDrag=false,formulaRefStart='A1',formulaRefPrefix='',formulaRefSuffix='',formulaRefEditor=null;
let editStart='',undoStack=[],redoStack=[],contextAddr='A1';

const uid=()=>globalThis.crypto?.randomUUID?.()||('id-'+Date.now()+'-'+Math.random().toString(36).slice(2));
function colName(n){let s='';while(n>=0){s=String.fromCharCode(n%26+65)+s;n=Math.floor(n/26)-1}return s}
function parts(a){const m=/^([A-Z]+)(\d+)$/.exec(String(a).toUpperCase());if(!m)return null;let c=0;for(const ch of m[1])c=c*26+ch.charCodeAt(0)-64;return{c:c-1,r:+m[2]}}
function addr(c,r){return colName(c)+r}
function defFmt(){return{font:'Calibri',size:11,bold:false,italic:false,underline:false,color:'#202622',fill:'#ffffff',align:'left',num:'general',dec:2,borders:{top:false,right:false,bottom:false,left:false}}}
function normalizeFmt(f){return{...defFmt(),...(f||{}),borders:{...defFmt().borders,...((f||{}).borders||{})}}}
function newSheet(name){return{id:uid(),name:name||'Planilha1',rows:40,cols:16,cells:{},colWidths:{},rowHeights:{},frozen:true,merges:[]}}
function blankBook(){return{id:uid(),name:'Pasta de trabalho sem título',sheets:[newSheet('Planilha1')],updated:null}}
const sh=()=>workbook.sheets[activeSheet];

function cell(a,create=false){
  a=mergeAnchor(a);
  if(!sh().cells[a]&&create)sh().cells[a]={v:'',fmt:defFmt()};
  if(sh().cells[a]&&create)sh().cells[a].fmt=normalizeFmt(sh().cells[a].fmt);
  return sh().cells[a]||null
}
const raw=a=>String(cell(a)?.v??'');
const fmt=a=>normalizeFmt(cell(a)?.fmt);
function setRaw(a,v){a=mergeAnchor(a);const c=cell(a,true);c.v=String(v??'')}
function markDirty(msg='Alterações não salvas'){dirty=true;$('#saveState').textContent=msg}
function clean(msg='Salvo no navegador'){dirty=false;$('#saveState').textContent=msg}
function toast(t){const x=$('#toast');x.textContent=t;x.classList.add('show');clearTimeout(x._t);x._t=setTimeout(()=>x.classList.remove('show'),1600)}
function lib(){try{const x=JSON.parse(localStorage.getItem(LIB)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
const writeLib=x=>localStorage.setItem(LIB,JSON.stringify(x));
const snapshot=()=>JSON.stringify({workbook,activeSheet,selectedStart,selectedEnd});
function pushHistory(){undoStack.push(snapshot());if(undoStack.length>40)undoStack.shift();redoStack=[];syncUndo()}
function restore(s){try{const x=JSON.parse(s);workbook=x.workbook;activeSheet=x.activeSheet||0;selectedStart=x.selectedStart||'A1';selectedEnd=x.selectedEnd||selectedStart;$('#bookName').value=workbook.name||'Pasta de trabalho sem título';renderAll();markDirty()}catch{}}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop());syncUndo()}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());syncUndo()}
function syncUndo(){$('#undoBtn').disabled=!undoStack.length;$('#redoBtn').disabled=!redoStack.length}

function rect(a=selectedStart,b=selectedEnd){
  const p=parts(a),q=parts(b);if(!p||!q)return{c1:0,c2:0,r1:1,r2:1};
  return{c1:Math.min(p.c,q.c),c2:Math.max(p.c,q.c),r1:Math.min(p.r,q.r),r2:Math.max(p.r,q.r)}
}
function rangeAddrs(a=selectedStart,b=selectedEnd){
  const z=rect(a,b),out=[];for(let r=z.r1;r<=z.r2;r++)for(let c=z.c1;c<=z.c2;c++)out.push(addr(c,r));return out
}
function rangeRef(a=selectedStart,b=selectedEnd){const z=rect(a,b),s=addr(z.c1,z.r1),e=addr(z.c2,z.r2);return s===e?s:s+':'+e}
function selectionCount(){const z=rect();return(z.c2-z.c1+1)*(z.r2-z.r1+1)}

function mergeContaining(a){
  const p=parts(a);if(!p)return null;
  return (sh().merges||[]).find(m=>{const z=rect(m.s,m.e);return p.c>=z.c1&&p.c<=z.c2&&p.r>=z.r1&&p.r<=z.r2})||null
}
function mergeAnchor(a){const m=mergeContainingRaw(a);return m?m.s:a}
function mergeContainingRaw(a){
  if(!workbook||!sh())return null;const p=parts(a);if(!p)return null;
  return (sh().merges||[]).find(m=>{const z=rect(m.s,m.e);return p.c>=z.c1&&p.c<=z.c2&&p.r>=z.r1&&p.r<=z.r2})||null
}
function isMergeAnchor(a){return (sh().merges||[]).find(m=>m.s===a)||null}
function mergeCovered(a){const m=mergeContainingRaw(a);return m&&m.s!==a?m:null}

function scalar(a,seen=new Set()){
  a=mergeAnchor(a);const v=raw(a).trim();
  if(v.startsWith('='))return evaluate(v,new Set([...seen,a]));
  const n=Number(v.replace(',','.'));return Number.isFinite(n)&&v!==''?n:v
}
function splitArgs(s){
  const out=[];let cur='',depth=0,quote=false;
  for(const ch of s){if(ch==='"')quote=!quote;if(!quote&&ch==='(')depth++;if(!quote&&ch===')')depth--;if(!quote&&depth===0&&ch===';'){out.push(cur.trim());cur=''}else cur+=ch}
  out.push(cur.trim());return out
}
function token(t,seen){
  t=(t||'').trim();
  if(/^".*"$/.test(t))return t.slice(1,-1);
  if(/^[A-Z]+\d+$/i.test(t)){const a=t.toUpperCase();if(seen.has(a))throw Error();return scalar(a,seen)}
  if(/^-?\d+(?:[.,]\d+)?$/.test(t))return Number(t.replace(',','.'));
  return expr(t,seen)
}
function rangeVals(t,seen){
  const m=/^([A-Z]+\d+):([A-Z]+\d+)$/i.exec((t||'').trim());if(!m)return[];
  return rangeAddrs(m[1].toUpperCase(),m[2].toUpperCase()).map(a=>scalar(a,seen))
}
function critMatch(value,crit){
  crit=String(crit??'').replace(/^"|"$/g,'');
  const m=/^(<=|>=|<>|=|<|>)(.*)$/.exec(crit);if(!m)return String(value)===crit;
  const lv=Number(value),rv=Number(m[2]),numeric=Number.isFinite(lv)&&Number.isFinite(rv),a=numeric?lv:String(value),b=numeric?rv:m[2];
  return m[1]==='>'?a>b:m[1]==='<'?a<b:m[1]==='>='?a>=b:m[1]==='<='?a<=b:m[1]==='<>'?a!=b:a==b
}
function condition(s,seen){
  const m=/(.+?)(<=|>=|<>|=|<|>)(.+)/.exec(s);if(!m)return Boolean(token(s,seen));
  const a=token(m[1],seen),b=token(m[3],seen),op=m[2];
  return op==='>'?a>b:op==='<'?a<b:op==='>='?a>=b:op==='<='?a<=b:op==='<>'?a!=b:a==b
}
function fn(name,argsText,seen){
  const args=splitArgs(argsText),n=name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),nums=t=>rangeVals(t,seen).map(Number).filter(Number.isFinite);
  if(['SOMA','SUM'].includes(n)){if(args.length>1)return args.reduce((s,a)=>s+Number(token(a,seen)||0),0);return nums(args[0]).reduce((a,b)=>a+b,0)}
  if(['MEDIA','AVERAGE'].includes(n)){const x=nums(args[0]);return x.length?x.reduce((a,b)=>a+b,0)/x.length:0}
  if(['MINIMO','MIN'].includes(n)){const x=nums(args[0]);return x.length?Math.min(...x):0}
  if(['MAXIMO','MAX'].includes(n)){const x=nums(args[0]);return x.length?Math.max(...x):0}
  if(['MEDIANA','MEDIAN'].includes(n)){const x=nums(args[0]).sort((a,b)=>a-b);if(!x.length)return 0;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2}
  if(['CONT.NUM','COUNT','CONTNUM'].includes(n))return nums(args[0]).length;
  if(['CONT.VALORES','COUNTA','CONTVALORES'].includes(n))return rangeVals(args[0],seen).filter(v=>String(v)!=='').length;
  if(['ARRED','ROUND'].includes(n)){const v=Number(token(args[0],seen)),d=Number(token(args[1]||'0',seen)),p=10**d;return Math.round(v*p)/p}
  if(n==='ABS')return Math.abs(Number(token(args[0],seen)));
  if(['RAIZ','SQRT'].includes(n))return Math.sqrt(Number(token(args[0],seen)));
  if(['POTENCIA','POWER'].includes(n))return Math.pow(Number(token(args[0],seen)),Number(token(args[1],seen)));
  if(['HOJE','TODAY'].includes(n))return new Date().toLocaleDateString('pt-BR');
  if(['SE','IF'].includes(n))return token(condition(args[0],seen)?args[1]:args[2],seen);
  if(['CONT.SE','COUNTIF','CONTSE'].includes(n)){const x=rangeVals(args[0],seen),c=token(args[1],seen);return x.filter(v=>critMatch(v,c)).length}
  if(['SOMASE','SUMIF'].includes(n)){const test=rangeVals(args[0],seen),c=token(args[1],seen),sum=args[2]?rangeVals(args[2],seen):test;return test.reduce((acc,v,i)=>acc+(critMatch(v,c)?Number(sum[i])||0:0),0)}
  throw Error()
}
function replaceFns(e,seen){
  let prev;do{prev=e;e=e.replace(/([A-ZÁÉÍÓÚÇ.]+)\(([^()]*)\)/gi,(all,n,args)=>{try{return JSON.stringify(fn(n,args,seen))}catch{return all}})}while(e!==prev);return e
}
function expr(e,seen){
  e=replaceFns(e,seen);
  e=e.replace(/\b([A-Z]+\d+)\b/gi,(_,a)=>{a=mergeAnchor(a.toUpperCase());if(seen.has(a))throw Error();return JSON.stringify(scalar(a,seen))});
  e=e.replace(/<>/g,'!=').replace(/(?<![<>=!])=(?!=)/g,'==');
  if(!/^[0-9+\-*/().,<>=! "A-Za-zÀ-ÿ:#]+$/.test(e))throw Error();
  return Function('"use strict";return ('+e+')')()
}
function evaluate(v,seen=new Set()){try{return expr(v.slice(1).trim(),seen)}catch{return'#ERRO!'}}
function displayValue(a){const v=raw(a);return v.trim().startsWith('=')?evaluate(v,new Set([mergeAnchor(a)])):v}
function formatDisplay(a,v){
  const f=fmt(a);if(v==='#ERRO!')return v;
  if(f.num==='currency'){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:f.dec,maximumFractionDigits:f.dec}):v}
  if(f.num==='percent'){const n=Number(v);return Number.isFinite(n)?(n*100).toLocaleString('pt-BR',{minimumFractionDigits:f.dec,maximumFractionDigits:f.dec})+'%':v}
  if(f.num==='number'){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{minimumFractionDigits:f.dec,maximumFractionDigits:f.dec}):v}
  return String(v??'')
}

function borderCss(f){
  const b=f.borders||{};return{
    borderTop:b.top?'1px solid #202622':'',
    borderRight:b.right?'1px solid #202622':'',
    borderBottom:b.bottom?'1px solid #202622':'',
    borderLeft:b.left?'1px solid #202622':''
  }
}
function styleCell(td,a){
  const f=fmt(a),i=td.querySelector('input');td.style.background=f.fill||'#fff';
  Object.assign(td.style,borderCss(f));
  i.style.fontFamily=f.font;i.style.fontSize=f.size+'px';i.style.fontWeight=f.bold?'700':'400';i.style.fontStyle=f.italic?'italic':'normal';i.style.textDecoration=f.underline?'underline':'none';i.style.color=f.color;i.style.textAlign=f.align
}

function renderGrid(){
  const grid=$('#grid');grid.classList.toggle('unfrozen',!sh().frozen);grid.innerHTML='';
  const top=document.createElement('tr'),corner=document.createElement('th');corner.className='corner';top.appendChild(corner);
  for(let c=0;c<sh().cols;c++){
    const th=document.createElement('th');th.className='colhead';th.dataset.col=c;th.textContent=colName(c);th.style.width=(sh().colWidths[c]||100)+'px';th.style.minWidth=th.style.width;
    const rz=document.createElement('span');rz.className='resize-col';rz.onmousedown=e=>resizeCol(e,c,th);th.appendChild(rz);top.appendChild(th)
  }
  grid.appendChild(top);
  for(let r=1;r<=sh().rows;r++){
    const tr=document.createElement('tr'),rh=document.createElement('th');rh.className='rowhead';rh.dataset.row=r;rh.textContent=r;rh.style.height=(sh().rowHeights[r]||27)+'px';
    const rr=document.createElement('span');rr.className='resize-row';rr.onmousedown=e=>resizeRow(e,r,rh);rh.appendChild(rr);tr.appendChild(rh);
    for(let c=0;c<sh().cols;c++){
      const a=addr(c,r),covered=mergeCovered(a);if(covered)continue;
      const td=document.createElement('td');td.dataset.cell=a;td.style.width=(sh().colWidths[c]||100)+'px';td.style.minWidth=td.style.width;td.style.height=(sh().rowHeights[r]||27)+'px';
      const m=isMergeAnchor(a);if(m){const z=rect(m.s,m.e);td.colSpan=z.c2-z.c1+1;td.rowSpan=z.r2-z.r1+1;td.classList.add('merged-cell')}
      const input=document.createElement('input');input.dataset.cell=a;input.value=formatDisplay(a,displayValue(a));
      input.onfocus=()=>{editStart=raw(a);setSelection(a,a,false);input.value=raw(a)};
      input.oninput=()=>{$('#formulaInput').value=input.value};
      input.onblur=()=>{if(input.value!==editStart){pushHistory();setRaw(a,input.value);markDirty();recalc()}else input.value=formatDisplay(a,displayValue(a))};
      input.onkeydown=e=>cellKey(e,a);
      input.ondblclick=e=>{e.stopPropagation();input.focus();input.select()};
      td.onmousedown=e=>cellMouseDown(e,a);
      td.onmouseenter=e=>cellMouseEnter(e,a);
      td.oncontextmenu=e=>showContext(e,a);
      td.appendChild(input);styleCell(td,a);tr.appendChild(td)
    }
    grid.appendChild(tr)
  }
  paintSelection();recalc()
}
function recalc(){
  for(const td of $$('#grid td[data-cell]')){const a=td.dataset.cell,i=td.querySelector('input');styleCell(td,a);if(document.activeElement!==i)i.value=formatDisplay(a,displayValue(a))}
}
function paintSelection(refMode=false){
  $$('#grid td').forEach(td=>td.classList.remove('range-selected','active-cell','ref-selected'));
  $$('#grid th').forEach(x=>x.classList.remove('active-head'));
  const list=rangeAddrs();
  for(const a0 of list){const a=mergeAnchor(a0),td=$(`#grid td[data-cell="${a}"]`);if(td)td.classList.add(refMode?'ref-selected':'range-selected')}
  const active=mergeAnchor(selectedStart),td=$(`#grid td[data-cell="${active}"]`);td?.classList.add('active-cell');
  const z=rect();for(let c=z.c1;c<=z.c2;c++)$(`#grid .colhead[data-col="${c}"]`)?.classList.add('active-head');
  for(let r=z.r1;r<=z.r2;r++)$(`#grid .rowhead[data-row="${r}"]`)?.classList.add('active-head');
  $('#nameBox').value=rangeRef();
  if(!refMode)$('#formulaInput').value=raw(selectedStart);
  $('#statusRight').textContent=sh().name+' · '+rangeRef()+(selectionCount()>1?' · '+selectionCount()+' células':'');
  syncToolbar()
}
function setSelection(a,b=a,focus=false){
  selectedStart=mergeAnchor(a);selectedEnd=b;paintSelection();
  if(focus){const td=$(`#grid td[data-cell="${mergeAnchor(a)}"]`),i=td?.querySelector('input');i?.focus();i?.select()}
}
function formulaEditor(){
  const f=$('#formulaInput');
  if(document.activeElement===f&&f.value.trim().startsWith('='))return f;
  const el=document.activeElement;
  if(el?.matches?.('#grid td input')&&el.value.trim().startsWith('='))return el;
  return null
}
function startFormulaRef(editor,a){
  formulaRefEditor=editor;formulaRefDrag=true;formulaRefStart=a;
  const s=editor.selectionStart??editor.value.length,e=editor.selectionEnd??s;
  formulaRefPrefix=editor.value.slice(0,s);formulaRefSuffix=editor.value.slice(e);
  updateFormulaRef(a)
}
function updateFormulaRef(a){
  if(!formulaRefEditor)return;const ref=rangeRef(formulaRefStart,a);
  formulaRefEditor.value=formulaRefPrefix+ref+formulaRefSuffix;
  const pos=formulaRefPrefix.length+ref.length;formulaRefEditor.setSelectionRange?.(pos,pos);
  $('#formulaInput').value=formulaRefEditor.value;
  selectedStart=formulaRefStart;selectedEnd=a;paintSelection(true)
}
function finishFormulaRef(){formulaRefDrag=false;if(formulaRefEditor){formulaRefEditor.focus();formulaRefEditor=null}}
function cellMouseDown(e,a){
  if(e.button!==0)return;
  const editor=formulaEditor();
  if(editor){e.preventDefault();startFormulaRef(editor,a);return}
  if(e.shiftKey){e.preventDefault();selectedEnd=a;paintSelection();dragSelecting=true;return}
  if(e.detail>=2)return;
  e.preventDefault();selectedStart=mergeAnchor(a);selectedEnd=a;dragSelecting=true;paintSelection()
}
function cellMouseEnter(e,a){
  if(formulaRefDrag){e.preventDefault();updateFormulaRef(a);return}
  if(dragSelecting&&e.buttons===1){selectedEnd=a;paintSelection()}
}
document.addEventListener('mouseup',()=>{dragSelecting=false;if(formulaRefDrag)finishFormulaRef()});
function cellKey(e,a){
  const p=parts(a);
  if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();setSelection(addr(p.c,Math.min(sh().rows,p.r+1)),undefined,true)}
  else if(e.key==='Tab'){e.preventDefault();e.currentTarget.blur();setSelection(addr(Math.min(sh().cols-1,p.c+1),p.r),undefined,true)}
}

function syncToolbar(){
  const f=fmt(selectedStart);
  $('#fontFamily').value=f.font;$('#fontSize').value=String(f.size);$('#fontColor').value=f.color||'#202622';$('#fillColor').value=f.fill||'#ffffff';
  $('#boldBtn').style.background=f.bold?'#dfeee5':'';$('#italicBtn').style.background=f.italic?'#dfeee5':'';$('#underlineBtn').style.background=f.underline?'#dfeee5':'';
  const m=mergeContainingRaw(selectedStart);$('#mergeBtn').textContent=m?'▣ Desmesclar':'▣ Mesclar'
}
function mutateFmt(fn){
  pushHistory();
  const done=new Set();for(const a0 of rangeAddrs()){const a=mergeAnchor(a0);if(done.has(a))continue;done.add(a);const c=cell(a,true);c.fmt=normalizeFmt(c.fmt);fn(c.fmt,a)}
  markDirty();recalc();syncToolbar()
}
function applyBorders(mode){
  if(!mode)return;pushHistory();const z=rect(),list=rangeAddrs();
  for(const a0 of list){const a=mergeAnchor(a0),p=parts(a0),c=cell(a,true);c.fmt=normalizeFmt(c.fmt);const b=c.fmt.borders;
    if(mode==='none'){b.top=b.right=b.bottom=b.left=false;continue}
    if(mode==='all'){b.top=b.right=b.bottom=b.left=true;continue}
    if(mode==='outer'){if(p.r===z.r1)b.top=true;if(p.r===z.r2)b.bottom=true;if(p.c===z.c1)b.left=true;if(p.c===z.c2)b.right=true;continue}
    if(mode==='top'&&p.r===z.r1)b.top=true;if(mode==='bottom'&&p.r===z.r2)b.bottom=true;if(mode==='left'&&p.c===z.c1)b.left=true;if(mode==='right'&&p.c===z.c2)b.right=true
  }
  markDirty();recalc();$('#borderSelect').value=''
}
function mergeSelection(){
  const existing=mergeContainingRaw(selectedStart);
  if(existing){pushHistory();sh().merges=sh().merges.filter(m=>m!==existing);selectedStart=existing.s;selectedEnd=existing.e;markDirty();renderGrid();toast('Células desmescladas');return}
  if(selectionCount()<2){toast('Selecione duas ou mais células para mesclar');return}
  const z=rect(),s=addr(z.c1,z.r1),e=addr(z.c2,z.r2);
  const overlaps=(sh().merges||[]).some(m=>{const x=rect(m.s,m.e);return !(x.c2<z.c1||x.c1>z.c2||x.r2<z.r1||x.r1>z.r2)});
  if(overlaps){toast('Desmescle a área existente antes');return}
  pushHistory();const keep=raw(s);
  for(const a of rangeAddrs(s,e))if(a!==s)delete sh().cells[a];
  const c=cell(s,true);c.v=keep;c.fmt.align='center';sh().merges.push({s,e});selectedStart=s;selectedEnd=e;markDirty();renderGrid();toast('Células mescladas')
}

function resizeCol(e,c,th){
  e.preventDefault();e.stopPropagation();const x=e.clientX,start=th.getBoundingClientRect().width;
  const move=ev=>{sh().colWidths[c]=Math.max(45,start+ev.clientX-x);renderGrid()};
  const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);markDirty()};
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up)
}
function resizeRow(e,r,th){
  e.preventDefault();e.stopPropagation();const y=e.clientY,start=th.getBoundingClientRect().height;
  const move=ev=>{sh().rowHeights[r]=Math.max(20,start+ev.clientY-y);renderGrid()};
  const up=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);markDirty()};
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',up)
}

function shiftRows(start,delta){
  const out={};for(const [a,c] of Object.entries(sh().cells)){const p=parts(a);if(p.r>=start){const nr=p.r+delta;if(nr>=1)out[addr(p.c,nr)]=c}else out[a]=c}sh().cells=out;
  sh().merges=(sh().merges||[]).map(m=>{let p=parts(m.s),q=parts(m.e);if(p.r>=start)p.r+=delta;if(q.r>=start)q.r+=delta;return{s:addr(p.c,p.r),e:addr(q.c,q.r)}}).filter(m=>parts(m.s).r>=1&&parts(m.e).r>=1)
}
function shiftCols(start,delta){
  const out={};for(const [a,c] of Object.entries(sh().cells)){const p=parts(a);if(p.c>=start){const nc=p.c+delta;if(nc>=0)out[addr(nc,p.r)]=c}else out[a]=c}sh().cells=out;
  sh().merges=(sh().merges||[]).map(m=>{let p=parts(m.s),q=parts(m.e);if(p.c>=start)p.c+=delta;if(q.c>=start)q.c+=delta;return{s:addr(p.c,p.r),e:addr(q.c,q.r)}}).filter(m=>parts(m.s).c>=0&&parts(m.e).c>=0)
}
function structure(act){
  const p=parts(contextAddr||selectedStart);pushHistory();
  if(act==='insertRowAbove'){shiftRows(p.r,1);sh().rows++}
  if(act==='insertRowBelow'){shiftRows(p.r+1,1);sh().rows++}
  if(act==='deleteRow'){shiftRows(p.r+1,-1);sh().rows=Math.max(1,sh().rows-1)}
  if(act==='insertColLeft'){shiftCols(p.c,1);sh().cols++}
  if(act==='insertColRight'){shiftCols(p.c+1,1);sh().cols++}
  if(act==='deleteCol'){shiftCols(p.c+1,-1);sh().cols=Math.max(1,sh().cols-1)}
  if(act==='clearCell'){for(const a of rangeAddrs())setRaw(a,'')}
  if(act==='merge'){undoStack.pop();mergeSelection();return}
  if(act==='outerBorder'){undoStack.pop();applyBorders('outer');return}
  markDirty();selectedStart='A1';selectedEnd='A1';renderGrid()
}
function showContext(e,a){e.preventDefault();contextAddr=a;if(!rangeAddrs().includes(a))setSelection(a);const x=$('#context');x.style.left=Math.min(e.clientX,innerWidth-210)+'px';x.style.top=Math.min(e.clientY,innerHeight-280)+'px';x.classList.add('show')}
document.addEventListener('mousedown',e=>{if(!e.target.closest('#context'))$('#context').classList.remove('show')});
$$('#context [data-act]').forEach(b=>b.onclick=()=>{structure(b.dataset.act);$('#context').classList.remove('show')});

function renderTabs(){
  const bar=$('#sheetBar');bar.querySelectorAll('.sheet-tab').forEach(x=>x.remove());
  sh && workbook.sheets.forEach((s,i)=>{const b=document.createElement('button');b.className='sheet-tab'+(i===activeSheet?' active':'');b.textContent=s.name;b.onclick=()=>{activeSheet=i;selectedStart=selectedEnd='A1';renderAll()};b.ondblclick=()=>renameSheet(i);b.oncontextmenu=e=>{e.preventDefault();if(workbook.sheets.length>1&&confirm('Excluir a planilha "'+s.name+'"?')){pushHistory();workbook.sheets.splice(i,1);activeSheet=Math.max(0,Math.min(activeSheet,workbook.sheets.length-1));selectedStart=selectedEnd='A1';markDirty();renderAll()}};bar.appendChild(b)})
}
function renameSheet(i){const n=prompt('Nome da planilha:',workbook.sheets[i].name);if(n?.trim()){pushHistory();workbook.sheets[i].name=n.trim().slice(0,31);markDirty();renderTabs()}}
function addSheet(){pushHistory();let n=1;const names=new Set(workbook.sheets.map(s=>s.name));while(names.has('Planilha'+n))n++;workbook.sheets.push(newSheet('Planilha'+n));activeSheet=workbook.sheets.length-1;selectedStart=selectedEnd='A1';markDirty();renderAll()}
function renderAll(){renderTabs();renderGrid();$('#freezeBtn').textContent='❄ Cabeçalhos: '+(sh().frozen?'ON':'OFF');syncUndo()}

function saveBrowser(){
  workbook.name=$('#bookName').value.trim()||'Pasta de trabalho sem título';workbook.updated=new Date().toISOString();if(!currentId)currentId=uid();workbook.id=currentId;
  const items=lib(),copy=JSON.parse(JSON.stringify(workbook)),i=items.findIndex(x=>x.id===currentId);if(i>=0)items[i]=copy;else items.unshift(copy);writeLib(items);clean();renderSaved();toast('Pasta salva neste navegador')
}
function renderSaved(){
  const list=$('#savedList');list.innerHTML='';const items=lib().sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
  if(!items.length){list.innerHTML='<div class="empty">Nenhuma pasta salva neste navegador.</div>';return}
  items.forEach(d=>{const row=document.createElement('div');row.className='saved-item';const main=document.createElement('button');main.className='saved-main';main.innerHTML='<strong></strong><span></span>';main.querySelector('strong').textContent=d.name||'Pasta sem título';main.querySelector('span').textContent=(d.sheets?.length||1)+' planilha(s) · '+(d.updated?new Date(d.updated).toLocaleString('pt-BR'):'');main.onclick=()=>openSavedBook(d.id);const del=document.createElement('button');del.className='delete-saved';del.textContent='Excluir';del.onclick=e=>{e.stopPropagation();if(confirm('Excluir esta pasta salva?')){writeLib(lib().filter(x=>x.id!==d.id));renderSaved()}};row.append(main,del);list.appendChild(row)})
}
function openSavedBook(id){const d=lib().find(x=>x.id===id);if(!d)return;currentId=id;workbook=JSON.parse(JSON.stringify(d));activeSheet=0;selectedStart=selectedEnd='A1';undoStack=[];redoStack=[];$('#bookName').value=workbook.name||'Pasta de trabalho sem título';clean('Aberto do navegador');$('#savedModal').classList.remove('show');renderAll()}
function newBook(){if(dirty&&!confirm('Há alterações não salvas. Criar uma nova pasta mesmo assim?'))return;currentId=null;workbook=blankBook();activeSheet=0;selectedStart=selectedEnd='A1';undoStack=[];redoStack=[];$('#bookName').value=workbook.name;clean('Nova pasta de trabalho');renderAll()}

function importXlsx(wb,name){
  const sheets=[];
  wb.SheetNames.forEach((sn,idx)=>{
    const ws=wb.Sheets[sn],range=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{s:{r:0,c:0},e:{r:39,c:15}},s=newSheet(sn);
    s.rows=Math.max(40,range.e.r+1);s.cols=Math.max(16,range.e.c+1);
    for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){const aa=XLSX.utils.encode_cell({r,c}),x=ws[aa];if(!x)continue;const a=addr(c,r+1),v=x.f?'='+x.f:(x.v??'');s.cells[a]={v:String(v),fmt:defFmt()}}
    if(Array.isArray(ws['!merges']))s.merges=ws['!merges'].map(m=>({s:addr(m.s.c,m.s.r+1),e:addr(m.e.c,m.e.r+1)}));
    if(Array.isArray(ws['!cols']))ws['!cols'].forEach((x,c)=>{if(x?.wch)s.colWidths[c]=Math.max(45,Math.round(x.wch*8))});
    if(Array.isArray(ws['!rows']))ws['!rows'].forEach((x,r)=>{if(x?.hpx)s.rowHeights[r+1]=x.hpx});
    sheets.push(s)
  });
  workbook={id:uid(),name:name||'Pasta importada',sheets:sheets.length?sheets:[newSheet('Planilha1')],updated:null};currentId=null;activeSheet=0;selectedStart=selectedEnd='A1';undoStack=[];redoStack=[];$('#bookName').value=workbook.name;markDirty('Arquivo aberto · não salvo');renderAll()
}
async function openFile(f){
  if(!f)return;const base=f.name.replace(/\.[^.]+$/,'');
  if(/\.csv$/i.test(f.name)){
    const text=(await f.text()).replace(/^\ufeff/,'');const wb=XLSX.read(text,{type:'string'});importXlsx(wb,base);return
  }
  const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellFormula:true});importXlsx(wb,base)
}
function exportXlsx(){
  const wb=XLSX.utils.book_new();
  workbook.sheets.forEach(s=>{
    const ws={};let maxR=0,maxC=0;
    for(const [a,c] of Object.entries(s.cells)){const p=parts(a),ref=XLSX.utils.encode_cell({r:p.r-1,c:p.c});maxR=Math.max(maxR,p.r-1);maxC=Math.max(maxC,p.c);const v=String(c.v??'');if(v.startsWith('='))ws[ref]={t:'n',f:v.slice(1),v:0};else{const n=Number(v.replace(',','.'));ws[ref]=Number.isFinite(n)&&v.trim()!==''?{t:'n',v:n}:{t:'s',v}}}
    ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(maxR,s.rows-1),c:Math.max(maxC,s.cols-1)}});
    ws['!merges']=(s.merges||[]).map(m=>{const p=parts(m.s),q=parts(m.e);return{s:{r:p.r-1,c:p.c},e:{r:q.r-1,c:q.c}}});
    ws['!cols']=Array.from({length:s.cols},(_,c)=>({wch:Math.max(6,Math.round((s.colWidths[c]||100)/8))}));
    ws['!rows']=Array.from({length:s.rows},(_,r)=>({hpx:s.rowHeights[r+1]||27}));
    XLSX.utils.book_append_sheet(wb,ws,s.name.slice(0,31)||'Planilha')
  });
  const safe=($('#bookName').value||'WDM Planilhas').replace(/[\\/:*?"<>|]+/g,'-');XLSX.writeFile(wb,safe+'.xlsx');toast('Arquivo .xlsx gerado')
}

function copyText(){
  const z=rect(),rows=[];for(let r=z.r1;r<=z.r2;r++){const rr=[];for(let c=z.c1;c<=z.c2;c++)rr.push(raw(addr(c,r)));rows.push(rr.join('\t'))}return rows.join('\n')
}
function pasteText(text,cut=false){
  if(!text)return;pushHistory();const p=parts(selectedStart),lines=text.replace(/\r/g,'').split('\n');
  lines.forEach((ln,ri)=>ln.split('\t').forEach((v,ci)=>{const c=p.c+ci,r=p.r+ri;if(c<sh().cols&&r<=sh().rows)setRaw(addr(c,r),v)}));markDirty();renderGrid();toast('Dados colados')
}
document.addEventListener('copy',e=>{if(document.activeElement?.matches?.('input'))return;e.preventDefault();e.clipboardData.setData('text/plain',copyText());toast('Copiado')});
document.addEventListener('cut',e=>{if(document.activeElement?.matches?.('input'))return;e.preventDefault();e.clipboardData.setData('text/plain',copyText());pushHistory();for(const a of rangeAddrs())setRaw(a,'');markDirty();renderGrid();toast('Recortado')});
document.addEventListener('paste',e=>{if(document.activeElement?.matches?.('input'))return;e.preventDefault();pasteText(e.clipboardData.getData('text/plain'))});

$$('.ribbon-tabs button').forEach(b=>b.onclick=()=>{$$('.ribbon-tabs button').forEach(x=>x.classList.toggle('active',x===b));$$('[data-panel]').forEach(p=>p.classList.toggle('hidden',p.dataset.panel!==b.dataset.tab))});
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
$('#boldBtn').onclick=()=>mutateFmt(f=>f.bold=!f.bold);$('#italicBtn').onclick=()=>mutateFmt(f=>f.italic=!f.italic);$('#underlineBtn').onclick=()=>mutateFmt(f=>f.underline=!f.underline);
$('#fontFamily').onchange=e=>mutateFmt(f=>f.font=e.target.value);$('#fontSize').onchange=e=>mutateFmt(f=>f.size=+e.target.value);$('#fontColor').oninput=e=>mutateFmt(f=>f.color=e.target.value);$('#fillColor').oninput=e=>mutateFmt(f=>f.fill=e.target.value);
$$('[data-align]').forEach(b=>b.onclick=()=>mutateFmt(f=>f.align=b.dataset.align));
$('#currencyBtn').onclick=()=>mutateFmt(f=>f.num='currency');$('#percentBtn').onclick=()=>mutateFmt(f=>f.num='percent');$('#numberBtn').onclick=()=>mutateFmt(f=>f.num='number');
$('#decDown').onclick=()=>mutateFmt(f=>f.dec=Math.max(0,(f.dec||0)-1));$('#decUp').onclick=()=>mutateFmt(f=>f.dec=Math.min(8,(f.dec||0)+1));$('#clearFormat').onclick=()=>mutateFmt(f=>Object.assign(f,defFmt()));
$('#mergeBtn').onclick=mergeSelection;$('#borderSelect').onchange=e=>applyBorders(e.target.value);
$('#addRowBtn').onclick=()=>{pushHistory();sh().rows+=5;markDirty();renderGrid()};$('#addColBtn').onclick=()=>{pushHistory();sh().cols+=3;markDirty();renderGrid()};
$('#freezeBtn').onclick=()=>{sh().frozen=!sh().frozen;markDirty();renderAll()};
$('#addSheet').onclick=addSheet;
$('#formulaInput').onfocus=e=>{e.target.value=raw(selectedStart)};
$('#formulaInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();pushHistory();setRaw(selectedStart,e.target.value);markDirty();recalc();setSelection(selectedStart)}};
$('#formulaInput').onblur=e=>{if(e.target.value!==raw(selectedStart)&&!formulaRefDrag){pushHistory();setRaw(selectedStart,e.target.value);markDirty();recalc()}};
$('#nameBox').onkeydown=e=>{if(e.key==='Enter'){const v=e.target.value.trim().toUpperCase(),m=/^([A-Z]+\d+)(?::([A-Z]+\d+))?$/.exec(v);if(m){setSelection(m[1],m[2]||m[1]);$(`#grid td[data-cell="${mergeAnchor(m[1])}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'})}}};
$('#bookName').oninput=markDirty;
$('#newBook').onclick=newBook;$('#saveBrowser').onclick=saveBrowser;$('#openSaved').onclick=()=>{renderSaved();$('#savedModal').classList.add('show')};$('#closeModal').onclick=()=>$('#savedModal').classList.remove('show');
$('#savedModal').onclick=e=>{if(e.target.id==='savedModal')e.currentTarget.classList.remove('show')};
$('#openFile').onclick=()=>$('#fileInput').click();$('#fileInput').onchange=async e=>{await openFile(e.target.files?.[0]);e.target.value=''};$('#exportXlsx').onclick=exportXlsx;

document.addEventListener('keydown',e=>{
  if(e.target.matches('input'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveBrowser();return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}
  const p=parts(selectedStart);if(!p)return;
  if(e.key==='ArrowDown'){e.preventDefault();if(e.shiftKey){selectedEnd=addr(parts(selectedEnd).c,Math.min(sh().rows,parts(selectedEnd).r+1));paintSelection()}else setSelection(addr(p.c,Math.min(sh().rows,p.r+1)))}
  else if(e.key==='ArrowUp'){e.preventDefault();if(e.shiftKey){selectedEnd=addr(parts(selectedEnd).c,Math.max(1,parts(selectedEnd).r-1));paintSelection()}else setSelection(addr(p.c,Math.max(1,p.r-1)))}
  else if(e.key==='ArrowRight'){e.preventDefault();if(e.shiftKey){selectedEnd=addr(Math.min(sh().cols-1,parts(selectedEnd).c+1),parts(selectedEnd).r);paintSelection()}else setSelection(addr(Math.min(sh().cols-1,p.c+1),p.r))}
  else if(e.key==='ArrowLeft'){e.preventDefault();if(e.shiftKey){selectedEnd=addr(Math.max(0,parts(selectedEnd).c-1),parts(selectedEnd).r);paintSelection()}else setSelection(addr(Math.max(0,p.c-1),p.r))}
  else if(e.key==='Delete'){e.preventDefault();pushHistory();for(const a of rangeAddrs())setRaw(a,'');markDirty();renderGrid()}
  else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const td=$(`#grid td[data-cell="${mergeAnchor(selectedStart)}"]`),i=td?.querySelector('input');if(i){i.focus();i.value=e.key;i.setSelectionRange(1,1);$('#formulaInput').value=e.key}}
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
workbook=blankBook();$('#bookName').value=workbook.name;renderAll();clean('Nova pasta de trabalho');
})();