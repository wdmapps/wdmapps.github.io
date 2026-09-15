# Modelo de barbearia — WDM Apps

Demonstração em https://wdmapps.com.br/projetos/barbearia/

Aplicação estática compilada a partir do projeto `wdmapps/barbearia-app`, com `npm run build:pages`.
Para atualizar, substitua os arquivos compilados desta pasta pelo conteúdo da nova pasta `dist`.

As rotas internas usam hash para funcionar no GitHub Pages:

- Agendamento: `#/agendar`
- Painel demonstrativo: `#/login`

O modelo não utiliza banco de dados compartilhado. Os agendamentos ficam no navegador do visitante.
Nome, endereço e telefone da barbearia são exemplos.
