const RAMOS = {
  servicos:{label:'Prestação de serviços',accent:'#1488ff',accent2:'#172554',emoji:'🛠️',tags:['#Serviços','#Profissional']},
  alimentacao:{label:'Alimentação / Restaurante / Pizzaria',accent:'#f97316',accent2:'#7c2d12',emoji:'🍕',tags:['#Gastronomia','#Delivery']},
  moda:{label:'Moda / Roupas / Calçados',accent:'#ec4899',accent2:'#701a75',emoji:'👗',tags:['#Moda','#Estilo']},
  beleza:{label:'Beleza / Salão / Barbearia',accent:'#d946ef',accent2:'#581c87',emoji:'✨',tags:['#Beleza','#Autoestima']},
  automotivo:{label:'Automotivo / Oficina / Auto Center',accent:'#ef4444',accent2:'#1f2937',emoji:'🚗',tags:['#Automotivo','#SeuCarro']},
  construcao:{label:'Construção / Gesso / Reformas',accent:'#f59e0b',accent2:'#3f3f46',emoji:'🏠',tags:['#Construção','#Reforma']},
  tecnologia:{label:'Informática / Tecnologia',accent:'#06b6d4',accent2:'#172554',emoji:'💻',tags:['#Tecnologia','#Informática']},
  saude:{label:'Saúde / Clínica / Odonto',accent:'#10b981',accent2:'#064e3b',emoji:'💚',tags:['#Saúde','#BemEstar']},
  educacao:{label:'Educação / Cursos / Escola',accent:'#3b82f6',accent2:'#312e81',emoji:'📚',tags:['#Educação','#Aprendizado']},
  imoveis:{label:'Imóveis / Corretor / Construtora',accent:'#eab308',accent2:'#422006',emoji:'🏡',tags:['#Imóveis','#SeuNovoLar']},
  pet:{label:'Pet Shop / Veterinária',accent:'#22c55e',accent2:'#14532d',emoji:'🐾',tags:['#Pet','#PetLovers']},
  fitness:{label:'Academia / Fitness',accent:'#84cc16',accent2:'#1a2e05',emoji:'💪',tags:['#Fitness','#Treino']},
  casa:{label:'Casa / Móveis / Decoração',accent:'#fb7185',accent2:'#4c1d2f',emoji:'🛋️',tags:['#Casa','#Decoração']},
  comercio:{label:'Loja / Comércio em geral',accent:'#8b5cf6',accent2:'#312e81',emoji:'🛍️',tags:['#Loja','#Ofertas']},
  eventos:{label:'Eventos / Festas / Fotografia',accent:'#a855f7',accent2:'#4c1d95',emoji:'🎉',tags:['#Eventos','#Momentos']},
  outro:{label:'Outro ramo',accent:'#1488ff',accent2:'#334155',emoji:'🚀',tags:['#Negócios','#Empreendedorismo']}
};

const FORMATS = {
  square:{w:1080,h:1080,label:'Quadrado'},
  feed:{w:1080,h:1350,label:'Feed'},
  story:{w:1080,h:1920,label:'Story'}
};

const SQUAD_CREATIVE_URL='https://wdmappsgithubio.wdmapps.deno.net/squad/creative';

let format='feed';
let sourceImage=null;
let sourceLogo=null;
let functions=null;
let igStatus=null;
let currentDataUrl='';
let whatsappVersion=0;
const $=(s)=>document.querySelector(s);

function toast(message,type='ok'){
  const old=$('.toast'); if(old) old.remove();
  const el=document.createElement('div'); el.className='toast '+type; el.textContent=message; document.body.appendChild(el);
  setTimeout(()=>el.remove(),3600);
}
function escText(v){return String(v||'').trim();}
function cleanTag(v){
  return escText(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'');
}
function companyName(){return escText($('#companyName').value)||'Sua empresa';}
function ramo(){
  const key=$('#businessType').value;
  if(key==='outro') return escText($('#customRamo').value)||'Negócio local';
  return RAMOS[key]?.label||'Negócio local';
}
function ramoProfile(){return RAMOS[$('#businessType').value]||RAMOS.outro;}
function offer(){return escText($('#offer').value);}
function locationText(){return escText($('#location').value);}
function contactText(){return escText($('#contact').value);}
function websiteText(){return escText($('#website').value);}
function purposeLabel(){
  const map={
    sale:'gerar vendas',
    lead:'conseguir novos orçamentos e contatos',
    service:'divulgar serviços',
    promo:'divulgar uma promoção',
    launch:'fazer um lançamento',
    engagement:'gerar engajamento',
    followers:'ganhar seguidores'
  };
  return map[$('#purpose').value]||'gerar vendas';
}
function defaultCta(){
  const p=$('#purpose').value;
  if(p==='lead') return 'Peça seu orçamento';
  if(p==='promo') return 'Aproveite agora';
  if(p==='launch') return 'Conheça a novidade';
  if(p==='followers') return 'Siga e acompanhe';
  if(p==='engagement') return 'Fale com a gente';
  return contactText()?'Chame no WhatsApp':'Saiba mais';
}
function hashtags(){
  const profile=ramoProfile();
  const extra=[companyName(),ramo(),locationText()].map(cleanTag).filter(x=>x.length>2).map(x=>'#'+x);
  return [...new Set([...(profile.tags||[]),'#WDMCriativo',...extra])].slice(0,8).join(' ');
}
function buildMarketingContext(){
  const parts=[
    'Empresa: '+companyName()+'.',
    'Ramo: '+ramo()+'.',
    offer()?'Produtos/serviços: '+offer()+'.':'',
    locationText()?'Região de atendimento: '+locationText()+'.':'',
    contactText()?'Contato/WhatsApp: '+contactText()+'.':'',
    websiteText()?'Site ou perfil: '+websiteText()+'.':'',
    'Objetivo: '+purposeLabel()+'.',
    'Tom: '+$('#tone').value+'.',
    escText($('#campaignTheme').value)?'Tema desejado: '+escText($('#campaignTheme').value)+'.':'Escolha uma ideia de campanha forte e adequada ao ramo.',
    'A campanha deve parecer específica para este negócio, com linguagem comercial natural e visual coerente com o segmento.'
  ];
  return parts.filter(Boolean).join(' ');
}

const QUICK_IDEAS = {
  servicos:['Seu problema merece uma solução profissional','Qualidade que você percebe no resultado','Atendimento que resolve de verdade'],
  alimentacao:['Hoje merece um sabor especial','Bateu a fome? A gente resolve','Seu próximo pedido começa aqui'],
  moda:['Seu próximo look está aqui','Vista sua melhor versão','Novidades que combinam com você'],
  beleza:['Seu momento de se cuidar chegou','Realce o que você tem de melhor','Beleza que faz você se sentir bem'],
  automotivo:['Não espere o carro te deixar na mão','Seu carro merece cuidado de verdade','Revisão hoje, tranquilidade amanhã'],
  construcao:['Transforme seu espaço com acabamento profissional','Sua obra merece um acabamento impecável','Renove sua casa do jeito certo'],
  tecnologia:['Tecnologia sem dor de cabeça','Seu computador pode render muito mais','Problema no PC? A solução está aqui'],
  saude:['Cuidar de você é prioridade','Seu bem-estar começa com cuidado','Mais saúde para viver melhor'],
  educacao:['Aprender hoje muda o amanhã','Invista em conhecimento','Seu próximo passo começa aprendendo'],
  imoveis:['O imóvel certo pode estar mais perto do que você imagina','Seu novo endereço começa aqui','Encontre um lugar para chamar de seu'],
  pet:['Seu melhor amigo merece o melhor cuidado','Carinho e cuidado para quem faz parte da família','Tudo para deixar seu pet feliz'],
  fitness:['Seu resultado começa com o primeiro passo','Treine por você','Mais energia para sua rotina'],
  casa:['Sua casa merece esse toque especial','Transforme ambientes, transforme sensações','Deixe seu espaço com a sua cara'],
  comercio:['Tem novidade esperando por você','Passe aqui e descubra','Uma boa oportunidade para comprar melhor'],
  eventos:['Seu momento merece ser inesquecível','Celebre do seu jeito','Transformamos ocasiões em memórias'],
  outro:['Sua empresa merece aparecer','Transforme atenção em oportunidade','Faça seu negócio ser lembrado']
};

const SURPRISE_THEMES = {
  servicos:['antes e depois do problema','benefício de contratar um profissional','chamada para orçamento sem compromisso','erro comum que o serviço resolve'],
  alimentacao:['produto mais desejado da semana','combo especial','fome no fim do dia','experiência de comer algo caprichado'],
  moda:['look da semana','nova coleção','combinação para uma ocasião especial','peça destaque da loja'],
  beleza:['transformação e autoestima','agenda da semana','serviço mais procurado','antes e depois de um cuidado especial'],
  automotivo:['revisão preventiva','viagem com segurança','sinais de que o carro precisa de manutenção','check-up do veículo'],
  construcao:['antes e depois de um ambiente','acabamento que valoriza a casa','orçamento para reforma','transformação de teto e paredes'],
  tecnologia:['computador lento','upgrade com SSD','manutenção preventiva','backup e segurança dos arquivos'],
  saude:['prevenção e cuidado','check-up','qualidade de vida','orientação profissional'],
  educacao:['matrículas','novo curso','aprendizado prático','evolução profissional'],
  imoveis:['oportunidade de imóvel','sonho da casa própria','imóvel em destaque','agendamento de visita'],
  pet:['banho e tosa','cuidado preventivo','dia de mimo para o pet','serviço em destaque'],
  fitness:['começar a treinar','meta da semana','consistência','aula ou plano em destaque'],
  casa:['ambiente renovado','produto que muda o espaço','conforto e decoração','novidade para casa'],
  comercio:['produto destaque','oferta da semana','novidade que chegou','motivo para visitar a loja'],
  eventos:['data especial','pacote para festas','registro de momentos','organização sem preocupação'],
  outro:['benefício principal do negócio','produto ou serviço mais procurado','prova de qualidade','chamada para contato']
};

function generateQuickCampaign(){
  const list=QUICK_IDEAS[$('#businessType').value]||QUICK_IDEAS.outro;
  let headline=list[Math.floor(Math.random()*list.length)];
  if($('#tone').value==='premium') headline='Excelência em cada detalhe';
  if($('#tone').value==='elegante') headline='Uma escolha que faz diferença';
  if($('#tone').value==='descontraido') headline=ramoProfile().emoji+' Tem coisa boa por aqui!';
  const cta=defaultCta();
  const details=offer()||'Soluções pensadas para atender você com qualidade e atenção.';
  const local=locationText()?'\n📍 '+locationText():'';
  const contact=contactText()?'\n📲 '+contactText():'';
  const site=websiteText()?'\n🌐 '+websiteText():'';
  $('#headline').value=headline;
  $('#cta').value=cta;
  $('#caption').value=(ramoProfile().emoji+' '+headline+'\n\n'+details+local+contact+site+'\n\n👉 '+cta+'\n\n'+hashtags()).trim();
  $('#captionPreview').textContent=$('#caption').value;
  generateWhatsApp();
  renderCanvas();
}

function generateWhatsApp(){
  whatsappVersion++;
  const name=companyName();
  const headline=escText($('#headline').value)||'Tem novidade por aqui!';
  const details=offer()||'Atendimento profissional, qualidade e atenção em cada detalhe.';
  const cta=escText($('#cta').value)||defaultCta();
  const loc=locationText();
  const contact=contactText();
  const site=websiteText();
  const emoji=ramoProfile().emoji;

  const versions=[
    [
      emoji+' *'+headline+'*',
      '',
      details,
      '',
      loc?'📍 '+loc:'',
      contact?'📲 '+contact:'',
      site?'🌐 '+site:'',
      '',
      '👉 *'+cta+'*',
      '',
      '✨ *'+name+'*'
    ],
    [
      '🔥 *ATENÇÃO, '+name.toUpperCase()+' TEM NOVIDADE!*',
      '',
      emoji+' '+headline,
      '',
      '✅ '+details,
      loc?'📍 Atendimento em '+loc:'',
      '',
      '💬 Quer saber mais?',
      contact?'📲 Chame agora: '+contact:'👉 '+cta,
      site?'🌐 '+site:''
    ],
    [
      emoji+' *'+name+'*',
      '',
      '💡 '+headline,
      '',
      details,
      '',
      '✅ Qualidade',
      '✅ Atendimento',
      '✅ Solução pensada para você',
      loc?'📍 '+loc:'',
      contact?'📲 Fale conosco: '+contact:'',
      '',
      '👉 *'+cta+'*'
    ]
  ];
  const text=versions[(whatsappVersion-1)%versions.length].filter(Boolean).join('\n');
  $('#whatsappCopy').value=text;
}

function surpriseMe(){
  const themes=SURPRISE_THEMES[$('#businessType').value]||SURPRISE_THEMES.outro;
  const picked=themes[Math.floor(Math.random()*themes.length)];
  $('#campaignTheme').value=picked;
  toast('Tema escolhido: '+picked+' 🎲');
  generateWithSquadAI(true);
}

async function generateWithSquadAI(fromSurprise=false){
  if(!escText($('#companyName').value)){
    toast('Informe o nome da empresa para a IA criar algo realmente personalizado.','err');
    $('#companyName').focus();
    return;
  }
  const btn=$('#generateAI');
  const surpriseBtn=$('#surpriseAI');
  const status=$('#aiStatus');
  btn.disabled=true; surpriseBtn.disabled=true;
  btn.textContent='🧠 Agente pensando...';
  status.textContent=fromSurprise?'A IA escolheu o tema e agora está montando a campanha...':'Copy pensando a mensagem e Studio criando a imagem para este ramo...';
  status.className='inlineStatus';

  try{
    const user=await firebaseUser();
    if(!user) throw new Error('Sua sessão expirou. Entre novamente no painel.');
    const idToken=await user.getIdToken(true);
    const response=await fetch(SQUAD_CREATIVE_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
      body:JSON.stringify({
        brandName:companyName(),
        businessType:ramo(),
        site:websiteText(),
        location:locationText(),
        contact:contactText(),
        offer:offer(),
        brief:buildMarketingContext(),
        purpose:$('#purpose').value,
        tone:$('#tone').value,
        format
      })
    });

    let data={}; try{data=await response.json()}catch(_){}
    if(!response.ok||data.ok===false) throw new Error(data.error||('Squad respondeu '+response.status));

    $('#headline').value=escText(data.headline)||$('#headline').value||QUICK_IDEAS[$('#businessType').value][0];
    $('#cta').value=escText(data.cta)||defaultCta();

    let caption=escText(data.caption);
    if(!caption){
      caption=ramoProfile().emoji+' '+$('#headline').value+'\n\n'+(offer()||'Conheça nossas soluções.')+'\n\n👉 '+$('#cta').value;
    }
    const aiTags=Array.isArray(data.hashtags)?data.hashtags.filter(Boolean).join(' '):hashtags();
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

    generateWhatsApp();
    renderCanvas();

    const models=[data.textModel,data.imageModel].filter(Boolean).join(' + ');
    status.textContent='✅ Campanha pronta'+(models?' · '+models:'')+(data.visualDirection?' · '+data.visualDirection:'');
    status.className='inlineStatus ok';
    toast('Campanha completa criada! 🧠✨');
  }catch(e){
    console.error('WDM Marketing Agent:',e);
    status.textContent=e?.message||'Não foi possível gerar a campanha.';
    status.className='inlineStatus err';
    toast('O agente não conseguiu gerar agora.','err');
  }finally{
    btn.disabled=false; surpriseBtn.disabled=false;
    btn.textContent='🧠 Criar campanha completa';
  }
}

function hexToRgb(hex){
  const v=hex.replace('#','');
  return {r:parseInt(v.slice(0,2),16),g:parseInt(v.slice(2,4),16),b:parseInt(v.slice(4,6),16)};
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
    if(ctx.measureText(test).width>maxWidth && line){
      lines.push(line); line=word;
      if(lines.length===maxLines-1) break;
    }else line=test;
  }
  if(line && lines.length<maxLines) lines.push(line);
  return lines;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
}
function drawLogo(ctx,f,pad){
  if(!sourceLogo) return false;
  const maxW=Math.min(250,f.w*.28), maxH=100;
  const ratio=Math.min(maxW/sourceLogo.width,maxH/sourceLogo.height);
  const w=sourceLogo.width*ratio, h=sourceLogo.height*ratio;
  ctx.fillStyle='rgba(255,255,255,.92)';
  roundRect(ctx,pad,pad,w+36,h+28,22);
  ctx.drawImage(sourceLogo,pad+18,pad+14,w,h);
  return true;
}
function renderCanvas(){
  const canvas=$('#creativeCanvas'), ctx=canvas.getContext('2d');
  const f=FORMATS[format], profile=ramoProfile();
  canvas.width=f.w; canvas.height=f.h;

  const g=ctx.createLinearGradient(0,0,f.w,f.h);
  g.addColorStop(0,profile.accent2); g.addColorStop(1,profile.accent);
  ctx.fillStyle=g; ctx.fillRect(0,0,f.w,f.h);

  if(sourceImage){
    drawCover(ctx,sourceImage,f.w,f.h);
    const shade=ctx.createLinearGradient(0,0,0,f.h);
    shade.addColorStop(0,'rgba(2,9,19,.12)');
    shade.addColorStop(.45,'rgba(2,9,19,.30)');
    shade.addColorStop(1,'rgba(2,9,19,.94)');
    ctx.fillStyle=shade; ctx.fillRect(0,0,f.w,f.h);
  }else{
    ctx.globalAlpha=.16;
    for(let i=0;i<9;i++){
      ctx.beginPath();
      ctx.arc(f.w*(.12+i*.13),f.h*(.14+i*.085),74+i*18,0,Math.PI*2);
      ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.stroke();
    }
    ctx.globalAlpha=1;
  }

  const pad=Math.round(f.w*.075), bottom=Math.round(f.h*.105);
  if(!drawLogo(ctx,f,pad)){
    ctx.fillStyle='rgba(4,13,26,.68)';
    roundRect(ctx,pad,pad,Math.min(500,f.w-pad*2),74,24);
    ctx.fillStyle='#fff'; ctx.font='800 30px Inter, Arial';
    ctx.fillText(companyName(),pad+28,pad+48);
  }

  let fontSize=format==='story'?72:64;
  const maxWidth=f.w-pad*2;
  ctx.font='800 '+fontSize+'px Inter, Arial';
  let lines=wrapLines(ctx,$('#headline').value||'Sua empresa merece aparecer',maxWidth,4);
  while(lines.some(l=>ctx.measureText(l).width>maxWidth) && fontSize>42){
    fontSize-=3; ctx.font='800 '+fontSize+'px Inter, Arial';
    lines=wrapLines(ctx,$('#headline').value||'Sua empresa merece aparecer',maxWidth,4);
  }

  const lineHeight=fontSize*1.08, textH=lines.length*lineHeight;
  let y=f.h-bottom-165-textH;
  ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,.52)'; ctx.shadowBlur=24;
  lines.forEach((line,i)=>ctx.fillText(line,pad,y+i*lineHeight));
  ctx.shadowBlur=0;

  const cta=escText($('#cta').value)||defaultCta();
  ctx.font='800 27px Inter, Arial';
  const ctaW=Math.min(maxWidth,ctx.measureText(cta).width+60);
  ctx.fillStyle=profile.accent; roundRect(ctx,pad,f.h-bottom-100,ctaW,68,22);
  ctx.fillStyle='#fff'; ctx.fillText(cta,pad+30,f.h-bottom-56);

  const footer=websiteText()||locationText()||ramo();
  ctx.font='600 23px Inter, Arial'; ctx.fillStyle='rgba(255,255,255,.86)';
  ctx.fillText(footer.slice(0,72),pad,f.h-bottom+4);

  currentDataUrl=canvas.toDataURL('image/jpeg',.92);
}

function setFormat(next){
  format=next;
  document.querySelectorAll('[data-format]').forEach(b=>b.classList.toggle('active',b.dataset.format===next));
  renderCanvas();
}
function downloadCreative(){
  renderCanvas();
  const a=document.createElement('a');
  a.href=currentDataUrl;
  a.download=(cleanTag(companyName())||'wdm')+'-criativo-'+format+'.jpg';
  a.click();
}
function loadImage(file,target){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      if(target==='logo') sourceLogo=img; else sourceImage=img;
      renderCanvas();
      toast(target==='logo'?'Logo carregada.':'Foto carregada.');
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
}

async function getCallable(name,data={}){
  if(!functions) throw new Error('Serviço ainda não carregado.');
  return (await functions.httpsCallable(name)(data)).data;
}
async function loadInstagramStatus(){
  try{
    igStatus=await getCallable('creativeInstagramStatus'); renderIgStatus();
  }catch(error){
    $('#igInline').textContent='Backend do Instagram ainda não foi publicado no Firebase.';
    $('#igInline').className='inlineStatus err';
  }
}
function renderIgStatus(){
  const box=$('#igStatusBox'), avatar=$('#igAvatar'), title=$('#igTitle'), sub=$('#igSub');
  $('#metaAppId').value=igStatus?.appId||'';
  $('#callbackUrl').value=igStatus?.callbackUrl||'';
  if(igStatus?.connected){
    box.classList.add('connected');
    title.textContent='@'+(igStatus.username||'instagram');
    sub.textContent=(igStatus.accountType||'Conta profissional')+' · conectado';
    avatar.innerHTML=igStatus.profilePictureUrl?'<img alt="" src="'+igStatus.profilePictureUrl+'">':'IG';
    $('#connectIg').classList.add('hidden'); $('#disconnectIg').classList.remove('hidden'); $('#publishIg').disabled=false;
  }else{
    title.textContent=igStatus?.configured?'Instagram configurado':'Instagram ainda não configurado';
    sub.textContent=igStatus?.configured?'Pronto para conectar a conta profissional':'Informe App ID e App Secret abaixo';
    avatar.textContent='IG';
    $('#connectIg').classList.toggle('hidden',!igStatus?.configured);
    $('#disconnectIg').classList.add('hidden');
    $('#publishIg').disabled=true;
  }
}
async function saveMetaConfig(){
  const appId=escText($('#metaAppId').value),appSecret=escText($('#metaAppSecret').value);
  const btn=$('#saveMeta'); btn.disabled=true; $('#igInline').textContent='Salvando configuração...';
  try{
    await getCallable('creativeInstagramSaveConfig',{appId,appSecret});
    $('#metaAppSecret').value='';
    $('#igInline').textContent='Configuração salva. Agora conecte o Instagram.';
    $('#igInline').className='inlineStatus ok';
    toast('Configuração Meta salva.');
    await loadInstagramStatus();
  }catch(e){
    $('#igInline').textContent=e.message||'Falha ao salvar.';
    $('#igInline').className='inlineStatus err';
  }finally{btn.disabled=false;}
}
async function connectInstagram(){
  const btn=$('#connectIg'); btn.disabled=true;
  try{
    const r=await getCallable('creativeInstagramConnectUrl');
    window.location.href=r.url;
  }catch(e){
    toast(e.message||'Não foi possível iniciar o login.','err'); btn.disabled=false;
  }
}
async function disconnectInstagram(){
  if(!confirm('Desconectar a conta do Instagram do WDM Criativo?')) return;
  try{
    await getCallable('creativeInstagramDisconnect');
    toast('Instagram desconectado.');
    await loadInstagramStatus();
  }catch(e){toast(e.message||'Erro ao desconectar.','err');}
}
async function publishInstagram(){
  renderCanvas();
  if(!igStatus?.connected){toast('Conecte primeiro o Instagram.','err');return;}
  const btn=$('#publishIg'); btn.disabled=true; btn.textContent='Publicando...';
  try{
    const up=await getCallable('creativeInstagramUpload',{dataUrl:currentDataUrl});
    const result=await getCallable('creativeInstagramPublish',{imageUrl:up.imageUrl,caption:$('#caption').value});
    toast('Publicado no Instagram @'+(result.username||igStatus.username)+' ✅');
    $('#publishResult').textContent='Publicado com sucesso · ID '+(result.mediaId||'confirmado');
    $('#publishResult').className='inlineStatus ok';
  }catch(e){
    $('#publishResult').textContent=e.message||'Falha ao publicar.';
    $('#publishResult').className='inlineStatus err';
    toast('Não foi possível publicar.','err');
  }finally{
    btn.disabled=false; btn.textContent='📸 Publicar no Instagram';
  }
}

function bind(){
  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>setFormat(b.dataset.format));
  ['companyName','customRamo','location','website','headline','cta'].forEach(id=>{
    $('#'+id).addEventListener('input',renderCanvas);
  });

  $('#businessType').onchange=()=>{
    $('#customRamoField').classList.toggle('hidden',$('#businessType').value!=='outro');
    generateQuickCampaign();
  };
  $('#purpose').onchange=()=>{$('#cta').value=defaultCta();generateWhatsApp();renderCanvas();};
  $('#tone').onchange=()=>generateQuickCampaign();

  $('#generate').onclick=generateQuickCampaign;
  $('#generateAI').onclick=()=>generateWithSquadAI(false);
  $('#surpriseAI').onclick=surpriseMe;
  $('#download').onclick=downloadCreative;

  $('#imageFile').onchange=e=>loadImage(e.target.files?.[0],'image');
  $('#logoFile').onchange=e=>loadImage(e.target.files?.[0],'logo');
  $('#clearImage').onclick=()=>{sourceImage=null;$('#imageFile').value='';renderCanvas();};
  $('#clearLogo').onclick=()=>{sourceLogo=null;$('#logoFile').value='';renderCanvas();};

  $('#caption').addEventListener('input',()=>$('#captionPreview').textContent=$('#caption').value);
  $('#regenWhatsapp').onclick=generateWhatsApp;
  $('#copyWhatsapp').onclick=async()=>{
    const value=$('#whatsappCopy').value;
    if(!value){generateWhatsApp();}
    await navigator.clipboard.writeText($('#whatsappCopy').value);
    toast('Texto do WhatsApp copiado! 💬');
  };

  $('#saveMeta').onclick=saveMetaConfig;
  $('#connectIg').onclick=connectInstagram;
  $('#disconnectIg').onclick=disconnectInstagram;
  $('#publishIg').onclick=publishInstagram;
  $('#copyCallback').onclick=async()=>{
    await navigator.clipboard.writeText($('#callbackUrl').value);
    toast('Callback copiado.');
  };
}

async function bootstrap(){
  await requireAuth();
  await window.WDM_FIREBASE_READY;
  await loadFirebaseScript('https://www.gstatic.com/firebasejs/12.11.0/firebase-functions-compat.js');
  functions=firebase.app().functions('us-central1');
  bind();
  generateQuickCampaign();
  await loadInstagramStatus();

  const q=new URLSearchParams(location.search);
  if(q.get('instagram')==='connected'){
    toast('Instagram conectado com sucesso!');
    history.replaceState({},'',location.pathname);
  }
  if(q.get('instagram')==='error'){
    toast('A Meta não concluiu a conexão. Confira a configuração.','err');
    history.replaceState({},'',location.pathname);
  }
}
bootstrap().catch(e=>{
  console.error(e);
  toast('Falha ao iniciar o WDM Criativo.','err');
});
