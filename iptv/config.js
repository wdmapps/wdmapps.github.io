// config.js
// O servidor é fixo e fica oculto dentro do Worker da Cloudflare.
// O usuário final nunca vê o DNS real.
const CONFIG = {
    worker: "https://ptv-proxy.williamwdm.workers.dev"
};