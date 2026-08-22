(() => {
  const TOTAL_LESSONS = 33;
  const scheduleModules = [
    { number: 1, name: "Windows", start: 1, end: 8 },
    { number: 2, name: "Word", start: 9, end: 16 },
    { number: 3, name: "Excel", start: 17, end: 28 },
    { number: 4, name: "PowerPoint", start: 29, end: 33 }
  ];
  const assessmentLessons = new Set([8, 16, 28, 33]);

  if (!document.querySelector('link[href="schedule.css"]')) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "schedule.css";
    document.head.appendChild(style);
  }

  function isoDate(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function parseISO(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function dateToISO(date) {
    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function addDays(iso, days) {
    const date = parseISO(iso);
    date.setUTCDate(date.getUTCDate() + days);
    return dateToISO(date);
  }

  function easterISO(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return isoDate(year, month, day);
  }

  function holidayMap(year) {
    const easter = easterISO(year);
    const holidays = new Map([
      [`${year}-01-01`, "Confraternização Universal"],
      [addDays(easter, -2), "Paixão de Cristo"],
      [`${year}-04-21`, "Tiradentes"],
      [`${year}-05-01`, "Dia do Trabalho"],
      [addDays(easter, 60), "Corpus Christi"],
      [`${year}-06-16`, "Aniversário de Salto"],
      [`${year}-07-09`, "Revolução Constitucionalista"],
      [`${year}-09-07`, "Independência do Brasil"],
      [`${year}-09-08`, "Nossa Senhora do Monte Serrat"],
      [`${year}-10-12`, "Nossa Senhora Aparecida"],
      [`${year}-11-02`, "Finados"],
      [`${year}-11-15`, "Proclamação da República"],
      [`${year}-11-20`, "Consciência Negra"],
      [`${year}-12-25`, "Natal"]
    ]);
    return holidays;
  }

  function holidayName(iso) {
    const year = Number(String(iso).slice(0, 4));
    return holidayMap(year).get(iso) || null;
  }

  function moduleForLesson(lesson) {
    return scheduleModules.find(module => lesson >= module.start && lesson <= module.end) || scheduleModules[0];
  }

  function generateSchedule(startDate) {
    const schedule = [];
    const skipped = [];
    let candidate = startDate;

    while (schedule.length < TOTAL_LESSONS) {
      const holiday = holidayName(candidate);
      if (holiday) {
        skipped.push({ date: candidate, holiday });
      } else {
        const lesson = schedule.length + 1;
        const module = moduleForLesson(lesson);
        schedule.push({
          lesson,
          date: candidate,
          module: module.number,
          moduleName: module.name,
          assessment: assessmentLessons.has(lesson)
        });
      }
      candidate = addDays(candidate, 7);
    }

    return { schedule, skipped };
  }

  function formatScheduleDate(iso) {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
      .format(parseISO(iso));
  }

  function getAdministeredDates(classId) {
    const dates = new Set();
    try {
      combinedHistory(classId).forEach(item => dates.add(item.date));
    } catch {
      (classes[classId]?.history || []).forEach(item => dates.add(item[0]));
      try {
        getSavedLessons().filter(item => item.classId === classId).forEach(item => dates.add(item.date));
      } catch { /* mantém datas importadas */ }
    }
    return dates;
  }

  function scheduleStatus(classId, date) {
    if (getAdministeredDates(classId).has(date)) return { label: "Ministrada", className: "done" };
    if (date < localDateISO()) return { label: "Pendente", className: "pending" };
    return { label: "Agendada", className: "planned" };
  }

  function saveScheduleForClass(classId, startDate) {
    if (!classes[classId] || !startDate) return;
    const generated = generateSchedule(startDate);
    classes[classId].startDate = startDate;
    classes[classId].totalLessons = TOTAL_LESSONS;
    classes[classId].schedule = generated.schedule;
    classes[classId].skippedHolidays = generated.skipped;
    saveClasses();
  }

  function ensureClassStartField() {
    const form = document.getElementById("class-form");
    if (!form || document.getElementById("new-class-start")) return;
    const timeField = document.getElementById("new-class-time")?.closest(".field");
    if (!timeField) return;
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML = `
      <label for="new-class-start">Data da primeira aula</label>
      <input id="new-class-start" type="date" required>
      <small class="new-class-start-note">O sistema cria 33 aulas semanais e pula automaticamente os feriados.</small>`;
    timeField.after(field);
  }

  function ensureScheduleNavigation() {
    const nav = document.querySelector(".main-nav");
    if (!nav || document.getElementById("schedule-nav")) return;
    const button = document.createElement("button");
    button.className = "schedule-nav-item";
    button.id = "schedule-nav";
    button.type = "button";
    button.innerHTML = `<span class="nav-icon" aria-hidden="true">33</span> Cronograma`;
    const agendaButton = nav.querySelector('[data-view="agenda"]');
    nav.insertBefore(button, agendaButton || null);
  }

  function ensureScheduleView() {
    if (document.getElementById("cronograma-view")) return;
    const content = document.querySelector(".content");
    const agendaView = document.getElementById("agenda-view");
    if (!content) return;

    const view = document.createElement("div");
    view.id = "cronograma-view";
    view.className = "view";
    view.innerHTML = `
      <section class="schedule-toolbar card">
        <div class="field">
          <label for="schedule-class-select">Turma</label>
          <select id="schedule-class-select"></select>
        </div>
        <div class="field">
          <label for="schedule-start-date">Primeira aula</label>
          <input id="schedule-start-date" type="date">
        </div>
        <button class="primary-button" id="generate-schedule" type="button">Gerar 33 aulas <span>→</span></button>
      </section>
      <section class="card schedule-card">
        <div class="section-heading">
          <div><span class="step">33</span><div><h2>Cronograma de aulas</h2><p>Datas semanais de referência, com feriados pulados automaticamente.</p></div></div>
          <span class="schedule-progress" id="schedule-progress">0/33 aulas ministradas</span>
        </div>
        <div class="schedule-holidays" id="schedule-holidays"></div>
        <div id="schedule-content"></div>
      </section>`;

    content.insertBefore(view, agendaView || null);
  }

  function populateScheduleClasses(preferredClassId) {
    const select = document.getElementById("schedule-class-select");
    if (!select) return;
    const current = preferredClassId && classes[preferredClassId]
      ? preferredClassId
      : (select.value && classes[select.value] ? select.value : selectedClass);
    select.innerHTML = Object.entries(classes)
      .map(([id, item]) => `<option value="${id}">${escapeHTML(item.name)}</option>`)
      .join("");
    if (current) select.value = current;
  }

  function currentScheduleClassId() {
    return document.getElementById("schedule-class-select")?.value || selectedClass;
  }

  function renderSchedule() {
    populateScheduleClasses();
    const classId = currentScheduleClassId();
    const current = classes[classId];
    const startInput = document.getElementById("schedule-start-date");
    const content = document.getElementById("schedule-content");
    const holidayBox = document.getElementById("schedule-holidays");
    const progress = document.getElementById("schedule-progress");
    if (!current || !content) return;

    if (startInput) startInput.value = current.startDate || "";

    if (!current.startDate) {
      if (holidayBox) holidayBox.innerHTML = "";
      if (progress) progress.textContent = `0/${TOTAL_LESSONS} aulas ministradas`;
      content.innerHTML = `<div class="schedule-empty">Defina a data da primeira aula para gerar o cronograma desta turma.</div>`;
      return;
    }

    if (!Array.isArray(current.schedule) || current.schedule.length !== TOTAL_LESSONS) {
      saveScheduleForClass(classId, current.startDate);
    }

    const schedule = classes[classId].schedule || [];
    const skipped = classes[classId].skippedHolidays || [];
    const administered = getAdministeredDates(classId);
    const administeredCount = schedule.filter(item => administered.has(item.date)).length;
    if (progress) progress.textContent = `${administeredCount}/${TOTAL_LESSONS} aulas ministradas`;

    if (holidayBox) {
      holidayBox.innerHTML = skipped.length
        ? `<strong>Feriados pulados no cronograma</strong>${skipped.map(item => `${formatScheduleDate(item.date)} — ${escapeHTML(item.holiday)}`).join(" · ")}`
        : "";
    }

    content.innerHTML = `<div class="schedule-table-wrap"><table class="schedule-table">
      <thead><tr><th>Aula</th><th>Data</th><th>Módulo</th><th>Curso</th><th>Tipo</th><th>Avaliação</th><th>Status</th></tr></thead>
      <tbody>${schedule.map(item => {
        const status = scheduleStatus(classId, item.date);
        return `<tr>
          <td class="schedule-number">${item.lesson}</td>
          <td class="schedule-date">${formatScheduleDate(item.date)}</td>
          <td>${item.module}</td>
          <td class="schedule-module">${escapeHTML(item.moduleName)}</td>
          <td><span class="schedule-chip ${item.assessment ? "assessment" : "practice"}">${item.assessment ? "Avaliação" : "Prática"}</span></td>
          <td><span class="schedule-chip ${item.assessment ? "yes" : "no"}">${item.assessment ? "Sim" : "Não"}</span></td>
          <td><span class="schedule-chip ${status.className}">${status.label}</span></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function openScheduleView() {
    document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === "cronograma-view"));
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    document.getElementById("grades-nav")?.classList.remove("active");
    document.getElementById("schedule-nav")?.classList.add("active");
    document.getElementById("view-eyebrow").textContent = "PLANEJAMENTO";
    document.getElementById("view-title").textContent = "Cronograma de aulas";
    document.getElementById("view-description").textContent = "Acompanhe as 33 aulas previstas da turma e os feriados que alteram o calendário.";
    populateScheduleClasses(selectedClass);
    renderSchedule();
    document.querySelector(".sidebar")?.classList.remove("open");
  }

  ensureClassStartField();
  ensureScheduleNavigation();
  ensureScheduleView();
  populateScheduleClasses(selectedClass);

  const classForm = document.getElementById("class-form");
  classForm?.addEventListener("submit", () => {
    const startDate = document.getElementById("new-class-start")?.value;
    const beforeIds = new Set(Object.keys(classes));
    setTimeout(() => {
      const newClassId = Object.keys(classes).find(id => !beforeIds.has(id));
      if (!newClassId || !startDate) return;
      saveScheduleForClass(newClassId, startDate);
      populateScheduleClasses(newClassId);
      renderSchedule();
    }, 0);
  }, true);

  document.getElementById("schedule-nav")?.addEventListener("click", openScheduleView);
  document.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => document.getElementById("schedule-nav")?.classList.remove("active")));
  document.getElementById("grades-nav")?.addEventListener("click", () => document.getElementById("schedule-nav")?.classList.remove("active"));
  document.getElementById("schedule-class-select")?.addEventListener("change", renderSchedule);
  document.getElementById("generate-schedule")?.addEventListener("click", () => {
    const classId = currentScheduleClassId();
    const startDate = document.getElementById("schedule-start-date")?.value;
    if (!startDate) return showToast("Informe a data da primeira aula.");
    saveScheduleForClass(classId, startDate);
    renderSchedule();
    showToast("Cronograma de 33 aulas gerado.");
  });
})();
