
export interface OsuFileBeatmapDifficulty {
  ar: number;
  od: number;
  cs: number;
  hp: number;
  sr: number;
}

export interface OsuFileBeatmapMetadata {
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  source: string;
  tags: string;
  bid: number;
  sid: number;
  diff: string;
  creator: string;
}

export interface OsuFileBeatmapBPM {
  min: number;
  max: number;
  mostly: number;
}

export interface OsuFileBeatmapBackground {
  path: string;
  xoffset: number;
  yoffset: number;
}

export interface OsuFileBeatmapInfo {
  difficulty: OsuFileBeatmapDifficulty;
  metadata: OsuFileBeatmapMetadata;
  beatmap: {
    mode: string;
    bpm: OsuFileBeatmapBPM;
    length: number;
    drain: number;
    mods: number;
    bg: OsuFileBeatmapBackground;
  };
  original: any;
  index: number;
  mod: string;
}

export interface ParsedContent {
  timings: string[][];
  objs: string[][];
  events: string[][];
  colors: { [key: string]: string };
  original: string;
  ApproachRate?: string;
  OverallDifficulty?: string;
  CircleSize?: string;
  HPDrainRate?: string;
  Title?: string;
  TitleUnicode?: string;
  Artist?: string;
  ArtistUnicode?: string;
  Source?: string;
  Tags?: string;
  BeatmapID?: string;
  BeatmapSetID?: string;
  Version?: string;
  Creator?: string;
  Mode?: string;
  Bookmarks?: string;
}
