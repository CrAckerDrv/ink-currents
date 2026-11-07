const g = globalThis;
require('../js/noise.js');
const a = g.Noise.create(1337), b = g.Noise.create(42);
console.log('1337 ->', a.n2(1.5, -2.5));
console.log('42   ->', b.n2(1.5, -2.5));
let same = 0, diff = 0;
for (let i = 0; i < 2000; i++) {
  const x = i * 0.37 - 13, y = i * 0.71 + 5;
  if (a.n2(x, y) === b.n2(x, y)) same++; else diff++;
}
console.log('same=' + same + ' diff=' + diff);

