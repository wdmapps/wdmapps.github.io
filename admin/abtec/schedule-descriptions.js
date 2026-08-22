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

  const observer = new MutationObserver(() => decorateScheduleTable());
  observer.observe(document.body, { childList: true, subtree: true });
  decorateScheduleTable();
})();
