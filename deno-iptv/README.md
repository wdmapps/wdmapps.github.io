# WDM TV — serviços, DNS e listas M3U

Frontend: `iptv/`. Proxy: `deno-iptv/main.ts`, no Deno Deploy.

## Serviços configurados

| Serviço | Opção | Origem |
| --- | --- | --- |
| PlayNow | DNS 1 | http://dns1.prontonline.com |
| PlayNow | DNS 2 | http://pnow.space |
| PlayNow | DNS 3 | http://nowplay.sbs |
| RexTV | DNS 1 | http://rexmax.sbs |

Esses são os padrões informados pelo proprietário em 12/09/2026. Não contêm
credenciais. Se necessário, `PLAYNOW_DNS` (endereços separados por vírgula),
`REXTV_DNS` (um endereço) e `DNS_LABELS` (rótulos separados por vírgula) podem
sobrescrever os padrões no Deno Deploy. A variável antiga `DNS_LIST` foi
substituída pelas configurações de cada serviço. As URLs aparecem neste
repositório; a interface do player mostra somente os nomes e índices.

O modo Automático procura apenas entre os DNS do serviço selecionado. Uma
seleção manual usa exatamente aquele DNS, inclusive no catálogo e nas mídias.
A sessão memoriza serviço, escolha e servidor autenticado. Ao trocar de conta
ou servidor, itens recentes, favoritos e IDs selecionados são limpos para não
misturar catálogos. O logout remove apenas dados da sessão IPTV.

## Leitor M3U

Abra `iptv/m3u.html`, também disponível no login e no painel. Aceita link ou
arquivo `.m3u`/`.m3u8`, nomes, logos e categorias, com busca e paginação de
100 itens. Limites: 20 MB e 50.000 itens. Uma playlist HLS por URL é tratada
como um vídeo; um arquivo HLS local exige o link original para resolver seus
segmentos. Arquivos de listas com caminhos relativos precisam de uma origem
HTTP/HTTPS, por isso devem ser abertos por link.

A última lista fica no IndexedDB do aparelho e pode ser removida em
**Limpar lista**. Uma importação inválida preserva a lista anterior. Links e
nomes são validados e inseridos como texto, sem interpretar HTML.

O leitor usa o proxy existente `/m/<índice>/x/<base64url>` para acessar links
HTTP/HTTPS. O parâmetro `playlist=1` retorna o texto original e a URL efetiva
após redirects. Manifestos de vídeo HLS têm variantes, chaves e segmentos
reescritos pelo proxy, inclusive quando vêm de uma CDN externa. O servidor
de origem continua exigindo a autorização da própria lista/conta.

HLS usa hls.js ou o suporte nativo do navegador; MPEG-TS usa mpegts.js, e MP4
usa o elemento de vídeo. Codecs não suportados pelo navegador, links vencidos
e serviços que exigem headers especiais podem não reproduzir. O seletor de
formato permite corrigir a identificação automática de links sem extensão.

## Publicação e validação

O GitHub Pages publica o frontend de `main`. O Deno Deploy usa a mesma branch,
com o entrypoint `./deno-iptv/main.ts` definido em `deno.json`. `iptv/config.js`
aponta para `https://wdmappsgithubio.wdmapps.deno.net`.

```sh
deno check deno-iptv/main.ts
node --experimental-strip-types --test iptv/m3u-core.test.mjs deno-iptv/main.test.mjs
```

Os testes usam respostas sintéticas, sem contas reais, e cobrem seleção e
isolamento de serviços, pinagem do catálogo e das mídias, importação, parser,
protocolos inválidos e reescrita HLS. `/servers` permite verificar a
configuração publicada sem autenticar uma conta.

Backup anterior a esta alteração:
`backup/iptv-antes-dns-m3u-2026-09-12`, commit
`3aeea6ad119cf3c885594f910f96f5c005de2bbd`.
Para restaurar somente este trabalho, reverta o commit da funcionalidade;
evite substituir alterações posteriores de outros módulos do site.
