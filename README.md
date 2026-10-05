# Futebol Society Gramado

Painel administrativo e área de jogador para organizar jogos semanais, times sugeridos, participantes, gramados, pagamentos, avisos e enquetes. O projeto usa Firebase Authentication e Cloud Firestore e funciona no plano Spark.

## Executar localmente

Sirva os arquivos como site estático (os módulos Firebase são carregados pelo navegador):

```bash
python3 -m http.server 8000
```

Abra `http://localhost:8000`.

O workflow `.github/workflows/pages.yml` publica o app no GitHub Pages após as alterações. Na primeira vez, em **Settings → Pages**, selecione **GitHub Actions** como origem de publicação.

## Configuração Firebase

1. No Firebase Console, confirme o provedor **Authentication → Sign-in method → Email/Password**.
2. Em **Firestore Database → Rules**, substitua as regras pelas do arquivo `firestore.rules` e clique em **Publish**.
3. A lista de administradores fica em `firebase-config.js` (`adminUids`) e também nas regras do Firestore. Só ajuste os UIDs ali se souber que a conta mudou.
4. Selecione **Spark** para manter o projeto sem faturamento. O app não usa Firebase Storage. Imagens de avisos são compactadas e salvas nos documentos do Firestore; os comprovantes de pagamento ficam no dispositivo em que foram anexados.

## Acesso do jogador

O jogador entra com primeiro nome e os 9 dígitos finais do telefone, sem `+55`. Em primeiro acesso, ele envia nome completo e apelido; na lista de participantes o administrador pode aprovar diretamente, editar o nome/apelido do pedido, escolher o participante correspondente ou excluir o pedido. Se nenhuma pessoa for selecionada, a aprovação cria um cadastro novo. O jogador vê apenas os próprios dados e o jogo da semana; o valor devido soma todos os pagamentos pendentes. A presença pode ser escolhida no jogo disponível.

Os contatos que tinham nome e telefone legíveis nas imagens foram pré-cadastrados. O número sem nome foi deixado como “Contato sem nome” para o administrador completar. Homônimos podem ser vinculados pelo telefone na aprovação. Na primeira sincronização desta versão, o nome atual é copiado para o campo de apelido, preservando apelidos anteriores como aliases internos para associar listas antigas.

O administrador mantém acesso completo pelos quatro UIDs registrados em `firebase-config.js` e nas regras do Firestore. No elenco, pode editar ou excluir participantes; a exclusão bloqueia a leitura dos dados pessoais do jogador e preserva os jogos passados.


## Gestão

- A agenda inicial contém jogos às sextas, 19h30, de 9 de outubro até 27 de novembro de 2026, com alternativa para sábado às 14h30 em caso de chuva.
- O valor inicial é R$ 20 por jogo e R$ 7 de churrasco; chave PIX `48 9 9191 4372`.
- Gramados, horários, valores e jogadores podem ser editados no painel.
- Avisos vencidos deixam de aparecer e são apagados do Firestore quando um administrador abre o painel depois do prazo. Não há exclusão programada em segundo plano no plano Spark.
- Enquetes e registro de votos são administrados pelo painel.

## Dados importantes

`appData/current` contém o cadastro completo e é acessível somente aos administradores. `playerData/{uid}` contém a visão financeira individual, com leitura restrita ao próprio usuário e aos administradores. `playerAccessRequests/{uid}` guarda os pedidos de aprovação.


## Links de acesso

- Painel administrativo: https://projetosetags.github.io/futebol/
- Área restrita dos jogadores: https://projetosetags.github.io/futebol/jogador.html

Jogadores entram com o primeiro nome e os 9 dígitos finais do telefone como senha. Se o cadastro foi solicitado anteriormente com DDD, basta usar os 9 dígitos finais. Administradores continuam usando o painel principal.
