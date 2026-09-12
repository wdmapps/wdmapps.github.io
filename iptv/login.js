(() => {
    const changing = new URLSearchParams(location.search).get("trocar") === "1";
    if (!precisaLogin() && !changing) { location.replace("painel.html"); return; }
    const form = document.getElementById("formLogin");
    const provider = document.getElementById("provider");
    const server = document.getElementById("server");
    const hint = document.getElementById("serverHint");
    const erro = document.getElementById("erro");
    const btn = document.getElementById("btnEntrar");
    let providers = [];
    const savedProvider = localStorage.getItem("iptv_provider") || "playnow";
    const savedChoice = localStorage.getItem("iptv_server_choice") || "auto";

    if (changing) {
        document.querySelector(".sub").textContent = "Escolha o serviço e o DNS da sua conta";
        document.getElementById("cancelarTroca").hidden = false;
        document.getElementById("username").value = getCred().user;
        document.getElementById("password").value = getCred().pass;
    }

    function showError(message) {
        erro.textContent = message;
        erro.classList.add("mostrar");
    }

    function renderServers() {
        const selected = providers.find((item) => item.id === provider.value);
        const list = selected?.servers || [];
        server.replaceChildren();
        if (list.length) {
            server.add(new Option("Automático", "auto"));
            for (const item of list) server.add(new Option(item.label, String(item.id)));
            hint.textContent = `Automático procura um DNS disponível apenas na ${selected.label}.`;
        } else {
            server.add(new Option("DNS ainda não configurado", ""));
            hint.textContent = "O DNS deste serviço ainda precisa ser cadastrado.";
        }
        server.disabled = !list.length;
        btn.disabled = !list.length;
    }

    provider.addEventListener("change", () => {
        erro.classList.remove("mostrar");
        renderServers();
    });

    async function loadServers() {
        const data = await api("servers", {});
        if (!data?.ok || !Array.isArray(data.providers)) {
            showError("Não foi possível carregar os DNS. Recarregue esta página para tentar novamente.");
            hint.textContent = "A lista M3U por arquivo continua disponível abaixo.";
            return;
        }
        providers = data.providers;
        provider.replaceChildren(...providers.map((item) => new Option(item.label, item.id)));
        provider.value = providers.some((item) => item.id === savedProvider) ? savedProvider : providers[0]?.id || "";
        provider.disabled = false;
        renderServers();
        if ([...server.options].some((option) => option.value === savedChoice)) server.value = savedChoice;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (btn.disabled) return;
        const user = document.getElementById("username").value.trim();
        const pass = document.getElementById("password").value.trim();
        if (!user || !pass) { showError("Informe o usuário e a senha."); return; }
        erro.classList.remove("mostrar");
        const selectedProvider = provider.value, selectedServer = server.value;
        btn.disabled = provider.disabled = server.disabled = true;
        btn.textContent = "Entrando...";
        try {
            const result = await api("auth", { username: user, password: pass, provider: selectedProvider, server: selectedServer });
            if (!result?.ok) { showError(result?.message || "Não foi possível entrar."); return; }
            const previous = getCred();
            if (previous.user !== user || previous.pass !== pass || getServer() !== result.server || savedProvider !== selectedProvider) {
                for (const key of ["canal_atual", "chosen_stream_id", "chosen_serie_id", "favoritos", "recentes"]) localStorage.removeItem(key);
            }
            localStorage.setItem("username", user);
            localStorage.setItem("password", pass);
            localStorage.setItem("server", String(result.server));
            localStorage.setItem("iptv_provider", selectedProvider);
            localStorage.setItem("iptv_server_choice", selectedServer);
            localStorage.setItem("logging_in", "1");
            location.href = "painel.html";
        } catch {
            showError("Não foi possível salvar a sessão. Verifique o armazenamento do navegador.");
        } finally {
            btn.disabled = provider.disabled = server.disabled = false;
            btn.textContent = "Entrar";
        }
    });

    loadServers();
})();
