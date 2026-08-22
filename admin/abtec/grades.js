const gradeStorageKey = "abtec-notas-alunos";
let editingAssessmentId = null;

const gradeNav = document.getElementById("grades-nav");
const gradeClassSelect = document.getElementById("grade-class-select");

function getGradeAssessments() {
  try {
    return JSON.parse(localStorage.getItem(gradeStorageKey)) || [];
  } catch {
    return [];
  }
}

function saveGradeAssessments(items) {
  localStorage.setItem(gradeStorageKey, JSON.stringify(items));
}

function gradeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function formatGrade(value) {
  const number = gradeNumber(value);
  if (number === null) return "—";
  return number.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function populateGradeClassSelect(preferredClassId) {
  const classId = preferredClassId && classes[preferredClassId]
    ? preferredClassId
    : (gradeClassSelect.value && classes[gradeClassSelect.value] ? gradeClassSelect.value : selectedClass);

  gradeClassSelect.innerHTML = Object.entries(classes)
    .map(([id, item]) => `<option value="${id}">${escapeHTML(item.name)}</option>`)
    .join("");
  gradeClassSelect.value = classId;
}

function studentAverage(classId, studentName) {
  const values = getGradeAssessments()
    .filter(item => item.classId === classId)
    .map(item => gradeNumber(item.grades?.[studentName]))
    .filter(value => value !== null);

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderGradesForm() {
  const classId = gradeClassSelect.value;
  const current = classes[classId];
  if (!current) return;

  const assessment = editingAssessmentId
    ? getGradeAssessments().find(item => item.id === editingAssessmentId)
    : null;

  document.getElementById("grade-assessment-title").value = assessment?.title || "";
  document.getElementById("grade-date").value = assessment?.date || localDateISO();
  document.getElementById("grade-editing-label").textContent = assessment ? "Editando avaliação" : "Nova avaliação";
  document.getElementById("cancel-grade-edit").hidden = !assessment;

  document.getElementById("grade-student-list").innerHTML = current.students.map(([name]) => {
    const average = studentAverage(classId, name);
    const value = assessment ? assessment.grades?.[name] : "";
    return `<div class="grade-student-row">
      <div class="grade-student-identity">
        <span class="student-avatar">${escapeHTML(initials(name))}</span>
        <span><strong>${escapeHTML(name)}</strong><small>Média: ${formatGrade(average)}</small></span>
      </div>
      <label class="grade-input-wrap">
        <span>Nota</span>
        <input class="grade-input" type="number" min="0" max="10" step="0.1" inputmode="decimal" data-student="${escapeHTML(name)}" value="${value ?? ""}" placeholder="0,0">
      </label>
    </div>`;
  }).join("") || `<div class="empty-state">Nenhum aluno cadastrado nesta turma.</div>`;
}

function assessmentAverage(assessment) {
  const values = Object.values(assessment.grades || {}).map(gradeNumber).filter(value => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderGradeHistory() {
  const classId = gradeClassSelect.value;
  const assessments = getGradeAssessments()
    .filter(item => item.classId === classId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  document.getElementById("grade-history-list").innerHTML = assessments.length
    ? assessments.map(item => {
        const filled = Object.values(item.grades || {}).filter(value => gradeNumber(value) !== null).length;
        return `<article class="grade-history-row">
          <div>
            <strong>${escapeHTML(item.title)}</strong>
            <span>${formatDate(item.date)} · ${filled} ${filled === 1 ? "nota lançada" : "notas lançadas"}</span>
          </div>
          <span class="grade-average-chip">Média ${formatGrade(assessmentAverage(item))}</span>
          <div class="grade-history-actions">
            <button type="button" data-edit-grade="${item.id}">Editar</button>
            <button class="danger" type="button" data-delete-grade="${item.id}">Excluir</button>
          </div>
        </article>`;
      }).join("")
    : `<div class="empty-state">Nenhuma avaliação cadastrada para esta turma.</div>`;

  document.querySelectorAll("[data-edit-grade]").forEach(button => {
    button.addEventListener("click", () => editGradeAssessment(Number(button.dataset.editGrade)));
  });
  document.querySelectorAll("[data-delete-grade]").forEach(button => {
    button.addEventListener("click", () => deleteGradeAssessment(Number(button.dataset.deleteGrade)));
  });
}

function renderGrades() {
  populateGradeClassSelect();
  renderGradesForm();
  renderGradeHistory();
}

function saveGrades() {
  const classId = gradeClassSelect.value;
  const title = document.getElementById("grade-assessment-title").value.trim();
  const date = document.getElementById("grade-date").value;
  if (!title) return showToast("Informe o nome da avaliação.");
  if (!date) return showToast("Informe a data da avaliação.");

  const grades = {};
  let invalid = false;
  document.querySelectorAll(".grade-input").forEach(input => {
    if (input.value === "") {
      grades[input.dataset.student] = null;
      return;
    }
    const value = gradeNumber(input.value);
    if (value === null || value < 0 || value > 10) invalid = true;
    else grades[input.dataset.student] = Math.round(value * 10) / 10;
  });
  if (invalid) return showToast("As notas devem estar entre 0 e 10.");

  const items = getGradeAssessments();
  if (editingAssessmentId) {
    const index = items.findIndex(item => item.id === editingAssessmentId);
    if (index >= 0) items[index] = { ...items[index], classId, title, date, grades, updatedAt: new Date().toISOString() };
  } else {
    items.push({ id: Date.now(), classId, title, date, grades, savedAt: new Date().toISOString() });
  }
  saveGradeAssessments(items);
  editingAssessmentId = null;
  renderGradesForm();
  renderGradeHistory();
  showToast("Notas salvas.");
}

function editGradeAssessment(id) {
  const item = getGradeAssessments().find(assessment => assessment.id === id);
  if (!item || !classes[item.classId]) return;
  editingAssessmentId = id;
  populateGradeClassSelect(item.classId);
  renderGradesForm();
  renderGradeHistory();
  document.getElementById("grade-assessment-title").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelGradeEdit() {
  editingAssessmentId = null;
  renderGradesForm();
}

function deleteGradeAssessment(id) {
  const item = getGradeAssessments().find(assessment => assessment.id === id);
  if (!item) return;
  if (!confirm(`Excluir as notas de “${item.title}”?`)) return;
  saveGradeAssessments(getGradeAssessments().filter(assessment => assessment.id !== id));
  if (editingAssessmentId === id) editingAssessmentId = null;
  renderGradesForm();
  renderGradeHistory();
  showToast("Avaliação excluída.");
}

function openGradesView() {
  document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === "notas-view"));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  gradeNav.classList.add("active");
  document.getElementById("view-eyebrow").textContent = "AVALIAÇÕES";
  document.getElementById("view-title").textContent = "Notas dos alunos";
  document.getElementById("view-description").textContent = "Registre avaliações e acompanhe a média de cada aluno.";
  populateGradeClassSelect(selectedClass);
  editingAssessmentId = null;
  renderGradesForm();
  renderGradeHistory();
  document.querySelector(".sidebar").classList.remove("open");
}

gradeNav.addEventListener("click", openGradesView);
document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => gradeNav.classList.remove("active")));
gradeClassSelect.addEventListener("change", () => {
  editingAssessmentId = null;
  renderGradesForm();
  renderGradeHistory();
});
document.getElementById("save-grades").addEventListener("click", saveGrades);
document.getElementById("cancel-grade-edit").addEventListener("click", cancelGradeEdit);

populateGradeClassSelect(selectedClass);
renderGradesForm();
renderGradeHistory();
