"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SubjectForm } from "../../_components/subject-form";
import type { SubjectWithDetails, Tag } from "@/types/supabase";

export default function EditSubjectPage() {
  const params = useParams();
  const subjectId = params.id as string;

  const [subject, setSubject] = useState<SubjectWithDetails | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch subject
        const subjectRes = await fetch(`/api/subjects/${subjectId}`);
        if (!subjectRes.ok) {
          setError("Soggetto non trovato");
          setLoading(false);
          return;
        }
        const subjectData = await subjectRes.json();
        setSubject(subjectData.subject);

        // Fetch tags
        const userRes = await fetch("/api/user-info");
        const userData = await userRes.json();
        const orgId = userData.profile?.organization_id;
        if (orgId) {
          const tagsRes = await fetch(`/api/tags?orgId=${orgId}`);
          const tagsData = await tagsRes.json();
          setTags(tagsData.tags ?? []);
        }
      } catch {
        setError("Errore nel caricamento");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [subjectId]);

  if (loading) {
    return <p className="text-muted-foreground">Caricamento...</p>;
  }

  if (error || !subject) {
    return <p className="text-destructive">{error ?? "Soggetto non trovato"}</p>;
  }

  return <SubjectForm initialData={subject} tags={tags} />;
}
