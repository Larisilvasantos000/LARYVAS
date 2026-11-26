LARYVAS V3 — PROJETO-FONTE CONSOLIDADO

Leia primeiro: README-V3-CONSOLIDADO.txt

Este pacote contém o projeto Android completo para abrir no GitHub Codespaces/Android Studio e compilar pelo workflow GitHub Actions das branches desenvolvimento-v3 ou validacao-v3-integrada (ou execução manual).

IMPORTANTE:
- Não é um APK instalável.
- Não contém chave privada, arquivo JKS, senhas ou Base64 da assinatura.
- O workflow exige os quatro GitHub Secrets previamente configurados:
  LARYVAS_KEYSTORE_BASE64
  LARYVAS_STORE_PASSWORD
  LARYVAS_KEY_ALIAS
  LARYVAS_KEY_PASSWORD
- Preserve o arquivo JKS privado original. Não gere uma chave nova para atualizações futuras.
- Faça backup externo da V2 antes da instalação limpa da V3.
