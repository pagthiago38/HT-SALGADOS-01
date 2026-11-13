# HT SALGADOS GESTÃO — Supabase + Login

Esta versão preserva as telas e os módulos do sistema e acrescenta autenticação por e-mail/senha do Supabase. Os dados são armazenados em `public.app_records`, separados por usuário. O backend valida o token de sessão e usa o mesmo JWT nas chamadas ao PostgREST; a política RLS continua sendo a proteção final no banco.

## 1. Supabase

1. No projeto `https://dlnxnvoudoqsdmyeckmb.supabase.co`, abra **SQL Editor**.
2. Se a tabela `public.app_records` e as políticas RLS já foram criadas, não execute novamente. Caso contrário, execute `supabase_schema.sql`.
3. Em **Authentication → Providers**, deixe Email habilitado.
4. Em **Authentication → URL Configuration**, configure a URL local `http://localhost:3000` e, depois, a URL do domínio publicado. Se a confirmação de e-mail estiver ligada, confirme o endereço cadastrado antes do primeiro login.

## 2. Configurar variáveis

Copie `frontend/.env.example` para `frontend/.env` e `backend/.env.example` para `backend/.env`. Os arquivos de exemplo já contêm a URL do projeto e a chave publicável fornecida. A chave `sb_publishable_...` pode ser usada no frontend e backend; **nunca** coloque uma chave `secret` ou `service_role` no frontend.

Ajuste `REACT_APP_BACKEND_URL` se a API não estiver em `http://localhost:8000`. Ajuste `CORS_ORIGINS` no backend para o domínio de produção quando publicar.

## 3. Rodar localmente

### Backend (terminal 1)

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (terminal 2)

```bash
cd frontend
npm install
npm start
```

Abra `http://localhost:3000`, crie seu usuário e entre com e-mail/senha. A sessão fica persistida pelo cliente Supabase. O botão **Sair** encerra a sessão.

## 4. Observações importantes

- A recuperação de senha usa o e-mail cadastrado no Supabase. O link deve retornar para a URL autorizada em Authentication → URL Configuration.
- A API exige token válido em todas as rotas de dados. `/api/` e `/api/meta` ficam abertas apenas para health check/metadados.
- Os registros novos são gravados no Supabase em formato JSONB por coleção (`products`, `sales`, `expenses` etc.) e com `owner_id` do usuário autenticado.
- Esta versão não importa automaticamente dados que eventualmente ainda estejam no MongoDB antigo. Se houver dados antigos a preservar, faça uma exportação/backup antes da troca e planeje a migração separadamente.
- O adaptador mantém compatibilidade com as operações usadas pelo backend atual. Como ele carrega os documentos da coleção do usuário para filtrar e calcular alguns relatórios no backend, é adequado para a implantação inicial/pequeno volume; para grande volume, recomenda-se migrar os relatórios e filtros para consultas SQL/RPC no Postgres.
- Antes de publicar em produção, rode os testes de aceitação com uma conta de teste e confirme que dois usuários diferentes não conseguem ver os registros um do outro.
