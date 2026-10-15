# 🕹️ Fliperama

Coleção de 30 jogos mobile-first no navegador, cada um com seu próprio ranking (top 20 global
com envio automático, mais os seus 10 melhores no aparelho). Marque os favoritos com ⭐ e receba um aviso
quando alguém passar o seu recorde.

| Jogo | Em uma frase |
|---|---|
| **Salve o Doguinho** | Desenhe e proteja |
| **Block Blast** | Encaixe e limpe linhas |
| **Sudoku** | Lógica com números |
| **Road Fighter** | Corrida sem fim |
| **2048** | Junte os números |
| **Flappy Bee** | Toque para voar |
| **Snake** | Coma e cresça |
| **Stack** | Empilhe sem errar |
| **Fruit Merge** | Junte as frutas |
| **Grau 3D** | Empine e não caia |
| **Luta de Rua** | Vença todos os rivais |
| **Bombinhas** | Exploda e ache a saída |
| **Turma da Luta** | Cada um com seu poder |
| **Corre Turma** | Corra, pule e desvie |
| **Turma Crush** | Junte 3 iguais |
| **Lenhador** | Corte sem levar galhada |
| **Toque Rápido** | Não erre a peça |
| **Acerta o Alvo** | Lápis no biscoito |
| **Pula Pula** | Suba cada vez mais |
| **Atravessa** | Rua, rio e águia |
| **Fusão Infinita** | Sobreviva e funda poderes |
| **Quebra-Tijolos** | Rebata e quebre tudo |
| **Memória da Turma** | Ache os pares |
| **Pula Cor** | Passe pela sua cor |
| **Jogo do Milhão** | Rumo ao milhão! |
| **Memória: Aventura** | 30 fases com estrelas |
| **Bolha Gulosa** | Coma e cresça |
| **Paciência** | O clássico das cartas |
| **Última Carta** | Cores, +2 e coringas |
| **Território** | Feche a volta e conquiste |

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
