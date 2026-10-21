(function (root) {
  "use strict";
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function records(snapshot) {
    const result = new Map();
    Object.entries(snapshot.classes || {}).forEach(([id, payload]) => result.set(`class-${encodeURIComponent(id)}`, { kind: "class", id, payload }));
    for (const [field, kind] of [["lessons", "lesson"], ["appointments", "appointment"], ["grades", "grade"]]) {
      for (const payload of snapshot[field] || []) {
        const id = kind === "lesson" || kind === "grade" ? `${payload.classId}:${payload.id}` : String(payload.id);
        result.set(`${kind}-${encodeURIComponent(id)}`, { kind, id, payload });
      }
    }
    return result;
  }
  function snapshot(recordsMap) {
    const result = { classes: {}, lessons: [], appointments: [], grades: [] };
    const fields = { lesson: "lessons", appointment: "appointments", grade: "grades" };
    recordsMap.forEach(record => {
      if (record.deleted) return;
      if (record.kind === "class") result.classes[record.id] = record.payload;
      else if (fields[record.kind]) result[fields[record.kind]].push(record.payload);
    });
    return result;
  }
  function changes(base, local) {
    const result = [];
    for (const key of new Set([...base.keys(), ...local.keys()])) {
      const before = base.get(key);
      const after = local.get(key);
      if (before?.deleted && !after) continue;
      if (canonical(before?.deleted ? undefined : before?.payload) !== canonical(after?.payload)) result.push({ key, before, after });
    }
    return result;
  }
  function isConflict(before, remote, after) {
    const sameRevision = (before?.revision || 0) === (remote?.revision || 0);
    const remotePayload = remote?.deleted ? undefined : remote?.payload;
    return !sameRevision && canonical(remotePayload) !== canonical(after?.payload);
  }
  const api = { canonical, records, snapshot, changes, isConflict };
  root.AbtecSyncCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
