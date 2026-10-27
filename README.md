# 🕹️ Fliper

Coleção de 30 jogos mobile-first no navegador, cada um com seu próprio ranking (top 20 global
com envio automático, mais os seus 10 melhores no aparelho). Marque os favoritos com ⭐ e receba um aviso
quando alguém passar o seu recorde.

| Jogo                      | Em uma frase                       |
| ------------------------- | ---------------------------------- |
| **Salve o Doguinho**      | Desenhe e proteja                  |
| **Block Blast**           | Encaixe e limpe linhas             |
| **Sudoku**                | Lógica com números                 |
| **Road Fighter**          | Corrida sem fim                    |
| **2048**                  | Junte os números                   |
| **Flappy Bee**            | Toque para voar                    |
| **Snake**                 | Coma e cresça                      |
| **Stack**                 | Empilhe sem errar                  |
| **Fruit Merge**           | Junte as frutas                    |
| **Grau 3D**               | Empine e não caia                  |
| **Luta de Rua**           | Vença todos os rivais              |
| **Bombinhas**             | Exploda e ache a saída             |
| **Turma da Luta**         | Cada um com seu poder              |
| **Corre Turma**           | Corra, pule e desvie               |
| **Turma Crush**           | Junte 3 iguais                     |
| **Lenhador**              | Corte sem levar galhada            |
| **Toque Rápido**          | Não erre a peça                    |
| **Acerta o Alvo**         | Lápis no biscoito                  |
| **Pula Pula**             | Suba cada vez mais                 |
| **Atravessa**             | Rua, rio e águia                   |
| **Hexa Pilhas**           | Junte 10 da mesma cor              |
| **Quebra-Tijolos**        | Rebata e quebre tudo               |
| **Memória da Turma**      | Ache os pares                      |
| **Pula Cor**              | Passe pela sua cor                 |
| **Jogo do Milhão**        | Rumo ao milhão!                    |
| **Memória: Aventura**     | 30 fases com estrelas              |
| **Bolha Gulosa**          | Coma e cresça                      |
| **Paciência**             | O clássico das cartas              |
| **Última Carta**          | Cores, +2 e coringas               |
| **Território**            | Feche a volta e conquiste          |
| **Torre Helix**           | Gire a torre e desça               |
| **Zigue-Zague**           | Vire na hora certa                 |
| **Ponte Certa**           | Segure e solte                     |
| **Cor Certa**             | A cor bate com a palavra?          |
| **Conta Rápida**          | Resolva antes do tempo             |
| **Cesto Maluco**          | Pegue as frutas, fuja das bombas   |
| **Sequência**             | Repita a ordem das luzes           |
| **Relâmpago**             | Toque no verde, rápido!            |
| **Trio de Peças**         | Junte 3 iguais, não lote a bandeja |
| **Inverte**               | Vire a gravidade                   |
| **Balão**                 | Segure para subir                  |
| **Toupeira**              | Acerte, mas não a bomba            |
| **Corta Frutas**          | Deslize e fatie                    |
| **Gelo**                  | Deslize até a bandeira             |
| **Velha Infinita**        | Só 3 peças por vez                 |
| **Ligue 4**               | Alinhe 4 contra o robô             |
| **Campo Minado**          | Limpe sem explodir                 |
| **Atira Bolhas**          | Estoure por cor                    |
| **Blocos**                | O clássico que não para            |
| **Come-Come**             | Fuja dos fantasmas                 |
| **Nave**                  | Atire em tudo                      |
| **Líquidos Mágicos**      | Separe as cores nos tubos          |
| **Ricochete Infinito**    | Mire e quebre os números           |
| **Sobrevivente da Horda** | Evolua magias contra todos         |

O jogador escolhe um apelido uma vez no menu e ele vale para todos os rankings.

## Stack

Jogo: Vite · TypeScript (strict) · Phaser 3 (Matter) · Vitest · ESLint · Prettier
Servidor: Rust (Axum + SQLx) · PostgreSQL · WebSocket · Docker (Dokploy)

```
web/      o jogo (PWA)                 api/     API em Rust: ranking, telemetria, chat, login
admin/    painel de administração      legacy/  Firebase e o admin antigo (só referência)
tools/    exportação dos dados antigos
```

Requer **Node 22.13+** (veja `.nvmrc`).

## Rodando

```bash
cd web && npm install
npm run dev        # http://localhost:5173 (e no IP da rede, para testar no celular)
npm run check      # tipos + lint + testes
npm run build      # gera web/dist/
```

Sem o servidor, cada ranking fica salvo só no aparelho. Para testar o ranking global, o chat e o
login, suba também a API (precisa de Rust e de um PostgreSQL; veja [api/.env.example](api/.env.example)):

```bash
cd api && cargo run            # http://localhost:8080 (o `npm run dev` já encaminha /api para ela)
cd api && cargo test           # com TEST_DATABASE_URL apontando para um Postgres, roda também os testes de integração
cd admin && npm install && npm run dev   # painel em http://localhost:5174/admin/
```

Para testar no celular: rode `npm run dev`, conecte o celular na mesma rede Wi-Fi e abra o endereço
`Network:` exibido no terminal.

## Publicando no Dokploy

Um único contêiner roda tudo: a API em Rust serve o jogo em `/` e o admin em `/admin`.

1. No Dokploy, crie uma **Application** apontando para este repositório, com *Build Type* **Dockerfile**
   (caminho `Dockerfile`, contexto na raiz). O PostgreSQL fica fora: o contêiner só precisa da URL.
2. Na aba **Environment**, preencha as variáveis de [.env.example](.env.example):
   `DATABASE_URL` (ex.: `postgres://usuario:senha@host:5432/fliper?sslmode=require`), `JWT_SECRET` (`openssl rand -hex 32`), `GOOGLE_CLIENT_ID` e `ADMIN_EMAILS`.
3. Aponte o domínio para a aplicação, porta `8080`. Tudo é lido em tempo de execução (nada precisa ser
   passado como *build arg*): trocar uma variável só pede reiniciar.
4. No [Google Cloud](https://console.cloud.google.com/apis/credentials), crie um **ID do cliente OAuth**
   (tipo *Aplicativo da Web*) e adicione o endereço do site em *Origens JavaScript autorizadas*.

O banco precisa existir (vazio); as tabelas são criadas e atualizadas sozinhas na subida
(`api/migrations`). O backup do Postgres é com você.

### Trazendo os dados do Firebase

```bash
cd tools/firestore-export && npm install
GOOGLE_APPLICATION_CREDENTIALS=chave-da-conta-de-servico.json node export.mjs firestore-export.json
# no servidor (ou localmente, com DATABASE_URL apontando para o banco novo):
fliper-api import firestore-export.json
```

Rankings e sessões são importados e ligados ao id Google de cada jogador: quem entrar com Google no
site novo encontra os recordes de antes. Rodar duas vezes não duplica nada. O chat não é migrado.

## Arquitetura

Veja [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md).
