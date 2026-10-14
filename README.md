# 🐶 Salve o Doguinho

Desenhe **uma linha** para proteger o doguinho das abelhas e aguente até o tempo acabar.
Quanto menos tinta você usar, mais estrelas ganha.

- 20 fases com dificuldade crescente (buracos, pilares, espinhos, abelhas vindo de baixo…)
- Feito para celular (toque, tela 9:16, vibração), funciona também no computador
- Física real com Matter.js: a linha cai, as abelhas empurram, os espinhos furam
- Ranking (local, ou global com um backend REST)

## Stack

Vite · TypeScript (strict) · Phaser 3 (Matter) · Vitest · ESLint · Prettier

## Rodando

```bash
npm install
npm run dev        # abre em http://localhost:5173 (e no IP da rede, para testar no celular)
npm run check      # tipos + lint + testes
npm run build      # gera dist/
```

Para testar no celular: rode `npm run dev`, conecte o celular na mesma rede Wi-Fi e abra o endereço
`Network:` exibido no terminal.

## Ranking global

Por padrão o ranking fica salvo no aparelho. Para um ranking global, defina `VITE_LEADERBOARD_URL`
(veja `.env.example`) apontando para um endpoint que:

- `GET` → retorna `[{ id, name, stars, deaths, inkSaved, score, date }]` (ou `{ entries: [...] }`)
- `POST` ← recebe uma entrada nesse mesmo formato

Se o servidor estiver fora do ar, o jogo usa o ranking local automaticamente.

## Arquitetura

Veja [docs/patterns/game-architecture.md](docs/patterns/game-architecture.md).
