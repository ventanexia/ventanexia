# Azure Artifact Signing · VentaNexIA

Este repositorio usa un flujo de firma separado para Windows:

- Workflow: `.github/workflows/release-signed-windows.yml`
- Autenticación: GitHub OIDC -> Microsoft Entra ID
- Acción oficial: `azure/artifact-signing-action@v2`
- Algoritmo: SHA-256
- Sellado de tiempo: RFC 3161 de Microsoft
- Validación obligatoria: `Get-AuthenticodeSignature` debe devolver `Valid`

## Secrets requeridos en GitHub

Configurar en el environment `production-signing`:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_ARTIFACT_SIGNING_ENDPOINT`
- `AZURE_ARTIFACT_SIGNING_ACCOUNT`
- `AZURE_ARTIFACT_SIGNING_PROFILE`

No se usa `AZURE_CLIENT_SECRET`. La autenticación debe hacerse con una credencial federada OIDC.

## Configuración necesaria en Azure

1. Registrar el proveedor `Microsoft.CodeSigning`.
2. Crear una cuenta de Artifact Signing.
3. Completar Identity Validation en el portal de Azure.
4. Crear un Certificate Profile de tipo Public Trust.
5. Crear o reutilizar una App Registration / service principal para GitHub Actions.
6. Añadir una Federated Credential que confíe únicamente en este repositorio y en el environment `production-signing`.
7. Asignar a esa identidad el rol **Artifact Signing Certificate Profile Signer** sobre el perfil/cuenta de firma.
8. Copiar los seis valores anteriores al environment `production-signing` de GitHub.

## Resultado esperado

La release firmada solo será válida si:

- `VentaNexIA.exe` está firmado y Authenticode devuelve `Valid`.
- El instalador NSIS final está firmado y Authenticode devuelve `Valid`.
- Se genera `SHA256SUMS.txt`.
- GitHub Actions publica el artefacto `VentaNexIA-Desktop-Windows-MASTER-SIGNED`.

El build normal sigue separado y no se considera release comercial firmada.
