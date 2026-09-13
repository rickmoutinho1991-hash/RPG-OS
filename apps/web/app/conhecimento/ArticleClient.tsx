"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createArticleAction } from "./actions";

export function NewArticleForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="card"
      action={async (formData) => {
        await createArticleAction(formData);
        formRef.current?.reset();
        startTransition(() => router.refresh());
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "end",
        }}
      >
        <div
          className="form-field"
          style={{ flex: "2 1 220px", marginBottom: 0 }}
        >
          <label htmlFor="kb-title">Novo artigo</label>
          <input
            id="kb-title"
            name="title"
            required
            placeholder="Título do manual, procedimento ou política..."
          />
        </div>
        <div className="form-field" style={{ marginBottom: 0 }}>
          <label htmlFor="kb-category">Categoria</label>
          <select id="kb-category" name="category" defaultValue="wiki">
            <option value="manual">Manual</option>
            <option value="procedimento">Procedimento</option>
            <option value="politica">Política</option>
            <option value="faq">FAQ</option>
            <option value="sop">SOP</option>
            <option value="formacao">Formação</option>
            <option value="wiki">Wiki</option>
            <option value="legislacao">Legislação</option>
          </select>
        </div>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "A publicar..." : "+ Publicar"}
        </button>
      </div>
      <div className="form-field" style={{ marginTop: "8px" }}>
        <label htmlFor="kb-content">Conteúdo</label>
        <textarea
          id="kb-content"
          name="content"
          rows={4}
          placeholder="Escreva o conteúdo do artigo..."
        />
      </div>
    </form>
  );
}
