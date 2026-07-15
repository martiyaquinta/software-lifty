import * as Crypto from 'expo-crypto';

if (!(globalThis as any).crypto?.subtle?.digest) {
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = {};
  }
  (globalThis as any).crypto.subtle = {
    digest: async (_algorithm: string, data: Uint8Array): Promise<ArrayBuffer> => {
      const input = Array.from(data, (b) => String.fromCharCode(b)).join('');
      const hexHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
      const bytes = new Uint8Array(hexHash.length / 2);
      for (let i = 0; i < hexHash.length; i += 2) {
        bytes[i / 2] = Number.parseInt(hexHash.substring(i, i + 2), 16);
      }
      return bytes.buffer;
    },
  };
}
