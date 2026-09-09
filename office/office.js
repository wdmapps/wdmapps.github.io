(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const shell = $('#officeShell');
  const docsWorkspace = $('#docsWorkspace');
  const sheetWorkspace = $('#sheetWorkspace');
  const docsToolbar = $('#docsToolbar');
  const sheetToolbar = $('#sheetToolbar');
  const docEditor = $('#docEditor');
  const fileName = $('#fileName');
  const fileInput = $('#fileInput');
  const saveState = $('#saveState');
  const toast = $('#toast');
  const formulaInput = $('#formulaInput');
  const cellName = $('#cellName');
  const sheetInfo = $('#sheetInfo');
  const table = $('#sheetTable');

  let activeApp = 'docs';
  let selectedCell = 'A1';
  let rows = 30;
  let cols = 12;
  const cells = new Map();
  let saveTimer;

  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const setDirty = () => {
    saveState.textContent = 'Alterações não salvas';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 900);
  };

  const storageKey = (app) => `wdm-office-${app}-v1`;

  function switchApp(app, updateUrl = true) {
    activeApp = app === 'sheets' ? 'sheets' : 'docs';
    shell.dataset.app = activeApp;
    docsWorkspace.classList.toggle('hidden', activeApp !== 'docs');
    docsToolbar.classList.toggle('hidden', activeApp !== 'docs');
    sheetWorkspace.classList.toggle('hidden', activeApp !== 'sheets');
    sheetToolbar.classList.toggle('hidden', activeApp !== 'sheets');
    $$('.app-tab').forEach(b => b.classList.toggle('active', b.dataset.switch === activeApp));
    $('#appSubtitle').textContent = activeApp === 'docs' ? 'Docs' : 'Planilhas';
    fileName.value = activeApp === 'docs' ? (localStorage.getItem(storageKey('docs') + '-name') || 'Documento sem título') : (localStorage.getItem(storageKey('sheets') + '-name') || 'Planilha sem título');
    fileInput.accept = activeApp === 'docs' ? '.txt,.html,.htm,.doc,.docx' : '.csv,.xlsx,.xls';
    if (updateUrl) history.replaceState(null, '', `?app=${activeApp}`);
    loadLocal();
  }

  $$('.app-tab').forEach(b => b.addEventListener('click', () => switchApp(b.dataset.switch)));

  $$('#docsToolbar [data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      docEditor.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      setDirty();
    });
  });
  $('#fontName').addEventListener('change', e => {
    docEditor.focus();
    document.execCommand('fontName', false, e.target.value);
    setDirty();
  });
  $('#fontSize').addEventListener('change', e => {
    docEditor.focus();
    document.execCommand('fontSize', false, e.target.value);
    setDirty();
  });
  $('#foreColor').addEventListener('input', e => {
    docEditor.focus();
    document.execCommand('foreColor', false, e.target.value);
    setDirty();
  });
  $('#linkBtn').addEventListener('click', () => {
    const url = prompt('Cole o endereço do link:');
    if (!url) return;
    docEditor.focus();
    document.execCommand('createLink', false, url);
    setDirty();
  });
  docEditor.addEventListener('input', () => {
    updateWordCount();
    setDirty();
  });

  function updateWordCount() {
    const text = docEditor.innerText.trim();
    const count = text ? text.split(/\s+/).length : 0;
    $('#wordCount').textContent = `${count} ${count === 1 ? 'palavra' : 'palavras'}`;
  }

  function exportDoc() {
    const title = safeName(fileName.value || 'documento');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileName.value)}</title><style>body{font-family:Arial,sans-serif;line-height:1.55;margin:2.5cm}</style></head><body>${docEditor.innerHTML}</body></html>`;
    downloadBlob(new Blob(['\ufeff', html], {type:'application/msword'}), `${title}.doc`);
    showToast('Documento baixado em formato Word (.doc)');
  }

  async function importDoc(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    fileName.value = file.name.replace(/\.[^.]+$/, '');
    if (ext === 'docx' && window.mammoth) {
      const result = await window.mammoth.convertToHtml({arrayBuffer: await file.arrayBuffer()});
      docEditor.innerHTML = result.value || '<p></p>';
    } else {
      const text = await file.text();
      if (['html','htm','doc'].includes(ext) && /<[^>]+>/.test(text)) {
        const parsed = new DOMParser().parseFromString(text, 'text/html');
        docEditor.innerHTML = parsed.body.innerHTML;
      } else {
        docEditor.textContent = text;
      }
    }
    updateWordCount();
    saveLocal();
    showToast('Documento aberto');
  }

  const colLabel = (n) => {
    let s = '';
    while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
    return s;
  };

  function buildSheet() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner';
    hr.appendChild(corner);
    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.className = 'col-head';
      th.textContent = colLabel(c);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let r = 1; r <= rows; r++) {
      const tr = document.createElement('tr');
      const rh = document.createElement('th');
      rh.className = 'row-head';
      rh.textContent = r;
      tr.appendChild(rh);
      for (let c = 0; c < cols; c++) {
        const addr = `${colLabel(c)}${r}`;
        const td = document.createElement('td');
        td.dataset.cell = addr;
        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.cell = addr;
        input.value = displayValue(addr);
        td.classList.toggle('formula', String(cells.get(addr) || '').startsWith('='));
        input.addEventListener('focus', () => selectCell(addr));
        input.addEventListener('input', () => {
          cells.set(addr, input.value);
          formulaInput.value = input.value;
          setDirty();
        });
        input.addEventListener('blur', () => {
          cells.set(addr, input.value);
          recalcSheet();
        });
        input.addEventListener('keydown', e => handleCellKeys(e, addr));
        td.appendChild(input);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    selectCell(selectedCell, false);
    recalcSheet();
  }

  function addrParts(addr) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!m) return null;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
    return {col: col - 1, row: +m[2]};
  }

  function selectCell(addr, focus = false) {
    selectedCell = addr;
    $$('.sheet-table td.selected').forEach(td => td.classList.remove('selected'));
    const td = table.querySelector(`td[data-cell="${addr}"]`);
    if (!td) return;
    td.classList.add('selected');
    cellName.textContent = addr;
    formulaInput.value = cells.get(addr) ?? td.querySelector('input').value;
    sheetInfo.textContent = `Célula ${addr}`;
    if (focus) td.querySelector('input').focus();
  }

  function handleCellKeys(e, addr) {
    const p = addrParts(addr);
    if (!p) return;
    let next;
    if (e.key === 'Enter') next = `${colLabel(p.col)}${Math.min(rows, p.row + 1)}`;
    else if (e.key === 'Tab') next = `${colLabel(Math.max(0,Math.min(cols - 1, p.col + (e.shiftKey ? -1 : 1))))}${p.row}`;
    else return;
    e.preventDefault();
    selectCell(next, true);
  }

  formulaInput.addEventListener('input', () => {
    cells.set(selectedCell, formulaInput.value);
    const input = table.querySelector(`input[data-cell="${selectedCell}"]`);
    if (input) input.value = formulaInput.value;
    setDirty();
  });
  formulaInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      cells.set(selectedCell, formulaInput.value);
      recalcSheet();
      selectCell(selectedCell, true);
    }
  });

  function cellRaw(addr) { return String(cells.get(addr) ?? ''); }
  function numericCell(addr, seen = new Set()) {
    const raw = cellRaw(addr);
    if (!raw.startsWith('=')) {
      const n = Number(String(raw).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    }
    return evaluateFormula(raw, new Set([...seen, addr]));
  }

  function rangeValues(a, b, seen) {
    const p1 = addrParts(a), p2 = addrParts(b);
    if (!p1 || !p2) return [];
    const out = [];
    for (let r = Math.min(p1.row,p2.row); r <= Math.max(p1.row,p2.row); r++) {
      for (let c = Math.min(p1.col,p2.col); c <= Math.max(p1.col,p2.col); c++) out.push(numericCell(`${colLabel(c)}${r}`, seen));
    }
    return out;
  }

  function evaluateFormula(raw, seen = new Set()) {
    try {
      let expr = raw.slice(1).trim().toUpperCase();
      expr = expr.replace(/(SUM|AVERAGE|MIN|MAX)\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (_,fn,a,b) => {
        const vals = rangeValues(a,b,seen);
        if (!vals.length) return '0';
        if (fn === 'SUM') return String(vals.reduce((x,y)=>x+y,0));
        if (fn === 'AVERAGE') return String(vals.reduce((x,y)=>x+y,0)/vals.length);
        if (fn === 'MIN') return String(Math.min(...vals));
        return String(Math.max(...vals));
      });
      expr = expr.replace(/\b([A-Z]+\d+)\b/g, (_,addr) => {
        if (seen.has(addr)) throw new Error('Circular');
        return String(numericCell(addr, seen));
      });
      if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error('Invalid');
      const result = Function(`"use strict";return (${expr})`)();
      return Number.isFinite(result) ? result : '#ERRO!';
    } catch { return '#ERRO!'; }
  }

  function displayValue(addr) {
    const raw = cellRaw(addr);
    return raw.startsWith('=') ? String(evaluateFormula(raw, new Set([addr]))) : raw;
  }

  function recalcSheet() {
    table.querySelectorAll('td[data-cell]').forEach(td => {
      const addr = td.dataset.cell;
      const input = td.querySelector('input');
      const raw = cellRaw(addr);
      if (document.activeElement !== input) input.value = raw.startsWith('=') ? displayValue(addr) : raw;
      td.classList.toggle('formula', raw.startsWith('='));
      td.classList.toggle('error', input.value === '#ERRO!');
    });
  }

  $('#addRowBtn').addEventListener('click', () => { rows += 5; buildSheet(); setDirty(); });
  $('#addColBtn').addEventListener('click', () => { cols += 3; buildSheet(); setDirty(); });

  function sheetToMatrix(rawFormulas = true) {
    const matrix = [];
    for (let r = 1; r <= rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        const addr = `${colLabel(c)}${r}`;
        row.push(rawFormulas ? cellRaw(addr) : displayValue(addr));
      }
      while (row.length && row[row.length - 1] === '') row.pop();
      matrix.push(row);
    }
    while (matrix.length && matrix[matrix.length - 1].length === 0) matrix.pop();
    return matrix;
  }

  function exportSheet() {
    const title = safeName(fileName.value || 'planilha');
    if (window.XLSX) {
      const ws = XLSX.utils.aoa_to_sheet(sheetToMatrix(true));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Planilha1');
      XLSX.writeFile(wb, `${title}.xlsx`);
      showToast('Planilha baixada em Excel (.xlsx)');
      return;
    }
    const csv = matrixToCsv(sheetToMatrix(true));
    downloadBlob(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}), `${title}.csv`);
  }

  async function importSheet(file) {
    cells.clear();
    if (/\.csv$/i.test(file.name)) {
      const text = await file.text();
      loadMatrix(parseCsv(text));
    } else if (window.XLSX) {
      const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      loadMatrix(XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''}));
    } else {
      showToast('Biblioteca de Excel não carregou. Use CSV.');
      return;
    }
    fileName.value = file.name.replace(/\.[^.]+$/, '');
    buildSheet();
    saveLocal();
    showToast('Planilha aberta');
  }

  function loadMatrix(matrix) {
    rows = Math.max(30, matrix.length + 5);
    cols = Math.max(12, Math.max(0, ...matrix.map(r => r.length)) + 2);
    matrix.forEach((row,ri) => row.forEach((value,ci) => {
      if (value !== '') cells.set(`${colLabel(ci)}${ri+1}`, String(value));
    }));
  }

  function matrixToCsv(matrix) { return matrix.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(';')).join('\r\n'); }
  function parseCsv(text) {
    const lines = text.replace(/^\ufeff/,'').split(/\r?\n/);
    const delimiter = lines.some(l => l.includes(';')) ? ';' : ',';
    return lines.map(line => {
      const out=[]; let cur=''; let q=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"' && q && line[i+1]==='"'){cur+='"';i++;}
        else if(ch==='"') q=!q;
        else if(ch===delimiter && !q){out.push(cur);cur='';}
        else cur+=ch;
      }
      out.push(cur); return out;
    });
  }

  function saveLocal() {
    if (activeApp === 'docs') {
      localStorage.setItem(storageKey('docs'), docEditor.innerHTML);
      localStorage.setItem(storageKey('docs') + '-name', fileName.value);
    } else {
      localStorage.setItem(storageKey('sheets'), JSON.stringify({rows,cols,cells:[...cells.entries()]}));
      localStorage.setItem(storageKey('sheets') + '-name', fileName.value);
    }
    saveState.textContent = 'Salvo neste navegador';
  }

  function loadLocal() {
    if (activeApp === 'docs') {
      const data = localStorage.getItem(storageKey('docs'));
      if (data) docEditor.innerHTML = data;
      updateWordCount();
    } else {
      const raw = localStorage.getItem(storageKey('sheets'));
      if (raw) {
        try {
          const data = JSON.parse(raw);
          rows = data.rows || 30; cols = data.cols || 12;
          cells.clear(); (data.cells || []).forEach(([k,v]) => cells.set(k,v));
        } catch {}
      }
      buildSheet();
    }
    saveState.textContent = 'Salvo neste navegador';
  }

  $('#newBtn').addEventListener('click', () => {
    if (activeApp === 'docs') {
      docEditor.innerHTML = '<h1>Documento sem título</h1><p>Comece a escrever aqui...</p>';
      fileName.value = 'Documento sem título';
      updateWordCount();
    } else {
      cells.clear(); rows = 30; cols = 12; fileName.value = 'Planilha sem título'; buildSheet();
    }
    setDirty();
  });
  $('#openBtn').addEventListener('click', () => fileInput.click());
  $('#saveBtn').addEventListener('click', () => { saveLocal(); showToast('Salvo neste navegador'); });
  $('#downloadBtn').addEventListener('click', () => activeApp === 'docs' ? exportDoc() : exportSheet());
  fileName.addEventListener('input', setDirty);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try { activeApp === 'docs' ? await importDoc(file) : await importSheet(file); }
    catch (err) { console.error(err); showToast('Não foi possível abrir esse arquivo'); }
    fileInput.value = '';
  });

  function safeName(name) { return String(name).trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ') || 'arquivo'; }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function downloadBlob(blob, name) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  const initial = new URLSearchParams(location.search).get('app') || 'docs';
  switchApp(initial, false);
})();