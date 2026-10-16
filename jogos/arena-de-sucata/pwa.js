(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const button=$('install'), modal=$('installScreen'), installNow=$('installNow');
  const android=/Android/i.test(navigator.userAgent);
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const embedded=/FBAN|FBAV|Instagram|WhatsApp|\bwv\b|Line\/|GSA\//i.test(navigator.userAgent);
  const samsung=/SamsungBrowser/i.test(navigator.userAgent);
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let installPrompt=null, offlineReady=false, registration=null, prompting=false;
  const gameURL=new URL('./',location.href);gameURL.search='';gameURL.hash='';
  const message=text=>{$('installMessage').textContent=text;};
  function offlineStatus(){
    $('offlineStatus').textContent=offlineReady?'MODO OFFLINE PRONTO. O jogo já está armazenado neste dispositivo.':'O primeiro carregamento precisa de internet para preparar o modo offline.';
  }
  function readyUI(){
    installNow.classList.toggle('hidden',!installPrompt);
    $('installHint').textContent=installPrompt?'PRONTO PARA INSTALAR':'JOGUE TAMBÉM OFFLINE';
    if(installPrompt&&!modal.classList.contains('hidden'))message('Agora está pronto. Toque em “Instalar agora” e confirme a instalação na janela do navegador.');
  }
  function showGuide(text){
    $('installBrowser').textContent=ios?'IPHONE / IPAD':android?'ANDROID':'NAVEGADOR';
    const steps=ios
      ? ['Abra este endereço no Safari.','Toque em Compartilhar e depois em “Adicionar à Tela de Início”.','Mantenha “Abrir como App da Web” ativado, se aparecer, e toque em “Adicionar”.']
      : samsung
        ? ['Abra o menu ☰ do Samsung Internet.','Toque em “Adicionar página a” e escolha “Tela inicial” ou “Aplicativos”.','Confirme a adição no seu celular.']
        : ['Abra o jogo diretamente no Chrome, fora do WhatsApp ou Instagram.','No menu ⋮ do Chrome, toque em “Adicionar à tela inicial” ou “Instalar aplicativo”.','Se aparecer uma escolha, selecione “Instalar” e confirme.'];
    $('installSteps').replaceChildren(...steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
    $('installInstructions').textContent=ios?'No iPhone a instalação é feita pelo menu de compartilhamento.':embedded?'Você está em um navegador dentro de outro aplicativo. Abra no Chrome para ter acesso à instalação.':'Se o botão de instalação ainda não estiver disponível, use o menu do navegador. No Chrome, a oferta pode aparecer após uma interação e cerca de 30 segundos nesta página.';
    if(location.protocol==='file:')$('installInstructions').textContent='Abra o endereço HTTPS publicado do jogo. Não é possível instalar a partir de um arquivo local.';
    const chrome=$('openChrome');chrome.classList.toggle('hidden',!android);
    chrome.href=`intent://${gameURL.host}${gameURL.pathname}#Intent;scheme=${gameURL.protocol.slice(0,-1)};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(gameURL.href)};end`;
    $('installDirectLink').href=gameURL.href;$('installDirectLink').textContent=gameURL.host+gameURL.pathname;
    offlineStatus();modal.classList.remove('hidden');readyUI();
    if(text)message(text);else if(!installPrompt)message('A janela de instalação ainda não foi liberada pelo navegador. As opções abaixo permitem continuar.');
    (installPrompt?installNow:$('closeInstall')).focus();
  }
  async function requestInstall(){
    if(prompting)return;
    if(!installPrompt){showGuide();return;}
    const prompt=installPrompt;installPrompt=null;prompting=true;
    try{
      // prompt() must stay in the tap handler, before any asynchronous cache work.
      const pending=prompt.prompt();await pending;const choice=await prompt.userChoice;
      if(choice.outcome==='accepted')showGuide('Solicitação enviada ao Android. Aguarde o navegador concluir e procure o ícone Arena de Sucata na sua lista de aplicativos.');
      else showGuide('A instalação foi cancelada. Você ainda pode instalar pelo menu ⋮ do navegador.');
    }catch{showGuide('O navegador não abriu a janela. Use o menu ⋮ e escolha “Adicionar à tela inicial” → “Instalar”.');}
    finally{prompting=false;readyUI();}
  }
  if(standalone())button.classList.add('hidden');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;readyUI();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;button.classList.add('hidden');installNow.classList.add('hidden');message('Instalação concluída. Abra Arena de Sucata pelo ícone do aplicativo.');});
  button.addEventListener('click',requestInstall);installNow.addEventListener('click',requestInstall);
  $('checkInstall').addEventListener('click',()=>{
    if(installPrompt){requestInstall();return;}
    showGuide('O navegador ainda não disponibilizou a janela. No Chrome, use ⋮ → Adicionar à tela inicial → Instalar. Se estiver dentro de outro app, toque em “Abrir no Chrome”.');
    if(registration)registration.update().catch(()=>{});
  });
  function close(){modal.classList.add('hidden');button.focus();}
  $('closeInstall').addEventListener('click',close);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.classList.contains('hidden'))close();});
  if('serviceWorker'in navigator&&location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js?v=1.4.0',{updateViaCache:'none'}).then(reg=>{registration=reg;return navigator.serviceWorker.ready;}).then(()=>{offlineReady=true;offlineStatus();}).catch(()=>{$('offlineStatus').textContent='Não foi possível preparar o modo offline. A instalação e o jogo online continuam disponíveis conforme o navegador.';});
  }
})();
