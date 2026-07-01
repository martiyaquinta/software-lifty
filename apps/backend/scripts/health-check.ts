const port = process.env.PORT || 3000;
const res = await fetch(`http://localhost:${port}/health`);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
process.exit(res.ok ? 0 : 1);

export {};
