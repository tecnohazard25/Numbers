import { describe, it, expect } from "vitest";

// Test the tree building and leaf detection logic from account-picker
// We re-implement the pure functions here since the component mixes UI and logic

interface AccountNode {
  id: string;
  full_code: string;
  name: string;
  parent_id: string | null;
  sign?: "positive" | "negative";
  is_total?: boolean;
}

interface TreeNode extends AccountNode {
  children: TreeNode[];
  isLeaf: boolean;
}

function buildTree(nodes: AccountNode[]): TreeNode[] {
  const filtered = nodes.filter((n) => !n.is_total);
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const n of filtered) {
    map.set(n.id, { ...n, children: [], isLeaf: true });
  }
  for (const n of filtered) {
    const treeNode = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      const parent = map.get(n.parent_id)!;
      parent.children.push(treeNode);
      parent.isLeaf = false;
    } else {
      roots.push(treeNode);
    }
  }
  return roots;
}

interface FlatItem {
  node: TreeNode;
  depth: number;
  isLeaf: boolean;
}

function flattenTree(roots: TreeNode[], depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of roots) {
    result.push({ node, depth, isLeaf: node.isLeaf });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

describe("AccountPicker - buildTree", () => {
  it("builds tree from flat nodes", () => {
    const nodes: AccountNode[] = [
      { id: "1", full_code: "A", name: "Ricavi", parent_id: null, sign: "positive" },
      { id: "2", full_code: "A.1", name: "Prestazioni", parent_id: "1", sign: "positive" },
      { id: "3", full_code: "A.2", name: "Vendite", parent_id: "1", sign: "positive" },
    ];
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("1");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].isLeaf).toBe(false);
    expect(tree[0].children[0].isLeaf).toBe(true);
  });

  it("excludes is_total nodes", () => {
    const nodes: AccountNode[] = [
      { id: "1", full_code: "A", name: "Ricavi", parent_id: null, sign: "positive" },
      { id: "2", full_code: "A.1", name: "Prestazioni", parent_id: "1", sign: "positive" },
      { id: "3", full_code: "TOT", name: "Totale", parent_id: null, is_total: true },
    ];
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("1");
  });

  it("handles orphaned nodes as roots", () => {
    const nodes: AccountNode[] = [
      { id: "1", full_code: "A", name: "Ricavi", parent_id: null },
      { id: "2", full_code: "B", name: "Costi", parent_id: "999" }, // parent doesn't exist
    ];
    const tree = buildTree(nodes);
    expect(tree).toHaveLength(2); // both are roots
  });

  it("returns empty array for empty input", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("AccountPicker - flattenTree", () => {
  it("flattens tree with correct depth", () => {
    const nodes: AccountNode[] = [
      { id: "1", full_code: "A", name: "Ricavi", parent_id: null },
      { id: "2", full_code: "A.1", name: "Sub", parent_id: "1" },
      { id: "3", full_code: "A.1.1", name: "Leaf", parent_id: "2" },
    ];
    const tree = buildTree(nodes);
    const flat = flattenTree(tree);
    expect(flat).toHaveLength(3);
    expect(flat[0].depth).toBe(0);
    expect(flat[1].depth).toBe(1);
    expect(flat[2].depth).toBe(2);
    expect(flat[2].isLeaf).toBe(true);
    expect(flat[0].isLeaf).toBe(false);
  });
});
