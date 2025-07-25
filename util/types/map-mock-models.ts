export class MapMockValue {
    mod: string;
    index: string;

    constructor(data: any) {
        this.mod = data.mod;
        this.index = data.index;
    }
}

export class MapMock {
    criterion: string;
    values: MapMockValue;

    constructor(data: any) {
        this.criterion = data.criterion;
        this.values = new MapMockValue(data.values);
    }
}

export class MapMockData extends Array<MapMock> {
    constructor(data: any[]) {
        super();
        data.forEach(item => {
            this.push(new MapMock(item));
        });
        return this;
    }
}