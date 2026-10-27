# VendeZap Web

Ferramenta estática para criar anúncios dentro do WDM Desktop, em `/vendezap/`.
Não exige dependências, build, login ou servidor de aplicação. Os arquivos podem ser servidos diretamente pelo GitHub Pages.

## Recursos

- Criar, editar, duplicar, excluir e buscar anúncios; filtrar por disponibilidade e categoria.
- Produto, chamada, descrição, preço livre, estoque, variações e escolha entre até seis fotos ou um vídeo por anúncio.
- Fotos reduzidas localmente para até 1.400 px; primeira foto configurável como capa.
- Prévia, dados da loja e quatro estilos de arte PNG de 1.080 × 1.350 px.
- Vídeo MP4 ou WebM de até 25 MB, com prévia reproduzível e download do arquivo original. O vídeo precisa ser reproduzível pelo navegador usado; não há conversão ou edição automática. As artes PNG ficam disponíveis para anúncios com fotos.
- Compartilhar uma foto de capa ou vídeo sem enviar o texto como mensagem separada. O fluxo orienta copiar o texto e colar em “Adicionar legenda” na prévia da mídia no WhatsApp. A galeria completa permanece disponível por uma ação separada.
- Quando o navegador não permite compartilhar mídia, o arquivo é baixado para anexar manualmente no WhatsApp como foto/vídeo. Anúncios sem mídia mantêm o compartilhamento de texto.
- IndexedDB no navegador, backup JSON com fotos e vídeos e importação aditiva. IDs em conflito recebem outro ID para preservar os dois registros. Importações idênticas são ignoradas.

## Dados e limites

Os dados ficam no navegador e na origem utilizada. Não há sincronização com Android, outra origem ou outros dispositivos. Limpar os dados do navegador remove os anúncios locais; mantenha um backup exportado. A prévia local tem armazenamento separado do domínio publicado.

O backup JSON da web é independente do ZIP do aplicativo Android. O acervo e o backup têm limite de 100 MB (incluindo a representação base64 das mídias) e 1.000 anúncios; até seis imagens JPG/PNG/WebP ou um vídeo MP4/WebM de 25 MB por anúncio. O novo backup usa a versão 2 para preservar vídeos; backups antigos de fotos (versão 1) continuam sendo importados. As mídias e textos passam por validação antes da gravação. Uma transação grava os anúncios e o perfil juntos; falhas não substituem o estado em memória. Web Locks coordena gravações entre abas em navegadores compatíveis e BroadcastChannel atualiza as demais abas.

O contador de compartilhamentos indica anúncios cujo compartilhamento foi iniciado. Não comprova recebimento ou envio da mensagem. A seleção do destinatário e o envio são feitos pelo usuário. O aplicativo não executa disparos automáticos.

No computador, a Web Share API não possui um campo para controlar a legenda do WhatsApp. O usuário precisa colar o texto no campo de legenda da foto/vídeo antes de enviar. O payload de mídia contém somente `files`, sem `text` nem `title`, para evitar mensagens separadas. O site não promete preencher a legenda automaticamente.

## Executar e verificar

Na raiz do site:

```sh
python -m http.server 4175 --bind 127.0.0.1
node --test vendezap/core.test.mjs vendezap/sharing.test.mjs
node --check vendezap/app.mjs
node --check vendezap/storage.mjs
node --check desktop.js
```

Abra `http://127.0.0.1:4175/vendezap/`. Teste salvar/recarregar, editar, trocar capa, filtrar, copiar texto, baixar PNG, selecionar vídeo, reproduzir/baixar o vídeo e exportar/importar o JSON. No celular, confira também o compartilhamento no aplicativo escolhido. O compartilhamento nativo depende do sistema, navegador, HTTPS, ativação pelo clique e dos formatos aceitos pelo aplicativo de destino.

A integração muda a entrada `vendezap` do desktop para iframe, preserva esse modo na camada `polish.js`, permite `web-share` e `clipboard-write` nesse iframe e atualiza as versões dos dois scripts no HTML para evitar cache antigo. A Play Store permanece acessível dentro da ferramenta.
