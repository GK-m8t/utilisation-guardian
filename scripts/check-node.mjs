// Runs before every `next build` (package.json "prebuild"): the build fails on a Node older than MIN_NODE, so an
// unpatched toolchain never ships (Node's 21 Oct 2026 security releases: CVE-2026-111497 and others).
const MIN_NODE = "24.22.1";
const parts = (v) => v.split(".").map(Number);
const older = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};
if (older(process.versions.node, MIN_NODE)) {
  console.error(`\n✖ Node ${process.versions.node} is older than ${MIN_NODE}, which carries the 21 Oct 2026 security fixes.\n`);
  process.exit(1);
}
console.log(`check-node: Node ${process.versions.node} (at least ${MIN_NODE})`);
