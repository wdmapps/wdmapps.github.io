// Impede correção retroativa durante os exercícios de digitação.
function isEditableField(el){
  if(!el)return false;
  if(el.matches?.('input, textarea, select'))return true;
  return !!el.isContentEditable;
}

function lessonIsActive(){
  const app=document.getElementById('app');
  const finish=document.getElementById('finishCard');
  const typing=document.getElementById('typingPanel');
  const game=document.getElementById('gamePanel');
  if(!app||app.classList.contains('hidden'))return false;
  if(finish&&!finish.classList.contains('hidden'))return false;
  const typingActive=typing&&!typing.classList.contains('hidden');
  const gameActive=game&&!game.classList.contains('hidden');
  return typingActive||gameActive;
}

function blockBackspace(e){
  if(e.key!=='Backspace'&&e.code!=='Backspace')return;
  if(isEditableField(e.target))return;
  if(!lessonIsActive())return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

document.addEventListener('keydown',blockBackspace,true);
