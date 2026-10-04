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

O jogador escolhe **Jogador → Primeiro acesso**, informa primeiro nome e telefone e aguarda aprovação do administrador. Para aprovar, o nome e telefone precisam coincidir com um participante ativo cadastrado. Depois, o jogador entra com o primeiro nome e o mesmo telefone; a área exibe somente os próprios jogos, pagamentos pendentes e a chave PIX. O jogador também escolhe sexta ou somente sábado em caso de chuva; a escolha aparece na lista administrativa do jogo. O administrador confirma os pagamentos. Avisos ativos também aparecem na área do jogador.

O telefone funciona como senha conforme solicitado. Como essa senha é fácil de adivinhar por quem conhece o número, o acesso individual só é liberado após aprovação administrativa; evite reutilizar essa senha em outros serviços.

## Gestão

- A agenda inicial contém jogos às sextas, 19h30, de 9 de outubro até 27 de novembro de 2026, com alternativa para sábado às 14h30 em caso de chuva.
- O valor inicial é R$ 20 por jogo e R$ 7 de churrasco; chave PIX `48 9 9191 4372`.
- Gramados, horários, valores e jogadores podem ser editados no painel.
- Avisos vencidos deixam de aparecer e são apagados do Firestore quando um administrador abre o painel depois do prazo. Não há exclusão programada em segundo plano no plano Spark.
- Enquetes e registro de votos são administrados pelo painel.

## Dados importantes

`appData/current` contém o cadastro completo e é acessível somente aos administradores. `playerData/{uid}` contém a visão financeira individual, com leitura restrita ao próprio usuário e aos administradores. `playerAccessRequests/{uid}` guarda os pedidos de aprovação.
