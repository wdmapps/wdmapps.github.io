const originalShowToast = showToast;
    showToast = message => originalShowToast(message === "Aula salva neste navegador." ? "Chamada salva." : message);

    const originalRenderHistory = renderHistory;
    const deleteLessonStyle = document.createElement("style");
    deleteLessonStyle.textContent = `
      .history-delete-row { grid-column: 1 / -1; display: flex; justify-content: flex-end; padding-top: 4px; }
      .history-delete-button { padding: 9px 12px; border: 1px solid #f1c9d1; border-radius: 8px; color: #bd4058; background: #fff4f6; font-size: 10px; font-weight: 800; }
      .history-delete-button:hover { color: #fff; border-color: #d84763; background: #d84763; }
    `;
    document.head.appendChild(deleteLessonStyle);

    function deleteSavedLesson(item, classId) {
      if (!item || item.imported) return;
      if (!confirm(`Excluir a chamada de ${formatDate(item.date)} — ${item.content}?\n\nAs faltas desta chamada também serão descontadas.`)) return;

      const lessons = getSavedLessons();
      const lessonIndex = lessons.findIndex(lesson => String(lesson.id) === String(item.id) && lesson.classId === classId);
      if (lessonIndex < 0) return showToast("Chamada não encontrada.");

      const [lesson] = lessons.splice(lessonIndex, 1);
      localStorage.setItem(storageKey, JSON.stringify(lessons));

      const current = classes[classId];
      if (current) {
        current.lessons = Math.max(0, Number(current.lessons || 0) - 1);
        current.students.forEach(student => {
          if (lesson.attendance && lesson.attendance[student[0]] === "F") {
            student[1] = Math.max(0, Number(student[1] || 0) - 1);
          }
        });
        saveClasses();
      }

      if (selectedClass === classId) renderClass();
      renderHistory();
      renderRoster();
      renderDashboard();
      showToast("Chamada excluída.");
    }

    renderHistory = function () {
      originalRenderHistory();
      const classId = historyClassSelect.value || selectedClass;
      const history = combinedHistory(classId);
      const cards = [...document.querySelectorAll("#history-list .history-item")];

      cards.forEach((card, index) => {
        const item = history[index];
        if (!item || item.imported) return;
        const details = card.querySelector(".attendance-details");
        if (!details) return;

        const row = document.createElement("div");
        row.className = "history-delete-row";
        const button = document.createElement("button");
        button.className = "history-delete-button";
        button.type = "button";
        button.textContent = "Excluir esta chamada";
        button.addEventListener("click", () => deleteSavedLesson(item, classId));
        row.appendChild(button);
        details.appendChild(row);
      });
    };

    renderHistory();
  