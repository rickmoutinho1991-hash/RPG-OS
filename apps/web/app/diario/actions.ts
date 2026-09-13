"use server";

import { revalidatePath } from "next/cache";
import { UniversalDiaryEntry } from "@rpg/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function getDiaryEntriesList(): Promise<UniversalDiaryEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("diary_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    return data.map((d: any) => ({
      id: d.id,
      userId: d.user_id,
      date: d.date,
      title: d.title,
      category: d.category,
      content: d.content,
      moodOrProductivityScore: d.mood_score || undefined,
      tags: d.tags || [],
      expenseOrIncomeAmount: d.amount ? Number(d.amount) : undefined,
      isPrivate: d.is_private,
      createdAt: d.created_at,
    }));
  } catch (err) {
    console.error("[Diário] Erro ao carregar registos:", err);
    return [];
  }
}

export async function createDiaryEntryAction(data: {
  title: string;
  category: "PERSONAL" | "BUSINESS" | "HEALTH" | "FINANCIAL" | "PROJECT" | "ROUTINE";
  content: string;
  moodOrProductivityScore?: number;
  tags?: string[];
  expenseOrIncomeAmount?: number;
  isPrivate?: boolean;
}): Promise<{ success: boolean; message?: string; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para registar no diário." };
  }

  if (!data.title || !data.content) {
    return { success: false, error: "Título e conteúdo do registo são obrigatórios." };
  }

  const supabase = createAdminClient();

  try {
    const isPrivate = data.isPrivate ?? (data.category === "PERSONAL" || data.category === "HEALTH");

    const { data: newEntry, error } = await supabase
      .from("diary_entries")
      .insert({
        user_id: user.id,
        company_id: user.companyId || null,
        date: new Date().toISOString().split("T")[0],
        title: data.title.trim(),
        category: data.category,
        content: data.content.trim(),
        mood_score: data.moodOrProductivityScore || null,
        tags: data.tags || [],
        amount: data.expenseOrIncomeAmount || null,
        is_private: isPrivate,
      })
      .select("id")
      .single();

    if (error || !newEntry) {
      return { success: false, error: error?.message || "Erro ao guardar no diário." };
    }

    revalidatePath("/diario");
    revalidatePath("/dashboard");
    return {
      success: true,
      id: newEntry.id,
      message: "Registo gravado no Diário Universal com sucesso!",
    };
  } catch (err) {
    console.error("[Diário] Erro ao guardar registo:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao gravar no diário.",
    };
  }
}




