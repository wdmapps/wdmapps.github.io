# WDM TV Proxy — Deno Deploy

Proxy oculto para IPTV (substituto do worker da Cloudflare), deployado no
[Deno Deploy](https://dash.deno.com). Não expõe o DNS real do provedor.

## Passo a passo (uma única vez)

1. **Garanta que este repositório esteja no GitHub** (o `deno-iptv/main.ts`
   já foi enviado junto com o site).

2. No **Deno Deploy** (`https://dash.deno.com`):
   - `New Project` → `Deploy from GitHub` (conecte sua conta GitHub se pedir)
   - Selecione `wdmapps/wdmapps.github.io`
   - Configuração do projeto:
     - **Root directory:** `deno-iptv`
     - **Entry point:** `main.ts`
     - **Production branch:** `main`
   - `Create Project` — o deploy inicial roda sozinho.

3. **Variável de ambiente**: Projects → seu projeto → Settings →
   Environment Variables:
   - Nome: `DNS_LIST`
   - Valor: cole o MESMO valor que está no secret `DNS_LIST` da Cloudflare
     (ou apenas um dos servidores, separado por vírgula)
   - Salve. Em seguida clique em **Deploy** (ou faça um push que ele redeploya).

4. **Anote a URL do projeto** (algo como `https://wdm-iptv-proxy.deno.dev`).
   Ela aparece na página do projeto.

## 5. Apontar o site para o Deno

No repositório do site, edite `iptv/config.js`:
```js
const CONFIG = {
    worker: "https://SUA_URL.deno.dev"
};
```
Faça push — o GitHub Pages atualiza sozinho.

## Testes rápidos (troque usuário/senha)

```powershell
# auth
Invoke-RestMethod "https://SUA_URL.deno.dev/auth?username=USUARIO&password=SENHA"

# catálogo de séries
Invoke-RestMethod "https://SUA_URL.deno.dev/mcp?username=USUARIO&password=SENHA&action=get_series&limit=5"
```

## Observações

- O código é o mesmo `worker.js` da Cloudflare, com 2 melhorias:
  - reescrita de m3u8 em **streaming** (não estoura memória em playlists grandes)
  - segmentos **fixados no servidor que gerou a playlist** (`/m/índice/...`) —
    evita 404 por rotação de servidor e reconexões a cada ~10s
- Plano gratuito: 1 milhão de requisições/mês (o Cloudflare grátis tem
  100 mil/dia e CPU de 10 ms por requisição — o Deno é mais folgado).