const hex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

console.log(`JWT_SECRET=${hex(crypto.getRandomValues(new Uint8Array(32)))}`);
console.log(`JWT_REFRESH_SECRET=${hex(crypto.getRandomValues(new Uint8Array(32)))}`);
