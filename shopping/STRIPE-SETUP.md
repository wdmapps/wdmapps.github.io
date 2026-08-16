# WDM Shopping — Stripe + Firebase

## Estado atual

- Produto Stripe de teste: **WDM Shopping – Plano Mensal**
- Valor: **R$ 29,90/mês**
- Price ID de teste: `price_1U56uLHYVjU33JYujLtK89Jd`
- Checkout: Stripe-hosted Checkout
- Backend: Firebase Cloud Functions 2nd gen
- Projeto Firebase: `wdm-shopping-d0fab`
- Webhook Stripe de teste criado para:
  `https://us-central1-wdm-shopping-d0fab.cloudfunctions.net/stripeWebhook`

## Segurança

Nunca colocar `sk_test_...`, `sk_live_...` ou `whsec_...` em arquivos do site, GitHub ou JavaScript do navegador.

Os segredos ficam no Google Secret Manager por meio do Firebase Functions.

## Primeira publicação

Na raiz do repositório, com Node.js instalado:

```bash
npm install -g firebase-tools
firebase login
firebase use wdm-shopping-d0fab
```

Cadastrar a chave secreta da Stripe em modo de teste:

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
```

Quando solicitado, colar a **Secret key de teste** (`sk_test_...`) obtida no Dashboard Stripe em Developers / API keys.

Cadastrar também o segredo do webhook:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

Quando solicitado, colar o **Signing secret** (`whsec_...`) do endpoint de webhook WDM Shopping criado na Stripe.

Depois:

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

As Functions esperadas são:

- `createStripeCheckoutSession`
- `createStripePortalSession`
- `stripeWebhook`

## Depois do deploy

1. Testar login no WDM Shopping.
2. Abrir `#painel` sem assinatura.
3. Clicar em **Assinar R$ 29,90/mês**.
4. Realizar uma compra de teste no Checkout da Stripe.
5. Confirmar que `subscriptions/{uid}` foi criado pelo webhook com `provider: stripe` e `entitled: true`.
6. Só depois publicar as regras definitivas de `shopping/firestore.rules` e `shopping/storage.rules` que exigem assinatura ativa.

## Produção

Quando os testes estiverem aprovados:

1. Criar/copiar o produto e preço no modo **live** da Stripe.
2. Trocar `STRIPE_PRICE_ID` em `functions/index.js` e a referência visual em `shopping/subscription-gate.js` pelo `price_...` live.
3. Criar um webhook live para a mesma Function.
4. Atualizar `STRIPE_SECRET_KEY` para `sk_live_...`.
5. Atualizar `STRIPE_WEBHOOK_SECRET` para o signing secret do webhook live.
6. Reimplantar as Functions.

## Comportamento da assinatura

- `active` / `trialing` → loja liberada.
- `past_due` → período de tolerância, loja continua ativa enquanto a Stripe tenta recuperar a cobrança.
- `unpaid`, `paused`, `canceled`, `incomplete_expired` → loja bloqueada.
- Quando o bloqueio for causado pela cobrança, o backend define `published=false` e marca `billingSuspended=true`.
- Se a assinatura voltar a ficar ativa e a loja tiver sido suspensa pela cobrança, a publicação é restaurada automaticamente.
