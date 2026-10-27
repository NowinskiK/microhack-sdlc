import { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartProduct, CartProvider, useCart } from './CartContext';

const feeder: CartProduct = {
  productId: 1,
  name: 'Feeder',
  imgName: 'feeder.png',
  unitPrice: 12.5,
  unit: 'each',
};
const litter: CartProduct = {
  productId: 2,
  name: 'Litter Box',
  imgName: 'litter.png',
  unitPrice: 3.1,
  unit: 'box',
};

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;
const renderCart = () => renderHook(() => useCart(), { wrapper });

describe('CartContext', () => {
  it('starts empty', () => {
    const { result } = renderCart();
    expect(result.current.items).toEqual([]);
    expect(result.current.itemCount).toBe(0);
    expect(result.current.subtotal).toBe(0);
  });

  it('adds new products and merges quantities for an existing product', () => {
    const { result } = renderCart();

    act(() => result.current.addItem(feeder, 2));
    act(() => result.current.addItem(litter, 1));
    act(() => result.current.addItem(feeder, 3));

    expect(result.current.items).toEqual([
      { ...feeder, quantity: 5 },
      { ...litter, quantity: 1 },
    ]);
    expect(result.current.itemCount).toBe(6);
    expect(result.current.subtotal).toBeCloseTo(5 * 12.5 + 3.1);
  });

  it('keeps the first-added product details when the same product is added again', () => {
    const { result } = renderCart();

    act(() => result.current.addItem(feeder, 1));
    act(() => result.current.addItem({ ...feeder, unitPrice: 99 }, 1));

    expect(result.current.items).toEqual([{ ...feeder, quantity: 2 }]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'ignores adding an invalid quantity (%s)',
    (quantity) => {
      const { result } = renderCart();
      act(() => result.current.addItem(feeder, quantity));
      expect(result.current.items).toEqual([]);
    },
  );

  it('updates the quantity of only the targeted product', () => {
    const { result } = renderCart();
    act(() => result.current.addItem(feeder, 1));
    act(() => result.current.addItem(litter, 1));

    act(() => result.current.updateQuantity(feeder.productId, 4));

    expect(result.current.items.map((item) => item.quantity)).toEqual([4, 1]);
    expect(result.current.subtotal).toBeCloseTo(4 * 12.5 + 3.1);
  });

  it.each([0, -3, 2.5, Number.NaN])('ignores updating to an invalid quantity (%s)', (quantity) => {
    const { result } = renderCart();
    act(() => result.current.addItem(feeder, 2));

    act(() => result.current.updateQuantity(feeder.productId, quantity));

    expect(result.current.items).toEqual([{ ...feeder, quantity: 2 }]);
  });

  it('does not add a product when updating an unknown product id', () => {
    const { result } = renderCart();
    act(() => result.current.addItem(feeder, 2));

    act(() => result.current.updateQuantity(999, 3));

    expect(result.current.items).toEqual([{ ...feeder, quantity: 2 }]);
  });

  it('removes a product and recalculates totals', () => {
    const { result } = renderCart();
    act(() => result.current.addItem(feeder, 2));
    act(() => result.current.addItem(litter, 1));

    act(() => result.current.removeItem(feeder.productId));

    expect(result.current.items).toEqual([{ ...litter, quantity: 1 }]);
    expect(result.current.itemCount).toBe(1);
    expect(result.current.subtotal).toBeCloseTo(3.1);
  });

  it('treats removing an unknown product as a no-op', () => {
    const { result } = renderCart();
    act(() => result.current.addItem(feeder, 1));

    act(() => result.current.removeItem(999));

    expect(result.current.items).toHaveLength(1);
  });

  it('throws a helpful error when used outside a CartProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const suppressJsdomReport = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', suppressJsdomReport);
    try {
      expect(() => renderHook(() => useCart())).toThrow(
        'useCart must be used within a CartProvider',
      );
    } finally {
      window.removeEventListener('error', suppressJsdomReport);
    }
  });
});
