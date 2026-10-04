# Futebol Society Gramado

Painel administrativo para organizar jogos semanais, participantes, gramados, listas, pagamentos e comprovantes.

## Começar

Abra os arquivos por um servidor web estático. Em desenvolvimento, por exemplo:

```bash
python3 -m http.server 8000
```

Acesse `http://localhost:8000/`. Sem Firebase configurado, os dados ficam no armazenamento local do navegador.

## Firebase

1. Registre um app Web e coloque a configuração em `firebase-config.js`.
2. Ative o provedor E-mail/senha no Firebase Authentication e crie o usuário administrador.
3. Confira se o UID desse usuário corresponde ao `adminUid` do arquivo `firebase-config.js` e às regras.
4. Crie o banco Cloud Firestore e ative Firebase Storage.
5. Publique `firestore.rules` e `storage.rules` no Console Firebase. Elas permitem acesso apenas ao UID administrador e negam o restante.

Os dados dos participantes, telefones, comprovantes e localizações devem ficar em armazenamento protegido. Não inclua informações pessoais no código ou em commits públicos. A configuração Web não substitui regras de autenticação e acesso.
