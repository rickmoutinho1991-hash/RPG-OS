# Runbook — AT Credential Provisioning (RPG-OS)

> Como colocar credenciais AT TEST no Vault e associá-las a uma conexão.
> Sem segredos reais em lado nenhum deste documento.

## 1. Obter credenciais AT TEST externamente

Subutilizador WFA ativo no Portal das Finanças + certificado/chave do canal
mTLS, conforme a AT exigir. A password e o material criptográfico nunca
entram no chat, e-mail, tickets ou qualquer ficheiro versionado.

## 2. Entrar no RPG-OS

Login com utilizador que tenha `fiscal.manage` e empresa com NIF válido
(`companies.tax_number`, validado server-side).

## 3. Abrir /administracao/at

Secção "Registar ligação AT" → ambiente Testes → Rever → Confirmar registo.
Cria `at_connections(NOT_CONNECTED, TEST)` + consentimento interno AT.
Idempotente por `UNIQUE(company_id, environment)`.

## 4. Preencher credenciais

Na linha da conexão TEST, botão "Credenciais" → secção "Credenciais AT
TEST (guardadas no Vault)":

- WFA username (ex.: identificador `NIF/subutilizador`)
- WFA password
- Certificado (PEM)
- Private key (PEM, correspondente ao certificado)
- Cadeia CA (PEM, opcional quando a AT não a fornece)

## 5. Guardar no Vault

Botão "Guardar credenciais no Vault" → server action
`provisionAtConnectionCredentials` (fiscal.manage, company server-side,
TEST-only, conexão não revogada): valida material, grava cada segredo via
`VaultSecretBackend.putRef()` e associa as referências opacas à conexão.
Rotação segura: sempre segredos novos; refs antigas nunca apagadas aqui.
Falha de gravação na DB após Vault → cleanup automático dos segredos
recém-criados.

## 6. Confirmar apenas os statuses

A lista mostra `Vault: N/5 refs` e cada campo `✓ provisionado`.
Valores nunca apresentados, registados ou devolvidos. Auditoria
`at.credentials.provisioned` só com metadata (connectionId, environment,
tipos).

## 7. NÃO executar handshake nesta fase

O estado após provisioning é `CREDENTIALS_PENDING` (material presente,
não verificado). `AT_TEST_ENABLED` continua `false`. A próxima gate é
D22 (ativação auditada + handshake controlado).
