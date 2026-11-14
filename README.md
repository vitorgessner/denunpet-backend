# Adopet - Backend

## Rodando projeto em desenvolvimento
### 1. Configurando variáveis de ambiente:
Copie o `.env.example` para `.env`. O `JWT_SECRET` é obrigatório (o servidor não sobe sem ele).
O `DATABASE_URL` do exemplo aponta para o Postgres do `docker-compose.yml` (porta **5433**).
Confira para qual banco o seu `.env` aponta antes de rodar migrations ou o seed.

### 2. Subindo container do postgres:
```terminal
docker compose up -d
```

### 3. Criando as tabelas (e, se quiser, dados de exemplo):
```terminal
npx prisma migrate deploy
npm run seed
```
> O seed **apaga todos os dados** do banco apontado por `DATABASE_URL` antes de inserir os exemplos.
> Usuários do seed: `usuario@exemplo.com`, `ong1@exemplo.com` e `ong2@exemplo.com` (senha `123456`).

### 4. Iniciando servidor backend:
```terminal
npm start
```

## Regras da API

Todas as rotas de `/api/report` exigem `Authorization: Bearer <token>`.

| Rota | Quem pode |
| --- | --- |
| `POST /api/report/register` | Usuário (USER). O autor é sempre o usuário do token; com `anonymous=true` a denúncia fica sem autor |
| `GET /api/report/my` | USER: as denúncias que criou. ONG: as que assumiu. Filtros opcionais: `status`, `search`, `dateFrom`, `dateTo` |
| `GET /api/report/pending` | ONG |
| `GET /api/report/:id` | O denunciante, a ONG responsável, ou qualquer ONG enquanto a denúncia está `PENDING` |
| `PUT /api/report/:id` | O denunciante, com a denúncia `PENDING` ou `REJECTED`. Ela volta para `PENDING` sem o motivo da rejeição e precisa continuar com 1 foto e 1 vídeo |
| `DELETE /api/report/:id` | O denunciante, com a denúncia `PENDING` ou `REJECTED` |
| `PUT /api/report/:id/send-to-review` | ONG, com a denúncia `PENDING` (a ONG vira a responsável) |
| `PUT /api/report/:id/reject` | ONG, com a denúncia `PENDING`. Body: `{ reason }` |
| `PUT /api/report/:id/status` | ONG responsável, com a denúncia `UNDER_REVIEW` ou `IN_PROGRESS`. Body: `{ status, statusComment }`, com `status` em `IN_PROGRESS`, `RESOLVED` ou `UNRESOLVED` |
| `POST /api/report/:id/midia` | ONG responsável, com a denúncia `UNDER_REVIEW` ou `IN_PROGRESS` (só imagens) |

### Uploads
- Campo `midia`, até 10 arquivos por requisição.
- Fotos: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` (até 10 MB na triagem da ONG).
- Vídeos: `.mp4`, `.webm`, `.mov`. Limite geral de 50 MB por arquivo.
- Toda denúncia precisa de pelo menos 1 foto e 1 vídeo (na criação e depois de editada).
- O conteúdo é conferido: os primeiros bytes do arquivo precisam bater com o formato da extensão.
- Os arquivos são salvos em `public/images` com nome aleatório e servidos em `/images/<nome>`.

### Erros
As respostas de erro têm o formato `{ "code": "..." }`. Os códigos e as mensagens exibidas ao usuário
estão mapeados no frontend em `src/lib/apiError.ts`.

### Dados do denunciante
As respostas trazem `user: { id, name }`. A ONG responsável pela denúncia (`ngoId`) recebe também
`email` e `phone`. Denúncia anônima vem com `user: null`.

### Login e cadastro
O e-mail é sempre tratado em minúsculas. CPF (conta `USER`) e CNPJ (conta `ONG`) são obrigatórios,
no formato com máscara, e têm os dígitos verificadores conferidos.

`/api/auth/login` e `/api/auth/register` aceitam no máximo 20 requisições a cada 15 minutos por IP
(resposta `429 TOO_MANY_REQUESTS` ao passar disso).
