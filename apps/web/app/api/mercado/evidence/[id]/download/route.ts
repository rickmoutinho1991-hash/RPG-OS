import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/session";
import { getEvidenceDownload, MARKETPLACE_EVIDENCE_BUCKET } from "@/lib/marketplace/evidence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Evidência inválida" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: evidence } = await supabase
    .from("evidence")
    .select("id, related_entity_type, related_entity_id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!evidence) {
    return NextResponse.json({ error: "Evidência não encontrada" }, { status: 404 });
  }

  if (evidence.related_entity_type === "MILESTONE" && evidence.related_entity_id) {
    const { data: milestone } = await supabase
      .from("contract_milestones")
      .select("contract_id")
      .eq("id", evidence.related_entity_id)
      .maybeSingle();

    if (milestone) {
      const { data: contract } = await supabase
        .from("contracts")
        .select("client_id, provider_id")
        .eq("id", milestone.contract_id)
        .maybeSingle();

      if (
        contract &&
        contract.client_id !== ctx.user.id &&
        contract.provider_id !== ctx.user.id
      ) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Evidência não encontrada" }, { status: 404 });
    }
  } else if (evidence.owner_id !== ctx.user.id) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const result = await getEvidenceDownload(id, ctx.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const { evidence: record, content } = result.file;
  const filename = record.file.storedName || "evidencia";
  const asciiName = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "_");

  const body = content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": record.file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiName}"`,
      "X-Evidence-Bucket": MARKETPLACE_EVIDENCE_BUCKET,
    },
  });
}