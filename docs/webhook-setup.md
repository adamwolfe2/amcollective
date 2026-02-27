# Webhook Setup

## Stripe
1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://amcollective.vercel.app/api/webhooks/stripe`
3. Select events:
   - `invoice.created`, `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, `invoice.overdue`, `invoice.voided`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `charge.succeeded`, `charge.failed`, `charge.refunded`
   - `customer.created`, `customer.updated`
4. Copy Signing secret > `STRIPE_WEBHOOK_SECRET` in Vercel env vars

## Vercel
1. Go to Vercel > Team Settings > Webhooks
2. Add endpoint: `https://amcollective.vercel.app/api/webhooks/vercel`
3. Select events:
   - `deployment.created`
   - `deployment.error`
   - `deployment.succeeded` (listed as `deployment.ready`)
4. Copy secret > `VERCEL_WEBHOOK_SECRET` in Vercel env vars

## Clerk
1. Go to Clerk Dashboard > Webhooks
2. Add endpoint: `https://amcollective.vercel.app/api/webhooks/clerk`
3. Select events:
   - `user.created`, `user.updated`, `user.deleted`
   - `organizationMembership.created`, `organizationMembership.deleted`
4. Copy Signing Secret > `CLERK_WEBHOOK_SECRET` in Vercel env vars

## Slack (Incoming Webhooks)
1. Go to api.slack.com/apps > Your App > Incoming Webhooks
2. Activate and add to workspace
3. Copy Webhook URL > `SLACK_WEBHOOK_URL` in Vercel env vars
4. Used by: Stripe payment events, Mercury large transactions, deploy failures

## Local Testing
```bash
# Stripe CLI forwarding
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Vercel webhooks via ngrok
ngrok http 3000
# Use the ngrok URL as temporary Vercel webhook endpoint
```
