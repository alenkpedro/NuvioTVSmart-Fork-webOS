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

|               | Projeto antigo (port)                                            | Base nova                                                   |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Origem        | `ysosrs123/NuvioTV-Fork` @ `45e0984`                             | `NuvioMedia/NuvioTVSmart`                                   |
| Ramo/commit   | `codex/lg-webos-ut8050` @ `66b8031`                              | `main` @ `fcac952`                                          |
| Versão        | prévia webOS 0.31.0                                              | 1.1.2 (release 09/09/2026)                                  |
| Caminho local | `work/NuvioTV-Fork/webos`                                        | `work/NuvioTVSmart-fork`                                    |
| Publicação    | `alenkpedro/NuvioTV-Fork-webOS` (tags `webos-v0.1.0`..`v0.31.0`) | ainda sem fork próprio                                      |
| ID do app     | `org.nuviofork.webos`                                            | `space.nuvio.webos` (+ serviço `space.nuvio.webos.service`) |
| Build         | `npm run build` / `npm run package:webos`                        | `npm run build` / `npm run package:webos`                   |

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

| #   | Recurso do port antigo                                                                                                                      | Referência no projeto antigo                                                                                  | Situação nesta base                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | **Buffer de reprodução personalizado** (buffer inicial, após travamento e limite de espera)                                                 | `webos/src/core/buffer.js` (porte de `PlayerSettingsDataStore.BufferSettings`)                                | **Feito nesta rodada** (ver abaixo)                                                           |
| 2   | **Teste de velocidade por fonte** (taxa real e latência no cartão da lista)                                                                 | `webos/src/core/speed-test.js` (porte de `StreamSpeedTester`)                                                 | Pendente — `grep mbps/throughput` não encontra nada no oficial                                |
| 3   | **Miniaturas do seek lendo o quadro do arquivo**                                                                                            | `webos/src/player-thumbnails.js` (porte de `SeekThumbnailEngine`)                                             | Pendente — o oficial mostra só o tempo (`#playerSeekPreview`), sem imagem                     |
| 4   | **Modo de auto-play "Seleção inteligente"** (4º modo, por ranking do fork)                                                                  | `webos/src/core/auto-play.js`                                                                                 | Pendente — o oficial tem `MANUAL`, `FIRST_STREAM` e `REGEX_MATCH`                             |
| 5   | **Ranking de fontes do fork** (resolução, qualidade, grupo, vídeo, áudio, canais, encode, tamanho; 31 preferências e 104 grupos preferidos) | `webos/src/core/ranking.js` + `fork-defaults.json` (portes de `StreamQualityRank`/`DirectDebridStreamFilter`) | Pendente — o oficial ordena por fonte (`streamOrdering`) e tem badges, sem nota por qualidade |
| 6   | **Tela de pausa com arte e elenco**                                                                                                         | `webos/src/player-pause.js` (porte de `PauseOverlay.kt`)                                                      | Verificar na TV o que o `#playerPauseOverlay` do oficial já mostra                            |
| 7   | **Identidade visual do fork** (rail de categorias, 12 paletas, estilos Minimalista/Barra Superior)                                          | `webos/src/settings-kit.js`, `settings-screen.js`                                                             | Só se o usuário quiser; o oficial tem a própria                                               |

Regras que continuam válidas para tudo que for trazido do fork: nada de binário ou
API exclusiva do Android; o que depender de hardware (HDR, passthrough, DV) só é
afirmado com medição na TV.

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
   - `tests/playbackBufferPolicy.test.mjs` (pasta `tests/` é ignorada pelo git do
     upstream): `node --test tests/playbackBufferPolicy.test.mjs` — 8 testes.
2. **Teste de velocidade nas fontes** — medir a fonte real pelo mesmo transporte da
   reprodução (proxy local quando a fonte exigir cabeçalhos) e mostrar taxa e latência
   no cartão da lista, com orçamento pequeno de bytes.
3. **Miniaturas do seek** — ler o quadro do próprio arquivo sob demanda para o
   `playerSeekPreview`, com cache limitado e desligado quando a TV não permitir.
4. **Ranking e seleção automática do fork** — portar `ranking.js` (e os padrões de
   `fork-defaults.json`) para dentro de `js/core/streams/`, ligar no
   `streamAutoPlaySelector` como quarto modo e expor o ordenamento na lista.
5. **Pausa com arte/elenco** — comparar `#playerPauseOverlay` com `PauseOverlay.kt` e
   fechar as diferenças.
6. **Publicação** — fork próprio no GitHub, `appinfo.json` com id próprio para
   conviver com o app oficial instalado, workflow de IPK e `apps.json` para o Homebrew.

## Validação

- `npm run build` — bundle OK a cada mudança.
- `npx eslint` e `npx prettier --check` nos arquivos tocados.
- `node --test tests/*.test.mjs` — regras puras.
- Testes de navegador não substituem a TV: cada rodada precisa de instalação na LG.
