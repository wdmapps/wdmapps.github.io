# WDM Squad — operação e recuperação

Atualização 2026-10-16.2. A página mantém o login administrativo existente e usa o mesmo documento `wdmAdmin/squad`.

## Missões

- O histórico não é mais limitado a oito missões.
- Morgan seleciona especialistas por objetivo; missões antigas preservam sua equipe original.
- Uma reserva em transação impede missões/Radar simultâneos entre aparelhos e abas. Ela é renovada a cada 30 segundos e expira após quatro minutos sem renovação.
- Cada entrega é salva antes da próxima chamada. A retomada utiliza os resultados já salvos. Se uma chamada perdeu a conexão antes de salvar sua resposta, essa etapa poderá precisar ser repetida.
- Uma falha no Planner deixa a missão **Parcial**. Um plano só é aceito após validação de campos, prioridades e prazos. As tarefas mantêm vínculo com missão e cliente.
- A execução depende da aba aberta. Não existe trabalhador permanente em segundo plano nesta versão. Ao reabrir, use **Retomar etapas pendentes**; a reserva anterior pode levar até quatro minutos para expirar.

## Dados e sincronização

O cache anterior é preservado em `wdm_squad_backup_before_upgrade`. O backup exportado inclui o estado completo, os conflitos e essa cópia anterior, quando existir.

As gravações conciliam a base conhecida, as alterações locais e a versão mais recente da nuvem dentro de uma transação. Edições em registros/campos diferentes são combinadas; conflitos do mesmo campo ficam disponíveis para revisão. Edições antigas não recriam registros removidos silenciosamente. O cache conserva alterações pendentes ao reabrir offline.

Na primeira gravação, resultados extensos são migrados atomicamente para `wdmAdmin/squadMission_<id>`. O documento principal mantém índices; a leitura reconstrói os resultados completos. Se as regras existentes negarem novos documentos, mantém-se o formato anterior. Nesse caso, há aviso antes do limite de tamanho, sem exclusão automática. Não foi necessário ampliar permissões.

Recarregue o painel em todos os aparelhos após atualizar. Para reverter a aplicação, preserve a leitura do armazenamento v2; o HTML anterior isoladamente não conhece os detalhes separados. Backups contêm dados comerciais e devem ser guardados pelo administrador.

## Comercial e IA

A fila reúne retornos de hoje, vencidos e oportunidades sem agendamento. Registros de contato incluem canal, resultado, observação, responsável e próxima data. O funil registra mudanças de estágio, proposta, encerramento e motivo de perda. Os indicadores refletem os registros feitos no painel; registros antigos não ganham contatos ou respostas inventadas.

Radar e Scout recebem saídas JSON com schema estrito. O modo de qualquer oportunidade também passa por Scout. Sugestões existentes são preservadas, clientes/leads são excluídos da descoberta e descartes ficam registrados. Fontes e data de verificação acompanham a aprovação do lead.

O backend registra uso real da ferramenta web, fontes retornadas pela API, modelo, ID da resposta, tokens e duração. Respostas incompletas/recusadas são erros recuperáveis; seu consumo é registrado quando a API o disponibiliza. A telemetria cobre chamadas desta versão, sem reconstruir custos antigos. Não há envio ou publicação comercial automática.

Estimativas de custo só aparecem quando **todas** as tarifas abaixo forem configuradas no Deno Deploy, de acordo com o modelo e contrato em uso. A interface informa quando não estão configuradas; estimativas não substituem a fatura:

- `SQUAD_INPUT_USD_PER_MILLION`
- `SQUAD_OUTPUT_USD_PER_MILLION`
- `SQUAD_CACHED_USD_PER_MILLION`
- `SQUAD_WEB_USD_PER_CALL`

`GET /squad/health` identifica a versão publicada sem acionar a IA. O modelo, a chave existente no servidor e a autenticação foram mantidos.

## Validação

```powershell
node --test --experimental-strip-types admin/squad/squad.test.cjs admin/squad/sync.test.cjs deno-iptv/squad.test.mjs
```

Os testes simulam API e Firestore, sem custo ou dados reais: migração/reabertura, dois aparelhos, conflitos, reserva, histórico, duplicação, retomada, Planner, schemas e consumo. A interface foi conferida com uma fixture local identificada como dados fictícios. A fixture não integra os arquivos publicados.

## Correção 2026-10-16.4 — buscas interrompidas

O erro real `OPENAI_INCOMPLETE:max_output_tokens` foi identificado no histórico da missão. O limite anterior de 2.400 tokens também incluía o raciocínio interno, podendo impedir a primeira entrega.

Ray e Scott usam agora 8.192 tokens iniciais, o Planner 6.144, respostas estruturadas de leads 12.288 e os demais especialistas 4.096. Modelos GPT-5/6 usam esforço baixo de raciocínio e respostas concisas, mantendo o modelo configurado. Somente a interrupção explícita por tokens permite uma nova tentativa, dobrando o limite até o teto de 24.576. Não há repetição automática por falha de rede ou outro motivo. O consumo das duas tentativas é somado e os IDs individuais são preservados.

O Command exibe o erro em português e oferece retomada direta. Quando a missão mais recente está pendente, não apresenta o relatório de uma missão antiga como se fosse o resultado atual.
