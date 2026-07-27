const AUTH = {
    email: "williamwdm@gmail.com",
    hash: "e9fb6bf889961dcb4d5ba9a59805b9f4bd7aeb7a43b4dee42d6797755d6ec3f1"
};

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function isAuthenticated() {
    return sessionStorage.getItem("admin_auth") === "true";
}

function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = "/admin/";
    }
}

function logout() {
    sessionStorage.removeItem("admin_auth");
    window.location.href = "/admin/";
}
