LARYVAS - projeto Android inicial

Este projeto empacota a versão web da LARYVAS em um aplicativo Android (WebView).
Os arquivos HTML/CSS/JS ficam dentro do APK. O conteúdo da biblioteca permanece no armazenamento local do aplicativo.

REQUISITOS PARA COMPILAR NA NUVEM
- Uma conta GitHub.
- Criar um repositório e enviar todo o conteúdo desta pasta.
- Abrir a aba Actions e executar "Build LARYVAS APK" (ou aguardar o build após o primeiro push).
- Ao terminar, abrir a execução e baixar o artifact "LARYVAS-debug-apk". Dentro dele estará app-debug.apk.

IMPORTANTE
- Esta é uma compilação debug para testes pessoais, não uma versão assinada para publicação na Play Store.
- Faça a instalação e restaure seu backup JSON dentro do APK.
- Não desinstale a versão antiga do app/navegador até confirmar que a restauração funcionou.
- O APK usa armazenamento separado do Chrome; a biblioteca não é transferida automaticamente.
- O backup do APK é salvo na pasta Downloads do Android; a restauração usa o seletor de arquivos do sistema.
