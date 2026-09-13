# RBAC

As permissões seguem `modulo.acao`. São suportados `*`, `modulo.*`, `modulo.manage` e `modulo.admin`. Permissões efetivas combinam o cargo built-in ou personalizado com overrides temporais da membership.

A autorização server-side é obrigatória em páginas, Server Actions e APIs. `has_org_permission` replica a decisão na base de dados para RLS, verificando membership ACTIVE e validade temporal. Suspensão, remoção e expiração resultam em zero permissões.

Cargos personalizados ficam em `custom_roles`; memberships ligam utilizador, organização, cargo e departamento. Não usar permissões calculadas no cliente para proteger dados.
