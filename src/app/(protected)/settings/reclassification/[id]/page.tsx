"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NodeTree } from "@/components/settings/reclassification/node-tree";
import { NodeDetailForm } from "@/components/settings/reclassification/node-detail-form";
import { buildTree } from "@/lib/reclassification-utils";
import {
  updateTemplateAction,
  createNodeAction,
  reorderNodesAction,
  moveNodeAction,
} from "@/app/actions/reclassification";
import type {
  ReclassificationTemplate,
  ReclassificationNode,
  ReclassificationNodeWithChildren,
  ReclassificationNodeSign,
  ReclassificationNodeRef,
} from "@/types/supabase";

export default function TemplateEditorPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [authorized, setAuthorized] = useState(false);
  const [isAccountant, setIsAccountant] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [template, setTemplate] = useState<ReclassificationTemplate | null>(null);
  const [nodes, setNodes] = useState<ReclassificationNode[]>([]);
  const [baseNodes, setBaseNodes] = useState<ReclassificationNode[]>([]);
  const [nodeRefs, setNodeRefs] = useState<ReclassificationNodeRef[]>([]);
  const [tree, setTree] = useState<ReclassificationNodeWithChildren[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Template edit state
  const [editingName, setEditingName] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // New node dialog state
  const [newNodeOpen, setNewNodeOpen] = useState(false);
  const [newNodeParentId, setNewNodeParentId] = useState<string | null>(null);
  const [newNodeCode, setNewNodeCode] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeSign, setNewNodeSign] = useState<ReclassificationNodeSign>("positive");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile sheet for node detail
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Check if mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auth check
  useEffect(() => {
    async function init() {
      const res = await fetch("/api/user-info");
      const data = await res.json();
      const roles: string[] = data.roles ?? [];

      if (
        !roles.includes("accountant") &&
        !roles.includes("user_manager") &&
        !roles.includes("superadmin")
      ) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
      setIsAccountant(roles.includes("accountant"));
      setIsSuperadmin(roles.includes("superadmin"));
      setOrgId(data.profile?.organization_id ?? null);
    }
    init();
  }, [router]);

  // Load template and nodes
  const loadData = useCallback(async () => {
    if (!orgId && !isSuperadmin) return;

    const templateParams = new URLSearchParams();
    if (orgId) templateParams.set("orgId", orgId);
    if (isSuperadmin) templateParams.set("includeSystem", "true");

    const [templatesRes, nodesRes, refsRes] = await Promise.all([
      fetch(`/api/reclassification-templates?${templateParams}`),
      fetch(`/api/reclassification-nodes?templateId=${templateId}`),
      fetch(`/api/reclassification-node-refs?templateId=${templateId}`),
    ]);

    const templatesData = await templatesRes.json();
    const nodesData = await nodesRes.json();
    const refsData = await refsRes.json();
    setNodeRefs(refsData.refs ?? []);

    const tmpl = (templatesData.templates ?? []).find(
      (t: ReclassificationTemplate) => t.id === templateId
    );

    if (!tmpl) {
      router.push("/settings/reclassification");
      return;
    }

    setTemplate(tmpl);
    setTemplateName(tmpl.name);

    const nodeList: ReclassificationNode[] = nodesData.nodes ?? [];
    setNodes(nodeList);

    // If this is NOT the base schema, also fetch nodes from the base schema
    if (!tmpl.is_base && !tmpl.is_template) {
      const baseTemplate = (templatesData.templates ?? []).find(
        (t: ReclassificationTemplate) => t.is_base && !t.is_template
      );
      if (baseTemplate) {
        const baseNodesRes = await fetch(`/api/reclassification-nodes?templateId=${baseTemplate.id}`);
        const baseNodesData = await baseNodesRes.json();
        setBaseNodes(baseNodesData.nodes ?? []);
      } else {
        setBaseNodes([]);
      }
    } else {
      setBaseNodes([]);
    }

    const treeData = buildTree(nodeList);
    setTree(treeData);

    // Expand all nodes by default on first load
    if (expandedIds.size === 0 && nodeList.length > 0) {
      setExpandedIds(new Set(nodeList.map((n) => n.id)));
    }

    setLoading(false);
  }, [orgId, isSuperadmin, templateId, router]);

  useEffect(() => {
    if (orgId || isSuperadmin) loadData();
  }, [orgId, isSuperadmin, loadData]);

  // Handlers
  function handleToggleExpand(nodeId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function handleSelectNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    if (isMobile) setMobileSheetOpen(true);
  }

  async function handleReorder(parentId: string | null, orderedIds: string[]) {
    const result = await reorderNodesAction(orderedIds);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.node.reordered"));
    loadData();
  }

  async function handleMoveNode(nodeId: string, newParentId: string | null) {
    const result = await moveNodeAction(nodeId, newParentId);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(t("reclassification.node.moved"));
    // Expand the new parent so moved node is visible
    if (newParentId) {
      setExpandedIds((prev) => new Set([...prev, newParentId]));
    }
    loadData();
  }

  function handleAddChild(parentId: string | null) {
    setNewNodeParentId(parentId);
    setNewNodeSign("positive");
    setNewNodeCode("");
    setNewNodeName("");
    setNewNodeOpen(true);
  }

  async function handleCreateNode() {
    setIsSubmitting(true);
    const isNonBase = template && !template.is_base && !template.is_template;
    const result = await createNodeAction({
      templateId,
      parentId: newNodeParentId,
      code: newNodeCode,
      name: newNodeName,
      sign: newNodeSign,
      isTotal: isNonBase ? true : undefined,
    });
    setIsSubmitting(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(t("reclassification.node.created"));
    setNewNodeOpen(false);

    // Expand parent so new node is visible
    if (newNodeParentId) {
      setExpandedIds((prev) => new Set([...prev, newNodeParentId!]));
    }

    loadData();

    // Select the new node
    if (result.node) {
      setSelectedNodeId(result.node.id);
    }
  }

  async function handleSaveTemplateName() {
    if (!template || templateName === template.name) {
      setEditingName(false);
      return;
    }
    const result = await updateTemplateAction(template.id, { name: templateName });
    if ("error" in result) {
      toast.error(result.error);
      setTemplateName(template.name);
    } else {
      toast.success(t("reclassification.updated"));
      setTemplate({ ...template, name: templateName });
    }
    setEditingName(false);
  }

  function handleNodeUpdated() {
    loadData();
  }

  function handleNodeDeleted() {
    setSelectedNodeId(null);
    setMobileSheetOpen(false);
    loadData();
  }

  if (!authorized || (!orgId && !isSuperadmin) || loading) return null;
  if (!template) return null;

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  // Superadmin can edit system templates; for others, system templates are read-only
  const isReadOnly = template.is_template && !isSuperadmin;
  const canEdit = (isAccountant || isSuperadmin) && !isReadOnly;
  // Non-base schemas can only have total nodes (no hierarchy)
  const isNonBaseSchema = !template.is_base && !template.is_template;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/settings/reclassification"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileSpreadsheet className="h-5 w-5 shrink-0" />
          {editingName && canEdit ? (
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onBlur={handleSaveTemplateName}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTemplateName();
                if (e.key === "Escape") {
                  setTemplateName(template.name);
                  setEditingName(false);
                }
              }}
              className="text-xl font-bold h-auto py-0 border-none focus-visible:ring-1"
              autoFocus
            />
          ) : (
            <h1
              className={`text-xl font-bold truncate ${
                canEdit ? "cursor-pointer hover:text-muted-foreground" : ""
              }`}
              onClick={() => {
                if (canEdit) setEditingName(true);
              }}
            >
              {template.name}
            </h1>
          )}
        </div>
      </div>

      {/* Split view */}
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left panel — Tree */}
        <div className="w-full md:w-2/5 lg:w-1/3 border rounded-lg overflow-auto p-2">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground text-sm">
              <p>{t("reclassification.noTemplates")}</p>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddChild(null)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t("reclassification.addRootNode")}
                </Button>
              )}
            </div>
          ) : (
            <NodeTree
              tree={tree}
              allNodes={nodes}
              baseNodes={baseNodes}
              nodeRefs={nodeRefs}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onSelectNode={handleSelectNode}
              onToggleExpand={handleToggleExpand}
              onMoveNode={handleMoveNode}
              onReorderSiblings={handleReorder}
              onAddChild={handleAddChild}
              isAccountant={canEdit}
              isNonBaseSchema={isNonBaseSchema}
            />
          )}
        </div>

        {/* Right panel — Node form (desktop only) */}
        {!isMobile && (
          <div className="hidden md:flex flex-1 border rounded-lg overflow-auto p-4">
            {selectedNode ? (
              <div className="w-full">
                <NodeDetailForm
                  node={selectedNode}
                  allNodes={nodes}
                  baseNodes={baseNodes}
                  nodeRefs={nodeRefs}
                  isAccountant={canEdit}
                  onNodeUpdated={handleNodeUpdated}
                  onNodeDeleted={handleNodeDeleted}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full text-muted-foreground text-sm">
                {t("reclassification.selectNode")}
              </div>
            )}
          </div>
        )}

        {/* Mobile sheet for node detail */}
        {isMobile && (
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>
                  {selectedNode?.full_code} — {selectedNode?.name}
                </SheetTitle>
              </SheetHeader>
              <div className="overflow-auto p-4">
                {selectedNode && (
                  <NodeDetailForm
                    node={selectedNode}
                    allNodes={nodes}
                    nodeRefs={nodeRefs}
                    isAccountant={canEdit}
                    onNodeUpdated={handleNodeUpdated}
                    onNodeDeleted={handleNodeDeleted}
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* New Node Dialog */}
      <Dialog open={newNodeOpen} onOpenChange={setNewNodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isNonBaseSchema
                ? t("reclassification.node.newTotalNode")
                : newNodeParentId
                  ? t("reclassification.node.newNode")
                  : t("reclassification.node.newRootNode")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("reclassification.node.code")}</Label>
              <Input
                value={newNodeCode}
                onChange={(e) => setNewNodeCode(e.target.value)}
                placeholder={t("reclassification.node.codePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("reclassification.node.name")}</Label>
              <Input
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder={t("reclassification.node.namePlaceholder")}
              />
            </div>
            {/* Sign — only for root nodes of base schemas */}
            {!newNodeParentId && !isNonBaseSchema && (
              <div className="space-y-2">
                <Label>{t("reclassification.node.sign")}</Label>
                <Select
                  value={newNodeSign}
                  onValueChange={(v) => setNewNodeSign(v as ReclassificationNodeSign)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {newNodeSign === "positive"
                        ? t("reclassification.node.positive")
                        : t("reclassification.node.negative")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="positive">
                      {t("reclassification.node.positive")}
                    </SelectItem>
                    <SelectItem value="negative">
                      {t("reclassification.node.negative")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button
              onClick={handleCreateNode}
              disabled={isSubmitting || !newNodeCode.trim() || !newNodeName.trim()}
            >
              {isSubmitting ? t("common.creating") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
