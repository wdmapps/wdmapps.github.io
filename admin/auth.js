const ADMIN_EMAIL = "williamwdm@gmail.com";

// Mantém compatibilidade com a tela de login atual, mas a senha agora é validada
// pelo Firebase Authentication em vez de ficar validada no JavaScript do site.
const AUTH = {
    email: ADMIN_EMAIL,
    hash: "firebase-auth-ok"
};

const WDM_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBtE4QpAxbatvPvwFxtXwJ7KgNoZiHFpKY",
    authDomain: "wdm-admin.firebaseapp.com",
    projectId: "wdm-admin",
    storageBucket: "wdm-admin.firebasestorage.app",
    messagingSenderId: "992755555362",
    appId: "1:992755555362:web:a4793f4c40bc44adf2fe7b"
};

const ABTEC_STORAGE_KEYS = {
    lessons: "abtec-prototipo-aulas",
    classes: "abtec-prototipo-turmas",
    appointments: "abtec-prototipo-agenda"
};

let abtecCloudReady = false;
let abtecSyncTimer = null;
let abtecSyncInProgress = false;

function loadFirebaseScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (window.firebase) return resolve();
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.defer = true;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

window.WDM_FIREBASE_READY = (async () => {
    await loadFirebaseScript("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
    await loadFirebaseScript("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth-compat.js");
    await loadFirebaseScript("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore-compat.js");

    if (!firebase.apps.length) {
        firebase.initializeApp(WDM_FIREBASE_CONFIG);
    }

    return firebase;
})();

async function firebaseUser() {
    const firebaseSdk = await window.WDM_FIREBASE_READY;

    if (firebaseSdk.auth().currentUser) {
        return firebaseSdk.auth().currentUser;
    }

    return new Promise((resolve) => {
        const unsubscribe = firebaseSdk.auth().onAuthStateChanged(
            user => {
                unsubscribe();
                resolve(user || null);
            },
            () => resolve(null)
        );
    });
}

function isAllowedAdmin(user) {
    return Boolean(
        user &&
        user.email &&
        user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
    );
}

async function hashPassword(password) {
    try {
        const firebaseSdk = await window.WDM_FIREBASE_READY;
        const credential = await firebaseSdk.auth().signInWithEmailAndPassword(ADMIN_EMAIL, password);

        if (!isAllowedAdmin(credential.user)) {
            await firebaseSdk.auth().signOut();
            return "";
        }

        return AUTH.hash;
    } catch (error) {
        console.warn("Login administrativo recusado:", error?.code || error);
        return "";
    }
}

function isAuthenticated() {
    return sessionStorage.getItem("admin_auth") === "true";
}

function isAbtecPage() {
    return window.location.pathname.startsWith("/admin/abtec");
}

function getAbtecLocalSnapshot() {
    return {
        lessons: localStorage.getItem(ABTEC_STORAGE_KEYS.lessons) || "[]",
        classes: localStorage.getItem(ABTEC_STORAGE_KEYS.classes) || "",
        appointments: localStorage.getItem(ABTEC_STORAGE_KEYS.appointments) || "[]"
    };
}

function snapshotHasUsefulLocalData(snapshot) {
    return snapshot.classes !== "" || snapshot.lessons !== "[]" || snapshot.appointments !== "[]";
}

async function writeAbtecSnapshotToCloud() {
    if (!abtecCloudReady || abtecSyncInProgress) return;

    const user = await firebaseUser();
    if (!isAllowedAdmin(user)) return;

    abtecSyncInProgress = true;
    try {
        const firebaseSdk = await window.WDM_FIREBASE_READY;
        const snapshot = getAbtecLocalSnapshot();
        await firebaseSdk.firestore().collection("wdmAdmin").doc("abtec").set({
            ...snapshot,
            ownerEmail: ADMIN_EMAIL,
            updatedAt: firebaseSdk.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error("Falha ao sincronizar o Diário com o Firebase:", error);
    } finally {
        abtecSyncInProgress = false;
    }
}

function scheduleAbtecCloudWrite() {
    if (!isAbtecPage()) return;
    clearTimeout(abtecSyncTimer);
    abtecSyncTimer = setTimeout(writeAbtecSnapshotToCloud, 350);
}

// O Diário atual grava em localStorage. Mantemos isso como cache local e espelhamos
// cada alteração no Firestore, garantindo compatibilidade com todo o código existente.
const originalStorageSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
    originalStorageSetItem.call(this, key, value);

    if (this === localStorage && Object.values(ABTEC_STORAGE_KEYS).includes(key)) {
        scheduleAbtecCloudWrite();
    }
};

async function hydrateAbtecFromCloud() {
    if (!isAbtecPage()) return { reload: false };

    const firebaseSdk = await window.WDM_FIREBASE_READY;
    const user = await firebaseUser();
    if (!isAllowedAdmin(user)) return { reload: false };

    const ref = firebaseSdk.firestore().collection("wdmAdmin").doc("abtec");
    const cloudDoc = await ref.get();
    const localSnapshot = getAbtecLocalSnapshot();

    if (!cloudDoc.exists) {
        if (snapshotHasUsefulLocalData(localSnapshot)) {
            await ref.set({
                ...localSnapshot,
                ownerEmail: ADMIN_EMAIL,
                updatedAt: firebaseSdk.firestore.FieldValue.serverTimestamp()
            });
        }
        abtecCloudReady = true;
        return { reload: false };
    }

    const cloud = cloudDoc.data() || {};
    const cloudSnapshot = {
        lessons: typeof cloud.lessons === "string" ? cloud.lessons : "[]",
        classes: typeof cloud.classes === "string" ? cloud.classes : "",
        appointments: typeof cloud.appointments === "string" ? cloud.appointments : "[]"
    };

    let changed = false;
    for (const [field, storageKey] of Object.entries(ABTEC_STORAGE_KEYS)) {
        const desired = cloudSnapshot[field];
        const current = localStorage.getItem(storageKey) || (field === "classes" ? "" : "[]");
        if (desired !== current) {
            originalStorageSetItem.call(localStorage, storageKey, desired);
            changed = true;
        }
    }

    abtecCloudReady = true;
    return { reload: changed };
}

async function requireAuth() {
    document.documentElement.style.visibility = "hidden";

    try {
        const user = await firebaseUser();
        if (!isAllowedAdmin(user)) {
            sessionStorage.removeItem("admin_auth");
            window.location.replace("/admin/");
            return;
        }

        sessionStorage.setItem("admin_auth", "true");

        if (isAbtecPage()) {
            const result = await hydrateAbtecFromCloud();
            if (result.reload) {
                window.location.reload();
                return;
            }
        }

        document.documentElement.style.visibility = "";
    } catch (error) {
        console.error("Falha ao validar o acesso administrativo:", error);
        sessionStorage.removeItem("admin_auth");
        window.location.replace("/admin/");
    }
}

async function logout() {
    sessionStorage.removeItem("admin_auth");

    try {
        const firebaseSdk = await window.WDM_FIREBASE_READY;
        await firebaseSdk.auth().signOut();
    } catch (error) {
        console.warn("Não foi possível encerrar a sessão do Firebase:", error);
    } finally {
        window.location.replace("/admin/");
    }
}
