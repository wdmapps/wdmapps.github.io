# WDM Criativos IA — Instagram

## O que já está implementado

- Editor de criativos em 1080x1080, 1080x1350 e 1080x1920.
- Marcas WDM Apps, WDM IPTV, Ferrari Gesso e Telhas Porto.
- Headline, CTA, legenda e hashtags.
- Upload de foto e download em JPEG.
- Login oficial pela Instagram API with Instagram Login.
- Publicação direta de imagem + legenda em conta profissional.
- Token e App Secret mantidos no backend.
- Renovação automática do token quando estiver próximo do vencimento.

## Publicar as Functions

Na raiz do projeto, execute:

```bat
deploy-admin-functions.bat
```

O arquivo usa:

```bash
npx firebase-tools deploy --project wdm-admin --config firebase.admin.json --only functions
```

## Configuração única na Meta

1. Crie/abra um aplicativo no Meta for Developers com Instagram API.
2. Ative **Instagram API with Instagram Login**.
3. Em permissões, use:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
4. Em **Valid OAuth Redirect URIs**, cadastre exatamente:
   ```
   https://us-central1-wdm-admin.cloudfunctions.net/instagramOAuthCallback
   ```
5. Abra `https://wdmapps.com.br/admin/criativos/`.
6. Informe o Instagram App ID e o App Secret.
7. Clique em **Entrar com Instagram** e autorize uma conta Business ou Creator.
8. Gere uma arte e clique em **Publicar no Instagram**.

> Durante desenvolvimento, a conta usada precisa estar liberada para testar o aplicativo. Para conectar contas de clientes em produção, coloque o app em modo apropriado e conclua as revisões/permissões exigidas pela Meta.
