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

  if (!document.getElementById("schedule-description-style")) {
    const style = document.createElement("style");
    style.id = "schedule-description-style";
    style.textContent = `
      .schedule-table.with-descriptions { min-width: 1180px; }
      .schedule-table .schedule-description { min-width: 310px; max-width: 430px; line-height: 1.45; }
      .schedule-table th.schedule-description { min-width: 310px; }
      .history-delete-row { grid-column: 1 / -1; display: flex; justify-content: flex-end; padding-top: 4px; }
      .history-delete-button { padding: 9px 12px; border: 1px solid #f1c9d1; border-radius: 8px; color: #bd4058; background: #fff4f6; font-size: 10px; font-weight: 800; }
      .history-delete-button:hover { color: #fff; border-color: #d84763; background: #d84763; }
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

  function decorateHistoryDeletes() {
    if (typeof combinedHistory !== "function" || !historyClassSelect) return;
    const classId = historyClassSelect.value || selectedClass;
    if (!classes[classId]) return;

    const history = combinedHistory(classId);
    const cards = [...document.querySelectorAll("#history-list .history-item")];

    cards.forEach((card, index) => {
      if (card.querySelector(".history-delete-button")) return;
      const item = history[index];
      if (!item) return;
      const details = card.querySelector(".attendance-details");
      if (!details) return;

      const row = document.createElement("div");
      row.className = "history-delete-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-delete-button";
      button.textContent = "Excluir esta chamada";
      button.addEventListener("click", event => {
        event.stopPropagation();
        deleteHistoryItem(item, classId);
      });
      row.appendChild(button);
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
        decorateHistoryDeletes();
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  decorateScheduleTable();
  decorateHistoryDeletes();
})();
