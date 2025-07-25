import {MapMockData} from "./types/map-mock-models.ts";
import type {OsuFileBeatmapInfo, OsuFileBeatmapMetadata} from "./types/parsed-osu-file-models.ts";

class MapMockManager {
  private static instances: Map<string, MapMockManager> = new Map();
  private mocks: MapMockData;
  private DEBUG = true;
  private mode: string;
  private loadingPromise: Promise<MapMockData> | null = null;

  private constructor(mode: string) {
    this.mode = mode;
  }

  public static getInstance(mode: string): MapMockManager {
    if (!MapMockManager.instances.has(mode)) {
      MapMockManager.instances.set(mode, new MapMockManager(mode));
    }
    return MapMockManager.instances.get(mode)!;
  }

  async init() {
    if (this.mocks) {
      return this.mocks;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadMocks();
    this.mocks = await this.loadingPromise;
    this.loadingPromise = null;
    return this.mocks;
  }

  async loadMocks() {
    let mapmocks = await fetch(`../../data/mapmock-${this.mode}.json`);
    if (mapmocks.ok) {
      try {
        let json = await mapmocks.json();
        return new MapMockData(json);
      } catch (e) {
        console.log(`[mock] request succeeded, but failed to parse json: ${e}`);
      }
    }
    console.log(`[mock] fail to load mapmock.json, code ${mapmocks.status}`);
    return [];
  }

  checkMatch(bm: OsuFileBeatmapInfo) {
    let hasMatch = false, match = null;
    for (const mock of this.mocks) {
      if (mock.criterion === bm.metadata.title) {
        hasMatch = true;
        match = mock.values;
        break;
      }
    }


    if (this.DEBUG) {
      console.log(`[mock] 匹配 ${hasMatch}, ${bm.metadata.title} -> ${JSON.stringify(match)}`)
    }

    return {hasMatch, match};
  }

  updateProperties(bm: OsuFileBeatmapInfo) {
    let {hasMatch, match} = this.checkMatch(bm);
    if (hasMatch) {
      bm.mod = match.mod;
      this._replacePropertiesRecursive(bm, match);
      if (this.DEBUG) {
        console.log(`[mock] 替换后谱面信息:`);
        console.log(bm);
      }
    }
    return hasMatch;
  }

  _replacePropertiesRecursive(base:any, updates:any) {
    // 这段是问 Copilot 的
    for (const key in updates) {
      if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
        // If the property doesn't exist in the base object or is not an object, initialize it
        if (typeof base[key] !== 'object' || base[key] === null || Array.isArray(base[key])) {
          base[key] = {};
        }
        // Recursively update properties
        this._replacePropertiesRecursive(base[key], updates[key]);
      } else {
        // Update the property in base if it exists in updates
        if (base.hasOwnProperty(key)) {
          base[key] = updates[key];
        }
      }
    }
  }

}

export default MapMockManager;
