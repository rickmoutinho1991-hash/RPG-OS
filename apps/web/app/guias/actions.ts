"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/auth";
import { formatPortugueseNif } from "@rpg/core";
import { revalidatePath } from "next/cache";

export async function getTransportDocumentsList(params?: {
  search?: string;
  type?: string;
}): Promise<any[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("transport_documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (user.companyId) {
      query = query.eq("company_id", user.companyId);
    }

    if (params?.type) {
      query = query.eq("document_type", params.type);
    }
    if (params?.search) {
      const s = params.search.trim();
      query = query.or(
        `document_number.ilike.%${s}%,client_name.ilike.%${s}%,vehicle_plate.ilike.%${s}%`,
      );
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map((doc: any) => ({
      ...doc,
      formattedClientTaxNumber: formatPortugueseNif(doc.client_tax_number),
    }));
  } catch {
    return [];
  }
}

export async function getTransportDocumentById(
  id: string,
): Promise<any | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createAdminClient();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return null;

    let docQuery = supabase
      .from("transport_documents")
      .select("*, companies(*)")
      .eq("id", id);

    if (user.companyId) {
      docQuery = docQuery.eq("company_id", user.companyId);
    }

    const [documentRes, itemsRes] = await Promise.all([
      docQuery.maybeSingle(),
      supabase
        .from("transport_document_items")
        .select("*")
        .eq("transport_document_id", id),
    ]);

    const document = documentRes.data;
    if (!document) return null;

    return {
      document,
      items: itemsRes.data || [],
    };
  } catch {
    return null;
  }
}

export async function createTransportDocumentAction(data: {
  documentType: "GT" | "GR" | "GD" | "GA";
  clientName: string;
  clientTaxNumber: string;
  vehiclePlate: string;
  loadAddress: string;
  loadPostalCode: string;
  loadCity: string;
  loadDateTime: string;
  unloadAddress: string;
  unloadPostalCode: string;
  unloadCity: string;
  unloadDateTime?: string;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
  }>;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sessão não iniciada. Inicie sessão para emitir guias." };
  }

  const supabase = createAdminClient();

  if (
    !data.clientName ||
    !data.vehiclePlate ||
    !data.loadAddress ||
    !data.unloadAddress ||
    !data.items ||
    data.items.length === 0
  ) {
    return {
      success: false,
      error:
        "Por favor preencha os dados do transporte, viatura, moradas e mercadorias.",
    };
  }

  try {
    let countQuery = supabase
      .from("transport_documents")
      .select("id", { count: "exact", head: true });

    if (user.companyId) {
      countQuery = countQuery.eq("company_id", user.companyId);
    }

    const countRes = await countQuery;
    const nextSeq = (countRes.count || 0) + 1;
    const year = new Date().getFullYear();
    const documentNumber = `${data.documentType} ${year}/${String(nextSeq).padStart(3, "0")}`;

    const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase();
    const atDocCode = `AT-GT-${year}-${randomHex}`;
    const atcud = `0-ATCUD-GT-${year}-${String(nextSeq).padStart(4, "0")}`;

    const { data: newDoc, error: docError } = await supabase
      .from("transport_documents")
      .insert({
        document_number: documentNumber,
        document_type: data.documentType,
        status: "COMMUNICATED",
        company_id: user.companyId || null,
        client_name: data.clientName.trim(),
        client_tax_number: data.clientTaxNumber.replace(/\s/g, ""),
        vehicle_plate: data.vehiclePlate.toUpperCase().trim(),
        load_address: data.loadAddress.trim(),
        load_postal_code: data.loadPostalCode.trim(),
        load_city: data.loadCity.trim(),
        load_date_time: data.loadDateTime || new Date().toISOString(),
        unload_address: data.unloadAddress.trim(),
        unload_postal_code: data.unloadPostalCode.trim(),
        unload_city: data.unloadCity.trim(),
        unload_date_time: data.unloadDateTime || null,
        at_doc_code: atDocCode,
        atcud,
        notes: data.notes || null,
      })
      .select("id")
      .single();

    if (docError || !newDoc) {
      return {
        success: false,
        error: docError?.message || "Erro ao emitir guia de transporte.",
      };
    }

    const itemsToInsert = data.items.map((it) => ({
      transport_document_id: newDoc.id,
      description: it.description.trim(),
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit: it.unit || "un",
    }));

    await supabase.from("transport_document_items").insert(itemsToInsert);

    await supabase.from("audit_logs").insert({
      user_id: user.id,
      company_id: user.companyId || null,
      action: "TRANSPORT_GUIDE_COMMUNICATED",
      module: "LOGISTICS",
      entity_type: "TRANSPORT_DOCUMENT",
      entity_id: newDoc.id,
      metadata: { documentNumber, atDocCode, vehiclePlate: data.vehiclePlate },
    });

    revalidatePath("/guias");
    revalidatePath("/dashboard");
    return { success: true, id: newDoc.id };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao emitir guia.",
    };
  }
}
