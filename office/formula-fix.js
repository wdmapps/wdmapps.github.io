(() => {
  function normalizeFormula(value) {
    if (!String(value || '').trim().startsWith('=')) return value;
    return String(value)
      .replace(/\bSOMA\s*\(/gi, 'SUM(')
      .replace(/\bM[ÉE]DIA\s*\(/gi, 'AVERAGE(')
      .replace(/\bM[ÍI]NIMO\s*\(/gi, 'MIN(')
      .replace(/\bM[ÁA]XIMO\s*\(/gi, 'MAX(');
  }

  function normalizeElement(input, notify = false) {
    const normalized = normalizeFormula(input.value);
    if (normalized === input.value) return;
    input.value = normalized;
    if (notify) input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Mantém a fórmula visível ao voltar para uma célula calculada.
  document.addEventListener('focusin', (event) => {
    const input = event.target.closest?.('#sheetTable input[data-cell]');
    if (!input) return;
    const formula = document.getElementById('formulaInput');
    if (formula?.value?.startsWith('=')) input.value = formula.value;
  });

  // Traduz os nomes das funções em português antes do motor da planilha calcular.
  document.addEventListener('blur', (event) => {
    const cell = event.target.closest?.('#sheetTable input[data-cell]');
    if (cell) normalizeElement(cell, false);

    if (event.target.id === 'formulaInput') normalizeElement(event.target, true);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.id === 'formulaInput') {
      normalizeElement(event.target, false);
    }
  }, true);

  // Ajuda rápida para quem já está acostumado com o Excel em português.
  const formulaInput = document.getElementById('formulaInput');
  if (formulaInput) {
    formulaInput.placeholder = 'Ex.: =SOMA(A1:A5), =MÉDIA(B1:B10), =MÍNIMO(A1:A5), =MÁXIMO(A1:A5)';
    formulaInput.title = 'Aceita SOMA, MÉDIA, MÍNIMO e MÁXIMO, além de SUM, AVERAGE, MIN e MAX.';
  }
})();