/* ABTEC: encerramento de turmas sem excluir aulas, alunos ou avaliações. */
(() => {
  "use strict";
  const activeIds = () => Object.keys(classes).filter(id => !classes[id].archivedAt);
  const archivedEntries = () => Object.entries(classes).filter(([, item]) => item.archivedAt);
  const archiveButton = el("archive-class");
  const list = el("archives-list");
  function updateArchiveButton() {
    archiveButton.disabled = activeIds().length < 2 || !selectedClass || Boolean(classes[selectedClass]?.archivedAt);
    archiveButton.title = activeIds().length < 2 ? "Mantenha ao menos uma turma ativa." : "Finalizar e guardar turma";
  }
  window.renderArchivedClasses = function () {
    const entries = archivedEntries().sort((a, b) => String(b[1].archivedAt).localeCompare(String(a[1].archivedAt)));
    list.innerHTML = entries.map(([id, item]) => {
      const idAttribute = escapeHTML(id);
      const date = new Date(item.archivedAt);
      const dateLabel = Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR");
      const lessonsCount = combinedHistory(id).length;
      return `<article class="archive-row">
        <div><strong>${escapeHTML(item.name)}</strong>
          <p>Arquivada em ${dateLabel} · ${item.students.length} alunos · ${lessonsCount} aulas</p>
        </div>
        <div class="archive-actions">
          <button type="button" class="utility-button add" data-archive-action="consult" data-id="${idAttribute}">Consultar aulas</button>
          <button type="button" class="utility-button add" data-archive-action="students" data-id="${idAttribute}">Alunos</button>
          <button type="button" class="utility-button add" data-archive-action="restore" data-id="${idAttribute}">Restaurar</button>
        </div>
      </article>`;
    }).join("") || '<div class="empty-state">Nenhum diário arquivado ainda.</div>';
    updateArchiveButton();
  };
  archiveButton.addEventListener("click", async () => {
    const id = selectedClass, current = classes[id];
    if (!current || current.archivedAt) return;
    if (activeIds().length < 2) return showToast("É necessário manter pelo menos uma turma ativa.");
    if (!confirm(`Arquivar a turma “${current.name}”? As aulas, chamadas, alunos e notas permanecerão salvos e disponíveis para consulta.`)) return;
    if (window.WDM_ABTEC_SYNC?.dirty) {
      const ok = await window.WDM_ABTEC_SYNC.flush();
      if (!ok) return showToast("Sincronização pendente. Tente novamente antes de arquivar.");
    }
    current.archivedAt = new Date().toISOString();
    saveClasses();
    refreshClassSelectors(activeIds()[0]);
    window.renderArchivedClasses();
    const ok = await window.WDM_ABTEC_SYNC.flush();
    showToast(ok ? "Turma arquivada e sincronizada com a nuvem." : "Turma arquivada no dispositivo; sincronização pendente.");
  });
  list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-archive-action]");
    if (!button) return;
    const id = button.dataset.id, current = classes[id];
    if (!current?.archivedAt) return;
    if (button.dataset.archiveAction === "consult") {
      switchView("historico");
      historyClassSelect.value = id;
      renderHistory();
    } else if (button.dataset.archiveAction === "students") {
      switchView("alunos");
      rosterClassSelect.value = id;
      renderRoster();
    } else if (button.dataset.archiveAction === "restore") {
      if (!confirm(`Restaurar a turma “${current.name}” para as turmas ativas?`)) return;
      delete current.archivedAt;
      saveClasses();
      refreshClassSelectors(id);
      window.renderArchivedClasses();
      const ok = await window.WDM_ABTEC_SYNC.flush();
      showToast(ok ? "Turma restaurada e sincronizada." : "Turma restaurada no dispositivo; sincronização pendente.");
    }
  });
  // Impede edições em turmas encerradas nas telas auxiliares.
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const historyEditing = button.closest("#historico-view") && button.matches("[data-history-edit], [data-history-delete], .history-edit, .history-delete");
    const gradeEditing = button.closest("#notas-view") && /^(save-grades|cancel-grade-edit)$/.test(button.id);
    if ((historyEditing && classes[historyClassSelect.value]?.archivedAt) ||
        (gradeEditing && classes[document.getElementById("grade-class-select")?.value]?.archivedAt)) {
      event.stopImmediatePropagation(); event.preventDefault();
      showToast("Turma arquivada: restaure antes de alterar os registros.");
    }
  }, true);
  const originalPopulateGrades = typeof populateGradeClassSelect === "function" ? populateGradeClassSelect : null;
  if (originalPopulateGrades) {
    populateGradeClassSelect = function (...args) {
      originalPopulateGrades(...args);
      document.querySelectorAll("#grade-class-select option").forEach(opt => {
        if (classes[opt.value]?.archivedAt) opt.textContent = "📦 " + classes[opt.value].name;
      });
    };
  }
  classSelect.addEventListener("change", updateArchiveButton);
  window.addEventListener("abtec-cloud-updated", () => {
    // Atualização remota substitui o snapshot local. Recarregar é mais seguro
    // do que manter objetos de turma possivelmente desatualizados em memória.
    if (!window.WDM_ABTEC_SYNC?.dirty) location.reload();
  });
  window.renderArchivedClasses();
})();
