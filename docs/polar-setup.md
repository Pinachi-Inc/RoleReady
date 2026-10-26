# Polar setup

Roleberry bills through [Polar](https://polar.sh), the merchant of record. Polar sells the subscription, collects tax and pays us out. It replaced Lemon Squeezy, which declined the store on 2026-10-26.

Do this first in the sandbox (`sandbox.polar.sh`), then repeat it in production (`polar.sh`). They are separate accounts with separate tokens, products and webhooks.

## 1. Products

Create two products in the organization:

| Product | Price | Billing |
| --- | --- | --- |
| Pro | $12 USD | monthly recurring, no trial |
| Max | $49 USD | monthly recurring, no trial |

Copy each product's id. They go in `POLAR_PRODUCT_ID_PRO` and `POLAR_PRODUCT_ID_MAX`.

## 2. Access token

Settings > Developers > New token. Give it these scopes: checkouts, subscriptions, customers, customer sessions, products, webhooks. Put it in `POLAR_ACCESS_TOKEN`.

## 3. Webhook

Settings > Webhooks > Add endpoint.

- URL: `https://<your domain>/api/polar-webhook`.
- Format: raw JSON.
- Events: `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.uncanceled`, `subscription.revoked`, `order.paid`, `order.refunded`.
- Copy the secret into `POLAR_WEBHOOK_SECRET`. Use it exactly as Polar shows it.

The webhook is the only thing that changes a user's plan. The server uses each event only to find the subscription and then re-reads it from Polar's API.

## 4. Env vars

| Variable | Meaning |
| --- | --- |
| `POLAR_ACCESS_TOKEN` | organization access token |
| `POLAR_SERVER` | `sandbox` or `production` (default `production`) |
| `POLAR_PRODUCT_ID_PRO` | product id of Pro |
| `POLAR_PRODUCT_ID_MAX` | product id of Max |
| `POLAR_WEBHOOK_SECRET` | secret of the webhook above |
| `APP_URL` | optional, e.g. `https://roleberry.app`. Where checkout and the portal return to. |

## 5. Sandbox vs production

`POLAR_SERVER=sandbox` points the server at `sandbox-api.polar.sh`. A sandbox token, product ids and webhook secret only work with the sandbox server, and production ones only with production. Test cards in the sandbox: `4242 4242 4242 4242`, any future expiry, any CVC.

Never mix them: a sandbox subscription id stored on a user will 404 against the production API. Before going live, set all five variables to the production values together.

Polar's reviewers usually ask for a 100% discount code so they can complete a checkout without a card. Create one in the production organization for that.
