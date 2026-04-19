// structural-invariants hook 測試 (xd-y4zq Bundle A)
//
// 涵蓋：框架載入、extractImports、extractExports、checkInvariant 兩條、
// runInvariants 整合、R119 類 import 消失偵測、skip override。

import { describe, it, expect, beforeEach } from "bun:test";
import {
	loadInvariantsConfig,
	extractImports,
	extractExports,
	extractImportIdentifiers,
	checkInvariant,
	runInvariants,
	_resetCache,
} from "../../../../.claude/hooks/modules/structural-invariants.js";

beforeEach(() => {
	_resetCache();
	delete process.env.NOVA_SKIP_INVARIANTS;
});

describe("structural-invariants framework", () => {
	it("loadInvariantsConfig 讀到 SoT 的 2 條預設 invariants", () => {
		const cfg = loadInvariantsConfig();
		expect(cfg.invariants).toBeTruthy();
		const names = cfg.invariants.map((i) => i.name);
		expect(names).toContain("preserveImports");
		expect(names).toContain("preserveExports");
	});

	it("extractImports 抓 ES import + CommonJS require", () => {
		const code = `import * as THREE from 'three';
import { x } from './y';
import 'side-effect';
const fs = require('node:fs');
const noise = 'not an import';`;
		const imports = extractImports(code);
		expect(imports.length).toBe(4);
		expect(imports[0]).toContain("THREE");
	});

	it("extractExports 抓 top-level export + export default + export {}", () => {
		const code = `export const A = 1;
export function foo() {}
export class Bar {}
export default 42;
export { x, y as z };
const notExported = true;`;
		const exports = extractExports(code);
		expect(exports).toContain("A");
		expect(exports).toContain("foo");
		expect(exports).toContain("Bar");
		expect(exports).toContain("default");
		expect(exports).toContain("x");
		expect(exports).toContain("z");
		expect(exports).not.toContain("notExported");
	});
});

describe("preserveImports invariant", () => {
	const invariant = { name: "preserveImports", severity: "error" };

	it("import 保留 → ok", () => {
		const old = `import * as THREE from 'three';\nconst cam = new THREE.Camera();`;
		const next = `import * as THREE from 'three';\nconst cam = new THREE.PerspectiveCamera();`;
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});

	it("R119 類 import 消失 → 違規", () => {
		const old = `import * as THREE from 'three';
const cameraState = { x: 0, y: 0, z: 0 };
export function createCamera() {
  return new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
}`;
		const next = `const cameraState = { x: 0, y: 0, z: 0 };
export function createCamera() {
  return { fov: 75 };
}`;
		const r = checkInvariant(invariant, old, next);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("preserveImports");
		expect(r.reason).toContain("THREE");
	});

	it("新增 import 不違規", () => {
		const old = `import { a } from './a';`;
		const next = `import { a } from './a';\nimport { b } from './b';`;
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});
});

describe("preserveExports invariant", () => {
	const invariant = { name: "preserveExports", severity: "error" };

	it("export 保留 → ok", () => {
		const old = `export const A = 1;\nexport const B = 2;`;
		const next = `export const A = 10;\nexport const B = 20;`;
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});

	it("公開 export 被刪除 → 違規", () => {
		const old = `export const X = 1;\nexport const Y = 2;`;
		const next = `export const X = 1;\n// Y removed`;
		const r = checkInvariant(invariant, old, next);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("Y");
	});

	it("新增 export 不違規", () => {
		const old = `export const A = 1;`;
		const next = `export const A = 1;\nexport const B = 2;`;
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});
});

describe("runInvariants 整合 + skip override", () => {
	it("兩條都跑 → 違規列表匯總", () => {
		const old = `import { a } from './a';\nexport const X = 1;`;
		const next = `// everything removed`;
		const violations = runInvariants(old, next);
		expect(violations.length).toBe(2);
		const names = violations.map((v) => v.name);
		expect(names).toContain("preserveImports");
		expect(names).toContain("preserveExports");
	});

	it("NOVA_SKIP_INVARIANTS env 跳過指定 invariant", () => {
		process.env.NOVA_SKIP_INVARIANTS = "preserveImports,preserveExports";
		_resetCache();
		const old = `import { a } from './a';\nexport const X = 1;`;
		const next = `// everything removed`;
		const violations = runInvariants(old, next);
		expect(violations.length).toBe(0);
	});

	it("opts.skip 參數 override（優先於 env）", () => {
		const old = `import { a } from './a';`;
		const next = `// removed`;
		const violations = runInvariants(old, next, { skip: ["preserveImports"] });
		expect(violations.length).toBe(0);
	});
});

// ─── semantic-aware diff baseline（iter 19 backlog 治本）───
describe("extractImportIdentifiers — identifier 級 semantic diff", () => {
	it("default + named + namespace + side-effect + require 全支援", () => {
		const code = `import A from 'a';
import { b, c as cc } from 'b';
import * as Ns from 'ns';
import 'side-effect';
const fs = require('node:fs');
const { x, y } = require('z');`;
		const ids = extractImportIdentifiers(code);
		expect(ids.has("A")).toBe(true);
		expect(ids.has("b")).toBe(true);
		expect(ids.has("cc")).toBe(true);
		expect(ids.has("Ns")).toBe(true);
		expect(ids.has("(side:side-effect)")).toBe(true);
		expect(ids.has("fs")).toBe(true);
		expect(ids.has("x")).toBe(true);
		expect(ids.has("y")).toBe(true);
	});
});

describe("preserveImports semantic-aware（iter 19 誤判根因）", () => {
	const invariant = { name: "preserveImports", severity: "error" };

	it("`import A from 'x'` → `import { A, B } from 'x'` 不誤判（A 保留 + B 新增）", () => {
		const old = `import A from 'x';`;
		const next = `import { A, B } from 'x';`;
		// 註：A 從 default 變成 named 在 identifier set 中都是「A」，保留算 ok
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});

	it("`import { A, B } from 'x'` → `import { A } from 'x'` 觸發（B 丟失）", () => {
		const old = `import { A, B } from 'x';`;
		const next = `import { A } from 'x';`;
		const r = checkInvariant(invariant, old, next);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("B");
	});

	it("`const X = require('y')` → `const { X, Y } = require('y')` 不誤判", () => {
		const old = `const X = require('y');`;
		const next = `const { X, Y } = require('y');`;
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});

	it("rename as → 舊別名消失觸發（語義確實丟失）", () => {
		const old = `import { a as A } from 'x';`;
		const next = `import { a as B } from 'x';`;
		const r = checkInvariant(invariant, old, next);
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("A");
	});

	it("import 順序改變不誤判", () => {
		const old = `import { a, b } from 'x';`;
		const next = `import { b, a } from 'x';`;
		expect(checkInvariant(invariant, old, next).ok).toBe(true);
	});
});
