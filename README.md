# STARTFIT — Studio de Treinos

Ambiente independente para um colaborador montar treinos-modelo sem acessar o painel administrativo do STARTFIT.

O editor reproduz o fluxo do painel administrativo e inclui um snapshot dos 205 exercícios cadastrados no STARTFIT, com seus grupamentos e vídeos. O catálogo fica disponível mesmo sem login no aplicativo. Na aba **Exercícios**, também é possível cadastrar exercícios próprios com vídeo, músculos primário e secundários e orientação técnica. Exercícios do banco são protegidos; somente os criados no Studio podem ser editados ou excluídos.

## O que fica salvo

Os treinos e exercícios personalizados são salvos automaticamente no `localStorage` do navegador. O botão **Exportar SQL** baixa um único arquivo que funciona tanto para importar no Supabase quanto para abrir os dados em outra instalação do Studio.

## Exportação final

1. Clique em **Exportar SQL** para baixar o arquivo `.sql`.
2. No Supabase, abra **SQL Editor**, cole o arquivo inteiro e execute.
3. O script cadastra ou atualiza primeiro os exercícios personalizados e depois adiciona os novos treinos. Treinos com o mesmo ID são substituídos; os demais dados do painel são preservados.

Para revisar o trabalho em outro navegador ou computador, abra o Studio e clique em **Importar SQL**. Selecione o mesmo arquivo exportado; os treinos e exercícios serão carregados para avaliação.

## Desenvolvimento local

```bash
npm install
npm run dev
```

O servidor local usa `http://127.0.0.1:4178`.

## Build de produção

```bash
npm run build
```

Os arquivos prontos para hospedagem serão gerados em `dist/`.
