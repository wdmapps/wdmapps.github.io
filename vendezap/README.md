# VendeZap Web

Ferramenta estática para criar anúncios dentro do WDM Desktop, em `/vendezap/`.
Não exige dependências, build, login ou servidor de aplicação. Os arquivos podem ser servidos diretamente pelo GitHub Pages.

## Recursos

- Criar, editar, duplicar, excluir e buscar anúncios; filtrar por disponibilidade e categoria.
- Produto, chamada, descrição, preço livre, estoque, variações e até seis fotos por anúncio.
- Fotos reduzidas localmente para até 1.400 px; primeira foto configurável como capa.
- Prévia, dados da loja e quatro estilos de arte PNG de 1.080 × 1.350 px.
- Copiar texto e iniciar compartilhamento nativo com fotos quando o navegador permitir; alternativa pelo WhatsApp com texto e download separado da imagem.
- IndexedDB no navegador, backup JSON com fotos e importação aditiva. IDs em conflito recebem outro ID para preservar os dois registros. Importações idênticas são ignoradas.

## Dados e limites

Os dados ficam no navegador e na origem utilizada. Não há sincronização com Android, outra origem ou outros dispositivos. Limpar os dados do navegador remove os anúncios locais; mantenha um backup exportado. A prévia local tem armazenamento separado do domínio publicado.

O backup JSON da web é independente do ZIP do aplicativo Android. Importação: até 100 MB e 1.000 anúncios; seis imagens JPG/PNG/WebP por anúncio. As imagens e textos passam por validação antes da gravação. Uma transação grava os anúncios e o perfil juntos; falhas não substituem o estado em memória. Web Locks coordena gravações entre abas em navegadores compatíveis e BroadcastChannel atualiza as demais abas.

O contador de compartilhamentos indica anúncios cujo compartilhamento foi iniciado. Não comprova recebimento ou envio da mensagem. A seleção do destinatário e o envio são feitos pelo usuário. O aplicativo não executa disparos automáticos.

## Executar e verificar

Na raiz do site:

```sh
python -m http.server 4175 --bind 127.0.0.1
node --test vendezap/core.test.mjs
node --check vendezap/app.mjs
node --check vendezap/storage.mjs
node --check desktop.js
```

Abra `http://127.0.0.1:4175/vendezap/`. Teste salvar/recarregar, editar, trocar capa, filtrar, copiar texto, baixar PNG e exportar/importar o JSON. No celular, confira também o compartilhamento no aplicativo escolhido. O compartilhamento nativo depende do sistema, navegador, HTTPS e ativação pelo clique.

A integração muda a entrada `vendezap` do desktop para iframe, preserva esse modo na camada `polish.js`, permite `web-share` e `clipboard-write` nesse iframe e atualiza as versões dos dois scripts no HTML para evitar cache antigo. A Play Store permanece acessível dentro da ferramenta.
