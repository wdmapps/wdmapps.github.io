(() => {
  const lessonDescriptions = {
    1: "Capítulo 1 - Introdução à informática e sistemas Windows",
    2: "Capítulo 2 - Arquivos, aplicativos e conexões sem fio",
    3: "Capítulo 3 - Explorando todas as funções do teclado",
    4: "Capítulo 4 - Configurações, contas e segurança",
    5: "Capítulo 5 - Conceitos de internet, navegadores e busca; Capítulo 6 - Ferramentas de IA, comunicação e nuvem (até 6.2.1)",
    6: "Capítulo 6 - Ferramentas de IA, comunicação e nuvem (6.3 até o fim); Capítulo 7 - Redes sociais, marketplaces e streaming",
    7: "Capítulo 8 - Revisão geral e preparatório para avaliação",
    8: "Avaliação final teórica e prática",
    9: "Introdução ao Microsoft Word, formatação de textos e apresentação das guias",
    10: "Criação de tabelas e formatação de textos - Tabelas: guia Design",
    11: "Carta comercial, procurações, jornal mural, cabeçalho e rodapé, configuração de página, quebra de página, marca d'água e número de página",
    12: "Ilustrações (SmartArt)",
    13: "Imagens - guia Inserir e ferramentas de imagens",
    14: "Currículo: criação e formatação, onde enviar pela internet e envio por e-mail",
    15: "Atividade de formatação ABNT e revisão teórica",
    16: "Avaliação teórica e prática utilizando Google Formulários",
    17: "Introdução ao Microsoft Excel. Atividade 01: digitação e formatação. Fórmulas: soma, multiplicação, divisão e subtração. Classificação de dados. Inserir e excluir linhas",
    18: "Atividade 02: formatação. Fórmulas: média, SE, máximo e mínimo. Formatação condicional",
    19: "Inserção de imagens online. Atividade 04: trabalhando com percentual",
    20: "Gráficos - guia Inserir",
    21: "Finanças: livro-caixa, orçamento familiar e estoque. Fórmulas: soma, SE, multiplicação, subtração, CONT.VALORES, máximo, mínimo e média",
    22: "Layout da página: margens, orientação, tamanho, quebras, área de impressão, plano de fundo, imprimir títulos, dimensionar para ajustar e filtros simples",
    23: "Atividade biblioteca. Fórmulas: DIAS360, PROCV, SE e porcentagem",
    24: "Atividade 08. Fórmulas: SOMASE, SOMA e multiplicação",
    25: "Atividade 07 (Ariane), trabalhando com arquivo. Treino das fórmulas já aplicadas, proteger planilha, proteger pasta de trabalho e converter em PDF",
    26: "Atividade 07 (Ariane), continuação. Treino das fórmulas já aplicadas, proteger planilha, proteger pasta de trabalho e converter em PDF",
    27: "Revisão teórica e prática",
    28: "Avaliação teórica e prática utilizando Google Formulários",
    29: "Introdução ao Microsoft PowerPoint e criação de slides, tema livre - guias Design e Inserir",
    30: "Hiperlink e guias Transições, Animações e Apresentação de Slides. Criação de slides com tema livre",
    31: "Marketing pessoal, Google Fotos e impressões",
    32: "Gráficos e tabelas. Salvar em PDF e apresentação de slides do PowerPoint",
    33: "Avaliação teórica e prática utilizando Google Formulários - atividade apresentada"
  };

  const historyModules = ["Windows", "Word", "Excel", "PowerPoint", "Revisão / Prova"];
  let editingHistory = null;
  let editingAttendance = {};

  if (!document.getElementById("schedule-description-style")) {
    const style = document.createElement("style");
    style.id = "schedule-description-style";
    style.textContent = `
      .schedule-table.with-descriptions { min-width: 1180px; }
      .schedule-table .schedule-description { min-width: 310px; max-width: 430px; line-height: 1.45; }
      .schedule-table th.schedule-description { min-width: 310px; }
      .history-action-row { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; padding-top: 4px; }
      .history-action-row button { padding: 9px 12px; border-radius: 8px; font-size: 10px; font-weight: 800; }
      .history-edit-button { border: 1px solid #b9d9f7; color: #0874d7; background: #eff7ff; }
      .history-edit-button:hover { color: #fff; border-color: #0874d7; background: #0874d7; }
      .history-delete-button { border: 1px solid #f1c9d1; color: #bd4058; background: #fff4f6; }
      .history-delete-button:hover { color: #fff; border-color: #d84763; background: #d84763; }
      .history-edit-dialog { width: min(720px, calc(100vw - 28px)); max-height: 90vh; padding: 0; overflow: hidden; }
      .history-edit-dialog form { max-height: 86vh; overflow: auto; padding: 24px; }
      .history-edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
      .history-edit-grid .full-field { grid-column: 1 / -1; }
      .history-edit-attendance-heading { margin: 22px 0 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .history-edit-attendance-heading h3 { margin: 0; font-size: 14px; }
      .history-edit-all-present { padding: 7px 10px; border: 1px solid #b9d9f7; border-radius: 7px; color: #0874d7; background: #eff7ff; font-size: 10px; font-weight: 800; }
      .history-edit-attendance { border: 1px solid var(--line, #dce8f7); border-radius: 10px; overflow: hidden; }
      .history-edit-student { min-height: 52px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--line, #dce8f7); }
      .history-edit-student:last-child { border-bottom: 0; }
      .history-edit-student strong { font-size: 12px; }
      .history-edit-toggle { display: flex; gap: 6px; }
      .history-edit-toggle button { width: 38px; height: 30px; border: 1px solid #ccdbeb; border-radius: 7px; color: #6e829e; background: white; font-size: 10px; font-weight: 800; }
      .history-edit-toggle button.present.selected { border-color: #087cf0; color: white; background: #087cf0; }
      .history-edit-toggle button.absent.selected { border-color: #d84763; color: white; background: #d84763; }
      @media (max-width: 620px) {
        .history-edit-grid { grid-template-columns: 1fr; }
        .history-edit-grid .full-field { grid-column: auto; }
      }
    `;
    document.head.appendChild(style);
  }

  function decorateScheduleTable() {
    document.querySelectorAll(".schedule-table:not([data-descriptions-added])").forEach(table => {
      const headerRow = table.querySelector("thead tr");
      const rows = table.querySelectorAll("tbody tr");
      if (!headerRow || !rows.length) return;

      const headers = headerRow.querySelectorAll("th");
      if (headers.length < 5) return;

      const descriptionHeader = document.createElement("th");
      descriptionHeader.className = "schedule-description";
      descriptionHeader.textContent = "Descrição";
      headerRow.insertBefore(descriptionHeader, headers[4]);

      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 5) return;
        const lesson = Number(cells[0].textContent.trim());
        const descriptionCell = document.createElement("td");
        descriptionCell.className = "schedule-description";
        descriptionCell.textContent = lessonDescriptions[lesson] || "Conteúdo da aula a definir";
        row.insertBefore(descriptionCell, cells[4]);
      });

      table.classList.add("with-descriptions");
      table.dataset.descriptionsAdded = "true";
    });
  }

  function ensureHistoryEditDialog() {
    let dialog = document.getElementById("history-edit-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "history-edit-dialog";
    dialog.className = "management-dialog history-edit-dialog";
    dialog.innerHTML = `
      <form id="history-edit-form">
        <div class="dialog-heading"><span>✎</span><div><h2>Editar chamada</h2><p id="history-edit-class"></p></div></div>
        <div class="history-edit-grid">
          <div class="field">
            <label for="history-edit-date">Data da aula</label>
            <input id="history-edit-date" type="date" required>
          </div>
          <div class="field">
            <label for="history-edit-module">Módulo</label>
            <select id="history-edit-module"></select>
          </div>
          <div class="field full-field">
            <label for="history-edit-content">Matéria dada</label>
            <textarea id="history-edit-content" rows="4" required></textarea>
          </div>
          <div class="field full-field">
            <label for="history-edit-note">Observações <span>(opcional)</span></label>
            <input id="history-edit-note" type="text" maxlength="160">
          </div>
        </div>
        <div class="history-edit-attendance-heading">
          <h3>Presença dos alunos</h3>
          <button class="history-edit-all-present" id="history-edit-all-present" type="button">Marcar todos presentes</button>
        </div>
        <div class="history-edit-attendance" id="history-edit-attendance"></div>
        <div class="dialog-actions">
          <button class="cancel-button" id="history-edit-cancel" type="button">Cancelar</button>
          <button class="primary-button" type="submit">Salvar alterações</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    document.getElementById("history-edit-cancel").addEventListener("click", () => {
      editingHistory = null;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
    document.getElementById("history-edit-all-present").addEventListener("click", () => {
      Object.keys(editingAttendance).forEach(name => { editingAttendance[name] = "P"; });
      renderHistoryEditAttendance();
    });
    document.getElementById("history-edit-form").addEventListener("submit", saveHistoryEdit);
    return dialog;
  }

  function renderHistoryEditAttendance() {
    const target = document.getElementById("history-edit-attendance");
    if (!target || !editingHistory) return;
    const current = classes[editingHistory.classId];
    target.innerHTML = current.students.map(([name]) => `
      <div class="history-edit-student">
        <strong>${escapeHTML(name)}</strong>
        <div class="history-edit-toggle">
          <button class="present ${editingAttendance[name] === "P" ? "selected" : ""}" type="button" data-history-student="${escapeHTML(name)}" data-history-status="P">P</button>
          <button class="absent ${editingAttendance[name] === "F" ? "selected" : ""}" type="button" data-history-student="${escapeHTML(name)}" data-history-status="F">F</button>
        </div>
      </div>`).join("") || `<div class="empty-state">Nenhum aluno cadastrado nesta turma.</div>`;

    target.querySelectorAll("[data-history-student]").forEach(button => {
      button.addEventListener("click", () => {
        editingAttendance[button.dataset.historyStudent] = button.dataset.historyStatus;
        renderHistoryEditAttendance();
      });
    });
  }

  function openHistoryEditor(item, classId) {
    if (!item || !classes[classId]) return;
    const dialog = ensureHistoryEditDialog();
    const current = classes[classId];
    editingHistory = { item, classId };
    editingAttendance = Object.fromEntries(current.students.map(([name]) => [name, item.attendance?.[name] || null]));

    document.getElementById("history-edit-class").textContent = current.name;
    document.getElementById("history-edit-date").value = item.date || "";
    document.getElementById("history-edit-content").value = item.content || "";
    document.getElementById("history-edit-note").value = item.note || "";

    const moduleSelect = document.getElementById("history-edit-module");
    const modules = historyModules.includes(item.module) || !item.module ? historyModules : [...historyModules, item.module];
    moduleSelect.innerHTML = modules.map(module => `<option value="${escapeHTML(module)}">${escapeHTML(module)}</option>`).join("");
    moduleSelect.value = item.module || historyModules[0];
    renderHistoryEditAttendance();

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function adjustAbsenceTotals(current, oldAttendance, newAttendance) {
    current.students.forEach(student => {
      const name = student[0];
      const wasAbsent = oldAttendance?.[name] === "F";
      const isAbsent = newAttendance?.[name] === "F";
      if (wasAbsent && !isAbsent) student[1] = Math.max(0, Number(student[1] || 0) - 1);
      if (!wasAbsent && isAbsent) student[1] = Number(student[1] || 0) + 1;
    });
  }

  function saveHistoryEdit(event) {
    event.preventDefault();
    if (!editingHistory) return;

    const { item, classId } = editingHistory;
    const current = classes[classId];
    if (!current) return;

    const date = document.getElementById("history-edit-date").value;
    const module = document.getElementById("history-edit-module").value;
    const content = document.getElementById("history-edit-content").value.trim();
    const note = document.getElementById("history-edit-note").value.trim();
    const unmarked = Object.values(editingAttendance).filter(status => status !== "P" && status !== "F").length;

    if (!date) return showToast("Informe a data da aula.");
    if (!content) return showToast("Informe a matéria dada.");
    if (unmarked) return showToast(`Marque a chamada dos ${unmarked} alunos restantes.`);

    const oldAttendance = item.attendance || {};
    const newAttendance = { ...editingAttendance };
    adjustAbsenceTotals(current, oldAttendance, newAttendance);

    if (item.imported) {
      const importedIndex = Number(String(item.id).replace("imported-", ""));
      const original = current.history[importedIndex];
      if (!original) return showToast("Chamada não encontrada.");
      const oldDate = original[0];

      current.history.splice(importedIndex, 1);
      if (!current.history.some(row => row[0] === oldDate) && current.absences) delete current.absences[oldDate];

      const lessons = getSavedLessons();
      lessons.push({
        id: Date.now(),
        classId,
        date,
        module,
        content,
        note,
        attendance: newAttendance,
        savedAt: new Date().toISOString(),
        editedFromImport: true
      });
      localStorage.setItem(storageKey, JSON.stringify(lessons));
    } else {
      const lessons = getSavedLessons();
      const lessonIndex = lessons.findIndex(lesson => String(lesson.id) === String(item.id) && lesson.classId === classId);
      if (lessonIndex < 0) return showToast("Chamada não encontrada.");
      lessons[lessonIndex] = {
        ...lessons[lessonIndex],
        date,
        module,
        content,
        note,
        attendance: newAttendance,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(storageKey, JSON.stringify(lessons));
    }

    saveClasses();
    const dialog = ensureHistoryEditDialog();
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    editingHistory = null;

    if (selectedClass === classId) renderClass();
    renderHistory();
    renderRoster();
    renderDashboard();
    showToast("Chamada atualizada.");
  }

  function deleteHistoryItem(item, classId) {
    if (!item || !classes[classId]) return;
    if (!confirm(`Excluir a chamada de ${formatDate(item.date)} — ${item.content}?\n\nEssa ação também ajustará as faltas acumuladas.`)) return;

    const current = classes[classId];

    if (item.imported) {
      const importedIndex = Number(String(item.id).replace("imported-", ""));
      const original = current.history[importedIndex];
      if (!original) return showToast("Chamada não encontrada.");

      const date = original[0];
      const absentNames = Array.isArray(current.absences?.[date]) ? [...current.absences[date]] : [];
      current.history.splice(importedIndex, 1);

      const sameDateStillExists = current.history.some(row => row[0] === date);
      if (!sameDateStillExists) {
        absentNames.forEach(name => {
          const student = current.students.find(([studentName]) => studentName === name);
          if (student) student[1] = Math.max(0, Number(student[1] || 0) - 1);
        });
        if (current.absences) delete current.absences[date];
      }
    } else {
      const lessons = getSavedLessons();
      const lessonIndex = lessons.findIndex(lesson => String(lesson.id) === String(item.id) && lesson.classId === classId);
      if (lessonIndex < 0) return showToast("Chamada não encontrada.");

      const [lesson] = lessons.splice(lessonIndex, 1);
      localStorage.setItem(storageKey, JSON.stringify(lessons));
      current.students.forEach(student => {
        if (lesson.attendance && lesson.attendance[student[0]] === "F") {
          student[1] = Math.max(0, Number(student[1] || 0) - 1);
        }
      });
    }

    current.lessons = Math.max(0, Number(current.lessons || 0) - 1);
    saveClasses();

    if (selectedClass === classId) renderClass();
    renderHistory();
    renderRoster();
    renderDashboard();
    showToast("Chamada excluída.");
  }

  function decorateHistoryActions() {
    if (typeof combinedHistory !== "function" || !historyClassSelect) return;
    const classId = historyClassSelect.value || selectedClass;
    if (!classes[classId]) return;

    const history = combinedHistory(classId);
    const cards = [...document.querySelectorAll("#history-list .history-item")];

    cards.forEach((card, index) => {
      if (card.querySelector(".history-action-row")) return;
      const item = history[index];
      if (!item) return;
      const details = card.querySelector(".attendance-details");
      if (!details) return;

      card.querySelectorAll(".history-delete-row").forEach(row => row.remove());

      const row = document.createElement("div");
      row.className = "history-action-row";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "history-edit-button";
      editButton.textContent = "Editar esta chamada";
      editButton.addEventListener("click", event => {
        event.stopPropagation();
        openHistoryEditor(item, classId);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "history-delete-button";
      deleteButton.textContent = "Excluir esta chamada";
      deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        deleteHistoryItem(item, classId);
      });

      row.append(editButton, deleteButton);
      details.appendChild(row);
    });
  }

  let historyDecorateQueued = false;
  const observer = new MutationObserver(() => {
    decorateScheduleTable();
    if (!historyDecorateQueued) {
      historyDecorateQueued = true;
      queueMicrotask(() => {
        historyDecorateQueued = false;
        decorateHistoryActions();
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  ensureHistoryEditDialog();
  decorateScheduleTable();
  decorateHistoryActions();
})();
