---
name: "Metron"
stack: ["Python", "FastAPI", "PostgreSQL", "React Native"]
repo: "https://github.com/samnart1/metron"   # TODO: confirm/private
order: 5
featured: true
draft: false
---

Household finance OS built on a double-entry ledger: every transfer, refund
and split payment is one mechanism. FastAPI + PostgreSQL backend with a
draft/confirm write path, plus an Expo React Native client where money is a
render-only type so totals never drift across a shared household.
