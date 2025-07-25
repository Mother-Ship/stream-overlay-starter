import {BracketBeatmap, BracketBeatmapInfo, BracketData} from './types/bracket-models';


export class BracketDataManager {
  private static instances: Map<string, BracketDataManager> = new Map();
  private data: BracketData | null = null;
  private loadingPromise: Promise<BracketData> | null = null;
  private DEBUG = true;

  private constructor(private mode: string) {
  }


  static getInstance(mode: string): BracketDataManager {
    if (!BracketDataManager.instances.has(mode)) {
      BracketDataManager.instances.set(mode, new BracketDataManager(mode));
    }
    return BracketDataManager.instances.get(mode)!;
  }

  async init(): Promise<BracketData> {
    if (this.data) {
      return this.data;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadBracketData();
    this.data = await this.loadingPromise;
    this.loadingPromise = null;
    return this.data;
  }

  private async loadBracketData(): Promise<BracketData> {
    try {
      const response = await fetch(`../../data/bracket-${this.mode}.json`);
      if (response.ok) {
        try {
          const jsonData = await response.json();
          const data = new BracketData(jsonData);
          if (this.DEBUG) {
            console.log(`[bracket] Loaded bracket data for mode ${this.mode}`);
          }
          return data;
        } catch (e) {
          console.log(`[bracket] Request succeeded, but failed to parse JSON: ${e}`);
        }
      }
      console.log(`[bracket] Failed to load bracket_${this.mode}.json, code ${response.status}`);
      return new BracketData({Rounds: [], Teams: []});
    } catch (error) {
      console.log(`[bracket] Error loading bracket data: ${error}`);
      return new BracketData({Rounds: [], Teams: []});
    }
  }

  getData(): BracketData | null {
    return this.data;
  }

  // 将原来暴露的函数作为类方法
  getAllRounds() {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    return this.data.Rounds.map(round => ({roundName: round.Name}));
  }

  getBeatmapListByRoundName(name: string) {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    return this.data.Rounds.find(round => round.Name === name)?.Beatmaps || [];
  }

  getTeamFullInfoByName(teamName: string) {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    return this.data.Teams.find(team => team.FullName === teamName);
  }

  getFullInfoByIdList(bidList: number[]) {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    const results = new Map();
    for (const bid of bidList) {
      const result = this.findBeatmapAndIndex(bid);
      results.set(bid, result);
    }
    return results;
  }

  private findBeatmapAndIndex(bid: number) {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    let findedMap: BracketBeatmap | null = null;
    let mods = '';
    let index = 1;

    for (const round of this.data.Rounds) {
      if (!Array.isArray(round.Beatmaps)) continue;
      for (const beatmap of round.Beatmaps) {
        if (beatmap.Mods !== mods) {
          index = 1;
        }
        mods = beatmap.Mods;
        if (beatmap.ID === bid) {
          findedMap = beatmap;
          break;
        }
        index++;
      }
      if (findedMap) break;
    }

    return findedMap ? {
      beatmap: findedMap,
      modName: findedMap.Mods,
      index: index
    } : {
      beatmap: new BracketBeatmap({ID: 0, Mods: '00', BeatmapInfo: new BracketBeatmapInfo({})}),
      modName: "00",
      index: 0
    };
  }

  getModNameAndIndexById(bid: number) {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    const result = this.findBeatmapAndIndex(bid);
    return {modName: result.modName, index: result.index};
  }

  getFullBeatmapFromBracketById(bid: number) {
    if (!this.data) {
      throw new Error('BracketDataManager not initialized');
    }
    for (const round of this.data.Rounds) {
      if (Array.isArray(round.Beatmaps)) {
        const beatmap = round.Beatmaps.find(b => b.ID === bid);
        if (beatmap) return beatmap;
      }
    }
    return null;
  }
}

