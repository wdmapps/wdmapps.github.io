/* Private data stays in Firestore. Legacy documents and local backups are retained. */
(() => {
  "use strict";
  const keys = { classes: "abtec-prototipo-turmas", lessons: "abtec-prototipo-aulas", appointments: "abtec-prototipo-agenda", grades: "abtec-notas-alunos" };
  const core = window.AbtecSyncCore;
  const nativeSet = Storage.prototype.setItem;
  let db, collection, baseline = new Map(), pendingRemote = null, ready = false, applying = false, classOrder = [];
  let timer, running = null, dirty = false, uiReady = false, message = "Conectando…", tone = "pending";
  const parse = (raw, fallback) => raw ? JSON.parse(raw) : fallback;
  function localSnapshot() {
    return Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, parse(localStorage.getItem(key), field === "classes" ? {} : [])]));
  }
  function backup(reason) {
    const data = { version: 2, createdAt: new Date().toISOString(), reason, data: Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, localStorage.getItem(key)])), drafts: localStorage.getItem("abtec-drafts-v2") };
    for (const key of Object.keys(localStorage).filter(key => key.startsWith("abtec-backup-v2-"))) {
      try { const previous = JSON.parse(localStorage.getItem(key)); if (core.canonical(previous.data) === core.canonical(data.data) && previous.drafts === data.drafts) return previous; } catch { /* Preserve older copies even if their format differs. */ }
    }
    nativeSet.call(localStorage, `abtec-backup-v2-${Date.now()}`, JSON.stringify(data));
    return data;
  }
  function status(text, state = "pending") {
    message = text; tone = state;
    document.querySelectorAll("[data-abtec-sync]").forEach(node => { node.textContent = message; node.dataset.state = tone; });
    document.querySelectorAll("[data-sync-retry]").forEach(node => { node.hidden = tone !== "error" && tone !== "conflict"; });
  }
  function apply(map) {
    const value = core.snapshot(map);
    if (!Object.keys(value.classes).length) throw Error("A nuvem não retornou turmas. A cópia local foi preservada.");
    value.classes = Object.fromEntries([...new Set([...classOrder, ...Object.keys(value.classes)])].filter(id => value.classes[id]).map(id => [id, value.classes[id]]));
    applying = true;
    try { for (const [field, key] of Object.entries(keys)) nativeSet.call(localStorage, key, JSON.stringify(value[field])); }
    finally { applying = false; }
    baseline = map;
    if (uiReady) window.dispatchEvent(new CustomEvent("abtec-cloud-updated"));
  }
  function fromQuery(query) {
    const map = new Map();
    query.forEach(doc => { const value = doc.data(); map.set(doc.id, { ...value, payload: JSON.parse(value.payload || "null") }); });
    return map;
  }
  function scheduleWrite() {
    if (!ready || applying) return;
    dirty = true; status("Alterações salvas no dispositivo. Sincronizando…");
    clearTimeout(timer); timer = setTimeout(() => flush(), 500);
  }
  async function flush() {
    if (!ready) return false;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      try {
        while (dirty) {
          dirty = false;
          const updates = core.changes(baseline, core.records(localSnapshot()));
          if (!updates.length) break;
          if (updates.length > 400) throw Error("Muitas alterações pendentes. Exporte uma cópia de segurança e tente novamente.");
          status("Salvando na nuvem…");
          const committed = await db.runTransaction(async transaction => {
            const docs = await Promise.all(updates.map(item => transaction.get(collection.doc(item.key))));
            return updates.map((item, index) => {
              const doc = docs[index];
              const data = doc.exists ? doc.data() : undefined;
              const remote = data ? { ...data, payload: JSON.parse(data.payload || "null") } : undefined;
              if (core.isConflict(item.before, remote, item.after)) {
                const error = Error("Este registro foi alterado em outra sessão. Sua versão está guardada neste dispositivo. Exporte o backup antes de atualizar os dados.");
                error.code = "abtec/conflict"; throw error;
              }
              const source = item.after || item.before;
              const value = { kind: source.kind, id: source.id, payload: item.after ? JSON.stringify(item.after.payload) : JSON.stringify(item.before.payload), deleted: !item.after, revision: (remote?.revision || 0) + 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
              transaction.set(collection.doc(item.key), value);
              return { key: item.key, value: { ...value, payload: source.payload } };
            });
          });
          committed.forEach(item => baseline.set(item.key, item.value));
          dirty = core.changes(baseline, core.records(localSnapshot())).length > 0;
        }
        status(navigator.onLine ? "Sincronizado com a nuvem" : "Sem conexão — dados preservados no dispositivo", navigator.onLine ? "ok" : "error");
        if (pendingRemote && !dirty) {
          pendingRemote = null;
          const next = fromQuery(await collection.get({ source: "server" }));
          if (!dirty && !window.WDM_ABTEC_HAS_DRAFT?.()) apply(next);
          else pendingRemote = next;
        }
        return true;
      } catch (error) {
        dirty = true;
        try { backup(error.code === "abtec/conflict" ? "conflito" : "falha-sincronizacao"); } catch { /* Existing local records stay intact even if backup storage is full. */ }
        status(error.code === "abtec/conflict" ? error.message : "Falha ao sincronizar. Os dados continuam neste dispositivo. Tente novamente.", error.code === "abtec/conflict" ? "conflict" : "error");
        return false;
      } finally { running = null; }
    });
    return running;
  }
  async function hydrate() {
    backup("antes-da-atualizacao");
    const sdk = await window.WDM_FIREBASE_READY;
    db = sdk.firestore();
    const ref = db.collection("wdmAdmin").doc("abtec");
    collection = ref.collection("records");
    const doc = await ref.get({ source: "server" });
    if (!doc.exists) throw Error("Base do diário não encontrada. Nenhum dado local foi substituído.");
    const cloud = doc.data();
    const seedClasses = parse(cloud.seedClasses, null), seedRosters = parse(cloud.seedRosters, null);
    if (!seedClasses || !seedRosters) throw Error("Base inicial privada indisponível.");
    classOrder = Object.keys(parse(cloud.classes, seedClasses));
    window.WDM_ABTEC_INITIAL = { classes: seedClasses, importedRosters: seedRosters };
    if (cloud.schemaVersion !== 2) {
      const legacy = { classes: parse(cloud.classes, seedClasses), lessons: parse(cloud.lessons, []), appointments: parse(cloud.appointments, []), grades: parse(cloud.grades, []) };
      const entries = [...core.records(legacy)];
      if (entries.length > 400) throw Error("Migração requer revisão. Os dados originais foram preservados.");
      await db.runTransaction(async transaction => {
        const current = await transaction.get(ref);
        if (current.data().schemaVersion === 2) return;
        if (current.data().classes !== cloud.classes || current.data().lessons !== cloud.lessons || current.data().appointments !== cloud.appointments) throw Error("A base foi atualizada em outra sessão. Reabra o diário.");
        for (const [key, item] of entries) transaction.set(collection.doc(key), { kind: item.kind, id: item.id, payload: JSON.stringify(item.payload), revision: 1, deleted: false, updatedAt: sdk.firestore.FieldValue.serverTimestamp() });
        transaction.update(ref, { schemaVersion: 2, migratedAt: sdk.firestore.FieldValue.serverTimestamp() });
      });
    }
    const localGrades = parse(localStorage.getItem(keys.grades), []);
    const map = fromQuery(await collection.get({ source: "server" }));
    apply(map);
    // Older versions stored grades only locally. Add each missing assessment; never replace a remote assessment.
    const snapshot = localSnapshot();
    const ids = new Set(snapshot.grades.map(item => `${item.classId}:${item.id}`));
    let imported = false, differingGrades = false;
    for (const grade of localGrades) {
      if (!ids.has(`${grade.classId}:${grade.id}`)) { snapshot.grades.push(grade); ids.add(`${grade.classId}:${grade.id}`); imported = true; }
      else if (core.canonical(grade) !== core.canonical(snapshot.grades.find(item => item.classId === grade.classId && item.id === grade.id))) differingGrades = true;
    }
    if (imported) nativeSet.call(localStorage, keys.grades, JSON.stringify(snapshot.grades));
    ready = true;
    if (imported) { dirty = true; await flush(); } else status("Sincronizado com a nuvem", "ok");
    if (differingGrades) status("Há uma versão local diferente de avaliações. A cópia anterior foi preservada; baixe o backup para conferi-la.", "conflict");
    collection.onSnapshot({ includeMetadataChanges: true }, query => {
      if (query.metadata.hasPendingWrites || query.metadata.fromCache) return;
      const next = fromQuery(query);
      if (dirty || running || window.WDM_ABTEC_HAS_DRAFT?.()) { pendingRemote = next; return; }
      if (core.canonical(core.snapshot(next)) !== core.canonical(core.snapshot(baseline))) apply(next);
    }, () => status("Conexão com a nuvem interrompida. Seus dados locais foram preservados.", "error"));
    return { reload: false };
  }
  async function confirmAssessment(assessment) {
    if (!await flush()) return false;
    try {
      const key = `grade-${encodeURIComponent(`${assessment.classId}:${assessment.id}`)}`;
      const doc = await collection.doc(key).get({ source: "server" });
      const remote = doc.exists ? doc.data() : null;
      if (!remote || remote.deleted || core.canonical(JSON.parse(remote.payload)) !== core.canonical(assessment)) {
        status("O salvamento desta avaliação não foi confirmado. A versão local foi preservada.", "error");
        return false;
      }
      status("Sincronizado com a nuvem", "ok");
      return true;
    } catch {
      status("Não foi possível confirmar as notas na nuvem. A versão local foi preservada.", "error");
      return false;
    }
  }
  Storage.prototype.setItem = function (key, value) {
    nativeSet.call(this, key, value);
    if (this === localStorage && Object.values(keys).includes(key)) scheduleWrite();
  };
  window.addEventListener("online", () => { if (dirty) flush(); });
  window.addEventListener("offline", () => status("Sem conexão — dados preservados no dispositivo", "error"));
  window.addEventListener("beforeunload", event => { if (dirty || running) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("abtec-app-ready", () => { uiReady = true; status(message, tone); });
  window.WDM_ABTEC_SYNC = { hydrate, scheduleWrite, flush, confirmAssessment, backup, localSnapshot, status,
    get dirty() { return dirty || Boolean(running); },
    async refresh() { if (running) await running; clearTimeout(timer); backup("antes-de-atualizar-nuvem"); const next = fromQuery(await collection.get({ source: "server" })); backup("atualizacao-recebida"); dirty = false; pendingRemote = null; apply(next); status("Sincronizado com a nuvem", "ok"); },
    retry() { return flush(); }
  };
})();
