const BRANDS = {
  wdmapps:{name:'WDM Apps',site:'wdmapps.com.br',accent:'#1488ff',accent2:'#7c4dff',cta:'Conheça a WDM Apps',tag:'#WDMApps'},
  wdmiptv:{name:'WDM IPTV',site:'wdmapps.com.br/iptv',accent:'#087cf2',accent2:'#101a38',cta:'Fale com a WDM IPTV',tag:'#WDMIPTV'},
  ferrari:{name:'Ferrari Gesso',site:'ferrarigesso.com.br',accent:'#e24b36',accent2:'#5a1721',cta:'Peça seu orçamento',tag:'#FerrariGesso'},
  telhas:{name:'Telhas Porto',site:'telhasporto.com.br',accent:'#d56928',accent2:'#67351e',cta:'Solicite seu orçamento',tag:'#TelhasPorto'}
};
const FORMATS = {
  square:{w:1080,h:1080,label:'Quadrado'},
  feed:{w:1080,h:1350,label:'Feed'},
  story:{w:1080,h:1920,label:'Story'}
};
const SQUAD_CREATIVE_URL='https://wdmappsgithubio.wdmapps.deno.net/squad/creative';

let format='feed';
let sourceImage=null;
let functions=null;
let igStatus=null;
let currentDataUrl='';
const $=(s)=>document.querySelector(s);

function toast(message,type='ok'){
  const old=$('.toast'); if(old) old.remove();
  const el=document.createElement('div'); el.className='toast '+type; el.textContent=message; document.body.appendChild(el);
  setTimeout(()=>el.remove(),3600);
}
function escText(v){return String(v||'').trim();}
function slugWords(text){
  return escText(text).replace(/[\n\r]+/g,' ').split(/[.!?]/)[0].trim().split(/\s+/).slice(0,8).join(' ');
}
function hashtags(brand,brief){
  const words=escText(brief).normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[A-Za-z0-9]{4,}/g)||[];
  const extras=[...new Set(words.slice(0,4).map(w=>'#'+w.replace(/[^A-Za-z0-9]/g,'')))];
  return [brand.tag,'#Publicidade','#Empreendedorismo',...extras].join(' ');
}
function generateCopy(){
  const brand=BRANDS[$('#brand').value];
  const brief=escText($('#brief').value) || 'soluções profissionais para facilitar o seu dia a dia';
  const purpose=$('#purpose').value;
  const tone=$('#tone').value;
  const core=slugWords(brief);
  const heads={
    sale:['Uma solução que faz diferença','Transforme sua ideia em resultado','Seu próximo passo começa aqui'],
    launch:['Novidade chegando','Conheça nossa novidade','Chegou algo novo para você'],
    service:['Profissionalismo em cada detalhe','Seu projeto merece qualidade','Solução profissional para você'],
    promo:['Aproveite esta oportunidade','Condição especial por tempo limitado','É hora de aproveitar']
  };
  const list=heads[purpose]||heads.service;
  let headline=list[Math.floor(Math.random()*list.length)];
  if(core && core.length<58) headline=core.charAt(0).toUpperCase()+core.slice(1);
  if(tone==='direto' && headline.length>42) headline=headline.split(' ').slice(0,6).join(' ');
  if(tone==='premium') headline='Excelência para quem busca mais';
  if(tone==='criativo') headline='Sua ideia merece aparecer';
  $('#headline').value=headline;
  $('#cta').value=brand.cta;
  $('#caption').value=headline+'\n\n'+brief+'\n\n👉 '+brand.cta+'\n🌐 '+brand.site+'\n\n'+hashtags(brand,brief);
  $('#captionPreview').textContent=$('#caption').value;
  renderCanvas();
}
async function generateWithSquadAI(){
  const brief=escText($('#brief').value);
  if(!brief){toast('Escreva o briefing primeiro.','err');$('#brief').focus();return;}
  const btn=$('#generateAI');
  const status=$('#aiStatus');
  btn.disabled=true;
  btn.textContent='🤖 Squad trabalhando...';
  status.textContent='Copy criando a campanha e Studio preparando a imagem...';
  status.className='inlineStatus';
  try{
    const user=await firebaseUser();
    if(!user)throw new Error('Sua sessão expirou. Entre novamente no painel.');
    const idToken=await user.getIdToken(true);
    const brand=BRANDS[$('#brand').value];
    const response=await fetch(SQUAD_CREATIVE_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
      body:JSON.stringify({
        brandName:brand.name,
        site:brand.site,
        brief,
        purpose:$('#purpose').value,
        tone:$('#tone').value,
        format
      })
    });
    let data={};try{data=await response.json()}catch(_){}
    if(!response.ok||data.ok===false)throw new Error(data.error||('Squad respondeu '+response.status));

    $('#headline').value=escText(data.headline)||$('#headline').value;
    $('#cta').value=escText(data.cta)||brand.cta;
    let caption=escText(data.caption);
    const aiTags=Array.isArray(data.hashtags)?data.hashtags.filter(Boolean).join(' '):'';
    if(aiTags && !caption.includes(aiTags)) caption=(caption+'\n\n'+aiTags).trim();
    $('#caption').value=caption;
    $('#captionPreview').textContent=caption;

    if(data.imageDataUrl){
      await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>{sourceImage=img;resolve();};
        img.onerror=()=>reject(new Error('A imagem foi gerada, mas o navegador não conseguiu carregá-la.'));
        img.src=data.imageDataUrl;
      });
    }
    renderCanvas();
    const models=[data.textModel,data.imageModel].filter(Boolean).join(' + ');
    status.textContent='✅ Squad gerou texto + imagem'+(models?' · '+models:'')+(data.visualDirection?' · '+data.visualDirection:'');
    status.className='inlineStatus ok';
    toast('Criativo gerado pela WDM Squad! 🤖✨');
  }catch(e){
    console.error('WDM Criativos Squad:',e);
    status.textContent=e?.message||'Não foi possível gerar com a Squad.';
    status.className='inlineStatus err';
    toast('A Squad não conseguiu gerar o criativo.','err');
  }finally{
    btn.disabled=false;
    btn.textContent='🤖 Gerar com IA do Squad';
  }
}

function hexToRgb(hex){
  const v=hex.replace('#',''); return {r:parseInt(v.slice(0,2),16),g:parseInt(v.slice(2,4),16),b:parseInt(v.slice(4,6),16)};
}
function drawCover(ctx,img,w,h){
  const scale=Math.max(w/img.width,h/img.height), sw=w/scale, sh=h/scale;
  const sx=(img.width-sw)/2, sy=(img.height-sh)/2;
  ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
}
function wrapLines(ctx,text,maxWidth,maxLines=4){
  const words=escText(text).split(/\s+/); const lines=[]; let line='';
  for(const word of words){
    const test=line?line+' '+word:word;
    if(ctx.measureText(test).width>maxWidth && line){lines.push(line);line=word;if(lines.length===maxLines-1)break;}
    else line=test;
  }
  if(line && lines.length<maxLines) lines.push(line);
  return lines;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function renderCanvas(){
  const canvas=$('#creativeCanvas'), ctx=canvas.getContext('2d');
  const f=FORMATS[format], brand=BRANDS[$('#brand').value]; canvas.width=f.w; canvas.height=f.h;
  const g=ctx.createLinearGradient(0,0,f.w,f.h); g.addColorStop(0,brand.accent2); g.addColorStop(1,brand.accent); ctx.fillStyle=g; ctx.fillRect(0,0,f.w,f.h);
  if(sourceImage){drawCover(ctx,sourceImage,f.w,f.h);const shade=ctx.createLinearGradient(0,0,0,f.h);shade.addColorStop(0,'rgba(2,9,19,.18)');shade.addColorStop(.52,'rgba(2,9,19,.34)');shade.addColorStop(1,'rgba(2,9,19,.92)');ctx.fillStyle=shade;ctx.fillRect(0,0,f.w,f.h);}
  else{ctx.globalAlpha=.15;for(let i=0;i<9;i++){ctx.beginPath();ctx.arc(f.w*(.15+i*.12),f.h*(.16+i*.08),80+i*16,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}ctx.globalAlpha=1;}
  const pad=Math.round(f.w*.075), bottom=Math.round(f.h*.105);
  ctx.fillStyle='rgba(4,13,26,.62)'; roundRect(ctx,pad,pad,Math.min(350,f.w-pad*2),70,24);
  ctx.fillStyle='#fff';ctx.font='800 31px Inter, Arial';ctx.fillText(brand.name,pad+28,pad+45);
  let fontSize=format==='story'?70:64; const maxWidth=f.w-pad*2;
  ctx.font='800 '+fontSize+'px Inter, Arial'; let lines=wrapLines(ctx,$('#headline').value||'Seu criativo começa aqui',maxWidth,4);
  while(lines.some(l=>ctx.measureText(l).width>maxWidth) && fontSize>42){fontSize-=3;ctx.font='800 '+fontSize+'px Inter, Arial';lines=wrapLines(ctx,$('#headline').value,maxWidth,4);}
  const lineHeight=fontSize*1.08; const textH=lines.length*lineHeight;
  let y=f.h-bottom-150-textH;
  ctx.fillStyle='#fff';ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=22;
  lines.forEach((line,i)=>ctx.fillText(line,pad,y+i*lineHeight));ctx.shadowBlur=0;
  const cta=escText($('#cta').value)||brand.cta;ctx.font='800 27px Inter, Arial';const ctaW=Math.min(maxWidth,ctx.measureText(cta).width+60);
  ctx.fillStyle=brand.accent;roundRect(ctx,pad,f.h-bottom-92,ctaW,64,22);ctx.fillStyle='#fff';ctx.fillText(cta,pad+30,f.h-bottom-50);
  ctx.font='600 23px Inter, Arial';ctx.fillStyle='rgba(255,255,255,.82)';ctx.fillText(brand.site,pad,f.h-bottom+2);
  currentDataUrl=canvas.toDataURL('image/jpeg',.92);
}
function setFormat(next){
  format=next;document.querySelectorAll('[data-format]').forEach(b=>b.classList.toggle('active',b.dataset.format===next));renderCanvas();
}
function downloadCreative(){
  renderCanvas();const a=document.createElement('a');a.href=currentDataUrl;a.download='wdm-criativo-'+format+'.jpg';a.click();
}
async function getCallable(name,data={}){
  if(!functions) throw new Error('Serviço ainda não carregado.');
  return (await functions.httpsCallable(name)(data)).data;
}
async function loadInstagramStatus(){
  try{
    igStatus=await getCallable('creativeInstagramStatus'); renderIgStatus();
  }catch(error){
    $('#igInline').textContent='Backend do Instagram ainda não foi publicado no Firebase.';$('#igInline').className='inlineStatus err';
  }
}
function renderIgStatus(){
  const box=$('#igStatusBox'), avatar=$('#igAvatar'), title=$('#igTitle'), sub=$('#igSub');
  $('#metaAppId').value=igStatus?.appId||'';
  $('#callbackUrl').value=igStatus?.callbackUrl||'';
  if(igStatus?.connected){
    box.classList.add('connected');title.textContent='@'+(igStatus.username||'instagram');sub.textContent=(igStatus.accountType||'Conta profissional')+' · conectado';
    avatar.innerHTML=igStatus.profilePictureUrl?'<img alt="" src="'+igStatus.profilePictureUrl+'">':'IG';
    $('#connectIg').classList.add('hidden');$('#disconnectIg').classList.remove('hidden');$('#publishIg').disabled=false;
  }else{
    title.textContent=igStatus?.configured?'Instagram configurado':'Instagram ainda não configurado';sub.textContent=igStatus?.configured?'Pronto para conectar a conta profissional':'Informe App ID e App Secret abaixo';
    avatar.textContent='IG';$('#connectIg').classList.toggle('hidden',!igStatus?.configured);$('#disconnectIg').classList.add('hidden');$('#publishIg').disabled=true;
  }
}
async function saveMetaConfig(){
  const appId=escText($('#metaAppId').value),appSecret=escText($('#metaAppSecret').value);
  const btn=$('#saveMeta');btn.disabled=true;$('#igInline').textContent='Salvando configuração...';
  try{
    const r=await getCallable('creativeInstagramSaveConfig',{appId,appSecret});$('#metaAppSecret').value='';$('#igInline').textContent='Configuração salva. Agora conecte o Instagram.';$('#igInline').className='inlineStatus ok';toast('Configuração Meta salva.');await loadInstagramStatus();
  }catch(e){$('#igInline').textContent=e.message||'Falha ao salvar.';$('#igInline').className='inlineStatus err';}
  finally{btn.disabled=false;}
}
async function connectInstagram(){
  const btn=$('#connectIg');btn.disabled=true;
  try{const r=await getCallable('creativeInstagramConnectUrl');window.location.href=r.url;}
  catch(e){toast(e.message||'Não foi possível iniciar o login.','err');btn.disabled=false;}
}
async function disconnectInstagram(){
  if(!confirm('Desconectar a conta do Instagram do WDM Criativos?'))return;
  try{await getCallable('creativeInstagramDisconnect');toast('Instagram desconectado.');await loadInstagramStatus();}
  catch(e){toast(e.message||'Erro ao desconectar.','err');}
}
async function publishInstagram(){
  renderCanvas();
  if(!igStatus?.connected){toast('Conecte primeiro o Instagram.','err');return;}
  const btn=$('#publishIg');btn.disabled=true;btn.textContent='Publicando...';
  try{
    const up=await getCallable('creativeInstagramUpload',{dataUrl:currentDataUrl});
    const result=await getCallable('creativeInstagramPublish',{imageUrl:up.imageUrl,caption:$('#caption').value});
    toast('Publicado no Instagram @'+(result.username||igStatus.username)+' ✅');$('#publishResult').textContent='Publicado com sucesso · ID '+(result.mediaId||'confirmado');$('#publishResult').className='inlineStatus ok';
  }catch(e){$('#publishResult').textContent=e.message||'Falha ao publicar.';$('#publishResult').className='inlineStatus err';toast('Não foi possível publicar.','err');}
  finally{btn.disabled=false;btn.textContent='📸 Publicar no Instagram';}
}
function loadImage(file){
  if(!file)return;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{sourceImage=img;renderCanvas();toast('Foto carregada.');};img.src=reader.result;};reader.readAsDataURL(file);
}
function bind(){
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>setFormat(b.dataset.format));
  ['brand','headline','cta'].forEach(id=>$('#'+id).addEventListener('input',renderCanvas));
  $('#generate').onclick=generateCopy;$('#generateAI').onclick=generateWithSquadAI;$('#download').onclick=downloadCreative;$('#imageFile').onchange=e=>loadImage(e.target.files?.[0]);
  $('#clearImage').onclick=()=>{sourceImage=null;$('#imageFile').value='';renderCanvas();};
  $('#caption').addEventListener('input',()=>$('#captionPreview').textContent=$('#caption').value);
  $('#saveMeta').onclick=saveMetaConfig;$('#connectIg').onclick=connectInstagram;$('#disconnectIg').onclick=disconnectInstagram;$('#publishIg').onclick=publishInstagram;
  $('#copyCallback').onclick=async()=>{await navigator.clipboard.writeText($('#callbackUrl').value);toast('Callback copiado.');};
}
async function bootstrap(){
  await requireAuth();
  await window.WDM_FIREBASE_READY;
  await loadFirebaseScript('https://www.gstatic.com/firebasejs/12.11.0/firebase-functions-compat.js');
  functions=firebase.app().functions('us-central1');
  bind();generateCopy();await loadInstagramStatus();
  const q=new URLSearchParams(location.search);
  if(q.get('instagram')==='connected'){toast('Instagram conectado com sucesso!');history.replaceState({},'',location.pathname);}
  if(q.get('instagram')==='error'){toast('A Meta não concluiu a conexão. Confira a configuração.','err');history.replaceState({},'',location.pathname);}
}
bootstrap().catch(e=>{console.error(e);toast('Falha ao iniciar o WDM Criativos.','err');});
