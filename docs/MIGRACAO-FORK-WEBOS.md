# Migração: port do fork -> base oficial (NuvioTVSmart)

Este documento registra a mudança de estratégia combinada com o usuário e o que
ela significa na prática.

## Decisão

O port do `ysosrs123/NuvioTV-Fork` para webOS (prévia **0.31.0**, `webos/` do
repositório `NuvioTV-Fork`) reconstruía tudo à mão em cima de um app Android: player,
addons, biblioteca, coleções, ajustes, legendas. O trabalho de 0.1 a 0.31 mostrou
onde ficam os custos que **não** são recursos do fork e sim infraestrutura de TV:

- plug-ins JS, P2P/torrent, proxy de mídia local, HLS/DASH próprios, ASS/SSA e
  PGS/VOBSUB, extração de faixas do contêiner, i18n e sincronização.

Essas peças já existem, prontas e testadas, no app **oficial** (`NuvioMedia/NuvioTVSmart`),
que é um web app para Tizen + webOS. Em vez de continuar reimplementando a
plataforma, a base passa a ser o app oficial e o trabalho vira **trazer para ele os
recursos e comportamentos do fork** que ele ainda não tem.

O projeto antigo continua preservado (backup + repositório/histórico) como
referência de comportamento, textos e regras portadas do fork.

## Estado dos dois projetos

|               | Projeto antigo (port)                                            | Base nova                                                                                                                                       |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Origem        | `ysosrs123/NuvioTV-Fork` @ `45e0984`                             | `NuvioMedia/NuvioTVSmart`                                                                                                                       |
| Ramo/commit   | `codex/lg-webos-ut8050` @ `66b8031`                              | `main` @ `fcac952`                                                                                                                              |
| Versão        | prévia webOS 0.31.0                                              | 1.1.2 (release 09/09/2026)                                                                                                                      |
| Caminho local | `work/NuvioTV-Fork/webos`                                        | `work/NuvioTVSmart-fork`                                                                                                                        |
| Publicação    | `alenkpedro/NuvioTV-Fork-webOS` (tags `webos-v0.1.0`..`v0.31.0`) | ainda sem fork próprio                                                                                                                          |
| ID do app     | `org.nuviofork.webos` (0.31.0)                                   | `org.nuviofork.webos` + `org.nuviofork.webos.service` / `.plugin.service`; o id oficial `space.nuvio.webos` **não** é mais usado (versão 1.1.3) |
| Build         | `npm run build` / `npm run package:webos`                        | `npm run build` / `npm run package:webos`                                                                                                       |

Backup do projeto antigo: `backups/2026-09-17/` (`nuvio-fork-all-refs.bundle` com o
histórico completo, `nuvio-fork-webos-0.31.0-src.tar.gz`, `nuvio-smart-official-clone-1.1.2.tar.gz`
e `SHA256SUMS.txt`).

## Como o app oficial está organizado (o que já dá para usar)

- `js/core/player/engines/` — `nativeVideoEngine`, `hlsJsEngine`, `dashJsEngine`,
  `platformAvplayEngine`; `js/core/player/playerController.js` é o motor único.
- `js/core/player/plugin*.js` + `js/platform/webos/webosPluginService.js` +
  `services/webos/plugin/` — plug-ins.
- `js/core/p2p/`, `js/core/media/`, `js/platform/webos/webosPlaybackProxy.js` —
  torrent/EngineFS e proxy de mídia local (portas 2710/2711).
- `js/core/streams/` — `streamOrdering`, `streamBadgeRules`, `streamAutoPlaySelector`,
  `streamResumeIdentity`.
- `js/data/local/*Store.js` — preferências (perfil e dispositivo): `playerSettingsStore`,
  `debridSettingsStore`, `streamPreferencesStore`, `collectionsStore`, `themeStore`, etc.
- `js/ui/screens/` — `home`, `catalog`, `detail`, `stream`, `player`, `collection`,
  `settings`, `trakt`, `plugin`, `tmdb`, `library`, `search`.
- `js/i18n/index.js` + `res/values*/strings.xml` — 36 idiomas, **pt-BR incluído**;
  `t("chave", {}, "Texto em inglês")` com o XML por cima.
- `docs/youtube-proxy.html` — trailer dentro do app (mesmo protocolo `nuvio-youtube-proxy`
  que o port antigo tinha implementado).

Recursos do port antigo que **já existem** no oficial (comprovados por busca no código):
skip intro por IntroDB (`skipIntroRepository`), guia parental (`parentalGuideRepository`),
pós-reprodução (`postPlayRecommendationController`), coleções (`collectionsStore`),
cache do último link (`streamReuseLastLinkCacheHours`), preferências de debrid e grupos
de release (`debridSettingsStore`), overlay de pausa e de carregamento, estilo de
legenda + atraso, temas/AMOLED, MDBList, Trakt e Simkl.

## Diferenças reais (o que veio do fork e ainda não existe no oficial)

| #   | Recurso do port antigo                                                                             | Referência no projeto antigo                                                         | Situação nesta base                                                            |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | **Buffer de reprodução personalizado** (buffer inicial, após travamento e limite de espera)        | `webos/src/core/buffer.js` (porte de `PlayerSettingsDataStore.BufferSettings`)       | **Feito nesta rodada** (ver abaixo)                                            |
| 2   | **Teste de velocidade por fonte** (taxa real e latência no cartão da lista)                        | `webos/src/core/speed-test.js` (porte de `StreamSpeedTester`)                        | Pendente — `grep mbps/throughput` não encontra nada no oficial                 |
| 3   | **Miniaturas do seek lendo o quadro do arquivo**                                                   | `webos/src/player-thumbnails.js` (porte de `SeekThumbnailEngine`)                    | Pendente — o oficial mostra só o tempo (`#playerSeekPreview`), sem imagem      |
| 4   | **Modo de auto-play "Seleção inteligente"** (4º modo, por ranking do fork)                         | `webos/src/core/auto-play.js`, `app/.../PlayerSettingsDataStore.kt` (`QUALITY_RANK`) | **Feito nesta rodada** (`streamAutoPlaySelector.js`)                           |
| 5   | **Ranking de fontes do fork** (resolução, qualidade, grupo, vídeo, áudio, canais, encode, tamanho) | `app/.../StreamQualityRank.kt` + `DebridSettings.kt` (104 grupos preferidos)         | **Feito nesta rodada** (`streamQualityRank.js` + `releaseGroupPreferences.js`) |
| 6   | **Fonte fixa Netflix Sans na legenda**                                                             | `webos/src/subtitle-style-editor.js` + `assets/fonts`                                | Pendente — o oficial não empacota fonte (usa a do sistema)                     |
| 7   | **Transferência de biblioteca** (importar/exportar)                                                | `LibraryTransferFlow.kt` do fork, que nunca chegou ao webOS                          | Pendente — não existe no oficial                                               |
| 8   | **Identidade visual do fork** (rail de categorias, 12 paletas, estilos Minimalista/Barra Superior) | `webos/src/settings-kit.js`, `settings-screen.js`                                    | Só se o usuário quiser; o oficial tem a própria                                |

Notas deliberadas desta rodada: os 104 grupos preferidos entram como **ordem**, nunca
como filtro, e o app continua **sem limite de resultados** (`maxResults` 0 em vez dos 8
do fork) e **sem os 155 grupos de lixo excluídos** por padrão — em ambos os casos para
não sumir com fontes sem o usuário ter pedido (as listas são editáveis em Ajustes →
Integrações → Direct Debrid → Regras de stream). A ordem padrão da lista também não
mudou: o ranking vale para o modo `QUALITY_RANK` e para o critério de grupo.

Regras que continuam válidas para tudo que for trazido do fork: nada de binário ou
API exclusiva do Android; o que depender de hardware (HDR, passthrough, DV) só é
afirmado com medição na TV.

## Inventário das melhorias do antigo (0.1 → 0.31) contra a base oficial

Tudo que o port antigo entregou, item por item, conferido por busca no código do
aplicativo oficial. `✔` já existe lá, `◑` existe em parte, `✗` falta, `—` é decisão de
produto (identidade visual).

| Versão    | Melhoria do projeto antigo                                                                                                           | Na base oficial                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 0.2–0.4   | Layout do fork reconstruído (Modern/Clássico, menu flutuante/oculto, metadados do destaque, detalhes/episódios, restauração de foco) | ✔ `modernHomeLayout.js`, sidebar, `metaDetailsScreen`, foco restaurado                                         |
| 0.5       | Fontes com filtro/atualização/retorno, painéis de áudio, legendas externas SRT/VTT                                                   | ✔ `streamScreen` (chips por fonte), `audioTrackCodecMetadata`, `subtitleText`                                  |
| 0.6       | Perfis/PIN, addons próprios/herdados, biblioteca da conta, isolamento por perfil                                                     | ✔ `profileSelectionScreen` (PIN), `profileScopedStore`, `savedLibraryStore`                                    |
| 0.7–0.8   | Histórico nativo por perfil, retomada, fila de envio, conflitos                                                                      | ✔ `watchProgressStore`, `watchProgressSyncService`, `js/core/sync`                                             |
| 0.9       | Descobrir, filtros, busca, recentes por perfil                                                                                       | ✔ `screens/search`, `screens/catalog`, `js/core/tmdb`                                                          |
| 0.10      | Elenco/pessoa/filmografia, recomendações TMDB, trailers                                                                              | ✔ `tmdbMetadataService`, trailer no app pelo `docs/youtube-proxy.html`                                         |
| 0.11      | Coleções/franquias TMDB, avaliações MDBList                                                                                          | ✔ `tmdbMetadataService`, `mdbListSettingsStore`, `metaDetailsScreen`                                           |
| 0.12      | Idiomas principal/secundário, próximo episódio                                                                                       | ✔ `playerNextEpisodeRules`, preferências de idioma                                                             |
| 0.13      | Legenda forçada/SDH, filtro por idioma, memória de faixas por título/perfil                                                          | ✔ `trackPreferencesStore`, `subtitleStyle` (idiomas preferidos)                                                |
| 0.14      | Velocidade, relógio no OSD, continuidade                                                                                             | ✔ `playerScrubRates`, `osdClockEnabled`, `stillWatching*`                                                      |
| 0.15      | Episódios no player, sete proporções de imagem                                                                                       | ✔ painel de episódios no `playerScreen`, `ASPECT_MODE_IDS`                                                     |
| 0.16      | Barra do player do fork (Mais, Fontes, Informação, Voltar recolhe controles)                                                         | ✔ barra própria do oficial (mesma linhagem Android)                                                            |
| 0.17      | Painéis de áudio/legenda, atraso até ±180 s, sincronizar por fala                                                                    | ✔ `subtitleAutoSync`, `subtitleDelayPreferencesStore`                                                          |
| 0.18      | Tela de pausa com arte, sinopse e elenco                                                                                             | ✔ `#playerPauseOverlay` (logo/título/ano/episódio/sinopse/elenco) — mais completa que a do antigo              |
| 0.19      | Editor de legenda (tamanho/negrito/cor/opacidade/contorno/posição), Pular introduções, auto-skip                                     | ✔ `subtitleStyle`, `skipIntroRepository` (IntroDB), `autoSkipSegmentTypes`                                     |
| 0.19      | Miniaturas do trecho lendo o quadro do próprio arquivo                                                                               | ✗ falta (só o tempo no `#playerSeekPreview`)                                                                   |
| 0.19      | Netflix Sans fixa na legenda                                                                                                         | ✗ falta (nenhuma fonte empacotada)                                                                             |
| 0.20      | Ajustes no estilo do fork (rail de dez categorias, 12 paletas, AMOLED, estilos Minimalista/Barra Superior)                           | — identidade visual; o oficial tem `settingsScreen.js` (8,3 mil linhas) com a própria organização              |
| 0.21      | Guia parental e recomendações pós-reprodução                                                                                         | ✔ `parentalGuideRepository`, `postPlayRecommendationController`                                                |
| 0.22      | Quatro modos de auto-play, cache do último link, trailer automático                                                                  | ✔ os quatro modos (`QUALITY_RANK` entrou nesta rodada) + cache (`streamReuseLastLinkCacheHours`) + trailer     |
| 0.23      | Buffer personalizado (5 s / 3 s / limite 20 s)                                                                                       | ✔ feito nesta base (rodada 1)                                                                                  |
| 0.23      | Teste de velocidade na lista de fontes                                                                                               | ✗ falta                                                                                                        |
| 0.24/0.30 | Coleções com pastas, fontes de add-on e TMDB, fixar no topo, grade e abas                                                            | ✔ `collectionsStore` (tem `pinToTop`) e telas de coleção                                                       |
| 0.25      | Ajustes de foco, Voltar visível na lista de fontes, segurar OK em Continuar assistindo                                               | ✔ provável (foco/`handlesRelaunch`); conferir na TV                                                            |
| 0.26–0.27 | Fonte fina de legenda, miniaturas 4K, ordem dos add-ons                                                                              | ◑ ordem dos add-ons ✔ (`streamOrdering`); miniatura ✗                                                          |
| 0.28–0.29 | Telas de carregamento do fork, esqueleto por fileira, Home focando a primeira fileira, add-ons sendo consultados                     | ✔ `skeleton` na Home e nas fontes, overlay de carregamento, `sourceChips`/`hasPendingSourceLoads`; miniatura ✗ |
| 0.31      | Trailer dentro do app e serviço de rede local (cabeçalhos, sem CORS)                                                                 | ✔ `docs/youtube-proxy.html`, `services/webos` (proxy 2710/2711 + `plugin-http.cjs`)                            |
| —         | Ranking do fork (`StreamQualityRank`/`DirectDebridStreamFilter`, 31 preferências e 104 grupos)                                       | ✗ falta (o oficial ordena por fonte e usa badges)                                                              |
| —         | Transferência de biblioteca                                                                                                          | ✗ falta                                                                                                        |
| —         | Avaliação do dispositivo (`DeviceAssessmentEngine`)                                                                                  | ✗ nunca foi concluída nem no antigo; seguia pendente no roteiro                                                |

Resumo: **das melhorias do antigo, falta trazer cinco itens** — teste de velocidade,
miniaturas do seek, modo de auto-play por ranking, ranking do fork e transferência de
biblioteca — além da fonte Netflix Sans (visual) e da identidade dos Ajustes (decisão
do usuário).

## Design do player: fork x base oficial (medido)

O oficial já deriva da mesma linhagem Android e converte os valores do Android TV
com o mesmo fator ×2 (`#playerUiRoot { --player-controls-x: min(3.33vw, 64px) /* ATV
32dp -> 64px */ ... }`, em `css/components.css`). Comparando com a especificação que
o port antigo transcreveu de `PlayerScreen.kt` (`webos/PLAYER_PARITY.md`):

| Item                              | Fork (dp → px a 1080p)                                                | Base oficial hoje                                                        | Diferença                  |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------- |
| Margem horizontal da barra        | 32 dp → 64 px                                                         | `--player-controls-x: min(3.33vw, 64px)`                                 | igual                      |
| Margem inferior da barra          | 48 dp → 96 px                                                         | `--player-controls-y: min(2.5vw, 48px)` (24 dp)                          | **metade**                 |
| Círculo de ícone / ícone          | 48 dp / 28 dp → 96 / 56 px                                            | 96 px / 48 px (24 dp)                                                    | ícone 8 px menor           |
| Linha do tempo (traço / foco)     | 3 dp / 8 dp → 6 / 16 px                                               | 6 px (3 dp) / 20 px (foco 10 dp)                                         | foco mais alto             |
| Marcador da linha do tempo        | 12 dp → 24 px                                                         | não encontrado com esse nome                                             | conferir                   |
| Painel de fontes dentro do player | 440 dp → 880 px, preto 85%, raio 16 dp → 32 px, padding 16 dp → 32 px | `.player-sources-panel` 520 px, raio 16 px, fundo elevado, padding 24 px | **bem menor e mais claro** |
| Painéis de áudio/legenda          | 320 dp → 640 px, raio 20 dp → 40 px                                   | medida não localizada pelo nome do port                                  | conferir                   |
| Gradientes (topo / base)          | 150 dp / 200 dp → 300 / 400 px                                        | há gradiente no overlay de carregamento                                  | conferir                   |
| Logo do título na barra           | máx 340×72 dp → 680×144 px                                            | `.player-title` sem limite equivalente                                   | conferir                   |

Conclusão: a **estrutura** da barra (título/logo, ícones à direita, Mais, linha do
tempo com buffer, cápsulas, relógio/término, painéis) já existe na base oficial; o que
difere são **valores medidos** — sobretudo a margem inferior, o tamanho do painel de
fontes e o ícone das cápsulas. Ajustar esses valores é a próxima rodada do design, e
cada troca precisa de conferência na TV (é aparência, não regra).

### Feito na rodada do design (1.4.0)

Bloco `#playerUiRoot` no fim de `css/components.css`, com os valores do fork em
dp/sp convertidos x2 (o arquivo já usava essa convenção):

- Margem inferior da barra **48 dp -> 96 px** (estava 24 dp).
- Icone das capsulas **28 dp -> 56 px** (estava 24 dp).
- Titulo **24 sp semibold -> 48 px/600** e episodio **16 sp -> 32 px/500**.
- Linha do tempo focada **8 dp -> 16 px** (estava 10 dp).
- Painel de fontes/episodios dentro do player **440 dp -> 880 px**, padding
  **16 dp -> 32 px** e fundo **preto 85%** (estava 520 px, padding 24 px e fundo
  elevado).

Falta do design, para a proxima rodada (precisa identificar o elemento exato de
cada um no DOM do oficial): gradientes **topo 150 dp -> 300 px** e **base 200 dp
-> 400 px**; paineis de audio/legenda **320 dp -> 640 px** com raio **40 px**;
painel de estatisticas **380 dp -> 760 px**; marcador da linha do tempo **12 dp
-> 24 px**; e a conferencia dos paineis/controles na TV, que decide se o valor
do fork fica ou volta ao do oficial.

## Rodadas

1. **Buffer e rede (feito nesta rodada)**
   - `js/core/player/playbackBufferPolicy.js` — regra pura: alvos, faixas 0–20 s,
     espera de 5–60 s, `bufferedAheadSeconds` e laço de espera cancelável.
   - `js/data/local/playerSettingsStore.js` — `customBufferEnabled`,
     `bufferInitialSeconds` (5 s), `bufferAfterRebufferSeconds` (3 s),
     `bufferWaitTimeoutSeconds` (20 s).
   - `js/core/player/playerController.js` — `enforcePlaybackBufferGate()` chamado nos
     eventos `waiting` e `playing`: pausa, espera o alvo (ou o limite), retoma. AVPlay
     continua com os próprios parâmetros (`configureAvPlayBuffering`).
   - `js/ui/screens/settings/settingsScreen.js` + `res/values*/strings.xml` — chave,
     textos em inglês e pt-BR, com as três opções.
   - `tests/playbackBufferPolicy.test.mjs` — `node --test tests/playbackBufferPolicy.test.mjs`
     (8 testes). A pasta `tests/` é ignorada pelo `.gitignore` do upstream; neste
     fork ela é versionada com `git add -f`.
2. **Teste de velocidade nas fontes — feito (1.5.0).**
   - `js/core/network/streamSpeedTester.js` — orcamento do fork (aquecimento de
     256 KB, 2 MB medidos, janela de 0,8-4 s, 8 s de limite, ate 4 fontes, 2 por vez),
     taxas por sub-janela, medicao cancelavel e falhas como resultado (nunca excecao).
   - `js/ui/screens/stream/streamScreen.js` — chip no cartao com a taxa e a latencia
     (`9,4 Mbps · 230 ms`), medindo as primeiras fontes quando a lista abre.
   - `streamSpeedTestEnabled` (padrao **desligado**, porque e trafego real) em
     Ajustes -> Reproducao -> Testar velocidade das fontes; textos pt-BR/ingles.
   - `tests/streamSpeedTester.test.mjs` — 8 testes (aritmetica, cabecalho Range,
     aquecimento/orcamento, corpo em bloco unico, falhas e limite de fontes).
     reprodução (proxy local quando a fonte exigir cabeçalhos) e mostrar taxa e latência
     no cartão da lista, com orçamento pequeno de bytes.
3. **Miniaturas do seek** — ler o quadro do próprio arquivo sob demanda para o
   `playerSeekPreview`, com cache limitado e desligado quando a TV não permitir.
4. **Ranking e seleção automática do fork — feito.**
   - `js/core/streams/releaseGroupPreferences.js` — os 104 grupos preferidos do
     fork, na ordem do arquivo de referência, com `releaseGroupRank()`.
   - `js/core/streams/streamQualityRank.js` — porte de `StreamQualityRank.kt`: o
     parser de grupo do fork, os ranks por preferência, o filtro só de exclusões
     com queda para o conjunto inteiro, tamanho/contêiner como desempate e ordem
     estável. Reusa os fatos do `directDebridStreamPresentation.js` (que passou a
     exportar `buildStreamFacts`, `passesExclusionFilters` e a escada de grupos no
     critério `RELEASE_GROUP`).
   - `js/core/streams/streamAutoPlaySelector.js` — `QUALITY_RANK`, o quarto modo, com
     `rankPreferences` vindas das mesmas preferências do Direct Debrid.
   - Ajustes: modo novo em Reprodução → Seleção automática de fonte e a lista de
     grupos preferidos em Integrações → Direct Debrid → Regras de stream.
   - `tests/streamQualityRank.test.mjs` — 11 testes (ladder, parser de grupo,
     resolução, qualidade, exclusões com queda, tamanho, contêiner, estabilidade e o
     modo no seletor).
     `fork-defaults.json`) para dentro de `js/core/streams/`, ligar no
     `streamAutoPlaySelector` como quarto modo e expor o ordenamento na lista.
5. **Fonte Netflix Sans nas legendas** — empacotar a face usada pelo antigo e ligá-la ao
   `subtitleStyle`, já que o oficial não traz fonte própria (item visual pedido pelo usuário).
6. **Identidade e publicação — feito.** O app é `org.nuviofork.webos` **1.1.3**
   (`org.nuviofork.webos.service` e `.plugin.service`), com título e fornecedor
   “Nuvio Fork”, convivendo com o app oficial instalado. Código em
   `alenkpedro/NuvioTVSmart-Fork-webOS` (base `fcac952` + estes commits), release
   `webos-v1.1.3` com `org.nuviofork.webos_1.1.3_all.ipk`,
   e o índice do Homebrew que a TV já usa (`alenkpedro/NuvioTV-Fork-webOS@webos`,
   arquivo `apps.json`) aponta para 1.1.3 com o SHA-256 `f60f2a9d…6153` (5.455.914
   bytes). Como o id é o mesmo do port antigo, a atualização pelo Homebrew
   **substitui** o 0.31.0 na TV, sem tocar no app oficial. As Actions do repositório
   novo ficaram desligadas para não rodar os workflows de Tizen/instaladores do
   upstream; falta um workflow só de webOS (publicar o IPK e atualizar o índice).

## Runtime env: por que o app ficava na tela inicial

O app le `local.properties` (ignorado pelo git) para a configuracao publica de
backend e integracoes, e cai no `local.example.properties` **vazio** quando o
arquivo nao existe. Com `NUVIO_SUPABASE_URL` vazio a inicializacao da conta nao
completa e o app fica parado na tela inicial — foi o que aconteceu no simulador.

Correcao: `npm run env:mirror` (`scripts/mirror-official-runtime-env.mjs`) baixa o
IPK do release oficial, extrai o `nuvio.env.js` e escreve o `local.properties` com
as 20 chaves (Supabase, TMDB, Trakt, Simkl, Premiumize, IntroDB, avatares). Rode
antes do `npm run build`/`package:webos` em um clone novo ou no CI.

## Validação

- `npm run build` — bundle OK a cada mudança.
- `npx eslint` e `npx prettier --check` nos arquivos tocados.
- `node --test tests/*.test.mjs` — regras puras.
- Testes de navegador não substituem a TV: cada rodada precisa de instalação na LG.
