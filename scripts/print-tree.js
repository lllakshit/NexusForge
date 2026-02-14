const { execSync } = require("node:child_process");

const files = execSync(
  "rg --files -uu -g !**/node_modules/** -g !**/dist/** -g !**/.git/** -g !**/*.tsbuildinfo -g !**/__pycache__/**",
  { encoding: "utf8" }
)
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => line.replace(/\\/g, "/"))
  .sort();

const root = { dirs: new Map(), files: [] };

for (const filePath of files) {
  const parts = filePath.split("/");
  let cursor = root;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (i === parts.length - 1) {
      cursor.files.push(part);
    } else {
      if (!cursor.dirs.has(part)) {
        cursor.dirs.set(part, { dirs: new Map(), files: [] });
      }
      cursor = cursor.dirs.get(part);
    }
  }
}

const printNode = (node, prefix) => {
  const dirNames = Array.from(node.dirs.keys()).sort();
  const fileNames = node.files.sort();
  const entries = [
    ...dirNames.map((name) => ({ type: "dir", name })),
    ...fileNames.map((name) => ({ type: "file", name }))
  ];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const branch = isLast ? "└── " : "├── ";
    console.log(`${prefix}${branch}${entry.name}`);
    if (entry.type === "dir") {
      printNode(node.dirs.get(entry.name), `${prefix}${isLast ? "    " : "│   "}`);
    }
  });
};

console.log("NexusForge");
printNode(root, "");
