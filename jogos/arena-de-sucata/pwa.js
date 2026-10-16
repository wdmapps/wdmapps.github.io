(() => {
  const button=document.getElementById('install'),modal=document.getElementById('installScreen');
  let installPrompt=null,offlineReady=false;
  const standalone=()=>matchMedia('(display-mode: standalone)').matches || navigator.standalone===true;
  function installed(){button.classList.add('hidden');}
  if(standalone())installed();
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installed();});
  button.addEventListener('click',async()=>{
    if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')installed();return;}catch{}}
    const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    document.getElementById('installInstructions').textContent=ios
      ? 'No Safari, toque em Compartilhar, escolha “Adicionar à Tela de Início” e confirme em “Adicionar”. Se aparecer a opção “Abrir como App da Web”, deixe ativada.'
      : 'Abra o menu do navegador (⋮ ou ⋯) e procure “Instalar aplicativo”, “Instalar Arena de Sucata” ou “Adicionar à tela inicial”. Se a opção ainda não aparecer, aguarde o carregamento e tente novamente. Use o endereço do jogo diretamente, fora de um iframe.';
    if(location.protocol==='file:')document.getElementById('installInstructions').textContent='Para instalar, abra o jogo por um endereço HTTPS no navegador. A instalação não está disponível ao abrir o arquivo diretamente no computador.';
    document.getElementById('offlineStatus').textContent=offlineReady?'MODO OFFLINE PRONTO. Os arquivos do jogo já estão armazenados neste dispositivo.':'Mantenha a internet conectada no primeiro carregamento para preparar o modo offline.';
    modal.classList.remove('hidden');document.getElementById('closeInstall').focus();
  });
  document.getElementById('closeInstall').addEventListener('click',()=>{modal.classList.add('hidden');button.focus();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden')){modal.classList.add('hidden');button.focus();}});
  if('serviceWorker'in navigator&&location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{
      offlineReady=true;document.getElementById('offlineStatus').textContent='MODO OFFLINE PRONTO. Os arquivos do jogo já estão armazenados neste dispositivo.';
    }).catch(()=>{document.getElementById('offlineStatus').textContent='O modo offline não pôde ser preparado. Você pode continuar jogando com internet.';});
  }
})();
