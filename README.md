# Futebol Society Gramado

Painel administrativo para organizar jogos semanais, participantes, gramados, listas, pagamentos e comprovantes.

## Começar

Abra os arquivos por um servidor web estático. Em desenvolvimento, por exemplo:

```bash
python3 -m http.server 8000
```

Acesse `http://localhost:8000/`. Sem Firebase configurado, os dados ficam no armazenamento local do navegador.

## Firebase

1. Crie ou selecione o projeto Firebase e registre um app Web.
2. Preencha `firebase-config.js` com a configuração Web desse projeto.
3. Ative Cloud Firestore, Firebase Storage e Authentication.
4. Configure login administrativo e regras por UID antes de inserir dados reais. `firestore.rules` e `storage.rules` negam acesso por padrão.

Os dados dos participantes, telefones, comprovantes e localizações devem ficar em armazenamento protegido. Não inclua informações pessoais no código ou em commits públicos. A configuração Web não substitui regras de autenticação e acesso.
