// Preferred release groups of the fork reference: ysosrs123/NuvioTV-Fork @
// 45e0984 ships this TRaSH-aligned ladder in domain/model/DebridSettings.kt, and
// core/player/StreamQualityRank.kt ranks a release by its position here. The
// official app has no such ladder, so without it the release-group step of the
// ranking (and the RELEASE_GROUP sort key) has nothing to order by.
//
// The list is only an order: it never hides a stream. A group that is not listed
// ranks last, which is exactly what the fork's rank() does when the lookup misses.

export const FORK_PREFERRED_RELEASE_GROUPS = Object.freeze([
  "3L",
  "BiZKiT",
  "BLURANiUM",
  "BMF",
  "CiNEPHiLES",
  "FraMeSToR",
  "PiRAMiDHEAD",
  "PmP",
  "WiLDCAT",
  "ZQ",
  "ATELiER",
  "NCmt",
  "playBD",
  "SiCFoI",
  "SURFINBIRD",
  "TEPES",
  "12GaugeShotgun",
  "decibeL",
  "EPSiLON",
  "HiFi",
  "iFT",
  "KRaLiMaRKo",
  "NTb",
  "PTP",
  "SumVision",
  "TOA",
  "TRiToN",
  "CtrlHD",
  "MainFrame",
  "DON",
  "W4NK3R",
  "HiDt",
  "HQMUX",
  "BHDStudio",
  "hallowed",
  "HONE",
  "PTer",
  "SPHD",
  "WEBDV",
  "BBQ",
  "c0kE",
  "Chotab",
  "CRiSC",
  "D-Z0N3",
  "Dariush",
  "EbP",
  "EDPH",
  "Geek",
  "LolHD",
  "TayTO",
  "TDD",
  "TnP",
  "VietHD",
  "ZoroSenpai",
  "EA",
  "HiSD",
  "QOQ",
  "SA89",
  "sbR",
  "LoRD",
  "playHD",
  "ABBIE",
  "AJP69",
  "APEX",
  "PAXA",
  "PEXA",
  "XEPA",
  "BLUTONiUM",
  "BYNDR",
  "CMRG",
  "CRFW",
  "CRUD",
  "FLUX",
  "GNOME",
  "KiNGS",
  "Kitsune",
  "MADSKY",
  "NOSiViD",
  "NTG",
  "RAWR",
  "SiC",
  "TheFarm",
  "dB",
  "Flights",
  "MiU",
  "monkee",
  "MZABI",
  "PHOENiX",
  "playWEB",
  "SMURF",
  "TOMMY",
  "XEBEC",
  "4KBEC",
  "CEBEX",
  "BLOOM",
  "Dooky",
  "GNOMiSSiON",
  "HHWEB",
  "NINJACENTRAL",
  "NPMS",
  "ROCCaT",
  "SiGMA",
  "SLiGNOME",
  "SwAgLaNdEr"
]);

// The fork lowercases both sides before comparing, so the ladder keeps its
// original casing for display while matching case-insensitively.
export function releaseGroupRank(releaseGroup, preferred = FORK_PREFERRED_RELEASE_GROUPS) {
  const value = String(releaseGroup || "")
    .trim()
    .toLowerCase();
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }
  const index = (preferred || []).findIndex(
    (group) =>
      String(group || "")
        .trim()
        .toLowerCase() === value
  );
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}
