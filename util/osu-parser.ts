// @ts-ignore
import {calculate_sr} from '../lib/rosu-pp/rosu-pp.js';

import {
  type OsuFileBeatmapBackground,
  type OsuFileBeatmapBPM,
  type OsuFileBeatmapInfo,
  type ParsedContent
} from "./types/parsed-osu-file-models.ts";

class OsuParser {
  constructor() {
    this.wasmReady = true;
  }

  DEBUG_LOG = false;
  wasmReady = false;

  async getBidToHrefMap(bidDifficultyMap: Map<number, Array<{
    sid: number,
    difficulty: string
  }>>): Promise<Map<number, string>> {
    const baseDomain = window.location.origin;
    const songsPageUrl = `${baseDomain}/Songs/`;

    // 获取 /Songs/ 页面内容
    let response = await fetch(songsPageUrl);
    let text = await response.text();

    // 创建临时 div 来解析 HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");

    // 提取所有歌曲链接
    const songLinks = Array.from(doc.querySelectorAll("#overlays-list a")).map(
      (a) => ({
        sid: parseInt(a.textContent?.trim()?.split(" ")[0] ?? "0"), // 提取 sid
        href: a.getAttribute("href"),
      })
    );

    const resultMap = new Map<number, string>();

    // 遍历输入的 bid 到 {sid, difficulty} 映射
    for (const [bid, entries] of bidDifficultyMap.entries()) {
      for (const entry of entries) {
        const {sid, difficulty} = entry;

        // 查找对应的歌曲链接
        const matchedLink = songLinks.find((link) => link.sid === sid);
        if (!matchedLink) continue;

        // 请求子页面
        const subPageUrl = `${baseDomain}${matchedLink.href}`;
        const subResponse = await fetch(subPageUrl);
        const subText = await subResponse.text();
        const subDoc = parser.parseFromString(subText, "text/html");

        // 在子页面中查找与难度匹配的 <a> 标签
        const difficultyLinks = Array.from(subDoc.querySelectorAll("a")).find(
          (a) => a.textContent?.includes(difficulty)
        );

        if (difficultyLinks) {
          resultMap.set(bid, `${baseDomain}${difficultyLinks.getAttribute("href")}`);
        } else {
          // 遍历每个 <a> 标签对应的.osu文件，访问osu文件确定bid
          for (const a of subDoc.querySelectorAll("a")) {
            const fileName = a.getAttribute("href")?.split("/").pop();
            if (fileName?.endsWith(".osu")) {
              const osuText = await fetch(a.getAttribute("href") ?? "").then(res => res.text());
              const parsed = this.parseFile(osuText)
              const beatmap = this.toBeatmap(parsed);
              if (beatmap.metadata.bid === bid) {
                resultMap.set(bid, `${baseDomain}${a.getAttribute("href")}`);
                break;
              }
            }
          }

        }
      }
    }

    return resultMap;
  };
  private static modEnum: { [key: string]: number } = {
    'NM': 0,
    'HD': 8,
    'HR': 16,
    'DT': 64,
    'FM': 0,
    'TB': 0,
    'RC': 0,
    'HB': 0,
    'LN': 0,
    'SV': 0,
  };

  public static getModEnumFromModString(mod: string | undefined): number {
    return OsuParser.modEnum[mod?.toUpperCase() || 'NM'] || 0;
  }

  async parse(addr: string, mods: number = 0): Promise<OsuFileBeatmapInfo | undefined> {
    if (!this.wasmReady) return;

    let res = await fetch(addr);
    let text = await res.text();
    let parsed = await this.read(text, mods);
    return parsed;
  };

  round(num: number, d: number): number {
    const mul = Number(num) * Math.pow(10, d);
    return Math.round(mul) / Math.pow(10, d);
  };

  escape(str: string): string {
    str = encodeURIComponent(str.replace(/\\/g, '/'))
      .replace(/-/g, '%2D')
      .replace(/_/g, '%5F')
      .replace(/\./g, '%2E')
      .replace(/!/g, '%21')
      .replace(/~/g, '%7E')
      .replace(/\'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
    return str;
  };

  timeModifier(mods: number): number {
    let timeModifier = 1;
    if (Number(mods) & 64) timeModifier = 1.5;
    if (Number(mods) & 256) timeModifier = 0.75;
    return timeModifier;
  };

  getModdedTime(time: number, mods: number): number {
    return Number(time) / this.timeModifier(mods);
  };

  odToWindow(mode: number, od: number): number {
    od = Number(od);
    let window300 = -1;
    switch (Number(mode)) {
      case 0:
        window300 = 80 - 6 * od;
        break;
      case 1:
        window300 = 50 - 3 * od;
        break;
      case 3:
        window300 = 64 - 3 * od;
        break;
      default:
        break;
    }
    return window300;
  };

  windowToOd(mode: number, window: number): number {
    window = Number(window);
    let od = -1;
    switch (Number(mode)) {
      case 0:
        od = (80 - window) / 6;
        break;
      case 1:
        od = (50 - window) / 3
        break;
      case 3:
        od = (64 - window) / 3;
        break;
      default:
        break;
    }
    return od;
  };

  calcModdedOd(mods: number, mode: number, od: number): number {
    //https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
    od = Number(od);
    mods = Number(mods);
    if (mode == 2) return -1; //in CTB, OD is not used and doesn't have a formula in osu! wiki, so TODO here.

    //calculate the effect of HR/EZ
    if (mods & 16) od = od * 1.4;
    if (mods & 2) od = od / 2;
    if (od > 10) od = 10;

    //calculate the effect of DT/HT
    let window300 = this.odToWindow(mode, od);
    let timeModifier = this.timeModifier(mods);
    window300 = window300 / timeModifier;
    let newod = this.windowToOd(mode, window300);

    return this.round(newod, 2)
  };

  calcModdedAr(mods: number, mode: number, ar: number): number {
    //https://osu.ppy.sh/wiki/en/Beatmap/Approach_rate
    ar = Number(ar);
    mods = Number(mods);
    if (mode == 1 || mode == 3) return -1; //AR only presents in STD and CTB

    //calculate the effect of HR/EZ
    if (mods & 16) ar = ar * 1.4;
    if (mods & 2) ar = ar / 2;
    if (ar > 10) ar = 10;

    //calculate the effect of DT/HT
    let preempt = -1;
    if (ar <= 5) {
      preempt = 1800 - 120 * ar;
    } else {
      preempt = 1950 - 150 * ar;
    }
    let timeModifier = this.timeModifier(mods);
    preempt = preempt / timeModifier;
    let newar = -1;
    if (preempt >= 1200) {
      newar = (1800 - preempt) / 120;
    } else {
      newar = (1950 - preempt) / 150;
    }

    return this.round(newar, 2);
  };

  calcModdedCs(mods: number, mode: number, cs: number): number {
    //https://osu.ppy.sh/wiki/en/Beatmap/Circle_Size
    cs = Number(cs);
    mods = Number(mods);

    //calculate the effect of HR/EZ
    if (mods & 16) cs = cs * 1.3;
    if (mods & 2) cs = cs / 2;
    if (cs > 10) cs = 10;

    return this.round(cs, 2);
  };

  calcModdedHp(mods: number, mode: number, hp: number): number {
    //https://osu.ppy.sh/wiki/en/Beatmap/HP_Drain_Rate
    hp = Number(hp);
    mods = Number(mods);

    //calculate the effect of HR/EZ
    if (mods & 16) hp = hp * 1.4;
    if (mods & 2) hp = hp / 2;
    if (hp > 10) hp = 10;

    return this.round(hp, 2);
  };

  deepCopy(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
  }


  state = -1;
  states = [
    'general',
    'editor',
    'metadata',
    'difficulty',
    'events',
    'timingpoints',
    'colours',
    'hitobjects',
  ];
  keyValReg = /^([a-zA-Z0-9]+)[ ]*:[ ]*(.+)$/;
  sectionReg = /^\[([0-9A-Za-z]+)\]$/;

  toBeatmap(content: ParsedContent): OsuFileBeatmapInfo {
    let bm: OsuFileBeatmapInfo = {
      difficulty: {
        ar: Number(content.ApproachRate) || -1,
        od: Number(content.OverallDifficulty) || -1,
        cs: Number(content.CircleSize) || -1,
        hp: Number(content.HPDrainRate) || -1,
        sr: this.getSR(content.original ?? "", 0),
      },
      metadata: {
        title: content.Title || '',
        titleUnicode: content.TitleUnicode || '',
        artist: content.Artist || '',
        artistUnicode: content.ArtistUnicode || '',
        source: content.Source || '',
        tags: content.Tags || '',
        bid: Number(content.BeatmapID) || -1,
        sid: Number(content.BeatmapSetID) || -1,
        diff: content.Version || '',
        creator: content.Creator || '',
      },
      beatmap: {
        mode: content.Mode || '',
        bpm: this.getBPM(content.timings ?? [], Number(content.objs?.[0]?.[2] ?? 0), Number(content.objs?.[content.objs.length - 1]?.[2] ?? 0)) || {
          min: -1,
          max: -1,
          mostly: -1
        },
        length: this.getTotalTime(content) || -1,
        drain: this.getDrainTime(content) || -1,
        mods: 0,
        bg: this.getBGPath(content) || {path: '', xoffset: 0, yoffset: 0},
      },
      original: content.original ?? "",
      index: -1,
      mod: 'Unknown',
    }

    if (this.DEBUG_LOG)
      console.log(`[osuFileParser] Parsed Beamap:\n${JSON.stringify(bm)}`);

    return bm;
  };

  getModded(bm: OsuFileBeatmapInfo, mods: number = 0): OsuFileBeatmapInfo {
    let modded: OsuFileBeatmapInfo = {
      difficulty: {
        ar: this.calcModdedAr(mods, 0, bm.difficulty.ar),
        od: this.calcModdedOd(mods, 0, bm.difficulty.od),
        cs: this.calcModdedCs(mods, 0, bm.difficulty.cs),
        hp: this.calcModdedHp(mods, 0, bm.difficulty.hp),
        sr: this.getSR(bm.original ?? "", mods),
      },
      metadata: bm.metadata,
      beatmap: {
        length: this.getModdedTime(bm.beatmap.length, mods),
        drain: this.getModdedTime(bm.beatmap.drain, mods),
        mods: mods,
        bpm: {
          min: (bm.beatmap.bpm?.min ?? 0) * this.timeModifier(mods),
          max: (bm.beatmap.bpm?.max ?? 0) * this.timeModifier(mods),
          mostly: (bm.beatmap.bpm?.mostly ?? 0) * this.timeModifier(mods),
        },
        bg: bm.beatmap.bg ?? {path: '', xoffset: 0, yoffset: 0},
        mode: bm.beatmap.mode ?? '',
      },
      original: bm.original ?? "",
      index: bm.index,
      mod: bm.mod,
    }

    if (this.DEBUG_LOG)
      console.log(`[osuFileParser] Beatmap with mod ${mods}:\n${JSON.stringify(modded)}`);

    return modded;
  }

  parseFile(content: string): ParsedContent {
    let tmp: any = {
      timings: [],
      objs: [],
      events: [],
      colors: {},
      original: JSON.parse(JSON.stringify(content)),
    };
    content = content || '';

    const contentArray = content.split(/\r?\n/);

    contentArray.forEach((line) => {
      if (line?.substring(0, 2) === '//' || !line) {
        // 跳过注释行和空行
        return;
      }
      else this.readLine(line, tmp);
    }, this);

    Object.keys(tmp.colors ?? {}).map(
      (i) => (tmp.colors[i] = tmp.colors?.[i]?.split(',') ?? [])
    );
    if (tmp.Bookmarks) tmp.Bookmarks = tmp.Bookmarks.split(',');

    return tmp;
  };

  readLine(line: string, tmp: any): void {
    line = line || '';
    if (line.match(/osu file format v[0-9]+/)) return;

    let sectionMatch = line.match(this.sectionReg);
    if (sectionMatch) {
      this.updateState(sectionMatch[1]);
    } else {
      switch (this.state) {
        case 0:
        case 1:
        case 2:
        case 3:
          // General, Editor, Metadata, Difficulty. These are all key-value pairs
          let keyValPair = line.match(this.keyValReg);
          if (keyValPair) {
            tmp[keyValPair[1]] = keyValPair[2];
          }
          break;
        case 4:
          // Events
          let val = line.trim().split(',');
          if (val) tmp.events.push(val);
          break;
        case 5:
          // TimingPoints
          let timing = line.trim().split(',');
          if (timing) tmp.timings.push(timing);
          break;
        case 6:
          // Colours
          let color = line.match(this.keyValReg);
          if (color) {
            tmp.colors[color[1]] = color[2];
          }
          break;
        case 7:
          // HitObjects
          let hit = line.trim().split(',');
          if (hit) tmp.objs.push(hit);
          break;
      }
    }
  };

  updateState(section: string): void {
    this.state = this.states.indexOf(section.toLowerCase());
  };

  getBPM(timings: string[][], begin: number, end: number): OsuFileBeatmapBPM {
    let bpm: OsuFileBeatmapBPM = {
      min: 2e9,
      max: -1,
      mostly: -1,
    };

    let bpmList: { [key: string]: number } = {},
      lastBegin = 0, lastBPM = -1;

    for (let i of timings) {
      if ((i?.[1] ?? 0) > '0') {
        if (lastBPM && lastBPM > 0) {
          if (!bpmList[lastBPM]) bpmList[lastBPM] = 0;
          bpmList[lastBPM] += Number(i[0]) - lastBegin;
        }
        let currentBPM = lastBPM = this.round(60000 / Number(i?.[1] ?? 1), 2);
        if (currentBPM < bpm.min) bpm.min = currentBPM;
        if (currentBPM > bpm.max) bpm.max = currentBPM;
        lastBegin = Number(i[0]);
      }
    }
    if (lastBPM && lastBPM > 0) {
      if (!bpmList[lastBPM]) bpmList[lastBPM] = 0;
      bpmList[lastBPM] += end - lastBegin;
    }
    if (bpm.min == 2e9) bpm.min = -1;
    if (bpm.max === bpm.min) {
      bpm.mostly = bpm.max;
    } else {
      if (this.DEBUG_LOG) {
        console.log(`bpm list: ${JSON.stringify(bpmList)}`);
      }
      bpm.mostly = Number(Object.keys(bpmList).reduce((a, b) => bpmList[a] > bpmList[b] ? a : b));
    }
    return bpm;
  };

  lastObjectIsSpinner(content: ParsedContent): boolean {
    const lastObjType = content.objs?.[content.objs.length - 1]?.[3];
    const typeNumber = Number(lastObjType ?? 0);
    return (typeNumber & 8) === 8;
  }

  getTotalTime(content: ParsedContent): number {
    // If the last hit object is a spinner, its length will be included in in-game length but not length displayed on osu! website.
    // If it's a slider, its length won't be included at both places.
    // I decide it's better to be coherent with in-game length.
    let first = Number(content.timings?.[0]?.[0] ?? 0) || 0,
      last = this.lastObjectIsSpinner(content) ? Number(content.objs?.[content.objs.length - 1]?.[5] ?? 0) : Number(content.objs?.[content.objs.length - 1]?.[2] ?? 0);
    if (this.DEBUG_LOG) console.log(`[osuFileParser] Timing point begin at ${first}, hit objects end at ${last}, isSpinner=${this.lastObjectIsSpinner(content)}, total time ${last}`);
    return last;
  };

  getDrainTime(content: ParsedContent): number {
    let breakLength = 0;
    for (let line of content.events ?? []) {
      if (line?.[0] == '2' || line?.[0]?.toLowerCase() == 'break') {
        breakLength += Number(line?.[2] ?? 0) - Number(line?.[1] ?? 0);
      }
    }
    // For drain time, the begin time of the last hit object is used regardless of its type.
    // Due to the inconsistency explained above, drain time becomes a little complicated.
    let spinnerLengthIfLastObjectIsSpinner = this.lastObjectIsSpinner(content) ? Number(content.objs?.[content.objs.length - 1]?.[5] ?? 0) - Number(content.objs?.[content.objs.length - 1]?.[2] ?? 0) : 0;

    if (this.DEBUG_LOG) console.log(`[osuFileParser] total break time length: ${breakLength}, last spinner length: ${spinnerLengthIfLastObjectIsSpinner}`);

    return this.getTotalTime(content) - breakLength - Number(content.objs?.[0]?.[2] ?? 0) - spinnerLengthIfLastObjectIsSpinner;
  };

  getBGPath(content: ParsedContent): OsuFileBeatmapBackground {
    let bg: OsuFileBeatmapBackground = {
      path: '',
      xoffset: 0,
      yoffset: 0,
    }
    const regBG = /^0,0,\"?([^,\"]+)\"?(\,(\d+)\,(\d+))?$/;
    for (let line of content.events ?? []) {
      if (line?.[0] === '0' && line?.[1] === '0') {
        bg.path = line?.[2]?.match(/^\"(.+)\"$/)?.[1] ?? '';
        bg.xoffset = Number(line?.[3]) || 0;
        bg.yoffset = Number(line?.[4]) || 0;
      }
    }
    return bg;
  };

  getSR(content: string, mods: number = 0): number {
    if (!this.wasmReady) return -1;
    if (mods < 0) mods = 0; // Default to nomod
    let text = content.trim();
    let u8arr = new TextEncoder().encode(text);
    let sr = calculate_sr(u8arr, mods);
    return sr;
  };

  async read(fileContent: string, mods: number = 0): Promise<OsuFileBeatmapInfo> {
    return this.toBeatmap(this.parseFile(fileContent));
  };
};

export default OsuParser;
