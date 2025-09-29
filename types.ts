export interface Stamp {
  x: number;
  y: number;
  width: number;
  height: number;
  isPlaced: boolean;
}

export type StampState = Record<number, Stamp>;
