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
