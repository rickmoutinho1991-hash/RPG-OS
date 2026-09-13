# PRIVACY.md — RPG-OS Privacy by Design (Fase 1)

## 1. Princípios

1. **Minimização** — recolher apenas o necessário (RGPD Art. 5.º(1)(c)).
2. **Separação de dados** — BUSINESS DATA vs SECURE DATA (ver
   DATA-ARCHITECTURE.md).
3. **Privacy por omissão nos logs** — nada sensível entra em audit logs sem
   passar por `sanitizeAuditMetadata`.
4. **Isolamento por tenant** — cada empresa só acede aos seus dados.

## 2. Classificação de dados

Definida em @rpg/core (`security/dataClassification.ts`):

| Nível            | Exemplos                                 | Encriptado em repouso | Pode ir a audit log |
| ---------------- | ---------------------------------------- | --------------------- | ------------------- |
| PUBLIC           | conteúdo publicado                       | não                   | sim                 |
| INTERNAL         | flags operacionais                       | não                   | sim                 |
| CONFIDENTIAL     | projetos, faturas, orçamentos            | sim (at-rest da BD)   | sim                 |
| SENSITIVE        | email, telefone, NIF, IBAN               | sim                   | apenas redigido     |
| HIGHLY_SENSITIVE | passwords, tokens, API keys, secrets, CC | sim                   | **nunca**           |

Funções puras: `classifyData`, `isSensitiveData`, `requiresEncryption`,
`canAppearInAuditLog`.

## 3. Redaction / Safe Logging

`redactSensitiveValue(value, classification)` e `sanitizeAuditMetadata(metadata)`
(@rpg/core, `security/redaction.ts`):

- email → `jo***@dominio.com`
- telefone PT → `+351 *** *** 678`
- NIF → `***789`
- IBAN PT → `PT50*****************1234`
- password / token / API key / secret → **omitidos** (nem `[REDACTED]` —
  a chave não existe no log)

Importante: a redação altera apenas a **representação em logs**; os dados
originais nunca são modificados.

## 4. Integrity Ledger e privacidade

O `integrity_ledger` contém apenas hashes SHA-256 e identificadores
(evento, tipo, tenant). **Nunca** contém nomes, emails, telefones, NIF,
IBAN, passwords, tokens ou conteúdo de documentos. O hash do evento é
calculado sobre a metadata **já sanitizada**.

## 5. Retenção (fundação)

`security/retention.ts` define `RetentionPolicy` e políticas iniciais
(faturação 10 anos — Art. 53.º CIVA; audit logs 12 meses; documentos de
identidade 12 meses). `evaluateRetention()` é pura e **não apaga nada** —
a eliminação automática é trabalho futuro (Fase 2+), com revisão humana.

## 6. Direitos dos titulares

- Portabilidade (Art. 20.º): `/api/rgpd/export`.
- Apagamento (Art. 17.º): `/api/rgpd/delete` (anonimização).
- Registos de consentimento: `RgpdConsentRecord` (@rpg/core).

## 7. O que NÃO é garantido

- Hash/ledger não é encriptação e não torna dados privados.
- Redação de logs não substitui controlo de acesso aos dados originais.
- Políticas de retenção definidas não são ainda aplicadas automaticamente.
