const ADMIN_EMAIL = "williamwdm@gmail.com";

const WDM_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBtE4QpAxbatvPvwFxtXwJ7KgNoZiHFpKY",
    authDomain: "wdm-admin.firebaseapp.com",
    projectId: "wdm-admin",
    storageBucket: "wdm-admin.firebasestorage.app",
    messagingSenderId: "992755555362",
    appId: "1:992755555362:web:a4793f4c40bc44adf2fe7b"
};

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

async function waitForAdminAuth() {
    const firebaseSdk = await window.WDM_FIREBASE_READY;

    return new Promise((resolve) => {
        const unsubscribe = firebaseSdk.auth().onAuthStateChanged(
            user => {
                unsubscribe();
                const allowed = user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                if (allowed) {
                    sessionStorage.setItem("admin_auth", "true");
                    resolve(user);
                } else {
                    sessionStorage.removeItem("admin_auth");
                    resolve(null);
                }
            },
            () => {
                sessionStorage.removeItem("admin_auth");
                resolve(null);
            }
        );
    });
}

function isAuthenticated() {
    return sessionStorage.getItem("admin_auth") === "true";
}

async function requireAuth() {
    document.documentElement.style.visibility = "hidden";

    try {
        const user = await waitForAdminAuth();
        if (!user) {
            window.location.replace("/admin/");
            return;
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
