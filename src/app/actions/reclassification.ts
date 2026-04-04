"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ReclassificationNodeSign } from "@/types/supabase";

function canManageReclassification(roles: string[]): boolean {
  return roles.includes("accountant") || roles.includes("superadmin");
}

function isSuperadmin(roles: string[]): boolean {
  return roles.includes("superadmin");
}

/** Check if user can access a template: owns it (same org) or is superadmin for template */
function canAccessTemplate(
  templateOrgId: string | null,
  isTemplate: boolean,
  userOrgId: string | null,
  roles: string[]
): boolean {
  if (isTemplate) return isSuperadmin(roles);
  return templateOrgId === userOrgId;
}

// ─── Template Actions ───

export async function createTemplateAction(name: string, description: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  if (!name?.trim()) return { error: "Nome obbligatorio" };

  const admin = createAdminClient();
  const isSuper = isSuperadmin(currentUser.roles);
  const organizationId = currentUser.profile.organization_id;

  if (!isSuper && !organizationId) return { error: "Organizzazione non trovata" };

  const { data: template, error } = await admin
    .from("reclassification_templates")
    .insert({
      organization_id: isSuper ? null : organizationId,
      name: name.trim(),
      description: description?.trim() || null,
      created_by: currentUser.profile.id,
      is_template: isSuper,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Esiste già un template con questo nome" };
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/settings/reclassification");
  return { success: true, template };
}

export async function updateTemplateAction(
  templateId: string,
  data: { name?: string; description?: string }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("reclassification_templates")
    .select("organization_id, is_template")
    .eq("id", templateId)
    .single();

  if (!existing) return { error: "Template non trovato" };
  // Superadmin can edit system templates (org_id is null); accountant must own it
  if (existing.is_template) {
    if (!isSuperadmin(currentUser.roles)) return { error: "Il template predefinito non può essere modificato" };
  } else if (existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Template non trovato" };
  }

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) {
    if (!data.name?.trim()) return { error: "Nome obbligatorio" };
    updates.name = data.name.trim();
  }
  if (data.description !== undefined) {
    updates.description = data.description?.trim() || null;
  }

  const { data: template, error } = await admin
    .from("reclassification_templates")
    .update(updates)
    .eq("id", templateId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Esiste già un template con questo nome" };
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  revalidatePath("/settings/reclassification");
  return { success: true, template };
}

export async function deleteTemplateAction(templateId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("reclassification_templates")
    .select("organization_id, is_template, is_base")
    .eq("id", templateId)
    .single();

  if (!existing || existing.organization_id !== currentUser.profile.organization_id) {
    return { error: "Template non trovato" };
  }
  if (existing.is_template) return { error: "Il template predefinito non può essere eliminato" }; // system template never deletable

  const { error } = await admin
    .from("reclassification_templates")
    .delete()
    .eq("id", templateId);

  if (error) return { error: `Errore nell'eliminazione: ${error.message}` };

  revalidatePath("/settings/reclassification");
  return { success: true };
}

export async function setBaseTemplateAction(templateId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("reclassification_templates")
    .select("organization_id, is_template")
    .eq("id", templateId)
    .single();

  if (!existing || existing.organization_id !== organizationId) {
    return { error: "Template non trovato" };
  }
  if (existing.is_template) return { error: "Il template predefinito non può essere impostato come base" }; // system template is never base

  // Set new base first, then unset others (safer order — worst case: two bases temporarily, never zero)
  const { error } = await admin
    .from("reclassification_templates")
    .update({ is_base: true })
    .eq("id", templateId);

  if (error) return { error: `Errore: ${error.message}` };

  // Unset all other bases in this org
  await admin
    .from("reclassification_templates")
    .update({ is_base: false })
    .eq("organization_id", organizationId)
    .eq("is_base", true)
    .neq("id", templateId);

  revalidatePath("/settings/reclassification");
  return { success: true };
}

export async function cloneTemplateAction(sourceTemplateId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  // Fetch source template
  const { data: source } = await admin
    .from("reclassification_templates")
    .select("*")
    .eq("id", sourceTemplateId)
    .single();

  if (!source) return { error: "Template sorgente non trovato" };

  // Source must belong to same org or be system
  if (!source.is_template && source.organization_id !== organizationId) {
    return { error: "Template non trovato" };
  }

  // Create clone
  const { data: newTemplate, error: templateError } = await admin
    .from("reclassification_templates")
    .insert({
      organization_id: organizationId,
      name: source.name,
      description: source.description,
      cloned_from_id: sourceTemplateId,
      created_by: currentUser.profile.id,
    })
    .select()
    .single();

  if (templateError) return { error: `Errore nella clonazione: ${templateError.message}` };

  // Fetch all source nodes
  const { data: sourceNodes } = await admin
    .from("reclassification_nodes")
    .select("*")
    .eq("template_id", sourceTemplateId)
    .order("order_index");

  if (sourceNodes && sourceNodes.length > 0) {
    const idMap = new Map<string, string>();

    // Clone level by level: first roots, then children
    const roots = sourceNodes.filter((n) => !n.parent_id);
    const children = sourceNodes.filter((n) => n.parent_id);

    for (const node of roots) {
      const { data: newNode } = await admin
        .from("reclassification_nodes")
        .insert({
          template_id: newTemplate.id,
          parent_id: null,
          code: node.code,
          name: node.name,
          sign: node.sign,
          order_index: node.order_index,
          is_total: node.is_total,
          formula: node.formula,
        })
        .select("id")
        .single();

      if (newNode) idMap.set(node.id, newNode.id);
    }

    // Process remaining children in multiple passes
    let remaining = [...children];
    let maxPasses = 10;
    while (remaining.length > 0 && maxPasses > 0) {
      const nextRemaining: typeof remaining = [];
      for (const node of remaining) {
        const newParentId = idMap.get(node.parent_id!);
        if (!newParentId) {
          nextRemaining.push(node);
          continue;
        }
        const { data: newNode } = await admin
          .from("reclassification_nodes")
          .insert({
            template_id: newTemplate.id,
            parent_id: newParentId,
            code: node.code,
            name: node.name,
            sign: node.sign,
            order_index: node.order_index,
            is_total: node.is_total,
            formula: node.formula,
          })
          .select("id")
          .single();

        if (newNode) idMap.set(node.id, newNode.id);
      }
      remaining = nextRemaining;
      maxPasses--;
    }

    // Clone refs using idMap
    const { data: sourceRefs } = await admin
      .from("reclassification_node_refs")
      .select("total_node_id, ref_node_id")
      .in("total_node_id", sourceNodes.map((n) => n.id));

    if (sourceRefs) {
      for (const ref of sourceRefs) {
        const newTotalId = idMap.get(ref.total_node_id);
        const newRefId = idMap.get(ref.ref_node_id);
        if (newTotalId && newRefId) {
          await admin.from("reclassification_node_refs").insert({
            total_node_id: newTotalId,
            ref_node_id: newRefId,
          });
        }
      }
    }
  }

  revalidatePath("/settings/reclassification");
  return { success: true, template: newTemplate };
}

// Seed: clone system template for current org (for existing orgs pre-migration)
export async function seedReclassificationAction() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const organizationId = currentUser.profile.organization_id;
  if (!organizationId) return { error: "Organizzazione non trovata" };

  const admin = createAdminClient();

  // Find system template
  const { data: systemTemplates } = await admin
    .from("reclassification_templates")
    .select("id")
    .eq("is_template", true)
    .limit(1);

  if (!systemTemplates || systemTemplates.length === 0) {
    return { error: "Template di sistema non trovato. Eseguire prima il seed nella migration." };
  }
  const systemTemplate = systemTemplates[0];

  // Clone it
  const result = await cloneTemplateAction(systemTemplate.id);
  if ("error" in result) return result;

  // Unset any existing base, then set the new one
  if (result.template) {
    await admin
      .from("reclassification_templates")
      .update({ is_base: false })
      .eq("organization_id", organizationId)
      .eq("is_base", true);

    await admin
      .from("reclassification_templates")
      .update({ is_base: true })
      .eq("id", result.template.id);
  }

  revalidatePath("/settings/reclassification");
  return { success: true };
}

// ─── Node Actions ───

interface NodeInput {
  templateId: string;
  parentId: string | null;
  code: string;
  name: string;
  sign: ReclassificationNodeSign;
  isTotal?: boolean;
  formula?: string | null;
}

export async function createNodeAction(data: NodeInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  if (!data.code?.trim()) return { error: "Codice obbligatorio" };
  if (!data.name?.trim()) return { error: "Nome obbligatorio" };

  const admin = createAdminClient();

  // Verify template belongs to org and is not system
  const { data: template } = await admin
    .from("reclassification_templates")
    .select("organization_id, is_template")
    .eq("id", data.templateId)
    .single();

  if (!template || !canAccessTemplate(template.organization_id, template.is_template, currentUser.profile.organization_id, currentUser.roles)) {
    return { error: "Template non trovato" };
  }

  // Inherit sign from root ancestor for child nodes
  let sign = data.sign;
  if (data.parentId) {
    // Walk up to root to get its sign
    let currentParentId: string | null = data.parentId;
    while (currentParentId) {
      const result = await admin
        .from("reclassification_nodes")
        .select("parent_id, sign")
        .eq("id", currentParentId)
        .single();
      const parentNode = result.data as { parent_id: string | null; sign: string } | null;
      if (!parentNode) break;
      sign = parentNode.sign as ReclassificationNodeSign;
      currentParentId = parentNode.parent_id;
    }
  }

  // Auto-compute order_index as max + 1 among siblings
  const { data: siblings } = await admin
    .from("reclassification_nodes")
    .select("order_index")
    .eq("template_id", data.templateId)
    .is("parent_id", data.parentId ?? null);

  // Filter for correct parent_id match when not null
  let maxOrder = -1;
  if (data.parentId) {
    const { data: siblingsByParent } = await admin
      .from("reclassification_nodes")
      .select("order_index")
      .eq("template_id", data.templateId)
      .eq("parent_id", data.parentId);
    if (siblingsByParent) {
      for (const s of siblingsByParent) {
        if (s.order_index > maxOrder) maxOrder = s.order_index;
      }
    }
  } else if (siblings) {
    for (const s of siblings) {
      if (s.order_index > maxOrder) maxOrder = s.order_index;
    }
  }

  const { data: node, error } = await admin
    .from("reclassification_nodes")
    .insert({
      template_id: data.templateId,
      parent_id: data.parentId,
      code: data.code.trim(),
      full_code: "", // Will be computed by trigger
      name: data.name.trim(),
      sign,
      order_index: maxOrder + 1,
      is_total: data.isTotal ?? false,
      formula: data.formula ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Codice già esistente per questo livello" };
    return { error: `Errore nella creazione: ${error.message}` };
  }

  revalidatePath("/settings/reclassification");
  return { success: true, node };
}

interface NodeUpdateInput {
  code?: string;
  name?: string;
  sign?: ReclassificationNodeSign;
  orderIndex?: number;
  isTotal?: boolean;
  formula?: string | null;
}

export async function updateNodeAction(nodeId: string, data: NodeUpdateInput) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  // Verify ownership through template
  const { data: node } = await admin
    .from("reclassification_nodes")
    .select("template_id, parent_id, reclassification_templates(organization_id, is_template)")
    .eq("id", nodeId)
    .single();

  if (!node) return { error: "Nodo non trovato" };

  const tmpl = node.reclassification_templates as unknown as {
    organization_id: string;
    is_template: boolean;
  };
  if (!canAccessTemplate(tmpl.organization_id, tmpl.is_template, currentUser.profile.organization_id, currentUser.roles)) {
    return { error: "Nodo non trovato" };
  }

  const updates: Record<string, unknown> = {};
  if (data.code !== undefined) {
    if (!data.code?.trim()) return { error: "Codice obbligatorio" };
    updates.code = data.code.trim();
  }
  if (data.name !== undefined) {
    if (!data.name?.trim()) return { error: "Nome obbligatorio" };
    updates.name = data.name.trim();
  }
  // Sign can only be changed on root nodes; children inherit from root
  const signChanged = data.sign !== undefined && !node.parent_id;
  if (signChanged) updates.sign = data.sign;
  if (data.orderIndex !== undefined) updates.order_index = data.orderIndex;
  if (data.isTotal !== undefined) updates.is_total = data.isTotal;
  if (data.formula !== undefined) updates.formula = data.formula || null;

  // If turning off is_total, clear refs
  if (data.isTotal === false) {
    await admin.from("reclassification_node_refs").delete().eq("total_node_id", nodeId);
  }

  const { data: updated, error } = await admin
    .from("reclassification_nodes")
    .update(updates)
    .eq("id", nodeId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { error: "Codice già esistente per questo livello" };
    return { error: `Errore nell'aggiornamento: ${error.message}` };
  }

  // Propagate sign change to all descendants
  if (signChanged && data.sign) {
    const propagateSign = async (parentId: string, sign: ReclassificationNodeSign) => {
      const { data: children } = await admin
        .from("reclassification_nodes")
        .select("id")
        .eq("parent_id", parentId);
      if (children) {
        for (const child of children) {
          await admin.from("reclassification_nodes").update({ sign }).eq("id", child.id);
          await propagateSign(child.id, sign);
        }
      }
    };
    await propagateSign(nodeId, data.sign);
  }

  revalidatePath("/settings/reclassification");
  return { success: true, node: updated };
}

export async function deleteNodeAction(nodeId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  // Verify ownership through template
  const { data: node } = await admin
    .from("reclassification_nodes")
    .select("template_id, reclassification_templates(organization_id, is_template)")
    .eq("id", nodeId)
    .single();

  if (!node) return { error: "Nodo non trovato" };

  const tmpl = node.reclassification_templates as unknown as {
    organization_id: string;
    is_template: boolean;
  };
  if (!canAccessTemplate(tmpl.organization_id, tmpl.is_template, currentUser.profile.organization_id, currentUser.roles)) {
    return { error: "Nodo non trovato" };
  }

  // Check for children
  const { data: children } = await admin
    .from("reclassification_nodes")
    .select("id")
    .eq("parent_id", nodeId)
    .limit(1);

  if (children && children.length > 0) {
    return { error: "Impossibile eliminare un nodo con figli. Eliminare prima i nodi figli." };
  }

  const { error } = await admin
    .from("reclassification_nodes")
    .delete()
    .eq("id", nodeId);

  if (error) return { error: `Errore nell'eliminazione: ${error.message}` };

  revalidatePath("/settings/reclassification");
  return { success: true };
}

export async function reorderNodesAction(orderedNodeIds: string[]) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  if (!orderedNodeIds.length) return { error: "Nessun nodo da riordinare" };

  const admin = createAdminClient();

  // Verify ALL nodes belong to user's org and same template
  const { data: allNodes } = await admin
    .from("reclassification_nodes")
    .select("id, template_id")
    .in("id", orderedNodeIds);

  if (!allNodes || allNodes.length !== orderedNodeIds.length) {
    return { error: "Nodi non trovati" };
  }

  const templateIds = new Set(allNodes.map((n) => n.template_id));
  if (templateIds.size !== 1) return { error: "I nodi devono appartenere allo stesso template" };

  const templateId = allNodes[0].template_id;
  const { data: tmplData } = await admin
    .from("reclassification_templates")
    .select("organization_id, is_template")
    .eq("id", templateId)
    .single();

  if (!tmplData || tmplData.organization_id !== currentUser.profile.organization_id) {
    return { error: "Non autorizzato" };
  }
  if (tmplData.is_template && !isSuperadmin(currentUser.roles)) return { error: "Il template predefinito non può essere modificato" };

  // Bulk update order_index — use the validated node IDs only
  const validIds = new Set(allNodes.map((n) => n.id));
  for (let i = 0; i < orderedNodeIds.length; i++) {
    if (!validIds.has(orderedNodeIds[i])) continue;
    await admin
      .from("reclassification_nodes")
      .update({ order_index: i })
      .eq("id", orderedNodeIds[i])
      .eq("template_id", templateId);
  }

  revalidatePath("/settings/reclassification");
  return { success: true };
}

export async function moveNodeAction(nodeId: string, newParentId: string | null) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  // Verify ownership
  const { data: node } = await admin
    .from("reclassification_nodes")
    .select("template_id, parent_id, reclassification_templates(organization_id, is_template)")
    .eq("id", nodeId)
    .single();

  if (!node) return { error: "Nodo non trovato" };

  const tmpl = node.reclassification_templates as unknown as {
    organization_id: string;
    is_template: boolean;
  };
  if (!canAccessTemplate(tmpl.organization_id, tmpl.is_template, currentUser.profile.organization_id, currentUser.roles)) {
    return { error: "Nodo non trovato" };
  }

  if (nodeId === newParentId) return { error: "Non puoi spostare un nodo sotto se stesso" };

  // Prevent cycle: cannot move under own descendant
  if (newParentId) {
    let checkId: string | null = newParentId;
    while (checkId) {
      if (checkId === nodeId) {
        return { error: "Non puoi spostare un nodo sotto un suo discendente" };
      }
      const result = await admin
        .from("reclassification_nodes")
        .select("parent_id")
        .eq("id", checkId)
        .single();
      const parentData = result.data as { parent_id: string | null } | null;
      checkId = parentData?.parent_id ?? null;
    }

    // Verify target belongs to same template
    const { data: targetNode } = await admin
      .from("reclassification_nodes")
      .select("template_id")
      .eq("id", newParentId)
      .single();

    if (!targetNode || targetNode.template_id !== node.template_id) {
      return { error: "Il nodo destinazione non appartiene allo stesso template" };
    }
  }

  // Compute new order_index (append at end)
  let maxOrder = -1;
  if (newParentId) {
    const { data: siblings } = await admin
      .from("reclassification_nodes")
      .select("order_index")
      .eq("template_id", node.template_id)
      .eq("parent_id", newParentId);
    if (siblings) {
      for (const s of siblings) {
        if (s.order_index > maxOrder) maxOrder = s.order_index;
      }
    }
  } else {
    const { data: siblings } = await admin
      .from("reclassification_nodes")
      .select("order_index")
      .eq("template_id", node.template_id)
      .is("parent_id", null);
    if (siblings) {
      for (const s of siblings) {
        if (s.order_index > maxOrder) maxOrder = s.order_index;
      }
    }
  }

  // Inherit sign from root ancestor of new parent
  let newSign: ReclassificationNodeSign | undefined;
  if (newParentId) {
    let walkId: string | null = newParentId;
    let rootSign: string = "positive";
    while (walkId) {
      const result = await admin
        .from("reclassification_nodes")
        .select("parent_id, sign")
        .eq("id", walkId)
        .single();
      const p = result.data as { parent_id: string | null; sign: string } | null;
      if (!p) break;
      rootSign = p.sign;
      walkId = p.parent_id;
    }
    newSign = rootSign as ReclassificationNodeSign;
  }

  // Get current node code to check for conflicts in destination
  const { data: currentNode } = await admin
    .from("reclassification_nodes")
    .select("code")
    .eq("id", nodeId)
    .single();

  let finalCode = currentNode?.code ?? "1";

  // Check if the code already exists among siblings in the destination
  const { data: destSiblings } = await admin
    .from("reclassification_nodes")
    .select("code")
    .eq("template_id", node.template_id)
    .neq("id", nodeId);

  // Filter for correct parent
  const destSiblingCodes = new Set<string>();
  if (newParentId) {
    const { data: filtered } = await admin
      .from("reclassification_nodes")
      .select("code")
      .eq("template_id", node.template_id)
      .eq("parent_id", newParentId)
      .neq("id", nodeId);
    if (filtered) {
      for (const s of filtered) destSiblingCodes.add(s.code);
    }
  } else {
    const { data: filtered } = await admin
      .from("reclassification_nodes")
      .select("code")
      .eq("template_id", node.template_id)
      .is("parent_id", null)
      .neq("id", nodeId);
    if (filtered) {
      for (const s of filtered) destSiblingCodes.add(s.code);
    }
  }

  // If code conflicts, generate next available code
  if (destSiblingCodes.has(finalCode)) {
    // Try numeric increment: if code is "3", try "4", "5", etc.
    // If code is "A", try "A2", "A3", etc.
    const numMatch = finalCode.match(/^(\D*)(\d+)$/);
    if (numMatch) {
      const prefix = numMatch[1];
      let num = parseInt(numMatch[2], 10);
      while (destSiblingCodes.has(prefix + num)) {
        num++;
      }
      finalCode = prefix + num;
    } else {
      // Non-numeric code like "A" → try "A2", "A3", ...
      let suffix = 2;
      while (destSiblingCodes.has(finalCode + suffix)) {
        suffix++;
      }
      finalCode = finalCode + suffix;
    }
  }

  const updates: Record<string, unknown> = {
    parent_id: newParentId,
    order_index: maxOrder + 1,
    code: finalCode,
  };
  if (newSign !== undefined) updates.sign = newSign;

  const { error } = await admin
    .from("reclassification_nodes")
    .update(updates)
    .eq("id", nodeId);

  if (error) {
    return { error: `Errore nello spostamento: ${error.message}` };
  }

  // Update sign of all descendants too
  if (newSign !== undefined) {
    const updateDescSign = async (pid: string, sign: ReclassificationNodeSign) => {
      const { data: ch } = await admin
        .from("reclassification_nodes")
        .select("id")
        .eq("parent_id", pid);
      if (ch) {
        for (const c of ch) {
          await admin.from("reclassification_nodes").update({ sign }).eq("id", c.id);
          await updateDescSign(c.id, sign);
        }
      }
    };
    await updateDescSign(nodeId, newSign);
  }

  revalidatePath("/settings/reclassification");
  return { success: true };
}

// ─── Node Refs Actions ───

export async function updateNodeRefsAction(totalNodeId: string, refNodeIds: string[]) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Non autorizzato" };
  if (!canManageReclassification(currentUser.roles)) return { error: "Non autorizzato" };

  const admin = createAdminClient();

  const { data: node } = await admin
    .from("reclassification_nodes")
    .select("template_id, is_total, reclassification_templates(organization_id, is_template)")
    .eq("id", totalNodeId)
    .single();

  if (!node) return { error: "Nodo non trovato" };

  const tmpl = node.reclassification_templates as unknown as {
    organization_id: string;
    is_template: boolean;
  };
  if (!canAccessTemplate(tmpl.organization_id, tmpl.is_template, currentUser.profile.organization_id, currentUser.roles)) {
    return { error: "Nodo non trovato" };
  }
  if (!node.is_total) return { error: "Il nodo non è una riga totale" };

  await admin.from("reclassification_node_refs").delete().eq("total_node_id", totalNodeId);

  if (refNodeIds.length > 0) {
    const rows = refNodeIds.map((refId) => ({
      total_node_id: totalNodeId,
      ref_node_id: refId,
    }));
    const { error } = await admin.from("reclassification_node_refs").insert(rows);
    if (error) return { error: `Errore: ${error.message}` };
  }

  revalidatePath("/settings/reclassification");
  return { success: true };
}
