declare module 'npy-js' {
  export function readNpy(buffer: ArrayBuffer): {
    data: Uint8Array | Float32Array | Float64Array;
    shape: number[];
    dtype: string;
  };
} 