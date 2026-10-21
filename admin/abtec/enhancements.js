(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const sync = window.WDM_ABTEC_SYNC;
  const draftKey = "abtec-drafts-v2";
  let restoring = false;
  function getDrafts() { try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch { return {}; } }
  function putDrafts(value) { localStorage.setItem(draftKey, JSON.stringify(value)); }
  function lessonDraft() {
    return { date: $("lesson-date").value, module: $("module-select").value, content: $("lesson-content").value, note: $("lesson-note").value, attendance: { ...attendance } };
  }
  function hasLessonDraft(value = lessonDraft()) { return Boolean(value.content.trim() || value.note.trim() || Object.values(value.attendance).some(Boolean)); }
  function saveLessonDraft() {
    if (restoring) return;
    const all = getDrafts(), value = lessonDraft();
    if (hasLessonDraft(value)) all[`lesson:${selectedClass}`] = value;
    else delete all[`lesson:${selectedClass}`];
    putDrafts(all);
    const hint = $("lesson-draft-state"); if (hint) hint.textContent = hasLessonDraft(value) ? "Rascunho salvo neste dispositivo" : "";
  }
  function restoreLessonDraft() {
    const value = getDrafts()[`lesson:${selectedClass}`];
    if (!value) return;
    restoring = true;
    $("lesson-date").value = value.date; $("module-select").value = value.module;
    $("lesson-content").value = value.content; $("lesson-note").value = value.note;
    $("student-list").querySelectorAll(".student-row").forEach(row => {
      const name = classes[selectedClass].students[Number(row.dataset.studentIndex)][0];
      if (value.attendance?.[name]) setAttendance(row, value.attendance[name]);
    });
    restoring = false;
  }
  const baseRenderClass = renderClass;
  renderClass = function () { baseRenderClass(); restoreLessonDraft(); };
  $("class-select").addEventListener("change", saveLessonDraft, true);
  $("class-select").addEventListener("change", restoreLessonDraft);
  for (const id of ["lesson-date", "module-select", "lesson-content", "lesson-note"]) $(id).addEventListener("input", saveLessonDraft);
  $("student-list").addEventListener("click", () => queueMicrotask(saveLessonDraft));
  $("all-present").addEventListener("click", () => queueMicrotask(saveLessonDraft));
  document.addEventListener("abtec-lesson-saved", () => { const all = getDrafts(); delete all[`lesson:${selectedClass}`]; putDrafts(all); });
  const draftHint = document.createElement("p"); draftHint.id = "lesson-draft-state"; draftHint.className = "draft-hint"; $("save-lesson").before(draftHint);

  function gradeDraftId() { return `grade:${gradeClassSelect.value}:${gradeModuleSelect.value}`; }
  function hasGradeDraft() { return Boolean($("grade-assessment-title").value.trim() || [...document.querySelectorAll(".grade-input")].some(input => input.value !== "")); }
  function saveGradeDraft() {
    if (restoring) return;
    const all = getDrafts();
    if (hasGradeDraft()) all[gradeDraftId()] = { title: $("grade-assessment-title").value, date: $("grade-date").value, editing: editingAssessmentId, grades: Object.fromEntries([...document.querySelectorAll(".grade-input")].map(input => [input.dataset.student, input.value])) };
    else delete all[gradeDraftId()];
    putDrafts(all);
  }
  function restoreGradeDraft() {
    const value = getDrafts()[gradeDraftId()]; if (!value) return;
    restoring = true;
    if (value.editing && getGradeAssessments().some(item => item.id === value.editing)) { editingAssessmentId = value.editing; renderGradesForm(); }
    $("grade-assessment-title").value = value.title; $("grade-date").value = value.date;
    document.querySelectorAll(".grade-input").forEach(input => { input.value = value.grades[input.dataset.student] ?? ""; });
    restoring = false;
  }
  ["grade-assessment-title", "grade-date"].forEach(id => $(id).addEventListener("input", saveGradeDraft));
  $("grade-student-list").addEventListener("input", saveGradeDraft);
  gradeNav.addEventListener("click", restoreGradeDraft);
  gradeClassSelect.addEventListener("change", restoreGradeDraft);
  gradeModuleSelect.addEventListener("change", restoreGradeDraft);
  document.addEventListener("abtec-grades-saved", () => { const all = getDrafts(); delete all[gradeDraftId()]; putDrafts(all); });
  document.addEventListener("abtec-grades-pending", saveGradeDraft);
  $("cancel-grade-edit").addEventListener("click", () => { const all = getDrafts(); delete all[gradeDraftId()]; putDrafts(all); });
  window.WDM_ABTEC_HAS_DRAFT = () => hasLessonDraft() || hasGradeDraft() || Boolean(document.querySelector("#history-edit-dialog[open]"));
  restoreLessonDraft(); restoreGradeDraft();

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function exportBackup() {
    const data = { version: 2, createdAt: new Date().toISOString(), snapshot: sync.localSnapshot(), initial: window.WDM_ABTEC_INITIAL, drafts: getDrafts(), previousCopies: Object.keys(localStorage).filter(key => key.startsWith("abtec-backup-v2-")).map(key => JSON.parse(localStorage.getItem(key))) };
    download(`abtec-backup-${localDateISO()}.json`, JSON.stringify(data, null, 2), "application/json;charset=utf-8");
  }
  function csvValue(value) { const text = String(value ?? ""); return `"${(/^\s*[=+@\-]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`; }
  function csv(name, rows) { download(name, "\uFEFF" + rows.map(row => row.map(csvValue).join(";")).join("\r\n"), "text/csv;charset=utf-8"); }
  const toolbar = document.createElement("section"); toolbar.className = "diary-tools";
  toolbar.innerHTML = `<div><span class="sync-indicator" data-abtec-sync role="status" aria-live="polite">Conectando…</span><button type="button" class="text-button" data-sync-retry hidden>Tentar sincronizar</button><span class="draft-hint">Rascunhos ficam neste dispositivo.</span></div><div class="diary-tool-buttons"><button class="text-button" id="diary-refresh" type="button">Atualizar dados</button><button class="text-button" id="diary-backup" type="button">Baixar backup</button><button class="text-button" id="diary-report" type="button">Relatório da turma</button></div>`;
  document.querySelector(".page-heading").after(toolbar);
  document.querySelector(".sidebar-note")?.remove();
  document.querySelector(".save-bar p").innerHTML = '<span data-abtec-sync role="status">Conectando…</span>';
  $("diary-backup").addEventListener("click", exportBackup);
  toolbar.querySelector("[data-sync-retry]").addEventListener("click", () => sync.retry());
  $("diary-refresh").addEventListener("click", async () => {
    if ((sync.dirty || window.WDM_ABTEC_HAS_DRAFT()) && !confirm("Há alterações ou rascunhos neste dispositivo. Uma cópia será preservada antes de carregar a nuvem. Deseja continuar?")) return;
    saveLessonDraft(); saveGradeDraft();
    try { await sync.refresh(); } catch { sync.status("Falha ao atualizar. Os dados locais foram preservados.", "error"); }
  });
  window.addEventListener("abtec-cloud-updated", () => {
    classes = JSON.parse(localStorage.getItem(classStorageKey));
    refreshClassSelectors(classes[selectedClass] ? selectedClass : Object.keys(classes)[0]);
    renderGrades(); restoreGradeDraft(); renderCalendar();
    if ($("schedule-nav")?.classList.contains("active")) $("schedule-nav").click();
  });

  const filters = document.createElement("div"); filters.className = "history-filters";
  filters.innerHTML = `<label>Buscar conteúdo<input type="search" id="history-search" placeholder="Ex.: Word, convite, páginas…"></label><label>De<input id="history-from" type="date"></label><label>Até<input id="history-to" type="date"></label><label>Módulo<select id="history-module"><option value="">Todos os módulos</option>${gradeModules.map(name => `<option>${name}</option>`).join("")}<option>Revisão / Prova</option></select></label><button class="text-button" id="history-clear" type="button">Limpar filtros</button><button class="text-button" id="history-csv" type="button">Exportar Excel (CSV)</button><p id="history-filter-count" aria-live="polite"></p>`;
  $("history-list").before(filters);
  function filteredHistory() {
    const from = $("history-from").value, to = $("history-to").value, module = $("history-module").value;
    const query = $("history-search").value.trim().toLocaleLowerCase("pt-BR");
    return combinedHistory(historyClassSelect.value).filter(item => (!from || item.date >= from) && (!to || item.date <= to) && (!module || item.module === module) && (!query || `${item.content} ${item.note || ""} ${item.module}`.toLocaleLowerCase("pt-BR").includes(query)));
  }
  function applyHistoryFilters() {
    const items = combinedHistory(historyClassSelect.value), visible = new Set(filteredHistory());
    // IDs are stable across calls; imported IDs are stable within each current class history.
    const ids = new Set([...visible].map(item => String(item.id)));
    document.querySelectorAll("#history-list .history-item").forEach((node, index) => { node.hidden = !ids.has(String(items[index]?.id)); });
    $("history-filter-count").textContent = `${visible.size} de ${items.length} registros${visible.size ? "" : " — nenhuma aula encontrada"}`;
  }
  const baseHistory = renderHistory;
  renderHistory = function () { baseHistory(); applyHistoryFilters(); };
  filters.addEventListener("input", applyHistoryFilters);
  $("history-clear").addEventListener("click", () => { ["history-search", "history-from", "history-to", "history-module"].forEach(id => { $(id).value = ""; }); applyHistoryFilters(); });
  historyClassSelect.addEventListener("change", applyHistoryFilters);
  $("history-csv").addEventListener("click", () => {
    const rows = [["Turma", "Data", "Módulo", "Conteúdo", "Aluno", "Situação", "Observações"]];
    filteredHistory().forEach(item => {
      const entries = Object.entries(item.attendance || {});
      (entries.length ? entries : [["", ""]]).forEach(([name, value]) => rows.push([classes[historyClassSelect.value].name, item.date, item.module, item.content, name, value === "P" ? "Presente" : value === "F" ? "Falta" : "Sem chamada", item.note || ""]));
    });
    csv(`abtec-chamadas-${localDateISO()}.csv`, rows);
  });
  applyHistoryFilters();

  function frequency(classId, name) {
    const records = combinedHistory(classId).filter(item => item.attendance?.[name] === "P" || item.attendance?.[name] === "F");
    const present = records.filter(item => item.attendance[name] === "P").length;
    return { total: records.length, present, absent: records.length - present, rate: records.length ? Math.round(present / records.length * 100) : null };
  }
  const report = document.createElement("dialog"); report.id = "diary-report-dialog"; report.className = "report-dialog";
  report.innerHTML = `<div class="report-actions"><button class="text-button" id="report-print" type="button">Imprimir / Salvar PDF</button><button class="text-button" id="report-csv" type="button">Exportar Excel (CSV)</button><button class="text-button" id="report-close" type="button">Fechar</button></div><div id="diary-report-content"></div>`;
  document.body.appendChild(report);
  let reportRows = [], reportClass = selectedClass;
  function showReport(classId, studentName) {
    reportClass = classId;
    const current = classes[classId];
    const students = current.students.filter(([name]) => !studentName || name === studentName);
    reportRows = [["Aluno", "Presenças", "Faltas nas chamadas", "Faltas acumuladas", "Frequência (%)", ...gradeModules]];
    students.forEach(([name, absences]) => { const stat = frequency(classId, name); reportRows.push([name, stat.present, stat.absent, absences, stat.rate ?? "", ...gradeModules.map(module => { const value = studentAverage(classId, name, module); return value === null ? "" : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }); })]); });
    const history = studentName ? combinedHistory(classId).filter(item => item.attendance?.[studentName] === "F") : [];
    $("diary-report-content").innerHTML = `<h2>${escapeHTML(studentName || "Relatório da turma")}</h2><p>${escapeHTML(current.name)} · Emitido em ${formatDate(localDateISO())}</p><p>Frequência calculada apenas nas chamadas disponíveis. Faltas acumuladas podem incluir registros anteriores.</p><div class="report-table-wrap"><table><thead><tr>${reportRows[0].map(value => `<th>${escapeHTML(value)}</th>`).join("")}</tr></thead><tbody>${reportRows.slice(1).map(row => `<tr>${row.map(value => `<td>${escapeHTML(value === "" ? "—" : value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${studentName ? `<h3>Datas com falta registrada</h3><p>${history.map(item => formatDate(item.date)).join(" · ") || "Nenhuma falta nas chamadas disponíveis."}</p>` : ""}`;
    report.showModal();
  }
  $("diary-report").addEventListener("click", () => {
    const active = document.querySelector(".view.active")?.id;
    const id = active === "historico-view" ? historyClassSelect.value : active === "alunos-view" ? rosterClassSelect.value : active === "notas-view" ? gradeClassSelect.value : active === "cronograma-view" ? $("schedule-class-select").value : selectedClass;
    showReport(id);
  });
  $("report-close").addEventListener("click", () => report.close());
  $("report-print").addEventListener("click", () => window.print());
  $("report-csv").addEventListener("click", () => csv(`abtec-boletim-${reportClass}-${localDateISO()}.csv`, reportRows));
  const baseRoster = renderRoster;
  renderRoster = function () {
    baseRoster();
    const classId = rosterClassSelect.value;
    document.querySelectorAll("#roster-list .roster-row").forEach((row, index) => {
      const name = classes[classId].students[index][0], stat = frequency(classId, name);
      const detail = document.createElement("small"); detail.className = "roster-frequency"; detail.textContent = stat.rate === null ? "Sem chamada disponível" : `${stat.rate}% de presença nas chamadas`;
      row.querySelector("strong").appendChild(detail);
      const button = document.createElement("button"); button.type = "button"; button.className = "text-button student-profile"; button.textContent = "Ficha"; button.setAttribute("aria-label", `Ficha de ${name}`); button.addEventListener("click", () => showReport(classId, name)); row.appendChild(button);
    });
  };
  rosterClassSelect.addEventListener("change", () => renderRoster());
  renderRoster();

  function plannedEvents(date) {
    return Object.entries(classes).flatMap(([classId, current]) => (current.schedule || []).filter(item => item.date === date).map(item => ({ classId, title: `${current.name} · ${item.assessment ? "Avaliação" : "Aula"} de ${item.moduleName}`, assessment: item.assessment })));
  }
  const baseCalendar = renderCalendar;
  renderCalendar = function () {
    baseCalendar();
    $("calendar-grid").querySelectorAll(".calendar-day").forEach(day => {
      const events = plannedEvents(day.dataset.date); if (!events.length) return;
      day.classList.add("has-planned-lessons");
      const label = document.createElement("span"); label.className = "planned-lesson-pill"; label.textContent = `${events.length} ${events.length === 1 ? "aula" : "aulas"}${events.some(item => item.assessment) ? " · avaliação" : ""}`; day.appendChild(label);
      day.setAttribute("aria-label", `${day.getAttribute("aria-label") || day.dataset.date}. ${events.map(item => item.title).join("; ")}`);
    });
  };
  const baseAppointments = renderExistingAppointments;
  renderExistingAppointments = function (date) {
    baseAppointments(date);
    const events = plannedEvents(date); if (!events.length) return;
    const box = document.createElement("div"); box.className = "planned-event-list"; box.innerHTML = `<strong>Aulas previstas no cronograma</strong>${events.map(item => `<p>${escapeHTML(item.title)}</p>`).join("")}`; $("appointment-existing").appendChild(box);
  };
  ["previous-month", "next-month", "calendar-today"].forEach(id => $(id).addEventListener("click", renderCalendar));
  document.querySelector('[data-view="agenda"]').addEventListener("click", renderCalendar);
  renderCalendar();
})();
