"use client";

import { useState } from "react";
import { createDepartmentAction, createTeamAction, createRoleAction, createInvitationAction } from "./actions";

type Action = (form: FormData) => Promise<unknown>;
export function AdministrationForm({ type, action }: { type: "department" | "team" | "role" | "invite"; action: Action }) {
  const [message, setMessage] = useState("");
  const labels = { department: "Criar departamento", team: "Criar equipa", role: "Criar cargo", invite: "Criar convite" };
  return <form action={async (form) => { const response = await action(form) as { error?: string; success?: boolean }; setMessage(response.error ?? (response.success ? "Operação concluída." : "Operação concluída.")); }} className="form-grid">
    {type === "department" && <><input name="name" placeholder="Nome do departamento" required /><input name="description" placeholder="Descrição (opcional)" /></>}
    {type === "team" && <><input name="name" placeholder="Nome da equipa" required /><input name="department_id" placeholder="ID do departamento (opcional)" /></>}
    {type === "role" && <><input name="label" placeholder="Nome do cargo" required /><input name="key" placeholder="CHAVE_DO_CARGO" required /><input name="permissions" placeholder="tarefas.view tarefas.create" /></>}
    {type === "invite" && <><input name="email" type="email" placeholder="Email do convidado" required /><input name="role_key" placeholder="EMPLOYEE" defaultValue="EMPLOYEE" /></>}
    <button className="button" type="submit">{labels[type]}</button>{message && <small role="status">{message}</small>}
  </form>;
}
export const departmentAction = createDepartmentAction;
export const teamAction = createTeamAction;
export const roleAction = createRoleAction;
export const inviteAction = createInvitationAction;
