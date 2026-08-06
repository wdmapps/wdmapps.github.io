// auth.js - usa o Worker da Cloudflare como proxy (sem CORS/PHP)
async function tentarLogin(username, password) {
    if (!CONFIG || !CONFIG.dnsList || CONFIG.dnsList.length === 0) {
        return { success: false, message: "Nenhum DNS configurado no config.js." };
    }

    for (let dns of CONFIG.dnsList) {
        if (!dns) continue;
        const baseDns = dns.trim().replace(/\/+$/, "");
        const apiUrl = `${baseDns}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        // Chama o Worker do Cloudflare (configurado em CONFIG.proxyUrl)
        const proxyUrl = (CONFIG.proxyUrl || "/ptv?url=") + encodeURIComponent(apiUrl);
        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) { console.warn(`Servidor ${baseDns} indisponível (HTTP ${response.status}).`); continue; }

            const data = await response.json();
            if (data && data.user_info && data.user_info.auth === 1) {
                if (data.user_info.status === "Active") {
                    localStorage.setItem("username", username);
                    localStorage.setItem("password", password);
                    localStorage.setItem("active_dns", baseDns);
                    return { success: true };
                }
                return { success: false, message: "Esta conta encontra-se vencida ou inativa." };
            }
            console.log(`Credenciais incorretas no servidor: ${baseDns}`);
            continue;
        } catch (error) {
            console.error(`Falha técnica ao aceder ao servidor: ${baseDns}`, error);
            continue;
        }
    }
    return { success: false, message: "Usuário ou senha incorretos ou servidores offline." };
}