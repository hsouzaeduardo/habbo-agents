# Habbo Office

Painel ao vivo em pixel art: uma sala de escritório com **N agentes** (padrão 12,
até 50). Um `POST` com a atividade faz aparecer um **balão de fala** em cima do
agente, em tempo real, sem recarregar a página.

Feito para ficar aberto numa TV/monitor enquanto a automação (n8n, Make, script)
vai empurrando o que cada agente está fazendo.

```
Automação ──POST /api/activity──► Express ──► estado (N slots) ──► SSE ──► navegador
```

A sala não tem tamanho fixo: a grade é calculada a partir da quantidade de
agentes (6 → 3×2, 12 → 4×3, 24 → 6×4) e o palco cresce junto — a página escala
tudo para caber na tela.

## Rodando

```bash
npm install
npm start          # http://localhost:3000
```

Sem `.env` ele já sobe com os padrões. Para customizar: `cp .env.example .env`.

## O payload

```http
POST /api/activity
Content-Type: application/json

{ "agentID": 2, "agentName": "Felipe", "activity": "Realizando leitura" }
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `agentID` | sim | inteiro de 1 a `AGENT_COUNT` (padrão 12). Também aceita `agentId` e `id` |
| `activity` | sim | texto de 1 a 140 caracteres. Também aceita `atividade`, `message`, `text` |
| `agentName` | não | até 24 caracteres. Sobrescreve o nome do slot e vale até o próximo POST |
| `ttlMs` | não | tempo do balão só nessa mensagem (0 = permanente) |

Resposta:

```json
{ "ok": true, "agent": { "id": 2, "name": "Felipe", "activity": "Realizando leitura",
                         "since": 1750000000000, "expiresAt": 1750000020000, "seq": 1 } }
```

Erro (400) vem explicando o que está errado:

```json
{ "ok": false, "error": "agentID invalido: 99", "field": "agentID", "validIds": [1,2,3,4,5,6,7,8,9,10,11,12] }
```

### Exemplos

**curl**

```bash
curl -X POST http://localhost:3000/api/activity \
  -H "Content-Type: application/json" \
  -d '{"agentID":2,"agentName":"Felipe","activity":"Realizando leitura"}'
```

> No Git Bash do Windows o JSON escrito direto na linha de comando **perde os
> acentos** (o console manda cp1252 e o texto chega como `reuni<?>o`). Se a
> atividade tiver acento, salve o JSON num arquivo UTF-8 e mande o arquivo:
>
> ```bash
> curl -X POST http://localhost:3000/api/activity \
>   -H "Content-Type: application/json" -d @atividade.json
> ```

**PowerShell** (use UTF-8 no body, senão acento vira `Ã§`)

```powershell
$body = @{ agentID = 2; agentName = 'Felipe'; activity = 'Realizando leitura' } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/activity -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

**n8n** — cole isso no canvas (Ctrl+V) para ter o nó pronto:

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/api/activity",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ agentID: 2, agentName: 'Felipe', activity: $json.atividade }) }}",
        "options": {}
      },
      "name": "Habbo Office",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [0, 0]
    }
  ],
  "connections": {}
}
```

Se o n8n rodar em outra máquina/container, troque `localhost` pelo IP do host —
o CORS já está liberado.

## Quando a atividade termina

Duas formas de encerrar, dependendo do que você quer ver na tela:

```bash
# só apaga o balão — o agente continua sentado na mesa, ocioso
curl -X DELETE http://localhost:3000/api/activity/2

# o agente vai embora — some da cena e a mesa dele fica vazia
curl -X DELETE http://localhost:3000/api/agent/2
```

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/agent/2 -Method Delete
```

Quem saiu **volta sozinho** no próximo `POST /api/activity` para aquele
`agentID` — não precisa de nenhuma chamada extra para readmitir. Se quiser
trazer de volta sem atividade nenhuma: `POST /api/agent/2`.

O balão também some sozinho quando o `BUBBLE_TTL_MS` vence; nesse caso o agente
fica na mesa, ocioso. Sair da sala é sempre explícito, por essa rota.

## Rotas

| Rota | O que faz |
|---|---|
| `POST /api/activity` | a principal (acima) |
| `POST /api/activity/batch` | array de payloads (até 50) numa chamada só |
| `DELETE /api/activity/:agentId` | apaga o balão, o agente **continua** na mesa |
| `DELETE /api/agent/:agentId` | o agente **sai da sala** (mesa fica vazia) |
| `POST /api/agent/:agentId` | devolve o agente para a mesa, sem atividade |
| `GET /api/state` | estado de todos os agentes + tamanho da sala + histórico |
| `GET /api/events` | stream SSE que a página consome |
| `GET /health` | uptime, espectadores conectados, se exige chave |

## Configuração (`.env`)

| Variável | Padrão | Efeito |
|---|---|---|
| `PORT` | `3000` | porta do servidor |
| `AGENT_COUNT` | `12` | quantos agentes existem (1 a 50). A sala se remonta sozinha |
| `BUBBLE_TTL_MS` | `20000` | quanto o balão fica na tela. **`0` = fica até o próximo POST** |
| `API_KEY` | vazio | se preenchida, `POST`/`DELETE` exigem o header `x-api-key`. A leitura continua aberta |
| `CORS_ORIGIN` | `*` | origem liberada |

Com `API_KEY` ativa, o painel de testes da página precisa da chave: abra
`http://localhost:3000/?key=SUA_CHAVE` uma vez (fica salva no navegador).

## A página

- **Parallax**: as camadas (céu, parede, piso e cada fileira de mesas) se
  deslocam em velocidades diferentes conforme o ponteiro se move. Depois de 4s
  sem mexer no mouse a câmera passa a derivar sozinha num oito lento — é o modo
  que interessa numa TV. Desligado automaticamente em `prefers-reduced-motion`.
- **Painel de testes**: tecla `D`, o botão `D` no rodapé ou `?panel=1`. Clique
  manda a atividade, **shift+clique tira o agente da sala**. É o mesmo `POST` da
  automação, então o que funciona ali funciona no n8n.
- **Rodapé**: últimas 8 atividades com horário.
- **Reconexão**: se o servidor cair, o `EventSource` reconecta sozinho e o
  próximo snapshot ressincroniza a tela.
- A cena é escalada para caber na tela, seja qual for o tamanho da sala —
  funciona igual num notebook e numa TV.

## Quantidade de agentes

```bash
# .env
AGENT_COUNT=20
```

Reinicie o servidor e pronto: a grade, o tamanho da sala, os `validIds` da API e
os botões do painel se ajustam sozinhos. Os `agentID` vão sempre de 1 a
`AGENT_COUNT`.

Do 7º agente em diante o nome sai de uma lista (Fábio, Gabi, Heitor…) e a cor da
camisa é gerada pelo ângulo áureo, então mesmo com 30 agentes ninguém fica com a
mesma cor. Passando de 24 nomes vira "Agente 25", "Agente 26"…

Acima de ~24 agentes a sala fica grande e o texto do balão diminui junto com a
escala — é o limite prático numa tela comum.

## Trocar nomes, cores e posições

Em `server/agents.config.js`:

- **`ROSTER`** — nome, cabelo (`curto`/`longo`) e paleta dos primeiros agentes,
  na ordem (índice 0 = agente 1). Quem passar do fim do ROSTER ganha nome e
  cores geradas.
- **`LAYOUT`** — espaçamento entre agentes e fileiras. O `rowPitch` de 228px não
  é arbitrário: é o mínimo para o balão de quem está na frente não tapar a placa
  de quem está atrás.
- O nome que vem no `agentName` do POST sempre vence o do ROSTER.

Os desenhos são mapas de caracteres em `public/js/sprites.js` — cada letra é uma
cor da paleta. Não existe imagem externa: a cena inteira roda offline.

## Deploy (Azure App Service)

No ar em **https://habbo-agents.azurewebsites.net** — container Linux no App
Service, imagem hospedada no Azure Container Registry.

### O que existe na assinatura

| Recurso | Nome | Observação |
|---|---|---|
| Resource group | `rg-habbo-agents` | tudo vive aqui |
| Container registry | `acrhabboagentsf7lr3` | SKU Basic |
| Plano | `asp-habbo-agents` | B1 Linux, **Central US** |
| Web App | `habbo-agents` | 1 instância, Always On, health check em `/health` |

A região é Central US porque a assinatura Sponsorship está com **cota 0 de B1 em
Brazil South** (e em East US / East US 2). Para trazer para o Brasil é preciso
abrir um pedido de aumento de cota.

**Uma instância só, de propósito**: o estado dos agentes vive em memória e o SSE
é uma conexão longa. Escalar horizontalmente faria um POST cair numa instância e
o navegador estar ouvindo outra. Se um dia precisar escalar, o estado tem que
sair para um Redis primeiro.

### Autenticação

O app inteiro está atrás do **Easy Auth com Entra ID** — sem login não se vê nem
a página nem a API. Só `/health` fica fora, porque o health check do próprio
App Service não faz login e um 302 marcaria a instância como doente.

- **No navegador**: abre, cai no login do Entra, volta logado.
- **Na automação (n8n)**: precisa de um token de aplicação. Crie um segredo para
  isso (o comando mostra o valor uma única vez):

  ```bash
  az ad app credential reset --id de8a7b27-5c4b-4f9d-9017-ffcf61d2390d     --append --display-name n8n --years 1
  ```

  E no n8n use *Generic Credential Type → OAuth2 (client credentials)*:

  | Campo | Valor |
  |---|---|
  | Access Token URL | `https://login.microsoftonline.com/7247031b-59eb-41cb-b463-ac1db7d5a4d0/oauth2/v2.0/token` |
  | Client ID | `de8a7b27-5c4b-4f9d-9017-ffcf61d2390d` |
  | Client Secret | o valor gerado acima |
  | Scope | `api://de8a7b27-5c4b-4f9d-9017-ffcf61d2390d/.default` |

Além do token, as rotas de escrita continuam pedindo o header `x-api-key` (o
Easy Auth pode ser desligado no portal por engano; a chave é a segunda tranca).
Para ver a chave:

```bash
az webapp config appsettings list -g rg-habbo-agents -n habbo-agents   --query "[?name=='API_KEY'].value" -o tsv
```

Se preferir só o Entra ID, apague a variável `API_KEY` do App Service.

### Deploy contínuo

`.github/workflows/deploy.yml` roda a cada push na `main`: testes → `az acr
build` (a imagem é construída dentro do Azure) → aponta o Web App para a tag do
commit → espera `/health` responder 200.

A autenticação é por **OIDC/identidade federada**: nenhum segredo do Azure fica
no repositório, e só o push na `main` deste repo consegue assumir a identidade.

O subject que o GitHub apresenta hoje inclui os ids numéricos do dono e do repo
(`repo:hsouzaeduardo@1692867/habbo-agents@1375685277:ref:refs/heads/main`), e a
credencial federada no Entra tem que bater com ele exatamente. O job também não
declara `environment:` — com ele o subject vira `...:environment:<nome>` e
qualquer branch que aponte para aquele environment consegue assumir a
identidade.
Falta um passo manual — adicionar três identificadores em
*Settings → Secrets and variables → Actions*:

| Secret | Valor |
|---|---|
| `AZURE_CLIENT_ID` | `5d54193a-c767-48df-b7ac-aefca85604b6` |
| `AZURE_TENANT_ID` | `7247031b-59eb-41cb-b463-ac1db7d5a4d0` |
| `AZURE_SUBSCRIPTION_ID` | `c9271149-e7f1-46e1-98cb-80647d023319` |

Enquanto eles não existirem, o job de deploy falha no login (os testes passam).

### Custo

B1 (~US$13/mês) + ACR Basic (~US$5/mês) ≈ **US$18/mês** no crédito da
assinatura Sponsorship. Para pausar sem apagar nada:

```bash
az webapp stop -g rg-habbo-agents -n habbo-agents
```

O plano continua sendo cobrado mesmo com o app parado; para zerar de vez,
`az group delete -n rg-habbo-agents`.

### Rodar o container local

```bash
docker build -t habbo-office .
docker run --rm -p 3000:3000 habbo-office
```

## Estrutura

```
server/
  index.js           bootstrap (.env, listen, shutdown)
  app.js             rotas, CORS, auth, estáticos
  state.js           os slots em memória + expiração do balão
  sse.js             hub de Server-Sent Events
  validate.js        normalização do payload
  agents.config.js   grade da sala, nomes e paletas
public/
  index.html         a cena
  css/               sala, avatar, balão
  js/                app (stream + render), sprites, parallax, painel de testes
test/api.test.js     node --test
```

## Testes

```bash
npm test
```

Cobre: POST válido, sinônimos de `agentID`, rejeições (id fora da faixa,
atividade vazia/longa, JSON quebrado), expiração por TTL, TTL 0 permanente,
`DELETE`, lote, API key, entrega do evento pelo SSE, quantidade configurável de
agentes (posições dentro do palco, faixa de ids), o teto de 50, e a saída/volta
do agente (incluindo os eventos `left` e `joined` chegando pelo stream).
