export class BracketBeatmapInfo {
    OnlineID: number;
    DifficultyName: string;
    BPM: number;
    Length: number;
    StarRating: number;
    EndTimeObjectCount: number;
    TotalObjectCount: number;
    Metadata: {
        Title: string;
        title_unicode: string;
        Artist: string;
        artist_unicode: string;
        Author: {
            OnlineID: number;
            Username: string;
            CountryString: string;
        };
        Source: string;
        tags: string;
        PreviewTime: number;
        AudioFile: string;
        BackgroundFile: string;
    };
    Difficulty: {
        DrainRate: number;
        CircleSize: number;
        OverallDifficulty: number;
        ApproachRate: number;
        SliderMultiplier: number;
        SliderTickRate: number;
    };
    Covers: {
        "cover@2x": string;
        "card@2x": string;
        "list@2x": string;
    };

    constructor(data: any) {
        this.OnlineID = data.OnlineID;
        this.DifficultyName = data.DifficultyName;
        this.BPM = data.BPM;
        this.Length = data.Length;
        this.StarRating = data.StarRating;
        this.EndTimeObjectCount = data.EndTimeObjectCount;
        this.TotalObjectCount = data.TotalObjectCount;
        this.Metadata = data.Metadata;
        this.Difficulty = data.Difficulty;
        this.Covers = data.Covers;
    }
}

export class BracketBeatmap {
    ID: number;
    Mods: string;
    BeatmapInfo: BracketBeatmapInfo;

    constructor(data: any) {
        this.ID = data.ID;
        this.Mods = data.Mods;
        this.BeatmapInfo = new BracketBeatmapInfo(data.BeatmapInfo);
    }
}

class Round {
    Name: string;
    Description: string;
    BestOf: number;
    BanCount: number;
    Beatmaps: BracketBeatmap[];
    StartDate: string;
    Matches: any[];

    constructor(data: any) {
        this.Name = data.Name;
        this.Description = data.Description;
        this.BestOf = data.BestOf;
        this.BanCount = data.BanCount;
        this.Beatmaps = data.Beatmaps.map((bm: any) => new BracketBeatmap(bm));
        this.StartDate = data.StartDate;
        this.Matches = data.Matches;
    }
}

class Team {
    FullName: string;
    FlagName: string;
    Acronym: string;
    SeedingResults: any[];
    Seed: string;
    LastYearPlacing: number;
    Players: any[];

    constructor(data: any) {
        this.FullName = data.FullName;
        this.FlagName = data.FlagName;
        this.Acronym = data.Acronym;
        this.SeedingResults = data.SeedingResults;
        this.Seed = data.Seed;
        this.LastYearPlacing = data.LastYearPlacing;
        this.Players = data.Players;
    }
}

class Ruleset {
    ShortName: string;
    Name: string;
    InstantiationInfo: string;
    LastAppliedDifficultyVersion: number;
    Available: boolean;

    constructor(data: any) {
        this.ShortName = data.ShortName;
        this.Name = data.Name;
        this.InstantiationInfo = data.InstantiationInfo;
        this.LastAppliedDifficultyVersion = data.LastAppliedDifficultyVersion;
        this.Available = data.Available;
    }
}

export class BracketData {
    Ruleset: Ruleset;
    Matches: any[];
    Rounds: Round[];
    Teams: Team[];
    Progressions: any[];
    ChromaKeyWidth: number;
    PlayersPerTeam: number;
    AutoProgressScreens: boolean;
    SplitMapPoolByMods: boolean;
    DisplayTeamSeeds: boolean;

    constructor(data: any) {
        this.Ruleset = new Ruleset(data.Ruleset);
        this.Matches = data.Matches;
        this.Rounds = data.Rounds.map((r: any) => new Round(r));
        this.Teams = data.Teams.map((t: any) => new Team(t));
        this.Progressions = data.Progressions;
        this.ChromaKeyWidth = data.ChromaKeyWidth;
        this.PlayersPerTeam = data.PlayersPerTeam;
        this.AutoProgressScreens = data.AutoProgressScreens;
        this.SplitMapPoolByMods = data.SplitMapPoolByMods;
        this.DisplayTeamSeeds = data.DisplayTeamSeeds;
    }
}


