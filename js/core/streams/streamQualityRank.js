// Port of ysosrs123/NuvioTV-Fork core/player/StreamQualityRank.kt (45e0984): the
// deterministic quality ranking behind the fork's fourth auto-play mode,
// QUALITY_RANK ("Seleção inteligente").
//
// Candidates are ranked with the same fact extraction the Direct Debrid list
// uses, so a single user-editable preferences object drives both the visible
// debrid list and auto-pick across every source, including passthrough streams
// that never pass through the list filter.
//
// Order (resolution wins outright, no cross-tier trading): resolution -> quality
// -> preferred release-group ladder -> visual tags -> audio tags -> channels ->
// encode -> size (desc) -> container (mkv over mp4/unknown). Ties keep the
// incoming order, because Array.prototype.sort is stable.
//
// Streams matching an EXCLUDED preference are dropped from the pool first. If
// that empties the pool, ranking falls back to the unfiltered candidates so
// auto-select still plays something. Required/floor filters stay a list-level
// concern, and the user's list sort profile is ignored on purpose: a
// size-ascending list sort must not make auto-play pick the smallest file.

import {
  buildStreamFacts,
  passesExclusionFilters
} from "../debrid/directDebridStreamPresentation.js";
import { releaseGroupRank } from "./releaseGroupPreferences.js";

const CONTAINER_MKV = /\.mkv\b|\bmkv\b/i;
const UNRANKED = Number.MAX_SAFE_INTEGER;

// Release-group extraction from the fork (DirectDebridStreamFilter.kt at
// 45e0984). The official app reads the group straight from the parsed metadata
// and otherwise takes the tail of the last dash, which mangles names like
// "...DTS-HD.MA.5.1.HEVC-FraMeSToR.mkv" into "hd.ma.5.1". The fork's version
// skips the tokens that are never a group, handles bracketed names and the
// compound groups below, so the release-group ladder has something to match.
const NON_GROUP_TOKENS = new Set(
  (
    "dl rip hd uhd sd web bluray remux hdr hdr10 sdr dv dovi ma es x atmos truehd " +
    "dts aac ac3 eac3 flac opus avc hevc av1 x264 x265 h264 h265 vc1 10bit 8bit " +
    "hi10p imax proper repack extended remastered unrated multi dual sub subs dubbed " +
    "hc cam ts tc scr 2160p 1440p 1080p 720p 576p 480p 360p 4k 2k"
  ).split(" ")
);
const RELEASE_EXTENSION = /\.(mkv|mp4|m4v|avi|ts|m2ts|webm|mov)$/i;
const COMPOUND_GROUPS =
  /(?:^|[^A-Za-z0-9])(VISIONPLUSHDR-X|BR-GuyZo|Pahe\.in|Pahe\.ph|D-Z0N3|YTS\.LT|YTS\.MX|YTS\.AG|C\.A\.A)(?![A-Za-z0-9])/i;

export function releaseGroupFromText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const compound = text.match(COMPOUND_GROUPS);
  if (compound) {
    return compound[1];
  }
  const bracket = text.match(/^\[([A-Za-z0-9][A-Za-z0-9._-]{1,23})\]/);
  if (bracket && !NON_GROUP_TOKENS.has(bracket[1].toLowerCase())) {
    return bracket[1];
  }
  for (const line of text.split(/\r\n|\n|\r/)) {
    const stripped = line.trim().replace(RELEASE_EXTENSION, "");
    const cut = stripped.lastIndexOf("-");
    if (cut <= 0 || cut >= stripped.length - 1) {
      continue;
    }
    const tail = stripped.slice(cut + 1).trim();
    const candidate = (tail.match(/^[A-Za-z0-9][A-Za-z0-9._]{0,23}/)?.[0] ?? "").replace(
      RELEASE_EXTENSION,
      ""
    );
    if (!candidate) {
      continue;
    }
    if (NON_GROUP_TOKENS.has(candidate.toLowerCase())) {
      continue;
    }
    if (/^\d+$/.test(candidate) || /^\d\.\d$/.test(candidate)) {
      continue;
    }
    if (candidate.length === 1 && tail !== candidate) {
      continue;
    }
    return candidate;
  }
  return "";
}

/** The fork's release group for a stream, falling back to the official parse. */
export function forkReleaseGroup(stream = {}) {
  const resolve = stream.clientResolve || stream.raw?.clientResolve || {};
  const parsed = resolve.stream?.raw?.parsed || {};
  if (parsed.group && String(parsed.group).trim()) {
    return String(parsed.group).trim();
  }
  for (const value of [
    stream.behaviorHints?.filename,
    resolve.filename,
    resolve.stream?.raw?.filename,
    resolve.torrentName,
    resolve.stream?.raw?.torrentName,
    stream.name,
    stream.title,
    stream.description
  ]) {
    const group = releaseGroupFromText(value);
    if (group) {
      return group;
    }
  }
  return "";
}

function rank(value, preferred = []) {
  const index = (preferred || []).indexOf(value);
  return index >= 0 ? index : UNRANKED;
}

function rankAny(values = [], preferred = []) {
  return (values || []).reduce((best, value) => Math.min(best, rank(value, preferred)), UNRANKED);
}

export function containerScore(stream = {}) {
  const text = [
    stream.behaviorHints?.filename,
    stream.url ?? stream.externalUrl,
    stream.name,
    stream.title,
    stream.description
  ]
    .filter((value) => value != null)
    .join(" ");
  return CONTAINER_MKV.test(text) ? 1 : 0;
}

/** The fork's StreamFact ranks for one stream, using the given preferences. */
export function streamQualityRanks(stream, preferences = {}) {
  const officialFact = buildStreamFacts(stream);
  const group = forkReleaseGroup(stream) || officialFact.releaseGroup;
  // The fork parses the group itself, so the exclusion filter sees the same value
  // the ladder ranks (the official parse leaves most names unmatched).
  const fact =
    group === officialFact.releaseGroup ? officialFact : { ...officialFact, releaseGroup: group };
  return {
    fact,
    resolutionRank: rank(fact.resolution, preferences.preferredResolutions),
    qualityRank: rank(fact.quality, preferences.preferredQualities),
    groupRank: releaseGroupRank(group, preferences.preferredReleaseGroups),
    visualRank: rankAny(fact.visualTags, preferences.preferredVisualTags),
    audioRank: rankAny(fact.audioTags, preferences.preferredAudioTags),
    channelRank: rankAny(fact.audioChannels, preferences.preferredAudioChannels),
    encodeRank: rank(fact.codec, preferences.preferredEncodes)
  };
}

/** Stable, deterministic best-first ordering of the given streams. */
export function rankStreamsByQuality(streams = [], preferences = {}) {
  const list = Array.isArray(streams) ? streams.filter(Boolean) : [];
  if (list.length <= 1) {
    return list.slice();
  }
  const entries = list.map((stream) => ({
    stream,
    ranks: streamQualityRanks(stream, preferences)
  }));
  const pool = entries.filter((entry) => passesExclusionFilters(entry.ranks.fact, preferences));
  return (pool.length ? pool : entries)
    .sort((left, right) => {
      const leftRanks = left.ranks;
      const rightRanks = right.ranks;
      return (
        leftRanks.resolutionRank - rightRanks.resolutionRank ||
        leftRanks.qualityRank - rightRanks.qualityRank ||
        leftRanks.groupRank - rightRanks.groupRank ||
        leftRanks.visualRank - rightRanks.visualRank ||
        leftRanks.audioRank - rightRanks.audioRank ||
        leftRanks.channelRank - rightRanks.channelRank ||
        leftRanks.encodeRank - rightRanks.encodeRank ||
        Number(rightRanks.fact.size ?? -1) - Number(leftRanks.fact.size ?? -1) ||
        containerScore(right.stream) - containerScore(left.stream)
      );
    })
    .map((entry) => entry.stream);
}

/** The single source QUALITY_RANK should play, or null when there is none. */
export function bestRankedStream(streams = [], preferences = {}) {
  return rankStreamsByQuality(streams, preferences)[0] || null;
}
