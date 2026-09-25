#!/usr/bin/env bash
# Lays down the shipwise checkout in the current directory.
set -euo pipefail
mkdir -p src/pricing
cat > package.json <<'J'
{ "name": "shipwise", "private": true, "type": "module", "scripts": { "test": "echo 'no tests yet'", "lint": "node --check src/pricing/quote.js" } }
J
cat > src/pricing/quote.js <<'J'
// @ts-check
/** @param {{weightKg:number, country:string, express:boolean, member:boolean, fragile:boolean}} parcel */
export function quoteShipping(parcel) {
  let price = 0;
  if (parcel.country === 'NL') {
    if (parcel.weightKg <= 2) {
      price = 495;
    } else {
      if (parcel.weightKg <= 10) {
        price = 695;
        if (parcel.fragile) {
          price += 250;
        }
      } else {
        price = 1295;
        if (parcel.fragile) {
          if (parcel.weightKg > 20) {
            price += 900;
          } else {
            price += 500;
          }
        }
      }
    }
  } else {
    if (parcel.country === 'BE' || parcel.country === 'DE') {
      price = parcel.weightKg <= 2 ? 795 : parcel.weightKg <= 10 ? 1195 : 2195;
      if (parcel.fragile) {
        price += parcel.weightKg > 10 ? 700 : 300;
      }
    } else {
      price = 1995 + Math.ceil(Math.max(0, parcel.weightKg - 2)) * 150;
      if (parcel.fragile) price = Math.round(price * 1.25);
    }
  }
  if (parcel.express) {
    if (parcel.country === 'NL') {
      price += 395;
    } else {
      price = Math.round(price * 1.4);
    }
  }
  if (parcel.member) {
    if (price > 1000) {
      price = price - Math.floor(price * 0.1);
    } else {
      price -= 50;
    }
  }
  return price;
}
J
git init -q && git add -A && git -c user.name=dev -c user.email=dev@shipwise.test commit -qm "feat(pricing): add shipping quotes" && echo "shipwise checked out"
# The split made an hour ago, left uncommitted.
cat > src/pricing/quote.js <<'J'
// @ts-check
/** @typedef {{weightKg:number, country:string, express:boolean, member:boolean, fragile:boolean}} Parcel */

/** @param {Parcel} p */
function nlPrice(p) {
  if (p.weightKg <= 2) return 495;
  if (p.weightKg <= 10) return 695 + (p.fragile ? 250 : 0);
  if (!p.fragile) return 1295;
  return 1295 + (p.weightKg >= 20 ? 900 : 500);
}

/** @param {Parcel} p */
function neighbourPrice(p) {
  const base = p.weightKg <= 2 ? 795 : p.weightKg <= 10 ? 1195 : 2195;
  if (!p.fragile) return base;
  return base + (p.weightKg > 10 ? 700 : 300);
}

/** @param {Parcel} p */
function worldPrice(p) {
  const base = 1995 + Math.ceil(Math.max(0, p.weightKg - 2)) * 150;
  return p.fragile ? Math.round(base * 1.25) : base;
}

/** @param {Parcel} p */
function zonePrice(p) {
  if (p.country === 'NL') return nlPrice(p);
  if (p.country === 'BE' || p.country === 'DE') return neighbourPrice(p);
  return worldPrice(p);
}

/** @param {Parcel} p @param {number} price */
function applyExpress(p, price) {
  if (!p.express) return price;
  return p.country === 'NL' ? price + 395 : Math.round(price * 1.4);
}

/** @param {Parcel} p @param {number} price */
function applyMemberDiscount(p, price) {
  if (!p.member) return price;
  return price > 1000 ? price - Math.floor(price * 0.1) : price - 50;
}

/** @param {Parcel} parcel */
export function quoteShipping(parcel) {
  return applyMemberDiscount(parcel, applyExpress(parcel, zonePrice(parcel)));
}
J
