document.addEventListener('focusin', (event) => {
  const input = event.target.closest?.('#sheetTable input[data-cell]');
  if (!input) return;
  const formula = document.getElementById('formulaInput');
  if (formula?.value?.startsWith('=')) input.value = formula.value;
});