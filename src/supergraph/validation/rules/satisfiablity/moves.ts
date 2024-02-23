import type { Fields } from './fields';

export interface Move {
  toString(): string;
}

export class FieldMove implements Move {
  constructor(
    public typeName: string,
    public fieldName: string,
    public requires: Fields | null = null,
    public provides: Fields | null = null,
    public provided: boolean = false,
  ) {}

  toString() {
    let str = this.fieldName;

    if (this.requires) {
      str += ` @require(${this.requires})`;
    }

    if (this.provides) {
      str += ` @provides(${this.provides})`;
    }

    if (this.provided) {
      str += ' @provided';
    }

    return str;
  }
}

export class AbstractMove implements Move {
  toString() {
    return `🔮`;
  }
}

export class EntityMove implements Move {
  constructor(public keyFields: Fields) {}

  toString() {
    return `🔑 ${this.keyFields}`;
  }
}
