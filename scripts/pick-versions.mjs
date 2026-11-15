// Pinning rule (docs/05): latest stable version published >= 14 days ago.
// Usage: node scripts/pick-versions.mjs pkg1 pkg2 ...  -> prints "pkg@version date"
import { execFileSync } from 'node:child_process';
const cutoff = Date.now() - 14 * 864e5;
const stable = /^\d+\.\d+\.\d+$/;
for (const arg of process.argv.slice(2)) {
  // optional prefix filter: pkg@6.0 -> only versions starting with 6.0.
  const at = arg.lastIndexOf('@');
  const [pkg, pre] = at > 0 ? [arg.slice(0, at), arg.slice(at + 1) + '.'] : [arg, ''];
  try {
    const time = JSON.parse(
      execFileSync('npm', ['view', pkg, 'time', '--json'], { encoding: 'utf8' }),
    );
    const ok = Object.entries(time).filter(
      ([v, t]) => stable.test(v) && v.startsWith(pre) && Date.parse(t) <= cutoff,
    );
    // highest semver among eligible
    ok.sort(([a], [b]) => {
      const x = a.split('.').map(Number),
        y = b.split('.').map(Number);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
    const [v, t] = ok.at(-1) ?? ['NONE', ''];
    console.log(`${pkg}@${v} ${t.slice(0, 10)}`);
  } catch (e) {
    console.log(`${pkg}@ERROR ${e.message.split('\n')[0]}`);
  }
}
