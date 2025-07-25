export interface BeatmapSelectionItem {
  beatmapId: string | number;
  type: string;
  team: string;
  [key: string]: any;
}

export interface MatchResultItem {
  left: {
    score: number;
    accuracy: number;
  };
  right: {
    score: number;
    accuracy: number;
  };
  beatmapId: number;
}

export function clearAllStoredData(mode: string): void;

export function storeBeatmapSelection(item: BeatmapSelectionItem, mode: string): void;

export function getStoredBeatmapById(beatmapID: string, mode: string): BeatmapSelectionItem | null;

export function getStoredBeatmap(mode: string): Map<string | number, BeatmapSelectionItem> | null;

export function deleteBeatmapSelectionById(beatmapID: string, mode: string): void;

export function storeBeatmapProtection(item: BeatmapSelectionItem): void;

export function getStoredBeatmapProtectionById(beatmapID: string): BeatmapSelectionItem | null;

export function getStoredBeatmapProtection(): Map<string | number, BeatmapSelectionItem> | null;

export function deleteBeatmapProtectionById(beatmapID: string): void;

export function storeMatchResult(scores: MatchResultItem, mode: string): void;

export function getStoredMatchResult(mode: string): Map<number, MatchResultItem> | null;

export function getStoredMatchResultById(beatmapID: string, mode: string): MatchResultItem | null;

export function deleteMatchResultById(beatmapID: string, mode: string): void;
