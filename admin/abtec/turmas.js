/* Diretório central das turmas ativas ABTEC. */
(() => {
  "use strict";
  const directory = el("classes-directory");
  const search = el("classes-search");
  const count = el("classes-active-count");

  function activeEntries() {
    return Object.entries(classes).filter(([, item]) => !item.archivedAt);
  }

  function renderClassesDirectory() {
    const all = activeEntries();
    const term = search.value.trim().toLocaleLowerCase("pt-BR");
    const entries = all.filter(([, item]) => item.name.toLocaleLowerCase("pt-BR").includes(term));
    count.textContent = `${all.length} ${all.length === 1 ? "turma ativa" : "turmas ativas"}`;
    directory.innerHTML = entries.map(([id, item]) => {
      const safeId = escapeHTML(id);
      const totalAbsences = item.students.reduce((sum, student) => sum + Number(student[1] || 0), 0);
      return `<article class="class-directory-card">
        <div class="class-directory-info">
          <div class="class-directory-title"><strong>${escapeHTML(item.name)}</strong><span class="class-status-active">Em andamento</span></div>
          <div class="class-directory-details">
            <span>◷ ${escapeHTML(item.time || "Não informado")}</span>
            <span>◎ ${item.students.length} alunos</span>
            <span>▤ ${combinedHistory(id).length} aulas</span>
            <span>! ${totalAbsences} faltas</span>
          </div>
        </div>
        <div class="class-directory-actions">
          <button type="button" class="primary-button" data-class-action="chamada" data-class-id="${safeId}">Abrir diário</button>
          <button type="button" class="utility-button add" data-class-action="alunos" data-class-id="${safeId}">Alunos</button>
          <button type="button" class="utility-button add" data-class-action="historico" data-class-id="${safeId}">Histórico</button>
          <button type="button" class="utility-button add archive-directory-button" data-class-action="arquivar" data-class-id="${safeId}">Arquivar</button>
        </div>
      </article>`;
    }).join("") || `<div class="empty-state">${term ? "Nenhuma turma encontrada para esta pesquisa." : "Nenhuma turma ativa cadastrada."}</div>`;
  }

  function selectActiveClass(classId) {
    selectedClass = classId;
    classSelect.value = classId;
    historyClassSelect.value = classId;
    rosterClassSelect.value = classId;
  }

  directory.addEventListener("click", event => {
    const button = event.target.closest("button[data-class-action]");
    if (!button) return;
    const classId = button.dataset.classId;
    if (!classes[classId] || classes[classId].archivedAt) return renderClassesDirectory();
    const action = button.dataset.classAction;
    selectActiveClass(classId);
    classSelect.dispatchEvent(new Event("change", { bubbles: true }));
    if (action === "arquivar") {
      el("archive-class").click();
      renderClassesDirectory();
      return;
    }
    if (action === "chamada") switchView("chamada");
    else if (action === "alunos") switchView("alunos");
    else if (action === "historico") switchView("historico");
    if (action === "alunos") { rosterClassSelect.value = classId; renderRoster(); }
    if (action === "historico") { historyClassSelect.value = classId; renderHistory(); }
  });

  search.addEventListener("input", renderClassesDirectory);
  el("create-class-from-list").addEventListener("click", () => openDialog(el("class-dialog")));
  const originalRefresh = refreshClassSelectors;
  refreshClassSelectors = function (...args) {
    originalRefresh(...args);
    renderClassesDirectory();
  };
  const originalRenderDashboard = renderDashboard;
  renderDashboard = function (...args) {
    const result = originalRenderDashboard(...args);
    if (el("turmas-view").classList.contains("active")) renderClassesDirectory();
    return result;
  };
  window.renderClassesDirectory = renderClassesDirectory;
  renderClassesDirectory();
})();
