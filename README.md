# Meus links — versão com login Google

Esta versão usa GitHub Pages para servir a interface e Firebase Authentication + Cloud Firestore para login e armazenamento. Cada conta Google só pode acessar os documentos dentro de `users/{uid}`.

## Conectar ao Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
2. Em **Configurações do projeto → Geral**, registre um app Web (`</>`) e copie os valores da configuração para `firebase-config.js`.
3. Em **Authentication**, clique em **Começar** se o serviço ainda não tiver sido configurado; depois, em **Sign-in method**, ative **Google** e salve um e-mail de suporte.
4. Em **Authentication → Settings → Authorized domains**, adicione o domínio do GitHub Pages, por exemplo `seu-usuario.github.io`. Para testar localmente, adicione também `localhost` (ou o host exato usado pelo servidor local, como `127.0.0.1`).
5. Em **Firestore Database**, crie o banco de dados.
6. Na aba **Rules** do Firestore, cole o conteúdo de `firestore.rules` e publique.
7. Publique os arquivos desta pasta no GitHub Pages. A interface fica no caminho `/Pagina%20de%20links/` se a pasta for mantida dentro da raiz do repositório.

## Configuração do app Web

Os valores do app Web do projeto `meus-links-9d460` já estão preenchidos em `firebase-config.js`. A configuração Web pode ser publicada no JavaScript; ela identifica o projeto, mas não concede acesso aos dados. O controle de acesso é feito pelas regras do Firestore, que verificam o UID autenticado.

O login usa uma janela de autorização Google. Se o navegador bloquear pop-ups, permita pop-ups para o domínio do site e tente novamente.

## Dados e privacidade

- Os grupos ficam em `users/{uid}/groups`.
- Os links ficam em `users/{uid}/groups/{groupId}/links`.
- As regras em `firestore.rules` permitem acesso somente quando o UID autenticado corresponde ao UID do caminho.
- A cota e os termos de uso do Firebase/Google se aplicam ao projeto.

O SDK é carregado pelo CDN oficial do Firebase. Por isso, o navegador precisa de conexão com a internet para autenticar e acessar o Firestore.
