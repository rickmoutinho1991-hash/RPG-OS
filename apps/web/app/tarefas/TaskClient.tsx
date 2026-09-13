"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction, completeTaskAction } from "./actions";

export function NewTaskForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="card"
      action={async (formData) => {
        await createTaskAction(formData);
        formRef.current?.reset();
        startTransition(() => router.refresh());
      }}
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
        <label htmlFor="task-title">Nova tarefa</label>
        <input
          id="task-title"
          name="title"
          required
          placeholder="O que precisa de ser feito?"
        />
      </div>
      <div className="form-field" style={{ marginBottom: 0 }}>
        <label htmlFor="task-priority">Prioridade</label>
        <select id="task-priority" name="priority" defaultValue="MEDIUM">
          <option value="LOW">Baixa</option>
          <option value="MEDIUM">Média</option>
          <option value="HIGH">Alta</option>
          <option value="URGENT">Urgente</option>
        </select>
      </div>
      <div className="form-field" style={{ marginBottom: 0 }}>
        <label htmlFor="task-due">Prazo</label>
        <input id="task-due" name="due_date" type="date" />
      </div>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "A criar..." : "+ Criar"}
      </button>
    </form>
  );
}

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="button secondary"
      style={{ fontSize: "11px", padding: "4px 10px" }}
      disabled={pending}
      onClick={async () => {
        await completeTaskAction(taskId);
        startTransition(() => router.refresh());
      }}
    >
      {pending ? "..." : "✓ Concluir"}
    </button>
  );
}
