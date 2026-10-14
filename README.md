# STARTFIT — Studio de Treinos

Ambiente independente para um colaborador montar treinos-modelo sem acessar o painel administrativo do STARTFIT.

O editor reproduz o fluxo do painel administrativo e inclui um snapshot dos 205 exercícios cadastrados no STARTFIT, com seus grupamentos e vídeos. O catálogo fica disponível mesmo sem login no aplicativo.

## O que fica salvo

Os treinos são salvos automaticamente no `localStorage` do navegador. Para evitar perda de trabalho, use **Backup** periodicamente e guarde o arquivo JSON.

## Exportação final

1. Clique em **Exportar SQL**.
2. Confira a quantidade de treinos e baixe o arquivo `.sql`.
3. No Supabase, abra **SQL Editor**, cole o arquivo inteiro e execute.
4. O script adiciona os novos treinos e substitui somente os que tenham o mesmo ID. Os demais dados do painel são preservados.

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
