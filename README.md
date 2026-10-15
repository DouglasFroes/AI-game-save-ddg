# 🕹️ Fliperama

Coleção de 9 jogos mobile-first no navegador, cada um com seu próprio ranking:

| Jogo | Como funciona | Ranking por |
|---|---|---|
| 🐶 **Salve o Doguinho** | Desenhe uma linha para proteger o doguinho das abelhas (20 fases) | estrelas, mortes, tinta |
| 🧱 **Block Blast** | Arraste peças para o tabuleiro 8×8 e complete linhas/colunas | pontos |
| 🔢 **Sudoku** | Fácil, médio ou difícil, com notas e dicas | pontos (tempo, erros, dicas) |
| 🏎️ **Road Fighter** | Corrida infinita: desvie dos carros e pegue gasolina | pontos (distância + ultrapassagens) |
| 🔢 **2048** | Deslize para juntar números iguais até chegar a 2048 | pontos, maior peça |
| 🐝 **Flappy Bee** | Toque para a abelha voar entre os canos | canos ultrapassados |
| 🐍 **Snake** | Deslize para guiar a cobrinha; maçãs e bônus dourado | pontos, tamanho |
| 🧱 **Stack** | Toque para soltar o bloco; o que sobrar é cortado | andares, encaixes perfeitos |
| 🍉 **Fruit Merge** | Solte frutas; iguais se juntam numa maior (física real) | pontos, maior fruta |

O jogador escolhe um apelido uma vez no menu e ele vale para todos os rankings.

## Stack

Vite · TypeScript (strict) · Phaser 3 (Matter) · Firebase (Auth anônimo + Firestore) · Vitest · ESLint · Prettier

Requer **Node 22.13+** (veja `.nvmrc`).

## Rodando

```bash
npm install
npm run dev        # http://localhost:5173 (e no IP da rede, para testar no celular)
npm run check      # tipos + lint + testes
npm run build      # gera dist/
```

Para testar no celular: rode `npm run dev`, conecte o celular na mesma rede Wi-Fi e abra o endereço
`Network:` exibido no terminal.

## Ranking global (Firebase)

Sem configuração, cada ranking fica salvo só no aparelho. Para ativar o ranking global:

1. No [console do Firebase](https://console.firebase.google.com), crie o projeto.
2. **Firestore Database → Criar banco** (modo produção, região `southamerica-east1`).
3. **Authentication → Sign-in method → Anônimo → Ativar.**
4. **Configurações do projeto → Seus apps → Web**: registre o app e copie o `firebaseConfig`.
5. Copie `.env.example` para `.env.local` e preencha os valores `VITE_FIREBASE_*`.
6. Publique as regras de segurança: cole o conteúdo de [`firestore.rules`](firestore.rules) em
   **Firestore → Regras → Publicar** (ou `npx firebase-tools deploy --only firestore:rules`).

Os dados ficam em `leaderboards/{jogo}/entries/{uid}`. Cada jogador só consegue gravar o próprio
documento, e as regras validam nome, faixa de pontos e campos. Se o Firebase estiver fora do ar, o
jogo usa o ranking local automaticamente.

## Arquitetura

Veja [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md).
