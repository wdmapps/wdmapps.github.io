# WDM Digitação — backlog para OpenCode

## Estado atual

A plataforma está em `digitacao/` e deve continuar isolada das áreas `shopping/`, `iptv/`, `jogos/` e `admin/`.

Já existe:

- interface responsiva;
- Firebase Web usando o projeto já existente do site;
- login Google;
- login/criação de conta por e-mail e senha;
- recuperação de senha;
- progresso salvo em `users/{uid}.digitacao` sem sobrescrever os outros dados do usuário;
- 450 fases geradas de forma determinística;
- 18 módulos de 25 fases;
- exercícios de teclas, palavras, textos, testes cronometrados e minijogos;
- PPM, precisão, erros, combo, estrelas e Bronze/Prata/Ouro;
- teclado virtual e indicação do dedo;
- somente fases concluídas + fase atual ficam visíveis.

## Objetivo

Transformar o protótipo em uma plataforma de curso robusta, preparada para uso real em escola e para expansão comercial da WDM Apps.

## Prioridade 1 — arquitetura e confiabilidade

1. Refatorar `digitacao/app.js` em módulos menores sem alterar as demais áreas do site.
2. Manter compatibilidade com GitHub Pages (`/digitacao/`).
3. Criar camada de dados clara para aluno, progresso e currículo.
4. Garantir que nenhum código do WDM Digitação altere campos do WDM Shopping além do namespace `digitacao`.
5. Implementar debounce/retry de gravação e indicador real de sincronização.
6. Implementar cache offline seguro e sincronização quando a internet voltar.
7. Criar tratamento de erros de Firebase compreensível para alunos.
8. Escrever testes para cálculo de PPM, precisão, medalhas, desbloqueio e salvamento.

## Prioridade 2 — digitação correta ABNT2

1. Revisar mapa completo de dedos para teclado ABNT2.
2. Tratar Shift esquerdo/direito corretamente.
3. Tratar acentos e dead keys (`´`, `~`, `^`, crase) sem quebrar exercícios.
4. Tratar Ç, números, pontuação e símbolos.
5. Não penalizar eventos de composição do navegador como erros falsos.
6. Validar Backspace, Caps Lock e teclas modificadoras.
7. Criar exercícios específicos para maiúsculas e acentuação.

## Prioridade 3 — currículo de 450 fases

1. Revisar pedagogicamente as 450 fases e evitar sequências artificiais/repetitivas.
2. Garantir progressão: F/J → D/K → S/L → A/Ç → G/H → fileiras superior/inferior → palavras → textos → números/símbolos → velocidade.
3. Criar variedade suficiente de palavras e textos em português brasileiro.
4. Manter 18 módulos x 25 fases.
5. Distribuir jogos e testes sem quebrar a progressão técnica.
6. Definir metas por faixa: iniciante, intermediário e avançado.
7. Guardar versão do currículo no progresso do aluno para futuras migrações.

## Prioridade 4 — jogos

Criar pelo menos estes jogos, reutilizando a técnica correta de dedos:

1. Tecla Relâmpago — tecla aparece e aluno responde.
2. Caça-Teclas — sequência com combo.
3. Palavras Caindo — digitar palavra antes de chegar ao chão.
4. Corrida de Digitação — avatar avança conforme precisão e velocidade.
5. Chuva de Letras — escolher/digitar a letra correta.
6. Desafio Sem Erro — encerra ou reduz vida quando há erro.
7. Chefão de Módulo — mistura todas as teclas aprendidas naquele módulo.

Salvar recordes dos jogos por aluno.

## Prioridade 5 — professor e turmas

Criar uma área separada de professor:

- perfil `teacher` sem conflitar com campos de outros produtos;
- criação de turma;
- código curto para aluno entrar na turma;
- lista de alunos;
- fase atual de cada aluno;
- PPM médio e melhor PPM;
- precisão média;
- total de treinos;
- tempo praticado;
- medalhas e ouros;
- alunos sem atividade recente;
- relatório individual;
- relatório da turma;
- ranking opcional por turma;
- exportação CSV/PDF futuramente.

O aluno não pode ler progresso de outros alunos. O professor só pode ler turmas às quais possui acesso. Preparar regras Firestore específicas antes de liberar isso.

## Prioridade 6 — UX e gamificação

- XP e nível do aluno;
- sequência de dias praticados;
- conquistas/medalhas;
- comemoração ao passar de fase;
- meta diária;
- tela de mapa do curso por módulos;
- certificado após conclusão;
- modo prática livre;
- tela de perfil com histórico;
- acessibilidade e navegação por teclado.

## Segurança

- Não usar regras `allow read, write: if true`.
- Não colocar segredos/Service Account no front-end.
- Firebase Web config pode permanecer no cliente.
- Qualquer privilégio administrativo deve ser validado por regras/claims/backend, nunca apenas por JavaScript no navegador.
- Não quebrar regras existentes do WDM Shopping.

## Critério de aceite da próxima grande entrega

- aluno consegue criar conta/entrar;
- progresso sobrevive a logout, troca de computador e atualização da página;
- primeiras 50 fases totalmente revisadas e testadas em ABNT2;
- ao menos 3 jogos robustos;
- testes automatizados para métricas e progressão;
- nenhuma regressão em `/shopping/`, `/iptv/`, `/jogos/` ou `/admin/`;
- documentação atualizada.
