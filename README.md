# BAPHO! Especial de Natal

[![Capa da BAPHO!](assets/social/bapho-1-capa.jpg)](https://jesimiel-sales.github.io/bapho-natal/)

**Site:** https://jesimiel-sales.github.io/bapho-natal/

Mariah Carey x Wham!, Natal a Natal, no Spotify do mundo e do Brasil, numa capa de revista teen de 2009. Placar de Natais vencidos, polaroids de cada ano com veredito (Humilhou, Arrasou, Suadinho, Foto-finish, Nem apareceu), replay animado do barraco narrado pela @fofoqueira_natal, raio-x das divas e o teste "Qual diva de Natal você é?".

Revista fictícia, números reais.

- Histórico semanal desde 2013 e diário a partir da coleta, para os períodos em que cada música esteve no Top 200 do Spotify (Global e Brasil). Cada Natal usa uma só régua para as duas músicas.
- Total geral (Spotify + YouTube) coletado todo dia a partir da publicação.
- Atualização automática diária via GitHub Actions. Custo zero.

## Estrutura

```
index.html                 página
assets/style.css           visual (tema claro e escuro automático)
assets/app.js              filtros, gráficos (Chart.js) e cálculos
config.json                músicas, IDs, cores e regiões
scripts/update_data.py     coletor (só biblioteca padrão do Python)
data/charts.json           histórico de chart (gerado pelo coletor)
data/totals.json           retratos diários dos totais (gerado pelo coletor)
.github/workflows/update.yml  coleta diária + deploy no GitHub Pages
tests/make_fixtures.py     gera HTML falso no formato do Kworb para testar
```

## Colocar no ar (uma vez só)

1. **Crie o repositório** no GitHub (ex.: `bapho-natal`, público) e envie todos os arquivos desta pasta para a branch `main`.
2. **Ative o Pages:** Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. **Permissão do workflow:** Settings > Actions > General > Workflow permissions: **Read and write permissions**.
4. **Chave do YouTube (opcional, mas necessária para a coluna YouTube):**
   - Acesse o Google Cloud Console, crie um projeto e ative a **YouTube Data API v3**.
   - Em Credenciais, crie uma **chave de API** e restrinja-a à YouTube Data API v3.
   - No GitHub: Settings > Secrets and variables > Actions > New repository secret. Nome: `YT_API_KEY`.
   - O uso é de 1 unidade de cota por dia, contra 10.000 gratuitas.
5. **Primeira coleta:** aba Actions > "Coleta diária e publicação" > **Run workflow**. Em cerca de 1 minuto o site estará em `https://<seu-usuario>.github.io/<repositorio>/`.

Depois disso, ele roda sozinho todo dia às 11:23 (horário de Brasília).

## Rodar localmente

```bash
python scripts/update_data.py          # coleta real (sem YouTube se não houver YT_API_KEY)
python -m http.server 8000             # abra http://localhost:8000
```

Teste sem internet, com dados falsos:

```bash
python tests/make_fixtures.py
python scripts/update_data.py --fixtures tests/fixtures
```
(Não faça commit dos dados falsos: apague `data/*.json` depois.)

## Limitações conhecidas

| Ponto | O que significa |
|---|---|
| Fora do Top 200 não há número | O Spotify só publica streams diários de quem está no chart. Fora dele, o gráfico fica em branco. |
| Série do Brasil é curta | As duas músicas ficam poucos dias no Top 200 brasileiro, perto do Natal. |
| YouTube sem histórico | A API só dá o total atual. O histórico começa no dia da primeira coleta. |
| Apple Music e Deezer | Não publicam contagens; ficam de fora do "total geral". |
| Dependência do Kworb | O coletor lê o HTML do kworb.net. Se o layout mudar, o job falha e o GitHub avisa por e-mail. Os dados já salvos nunca são apagados. |

## Trocar as músicas

Edite `config.json`: título, artista, `spotify_track_id` (está na URL da música no Spotify), `spotify_artist_id`, `youtube_video_id` e cor. Apague `data/*.json` e rode o workflow.
