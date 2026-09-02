import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';

const OWNER='cNUIxdJzXIaut7VnoGBx9EAzgRM2';
const fb=initializeApp(firebaseConfig);
const auth=getAuth(fb);
const functions=getFunctions(fb);
const listAccounts=httpsCallable(functions,'adminListAccounts');
const setFree=httpsCallable(functions,'adminSetFreeAccess');
const body=document.getElementById('accountsBody');
const notice=document.getElementById('notice');
const refreshBtn=document.getElementById('refreshBtn');
let accounts=[];

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function plan(a){
  const s=a.subscription||{};
  if(s.freePartner)return '<span class="pill free">🎁 Parceiro FREE</span>';
  if(s.provider==='stripe'&&s.entitled)return '<span class="pill paid">💳 Pago ativo</span>';
  if(s.provider==='trial'&&s.entitled)return '<span class="pill paid">Teste grátis</span>';
  return s.entitled?`<span class="pill paid">${esc(s.provider||'Liberado')}</span>`:'<span class="pill blocked">Sem acesso</span>';
}

function state(a){
  if(a.adminSuspended)return '<span class="pill blocked">Suspensa</span>';
  if(a.pendingOnboarding)return '<span class="pill paid">Cadastro pendente</span>';
  return a.published?'<span class="pill free">Publicada</span>':'<span class="pill blocked">Oculta</span>';
}

function render(){
  document.getElementById('countAll').textContent=accounts.length;
  document.getElementById('countFree').textContent=accounts.filter(a=>a.subscription?.freePartner).length;
  document.getElementById('countPaid').textContent=accounts.filter(a=>a.subscription?.provider==='stripe'&&a.subscription?.entitled).length;
  if(!accounts.length){body.innerHTML='<tr><td colspan="5">Nenhuma conta cadastrada.</td></tr>';return}
  body.innerHTML=accounts.map(a=>{
    const s=a.subscription||{};
    const free=s.freePartner===true;
    const paid=s.provider==='stripe'&&s.entitled===true;
    return `<tr data-uid="${esc(a.uid)}"><td><strong>${esc(a.name||'Conta sem nome')}</strong><div class="small">${esc(a.email||a.uid)}</div></td><td>${esc(a.category||'Sem categoria')}</td><td>${state(a)}</td><td>${plan(a)}</td><td><button class="action ${free?'remove':''}" data-action="${free?'remove':'grant'}" ${paid?'disabled':''}>${free?'Remover FREE':'🎁 Deixar FREE'}</button><div class="small">${paid?'Stripe ativa':''}</div></td></tr>`;
  }).join('');
  body.querySelectorAll('.action:not(:disabled)').forEach(btn=>btn.onclick=()=>toggle(btn));
}

async function load(){
  refreshBtn.disabled=true;
  notice.textContent='Carregando contas cadastradas...';
  try{
    const r=await listAccounts();
    accounts=Array.isArray(r?.data?.accounts)?r.data.accounts:[];
    render();
    notice.textContent='Escolha a conta e clique em “Deixar FREE”. O acesso permanece grátis até você remover manualmente.';
  }catch(e){
    console.error(e);
    notice.textContent='As funções FREE ainda não foram publicadas no Firebase. O Shopping principal continua funcionando normalmente.';
    body.innerHTML='<tr><td colspan="5">Painel FREE ainda indisponível.</td></tr>';
  }finally{refreshBtn.disabled=false}
}

async function toggle(btn){
  const row=btn.closest('[data-uid]');
  const uid=row?.dataset.uid;
  const a=accounts.find(x=>x.uid===uid);
  if(!uid||!a)return;
  const enabling=btn.dataset.action==='grant';
  const text=enabling?`Deixar “${a.name}” como Parceiro FREE?`:`Remover o acesso FREE de “${a.name}”?`;
  if(!confirm(text))return;
  btn.disabled=true;
  try{
    await setFree({targetUid:uid,enabled:enabling});
    await load();
  }catch(e){
    alert(e?.message||'Não foi possível concluir.');
    btn.disabled=false;
  }
}

refreshBtn.onclick=load;
onAuthStateChanged(auth,user=>{
  if(!user){location.href='./#login';return}
  if(user.uid!==OWNER){location.href='./#painel';return}
  load();
});
