/* Student data is loaded only after Firebase authentication. */
let classes = JSON.parse(JSON.stringify(window.WDM_ABTEC_INITIAL.classes));
const importedRosters = window.WDM_ABTEC_INITIAL.importedRosters;

const storageKey = "abtec-prototipo-aulas";
const classStorageKey = "abtec-prototipo-turmas";
const appointmentStorageKey = "abtec-prototipo-agenda";

try {
  const savedClasses = JSON.parse(localStorage.getItem(classStorageKey));
  if (savedClasses && Object.keys(savedClasses).length) classes = savedClasses;
} catch { /* Mantém os dados iniciais caso o armazenamento esteja inválido. */ }

let selectedClass = "segunda18";
if (!classes[selectedClass]) selectedClass = Object.keys(classes)[0];
let attendance = {};
let calendarDate = new Date();

const el = id => document.getElementById(id);
const classSelect = el("class-select");
const historyClassSelect = el("history-class-select");
const rosterClassSelect = el("roster-class-select");

function escapeHTML(value) {
  return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function localDateISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(" de ", " ")
    .replace(" de ", " ");
}

function initials(name) {
  return name.split(" ").slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function populateClassSelects() {
  const options = Object.entries(classes).map(([key, item]) => `<option value="${key}">${escapeHTML(item.name)}</option>`).join("");
  classSelect.innerHTML = options;
  historyClassSelect.innerHTML = options;
  rosterClassSelect.innerHTML = options;
  classSelect.value = selectedClass;
  historyClassSelect.value = selectedClass;
  rosterClassSelect.value = selectedClass;
}

function saveClasses() {
  localStorage.setItem(classStorageKey, JSON.stringify(classes));
}

function refreshClassSelectors(classId = selectedClass) {
  selectedClass = classes[classId] ? classId : Object.keys(classes)[0];
  populateClassSelects();
  classSelect.value = selectedClass;
  historyClassSelect.value = selectedClass;
  rosterClassSelect.value = selectedClass;
  renderClass();
  renderHistory();
  renderRoster();
  renderDashboard();
}

function renderClass() {
  const current = classes[selectedClass];
  attendance = Object.fromEntries(current.students.map(([name]) => [name, null]));
  el("class-time").textContent = current.time;
  el("student-count").textContent = `${current.students.length} matriculados`;
  el("class-progress").textContent = `${combinedHistory(selectedClass).length} aulas registradas`;
  el("student-list").innerHTML = current.students.map(([name, absences], index) => `
    <div class="student-row" data-student-index="${index}">
      <div class="student-identity">
        <span class="student-avatar">${escapeHTML(initials(name))}</span>
        <span class="student-name">${escapeHTML(name)}<small class="student-absence">${absences} ${absences === 1 ? "falta acumulada" : "faltas acumuladas"}</small></span>
      </div>
      <div class="attendance-toggle" aria-label="Presença de ${escapeHTML(name)}">
        <button class="present" type="button" data-status="P" title="Presente">P</button>
        <button class="absent" type="button" data-status="F" title="Faltou">F</button>
      </div>
    </div>
  `).join("");

  el("student-list").querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => setAttendance(button.closest(".student-row"), button.dataset.status));
  });
  updateSummary();
  renderLastLesson();
}

function setAttendance(row, status) {
  const name = classes[selectedClass].students[Number(row.dataset.studentIndex)][0];
  attendance[name] = status;
  row.querySelectorAll("button").forEach(button => button.classList.toggle("selected", button.dataset.status === status));
  updateSummary();
}

function updateSummary() {
  const values = Object.values(attendance);
  const present = values.filter(value => value === "P").length;
  const absent = values.filter(value => value === "F").length;
  el("present-total").textContent = present;
  el("absent-total").textContent = absent;
  el("unmarked-total").textContent = values.length - present - absent;
}

function getSavedLessons() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || []; }
  catch { return []; }
}

function renderLastLesson() {
  const saved = getSavedLessons().filter(item => item.classId === selectedClass);
  const base = classes[selectedClass].history;
  const last = combinedHistory(selectedClass)[0];
  if (!last) {
    el("last-lesson").innerHTML = "";
    return;
  }
  const date = Array.isArray(last) ? last[0] : last.date;
  const content = Array.isArray(last) ? last[2] : last.content;
  el("last-lesson").innerHTML = `<span>Última aula registrada · ${formatDate(date)}</span><strong>${escapeHTML(content)}</strong>`;
}

function saveLesson() {
  const content = el("lesson-content").value.trim();
  const date = el("lesson-date").value;
  const unmarked = Object.values(attendance).filter(value => !value).length;
  if (!content) return showToast("Informe a matéria dada antes de salvar.");
  if (!date) return showToast("Informe a data da aula.");
  if (unmarked) return showToast(`Marque a chamada dos ${unmarked} alunos restantes.`);

  const lessons = getSavedLessons();
  if (combinedHistory(selectedClass).some(item => item.date === date) && !confirm("Já existe uma aula desta turma nesta data. Deseja registrar outra aula? Para corrigir a anterior, use Editar no Histórico.")) return;
  lessons.push({
    id: Date.now(),
    classId: selectedClass,
    date,
    module: el("module-select").value,
    content,
    note: el("lesson-note").value.trim(),
    attendance: { ...attendance },
    savedAt: new Date().toISOString()
  });
  localStorage.setItem(storageKey, JSON.stringify(lessons));
  classes[selectedClass].lessons += 1;
  classes[selectedClass].students.forEach(student => {
    if (attendance[student[0]] === "F") student[1] += 1;
  });
  saveClasses();
  el("lesson-content").value = "";
  el("lesson-note").value = "";
  document.dispatchEvent(new CustomEvent("abtec-lesson-saved"));
  renderClass();
  renderHistory();
  renderRoster();
  renderDashboard();
  showToast("Aula salva no dispositivo. Aguarde a confirmação da nuvem.");
}

function combinedHistory(classId) {
  const imported = classes[classId].history.map((item, index) => ({
    id: `imported-${index}`,
    date: item[0], module: item[1], content: item[2], imported: true,
    attendance: importedAttendance(classId, item[0])
  }));
  return [...getSavedLessons().filter(item => item.classId === classId), ...imported]
    .sort((a, b) => b.date.localeCompare(a.date));
}

function importedAttendance(classId, date) {
  const current = classes[classId];
  if (!Object.prototype.hasOwnProperty.call(current.absences, date)) return null;
  const absent = new Set(current.absences[date]);
  const roster = importedRosters[classId] || current.students.map(([name]) => name);
  return Object.fromEntries(roster.map(name => [name, absent.has(name) ? "F" : "P"]));
}

function attendanceNames(attendance) {
  if (!attendance) return null;
  const entries = Object.entries(attendance);
  return {
    present: entries.filter(([, status]) => status === "P").map(([name]) => name),
    absent: entries.filter(([, status]) => status === "F").map(([name]) => name)
  };
}

function renderHistory() {
  const classId = historyClassSelect.value || selectedClass;
  const history = combinedHistory(classId);
  el("history-list").innerHTML = history.length ? history.map(item => {
    const names = attendanceNames(item.attendance);
    const present = names?.present.length || 0;
    const absent = names?.absent.length || 0;
    return `<article class="history-item">
      <button class="history-summary" type="button" aria-expanded="false">
        <span class="history-date">${formatDate(item.date)}</span>
        <span class="history-content"><strong>${escapeHTML(item.content)}</strong><span>${escapeHTML(item.module)}${item.note ? ` · ${escapeHTML(item.note)}` : ""}${item.imported ? " · importado da planilha" : ""}</span></span>
        <span class="history-stats">${names ? `<span class="stat-present">${present} ${present === 1 ? "presente" : "presentes"}</span><span class="stat-absent">${absent} ${absent === 1 ? "falta" : "faltas"}</span><span class="expand-label">Ver chamada</span>` : `<span class="stat-missing">Chamada não localizada</span>`}</span>
      </button>
      ${names ? `<div class="attendance-details">
        <div class="attendance-group present-group"><h3><span>✓</span> Presentes <b>${present}</b></h3><div>${names.present.map(name => `<span>${escapeHTML(name)}</span>`).join("") || "<em>Nenhum aluno presente</em>"}</div></div>
        <div class="attendance-group absent-group"><h3><span>×</span> Faltaram <b>${absent}</b></h3><div>${names.absent.map(name => `<span>${escapeHTML(name)}</span>`).join("") || "<em>Nenhuma falta nesta aula</em>"}</div></div>
      </div>` : `<div class="attendance-details unavailable-details"><p>A planilha não possui uma chamada vinculada a esta mesma data.</p></div>`}
    </article>`;
  }).join("") : `<div class="empty-state">Nenhuma aula registrada para esta turma.</div>`;

  el("history-list").querySelectorAll(".history-summary").forEach(button => {
    button.addEventListener("click", () => {
      const item = button.closest(".history-item");
      const expanded = item.classList.toggle("expanded");
      button.setAttribute("aria-expanded", expanded);
      const label = button.querySelector(".expand-label");
      if (label) label.textContent = expanded ? "Fechar chamada" : "Ver chamada";
    });
  });
}

function renderRoster() {
  const current = classes[rosterClassSelect.value || selectedClass];
  const max = Math.max(...current.students.map(item => item[1]), 1);
  el("roster-list").innerHTML = current.students.map(([name, absences], index) => `
    <div class="roster-row">
      <strong>${escapeHTML(name)}</strong>
      <div class="absence-bar ${absences >= 5 ? "high" : ""}"><span style="width:${Math.round(absences / max * 100)}%"></span></div>
      <span>${absences} ${absences === 1 ? "falta" : "faltas"}</span>
      <button class="delete-student" type="button" data-student-index="${index}" aria-label="Excluir ${escapeHTML(name)}" title="Excluir aluno">×</button>
    </div>
  `).join("") || `<div class="empty-state">Nenhum aluno cadastrado nesta turma.</div>`;

  el("roster-list").querySelectorAll(".delete-student").forEach(button => {
    button.addEventListener("click", () => deleteStudent(current.students[Number(button.dataset.studentIndex)][0]));
  });
}

function allAttendanceRecords() {
  const imported = Object.keys(classes).flatMap(classId => combinedHistory(classId).filter(item => item.attendance));
  return imported;
}

function renderDashboard() {
  const classEntries = Object.entries(classes).map(([id, item]) => ({ ...item, recordedLessons: combinedHistory(id).length }));
  const students = classEntries.flatMap(item => item.students.map(([name, absences]) => ({ name, absences, className: item.name })));
  const totalAbsences = students.reduce((sum, item) => sum + Number(item.absences || 0), 0);
  const attendanceValues = allAttendanceRecords().flatMap(item => Object.values(item.attendance));
  const attendanceRate = attendanceValues.length ? Math.round(attendanceValues.filter(status => status === "P").length / attendanceValues.length * 100) : 0;

  el("dashboard-classes").textContent = classEntries.length;
  el("dashboard-students").textContent = students.length;
  el("dashboard-absences").textContent = totalAbsences;
  el("dashboard-attendance").textContent = `${attendanceRate}%`;

  el("dashboard-class-list").innerHTML = classEntries.map(item => {
    const absences = item.students.reduce((sum, student) => sum + Number(student[1] || 0), 0);
    return `<div class="dashboard-class-row">
      <strong>${escapeHTML(item.name)}</strong>
      <div class="dashboard-data"><span>Alunos</span><strong>${item.students.length}</strong></div>
      <div class="dashboard-data"><span>Aulas</span><strong>${item.recordedLessons}</strong></div>
      <div class="dashboard-data"><span>Faltas</span><strong>${absences}</strong></div>
    </div>`;
  }).join("") || `<div class="empty-state">Nenhuma turma cadastrada.</div>`;

  const attention = students.filter(item => item.absences > 0).sort((a, b) => b.absences - a.absences).slice(0, 7);
  el("dashboard-attention-list").innerHTML = attention.map((item, index) => `<div class="attention-row">
    <span class="attention-rank">${String(index + 1).padStart(2, "0")}</span>
    <span class="attention-name"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.className)}</span></span>
    <span class="absence-count">${item.absences} ${item.absences === 1 ? "falta" : "faltas"}</span>
  </div>`).join("") || `<div class="empty-state">Nenhuma falta registrada.</div>`;
}

function getAppointments() {
  try { return JSON.parse(localStorage.getItem(appointmentStorageKey)) || []; }
  catch { return []; }
}

function saveAppointments(appointments) {
  localStorage.setItem(appointmentStorageKey, JSON.stringify(appointments));
}

function calendarISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstDay.getDay());
  const appointments = getAppointments();
  el("calendar-month-label").textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(firstDay);

  el("calendar-grid").innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const iso = calendarISO(date.getFullYear(), date.getMonth(), date.getDate());
    const dayAppointments = appointments.filter(item => item.date === iso).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    return `<button class="calendar-day ${date.getMonth() !== month ? "outside" : ""} ${iso === localDateISO() ? "today" : ""}" type="button" data-date="${iso}" aria-label="${date.toLocaleDateString("pt-BR")}">
      <span class="day-number">${date.getDate()}</span>
      <span class="day-appointments">${dayAppointments.slice(0, 3).map(item => `<span class="appointment-pill">${item.time ? `<time>${item.time}</time>` : ""}${escapeHTML(item.title)}</span>`).join("")}${dayAppointments.length > 3 ? `<span class="more-appointments">+${dayAppointments.length - 3} tarefas</span>` : ""}</span>
    </button>`;
  }).join("");

  el("calendar-grid").querySelectorAll(".calendar-day").forEach(day => day.addEventListener("click", () => openAppointmentDialog(day.dataset.date)));
}

function openAppointmentDialog(date) {
  el("appointment-date").value = date;
  el("appointment-date-label").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
  renderExistingAppointments(date);
  openDialog(el("appointment-dialog"));
}

function renderExistingAppointments(date) {
  const appointments = getAppointments().filter(item => item.date === date).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  el("appointment-existing").innerHTML = appointments.length ? `<strong>Compromissos deste dia</strong>${appointments.map(item => `<div class="existing-appointment"><span>${escapeHTML(item.title)}${item.time ? `<small>${item.time}</small>` : ""}</span><button type="button" data-id="${item.id}" aria-label="Excluir tarefa">×</button></div>`).join("")}` : "";
  el("appointment-existing").querySelectorAll("button").forEach(button => button.addEventListener("click", () => deleteAppointment(Number(button.dataset.id))));
}

function createAppointment(event) {
  event.preventDefault();
  const title = el("appointment-title").value.trim();
  const date = el("appointment-date").value;
  if (!title || !date) return;
  const appointments = getAppointments();
  appointments.push({ id: Date.now(), date, title, time: el("appointment-time").value });
  saveAppointments(appointments);
  event.target.reset();
  closeDialog(el("appointment-dialog"));
  renderCalendar();
  showToast("Tarefa adicionada à agenda.");
}

function deleteAppointment(id) {
  const date = el("appointment-date").value;
  saveAppointments(getAppointments().filter(item => item.id !== id));
  renderExistingAppointments(date);
  renderCalendar();
  showToast("Tarefa excluída.");
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  requestAnimationFrame(() => dialog.querySelector("input")?.focus());
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function createClass(event) {
  event.preventDefault();
  const name = el("new-class-name").value.trim();
  const time = el("new-class-time").value;
  if (!name || !time) return;
  if (Object.values(classes).some(item => item.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
    return showToast("Já existe uma turma com esse nome.");
  }
  const id = `turma-${Date.now()}`;
  classes[id] = { name, shortName: name, time, lessons: 0, students: [], history: [], absences: {} };
  saveClasses();
  closeDialog(el("class-dialog"));
  event.target.reset();
  refreshClassSelectors(id);
  showToast("Turma criada com sucesso.");
}

function deleteClass() {
  if (Object.keys(classes).length === 1) return showToast("É necessário manter pelo menos uma turma.");
  const current = classes[selectedClass];
  if (!confirm(`Excluir a turma “${current.name}” e seus registros locais?`)) return;
  delete classes[selectedClass];
  saveClasses();
  localStorage.setItem(storageKey, JSON.stringify(getSavedLessons().filter(item => item.classId !== selectedClass)));
  refreshClassSelectors(Object.keys(classes)[0]);
  showToast("Turma excluída.");
}

function createStudent(event) {
  event.preventDefault();
  const classId = rosterClassSelect.value;
  const name = el("new-student-name").value.trim();
  if (!name) return;
  if (classes[classId].students.some(([student]) => student.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
    return showToast("Este aluno já está cadastrado na turma.");
  }
  classes[classId].students.push([name, 0]);
  saveClasses();
  closeDialog(el("student-dialog"));
  event.target.reset();
  if (classId === selectedClass) renderClass();
  renderRoster();
  renderDashboard();
  showToast("Aluno adicionado à turma.");
}

function deleteStudent(name) {
  const classId = rosterClassSelect.value;
  if (!confirm(`Excluir ${name} da turma “${classes[classId].name}”?`)) return;
  classes[classId].students = classes[classId].students.filter(([student]) => student !== name);
  saveClasses();
  if (classId === selectedClass) renderClass();
  renderRoster();
  renderDashboard();
  showToast("Aluno excluído da turma.");
}

function switchView(view) {
  document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === `${view}-view`));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const titles = {
    home: ["VISÃO GERAL", "Painel administrativo", "Acompanhe os principais números da escola."],
    chamada: ["REGISTRO DE AULA", "Diário de classe", "Registre a presença e o conteúdo aplicado em poucos passos."],
    historico: ["CONSULTA", "Histórico de aulas", "Consulte o conteúdo aplicado em cada turma."],
    alunos: ["ACOMPANHAMENTO", "Alunos e faltas", "Veja rapidamente quem precisa de atenção."],
    agenda: ["PLANEJAMENTO", "Agenda mensal", "Organize aulas, provas e tarefas importantes."]
  };
  [el("view-eyebrow").textContent, el("view-title").textContent, el("view-description").textContent] = titles[view];
  if (view === "home") renderDashboard();
  if (view === "historico") renderHistory();
  if (view === "alunos") renderRoster();
  if (view === "agenda") renderCalendar();
  document.querySelector(".sidebar").classList.remove("open");
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  el("toast").textContent = message;
  el("toast").classList.add("show");
  toastTimer = setTimeout(() => el("toast").classList.remove("show"), 2800);
}

const now = new Date();
el("weekday-label").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(now);
el("today-label").textContent = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(now);
el("lesson-date").value = localDateISO();

populateClassSelects();
renderClass();
renderHistory();
renderRoster();
renderDashboard();
renderCalendar();

classSelect.addEventListener("change", event => {
  selectedClass = event.target.value;
  historyClassSelect.value = selectedClass;
  rosterClassSelect.value = selectedClass;
  renderClass();
});
historyClassSelect.addEventListener("change", renderHistory);
rosterClassSelect.addEventListener("change", renderRoster);
el("new-class").addEventListener("click", () => openDialog(el("class-dialog")));
el("delete-class").addEventListener("click", deleteClass);
el("class-form").addEventListener("submit", createClass);
el("new-student").addEventListener("click", () => {
  el("student-dialog-class").textContent = `Turma: ${classes[rosterClassSelect.value].name}`;
  openDialog(el("student-dialog"));
});
el("student-form").addEventListener("submit", createStudent);
el("appointment-form").addEventListener("submit", createAppointment);
el("previous-month").addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1); renderCalendar(); });
el("next-month").addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1); renderCalendar(); });
el("calendar-today").addEventListener("click", () => { calendarDate = new Date(); renderCalendar(); });
document.querySelectorAll(".cancel-button").forEach(button => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
el("all-present").addEventListener("click", () => {
  document.querySelectorAll(".student-row").forEach(row => setAttendance(row, "P"));
});
el("save-lesson").addEventListener("click", saveLesson);
el("menu-button").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => switchView(item.dataset.view)));
