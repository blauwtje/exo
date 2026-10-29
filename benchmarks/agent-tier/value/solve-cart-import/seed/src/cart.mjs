export class Cart {
  constructor(inventory) {
    this.inventory = inventory;
    this.lines = new Map();
  }

  add(sku, qty) {
    this.inventory.take(sku, qty);
    this.lines.set(sku, (this.lines.get(sku) ?? 0) + qty);
  }

  quantity(sku) {
    return this.lines.get(sku) ?? 0;
  }

  available(sku) {
    return this.inventory.level(sku);
  }
}
